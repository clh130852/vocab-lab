/* cards.js — 卡片记忆（艾宾浩斯复习队列 + 翻卡 + 评分） */
(function () {
  'use strict';
  var VL = (window.VL = window.VL || {});
  var U = VL.util;
  var el = U.el;

  var MODES = [
    { id: 'due', label: '今日待复习', tip: '按艾宾浩斯节点到期的生词' },
    { id: 'new', label: '新词', tip: '还没学过的生词，受每日上限控制' },
    { id: 'all', label: '全部（含未到期）', tip: '按到期时间顺序过一遍' },
    { id: 'wrong', label: '易错强化', tip: '按错误次数从多到少' }
  ];

  var session = null;
  var host = null;

  /* ---------- 选词范围 ---------- */

  // 卡片来源：当前词库 / 全部词库 / 指定的某个词库 / 人教版或考纲词表（需先入库）
  function poolFor(sourceId) {
    if (!sourceId || sourceId === 'active') return VL.store.bookWords(VL.store.activeBookId());
    if (sourceId === 'allbooks') {
      var out = [];
      VL.store.books().forEach(function (b) {
        b.words.forEach(function (w) { w._bookId = b.id; out.push(w); });
      });
      return out;
    }
    var b = VL.store.getBook(sourceId);
    return b ? b.words : [];
  }

  function isBuiltinList(sourceId) {
    return !!sourceId && sourceId !== 'active' && sourceId !== 'allbooks' && !VL.store.getBook(sourceId);
  }

  function filterByStatus(list, status) {
    var l = (list || []).filter(function (w) { return w.status !== 'archived'; });
    if (status === 'due') return VL.srs.dueList(l);
    if (status === 'new') return VL.srs.newList(l);
    if (status === 'wrong') return l.filter(function (w) { return (w.srs.wrong || 0) + (w.srs.lapses || 0) > 0; });
    if (status === 'nmean') return l.filter(function (w) { return !w.meaning; });
    if (status === 'learned') return l.filter(function (w) { return w.srs.reps > 0; });
    return l;
  }

  function orderList(list, order) {
    var l = (list || []).slice();
    if (order === 'random') return U.shuffle(l);
    if (order === 'alpha') return l.sort(function (a, b) { return a.key < b.key ? -1 : (a.key > b.key ? 1 : 0); });
    if (order === 'recent') return l.sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    return l.sort(function (a, b) { return (a.srs.dueAt || 0) - (b.srs.dueAt || 0); });   // 到期优先
  }

  function buildRangeQueue(cfg) {
    var list = orderList(filterByStatus(poolFor(cfg.source), cfg.status), cfg.order);
    if (cfg.limit > 0) list = list.slice(0, cfg.limit);
    return list;
  }

  function buildQueue(bookId, mode) {
    var words = VL.store.bookWords(bookId).filter(function (w) { return w.status !== 'archived'; });
    if (mode === 'due') return filterByStatus(words, 'due');
    if (mode === 'new') {
      var limit = VL.store.settings().dailyNew || 20;
      var done = (VL.store.todayLog().learned || 0);
      var room = Math.max(0, limit - done);
      return VL.srs.newList(words).slice(0, room || limit);
    }
    if (mode === 'wrong') return filterByStatus(words, 'wrong');
    return orderList(words, 'due');
  }

  function startSession(bookId, mode, cfg) {
    var queue = cfg ? buildRangeQueue(cfg) : buildQueue(bookId, mode);
    if (!queue.length) { U.toast('这个范围里没有可以背的词', 'warn'); return; }
    session = {
      bookId: bookId || VL.store.activeBookId(), mode: mode, cfg: cfg || null,
      queue: queue, idx: 0,
      startAt: Date.now(),
      stats: { right: 0, wrong: 0, studied: 0, firstTime: 0 },
      details: [],
      relearn: {},
      flipped: false,
      exShown: false,
      exampleMode: (cfg && cfg.exampleMode) || VL.store.settings().cardExample || 'show'
    };
    renderSession();
  }

  function current() { return session && session.queue[session.idx]; }

  function nextCard() {
    if (!session) return;
    session.idx += 1;
    session.flipped = false;
    session.exShown = false;
    while (session.idx < session.queue.length) {
      var w = session.queue[session.idx];
      if (!w) { session.idx += 1; continue; }
      break;
    }
    renderSession();
    maybeAutoSpeak();
  }

  function maybeAutoSpeak() {
    var s = VL.store.settings();
    if (s.autoSpeak === false) return;
    var w = current();
    if (!w) return;
    if (s.reverse) U.speak(w.term); else U.speak(w.term);
  }

  function grade(key) {
    var w = current();
    if (!w) return;
    var before = w.srs.reps;
    var res = VL.srs.grade(w, key, { source: 'card' });
    VL.store.logStudy(before === 0 ? 'learned' : 'reviewed', 1);
    session.stats.studied += 1;
    if (before === 0) session.stats.firstTime += 1;
    if (key === 'forgot') session.stats.wrong += 1; else session.stats.right += 1;
    session.details.push({ wordId: w.id, term: w.term, grade: key, label: res.label });

    // 忘记或模糊的词，本轮内再出现一次（最多两次），强化记忆
    if (key === 'forgot' || key === 'hard') {
      var n = session.relearn[w.id] || 0;
      if (n < 2) {
        session.relearn[w.id] = n + 1;
        session.queue.push(w);
      }
    }

    if (res.mastered) {
      U.toast('「' + w.term + '」已走完艾宾浩斯全部节点，标记为已掌握', 'ok');
      if (VL.store.settings().autoArchive) { w.status = 'archived'; w.archivedAt = Date.now(); w.srs.level = VL.srs.MAX_LEVEL + 1; }
    }

    VL.store.save();
    renderTopStats();
    nextCard();
  }

  /* ---------- 渲染 ---------- */

  var rangeCfg = { source: 'active', status: 'all', limit: 20, order: 'due' };

  var RANGE_STATUS = [
    { v: 'all', l: '全部' }, { v: 'due', l: '待复习' }, { v: 'new', l: '没学过' },
    { v: 'wrong', l: '易错' }, { v: 'nmean', l: '缺释义' }, { v: 'learned', l: '学过的' }
  ];
  var RANGE_ORDER = [
    { v: 'due', l: '到期优先' }, { v: 'random', l: '随机' }, { v: 'alpha', l: '按字母' }, { v: 'recent', l: '最近添加' }
  ];
  var RANGE_LIMIT = [{ v: 10, l: '10 个' }, { v: 20, l: '20 个' }, { v: 30, l: '30 个' }, { v: 0, l: '全部' }];

  // 「自选范围」面板：选词表 + 状态 + 数量 + 顺序
  function customRangeUi(bookId) {
    function chipRow(list, key) {
      return el('div', { class: 'seg' }, list.map(function (o) {
        return el('button', {
          class: 'chip chip-btn' + (rangeCfg[key] === o.v ? ' is-on' : ''), type: 'button',
          onclick: function () { rangeCfg[key] = o.v; renderStart(); }
        }, o.l);
      }));
    }

    var sourceOptions = [
      el('option', { value: 'active', selected: rangeCfg.source === 'active' }, '当前词库：' + VL.store.activeBook().name),
      el('option', { value: 'allbooks', selected: rangeCfg.source === 'allbooks' }, '全部词库一起背（' + VL.store.allWords().length + ' 词）')
    ];
    if (VL.store.books().length > 1) {
      sourceOptions.push(el('optgroup', { label: '指定某个生词库' }, VL.store.books().map(function (b) {
        return el('option', { value: b.id, selected: rangeCfg.source === b.id }, b.name + '（' + b.words.length + ' 词）');
      })));
    }
    var gradeOptions = [];
    VL.wordlists.grouped().forEach(function (g) {
      g.sources.forEach(function (s) {
        gradeOptions.push(el('option', { value: s.id, selected: rangeCfg.source === s.id }, s.name + '（' + s.count + ' 词）'));
      });
    });
    sourceOptions.push(el('optgroup', { label: '人教版教材 / 考纲（会先加入当前词库）' }, gradeOptions));

    var builtin = isBuiltinList(rangeCfg.source);
    var count = builtin
      ? Math.min(VL.wordlists.pool(rangeCfg.source).length, rangeCfg.limit > 0 ? rangeCfg.limit : Infinity)
      : buildRangeQueue(rangeCfg).length;

    function start() {
      if (builtin) {
        var pool = VL.wordlists.pool(rangeCfg.source);
        if (rangeCfg.limit > 0) pool = pool.slice(0, rangeCfg.limit);
        if (!pool.length) { U.toast('这一册里没有词', 'warn'); return; }
        var r = VL.store.addWords(VL.store.activeBookId(), pool.map(function (e) {
          return { term: e.term, meaning: e.cn, pos: e.pos, phonetic: e.ipa, example: e.ex, exampleCn: e.exCn, tags: e.tags, source: 'dict' };
        }));
        VL.app.refreshAll();
        U.toast('已把 ' + r.added + ' 个新词加入「' + VL.store.activeBook().name + '」' + (r.skipped ? '，' + r.skipped + ' 个已收录' : '') + '，开始背诵', 'ok', 4000);
        var queue = r.words.length ? r.words : filterByStatus(poolFor('active'), 'all').filter(function (w) {
          return pool.some(function (e) { return U.normTerm(e.term) === w.key; });
        });
        startSessionWith(queue, VL.store.activeBookId());
        return;
      }
      var q = buildRangeQueue(rangeCfg);
      if (!q.length) { U.toast('这个范围里没有可以背的词', 'warn'); return; }
      startSession(bookId, 'custom', {
        source: rangeCfg.source, status: rangeCfg.status, limit: rangeCfg.limit, order: rangeCfg.order,
        exampleMode: VL.store.settings().cardExample
      });
    }

    return el('div', { class: 'stack', style: { gap: '10px' } }, [
      el('div', { class: 'row-wrap' }, [
        el('strong', { text: '自己选要背的词' }),
        el('span', { class: 'text-small text-muted', text: '想背哪一册、哪种状态、多少个，都由你定' })
      ]),
      el('div', { class: 'field-row' }, [
        el('div', { class: 'field' }, [
          el('label', { text: '词表' }),
          el('select', { class: 'select', onchange: function (e) { rangeCfg.source = e.target.value; renderStart(); } }, sourceOptions)
        ]),
        el('div', { class: 'field' }, [
          el('label', { text: '数量' }), chipRow(RANGE_LIMIT, 'limit')
        ])
      ]),
      el('div', { class: 'field' }, [el('label', { text: '状态' }), chipRow(RANGE_STATUS, 'status')]),
      el('div', { class: 'field' }, [el('label', { text: '顺序' }), chipRow(RANGE_ORDER, 'order')]),
      el('div', { class: 'row-wrap' }, [
        el('button', { class: 'btn btn-primary', type: 'button', disabled: count === 0, onclick: start },
          (builtin ? '加入生词库并开始背诵（' : '开始背诵（') + count + ' 个）'),
        count === 0 ? el('span', { class: 'text-small text-muted', text: '这个范围暂时没有词，换个条件试试' }) : null
      ])
    ]);
  }

  function startSessionWith(queue, bookId) {
    if (!queue || !queue.length) { U.toast('没有可以背的词', 'warn'); return; }
    session = {
      bookId: bookId || VL.store.activeBookId(), mode: 'custom', cfg: null,
      queue: queue, idx: 0, startAt: Date.now(),
      stats: { right: 0, wrong: 0, studied: 0, firstTime: 0 },
      details: [], relearn: {}, flipped: false, exShown: false,
      exampleMode: VL.store.settings().cardExample || 'show'
    };
    renderSession();
  }

  function renderTopStats() {
    var node = document.getElementById('cardSessionBar');
    if (!node || !session) return;
    var total = session.queue.length;
    var done = session.idx;
    var acc = session.stats.right + session.stats.wrong
      ? Math.round((session.stats.right / (session.stats.right + session.stats.wrong)) * 100) : 0;
    var mins = Math.round((Date.now() - session.startAt) / 60000);
    var dots = [];
    var maxDots = 60;
    for (var i = 0; i < Math.min(total, maxDots); i++) {
      dots.push(el('i', { class: i < done ? 'done' : (i === done ? 'now' : 'next') }));
    }
    U.mount(node, [
      el('div', { class: 'grow' }, [
        el('div', { class: 'row', style: { gap: '8px' } }, [
          el('strong', { class: 'tabular', text: done + ' / ' + total }),
          el('span', { class: 'text-small text-muted', text: '本张卡片已过 ' + mins + ' 分钟 · 正确率 ' + acc + '%' })
        ]),
        el('div', { class: 'bar-track', style: { marginTop: '6px' } }, [
          el('div', { class: 'bar-fill', style: { width: (total ? (done / total) * 100 : 0) + '%' } })
        ])
      ]),
      el('div', { class: 'queue-strip', 'aria-hidden': 'true' }, dots),
      exampleModeChips()
    ]);
  }

  // 例句：自动显示 / 点按钮才显示 / 关闭（按 E 也能切换显示）
  function exampleModeChips() {
    var modes = [{ v: 'show', l: '例句自动' }, { v: 'button', l: '点开例句' }, { v: 'off', l: '不看例句' }];
    return el('div', { class: 'seg' }, modes.map(function (m) {
      return el('button', {
        class: 'chip chip-btn' + ((session.exampleMode || 'show') === m.v ? ' is-on' : ''), type: 'button',
        onclick: function () {
          session.exampleMode = m.v;
          session.exShown = false;
          VL.store.setSettings({ cardExample: m.v });
          renderSession();
        }
      }, m.l);
    }));
  }

  function exampleControl(w, onFront) {
    if (!w.example && !w.exampleCn) return null;
    var mode = session.exampleMode || 'show';
    if (mode === 'off') return null;
    var show = mode === 'show' || session.exShown;
    if (!show) {
      return el('button', {
        class: 'btn btn-sm', type: 'button', title: '也可以按 E',
        onclick: function (e) { e.stopPropagation(); session.exShown = true; renderSession(); }
      }, onFront ? '看例句（提示）' : '看例句');
    }
    return el('div', { class: 'stack', style: { alignItems: 'center', gap: '2px' } }, [
      w.example ? el('div', { class: 'fc-ex', text: w.example }) : null,
      w.exampleCn ? el('div', { class: 'fc-ex-cn', text: w.exampleCn }) : null,
      el('div', { class: 'row', style: { gap: '6px', marginTop: '4px' } }, [
        el('button', {
          class: 'btn btn-sm', type: 'button',
          onclick: function (e) { e.stopPropagation(); U.speak(w.example || w.term); }
        }, '🔊 读例句'),
        mode === 'button' ? el('button', {
          class: 'btn btn-sm btn-ghost', type: 'button',
          onclick: function (e) { e.stopPropagation(); session.exShown = false; renderSession(); }
        }, '收起') : null
      ])
    ]);
  }

  function stageLadder(level) {
    var list = VL.srs.intervals();
    var items = [];
    for (var i = 1; i <= list.length; i++) {
      var on = level >= i;
      items.push(el('span', {
        class: 'chip' + (on ? ' chip-green' : ''),
        style: { opacity: on ? '1' : '.55', fontSize: '.7rem' },
        title: '第 ' + i + ' 个节点：' + U.fmtDuration(list[i - 1])
      }, U.fmtDuration(list[i - 1])));
    }
    return el('div', { class: 'fc-meta', style: { gap: '4px' } }, items);
  }

  function renderCard() {
    var w = current();
    var s = VL.store.settings();
    if (!w) return renderDone();
    var reversed = !!s.reverse;
    var front = reversed
      ? el('div', { class: 'fc-term', text: w.meaning || '（无释义）' })
      : el('div', { class: 'fc-term', text: w.term });

    var head = [
      front,
      reversed ? null : (w.phonetic ? el('div', { class: 'fc-phon', text: '/' + String(w.phonetic).replace(/^\/|\/$/g, '') + '/' }) : null),
      el('div', { class: 'fc-pos', text: (w.pos || '') + (w.tags && w.tags.length ? ' · ' + w.tags.map(function (t) { return VL.dict.TAG_LABELS[t] || t; }).slice(0, 3).join(' / ') : '') }),
      el('button', {
        class: 'btn btn-sm', type: 'button',
        onclick: function (e) { e.stopPropagation(); U.speak(w.term); }
      }, [el('span', { text: '🔊' }), ' 朗读'])
    ];

    if (!session.flipped) {
      return el('div', { class: 'card-stage' }, [
        el('div', {
          class: 'flip-card', role: 'button', tabindex: '0',
          'aria-label': '卡片正面，按空格或点击翻到背面',
          onclick: flip,
          onkeydown: function (e) { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); } }
        }, head.concat([
          exampleControl(w, true),
          el('div', { class: 'fc-hintline', text: '点击卡片或按 空格 查看释义' }),
          el('div', { class: 'fc-meta' }, [
            el('span', { class: 'pill pill-lv' + Math.min(10, w.srs.level), text: '当前节点：' + VL.srs.stageLabel(w.srs.level) }),
            w.srs.reps ? el('span', { class: 'chip', text: '已复习 ' + w.srs.reps + ' 次' }) : el('span', { class: 'chip chip-yellow', text: '第一次见' }),
            w.srs.wrong ? el('span', { class: 'chip chip-red', text: '错 ' + w.srs.wrong + ' 次' }) : null
          ])
        ]))
      ]);
    }

    var body = el('div', { class: 'stack', style: { alignItems: 'center', gap: '8px' } }, [
      el('div', { class: 'fc-mean', text: reversed ? w.term : (w.meaning || '（还没有释义，点“生词库”补充）') }),
      reversed && w.phonetic ? el('div', { class: 'fc-phon', text: '/' + w.phonetic + '/' }) : null,
      exampleControl(w, false),
      w.note ? el('div', { class: 'fc-ex-cn', text: '备注：' + w.note }) : null,
      el('hr', { style: { width: '100%', margin: '8px 0' } }),
      el('div', { class: 'text-small text-muted', text: '艾宾浩斯复习节点（已点亮的表示已完成）' }),
      stageLadder(w.srs.level),
      el('div', { class: 'text-small text-muted', text: w.srs.reps ? '上次复习：' + U.fmtDateTime(w.srs.lastAt) : '还没有复习记录' }),
      el('button', {
        class: 'btn btn-sm', type: 'button', title: '记到一半发现释义不对？马上改',
        onclick: function (e) {
          e.stopPropagation();
          var target = w;
          VL.views.editMeaningModal(target, target._bookId || session.bookId).then(function () { renderSession(); });
        }
      }, '✎ 修改释义')
    ]);

    return el('div', { class: 'card-stage' }, [
      el('div', {
        class: 'flip-card back', role: 'button', tabindex: '0',
        'aria-label': '卡片背面，按空格返回正面',
        onclick: flip,
        onkeydown: function (e) { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); } }
      }, [front].concat([el('hr', { style: { width: '100%', margin: '4px 0' } })], [body])),
      el('div', { class: 'text-small text-muted', text: '按 空格 翻回正面 · 按 1-4 直接评分 · 按 E 看例句' }),
      renderGradeRow()
    ]);
  }

  function renderGradeRow() {
    var w = current();
    var list = VL.srs.intervals();
    function nextLabel(key) {
      var lv = w.srs.level, to;
      if (key === 'forgot') return '约 1 分钟后重来';
      if (key === 'hard') { to = Math.max(0, lv - 1); return '约 ' + U.fmtDuration(Math.max(60000, (to > 0 ? list[to - 1] : 60000) / 2)) + '后再现'; }
      if (key === 'good') to = lv + 1;
      else to = lv + 2;
      if (to > VL.srs.MAX_LEVEL) return '完成全部节点';
      return U.fmtDuration(list[to - 1]) + '后再现';
    }
    var defs = [
      { key: 'forgot', label: '忘记', cls: 'g-forgot', kbd: '1' },
      { key: 'hard', label: '模糊', cls: 'g-hard', kbd: '2' },
      { key: 'good', label: '认识', cls: 'g-good', kbd: '3' },
      { key: 'easy', label: '太简单', cls: 'g-easy', kbd: '4' }
    ];
    return el('div', { class: 'grade-row' }, defs.map(function (d) {
      return el('button', {
        class: 'btn grade-btn ' + d.cls, type: 'button',
        onclick: function () { grade(d.key); }
      }, [
        el('span', { text: d.label + '（' + d.kbd + '）' }),
        el('small', { text: nextLabel(d.key) })
      ]);
    }));
  }

  function flip() {
    session.flipped = !session.flipped;
    renderSession();
    if (session.flipped) {
      var w = current();
      if (w && VL.store.settings().autoSpeak !== false) U.speak(w.term);
    }
  }

  function renderDone() {
    var s = session.stats;
    var mins = Math.max(1, Math.round((Date.now() - session.startAt) / 60000));
    var acc = (s.right + s.wrong) ? Math.round((s.right / (s.right + s.wrong)) * 100) : 0;
    var w = VL.store.bookWords(session.bookId);
    var due = VL.srs.dueList(w.filter(function (x) { return x.status !== 'archived'; })).length;
    var upcoming = VL.srs.nextDueAt(w);

    return el('div', { class: 'done-panel card' }, [
      el('div', { class: 'big', text: '🎉 ' + (session.queue.length ? '本轮完成' : '暂时没有卡片') }),
      el('p', { class: 'text-muted', text: session.queue.length ? '继续加油，记忆就是这样一点点变牢的。' : '换个模式，或者先去生词库添加一些生词。' }),
      el('div', { class: 'grid grid-3', style: { marginTop: '14px' } }, [
        statBox('复习卡片', s.studied, '其中首次学习 ' + s.firstTime + ' 个'),
        statBox('正确率', acc + '%', '认识 ' + s.right + ' · 忘记 ' + s.wrong),
        statBox('用时', mins + ' 分钟', '平均 ' + (s.studied ? Math.round(mins * 60 / s.studied) : 0) + ' 秒/张')
      ]),
      el('p', { class: 'text-small text-muted mt', text: due ? '还有 ' + due + ' 个生词已到期，可以再练一轮。' : (upcoming ? '下一个到期生词：' + U.fmtWhen(upcoming) : '所有生词都在计划中。') }),
      el('div', { class: 'row-wrap', style: { justifyContent: 'center', marginTop: '12px' } }, [
        el('button', { class: 'btn btn-primary', type: 'button', onclick: function () { session = null; render(); } }, '再练一轮'),
        el('button', { class: 'btn', type: 'button', onclick: function () { VL.app.go('tests'); } }, '去生词检测'),
        el('button', { class: 'btn btn-ghost', type: 'button', onclick: function () { VL.app.go('dashboard'); } }, '返回总览')
      ])
    ]);
  }

  function statBox(label, value, sub) {
    return el('div', { class: 'stat' }, [
      el('div', { class: 'stat-label', text: label }),
      el('div', { class: 'stat-value', text: value }),
      el('div', { class: 'stat-sub', text: sub })
    ]);
  }

  function renderSession() {
    if (!host) return;
    if (!session) {
      renderStart();
      return;
    }
    var node = document.getElementById('cardBody');
    if (!node || !host.contains(node)) {
      var mode = MODES.filter(function (m) { return m.id === session.mode; })[0] || MODES[0];
      U.mount(host, [
        el('div', { class: 'view-head' }, [
          el('div', null, [
            el('h1', { id: 'v-cards', text: '卡片记忆' }),
            el('div', { class: 'view-sub', text: (VL.store.activeBook() || {}).name + ' · ' + mode.label })
          ]),
          el('div', { class: 'spacer' }),
          el('button', {
            class: 'btn', type: 'button',
            onclick: function () { session = null; render(); }
          }, '结束本轮'),
          el('button', {
            class: 'btn btn-ghost', type: 'button', onclick: function () { VL.app.go('words'); }
          }, '管理生词')
        ]),
        el('div', { class: 'card card-pad-sm mb' }, [el('div', { id: 'cardSessionBar', class: 'session-bar' })]),
        el('div', { id: 'cardBody' })
      ]);
      node = document.getElementById('cardBody');
    }
    var body = session.idx >= session.queue.length ? renderDone() : renderCard();
    U.mount(node, body);
    renderTopStats();
  }

  function renderStart() {
    var bookId = VL.store.activeBookId();
    var words = VL.store.bookWords(bookId).filter(function (w) { return w.status !== 'archived'; });
    var due = VL.srs.dueList(words).length;
    var news = VL.srs.newList(words).length;
    var wrong = words.filter(function (w) { return (w.srs.wrong || 0) + (w.srs.lapses || 0) > 0; }).length;
    var next = VL.srs.nextDueAt(words);

    var panel = el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [
        el('h3', { text: '开始一轮卡片记忆' }),
        el('span', { class: 'card-note', text: VL.store.activeBook().name })
      ]),
      el('div', { class: 'grid grid-4' }, [
        statBox('已到期', due, '按艾宾浩斯节点需要复习'),
        statBox('新词', news, '还没学过'),
        statBox('易错词', wrong, '曾经答错或忘记'),
        statBox('总数', words.length, next ? '最近到期：' + U.fmtWhen(next) : '暂无排期')
      ]),
      el('hr'),
      el('div', { class: 'text-small text-2 mb', text: '选择模式开始：' }),
      el('div', { class: 'row-wrap' }, MODES.map(function (m) {
        var count = buildQueue(bookId, m.id).length;
        return el('button', {
          class: 'btn ' + (m.id === 'due' && count ? 'btn-primary' : ''), type: 'button',
          disabled: count === 0,
          onclick: function () { startSession(bookId, m.id); }
        }, [m.label, el('span', { class: 'text-small', style: { opacity: '.8' }, text: '(' + count + ')' })]);
      })),
      el('p', { class: 'text-small text-muted mt', text: MODES.map(function (m) { return m.label + '：' + m.tip; }).join('；') }),
      el('hr'),
      customRangeUi(bookId),
      el('div', { class: 'callout mt' }, [
        el('strong', { text: '复习节奏：' }),
        el('span', { text: '每答对一次，这个生词就进入下一个复习节点（默认 ' + VL.srs.intervals().map(function (ms) { return U.fmtDuration(ms); }).join(' → ') + '）。答错会回到起点重新开始。' })
      ])
    ]);

    U.mount(host, [
      el('div', { class: 'view-head' }, [
        el('div', null, [el('h1', { id: 'v-cards', text: '卡片记忆' }),
          el('div', { class: 'view-sub', text: '翻卡记忆 + 艾宾浩斯自动排期，到期就会自动出现在这里。' })]),
        el('div', { class: 'spacer' }),
        el('label', { class: 'switch' }, [
          el('input', { type: 'checkbox', class: 'input', checked: !!VL.store.settings().reverse,
            onchange: function (e) { VL.store.setSettings({ reverse: e.target.checked }); renderStart(); } }),
          el('span', { class: 'text-small', text: '反向卡片（看中文想英文）' })
        ])
      ]),
      panel
    ]);
  }

  function render() {
    session = null;
    renderStart();
  }

  function keyHandler(e) {
    if (!session || session.idx >= session.queue.length) return;
    if (host && !document.body.contains(host)) return;
    var view = document.getElementById('view-cards');
    if (!view || view.hidden) return;
    if (/^(input|textarea|select)$/i.test(e.target.tagName)) return;
    if (document.getElementById('modalHost') && !document.getElementById('modalHost').hidden) return;
    if (e.key === ' ') { e.preventDefault(); flip(); return; }
    if (e.key === 'Enter') { e.preventDefault(); flip(); return; }
    if (!session.flipped) return;
    if (e.key === '1') { e.preventDefault(); grade('forgot'); }
    if (e.key === '2') { e.preventDefault(); grade('hard'); }
    if (e.key === '3') { e.preventDefault(); grade('good'); }
    if (e.key === '4') { e.preventDefault(); grade('easy'); }
    if (e.key === 's' || e.key === 'S') { var w = current(); if (w) U.speak(w.term); }
    if (e.key === 'e' || e.key === 'E') {
      if (session.exampleMode !== 'off') { session.exShown = !session.exShown; renderSession(); }
    }
  }

  VL.cards = {
    render: function (container) {
      host = container;
      if (session) renderSession(); else renderStart();
    },
    leave: function () { session = null; },
    keyHandler: keyHandler,
    startSession: startSession,
    buildQueue: buildQueue
  };
})();
