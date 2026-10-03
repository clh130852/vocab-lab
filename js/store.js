/* store.js — 数据层：生词库、生词、归档、检测与文章记录，全部存在本机 localStorage */
(function () {
  'use strict';
  var VL = (window.VL = window.VL || {});
  var U = VL.util;

  var KEY = 'vocablab.state.v1';
  var COLORS = ['#0f766e', '#1d4ed8', '#b45309', '#6d28d9', '#15803d', '#b91c1c', '#0891b2', '#c2410c'];

  function defaults() {
    return {
      v: 1,
      activeBookId: '',
      books: [],
      settings: {
        intervals: null,
        relearnDelay: 60 * 1000,
        dailyNew: 20,
        autoArchive: true,
        reverse: false,
        theme: 'auto',
        ttsVoice: '',
        ttsRate: 0.92,
        speakSource: 'auto',
        accent: 'us',
        cardExample: 'show',
        ai: { baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o-mini', temperature: 0.7 }
      },
      log: {},
      streak: { current: 0, best: 0, lastDay: '' }
    };
  }

  var state = defaults();

  function ensureBookShape(b) {
    if (!b.id) b.id = U.uid('book');
    if (!b.words) b.words = [];
    if (!b.tests) b.tests = [];
    if (!b.articles) b.articles = [];
    if (!b.createdAt) b.createdAt = Date.now();
    if (!b.color) b.color = COLORS[0];
    b.words.forEach(function (w) {
      if (!w.id) w.id = U.uid('w');
      if (!w.key) w.key = U.normTerm(w.term);
      if (!w.tags) w.tags = [];
      if (!w.status) w.status = 'learning';
      VL.srs.normalize(w);
    });
    return b;
  }

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { raw = null; }
    var data = raw ? U.safeJSON(raw) : null;
    state = data && typeof data === 'object' ? data : defaults();
    var d = defaults();
    Object.keys(d.settings).forEach(function (k) {
      if (state.settings[k] === undefined) state.settings[k] = d.settings[k];
    });
    state.settings.ai = Object.assign({}, d.settings.ai, state.settings.ai || {});
    if (!state.log) state.log = {};
    if (!state.streak) state.streak = d.streak;
    state.books = (state.books || []).map(ensureBookShape);
    if (!state.books.length) {
      var b = ensureBookShape({ id: U.uid('book'), name: '我的生词库', desc: '默认生词库', color: COLORS[0] });
      state.books.push(b);
      state.activeBookId = b.id;
    }
    if (!state.activeBookId || !getBook(state.activeBookId)) state.activeBookId = state.books[0].id;
    return state;
  }

  var saveTimer = null;

  function save(now) {
    function write() {
      saveTimer = null;
      try {
        localStorage.setItem(KEY, JSON.stringify(state));
      } catch (e) {
        U.toast('保存失败：浏览器存储空间可能已满，请先导出备份并清理数据。', 'error', 7000);
      }
    }
    if (now) { if (saveTimer) clearTimeout(saveTimer); write(); return; }
    if (saveTimer) return;
    saveTimer = setTimeout(write, 250);
  }

  /* ---------- 生词库 ---------- */

  function books() { return state.books; }

  function getBook(id) {
    for (var i = 0; i < state.books.length; i++) if (state.books[i].id === id) return state.books[i];
    return null;
  }

  function activeBook() { return getBook(state.activeBookId) || state.books[0]; }
  function activeBookId() { return (activeBook() || {}).id || ''; }
  function setActiveBook(id) { if (getBook(id)) { state.activeBookId = id; save(); return true; } return false; }

  function addBook(opts) {
    var o = opts || {};
    var b = ensureBookShape({
      id: U.uid('book'),
      name: o.name || '新词库',
      desc: o.desc || '',
      createdAt: Date.now(),
      color: o.color || COLORS[state.books.length % COLORS.length]
    });
    state.books.push(b);
    state.activeBookId = b.id;
    save(true);
    return b;
  }

  function updateBook(id, patch) {
    var b = getBook(id);
    if (!b) return null;
    Object.assign(b, patch || {});
    save(true);
    return b;
  }

  function deleteBook(id) {
    var i = state.books.findIndex(function (b) { return b.id === id; });
    if (i < 0) return false;
    if (state.books.length <= 1) return false;
    state.books.splice(i, 1);
    if (state.activeBookId === id) state.activeBookId = state.books[0].id;
    save(true);
    return true;
  }

  /* ---------- 生词 ---------- */

  function makeWord(data) {
    var term = String(data.term || '').trim();
    var dict = VL.dict.get(term);
    return {
      id: U.uid('w'),
      term: term,
      key: U.normTerm(term),
      phonetic: data.phonetic || (dict ? dict.ipa : '') || '',
      pos: data.pos || (dict ? dict.pos : '') || '',
      meaning: data.meaning || (dict ? dict.cn : '') || '',
      example: data.example || (dict ? dict.ex : '') || '',
      exampleCn: data.exampleCn || (dict ? dict.exCn : '') || '',
      note: data.note || '',
      tags: data.tags || (dict ? dict.tags.slice() : []),
      source: data.source || 'manual',
      status: 'learning',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      srs: VL.srs.newSrs()
    };
  }

  function findWord(term, bookId) {
    var b = getBook(bookId || activeBookId());
    if (!b) return null;
    var k = U.normTerm(term);
    for (var i = 0; i < b.words.length; i++) if (b.words[i].key === k) return b.words[i];
    return null;
  }

  function findWordById(id, bookId) {
    var b = getBook(bookId || activeBookId());
    if (!b) return null;
    for (var i = 0; i < b.words.length; i++) if (b.words[i].id === id) return b.words[i];
    return null;
  }

  // 在所有生词库里找一个词（用来给「查词」当词典：你录过的词，下次会自动带出释义）
  function findAnyWord(term) {
    var k = U.normTerm(term);
    if (!k) return null;
    for (var i = 0; i < state.books.length; i++) {
      var words = state.books[i].words;
      for (var j = 0; j < words.length; j++) {
        if (words[j].key === k && (words[j].meaning || words[j].example)) return words[j];
      }
    }
    return null;
  }

  function addWord(bookId, data) {
    var b = getBook(bookId || activeBookId());
    if (!b) return null;
    var term = String(data.term || '').trim();
    if (!term) return null;
    var exist = findWord(term, b.id);
    if (exist) {
      if (data.merge !== false) {
        ['meaning', 'phonetic', 'pos', 'example', 'exampleCn', 'note'].forEach(function (f) {
          if (!exist[f] && data[f]) exist[f] = data[f];
        });
        save();
      }
      return { word: exist, created: false };
    }
    var w = makeWord(data);
    b.words.push(w);
    save();
    return { word: w, created: true };
  }

  function addWords(bookId, list) {
    var out = { added: 0, skipped: 0, words: [] };
    (list || []).forEach(function (item) {
      var r = addWord(bookId, item);
      if (!r) return;
      if (r.created) { out.added += 1; out.words.push(r.word); }
      else out.skipped += 1;
    });
    save(true);
    return out;
  }

  function updateWord(wordId, patch, bookId) {
    var w = findWordById(wordId, bookId);
    if (!w) return null;
    Object.keys(patch || {}).forEach(function (k) {
      if (k === 'term') { w.term = patch.term; w.key = U.normTerm(patch.term); }
      else w[k] = patch[k];
    });
    w.updatedAt = Date.now();
    save();
    return w;
  }

  function removeWord(wordId, bookId) {
    var b = getBook(bookId || activeBookId());
    if (!b) return false;
    var i = b.words.findIndex(function (w) { return w.id === wordId; });
    if (i < 0) return false;
    b.words.splice(i, 1);
    save(true);
    return true;
  }

  function removeWords(ids, bookId) {
    var b = getBook(bookId || activeBookId());
    if (!b) return 0;
    var set = Object.create(null);
    (ids || []).forEach(function (id) { set[id] = 1; });
    var before = b.words.length;
    b.words = b.words.filter(function (w) { return !set[w.id]; });
    save(true);
    return before - b.words.length;
  }

  function archiveWord(wordId, bookId) {
    var w = findWordById(wordId, bookId);
    if (!w) return null;
    w.status = 'archived';
    w.archivedAt = Date.now();
    w.srs.dueAt = 0;
    save();
    return w;
  }

  function restoreWord(wordId, bookId) {
    var w = findWordById(wordId, bookId);
    if (!w) return null;
    w.status = w.srs && w.srs.level > VL.srs.MAX_LEVEL ? 'mastered' : 'learning';
    w.archivedAt = 0;
    if (w.status === 'learning' && !w.srs.dueAt) w.srs.dueAt = Date.now();
    save();
    return w;
  }

  function bookWords(bookId) {
    var b = getBook(bookId || activeBookId());
    return b ? b.words : [];
  }

  function allWords() {
    var out = [];
    state.books.forEach(function (b) { out = out.concat(b.words); });
    return out;
  }

  function searchAll(query, limit) {
    var q = U.normTerm(query);
    if (!q) return [];
    var out = [];
    state.books.forEach(function (b) {
      b.words.forEach(function (w) {
        if (out.length >= (limit || 30)) return;
        if (w.key.indexOf(q) >= 0 || String(w.meaning || '').indexOf(query.trim()) >= 0) {
          out.push({ word: w, book: b });
        }
      });
    });
    return out;
  }

  /* ---------- 导入 / 导出 ---------- */

  var CJK = /[\u4e00-\u9fa5]/;

  function trimAll(a) { return a.map(function (x) { return x.trim(); }); }

  // 把一行拆成 [单词, 释义…]，识别逗号 / 制表符 / Markdown 表格 / 空格四种写法
  function splitLine(s) {
    if (s.charAt(0) === '|') {
      var cells = trimAll(s.replace(/^\|/, '').replace(/\|$/, '').split('|'));
      if (/^(word|单词|生词)$/i.test(cells[0] || '')) return null;
      if (cells.length > 1 && /^[-: ]+$/.test(cells.join(''))) return null;
      return cells;
    }
    if (s.indexOf('\t') >= 0) return trimAll(s.split('\t'));
    if (s.indexOf(',') >= 0 || s.indexOf('，') >= 0) {
      var cp = trimAll(s.split(/[,，]/));
      var firstOk = cp.length >= 2 && /^[A-Za-z][A-Za-z'’.\- ]*$/.test(cp[0]) && cp[0].split(/\s+/).length <= 3;
      if (firstOk) return cp;
    }
    var m = s.match(/^([A-Za-z][A-Za-z'’ .-]*?)\s*[-–—:：]?\s+([\s\S]+)$/);
    return m ? [m[1].trim(), m[2].trim()] : [s];
  }

  function buildEntry(term, restParts) {
    var dict = VL.dict.get(term) || {};
    // 「important adj. 重要的」这种写法：把词性从释义里拆出来
    var rest = [];
    (restParts || []).forEach(function (item) {
      var s2 = String(item || '');
      var m2 = s2.match(/^([a-z]+\.(?:\s*\/\s*[a-z]+\.)?)\s+([\s\S]+)$/i);
      if (m2) rest.push(m2[1].replace(/\s/g, ''), m2[2]);
      else rest.push(s2);
    });
    rest = rest.filter(function (x) { return x !== ''; });
    var pos = '', meaning = '', phonetic = '';
    rest.forEach(function (p) {
      if (/^[a-z]+\.(\/[a-z]+\.)?$/i.test(p) && p.length <= 12) { pos = pos || p; return; }
      if (/[ˈˌəɪʊæɒɔɑɜʌ]/.test(p) && p.length > 3 && /^[\/\[]?[^，。；、\u4e00-\u9fa5]+[\/\]]?$/.test(p)) { phonetic = phonetic || p; return; }
      if (!meaning) meaning = p;
      else meaning += '；' + p;
    });
    return {
      term: term,
      pos: pos || dict.pos || '',
      meaning: meaning || dict.cn || '',
      phonetic: phonetic || dict.ipa || '',
      example: dict.ex || '',
      exampleCn: dict.exCn || '',
      source: 'import'
    };
  }

  // 支持：单词和释义写在同一行，或「单词」一行、「释义」下一行（从单词书 / App 复制常见格式）
  function parseImportText(text) {
    var raw = String(text || '').split(/\r?\n/);
    var out = [];
    var pending = null;
    var headerRe = /^(序号|编号|no\.?|index|#|单词|词汇|生词|word|words|词性|pos\.?|part of speech|中文|释义|意思|含义|meaning|translation|翻译|音标|phonetic|ipa|例句|example|sentence|备注|note)$/i;

    function flush() {
      if (pending) { out.push(buildEntry(pending, [])); pending = null; }
    }

    function isHeaderLine(s) {
      var cells = s.split(/[\t,，|]/).map(function (x) { return x.trim(); }).filter(Boolean);
      return cells.length > 1 && cells.every(function (x) { return headerRe.test(x); });
    }

    raw.forEach(function (line) {
      var s = line
        .replace(/^\s*(?:\d{1,3}\s*[.、)．]|[①②③④⑤⑥⑦⑧⑨⑩])\s*/, '')
        .replace(/^[-*·•]\s+/, '')
        .trim();
      if (!s || s.charAt(0) === '#' || /^[-=+_]+$/.test(s)) return;
      if (isHeaderLine(s)) return;

      var parts = splitLine(s);
      if (!parts) return;
      var term = (parts[0] || '').trim();
      if (!term) return;
      var rest = parts.slice(1);
      var hasCJK = CJK.test(s);
      var bareWord = !hasCJK && /^[A-Za-z][A-Za-z'’.\- ]*$/.test(s) && s.split(/\s+/).length <= 3;
      var posLead = /^[a-z]+\.(?:\s*\/\s*[a-z]+\.)?$/i.test(term);
      var pairLine = !posLead && rest.length > 0 && /^[A-Za-z]/.test(term);

      if (bareWord) {           // 这一行只有英文单词，先记下来等下一行的释义
        flush();
        pending = term;
        return;
      }
      if (pending && !pairLine) {   // 这一行是上一行单词的释义
        out.push(buildEntry(pending, [s]));
        pending = null;
        return;
      }
      flush();
      out.push(buildEntry(term, rest));
    });
    flush();
    return out;
  }

  function exportBook(bookId) {
    var b = getBook(bookId || activeBookId());
    if (!b) return null;
    return {
      app: 'Vocab Lab', kind: 'book', exportedAt: new Date().toISOString(),
      book: { name: b.name, desc: b.desc, color: b.color, createdAt: b.createdAt, words: b.words, tests: b.tests, articles: b.articles }
    };
  }

  function exportAll() {
    return {
      app: 'Vocab Lab', kind: 'backup', version: 1,
      exportedAt: new Date().toISOString(),
      activeBookId: state.activeBookId,
      books: state.books,
      settings: state.settings,
      log: state.log,
      streak: state.streak
    };
  }

  function exportCSV(bookId) {
    var b = getBook(bookId || activeBookId());
    if (!b) return '';
    var esc = function (v) { return '"' + String(v === undefined || v === null ? '' : v).replace(/"/g, '""') + '"'; };
    var rows = [['单词', '词性', '释义', '音标', '例句', '例句翻译', '状态', '记忆阶段', '复习次数', '错误次数', '下次复习', '标签']];
    b.words.forEach(function (w) {
      rows.push([w.term, w.pos, w.meaning, w.phonetic, w.example, w.exampleCn,
        w.status, VL.srs.stageLabel(w.srs.level), w.srs.reps, w.srs.wrong,
        w.srs.dueAt ? U.fmtDateTime(w.srs.dueAt) : '', (w.tags || []).join('/')]);
    });
    return '\ufeff' + rows.map(function (r) { return r.map(esc).join(','); }).join('\r\n');
  }

  function importData(payload) {
    var data = typeof payload === 'string' ? U.safeJSON(payload) : payload;
    if (!data) return { ok: false, message: '不是有效的 JSON 数据' };

    if (data.kind === 'backup' && Array.isArray(data.books)) {
      if (!data.books.length) return { ok: false, message: '备份里没有词库' };
      var names = state.books.map(function (b) { return b.name; });
      data.books.forEach(function (b) {
        var nb = ensureBookShape(JSON.parse(JSON.stringify(b)));
        nb.id = U.uid('book');
        if (names.indexOf(nb.name) >= 0) nb.name = nb.name + '（导入）';
        nb.words.forEach(function (w) { w.id = U.uid('w'); });
        nb.tests = []; nb.articles = [];
        state.books.push(nb);
      });
      if (data.settings && data.settings.ai && !state.settings.ai.apiKey) state.settings.ai = data.settings.ai;
      save(true);
      return { ok: true, message: '已导入 ' + data.books.length + ' 个词库（检测与文章记录未导入）' };
    }

    if (data.kind === 'book' && data.book) {
      var book = ensureBookShape(JSON.parse(JSON.stringify(data.book)));
      book.id = U.uid('book');
      book.words.forEach(function (w) { w.id = U.uid('w'); });
      state.books.push(book);
      state.activeBookId = book.id;
      save(true);
      return { ok: true, message: '已导入词库「' + book.name + '」，共 ' + book.words.length + ' 个词' };
    }

    if (Array.isArray(data.words)) {
      var r = addWords(activeBookId(), data.words);
      return { ok: true, message: '新增 ' + r.added + ' 个生词，跳过重复 ' + r.skipped + ' 个' };
    }

    return { ok: false, message: '无法识别的数据格式' };
  }

  /* ---------- 记录 ---------- */

  function addTest(bookId, record) {
    var b = getBook(bookId || activeBookId());
    if (!b) return null;
    record.id = record.id || U.uid('test');
    record.at = record.at || Date.now();
    b.tests.unshift(record);
    if (b.tests.length > 200) b.tests = b.tests.slice(0, 200);
    save();
    return record;
  }

  function addArticle(bookId, article) {
    var b = getBook(bookId || activeBookId());
    if (!b) return null;
    article.id = article.id || U.uid('art');
    article.at = article.at || Date.now();
    b.articles.unshift(article);
    if (b.articles.length > 100) b.articles = b.articles.slice(0, 100);
    save();
    return article;
  }

  function todayLog() {
    var k = U.dayKey();
    if (!state.log[k]) state.log[k] = { learned: 0, reviewed: 0, tests: 0, articles: 0 };
    var l = state.log[k];
    if (typeof l.learned !== 'number') l.learned = 0;
    if (typeof l.reviewed !== 'number') l.reviewed = 0;
    if (typeof l.tests !== 'number') l.tests = 0;
    if (typeof l.articles !== 'number') l.articles = 0;
    return l;
  }

  function logStudy(field, n) {
    var l = todayLog();
    l[field] = (l[field] || 0) + (n === undefined ? 1 : n);
    var today = U.dayKey();
    if (state.streak.lastDay !== today) {
      var y = U.dayKey(U.startOfDay() - U.DAY);
      state.streak.current = state.streak.lastDay === y ? (state.streak.current + 1) : 1;
      state.streak.lastDay = today;
      if (state.streak.current > state.streak.best) state.streak.best = state.streak.current;
    }
    save();
    return l;
  }

  function heatmap(days) {
    var n = days || 91;
    var out = [];
    var today = U.startOfDay();
    for (var i = n - 1; i >= 0; i--) {
      var ts = today - i * U.DAY;
      var k = U.dayKey(ts);
      var l = state.log[k] || {};
      var total = (l.learned || 0) + (l.reviewed || 0) + (l.tests || 0);
      out.push({ key: k, ts: ts, count: total, level: total === 0 ? 0 : (total < 5 ? 1 : total < 15 ? 2 : total < 30 ? 3 : 4) });
    }
    return out;
  }

  function settings() { return state.settings; }
  function setSettings(patch) { Object.assign(state.settings, patch || {}); save(true); return state.settings; }
  function setAI(patch) { state.settings.ai = Object.assign({}, state.settings.ai, patch || {}); save(true); return state.settings.ai; }

  function wipe() {
    state = defaults();
    var b = ensureBookShape({ id: U.uid('book'), name: '我的生词库', desc: '默认生词库', color: COLORS[0] });
    state.books.push(b);
    state.activeBookId = b.id;
    save(true);
    return state;
  }

  VL.store = {
    COLORS: COLORS,
    get state() { return state; },
    get streak() { return state.streak; },
    get log() { return state.log; },
    load: load, save: save, defaults: defaults, wipe: wipe,
    books: books, getBook: getBook, activeBook: activeBook, activeBookId: activeBookId, setActiveBook: setActiveBook,
    addBook: addBook, updateBook: updateBook, deleteBook: deleteBook,
    makeWord: makeWord, addWord: addWord, addWords: addWords, updateWord: updateWord,
    removeWord: removeWord, removeWords: removeWords, archiveWord: archiveWord, restoreWord: restoreWord,
    findWord: findWord, findWordById: findWordById, findAnyWord: findAnyWord,
    bookWords: bookWords, allWords: allWords, searchAll: searchAll,
    parseImportText: parseImportText, exportBook: exportBook, exportAll: exportAll, exportCSV: exportCSV, importData: importData,
    addTest: addTest, addArticle: addArticle,
    todayLog: todayLog, logStudy: logStudy, heatmap: heatmap,
    settings: settings, setSettings: setSettings, setAI: setAI
  };
})();
