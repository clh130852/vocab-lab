/* reading.js — 文章阅读：用生词库或人教版/考纲单词生成文章 + 阅读理解题
 *   - 本地生成：完全离线，用内置模板 + 选中的词表拼出文章并自动出题
 *   - AI 生成：在设置里填好接口后，调用大模型生成更自然的文章与题目
 */
(function () {
  'use strict';
  var VL = (window.VL = window.VL || {});
  var U = VL.util;
  var el = U.el;

  var host = null;
  var current = null;      // 当前文章
  var answers = {};        // 题号 → 用户作答
  var submitted = false;
  var generating = false;

  var cfg = {
    sourceId: 'book',
    topic: 'auto',
    level: 2,
    questionCount: 6,
    onlyWords: '',
    engine: 'auto'         // auto | local | ai
  };

  function parseWordList(text) {
    return String(text || '')
      .split(/[\s,，;；、\n\r\t]+/)
      .map(function (x) { return x.trim(); })
      .filter(function (x) { return /^[A-Za-z][A-Za-z'’.\- ]*$/.test(x); });
  }

  /* ---------- 本地生成 ---------- */

  function matchSlot(entry, slot) {
    if (!slot) return true;
    if (slot.allow && slot.allow.length) {
      return slot.allow.indexOf(entry.key) >= 0 || slot.allow.indexOf(entry.term) >= 0;
    }
    if (slot.pos && slot.pos.length && slot.pos.indexOf(entry.pos) < 0) return false;
    if (slot.tags && slot.tags.length && !entry.tags.some(function (t) { return slot.tags.indexOf(t) >= 0; })) return false;
    if (slot.deny && slot.deny.indexOf(entry.key) >= 0) return false;
    return true;
  }

  function entryOf(word) {
    if (word.key && word.tags) return word;
    var d = VL.dict.get(word.term || word);
    return d || { term: String(word.term || word), key: U.normTerm(word.term || word), pos: '', cn: '', ex: '', exCn: '', tags: [] };
  }

  function candidatePool(opt) {
    var sourceId = opt.sourceId;
    var pool = [];
    if (sourceId && VL.store.getBook(sourceId)) {
      // 直接选了某个生词库（例如导入的「人教版七年级上」「高考 3500」）
      pool = VL.store.bookWords(sourceId).filter(function (w) { return w.status !== 'archived'; }).map(function (w) { return entryOf(w); });
    } else if (sourceId === 'allbooks') {
      pool = VL.store.allWords().map(function (w) { return entryOf(w); });
    } else if (sourceId === 'book' || !sourceId) {
      pool = VL.store.bookWords(VL.store.activeBookId())
        .filter(function (w) { return w.status !== 'archived'; })
        .map(function (w) { return entryOf(w); });
    } else if (sourceId === 'mix') {
      pool = VL.store.bookWords(VL.store.activeBookId()).map(function (w) { return entryOf(w); })
        .concat(VL.wordlists.pool(opt.gradeId || 'all'));
    } else {
      pool = VL.wordlists.pool(sourceId);
    }
    var seen = Object.create(null);
    return pool.filter(function (e) {
      if (!e || !e.key) return false;
      if (seen[e.key]) return false;
      seen[e.key] = 1;
      return true;
    });
  }

  // 优先选“生词”（不在当前生词库里的词），这样文章才是有新内容的阅读材料
  function preferNew(pool) {
    var inBook = Object.create(null);
    VL.store.bookWords(VL.store.activeBookId()).forEach(function (w) { inBook[w.key] = 1; });
    var fresh = pool.filter(function (e) { return !inBook[e.key]; });
    return { fresh: fresh, known: pool.filter(function (e) { return inBook[e.key]; }) };
  }

  function fillSlots(template, opt) {
    var pool = candidatePool(opt);
    var split = preferNew(pool);
    var specified = (opt.onlyWords || []).map(function (t) { return entryOf(t); }).filter(function (e) { return e && e.key; });
    var primary = specified.length ? specified : (split.fresh.length >= 4 ? split.fresh : pool);
    var used = Object.create(null);
    var values = {};
    var warnings = [];

    Object.keys(template.slots || {}).forEach(function (name) {
      var slot = template.slots[name];
      var cand = primary.filter(function (e) { return matchSlot(e, slot) && !used[e.key]; });
      if (!cand.length) {
        cand = VL.dict.all().filter(function (e) { return matchSlot(e, slot) && !used[e.key]; });
        if (cand.length) warnings.push(name);
      }
      if (!cand.length) {
        cand = VL.dict.all().filter(function (e) { return !used[e.key] && e.cn && (!slot.pos || e.pos.indexOf(slot.pos[0]) === 0); });
      }
      var picked = U.pickRandom(cand);
      if (picked) { used[picked.key] = 1; values[name] = picked; }
      else values[name] = { term: 'life', key: 'life', pos: 'n.', cn: '生活', tags: [] };
    });

    // 干扰项候选：同类词，用于生成选择题
    values.__pool = primary.concat(VL.dict.all()).filter(function (e) { return e && e.cn; });
    values.__used = used;

    values.__distUsed = {};

    function distractor(name) {
      var slot = (template.slots || {})[name];
      var cur = values[name];
      var usedD = values.__distUsed[name] || (values.__distUsed[name] = {});
      var cand = (values.__pool || []).filter(function (e) {
        return e.key !== (cur && cur.key) && !used[e.key] && !usedD[e.key] && matchSlot(e, slot);
      });
      if (!cand.length) cand = (values.__pool || []).filter(function (e) { return e.key !== (cur && cur.key) && !usedD[e.key]; });
      if (!cand.length) cand = (values.__pool || []).filter(function (e) { return e.key !== (cur && cur.key); });
      var picked = U.pickRandom(cand);
      if (picked) usedD[picked.key] = 1;
      return picked || { term: 'something', cn: '', pos: '' };
    }

    function subst(text, depth) {
      return String(text).replace(/\{([^}]+)\}/g, function (m, expr) {
        var artPrefix = '';
        var parts = expr.split(':');
        var isArt = false;
        if (parts[0] === 'art') { isArt = true; parts.shift(); }
        var isDistract = false;
        if (parts[0] === 'distractor') { isDistract = true; parts.shift(); }
        var name = parts[0];
        if (name === undefined) return m;
        var e = isDistract ? distractor(name) : values[name];
        if (!e) return m;
        var word = e.term;
        var out = '';
        if (isArt) out += VL.templates.articleFor(word);
        out += word;
        if (depth > 3) return out;
        return out;
      });
    }

    function resolve(text) {
      var prev = null, out = String(text);
      var guard = 0;
      while (out !== prev && guard < 6) { prev = out; out = subst(out); guard += 1; }
      return out;
    }

    function resetDistractors() { values.__distUsed = {}; }

    return { values: values, resolve: resolve, warnings: warnings, resetDistractors: resetDistractors };
  }

  function localGenerate(opt) {
    var pool = VL.templates.filter(function (t) {
      if (opt.topic && opt.topic !== 'auto') return t.id === opt.topic;
      return t.level <= (opt.level || 2);
    });
    if (!pool.length) pool = VL.templates.slice();
    var template;
    var specifiedEntries = (opt.onlyWords || []).map(function (t) { return entryOf(t); }).filter(function (e) { return e && e.key; });
    if (specifiedEntries.length) {
      // 有指定的词：挑一个「能被这些词填得最多」的模板，保证指定词尽量都用上
      var best = null, bestScore = -1;
      pool.forEach(function (t) {
        var score = 0;
        Object.keys(t.slots || {}).forEach(function (name) {
          if (specifiedEntries.some(function (e) { return matchSlot(e, t.slots[name]); })) score += 1;
        });
        if (score > bestScore) { bestScore = score; best = t; }
      });
      template = best || pool[0];
    } else {
      template = pool[Math.floor(Math.random() * pool.length)];
    }
    var filled = fillSlots(template, opt);
    var resolve = filled.resolve;

    var paragraphs = template.body.map(resolve);
    var text = paragraphs.join(' ');

    var targetWords = [];
    Object.keys(template.slots || {}).forEach(function (name) {
      var e = filled.values[name];
      if (!e) return;
      if (targetWords.some(function (t) { return t.term === e.term; })) return;
      targetWords.push({
        term: e.term, meaning: e.cn || '', pos: e.pos || '',
        example: e.ex || '', exampleCn: e.exCn || '', tags: e.tags || []
      });
    });

    // 题目：模板自带 + 自动生成的词义题 + 选词填空题
    var questions = (template.questions || []).map(function (q) {
      filled.resetDistractors();
      var options = (q.options || []).map(resolve);
      var answerText = options[q.answer];
      return {
        type: q.type || 'choice',
        stem: resolve(q.stem),
        options: options,
        answer: q.answer,
        answerText: answerText,
        explain: resolve(q.explain || '')
      };
    });

    // 词义猜测（考纲/教材常见题型）
    var guessPool = U.shuffle(targetWords.slice()).slice(0, 2);
    guessPool.forEach(function (tw) {
      if (!tw.meaning) return;
      var others = VL.dict.all().filter(function (e) { return e.cn && e.cn !== tw.meaning; });
      var opts = U.shuffle(U.uniqBy(U.shuffle(others), function (e) { return e.cn; }).slice(0, 3).map(function (e) { return e.cn; }).concat([tw.meaning]));
      questions.push({
        type: 'choice',
        stem: 'In the passage, the word "' + tw.term + '" is closest in meaning to ____.',
        options: opts,
        answer: opts.indexOf(tw.meaning),
        answerText: tw.meaning,
        explain: '"' + tw.term + '" ' + tw.pos + ' 意思是「' + tw.meaning + '」。',
        vocab: tw.term
      });
    });

    // 选词填空（从文章里挖空）
    var clozeWords = U.shuffle(targetWords.slice()).slice(0, 3);
    clozeWords.forEach(function (tw) {
      var sent = null;
      paragraphs.forEach(function (p) {
        p.split(/(?<=[.!?])\s+/).forEach(function (s) { if (!sent && s.indexOf(tw.term) >= 0) sent = s; });
      });
      if (!sent) return;
      var blanked = sent.replace(new RegExp('\\b' + tw.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i'), '______');
      var samePos = VL.dict.all().filter(function (e) { return e.pos === tw.pos && e.cn && e.key !== U.normTerm(tw.term); });
      var ds = U.uniqBy(U.shuffle(samePos), function (e) { return e.term; }).slice(0, 3).map(function (e) { return e.term; });
      var fillers = ['answer', 'problem', 'idea', 'thing', 'way', 'place'];
      for (var fi = 0; fi < fillers.length && ds.length < 3; fi++) {
        if (fillers[fi] !== tw.term && ds.indexOf(fillers[fi]) < 0) ds.push(fillers[fi]);
      }
      var opts = U.shuffle([tw.term].concat(ds));
      questions.push({
        type: 'choice',
        stem: '选择最合适的词填入空白处：\n' + blanked,
        options: opts,
        answer: opts.indexOf(tw.term),
        answerText: tw.term,
        explain: '这句话讲的是「' + (tw.meaning || tw.term) + '」，所以填 ' + tw.term + '。',
        vocab: tw.term
      });
    });

    var want = opt.questionCount || 6;
    if (questions.length > want) questions = questions.slice(0, want);

    // 兜底：用户指定的词如果没被模板用上，就用它们的例句组成一段「例句阅读」，保证全部出现
    var requested = (opt.onlyWords || []);
    if (requested.length) {
      var usedKeys = {};
      targetWords.forEach(function (w) { usedKeys[U.normTerm(w.term)] = 1; });
      var extras = [];
      requested.forEach(function (t) {
        var k = U.normTerm(t);
        if (usedKeys[k]) return;
        var e = VL.dict.get(t);
        var mine = VL.store.findWord(t);
        var ex = (e && e.ex) || (mine && mine.example) || '';
        var exCn = (e && e.exCn) || (mine && mine.exampleCn) || '';
        var cn = (e && e.cn) || (mine && mine.meaning) || '';
        if (usedKeys[k]) return;
        usedKeys[k] = 1;
        if (ex) {
          paragraphs.push(ex);
          extras.push({ term: t, meaning: cn, pos: (e && e.pos) || (mine && mine.pos) || '', example: ex, exampleCn: exCn, tags: [] });
        } else {
          // 没有例句的词：给一句简单的定义句，保证词也出现在文章里
          paragraphs.push('The word "' + t + '" means ' + (cn || 'something') + '.');
          extras.push({ term: t, meaning: cn, pos: '', example: '', exampleCn: '', tags: [] });
        }
      });
      if (extras.length) {
        targetWords = targetWords.concat(extras);
        text = paragraphs.join(' ');
      }
    }

    return {
      mode: 'local',
      engineLabel: '本地生成（离线）',
      templateId: template.id,
      title: template.title,
      titleCn: template.titleCn,
      topic: template.topic,
      level: template.level,
      paragraphs: paragraphs,
      text: text,
      targetWords: targetWords,
      questions: questions,
      sourceLabel: sourceLabel(opt),
      warnings: filled.warnings,
      requested: requested.slice(),
      usedTerms: targetWords.map(function (w) { return U.normTerm(w.term); }),
      wordCount: countWords(text),
      at: Date.now()
    };
  }

  function countWords(text) { return (String(text).match(/[A-Za-z][A-Za-z'-]*/g) || []).length; }

  function sourceLabel(opt) {
    if (opt.sourceId === 'book') return '我的生词库 · ' + (VL.store.activeBook() || {}).name;
    if (opt.sourceId === 'allbooks') return '全部生词库';
    var b = VL.store.getBook(opt.sourceId);
    if (b) return b.name;
    if (opt.sourceId === 'mix') return '生词库 + ' + VL.wordlists.label(opt.gradeId || 'all');
    return VL.wordlists.label(opt.sourceId);
  }

  /* ---------- AI 生成 ---------- */

  function buildPrompt(opt, words) {
    var gradeLabel = sourceLabel(opt);
    var list = words.slice(0, 24).map(function (w) {
      return '- ' + w.term + (w.pos ? ' (' + w.pos + ')' : '') + ' = ' + (w.meaning || '');
    }).join('\n');
    var levelText = opt.level === 1 ? '初中基础水平（约 100 词，句子简短）' :
      opt.level === 2 ? '初中中上水平（约 130-160 词，可含少量从句）' :
        '高中水平（约 180-220 词，可以有较复杂的句式）';
    return [
      '你是一位中国英语老师，请为中学生写一篇英语阅读短文并配阅读理解题。',
      '要求：',
      '1. 语言难度：' + levelText + '。',
      '2. 必须自然地用上下面这些单词（可以变形，但每个词都要在文章中出现至少一次）：',
      list || '（无指定单词，请自选与主题相关的高频词）',
      '3. 文章主题：' + (opt.topicLabel || '自选一个适合中学生的正能量主题') + '。',
      '4. 出 ' + (opt.questionCount || 6) + ' 道题，题型包含细节理解、词义猜测、推理判断和主旨大意，每题 4 个选项。',
      '5. 只输出 JSON，不要任何解释文字，格式如下：',
      '{"title":"英文标题","titleCn":"中文标题","topic":"中文主题",',
      '"paragraphs":["第一段","第二段"],',
      '"words":[{"term":"word","meaning":"中文释义"}],',
      '"questions":[{"type":"choice","stem":"题干","options":["A","B","C","D"],"answer":0,"explain":"中文解析，说明依据在文中哪一句"}]}',
      '注意：answer 是正确选项的下标（0-3）；explain 必须用中文；words 只列上文给定单词中真正用到的。'
    ].join('\n');
  }

  function callAI(opt, words) {
    var s = VL.store.settings().ai;
    if (!s.apiKey) return Promise.reject(new Error('还没有填写 API Key，请到「设置与备份 → AI 文章生成」里填写。'));
    if (!s.baseUrl) return Promise.reject(new Error('还没有填写接口地址。'));
    var url = s.baseUrl.replace(/\/+$/, '') + '/chat/completions';
    var body = {
      model: s.model || 'gpt-4o-mini',
      temperature: typeof s.temperature === 'number' ? s.temperature : 0.7,
      messages: [
        { role: 'system', content: '你是一位经验丰富的中国中学英语教师，擅长编写分级阅读材料和阅读题。你只输出合法 JSON。' },
        { role: 'user', content: buildPrompt(opt, words) }
      ]
    };
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + s.apiKey },
      body: JSON.stringify(body)
    }).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (t) {
          throw new Error('接口返回 ' + res.status + '：' + String(t).slice(0, 200));
        });
      }
      return res.json();
    }).then(function (json) {
      var content = json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
      if (!content) throw new Error('接口没有返回内容');
      var data = U.extractJSON(content);
      if (!data) throw new Error('模型输出不是有效的 JSON');
      return normalizeAI(data, opt);
    });
  }

  function normalizeAI(data, opt) {
    var paragraphs = (data.paragraphs || []).map(function (p) { return String(p).trim(); }).filter(Boolean);
    if (!paragraphs.length && data.passage) paragraphs = String(data.passage).split(/\n+/).filter(Boolean);
    if (!paragraphs.length) throw new Error('模型没有生成正文');
    var text = paragraphs.join(' ');
    var questions = (data.questions || []).map(function (q) {
      var options = q.options || [];
      var answer = typeof q.answer === 'number' ? q.answer : 0;
      return {
        type: q.type === 'short' ? 'short' : 'choice',
        stem: String(q.stem || ''),
        options: options,
        answer: answer,
        answerText: options[answer] !== undefined ? options[answer] : String(q.answerText || ''),
        explain: String(q.explain || ''),
        keywords: q.keywords || []
      };
    }).filter(function (q) { return q.stem; });

    var words = (data.words || []).map(function (w) {
      var e = VL.dict.get(w.term || w.word) || {};
      return {
        term: w.term || w.word, meaning: w.meaning || e.cn || '', pos: w.pos || e.pos || '',
        example: e.ex || '', exampleCn: e.exCn || '', tags: e.tags || []
      };
    });
    if (!words.length) {
      var seen = Object.create(null);
      VL.dict.all().forEach(function (e) {
        if (seen[e.key]) return;
        if (new RegExp('\\b' + e.key + '(s|es|ed|d|ing)?\\b', 'i').test(text)) {
          seen[e.key] = 1;
          words.push({ term: e.term, meaning: e.cn, pos: e.pos, example: e.ex, exampleCn: e.exCn, tags: e.tags });
        }
      });
    }

    return {
      mode: 'ai',
      engineLabel: 'AI 生成 · ' + (VL.store.settings().ai.model || ''),
      title: data.title || 'Reading Passage',
      titleCn: data.titleCn || '',
      topic: data.topic || '',
      level: opt.level,
      paragraphs: paragraphs,
      text: text,
      targetWords: words.slice(0, 30),
      questions: questions,
      sourceLabel: sourceLabel(opt),
      wordCount: countWords(text),
      at: Date.now()
    };
  }

  /* ---------- 生成入口 ---------- */

  function wordsForAI(opt) {
    if (opt.onlyWords && opt.onlyWords.length) {
      return opt.onlyWords.map(function (t) {
        var e = VL.dict.get(t) || { term: t, cn: '' };
        return { term: e.term || t, meaning: e.cn || '', pos: e.pos || '' };
      }).slice(0, 30);
    }
    var pool = candidatePool(opt);
    var split = preferNew(pool);
    var base = (split.fresh.length >= 8 ? split.fresh : pool);
    return U.shuffle(base.filter(function (e) { return e.cn; })).slice(0, 18);
  }

  function generate(forceEngine) {
    if (generating) return;
    var opt = {
      sourceId: cfg.sourceId,
      gradeId: cfg.sourceId === 'mix' ? cfg.gradeId : cfg.sourceId,
      topic: cfg.topic,
      topicLabel: (VL.templates.filter(function (t) { return t.id === cfg.topic; })[0] || {}).topic,
      level: cfg.level,
      questionCount: cfg.questionCount,
      onlyWords: parseWordList(cfg.onlyWords)
    };
    var engine = forceEngine || cfg.engine;
    generating = true;
    renderGenerating();

    function useLocal(reason) {
      var art = localGenerate(opt);
      if (reason) art.note = reason;
      finish(art);
    }

    if (engine === 'ai' || (engine === 'auto' && VL.store.settings().ai.apiKey)) {
      var words = wordsForAI(opt);
      callAI(opt, words).then(function (art) {
        finish(art);
      }).catch(function (err) {
        if (engine === 'ai') {
          generating = false;
          U.toast('AI 生成失败：' + err.message, 'error', 6000);
          renderConfig();
        } else {
          U.toast('AI 不可用，已用本地生成：' + err.message, 'warn', 5000);
          useLocal('AI 不可用，已自动改用本地生成（离线模板 + 你选的词表）。原因：' + err.message);
        }
      });
    } else {
      setTimeout(function () { useLocal(); }, 60);
    }
  }

  function finish(art) {
    generating = false;
    current = art;
    answers = {};
    submitted = false;
    art.bookScore = null;
    VL.store.addArticle(VL.store.activeBookId(), {
      title: art.title, titleCn: art.titleCn, topic: art.topic, mode: art.mode,
      sourceLabel: art.sourceLabel, wordCount: art.wordCount,
      paragraphs: art.paragraphs, targetWords: art.targetWords, questions: art.questions, at: art.at
    });
    VL.store.logStudy('articles', 1);
    renderArticle();
  }

  /* ---------- 视图 ---------- */

  function renderGenerating() {
    U.mount(host, [
      head(),
      el('div', { class: 'card center', style: { padding: '40px 20px' } }, [
        el('div', { style: { fontSize: '2rem' }, text: '⏳' }),
        el('h3', { class: 'mt', text: cfg.engine === 'ai' ? '正在让 AI 写文章…' : '正在生成本地文章…' }),
        el('p', { class: 'text-muted text-small', text: 'AI 生成通常需要 5-20 秒，请稍候。' })
      ])
    ]);
  }

  function head() {
    return el('div', { class: 'view-head' }, [
      el('div', null, [
        el('h1', { id: 'v-reading', text: '文章阅读' }),
        el('div', { class: 'view-sub', text: '用你选的词表生成文章和阅读理解题；文章里的生词可以一键加入生词库。' })
      ]),
      el('div', { class: 'spacer' }),
      current ? el('button', { class: 'btn', type: 'button', onclick: renderConfig }, '重新生成') : null
    ]);
  }

  function renderConfig() {
    current = null;
    var book = VL.store.activeBook();
    var bookWords = VL.store.bookWords(VL.store.activeBookId()).filter(function (w) { return w.status !== 'archived'; });
    var aiReady = !!VL.store.settings().ai.apiKey;
    var groups = VL.wordlists.grouped().map(function (g) {
      return { kind: g.kind, label: g.label, sources: g.sources.filter(function (s) { return s.kind !== 'textbook' && s.kind !== 'syllabus'; }) };
    }).filter(function (g) { return g.sources.length; });

    // 词表来源 = 直接选一个生词库（含导入的人教版各册、中考、高考等），或当前词库 / 全部词库
    var bookOptions = [el('option', { value: 'book', selected: cfg.sourceId === 'book' },
      '当前词库：' + (VL.store.activeBook() || {}).name + '（' + bookWords.length + ' 词）')]
      .concat(VL.store.books().length > 1 ? [el('optgroup', { label: '指定某个生词库 / 教材 / 考纲词库' }, VL.store.books().map(function (b) {
        return el('option', { value: b.id, selected: cfg.sourceId === b.id }, b.name + '（' + b.words.length + ' 词）');
      }))] : [])
      .concat([el('option', { value: 'allbooks', selected: cfg.sourceId === 'allbooks' }, '全部词库（' + VL.store.allWords().length + ' 词）')]);

    var sourceRow = el('div', { class: 'field mb' }, [
      el('div', { class: 'label', text: '用哪里的单词写这篇文章？' }),
      el('select', {
        class: 'select', onchange: function (e) { cfg.sourceId = e.target.value; renderConfig(); }
      }, bookOptions),
      el('div', { class: 'hint', text: '想用「人教版七年级上」或「中考核心词」这些完整词表，先在「生词库 → 📚 导入词表」里导入，它们就会出现在这个下拉框里。' })
    ]);

    var gradeRow = null;

    var topicRow = el('div', { class: 'field mb' }, [
      el('div', { class: 'label', text: '主题' }),
      el('div', { class: 'seg' }, [
        el('button', { class: 'chip chip-btn' + (cfg.topic === 'auto' ? ' is-on' : ''), type: 'button', onclick: function () { cfg.topic = 'auto'; renderConfig(); } }, '随机主题')
      ].concat(VL.templates.map(function (t) {
        return el('button', {
          class: 'chip chip-btn' + (cfg.topic === t.id ? ' is-on' : ''), type: 'button',
          onclick: function () { cfg.topic = t.id; renderConfig(); }
        }, t.topic);
      })))
    ]);

    var optsRow = el('div', { class: 'field-row mb' }, [
      el('div', { class: 'field' }, [
        el('div', { class: 'label', text: '难度' }),
        el('div', { class: 'seg' }, [
          { v: 1, l: '基础' }, { v: 2, l: '中等' }, { v: 3, l: '挑战' }
        ].map(function (o) {
          return el('button', { class: 'chip chip-btn' + (cfg.level === o.v ? ' is-on' : ''), type: 'button', onclick: function () { cfg.level = o.v; renderConfig(); } }, o.l);
        }))
      ]),
      el('div', { class: 'field' }, [
        el('div', { class: 'label', text: '题目数量' }),
        el('div', { class: 'seg' }, [4, 6, 8].map(function (n) {
          return el('button', { class: 'chip chip-btn' + (cfg.questionCount === n ? ' is-on' : ''), type: 'button', onclick: function () { cfg.questionCount = n; renderConfig(); } }, n + ' 题');
        }))
      ])
    ]);

    var engineRow = el('div', { class: 'row-wrap mt' }, [
      el('div', { class: 'field' }, [
        el('label', { text: '指定要用到的单词（可选）' }),
        el('input', {
          class: 'input', type: 'text', value: cfg.onlyWords,
          placeholder: '例如：apple banana protect ——留空就是自动挑词',
          oninput: function (e) { cfg.onlyWords = e.target.value; }
        }),
        el('div', { class: 'hint', text: '填了就用这几个词写文章（本地生成会尽量全用上，语法约束下放不进去的会跳过；AI 生成会全部用上）。' })
      ]),
    ].concat([
      el('button', { class: 'btn btn-primary btn-lg', type: 'button', onclick: function () { generate('local'); } }, '本地生成（离线可用）'),
      el('button', {
        class: 'btn btn-lg', type: 'button', disabled: !aiReady,
        onclick: function () { generate('ai'); }
      }, aiReady ? 'AI 生成' : 'AI 生成（需先填 API Key）'),
      el('span', { class: 'ai-status' }, [
        el('span', { class: 'ai-dot' + (aiReady ? ' on' : '') }),
        aiReady ? '已连接：' + VL.store.settings().ai.model : '未配置 AI 接口，仍可离线生成'
      ])
    ]));

    var body = [
      el('div', { class: 'card mb' }, [
        el('div', { class: 'card-head' }, [
          el('h3', { text: '生成设置' }),
          el('span', { class: 'card-note', text: '当前生词库：' + (book ? book.name : '') })
        ]),
        sourceRow, gradeRow, topicRow, optsRow,
        el('hr'),
        engineRow,
        el('div', { class: 'callout mt' }, [
          el('strong', { text: '两种生成方式：' }),
          el('span', { text: '本地生成完全离线，用内置模板 + 你选的词表拼出文章并自动出题（细节题、词义猜测、选词填空）；AI 生成会把这些单词发给大模型，写出更自然、更贴近考试的文章和题目。接口地址、模型和 Key 在「设置与备份」里填写，Key 只保存在本机。' })
        ])
      ]),
      renderHistory(book)
    ];

    U.mount(host, [head()].concat(body));
  }

  function renderHistory(book) {
    var list = ((book && book.articles) || []).slice(0, 6);
    if (!list.length) return el('div', { class: 'empty' }, [
      el('h3', { text: '还没有生成过文章' }),
      el('p', { text: '选好词表和主题，点「本地生成」就能立刻得到一篇带阅读题的文章（不需要联网）。' })
    ]);
    return el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [el('h3', { text: '本词库生成过的文章' }), el('span', { class: 'card-note', text: '保存在归档里' })]),
      el('div', { class: 'stack', style: { gap: '8px' } }, list.map(function (a) {
        return el('div', { class: 'row', style: { borderBottom: '1px dashed var(--border)', paddingBottom: '6px' } }, [
          el('div', { class: 'grow' }, [
            el('div', { text: a.title + (a.titleCn ? '（' + a.titleCn + '）' : '') }),
            el('div', { class: 'text-small text-muted', text: U.fmtDateTime(a.at) + ' · ' + (a.mode === 'ai' ? 'AI' : '本地') + ' · ' + (a.wordCount || 0) + ' 词 · ' + ((a.questions || []).length) + ' 题' + (a.score != null ? ' · 得分 ' + a.score + '%' : '') })
          ]),
          el('button', {
            class: 'btn btn-sm', type: 'button',
            onclick: function () {
              current = Object.assign({}, a, { engineLabel: a.mode === 'ai' ? 'AI 生成' : '本地生成（离线）', warnings: [] });
              answers = {}; submitted = false;
              renderArticle();
            }
          }, '打开')
        ]);
      }))
    ]);
  }

  function highlightParagraph(text, art) {
    var inBook = Object.create(null);
    VL.store.bookWords(VL.store.activeBookId()).forEach(function (w) { inBook[w.key] = 1; });
    var p = el('p');
    var re = /[A-Za-z][A-Za-z'’-]*/g;   // 文章里每个英文单词都可以点
    var last = 0, m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) p.appendChild(document.createTextNode(text.slice(last, m.index)));
      (function (matched) {
        var lower = U.normTerm(matched);
        var info = (art.targetWords || []).filter(function (w) { return U.normTerm(w.term) === lower; })[0];
        var isTarget = !!info;
        var cls = 'w' + (isTarget ? ' tw' : '') + (isTarget && inBook[lower] ? ' known' : '');
        var span = el('span', {
          class: cls,
          role: 'button', tabindex: '0',
          title: '点击查看「' + matched + '」的释义',
          onclick: function (e) { e.stopPropagation(); showWordPop(span, matched, info, lower); },
          onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showWordPop(span, matched, info, lower); } }
        }, matched);
        p.appendChild(span);
      })(m[0]);
      last = m.index + m[0].length;
    }
    if (last < text.length) p.appendChild(document.createTextNode(text.slice(last)));
    return p;
  }

  var popNode = null;
  function closePop() { if (popNode && popNode.parentNode) popNode.parentNode.removeChild(popNode); popNode = null; }

  function showWordPop(anchor, form, info, key) {
    closePop();
    var dict = VL.dict.get(key) || {};
    var inBook = VL.store.findWord(key);
    var meaning = (info && info.meaning) || dict.cn || '';
    if (!meaning) meaning = '（词库里没有这个词，可以自己写一个释义）';
    var meaningInput = el('input', { class: 'input', value: meaning, placeholder: '写你自己的释义' });
    var meaningField = el('div', { class: 'field', style: { marginTop: '8px' } }, [
      el('div', { class: 'label', text: inBook ? '这个词的释义' : '释义（可以先改成自己的写法再收录）' }),
      meaningInput
    ]);
    popNode = el('div', { class: 'quick-pop' }, [
      el('h4', { text: form }),
      el('div', { class: 'text-small text-2', text: (dict.pos || (info && info.pos) || '') + ' ' + meaning }),
      dict.ex ? el('div', { class: 'text-small text-muted mt', text: dict.ex }) : null,
      dict.exCn ? el('div', { class: 'text-small text-muted', text: dict.exCn }) : null,
      meaningField,
      el('div', { class: 'qp-row' }, [
        el('button', { class: 'btn btn-sm', type: 'button', onclick: function () { U.speak(form); } }, '🔊 朗读'),
        VL.ailookup.enabled() ? el('button', {
          class: 'btn btn-sm js-ai-word', type: 'button',
          onclick: function (e) {
            e.stopPropagation();
            var b = e.currentTarget;
            b.disabled = true; b.textContent = 'AI 查询中…';
            VL.ailookup.translate([key]).then(function (list) {
              var w = list[0];
              if (!w) { b.disabled = false; b.textContent = '🤖 用 AI 查'; U.toast('AI 没有返回这个词', 'warn'); return; }
              if (w.meaning) { meaningInput.value = w.meaning; }
              b.disabled = false;
              b.textContent = '🤖 再查一次';
              U.toast('AI 查到了：' + (w.pos ? w.pos + ' ' : '') + (w.meaning || ''), 'ok', 4200);
            }).catch(function (err) {
              b.disabled = false; b.textContent = '🤖 用 AI 查';
              U.toast('AI 查词失败：' + err.message, 'error', 5000);
            });
          }
        }, '🤖 用 AI 查') : null,
        el('button', {
          class: 'btn btn-sm btn-primary', type: 'button',
          onclick: function (e) {
            e.stopPropagation();
            var mine = meaningInput.value.trim();
            if (inBook) {
              VL.store.updateWord(inBook.id, { meaning: mine }, VL.store.activeBookId());
              U.toast('已更新「' + key + '」的释义', 'ok');
            } else {
              var r = VL.store.addWord(VL.store.activeBookId(), {
                term: key, meaning: mine, pos: dict.pos || (info && info.pos) || '',
                phonetic: dict.ipa || '', example: dict.ex || '', exampleCn: dict.exCn || '',
                tags: dict.tags || [], source: 'reading'
              });
              U.toast(r && r.created ? '已加入「' + VL.store.activeBook().name + '」' : '这个词已经在生词库里了', 'ok');
            }
            closePop();
            renderArticle();
          }
        }, inBook ? '保存释义' : '加入生词库')
      ])
    ]);
    var rect = anchor.getBoundingClientRect();
    popNode.style.left = Math.min(window.innerWidth - 340, Math.max(8, rect.left)) + 'px';
    popNode.style.top = Math.min(window.innerHeight - 180, rect.bottom + 8) + 'px';
    document.body.appendChild(popNode);
    setTimeout(function () {
      document.addEventListener('click', function onDoc(e) {
        if (popNode && !popNode.contains(e.target)) { closePop(); document.removeEventListener('click', onDoc); }
      });
    }, 10);
  }

  function renderQuestion(q, i) {
    var qno = i + 1;
    var wrap = el('div', { class: 'q-item' });
    wrap.appendChild(el('div', { class: 'q-head' }, [
      el('span', { class: 'q-no', text: String(qno) }),
      el('span', { class: 'q-stem', text: q.stem })
    ]));

    if (q.type === 'short') {
      var input = el('textarea', { class: 'textarea answer-input', placeholder: '用英语或中文写出你的答案…', style: { minHeight: '68px' } });
      input.addEventListener('input', function () { answers[qno] = input.value; });
      wrap.appendChild(input);
      return wrap;
    }

    var opts = el('div', { class: 'q-opts' });
    var keys = ['A', 'B', 'C', 'D', 'E', 'F'];
    (q.options || []).forEach(function (text, j) {
      var input = el('input', { type: 'radio', name: 'q' + qno, value: String(j) });
      input.addEventListener('change', function () {
        answers[qno] = j;
        U.$$('.opt', opts).forEach(function (n) { n.classList.remove('wrong'); });
      });
      var lab = el('label', { class: 'opt' }, [input, el('span', { class: 'opt-key', text: keys[j] }), el('span', { text: text })]);
      opts.appendChild(lab);
    });
    wrap.appendChild(opts);
    return wrap;
  }

  function renderFeedback(q, i, ok) {
    var qno = i + 1;
    var node = el('div', { class: 'q-explain' }, [
      el('span', { class: 'tag', text: ok ? '✓ 正确' : '✗ 正确答案：' + (q.answerText || ((q.options || [])[q.answer] || '')) }),
      q.explain ? el('div', { class: 'mt', text: q.explain }) : null
    ]);
    return node;
  }

  function renderArticle() {
    var art = current;
    var book = VL.store.getBook(VL.store.activeBookId());
    var total = art.questions.length;
    var paras = art.paragraphs.map(function (p) { return highlightParagraph(p, art); });

    var qNodes = art.questions.map(function (q, i) { return renderQuestion(q, i); });

    var feedbackHost = el('div');
    var scoreHost = el('div');

    var submitBtn = el('button', {
      class: 'btn btn-primary btn-lg', type: 'button',
      onclick: function () {
        submitted = true;
        var right = 0;
        var results = [];
        art.questions.forEach(function (q, i) {
          var qno = i + 1, user = answers[qno];
          var ok;
          if (q.type === 'short') {
            var kw = q.keywords || [];
            ok = kw.length ? kw.some(function (k) { return String(user || '').toLowerCase().indexOf(String(k).toLowerCase()) >= 0; }) : String(user || '').trim().length > 8;
          } else {
            ok = user === q.answer;
          }
          results[i] = ok;
          if (ok) right += 1;
          else if (q.vocab) {
            var w = VL.store.findWord(q.vocab);
            if (w) VL.srs.applyTestResult(w, false, { source: 'reading' });
          }
        });
        VL.store.save();
        var rate = total ? Math.round((right / total) * 100) : 0;
        art.score = rate;
        // 把成绩写进归档
        var rec = (book.articles || []).filter(function (a) { return a.at === art.at; })[0];
        if (rec) { rec.score = rate; VL.store.save(); }
        U.mount(scoreHost, [
          el('div', { class: 'card mb' }, [
            el('div', { class: 'row-wrap' }, [
              el('div', { class: 'grow' }, [
                el('div', { class: 'score-big', text: rate + '%' }),
                el('div', { class: 'text-muted', text: '答对 ' + right + ' / ' + total + ' 题' + (art.questions.some(function (q) { return q.type === 'short'; }) ? '（简答题按关键词给分）' : '') })
              ]),
              el('div', { class: 'text-small text-2', style: { maxWidth: '320px' }, text: rate >= 80 ? '阅读理解很扎实！试试把文章里没收录的生词加入生词库。' : '建议再读一遍原文，注意题干与原文的同义替换。' })
            ])
          ])
        ]);
        U.mount(feedbackHost, art.questions.map(function (q, i) { return renderFeedback(q, i, results[i]); }));
        var qWrap = document.getElementById('readingQuestions');
        if (qWrap) {
          var items = U.$$('.q-item', qWrap);
          items.forEach(function (n, i) {
            var q = art.questions[i];
            if (!q) return;
            var user = answers[i + 1];
            U.$$('.opt', n).forEach(function (o, j) {
              if (j === q.answer) o.classList.add('correct');
              if (user === j && j !== q.answer) o.classList.add('wrong');
            });
          });
        }
        submitBtn.disabled = true;
        U.toast('已生成成绩，答错的生词已重新排入复习计划', 'ok');
      }
    }, '提交答案并评分');

    var newWords = (art.targetWords || []).filter(function (w) { return !VL.store.findWord(w.term); });

    U.mount(host, [
      head(),
      (function () {
        var req = art.requested || [];
        if (!req.length) return null;
        var used = req.filter(function (t) { return (art.usedTerms || []).indexOf(U.normTerm(t)) >= 0; });
        var skipped = req.filter(function (t) { return used.indexOf(t) < 0; });
        return el('div', { class: 'callout ' + (skipped.length ? 'warn' : ''), style: { marginBottom: '12px' } }, [
          el('strong', { text: '你指定的 ' + req.length + ' 个词：用上 ' + used.length + ' 个' }),
          el('div', { class: 'text-small mt', text: '✅ 用上：' + (used.join('、') || '（无）') }),
          skipped.length ? el('div', { class: 'text-small', text: '⚠️ 没放进去：' + skipped.join('、') + '（本地模板只有 4-7 个空位，且要符合语法；想全部用上请点「换一篇」多生成几次，或配好 AI 接口用「AI 生成」）' }) : null
        ]);
      })(),
      el('div', { class: 'reader' }, [
        scoreHost,
        el('div', { class: 'article' }, [
          el('h2', { text: art.title }),
          art.titleCn ? el('div', { class: 'text-muted', text: art.titleCn }) : null,
          el('div', { class: 'article-meta' }, [
            el('span', { class: 'chip', text: art.engineLabel || (art.mode === 'ai' ? 'AI 生成' : '本地生成') }),
            art.topic ? el('span', { class: 'chip chip-blue', text: art.topic }) : null,
            el('span', { class: 'chip', text: (art.wordCount || 0) + ' 词' }),
            el('span', { class: 'chip', text: '生词 ' + (art.targetWords || []).length + ' 个' }),
            el('span', { class: 'chip', text: art.sourceLabel || '' })
          ]),
          paras,
          art.note ? el('div', { class: 'callout warn text-small' , text: art.note }) : null
        ]),
        el('div', { class: 'card' }, [
          el('div', { class: 'card-head' }, [
            el('h3', { text: '生词表（文章中用到的词）' }),
            el('span', { class: 'card-note', text: '点任意生词可以加入生词库' }),
            el('div', { class: 'spacer' }),
            newWords.length ? el('button', {
              class: 'btn btn-sm btn-primary', type: 'button',
              onclick: function () {
                var r = VL.store.addWords(VL.store.activeBookId(), newWords.map(function (w) {
                  var d = VL.dict.get(w.term) || {};
                  return { term: w.term, meaning: w.meaning || d.cn, pos: w.pos || d.pos, phonetic: d.ipa || '', example: d.ex || w.example || '', exampleCn: d.exCn || w.exampleCn || '', tags: d.tags || w.tags || [], source: 'reading' };
                }));
                U.toast('已加入 ' + r.added + ' 个新词到「' + VL.store.activeBook().name + '」', 'ok');
                renderArticle();
              }
            }, '把 ' + newWords.length + ' 个新词全部加入') : el('span', { class: 'chip chip-green', text: '全部已收录' })
          ]),
          el('div', { class: 'glossary' }, (art.targetWords || []).map(function (w) {
            var inBook = VL.store.findWord(w.term);
            return el('div', { class: 'gloss' }, [
              el('b', null, [w.term, inBook ? el('span', { class: 'chip chip-green', style: { marginLeft: '6px' }, text: '已收录' }) : null]),
              el('small', { text: (w.pos ? w.pos + ' ' : '') + (w.meaning || '') })
            ]);
          }))
        ]),
        el('div', { class: 'card' }, [
          el('div', { class: 'card-head' }, [
            el('h3', { text: '阅读理解（' + total + ' 题）' }),
            el('span', { class: 'card-note', text: '先读文章再作答，提交后自动评分' })
          ]),
          el('div', { id: 'readingQuestions' }, qNodes),
          feedbackHost,
          el('div', { class: 'row-wrap mt' }, [
            submitBtn,
            el('button', { class: 'btn', type: 'button', onclick: function () { answers = {}; submitted = false; renderArticle(); } }, '重做'),
            el('button', { class: 'btn btn-ghost', type: 'button', onclick: function () { generate(cfg.engine === 'ai' && VL.store.settings().ai.apiKey ? 'ai' : 'local'); } }, '换一篇'),
            el('button', { class: 'btn btn-ghost', type: 'button', onclick: function () { window.print(); } }, '打印这篇文章')
          ])
        ])
      ])
    ]);
  }

  VL.reading = {
    render: function (container) {
      host = container;
      if (current) renderArticle(); else renderConfig();
    },
    leave: function () { closePop(); },
    openSaved: function (art) {
      if (!art) return;
      current = art;
      answers = {};
      submitted = false;
      if (host) renderArticle();
    },
    // 从「生词库」勾选一批词后直接带过来生成文章
    setOnlyWords: function (terms) {
      cfg.onlyWords = (terms || []).join(' ');
      current = null;
      answers = {};
      submitted = false;
    },
    localGenerate: localGenerate,
    callAI: callAI,
    normalizeAI: normalizeAI,
    countWords: countWords,
    buildPrompt: buildPrompt
  };
})();
