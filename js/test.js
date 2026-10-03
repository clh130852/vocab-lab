/* test.js — 生词检测：词义匹配 / 中英选择 / 拼写填空 / 听音选词，结果写回艾宾浩斯计划 */
(function () {
  'use strict';
  var VL = (window.VL = window.VL || {});
  var U = VL.util;
  var el = U.el;

  var TYPES = [
    { id: 'choice', label: '中英选择', desc: '看英文选中文，或看中文选英文' },
    { id: 'spell', label: '拼写填空', desc: '根据中文释义把单词拼出来' },
    { id: 'listen', label: '听音选词', desc: '听发音，从四个单词里选' },
    { id: 'match', label: '词义匹配', desc: '把单词和释义一一配对（5 个一组）' },
    { id: 'mixed', label: '混合检测', desc: '选择、拼写、听音随机出现' }
  ];

  var SCOPES = [
    { id: 'due', label: '待复习', tip: '按艾宾浩斯节点今天该复习的（和「卡片记忆」里的「待复习」一致）' },
    { id: 'wrong', label: '易错', tip: '答错过或忘记过的（和「卡片记忆」里的「易错」一致）' },
    { id: 'learning', label: '全部学习中', tip: '包含还没到期的' },
    { id: 'all', label: '全部（含已掌握）', tip: '排除已归档的词' }
  ];

  var SIZES = [{ id: 10, label: '10 题' }, { id: 20, label: '20 题' }, { id: 30, label: '30 题' }, { id: 0, label: '全部' }];

  var cfg = { type: 'choice', scope: 'due', size: 10, dir: 'en2cn', writeBack: true };
  var host = null;
  var run = null;

  function pool(bookId, scope) {
    var words = VL.store.bookWords(bookId).filter(function (w) { return w.status !== 'archived'; });
    if (scope === 'due') return VL.srs.dueList(words);
    if (scope === 'wrong') return words.filter(function (w) { return (w.srs.wrong || 0) + (w.srs.lapses || 0) > 0; });
    if (scope === 'learning') return words.filter(function (w) { return w.status !== 'mastered'; });
    return words;
  }

  function makeQuestions(words, type, size, dir) {
    var list = words.slice();
    if (size > 0) list = U.shuffle(list).slice(0, Math.min(size, list.length));
    else list = U.shuffle(list);
    var seq = [];
    list.forEach(function (w, i) {
      var t = type;
      if (type === 'mixed') {
        var cycle = ['choice', 'spell', 'listen'];
        t = cycle[i % cycle.length];
      }
      seq.push({
        word: w,
        type: t,
        dir: dir,
        options: t === 'choice' || t === 'listen' ? buildOptions(w, list, t === 'listen' ? 'term' : (dir === 'en2cn' ? 'meaning' : 'term')) : null
      });
    });
    return seq;
  }

  function buildOptions(word, list, field) {
    var correct = field === 'meaning' ? (word.meaning || '（无释义）') : word.term;
    var others = list.filter(function (w) { return w.id !== word.id; })
      .map(function (w) { return field === 'meaning' ? (w.meaning || '') : w.term; })
      .filter(function (x) { return x && x !== correct; });
    var picked = U.uniqBy(U.shuffle(others), function (x) { return x; }).slice(0, 3);
    return U.shuffle([correct].concat(picked));
  }

  function start() {
    var bookId = VL.store.activeBookId();
    var words = pool(bookId, cfg.scope);
    if (!words.length) { U.toast('这个范围里还没有可以检测的生词', 'warn'); return; }
    var questions = makeQuestions(words, cfg.type, cfg.size, cfg.dir);
    run = {
      bookId: bookId, cfg: Object.assign({}, cfg),
      questions: questions, idx: 0, items: [], startedAt: Date.now(),
      rounds: 0
    };
    renderRun();
  }

  /* ---------- 运行 ---------- */

  function renderRun() {
    clearKeyHandler();
    if (!run) { renderConfig(); return; }
    if (run.idx >= run.questions.length) { renderResult(); return; }
    var q = run.questions[run.idx];
    if (q.type === 'match') return renderMatchRound(q);
    if (q.type === 'spell') return renderSpell(q);
    if (q.type === 'listen') return renderListen(q);
    return renderChoice(q);
  }

  function runShell(titleText, body, opts) {
    var o = opts || {};
    var book = VL.store.getBook(run.bookId);
    var done = run.items.length;
    var total = run.questions.length;
    U.mount(host, [
      el('div', { class: 'view-head' }, [
        el('div', null, [
          el('h1', { id: 'v-tests', text: '生词检测' }),
          el('div', { class: 'view-sub', text: (book ? book.name : '') + ' · ' + (TYPES.filter(function (t) { return t.id === run.cfg.type; })[0] || {}).label + ' · ' + (SCOPES.filter(function (s) { return s.id === run.cfg.scope; })[0] || {}).label })
        ]),
        el('div', { class: 'spacer' }),
        el('button', { class: 'btn', type: 'button', onclick: function () { if (confirm('结束本次检测？未完成的题目不会计入成绩。')) { run = null; renderConfig(); } } }, '结束检测')
      ]),
      el('div', { class: 'card card-pad-sm mb' }, [
        el('div', { class: 'row' }, [
          el('strong', { class: 'tabular', text: '第 ' + Math.min(done + 1, total) + ' / ' + total + ' 题' }),
          el('div', { class: 'grow' }, [
            el('div', { class: 'bar-track' }, [el('div', { class: 'bar-fill', style: { width: (total ? (done / total) * 100 : 0) + '%' } })])
          ]),
          el('span', { class: 'text-small text-muted', text: '正确 ' + run.items.filter(function (i) { return i.correct; }).length + ' · 错误 ' + run.items.filter(function (i) { return !i.correct; }).length })
        ])
      ]),
      el('div', { class: 'card' }, [
        el('div', { class: 'card-head' }, [
          el('h3', { text: titleText }),
          o.right ? null : null,
          el('span', { class: 'card-note', text: o.hint || '' })
        ]),
        body
      ])
    ]);
  }

  function record(q, correct, opts) {
    var o = opts || {};
    var item = {
      wordId: q.word.id, term: q.word.term, meaning: q.word.meaning,
      type: q.type, correct: correct, answer: o.answer || '', userAnswer: o.userAnswer || '',
      hinted: !!o.hinted
    };
    run.items.push(item);
    if (cfg.writeBack) {
      VL.srs.applyTestResult(q.word, correct, { slow: !!o.hinted });
    }
    VL.store.save();
  }

  function next() {
    run.idx += 1;
    renderRun();
  }

  // 每道题只保留一个键盘处理器，切换题目时清掉上一个
  var activeKeyHandler = null;
  function setKeyHandler(fn) {
    if (activeKeyHandler) document.removeEventListener('keydown', activeKeyHandler);
    activeKeyHandler = fn;
    if (fn) document.addEventListener('keydown', fn);
  }
  function clearKeyHandler() { setKeyHandler(null); }

  function questionCard(q, inner) {
    return el('div', null, [
      el('div', { class: 'q-item' }, [
        el('div', { class: 'q-head' }, [
          el('span', { class: 'q-no', text: String(run.items.length + 1) }),
          el('span', { class: 'q-stem', text: q.type === 'listen' ? '听发音，选出你听到的单词' : (q.dir === 'en2cn' ? '"' + q.word.term + '" 的意思是？' : '"' + (q.word.meaning || '') + '" 对应的英文是？') })
        ]),
        inner
      ])
    ]);
  }

  function renderChoice(q) {
    var answered = false;
    var optsWrap = el('div', { class: 'q-opts' });
    var foot = el('div', { class: 'q-foot' });
    var keys = ['A', 'B', 'C', 'D'];
    var correctText = q.dir === 'en2cn' ? (q.word.meaning || '') : q.word.term;

    q.options.forEach(function (text, i) {
      var input = el('input', { type: 'radio', name: 'opt' });
      var label = el('label', { class: 'opt' }, [input, el('span', { class: 'opt-key', text: keys[i] }), el('span', { text: text })]);
      label.addEventListener('click', function (e) {
        if (answered) { e.preventDefault(); return; }
        answered = true;
        var correct = text === correctText;
        U.$$('.opt', optsWrap).forEach(function (n) {
          var t = n.querySelector('span:last-child').textContent;
          if (t === correctText) n.classList.add('correct');
        });
        if (!correct) label.classList.add('wrong');
        record(q, correct, { answer: correctText, userAnswer: text });
        if (q.word.term) U.speak(q.word.term);
        U.mount(foot, [
          el('div', { class: 'row-wrap' }, [
            correct ? el('span', { class: 'chip chip-green', text: '✓ 答对了' }) : el('span', { class: 'chip chip-red', text: '✗ 正确答案：' + correctText }),
            el('span', { class: 'text-small text-muted', text: q.word.term + ' ' + (q.word.pos || '') + ' ' + (q.word.meaning || '') }),
            el('div', { class: 'spacer' }),
            el('button', { class: 'btn btn-primary', type: 'button', onclick: next }, '下一题')
          ]),
          q.word.example ? el('div', { class: 'text-small text-muted', style: { marginTop: '6px' }, text: q.word.example + (q.word.exampleCn ? ' ' + q.word.exampleCn : '') }) : null
        ]);
        setTimeout(function () { var b = foot.querySelector('button'); if (b) b.focus(); }, 20);
      });
      optsWrap.appendChild(label);
    });

    runShell('选择正确的答案', questionCard(q, [optsWrap, foot]), { hint: '点选项立即判分' });
    var onKey = function (e) {
      if (/^(input|textarea|select)$/i.test(e.target.tagName)) return;
      var n = { '1': 0, '2': 1, '3': 2, '4': 3, a: 0, b: 1, c: 2, d: 3 }[e.key.toLowerCase()];
      if (n !== undefined && !answered) { var labels = U.$$('.opt', optsWrap); if (labels[n]) labels[n].click(); }
      else if (answered && e.key === 'Enter') { next(); }
    };
    setKeyHandler(onKey);
  }

  function spellHint(word, reveal) {
    var t = word.term;
    var out = [];
    var shown = 1 + (reveal || 0);
    var letterIndex = 0;
    for (var i = 0; i < t.length; i++) {
      var ch = t[i];
      if (ch === ' ' || ch === '-') { out.push(ch); continue; }
      out.push(letterIndex < shown ? ch : '_');
      letterIndex += 1;
    }
    return out.join(' ');
  }

  function renderSpell(q) {
    var answered = false;
    var reveal = 0;
    var hinted = false;
    var hintEl = el('div', { class: 'spell-hint', text: spellHint(q.word, 0) });
    var input = el('input', { class: 'input spell-input', type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: '输入英文单词后按回车' });
    var foot = el('div', { class: 'q-foot' });
    var wrap = el('div', { class: 'answer-input' }, [
      el('div', { class: 'text-small text-2 mb', text: (q.word.pos || '') + ' ' + (q.word.meaning || '') }),
      hintEl,
      el('div', { class: 'row', style: { marginTop: '8px', maxWidth: '420px' } }, [
        input,
        el('button', { class: 'btn', type: 'button', onclick: function () { U.speak(q.word.term); } }, '🔊'),
        el('button', { class: 'btn', type: 'button', onclick: function () { hinted = true; reveal += 1; U.mount(hintEl, spellHint(q.word, reveal)); } }, '提示')
      ]),
      foot
    ]);

    function check() {
      if (answered) return;
      var val = U.normTerm(input.value).replace(/[\s-]/g, '');
      var target = U.normTerm(q.word.term).replace(/[\s-]/g, '');
      answered = true;
      var correct = val && val === target;
      input.disabled = true;
      record(q, !!correct, { answer: q.word.term, userAnswer: input.value, hinted: hinted });
      U.mount(foot, [
        el('div', { class: 'row-wrap', style: { marginTop: '10px' } }, [
          correct ? el('span', { class: 'chip chip-green', text: '✓ 拼写正确' }) : el('span', { class: 'chip chip-red', text: '✗ 正确拼写：' + q.word.term }),
          el('span', { class: 'text-small text-muted', text: q.word.meaning || '' }),
          el('div', { class: 'spacer' }),
          el('button', { class: 'btn btn-primary', type: 'button', onclick: next }, '下一题')
        ]),
        q.word.example ? el('div', { class: 'text-small text-muted', style: { marginTop: '6px' }, text: q.word.example }) : null
      ]);
      setTimeout(function () { var b = foot.querySelector('button'); if (b) b.focus(); }, 20);
      setKeyHandler(function (e) { if (e.key === 'Enter') next(); });
    }

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); if (answered) next(); else check(); }
    });

    runShell('根据释义拼出单词', questionCard(q, wrap), { hint: '提示会多给一个字母，判为“模糊”' });
    setTimeout(function () { if (!answered) input.focus(); }, 30);
    setKeyHandler(function (e) {
      if (e.key !== 'Enter') return;
      if (/^(input|textarea|select)$/i.test(e.target.tagName)) return;
      if (answered) next(); else check();
    });
  }

  function renderListen(q) {
    var answered = false;
    var correctText = q.word.term;
    var foot = el('div', { class: 'q-foot' });
    var optsWrap = el('div', { class: 'q-opts' });
    var keys = ['A', 'B', 'C', 'D'];

    q.options.forEach(function (text, i) {
      var input = el('input', { type: 'radio', name: 'opt' });
      var label = el('label', { class: 'opt' }, [input, el('span', { class: 'opt-key', text: keys[i] }), el('span', { text: text })]);
      label.addEventListener('click', function (e) {
        if (answered) { e.preventDefault(); return; }
        answered = true;
        var correct = text === correctText;
        U.$$('.opt', optsWrap).forEach(function (n) {
          if (n.querySelector('span:last-child').textContent === correctText) n.classList.add('correct');
        });
        if (!correct) label.classList.add('wrong');
        record(q, correct, { answer: correctText, userAnswer: text });
        U.mount(foot, [
          el('div', { class: 'row-wrap' }, [
            correct ? el('span', { class: 'chip chip-green', text: '✓ 答对了' }) : el('span', { class: 'chip chip-red', text: '✗ 正确答案：' + correctText }),
            el('span', { class: 'text-small text-muted', text: q.word.meaning || '' }),
            el('div', { class: 'spacer' }),
            el('button', { class: 'btn btn-primary', type: 'button', onclick: next }, '下一题')
          ])
        ]);
        setTimeout(function () { var b = foot.querySelector('button'); if (b) b.focus(); }, 20);
      });
      optsWrap.appendChild(label);
    });

    var play = el('button', { class: 'listen-big', type: 'button', title: '再听一次', onclick: function () { U.speak(correctText); } }, '🔊');
    runShell('听音选词', questionCard(q, [
      el('div', { class: 'center' }, [play, el('div', { class: 'text-small text-muted', text: '点喇叭可以再听一次' })]),
      optsWrap, foot
    ]), { hint: '关注元音和重音位置' });
    setTimeout(function () { U.speak(correctText); }, 350);
  }

  function renderMatchRound(q) {
    // 从当前题开始连续取 5 个词组成一轮配对
    var words = [];
    for (var i = run.idx; i < run.questions.length && words.length < 5; i++) {
      if (run.questions[i].type === 'match') words.push(run.questions[i].word);
    }
    if (words.length < 2) { next(); return; }
    var consumed = words.length;
    var sel = null;
    var paired = {};
    var errors = {};
    var left = U.shuffle(words);
    var right = U.shuffle(words);
    var status = el('div', { class: 'text-small text-muted' , text: '点一个单词，再点它的中文释义' });
    var foot = el('div', { class: 'q-foot' });

    function tryPair(rightWord) {
      if (!sel) { status.textContent = '先点左边的单词'; return; }
      if (sel.word.id === rightWord.id) {
        paired[sel.word.id] = true;
        sel.node.classList.add('ok');
        rightWord.node.classList.add('ok');
        record({ word: sel.word, type: 'match', dir: 'en2cn' }, true, { answer: sel.word.meaning });
      } else {
        errors[sel.word.id] = true;
        sel.node.classList.add('bad');
        rightWord.node.classList.add('bad');
        record({ word: sel.word, type: 'match', dir: 'en2cn' }, false, { answer: sel.word.meaning, userAnswer: rightWord.meaning });
        U.toast('「' + sel.word.term + '」的释义是：' + sel.word.meaning, 'warn', 3200);
      }
      var s = sel; sel = null;
      setTimeout(function () {
        s.node.classList.remove('sel', 'bad');
        rightWord.node.classList.remove('bad');
        if (paired[s.word.id]) { s.node.classList.add('paired'); rightWord.node.classList.add('paired'); }
        else { s.node.classList.remove('ok'); rightWord.node.classList.remove('ok'); }
      }, 900);
      var remain = words.filter(function (w) { return !paired[w.id]; });
      if (!remain.length) {
        U.mount(foot, [
          el('div', { class: 'row-wrap', style: { marginTop: '12px' } }, [
            el('span', { class: 'chip', text: '本轮配对完成' }),
            el('span', { class: 'text-small text-muted', text: '继续下一轮' }),
            el('div', { class: 'spacer' }),
            el('button', { class: 'btn btn-primary', type: 'button', onclick: function () { run.idx += consumed; renderRun(); } }, '继续')
          ])
        ]);
      } else {
        status.textContent = '已完成 ' + (words.length - remain.length) + ' / ' + words.length + ' 对，继续配对';
      }
    }

    function wordCol(list, isRight) {
      return el('div', { class: 'match-col' }, list.map(function (w, i) {
        var node = el('button', {
          class: 'match-item', type: 'button',
          onclick: function () {
            if (paired[w.id]) return;
            var all = U.$$('.match-item', isRight ? rightCol : leftCol);
            all.forEach(function (n) { n.classList.remove('sel'); });
            if (isRight) { tryPair({ id: w.id, term: w.term, meaning: w.meaning, node: node, word: w }); return; }
            sel = { word: w, node: node };
            node.classList.add('sel');
            status.textContent = '已选中「' + w.term + '」，再点右边的中文释义';
          }
        }, [el('span', { class: 'n', text: String(i + 1) }), isRight ? (w.meaning || '（无释义）') : w.term]);
        w.node = node;
        return node;
      }));
    }

    var leftCol = wordCol(left, false);
    var rightCol = wordCol(right, true);

    runShell('把单词和释义配成对', [
      el('div', { class: 'q-item' }, [
        status,
        el('div', { class: 'match-grid', style: { marginTop: '10px' } }, [
          el('div', null, [el('div', { class: 'label mb', text: '单词' }), leftCol]),
          el('div', null, [el('div', { class: 'label mb', text: '中文释义' }), rightCol])
        ]),
        foot
      ])
    ], { hint: words.length + ' 个一组' });
  }

  /* ---------- 结果 ---------- */

  function renderResult() {
    var items = run.items;
    var total = items.length;
    var right = items.filter(function (i) { return i.correct; }).length;
    var rate = total ? Math.round((right / total) * 100) : 0;
    var wrong = items.filter(function (i) { return !i.correct; });
    var mins = Math.max(1, Math.round((Date.now() - run.startedAt) / 60000));

    var record = {
      type: run.cfg.type, scope: run.cfg.scope, total: total, correct: right, minutes: mins,
      items: items.map(function (i) { return { term: i.term, meaning: i.meaning, correct: i.correct, userAnswer: i.userAnswer }; })
    };
    VL.store.addTest(run.bookId, record);
    VL.store.logStudy('tests', 1);

    var byType = U.groupBy(items, function (i) { return i.type; });
    var typeRows = Object.keys(byType).map(function (t) {
      var arr = byType[t];
      var r = arr.filter(function (i) { return i.correct; }).length;
      var label = (TYPES.filter(function (x) { return x.id === t; })[0] || { label: t }).label;
      return el('tr', null, [
        el('td', { text: label }),
        el('td', { class: 'num', text: r + ' / ' + arr.length }),
        el('td', { class: 'num', text: Math.round((r / arr.length) * 100) + '%' })
      ]);
    });

    U.mount(host, [
      el('div', { class: 'view-head' }, [
        el('div', null, [el('h1', { id: 'v-tests', text: '检测结果' }),
          el('div', { class: 'view-sub', text: VL.store.getBook(run.bookId).name + ' · ' + U.fmtDateTime(record.at) })]),
        el('div', { class: 'spacer' }),
        el('button', { class: 'btn', type: 'button', onclick: function () { run = null; renderConfig(); } }, '再测一次')
      ]),
      el('div', { class: 'card mb' }, [
        el('div', { class: 'row-wrap' }, [
          el('div', { class: 'grow' }, [
            el('div', { class: 'score-big', text: rate + '%' }),
            el('div', { class: 'text-muted', text: '答对 ' + right + ' / ' + total + ' 题 · 用时 ' + mins + ' 分钟' }),
            el('div', { class: 'mt', style: { maxWidth: '420px' } }, [el('div', { class: 'bar-track' }, [el('div', { class: 'bar-fill ' + (rate >= 80 ? 'green' : rate >= 60 ? '' : 'accent'), style: { width: rate + '%' } })])])
          ]),
          el('div', { class: 'text-small text-2', style: { maxWidth: '320px' } }, [
            el('p', { text: rate >= 90 ? '非常扎实！这些词可以进入下一个复习节点了。' : rate >= 70 ? '基本掌握，错题会在一分钟后重新出现。' : '还需要多见面。可以把它们放进卡片记忆再刷一轮。' }),
            el('p', { class: 'text-muted', text: run.cfg.writeBack ? '检测结果已按艾宾浩斯规则写回复习计划：答对进入下一节点，答错回到起点。' : '本次未写回复习计划（可在设置里打开）。' })
          ])
        ]),
        el('hr'),
        el('div', { class: 'table-wrap' }, [
          el('table', { class: 'tbl' }, [
            el('thead', null, [el('tr', null, [el('th', { text: '题型' }), el('th', { class: 'num', text: '正确' }), el('th', { class: 'num', text: '正确率' })])]),
            el('tbody', null, typeRows)
          ])
        ])
      ]),
      wrong.length ? el('div', { class: 'card mb' }, [
        el('div', { class: 'card-head' }, [el('h3', { text: '错题本（本轮 ' + wrong.length + ' 个）' }) ]),
        el('div', { class: 'table-wrap' }, [
          el('table', { class: 'tbl' }, [
            el('thead', null, [el('tr', null, [el('th', { text: '单词' }), el('th', { text: '释义' }), el('th', { text: '你的答案' }), el('th', { class: 'act', text: '' })])]),
            el('tbody', null, wrong.map(function (i) {
              return el('tr', null, [
                el('td', null, [el('strong', { text: i.term }), el('div', { class: 'text-small text-muted', text: (VL.store.findWordById(i.wordId, run.bookId) || {}).pos || '' })]),
                el('td', { class: 'mean', text: i.meaning || '' }),
                el('td', { class: 'text-muted', text: i.userAnswer || '（未作答）' }),
                el('td', { class: 'act' }, [el('button', { class: 'btn btn-sm', type: 'button', onclick: function () { U.speak(i.term); } }, '🔊')])
              ]);
            }))
          ])
        ])
      ]) : el('div', { class: 'callout' }, '全部答对，太棒了！'),
      el('div', { class: 'row-wrap' }, [
        wrong.length ? el('button', {
          class: 'btn btn-primary', type: 'button',
          onclick: function () {
            var ids = wrong.map(function (i) { return i.wordId; });
            var ws = ids.map(function (id) { return VL.store.findWordById(id, run.bookId); }).filter(Boolean);
            run = { bookId: run.bookId, cfg: Object.assign({}, run.cfg, { type: 'mixed', scope: 'wrong', size: 0 }), questions: makeQuestions(ws, 'mixed', 0, 'en2cn'), idx: 0, items: [], startedAt: Date.now() };
            renderRun();
          }
        }, '只重做错题') : null,
        el('button', { class: 'btn', type: 'button', onclick: function () { run = null; renderConfig(); } }, '换一种检测'),
        el('button', { class: 'btn btn-ghost', type: 'button', onclick: function () { VL.app.go('cards'); } }, '去卡片记忆')
      ])
    ]);
  }

  /* ---------- 配置 ---------- */

  function renderConfig() {
    var bookId = VL.store.activeBookId();
    var book = VL.store.getBook(bookId);
    var counts = {};
    SCOPES.forEach(function (s) { counts[s.id] = pool(bookId, s.id).length; });

    var notEnough = counts[cfg.scope] < 4;
    var body = [
      el('div', { class: 'card mb' }, [
        el('div', { class: 'card-head' }, [
          el('h3', { text: '检测设置' }),
          el('span', { class: 'card-note', text: (book ? book.name : '') + ' · 共 ' + VL.store.bookWords(bookId).length + ' 个生词' })
        ]),
        el('div', { class: 'field mb' }, [
          el('div', { class: 'label', text: '题型' }),
          el('div', { class: 'seg' }, TYPES.map(function (t) {
            return el('button', {
              class: 'chip chip-btn' + (cfg.type === t.id ? ' is-on' : ''), type: 'button', 'data-tooltip': t.desc,
              onclick: function () { cfg.type = t.id; renderConfig(); }
            }, t.label);
          }))
        ]),
        el('div', { class: 'field mb' }, [
          el('div', { class: 'label', text: '范围' }),
          el('div', { class: 'seg' }, SCOPES.map(function (s) {
            return el('button', {
              class: 'chip chip-btn' + (cfg.scope === s.id ? ' is-on' : ''), type: 'button', 'data-tooltip': s.tip,
              onclick: function () { cfg.scope = s.id; renderConfig(); }
            }, s.label + '（' + counts[s.id] + '）');
          }))
        ]),
        el('div', { class: 'field-row' }, [
          el('div', { class: 'field' }, [
            el('div', { class: 'label', text: '题量' }),
            el('div', { class: 'seg' }, SIZES.map(function (s) {
              return el('button', {
                class: 'chip chip-btn' + (cfg.size === s.id ? ' is-on' : ''), type: 'button',
                onclick: function () { cfg.size = s.id; renderConfig(); }
              }, s.label);
            }))
          ]),
          el('div', { class: 'field' }, [
            el('div', { class: 'label', text: '方向（选择题）' }),
            el('div', { class: 'seg' }, [
              el('button', { class: 'chip chip-btn' + (cfg.dir === 'en2cn' ? ' is-on' : ''), type: 'button', onclick: function () { cfg.dir = 'en2cn'; renderConfig(); } }, '英 → 中'),
              el('button', { class: 'chip chip-btn' + (cfg.dir === 'cn2en' ? ' is-on' : ''), type: 'button', onclick: function () { cfg.dir = 'cn2en'; renderConfig(); } }, '中 → 英')
            ])
          ])
        ]),
        el('hr'),
        el('label', { class: 'check-row' }, [
          el('input', { type: 'checkbox', class: 'input', checked: cfg.writeBack, onchange: function (e) { cfg.writeBack = e.target.checked; } }),
          '把检测结果写回艾宾浩斯复习计划（推荐）'
        ]),
        el('div', { class: 'callout mt' }, '答对 → 这个生词进入下一个复习节点；答错 → 回到起点，约 1 分钟后重新出现在卡片记忆里。'),
        el('div', { class: 'row-wrap mt' }, [
          el('button', { class: 'btn btn-primary btn-lg', type: 'button', disabled: notEnough, onclick: start }, notEnough ? '这个范围生词不足 4 个' : '开始检测'),
          el('button', { class: 'btn', type: 'button', onclick: function () { VL.app.go('cards'); } }, '先去背单词')
        ])
      ]),
      renderHistory(book)
    ];

    U.mount(host, [
      el('div', { class: 'view-head' }, [
        el('div', null, [el('h1', { id: 'v-tests', text: '生词检测' }),
          el('div', { class: 'view-sub', text: '意思匹配、看词选义、拼写、听音，检测完自动调整复习计划。' })]),
        el('div', { class: 'spacer' })
      ])
    ].concat(body));
  }

  function renderHistory(book) {
    var tests = (book.tests || []).slice(0, 8);
    if (!tests.length) return el('div', { class: 'empty' }, [el('h3', { text: '还没有检测记录' }), el('p', { text: '做完第一次检测后，成绩和错题都会保存在这个词库的归档里。' })]);
    return el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [el('h3', { text: '最近的检测记录' }), el('span', { class: 'card-note', text: '保存在「归档」里' })]),
      el('div', { class: 'table-wrap' }, [
        el('table', { class: 'tbl' }, [
          el('thead', null, [el('tr', null, [el('th', { text: '时间' }), el('th', { text: '题型' }), el('th', { text: '范围' }), el('th', { class: 'num', text: '成绩' })])]),
          el('tbody', null, tests.map(function (t) {
            var rate = t.total ? Math.round((t.correct / t.total) * 100) : 0;
            return el('tr', null, [
              el('td', { class: 'nowrap', text: U.fmtDateTime(t.at) }),
              el('td', { text: (TYPES.filter(function (x) { return x.id === t.type; })[0] || { label: t.type }).label }),
              el('td', { text: (SCOPES.filter(function (x) { return x.id === t.scope; })[0] || { label: t.scope || '' }).label }),
              el('td', { class: 'num', text: rate + '%（' + t.correct + '/' + t.total + '）' })
            ]);
          }))
        ])
      ])
    ]);
  }

  VL.test = {
    render: function (container) { host = container; run = null; renderConfig(); },
    leave: function () { run = null; },
    start: start
  };
})();
