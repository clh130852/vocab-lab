/* app.js — 外壳：导航、路由、搜索、主题、初始化 */
(function () {
  'use strict';
  var VL = (window.VL = window.VL || {});
  var U = VL.util;
  var el = U.el;

  var VIEWS = ['dashboard', 'words', 'cards', 'reading', 'tests', 'archive', 'settings', 'help'];
  var TITLES = {
    dashboard: '总览', words: '生词库', cards: '卡片记忆', reading: '文章阅读',
    tests: '生词检测', archive: '归档', settings: '设置与备份', help: '使用说明'
  };
  var current = 'dashboard';

  /* ---------- 主题 ---------- */

  function applyTheme() {
    var t = VL.store.settings().theme || 'auto';
    var dark = t === 'dark' || (t === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    var btn = document.getElementById('themeBtn');
    if (btn) btn.textContent = dark ? '☀' : '◐';
  }

  function cycleTheme() {
    var order = ['auto', 'light', 'dark'];
    var cur = VL.store.settings().theme || 'auto';
    var next = order[(order.indexOf(cur) + 1) % order.length];
    VL.store.setSettings({ theme: next });
    applyTheme();
    U.toast('主题：' + { auto: '跟随系统', light: '浅色', dark: '深色' }[next], 'ok', 1500);
  }

  /* ---------- 侧栏 ---------- */

  function renderSidebar() {
    var active = VL.store.activeBookId();
    var list = document.getElementById('bookList');
    if (!list) return;
    U.mount(list, VL.store.books().map(function (b) {
      var words = b.words.filter(function (w) { return w.status !== 'archived'; });
      var due = VL.srs.dueList(words).length;
      return el('button', {
        class: 'book-item' + (b.id === active ? ' active' : ''), type: 'button',
        'data-tooltip': b.name + '：' + b.words.length + ' 个生词' + (b.desc ? '（' + b.desc + '）' : ''),
        onclick: function () {
          if (b.id !== active) { VL.cards.leave(); }
          VL.store.setActiveBook(b.id);
          refreshAll();
          closeDrawer();
        }
      }, [
        el('span', { class: 'book-dot', style: { background: b.color || 'var(--primary)' } }),
        el('span', { class: 'ellipsis grow', text: b.name }),
        el('span', { class: 'book-count', text: due ? due + '/' + words.length : String(words.length) })
      ]);
    }));

    var badges = {
      cards: VL.srs.dueList(VL.store.allWords().filter(function (w) { return w.status !== 'archived'; })).length
    };
    var cardBadge = document.getElementById('navBadgeCards');
    if (cardBadge) cardBadge.textContent = badges.cards ? String(badges.cards) : '';

    U.$$('.nav-item').forEach(function (n) {
      n.classList.toggle('active', n.getAttribute('data-view') === current);
    });
  }

  function renderTopStats() {
    var words = VL.store.allWords().filter(function (w) { return w.status !== 'archived'; });
    var due = VL.srs.dueList(words).length;
    var dueEl = document.getElementById('topDueCount');
    var streakEl = document.getElementById('topStreak');
    if (dueEl) dueEl.textContent = String(due);
    if (streakEl) streakEl.textContent = String(VL.store.streak.current || 0);
  }

  /* ---------- 路由 ---------- */

  function go(view) {
    if (VIEWS.indexOf(view) < 0) view = 'dashboard';
    if (current === 'reading' && view !== 'reading') VL.reading.leave();
    if (current === 'tests' && view !== 'tests') VL.test.leave();
    current = view;
    VIEWS.forEach(function (v) {
      var sec = document.getElementById('view-' + v);
      if (sec) sec.hidden = v !== view;
    });
    renderView();
    renderSidebar();
    renderTopStats();
    if (location.hash !== '#' + view) {
      try { history.replaceState(null, '', '#' + view); } catch (e) { location.hash = view; }
    }
    closeDrawer();
    var main = document.getElementById('main');
    if (main) main.scrollTop = 0;
    window.scrollTo(0, 0);
  }

  function renderView() {
    var host = document.getElementById('view-' + current);
    if (!host) return;
    if (current === 'dashboard') VL.views.dashboard(host);
    else if (current === 'words') VL.views.words(host);
    else if (current === 'cards') VL.cards.render(host);
    else if (current === 'reading') VL.reading.render(host);
    else if (current === 'tests') VL.test.render(host);
    else if (current === 'archive') VL.views.archive(host);
    else if (current === 'settings') VL.views.settings(host);
    else if (current === 'help') VL.views.help(host);
  }

  function refreshAll() {
    renderSidebar();
    renderTopStats();
    renderView();
  }

  /* ---------- 搜索 ---------- */

  function renderSearchResults(query) {
    var box = document.getElementById('searchResults');
    if (!box) return;
    if (!String(query).trim()) { box.hidden = true; U.mount(box, null); return; }
    var hits = VL.store.searchAll(query, 24);
    var dictHits = [];
    if (hits.length < 8) {
      var q = U.normTerm(query);
      dictHits = VL.dict.all().filter(function (e) {
        return e.key.indexOf(q) >= 0 || String(e.cn || '').indexOf(query.trim()) >= 0;
      }).slice(0, 8);
    }
    box.hidden = false;
    U.mount(box, []
      .concat(hits.map(function (h) {
        return el('button', {
          class: 'search-hit', type: 'button',
          onclick: function () {
            VL.store.setActiveBook(h.book.id);
            VL.views.wsState.query = h.word.term;
            VL.views.wsState.filter = 'all';
            VL.views.wsState.page = 1;
            box.hidden = true;
            go('words');
          }
        }, [
          el('b', { html: U.highlight(h.word.term, query) }),
          el('span', { class: 'text-muted', html: U.highlight(h.word.meaning || '', query) }),
          el('span', { class: 'hit-book', text: h.book.name + ' · ' + VL.srs.stageLabel(h.word.srs.level) })
        ]);
      }))
      .concat(hits.length ? [] : [el('div', { class: 'search-empty', text: '生词库里没有匹配的词。' })])
      .concat(dictHits.length ? [el('div', { class: 'search-empty', text: '内置词库中的候选（点击可加入当前生词库）：' })].concat(dictHits.map(function (e) {
        return el('button', {
          class: 'search-hit', type: 'button',
          onclick: function () {
            VL.store.addWord(VL.store.activeBookId(), {
              term: e.term, meaning: e.cn, pos: e.pos, phonetic: e.ipa, example: e.ex, exampleCn: e.exCn, tags: e.tags, source: 'dict'
            });
            box.hidden = true;
            refreshAll();
            U.toast('已把「' + e.term + '」加入「' + VL.store.activeBook().name + '」', 'ok');
          }
        }, [
          el('b', { html: U.highlight(e.term, query) }),
          el('span', { class: 'text-muted', html: U.highlight(e.cn, query) }),
          el('span', { class: 'hit-book', text: '内置词库 · 点击加入' })
        ]);
      })) : [])
    );
  }

  /* ---------- 抽屉（小屏） ---------- */

  function openDrawer() {
    document.body.classList.add('drawer-open');
    var scrim = document.getElementById('scrim');
    if (scrim) scrim.hidden = false;
    var btn = document.getElementById('drawerBtn');
    if (btn) btn.setAttribute('aria-expanded', 'true');
  }
  function closeDrawer() {
    document.body.classList.remove('drawer-open');
    var scrim = document.getElementById('scrim');
    if (scrim) scrim.hidden = true;
    var btn = document.getElementById('drawerBtn');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  /* ---------- 事件绑定 ---------- */

  function bind() {
    U.$$('.nav-item').forEach(function (n) {
      n.addEventListener('click', function () { go(n.getAttribute('data-view')); });
    });

    var addBook = document.getElementById('addBookBtn');
    if (addBook) addBook.addEventListener('click', function () { VL.views.newBookModal(); });

    var drawer = document.getElementById('drawerBtn');
    if (drawer) drawer.addEventListener('click', function () {
      if (document.body.classList.contains('drawer-open')) closeDrawer(); else openDrawer();
    });
    var scrim = document.getElementById('scrim');
    if (scrim) scrim.addEventListener('click', closeDrawer);

    var theme = document.getElementById('themeBtn');
    if (theme) theme.addEventListener('click', cycleTheme);

    var search = document.getElementById('globalSearch');
    var box = document.getElementById('searchResults');
    if (search) {
      search.addEventListener('input', U.debounce(function () { renderSearchResults(search.value); }, 180));
      search.addEventListener('focus', function () { if (search.value.trim()) renderSearchResults(search.value); });
      search.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          var first = box && box.querySelector('.search-hit');
          if (first) first.click();
        }
        if (e.key === 'Escape') { box.hidden = true; search.blur(); }
      });
    }
    document.addEventListener('click', function (e) {
      if (!box || box.hidden) return;
      if (e.target === search || box.contains(e.target)) return;
      box.hidden = true;
    });

    var quickExport = document.getElementById('quickExport');
    if (quickExport) quickExport.addEventListener('click', function (e) {
      e.preventDefault();
      U.download('VocabLab-备份-' + U.dayKey() + '.json', JSON.stringify(VL.store.exportAll(), null, 2), 'application/json');
    });

    window.addEventListener('hashchange', function () {
      var v = (location.hash || '').replace('#', '');
      if (v && v !== current && VIEWS.indexOf(v) >= 0) go(v);
    });

    document.addEventListener('keydown', function (e) {
      var tag = (e.target.tagName || '').toLowerCase();
      var typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;
      if (!typing && (e.key === '/' || (e.key === 'k' && (e.metaKey || e.ctrlKey)))) {
        e.preventDefault();
        if (search) search.focus();
        return;
      }
      if (!typing && /^[1-8]$/.test(e.key) && e.altKey) {
        e.preventDefault();
        go(VIEWS[Number(e.key) - 1]);
        return;
      }
      VL.cards.keyHandler(e);
    });

    if (window.matchMedia) {
      try {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
          if ((VL.store.settings().theme || 'auto') === 'auto') applyTheme();
        });
      } catch (err) { /* 老浏览器忽略 */ }
    }
  }

  /* ---------- 初始化 ---------- */

  function init() {
    VL.store.load();
    applyTheme();
    bind();
    var start = (location.hash || '').replace('#', '');
    if (VIEWS.indexOf(start) < 0) start = 'dashboard';
    go(start);

    // 提醒今天还有多少要复习
    var words = VL.store.allWords().filter(function (w) { return w.status !== 'archived'; });
    var due = VL.srs.dueList(words).length;
    if (due > 0) {
      setTimeout(function () { U.toast('今天有 ' + due + ' 个生词到了复习节点，点「卡片记忆」开始吧。', 'ok', 5000); }, 700);
    }
  }

  VL.app = {
    go: go,
    refreshAll: refreshAll,
    renderSidebar: renderSidebar,
    renderTopStats: renderTopStats,
    applyTheme: applyTheme,
    cycleTheme: cycleTheme,
    get current() { return current; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
