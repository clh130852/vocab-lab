/* views.js — 总览 / 生词库 / 归档 / 设置 / 说明 */
(function () {
  'use strict';
  var VL = (window.VL = window.VL || {});
  var U = VL.util;
  var el = U.el;

  /* ---------- 小图表 ---------- */

  function svgEl(tag, attrs) {
    var n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  }

  function barChart(items, opts) {
    var o = opts || {};
    var w = o.width || 560, h = o.height || 170;
    var padL = 30, padB = 26, padT = 14, padR = 10;
    var max = Math.max(1, Math.max.apply(null, items.map(function (i) { return i.value; })));
    var bw = (w - padL - padR) / items.length;
    var svg = svgEl('svg', { class: 'chart', viewBox: '0 0 ' + w + ' ' + h, role: 'img', 'aria-label': o.label || '柱状图' });
    for (var g = 0; g <= 2; g++) {
      var y = padT + (h - padT - padB) * (g / 2);
      svg.appendChild(svgEl('line', { class: 'grid-line', x1: padL, x2: w - padR, y1: y, y2: y }));
      var lab = svgEl('text', { x: 4, y: y + 3 });
      lab.textContent = Math.round(max * (1 - g / 2));
      svg.appendChild(lab);
    }
    items.forEach(function (it, i) {
      var bh = Math.max(2, ((h - padT - padB) * it.value) / max);
      var x = padL + i * bw + bw * 0.18;
      var y2 = h - padB - bh;
      svg.appendChild(svgEl('rect', {
        class: 'bar' + (it.alt ? ' alt' : '') + (it.value === 0 ? ' dim' : ''),
        x: x, y: y2, width: Math.max(4, bw * 0.64), height: bh, rx: 3
      }));
      var v = svgEl('text', { class: 'val', x: x + Math.max(4, bw * 0.64) / 2, y: y2 - 4, 'text-anchor': 'middle' });
      v.textContent = it.value;
      if (it.value) svg.appendChild(v);
      var t = svgEl('text', { x: x + Math.max(4, bw * 0.64) / 2, y: h - 8, 'text-anchor': 'middle' });
      t.textContent = it.label;
      svg.appendChild(t);
    });
    return svg;
  }

  function ring(pct, caption) {
    var r = 34, c = 2 * Math.PI * r;
    var svg = svgEl('svg', { width: 88, height: 88, viewBox: '0 0 88 88', role: 'img', 'aria-label': caption + ' ' + pct + '%' });
    svg.appendChild(svgEl('circle', { cx: 44, cy: 44, r: r, fill: 'none', stroke: 'var(--surface-3)', 'stroke-width': 9 }));
    svg.appendChild(svgEl('circle', {
      cx: 44, cy: 44, r: r, fill: 'none', stroke: 'var(--primary)', 'stroke-width': 9,
      'stroke-dasharray': c, 'stroke-dashoffset': c * (1 - pct / 100), 'stroke-linecap': 'round'
    }));
    return el('div', { class: 'ring' }, [svg, el('div', { class: 'ring-mid', text: pct + '%' })]);
  }

  function strengthBars(buckets) {
    var total = Object.keys(buckets).reduce(function (s, k) { return s + buckets[k]; }, 0) || 1;
    var order = ['weak', 'mid', 'good', 'strong', 'mastered'];
    return el('div', { class: 'stack', style: { gap: '9px' } }, order.map(function (k) {
      var n = buckets[k] || 0;
      return el('div', null, [
        el('div', { class: 'row text-small' }, [
          el('span', { class: 'grow', text: VL.srs.STRENGTH_LABEL[k] }),
          el('span', { class: 'tabular text-muted', text: n + ' 个' })
        ]),
        el('div', { class: 'bar-track', style: { marginTop: '3px' } }, [
          el('div', {
            class: 'bar-fill ' + (k === 'weak' ? 'accent' : k === 'mastered' ? 'green' : k === 'good' || k === 'strong' ? 'blue' : ''),
            style: { width: (n / total) * 100 + '%' }
          })
        ])
      ]);
    }));
  }

  function statCard(label, value, sub) {
    return el('div', { class: 'stat' }, [
      el('div', { class: 'stat-label', text: label }),
      el('div', { class: 'stat-value', text: value }),
      el('div', { class: 'stat-sub', text: sub || '' })
    ]);
  }

  /* ---------- 总览 ---------- */

  function dashboard(host) {
    var book = VL.store.activeBook();
    var words = VL.store.bookWords(book.id).filter(function (w) { return w.status !== 'archived'; });
    var due = VL.srs.dueList(words);
    var news = VL.srs.newList(words);
    var mastery = VL.srs.mastery(words);
    var forecast = VL.srs.forecast(words, 7);
    var buckets = VL.srs.levelBuckets(words);
    var log = VL.store.todayLog();
    var streak = VL.store.streak;
    var settings = VL.store.settings();
    var newToday = Math.max(0, (settings.dailyNew || 20) - (log.learned || 0));
    var nextAt = VL.srs.nextDueAt(words);
    var lastTests = (book.tests || []).slice(0, 3);
    var lastArticles = (book.articles || []).slice(0, 3);

    var hero = el('div', { class: 'hero' }, [
      el('div', { class: 'hero-main' }, [
        el('h2', { text: '今天该做的事已经算好了' }),
        el('p', { class: 'text-2', text: '「' + book.name + '」里有 ' + due.length + ' 个生词到了复习节点，还能学 ' + newToday + ' 个新词。' + (nextAt ? ' 下一个到期：' + U.fmtWhen(nextAt) + '。' : '') }),
        el('div', { class: 'hero-actions' }, [
          el('button', { class: 'btn btn-primary', type: 'button', onclick: function () { VL.app.go('cards'); } }, due.length ? '开始复习（' + due.length + '）' : '开始卡片记忆'),
          el('button', { class: 'btn', type: 'button', onclick: function () { VL.app.go('words'); } }, '录入生词'),
          el('button', { class: 'btn', type: 'button', onclick: function () { VL.app.go('reading'); } }, '生成文章 + 阅读题'),
          el('button', { class: 'btn', type: 'button', onclick: function () { VL.app.go('tests'); } }, '生词检测')
        ])
      ]),
      el('div', { class: 'hero-ring' }, [
        ring(mastery.rate, '掌握度'),
        el('div', { class: 'text-small text-2' }, [
          el('div', { text: '已掌握 ' + mastery.mastered + ' / ' + mastery.total }),
          el('div', { class: 'text-muted', text: '连续学习 ' + (streak.current || 0) + ' 天（最长 ' + (streak.best || 0) + ' 天）' })
        ])
      ])
    ]);

    var stats = el('div', { class: 'grid grid-4 mt' }, [
      statCard('生词总数', words.length, '本词库共 ' + VL.store.bookWords(book.id).length + ' 条记录'),
      statCard('现在待复习', due.length, '按艾宾浩斯节点到期'),
      statCard('今日已复习', log.reviewed || 0, '新学 ' + (log.learned || 0) + ' 个新词'),
      statCard('已掌握', mastery.mastered, '走完全部复习节点')
    ]);

    var forecastCard = el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [
        el('h3', { text: '未来 7 天复习量' }),
        el('span', { class: 'card-note', text: forecast.overdue ? '含 ' + forecast.overdue + ' 个已逾期' : '逾期 0 个' })
      ]),
      barChart(forecast.days.map(function (d) { return { label: d.short, value: d.count, alt: false }; }), { label: '未来 7 天每天需要复习的生词数量' }),
      el('div', { class: 'text-small text-muted', text: '这是按当前记忆阶段自动排出来的复习计划，答对一次就往后推一个节点。' })
    ]);

    var strengthCard = el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [el('h3', { text: '记忆强度分布' })]),
      strengthBars(buckets)
    ]);

    var heat = VL.store.heatmap(91);
    var heatCard = el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [
        el('h3', { text: '最近 13 周学习记录' }),
        el('span', { class: 'card-note', text: '颜色越深，当天复习/检测越多' })
      ]),
      el('div', { class: 'heat' }, heat.map(function (d) {
        return el('i', { class: d.level ? 'l' + d.level : '', title: d.key + '：' + d.count + ' 次' });
      })),
      el('div', { class: 'row-wrap mt text-small text-muted' }, [
        el('span', { text: '连续 ' + (streak.current || 0) + ' 天' }),
        el('span', { text: '·' }),
        el('span', { text: '最长 ' + (streak.best || 0) + ' 天' })
      ])
    ]);

    var tasks = el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [el('h3', { text: '各个生词库的待办' }), el('span', { class: 'card-note', text: '点一下切换过去' })]),
      el('div', { class: 'task-list' }, VL.store.books().map(function (b) {
        var ws2 = b.words.filter(function (w) { return w.status !== 'archived'; });
        var d = VL.srs.dueList(ws2).length;
        var nw = VL.srs.newList(ws2).length;
        return el('div', { class: 'task' }, [
          el('div', { class: 'task-num', style: { color: d ? 'var(--accent)' : 'var(--text-3)' }, text: String(d) }),
          el('div', { class: 'task-body' }, [
            el('div', { class: 'task-title', text: b.name }),
            el('div', { class: 'task-sub', text: ws2.length + ' 个生词 · ' + nw + ' 个新词 · ' + VL.srs.mastery(ws2).rate + '% 已掌握' })
          ]),
          el('button', {
            class: 'btn btn-sm' + (b.id === book.id ? ' btn-primary' : ''), type: 'button',
            onclick: function () { VL.store.setActiveBook(b.id); VL.app.go('cards'); }
          }, b.id === book.id ? '复习' : '切换并复习')
        ]);
      }))
    ]);

    var recent = el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [el('h3', { text: '最近记录' })]),
      el('div', { class: 'stack', style: { gap: '10px' } }, [
        lastTests.length ? el('div', null, [
          el('div', { class: 'label mb', text: '检测' }),
          el('ul', { class: 'list-plain' }, lastTests.map(function (t) {
            var rate = t.total ? Math.round((t.correct / t.total) * 100) : 0;
            return el('li', { class: 'row' }, [
              el('span', { class: 'grow', text: U.fmtDateTime(t.at) }),
              el('span', { class: 'chip', text: rate + '%' })
            ]);
          }))
        ]) : el('p', { class: 'text-small text-muted', text: '还没有检测记录。' }),
        lastArticles.length ? el('div', null, [
          el('div', { class: 'label mb', text: '生成的文章' }),
          el('ul', { class: 'list-plain' }, lastArticles.map(function (a) {
            return el('li', { class: 'row' }, [
              el('span', { class: 'grow ellipsis', text: a.title }),
              el('span', { class: 'chip', text: (a.mode === 'ai' ? 'AI' : '本地') })
            ]);
          }))
        ]) : null
      ])
    ]);

    U.mount(host, [
      el('div', { class: 'view-head' }, [
        el('div', null, [
          el('h1', { id: 'v-dashboard', text: '总览' }),
          el('div', { class: 'view-sub', text: '今天是 ' + U.fmtDate(Date.now()) + ' · 数据保存在本机浏览器' })
        ])
      ]),
      hero, stats,
      el('div', { class: 'grid grid-2 mt' }, [forecastCard, strengthCard]),
      el('div', { class: 'grid grid-2 mt' }, [tasks, heatCard]),
      el('div', { class: 'grid grid-2 mt' }, [
        recent,
        el('div', { class: 'card' }, [
          el('div', { class: 'card-head' }, [el('h3', { text: '下一步建议' })]),
          el('ul', { class: 'list-plain' }, [
            el('li', { text: due.length ? '① 先清掉 ' + due.length + ' 个到期的生词 —— 复习优先，比学新词更重要。' : '① 今天没有到期生词，可以学几个新词。' }),
            el('li', { text: '② 学完一轮后做一次「生词检测」，错题会自动回到复习计划里。' }),
            el('li', { text: '③ 想练阅读，用「文章阅读」把刚学的词编进文章，在语境里再记一次。' }),
            el('li', { text: log.reviewed ? '④ 今天已经复习 ' + log.reviewed + ' 次，保持节奏就好。' : '④ 每天 10 分钟，连续几天就能看到曲线变平的效果。' })
          ])
        ])
      ])
    ]);
  }

  /* ---------- 生词库 ---------- */

  var ws = { query: '', filter: 'all', sort: 'recent', page: 1, selected: {}, pageSize: 50 };

  function filteredWords(book) {
    var list = VL.store.bookWords(book.id).slice();
    var q = U.normTerm(ws.query);
    if (q) {
      list = list.filter(function (w) {
        return w.key.indexOf(q) >= 0 || String(w.meaning || '').indexOf(ws.query.trim()) >= 0 || String(w.note || '').indexOf(ws.query.trim()) >= 0;
      });
    }
    if (ws.filter === 'learning') list = list.filter(function (w) { return w.status === 'learning'; });
    else if (ws.filter === 'due') list = VL.srs.dueList(list);
    else if (ws.filter === 'mastered') list = list.filter(function (w) { return w.status === 'mastered'; });
    else if (ws.filter === 'archived') list = list.filter(function (w) { return w.status === 'archived'; });
    else if (ws.filter === 'new') list = VL.srs.newList(list);
    else if (ws.filter === 'wrong') list = list.filter(function (w) { return (w.srs.wrong || 0) + (w.srs.lapses || 0) > 0; });
    else if (ws.filter === 'nmean') list = list.filter(function (w) { return !w.meaning; });

    var sorters = {
      recent: function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); },
      alpha: function (a, b) { return a.key < b.key ? -1 : a.key > b.key ? 1 : 0; },
      due: function (a, b) { return (a.srs.dueAt || 0) - (b.srs.dueAt || 0); },
      level: function (a, b) { return (b.srs.level || 0) - (a.srs.level || 0); },
      wrong: function (a, b) { return ((b.srs.wrong || 0) + (b.srs.lapses || 0)) - ((a.srs.wrong || 0) + (a.srs.lapses || 0)); }
    };
    list.sort(sorters[ws.sort] || sorters.recent);
    return list;
  }

  function wordsView(host) {
    var book = VL.store.activeBook();
    var all = VL.store.bookWords(book.id);
    var list = filteredWords(book);
    var pages = Math.max(1, Math.ceil(list.length / ws.pageSize));
    if (ws.page > pages) ws.page = pages;
    var pageList = list.slice((ws.page - 1) * ws.pageSize, ws.page * ws.pageSize);
    var selCount = Object.keys(ws.selected).filter(function (k) { return ws.selected[k]; }).length;
    var noMeaning = all.filter(function (w) { return !w.meaning; }).length;

    var FILTERS = [
      { id: 'all', label: '全部' }, { id: 'learning', label: '学习中' }, { id: 'due', label: '待复习' },
      { id: 'new', label: '没学过' }, { id: 'wrong', label: '易错' }, { id: 'nmean', label: '缺释义' },
      { id: 'mastered', label: '已掌握' }, { id: 'archived', label: '已归档' }
    ];
    var SORTS = [
      { id: 'recent', label: '最近添加' }, { id: 'alpha', label: '字母顺序' },
      { id: 'due', label: '下次复习' }, { id: 'level', label: '记忆阶段' }, { id: 'wrong', label: '错误次数' }
    ];

    var toolbar = el('div', { class: 'toolbar' }, [
      el('input', {
        class: 'input', type: 'search', placeholder: '在这一词库里搜索…', value: ws.query, style: { maxWidth: '220px' },
        oninput: function (e) { ws.query = e.target.value; ws.page = 1; refresh(); }
      }),
      el('div', { class: 'seg' }, FILTERS.map(function (f) {
        return el('button', {
          class: 'chip chip-btn' + (ws.filter === f.id ? ' is-on' : ''), type: 'button',
          onclick: function () { ws.filter = f.id; ws.page = 1; ws.selected = {}; refresh(); }
        }, f.id === 'nmean' && noMeaning ? f.label + '（' + noMeaning + '）' : f.label);
      })),
      el('div', { class: 'spacer' }),
      el('select', {
        class: 'select', style: { width: 'auto' }, onchange: function (e) { ws.sort = e.target.value; refresh(); }
      }, SORTS.map(function (s) { return el('option', { value: s.id, selected: ws.sort === s.id }, s.label); })),
      el('button', { class: 'btn btn-primary', type: 'button', onclick: function () { addChooser(book.id); } }, '＋ 添加生词'),
      el('button', { class: 'btn', type: 'button', onclick: function () { importChooser(book.id); } }, '📚 导入词表'),
      noMeaning ? el('button', { class: 'btn', type: 'button', onclick: function () { fillMissingMeanings(book.id, refresh); } }, '补全 ' + noMeaning + ' 个释义') : null
    ]);

    var bulk = selCount ? el('div', { class: 'bulk-bar' }, [
      el('strong', { text: '已勾选 ' + selCount + ' 个生词' }),
      el('button', { class: 'btn btn-sm', type: 'button', onclick: function () { bulkAction('archive'); } }, '归档这些'),
      el('button', { class: 'btn btn-sm', type: 'button', onclick: function () { bulkAction('restore'); } }, '取消归档'),
      el('button', { class: 'btn btn-sm', type: 'button', onclick: function () { bulkAction('move'); } }, '移到其他词库'),
      el('button', {
        class: 'btn btn-sm btn-primary', type: 'button',
        onclick: function () {
          var picked = Object.keys(ws.selected).filter(function (k) { return ws.selected[k]; });
          var terms = picked.map(function (id) {
            var w = VL.store.findWordById(id, book.id);
            return w ? w.term : null;
          }).filter(Boolean);
          if (!terms.length) return;
          VL.reading.setOnlyWords(terms);
          VL.app.go('reading');
          U.toast('已带着勾选的 ' + terms.length + ' 个词进入「文章阅读」，点「本地生成」就行', 'ok', 5200);
        }
      }, '📖 用勾选的词生成文章'),
      el('button', { class: 'btn btn-sm btn-danger', type: 'button', onclick: function () { bulkAction('delete'); } }, '删除勾选的 ' + selCount + ' 个'),
      el('div', { class: 'spacer' }),
      el('button', { class: 'btn btn-sm btn-ghost', type: 'button', onclick: function () { ws.selected = {}; refresh(); } }, '取消勾选（只是取消选择，不删词）')
    ]) : null;

    var headRow = el('tr', null, [
      el('th', { class: 'sel' }, [el('input', {
        type: 'checkbox', checked: pageList.length > 0 && pageList.every(function (w) { return ws.selected[w.id]; }),
        onchange: function (e) {
          pageList.forEach(function (w) { ws.selected[w.id] = e.target.checked; });
          refresh();
        }
      })]),
      el('th', { text: '单词' }),
      el('th', { text: '释义（点一下就能改）' }),
      el('th', { text: '记忆阶段' }),
      el('th', { text: '下次复习' }),
      el('th', { class: 'num', text: '对/错' }),
      el('th', { class: 'act', text: '操作' })
    ]);

    var rows = pageList.map(function (w) {
      var pill = w.status === 'mastered' ? 'pill-mastered' : (w.status === 'archived' ? '' : 'pill-lv' + Math.min(10, w.srs.level));
      return el('tr', null, [
        el('td', { class: 'sel' }, [el('div', { class: 'sel-box' }, [el('input', {
          type: 'checkbox', checked: !!ws.selected[w.id],
          onchange: function (e) { ws.selected[w.id] = e.target.checked; refresh(); }
        })])]),
        el('td', null, [
          el('div', { class: 'term' }, [w.term]),
          el('div', { class: 'phon', text: (w.phonetic ? '/' + w.phonetic + '/' : '') + (w.pos ? ' ' + w.pos : '') })
        ]),
        el('td', { class: 'mean-cell' }, [
          el('div', {
            class: 'mean mean-editable' + (w.meaning ? '' : ' miss'),
            role: 'button', tabindex: '0', title: '点击可以直接改释义',
            onclick: function (e) { startMeaningEdit(e.currentTarget.parentElement, w, book.id, refresh); },
            onkeydown: function (e) {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startMeaningEdit(e.currentTarget.parentElement, w, book.id, refresh); }
            }
          }, [
            el('span', { text: w.meaning || '（点这里写释义）' }),
            el('span', { class: 'pencil', 'aria-hidden': 'true', text: '✎' })
          ]),
          w.example ? el('div', { class: 'ex', text: w.example }) : null
        ]),
        el('td', null, [
          el('span', { class: 'pill ' + pill, text: w.status === 'archived' ? '已归档' : (w.status === 'mastered' ? '已掌握' : VL.srs.stageLabel(w.srs.level)) }),
          el('div', { class: 'text-small text-muted', style: { marginTop: '3px' }, text: '复习 ' + w.srs.reps + ' 次' })
        ]),
        el('td', { class: 'nowrap' }, [
          w.status === 'mastered' ? el('span', { class: 'text-small text-muted', text: '已完成' })
            : el('span', { class: VL.srs.isDue(w) ? 'text-red' : 'text-small text-muted', text: VL.srs.isDue(w) ? '现在' : U.fmtWhen(w.srs.dueAt) })
        ]),
        el('td', { class: 'num', text: (w.srs.right || 0) + ' / ' + (w.srs.wrong || 0) }),
        el('td', { class: 'act' }, [
          el('button', { class: 'btn btn-sm btn-ghost', type: 'button', title: '朗读', onclick: function () { U.speak(w.term); } }, '🔊'),
          el('button', { class: 'btn btn-sm btn-ghost', type: 'button', title: '编辑', onclick: function () { editWordModal(w, book.id); } }, '编辑'),
          w.status === 'archived'
            ? el('button', { class: 'btn btn-sm btn-ghost', type: 'button', title: '取消归档', onclick: function () { VL.store.restoreWord(w.id, book.id); refresh(); U.toast('已恢复到学习中', 'ok'); } }, '恢复')
            : el('button', { class: 'btn btn-sm btn-ghost', type: 'button', title: '归档', onclick: function () { VL.store.archiveWord(w.id, book.id); refresh(); U.toast('已归档，可在「归档」页找回', 'ok'); } }, '归档'),
          el('button', { class: 'btn btn-sm btn-ghost text-red', type: 'button', title: '删除', onclick: function () { removeOne(w, book.id); } }, '删除')
        ])
      ]);
    });

    var table = el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [
        el('h3', { text: book.name }),
        el('span', { class: 'card-note', text: '共 ' + all.length + ' 个生词 · 当前筛选 ' + list.length + ' 个' + (noMeaning ? ' · ' + noMeaning + ' 个缺释义' : '') }),
        el('div', { class: 'spacer' }),
        el('button', { class: 'btn btn-sm btn-danger', type: 'button', onclick: function () { clearBook(book, all); } }, '🗑 一键清空这个词库')
      ]),
      list.length ? el('div', { class: 'table-wrap' }, [
        el('table', { class: 'tbl word-table' }, [
          el('thead', null, [headRow]),
          el('tbody', null, rows)
        ])
      ]) : el('div', { class: 'empty' }, [
        el('h3', { text: all.length ? '没有符合筛选条件的生词' : '这个词库还是空的' }),
        el('p', { text: all.length ? '换个筛选条件试试。' : '一次可以录很多个词：点「批量添加」，一行一个单词，系统会自动查中文意思，查不到的你再手写。' }),
        el('div', { class: 'row-wrap', style: { justifyContent: 'center' } }, [
          el('button', { class: 'btn btn-primary', type: 'button', onclick: function () { batchAddModal(book.id); } }, '批量添加生词'),
          el('button', { class: 'btn', type: 'button', onclick: function () { addWordModal(book.id); } }, '单个添加'),
          el('button', { class: 'btn', type: 'button', onclick: function () { pickFromGradeModal(book.id); } }, '从教材/考纲选词')
        ])
      ]),
      pages > 1 ? el('div', { class: 'row-wrap mt' }, [
        el('button', { class: 'btn btn-sm', type: 'button', disabled: ws.page <= 1, onclick: function () { ws.page -= 1; refresh(); } }, '上一页'),
        el('span', { class: 'text-small text-muted', text: '第 ' + ws.page + ' / ' + pages + ' 页' }),
        el('button', { class: 'btn btn-sm', type: 'button', disabled: ws.page >= pages, onclick: function () { ws.page += 1; refresh(); } }, '下一页')
      ]) : null,
      el('div', { class: 'row-wrap mt' }, [
        el('button', { class: 'btn', type: 'button', onclick: function () { exportBookFile(book.id); } }, '导出这个词库'),
        el('button', { class: 'btn', type: 'button', onclick: function () { U.download(book.name + '-生词表.csv', VL.store.exportCSV(book.id), 'text/csv;charset=utf-8'); } }, '导出 CSV（含记忆数据）'),
        el('button', { class: 'btn btn-danger', type: 'button', onclick: function () { clearBook(book, all); } }, '清空词库里的词'),
        el('button', {
          class: 'btn btn-danger', type: 'button',
          onclick: function () {
            U.confirmBox({ title: '删除整个生词库？', message: '「' + book.name + '」里的 ' + all.length + ' 个生词、检测和文章记录都会被删除。', okText: '删除', danger: true })
              .then(function (ok) {
                if (!ok) return;
                if (VL.store.books().length <= 1) { U.toast('至少要保留一个生词库', 'warn'); return; }
                VL.store.deleteBook(book.id); VL.app.refreshAll(); U.toast('已删除词库', 'ok');
              });
          }
        }, '删除词库')
      ])
    ]);

    U.mount(host, [
      el('div', { class: 'view-head' }, [
        el('div', null, [
          el('h1', { id: 'v-words', text: '生词库' }),
          el('div', { class: 'view-sub', text: '批量粘贴单词 → 自动查中文意思 → 确认后入库；释义随时可以自己改。' })
        ]),
        el('div', { class: 'spacer' }),
        el('button', { class: 'btn', type: 'button', onclick: function () { newBookModal(); } }, '＋ 新建生词库')
      ]),
      toolbar, bulk, table
    ]);

    function refresh() { wordsView(host); }
  }

  // 一键补全：先查内置词库和你自己录过的词，剩下的可以交给 AI
  function fillMissingMeanings(bookId, refresh) {
    var book = VL.store.getBook(bookId);
    var targets = book.words.filter(function (w) { return !w.meaning; });
    if (!targets.length) { U.toast('这个词库里没有缺释义的词', 'ok'); return; }
    var filled = 0, left = [];
    targets.forEach(function (w) {
      var d = VL.dict.get(w.term);
      if (d && d.cn) {
        VL.store.updateWord(w.id, {
          meaning: d.cn,
          pos: w.pos || d.pos,
          phonetic: w.phonetic || d.ipa,
          example: w.example || d.ex,
          exampleCn: w.exampleCn || d.exCn
        }, bookId);
        filled += 1;
      } else {
        left.push(w);
      }
    });
    refresh();
    if (!left.length) { U.toast('已补全 ' + filled + ' 个释义', 'ok'); return; }
    if (!VL.ailookup.enabled()) {
      U.toast('已补全 ' + filled + ' 个；剩下 ' + left.length + ' 个词库里没有，点释义那一栏手写就行', 'warn', 5200);
      return;
    }
    U.confirmBox({
      title: '还有 ' + left.length + ' 个词没查到',
      message: '可以用 AI 补全这 ' + left.length + ' 个词的释义吗？会把这些单词发给你在设置里填写的 AI 接口。',
      detail: left.slice(0, 12).map(function (w) { return w.term; }).join('、') + (left.length > 12 ? ' 等' : ''),
      okText: '用 AI 补全'
    }).then(function (ok) {
      if (!ok) { U.toast('已补全 ' + filled + ' 个', 'ok'); return; }
      VL.ailookup.translate(left.map(function (w) { return w.term; })).then(function (list) {
        var n = 0;
        list.forEach(function (item) {
          var hit = VL.store.bookWords(bookId).filter(function (x) { return U.normTerm(x.term) === U.normTerm(item.term); })[0];
          if (hit && !hit.meaning && item.meaning) {
            VL.store.updateWord(hit.id, {
              meaning: item.meaning,
              pos: hit.pos || item.pos,
              phonetic: hit.phonetic || item.phonetic,
              example: hit.example || item.example,
              exampleCn: hit.exampleCn || item.exampleCn
            }, bookId);
            n += 1;
          }
        });
        refresh();
        U.toast('AI 又补全了 ' + n + ' 个释义', 'ok');
      }).catch(function (err) { U.toast('AI 补全失败：' + err.message, 'error', 5000); });
    });
  }

  // 在表格里就地修改释义：回车保存，Esc 取消
  function startMeaningEdit(td, w, bookId, refresh) {
    if (!td || td.querySelector('input')) return;
    var input = el('input', {
      class: 'input inline-edit', value: w.meaning || '',
      placeholder: '写你自己的释义，多个释义用「；」分隔'
    });
    var hint = el('div', { class: 'hint', text: '回车保存 · Esc 取消' });
    U.mount(td, [input, hint]);
    input.focus();
    if (input.value) input.select();
    var done = false;
    function save() {
      if (done) return;
      done = true;
      var val = input.value.trim();
      VL.store.updateWord(w.id, { meaning: val }, bookId);
      refresh();
      U.toast(val ? '已更新「' + w.term + '」的释义' : '「' + w.term + '」的释义已清空', 'ok', 1600);
    }
    function cancel() { if (done) return; done = true; refresh(); }
    input.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); save(); }
      else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
    input.addEventListener('blur', save);
  }

  // 通用的「改释义」弹窗（生词库 / 卡片 / 文章里都能调用）
  function editMeaningModal(word, bookId) {
    if (!word) return Promise.resolve(null);
    var book = bookId || VL.store.activeBookId();
    return U.formModal({
      title: '修改「' + word.term + '」的释义', size: 'narrow',
      fields: [{
        name: 'meaning', label: '释义（可以写自己的理解，多个释义用「；」分隔）',
        type: 'textarea', rows: 3, value: word.meaning || '',
        hint: '留空也没关系，只是复习时看不到中文提示。'
      }],
      okText: '保存'
    }).then(function (v) {
      if (!v) return null;
      VL.store.updateWord(word.id, { meaning: v.meaning.trim() }, book);
      if (VL.app && VL.app.refreshAll) VL.app.refreshAll();
      U.toast('已更新「' + word.term + '」的释义', 'ok');
      return v.meaning.trim();
    });
  }

  function bulkAction(kind) {
    var book = VL.store.activeBook();
    var ids = Object.keys(ws.selected).filter(function (k) { return ws.selected[k]; });
    if (!ids.length) return;
    if (kind === 'delete') {
      U.confirmBox({ title: '删除选中的生词？', message: '将删除 ' + ids.length + ' 个生词及其复习记录，无法撤销。', okText: '删除', danger: true })
        .then(function (ok) {
          if (!ok) return;
          VL.store.removeWords(ids, book.id);
          ws.selected = {};
          VL.app.refreshAll();
          U.toast('已删除 ' + ids.length + ' 个生词', 'ok');
        });
      return;
    }
    if (kind === 'move') {
      var others = VL.store.books().filter(function (b) { return b.id !== book.id; });
      if (!others.length) { U.toast('还没有其他词库，先新建一个', 'warn'); return; }
      U.formModal({
        title: '移动到其他生词库',
        fields: [{ name: 'target', label: '目标词库', type: 'select', value: others[0].id, options: others.map(function (b) { return { value: b.id, label: b.name }; }) }],
        okText: '移动'
      }).then(function (v) {
        if (!v) return;
        var moved = 0, skipped = 0;
        ids.forEach(function (id) {
          var w = VL.store.findWordById(id, book.id);
          if (!w) return;
          var r = VL.store.addWord(v.target, {
            term: w.term, meaning: w.meaning, pos: w.pos, phonetic: w.phonetic,
            example: w.example, exampleCn: w.exampleCn, note: w.note, tags: w.tags, source: w.source
          });
          if (r && r.created) { VL.store.removeWord(id, book.id); moved += 1; } else skipped += 1;
        });
        ws.selected = {};
        VL.app.refreshAll();
        U.toast('已移动 ' + moved + ' 个' + (skipped ? '，跳过重复 ' + skipped + ' 个' : ''), 'ok');
      });
      return;
    }
    ids.forEach(function (id) {
      if (kind === 'archive') VL.store.archiveWord(id, book.id);
      else VL.store.restoreWord(id, book.id);
    });
    ws.selected = {};
    VL.app.refreshAll();
    U.toast(kind === 'archive' ? '已归档 ' + ids.length + ' 个生词' : '已恢复 ' + ids.length + ' 个生词', 'ok');
  }

  // 一键清空某个词库里的所有生词（词库本身保留）
  // 两个入口合并：加词（批量/拍照/单个）、导词表（完整/内置）
  function choiceModal(title, intro, options) {
    U.openModal({
      title: title, size: 'narrow',
      body: el('div', { class: 'stack' }, [
        el('div', { class: 'callout', text: intro })
      ].concat(options.map(function (o) {
        return el('button', {
          class: 'btn btn-block', type: 'button', style: { height: 'auto', padding: '12px 14px', justifyContent: 'flex-start' },
          onclick: function () { U.closeModal(); o.run(); }
        }, [
          el('div', null, [
            el('div', { text: o.title }),
            el('div', { class: 'text-small text-muted', text: o.desc })
          ])
        ]);
      }))),
      foot: [el('button', { class: 'btn', type: 'button', onclick: U.closeModal }, '取消')]
    });
  }

  function addChooser(bookId) {
    choiceModal('添加生词', '选一种方式，都会存进「' + (VL.store.getBook(bookId) || {}).name + '」', [
      { title: '📋 批量粘贴 / 上传文件', desc: '一行一个单词；也支持 Excel、Word、CSV、txt 文件，自动查中文', run: function () { batchAddModal(bookId); } },
      { title: '📷 拍照识别', desc: '拍课本词汇页或单词表，自动识别入库', run: function () { batchAddModal(bookId); setTimeout(function () { var el2 = document.querySelector('#modalBody .card'); if (el2) el2.scrollIntoView(); }, 300); } },
      { title: '✍️ 单个输入', desc: '一个词一个词地加，可以自己写释义和例句', run: function () { addWordModal(bookId); } }
    ]);
  }

  function importChooser(bookId) {
    VL.packs.openImportModal(bookId);
  }

  function clearBook(book, all) {
    if (!all || !all.length) { U.toast('这个词库已经是空的', 'ok'); return; }
    U.confirmBox({
      title: '清空「' + book.name + '」里的所有生词？',
      message: '将删除 ' + all.length + ' 个生词及其复习记录（词库本身保留）。建议先「导出这个词库」留个备份。',
      okText: '清空', danger: true
    }).then(function (ok) {
      if (!ok) return;
      var ids = all.map(function (w) { return w.id; });
      VL.store.removeWords(ids, book.id);
      ws.selected = {};
      VL.app.refreshAll();
      U.toast('已清空「' + book.name + '」的 ' + ids.length + ' 个生词', 'ok');
    });
  }

  function removeOne(w, bookId) {
    U.confirmBox({ title: '删除「' + w.term + '」？', message: '这个词的复习记录也会一起删除。如果要保留记录，可以改成「归档」。', okText: '删除', danger: true })
      .then(function (ok) {
        if (!ok) return;
        VL.store.removeWord(w.id, bookId);
        VL.app.refreshAll();
        U.toast('已删除', 'ok');
      });
  }

  function exportBookFile(bookId) {
    var data = VL.store.exportBook(bookId);
    if (!data) return;
    var name = (data.book.name || 'book').replace(/[\\/:*?"<>|]/g, '_');
    U.download('VocabLab-' + name + '-' + U.dayKey() + '.json', JSON.stringify(data, null, 2), 'application/json');
  }

  /* ---------- 弹窗：添加 / 批量添加 / 编辑 / 选词 ---------- */

  function wordFormBody(initial) {
    var fields = {};
    function field(name, label, type, hint) {
      var input = type === 'textarea'
        ? el('textarea', { class: 'textarea', value: initial[name] || '', rows: 2 })
        : el('input', { class: 'input', value: initial[name] || '', type: 'text' });
      fields[name] = input;
      return el('div', { class: 'field' }, [el('label', { text: label }), input, hint ? el('div', { class: 'hint', text: hint }) : null]);
    }

    var meaningInput = el('input', { class: 'input', value: initial.meaning || '', type: 'text', placeholder: '会自动填，也可以自己写；多个释义用「；」分隔' });
    fields.meaning = meaningInput;
    var meaningField = el('div', { class: 'field' }, [
      el('label', { text: '中文释义（可以自己写）' }),
      el('div', { class: 'row', style: { gap: '6px' } }, [
        meaningInput,
        el('button', {
          class: 'btn btn-sm', type: 'button', title: '清空后重新写',
          onclick: function (e) { e.preventDefault(); meaningInput.value = ''; meaningInput.focus(); }
        }, '清空')
      ]),
      el('div', { class: 'hint', text: '填好的释义只是参考，可以直接改写成你自己的理解；留空也能保存。' })
    ]);

    var body = el('div', { class: 'stack' }, [
      el('div', { class: 'field-row' }, [
        field('term', '单词 *'),
        meaningField
      ]),
      el('div', { class: 'field-row' }, [
        field('pos', '词性'),
        field('phonetic', '音标', 'text', '可留空')
      ]),
      field('example', '英文例句'),
      field('exampleCn', '例句翻译'),
      field('note', '备注 / 联想'),
      el('div', { class: 'hint', text: '输入单词后会自动查词库（内置词库 + 你自己录过的词），把音标、词性、释义和例句填好——都能随意改，也能全部自己写。' })
    ]);
    var termInput = fields.term;
    var auto = U.debounce(function () {
      var d = VL.dict.get(termInput.value);
      if (!d || !d.cn) return;
      if (!fields.phonetic.value && d.ipa) fields.phonetic.value = d.ipa;
      if (!fields.pos.value && d.pos) fields.pos.value = d.pos;
      if (!fields.meaning.value && d.cn) fields.meaning.value = d.cn;
      if (!fields.example.value && d.ex) fields.example.value = d.ex;
      if (!fields.exampleCn.value && d.exCn) fields.exampleCn.value = d.exCn;
    }, 300);
    termInput.addEventListener('input', auto);
    return { body: body, fields: fields };
  }

  function addWordModal(bookId) {
    var form = wordFormBody({});
    var status = el('div', { class: 'hint' });
    form.body.appendChild(status);

    function aiFill() {
      var term = form.fields.term.value.trim();
      if (!term) { U.toast('先输入一个单词', 'warn'); return; }
      var btn = status.querySelector('.js-ai-fill');
      if (btn) { btn.disabled = true; btn.textContent = '查询中…'; }
      VL.ailookup.translate([term]).then(function (list) {
        var w = list[0];
        if (!w) { U.toast('AI 没有返回这个词', 'warn'); refreshStatus(); return; }
        if (!form.fields.meaning.value.trim() && w.meaning) form.fields.meaning.value = w.meaning;
        if (!form.fields.pos.value.trim() && w.pos) form.fields.pos.value = w.pos;
        if (!form.fields.phonetic.value.trim() && w.phonetic) form.fields.phonetic.value = w.phonetic;
        if (!form.fields.example.value.trim() && w.example) form.fields.example.value = w.example;
        if (!form.fields.exampleCn.value.trim() && w.exampleCn) form.fields.exampleCn.value = w.exampleCn;
        U.toast('AI 已补全「' + term + '」', 'ok');
        refreshStatus();
      }).catch(function (err) {
        U.toast('AI 查词失败：' + err.message, 'error', 5000);
        refreshStatus();
      });
    }

    function refreshStatus() {
      var term = form.fields.term.value.trim();
      if (!term) { U.mount(status, null); return; }
      var d = VL.dict.get(term);
      if (d && d.cn) {
        U.mount(status, [el('span', { class: 'chip chip-green', text: (d.from === 'user' ? '你录过这个词：' : '词库里有：') + (d.pos || '') + ' ' + d.cn })]);
        return;
      }
      U.mount(status, [
        el('span', { class: 'chip chip-yellow', text: '暂时查不到这个词，可以自己写释义' }),
        VL.ailookup.enabled() ? el('button', { class: 'btn btn-sm js-ai-fill', type: 'button', onclick: aiFill }, '用 AI 查这个词')
          : el('span', { class: 'text-small text-muted', text: '（在设置里配好 AI 接口，就能一键自动查）' })
      ]);
    }
    form.fields.term.addEventListener('input', refreshStatus);
    refreshStatus();

    var ok = el('button', {
      class: 'btn btn-primary', type: 'button',
      onclick: function () {
        var term = form.fields.term.value.trim();
        if (!term) { U.toast('请先填写单词', 'warn'); return; }
        var r = VL.store.addWord(bookId, {
          term: term, meaning: form.fields.meaning.value.trim(), pos: form.fields.pos.value.trim(),
          phonetic: form.fields.phonetic.value.trim().replace(/^\/|\/$/g, ''),
          example: form.fields.example.value.trim(), exampleCn: form.fields.exampleCn.value.trim(),
          note: form.fields.note.value.trim(), source: 'manual'
        });
        var noMeaning = !form.fields.meaning.value.trim();
        U.toast(r && r.created
          ? ('已添加「' + term + '」' + (noMeaning ? '（还没写释义，之后点释义那一栏就能补）' : ''))
          : '「' + term + '」已经在生词库里了', r && r.created ? 'ok' : 'warn');
        if (r && r.created) {
          form.fields.term.value = ''; form.fields.meaning.value = ''; form.fields.pos.value = '';
          form.fields.phonetic.value = ''; form.fields.example.value = ''; form.fields.exampleCn.value = ''; form.fields.note.value = '';
          form.fields.term.focus();
          VL.app.refreshAll();
          refreshStatus();
        }
      }
    }, '添加并继续');
    U.openModal({
      title: '添加生词', size: 'narrow',
      body: form.body,
      foot: [el('button', { class: 'btn', type: 'button', onclick: U.closeModal }, '完成'), ok]
    });
  }

  function editWordModal(w, bookId) {
    var form = wordFormBody(w);
    var ok = el('button', {
      class: 'btn btn-primary', type: 'button',
      onclick: function () {
        VL.store.updateWord(w.id, {
          term: form.fields.term.value.trim() || w.term,
          meaning: form.fields.meaning.value.trim(),
          pos: form.fields.pos.value.trim(),
          phonetic: form.fields.phonetic.value.trim().replace(/^\/|\/$/g, ''),
          example: form.fields.example.value.trim(),
          exampleCn: form.fields.exampleCn.value.trim(),
          note: form.fields.note.value.trim()
        }, bookId);
        U.closeModal();
        VL.app.refreshAll();
        U.toast('已保存', 'ok');
      }
    }, '保存');
    U.openModal({ title: '编辑「' + w.term + '」', size: 'narrow', body: form.body, foot: [el('button', { class: 'btn', type: 'button', onclick: U.closeModal }, '取消'), ok] });
  }

  /* ---------- 批量添加（先预览、自动查词、可改释义） ---------- */

  function batchAddModal(bookId) {
    var book = VL.store.getBook(bookId) || VL.store.activeBook();
    var existing = Object.create(null);
    book.words.forEach(function (w) { existing[w.key] = 1; });

    var ta = el('textarea', {
      class: 'textarea', rows: 8,
      placeholder: '一行一个单词就行（也可以空格或逗号分隔）：\napple\nbanana\nimportant\nprotect\n\n也可以带上释义：\napple 苹果\ncareful, adj., 仔细的\ngarden\n花园'
    });
    var info = el('div', { class: 'hint' });
    var previewHost = el('div');
    var rows = [];          // { term, meaning, pos, phonetic, include, isNew, el:{...} }
    var parsed = false;

    function parseInput() {
      var list = VL.store.parseImportText(ta.value);
      rows = list.map(function (it) {
        var key = U.normTerm(it.term);
        return {
          term: it.term,
          meaning: it.meaning || '',
          pos: it.pos || '',
          phonetic: it.phonetic || '',
          example: it.example || '',
          exampleCn: it.exampleCn || '',
          isNew: !existing[key],
          include: !existing[key]
        };
      });
      parsed = true;
      renderPreview();
    }

    function missingCount() { return rows.filter(function (r) { return r.include && !r.meaning; }).length; }

    function renderPreview() {
      var newCount = rows.filter(function (r) { return r.isNew; }).length;
      var dup = rows.length - newCount;
      U.mount(info, [
        el('span', { class: 'chip chip-blue', text: '识别到 ' + rows.length + ' 个词' }),
        el('span', { class: 'chip chip-green', text: '新词 ' + newCount + ' 个' }),
        dup ? el('span', { class: 'chip', text: '已收录 ' + dup + ' 个（默认不勾选）' }) : null,
        missingCount() ? el('span', { class: 'chip chip-yellow', text: missingCount() + ' 个还没有释义' }) : null
      ]);

      if (!rows.length) {
        U.mount(previewHost, [el('div', { class: 'hint', text: '上面写点单词，然后点「识别并预览」。' })]);
        return;
      }

      var head = el('tr', null, [
        el('th', { class: 'sel' }, [el('input', {
          type: 'checkbox', checked: rows.every(function (r) { return r.include; }),
          onchange: function (e) { rows.forEach(function (r) { r.include = e.target.checked; r.el.box.checked = e.target.checked; }); updateFoot(); }
        })]),
        el('th', { text: '单词' }),
        el('th', { text: '中文释义' }),
        el('th', { text: '词性' }),
        el('th', { text: '音标' }),
        el('th', { text: '状态' })
      ]);

      var bodyRows = rows.slice(0, 400).map(function (r) {
        var termInput = el('input', { class: 'input', style: { minWidth: '120px' }, value: r.term,
          oninput: function () { r.term = termInput.value; } });
        var meanInput = el('input', { class: 'input', style: { minWidth: '170px' }, value: r.meaning,
          placeholder: '自动查不到时在这里写', oninput: function () { r.meaning = meanInput.value; updateFoot(); } });
        var posInput = el('input', { class: 'input', style: { width: '76px' }, value: r.pos, oninput: function () { r.pos = posInput.value; } });
        var phonInput = el('input', { class: 'input', style: { width: '110px' }, value: r.phonetic, oninput: function () { r.phonetic = phonInput.value; } });
        var box = el('input', { type: 'checkbox', checked: r.include, onchange: function () { r.include = box.checked; updateFoot(); } });
        r.el = { box: box, mean: meanInput };
        return el('tr', null, [
          el('td', { class: 'sel' }, [el('div', { class: 'sel-box' }, [box])]),
          el('td', null, [termInput]),
          el('td', null, [meanInput]),
          el('td', null, [posInput]),
          el('td', null, [phonInput]),
          el('td', null, [r.isNew ? el('span', { class: 'chip chip-green', text: '新词' }) : el('span', { class: 'chip', text: '已收录' })])
        ]);
      });

      U.mount(previewHost, [
        el('div', { class: 'table-wrap', style: { maxHeight: '320px', overflow: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--r)' } }, [
          el('table', { class: 'tbl' }, [el('thead', null, [head]), el('tbody', null, bodyRows)])
        ]),
        rows.length > 400 ? el('div', { class: 'hint', text: '表格里只显示前 400 条，其余的词也会一并加入。' }) : null
      ]);
      updateFoot();
    }

    var footInfo = el('div', { class: 'hint' });
    function updateFoot() {
      var chosen = rows.filter(function (r) { return r.include; }).length;
      U.mount(footInfo, [el('span', { text: '将加入 ' + chosen + ' 个词' + (missingCount() ? '，其中 ' + missingCount() + ' 个还没有释义' : '') })]);
    }

    var aiBtn = el('button', {
      class: 'btn btn-sm', type: 'button',
      onclick: function () {
        var targets = rows.filter(function (r) { return !r.meaning && r.term; }).map(function (r) { return r.term; });
        if (!targets.length) { U.toast('没有缺释义的词', 'ok'); return; }
        aiBtn.disabled = true; aiBtn.textContent = 'AI 查询中（' + targets.length + ' 个）…';
        var done = 0;
        var chunkSize = 20;
        var chunks = [];
        for (var i = 0; i < targets.length; i += chunkSize) chunks.push(targets.slice(i, i + chunkSize));
        var chain = Promise.resolve();
        chunks.forEach(function (chunk) {
          chain = chain.then(function () {
            return VL.ailookup.translate(chunk).then(function (list) {
              list.forEach(function (w) {
                var hit = rows.filter(function (r) { return U.normTerm(r.term) === U.normTerm(w.term); })[0];
                if (!hit) return;
                if (!hit.meaning) { hit.meaning = w.meaning; if (hit.el && hit.el.mean) hit.el.mean.value = w.meaning; }
                if (!hit.pos) hit.pos = w.pos;
                if (!hit.phonetic) hit.phonetic = w.phonetic;
                if (!hit.example) { hit.example = w.example; hit.exampleCn = w.exampleCn; }
              });
              done += chunk.length;
              aiBtn.textContent = 'AI 查询中（' + Math.min(done, targets.length) + '/' + targets.length + '）…';
            });
          });
        });
        chain.then(function () {
          aiBtn.disabled = false;
          aiBtn.textContent = '用 AI 补全缺的释义';
          renderPreview();
          U.toast('AI 已补全，检查一下再入库', 'ok');
        }).catch(function (err) {
          aiBtn.disabled = false;
          aiBtn.textContent = '用 AI 补全缺的释义';
          U.toast('AI 查询失败：' + err.message, 'error', 6000);
        });
      }
    }, '用 AI 补全缺的释义');

    var file = el('input', {
      type: 'file', multiple: true,
      accept: '.txt,.csv,.tsv,.md,.markdown,.json,.xlsx,.xlsm,.docx,.xls,.doc,.pdf,image/*',
      class: 'input', style: { padding: '6px' }
    });

    // 上传文件：支持一次选多个，自动按格式读取
    function handleFiles(files) {
      var list = Array.prototype.slice.call(files || []);
      if (!list.length) return;
      var texts = [];
      var notes = [];
      var errors = [];
      var images = [];
      var chain = Promise.resolve();
      list.forEach(function (f) {
        chain = chain.then(function () {
          return VL.readers.parseFile(f).then(function (res) {
            if (res.kind === 'text') {
              if (res.text && /\S/.test(res.text)) { texts.push(res.text); notes.push(f.name + '（' + (res.note || '文本') + '）'); }
              else errors.push(f.name + '：这个文件里没有读到内容');
            } else if (res.kind === 'image') {
              images.push(f);
            } else {
              errors.push(f.name + '：' + (res.message || '读取失败'));
            }
          });
        });
      });
      chain.then(function () {
        if (texts.length) {
          ta.value = (ta.value ? ta.value.replace(/\s*$/, '') + '\n' : '') + texts.join('\n');
        }
        if (images.length) {
          U.imageToDataURL(images[0], 1600, 0.85).then(function (dataUrl) {
            photoData = dataUrl;
            U.mount(photoPreview, [el('img', { src: dataUrl, alt: '待识别的图片', style: { maxWidth: '240px', marginTop: '8px', borderRadius: 'var(--r)', border: '1px solid var(--border)' } })]);
            U.mount(photoStatus, ['图片已就绪（' + images[0].name + '），点「用本地 OCR 识别英文」或「用 AI 识别图片」']);
          }).catch(function (err) {
            photoData = null;
            U.mount(photoStatus, [el('span', { class: 'text-red', text: '图片读不出来：' + (err && err.message ? err.message : '格式不支持') })]);
          });
        }
        if (errors.length) U.toast(errors.join('；'), 'error', 7000);
        if (texts.length) {
          parseInput();
          U.toast('已读取 ' + notes.join('、') + '，下面表格里检查一下再入库', 'ok', 4600);
        }
      });
    }
    file.addEventListener('change', function () { handleFiles(file.files); });

    // 也支持把文件直接拖进来
    ['dragover', 'drop'].forEach(function (evt) {
      ta.addEventListener(evt, function (e) {
        if (evt === 'dragover') { e.preventDefault(); return; }
        e.preventDefault();
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
      });
    });

    /* —— 拍照识词 —— */
    var photoInput = el('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'input', style: { padding: '6px', maxWidth: '280px' } });
    var photoPreview = el('div');
    var photoStatus = el('div', { class: 'hint', text: '拍照或选一张图片，可以先预览——拍单词表、课本词汇页效果最好。' });
    var photoData = null;

    photoInput.addEventListener('change', function () {
      var f = photoInput.files && photoInput.files[0];
      if (!f) return;
      U.mount(photoStatus, ['正在读取图片…']);
      U.imageToDataURL(f, 1600, 0.85).then(function (dataUrl) {
        photoData = dataUrl;
        U.mount(photoPreview, [el('img', {
          src: dataUrl, alt: '待识别的照片',
          style: { maxWidth: '240px', marginTop: '8px', borderRadius: 'var(--r)', border: '1px solid var(--border)' }
        })]);
        U.mount(photoStatus, ['图片已就绪，点下面的按钮开始识别。' + (VL.ailookup.enabled() ? '推荐用 AI，中英对照也能一起读出来。' : '')]);
      }).catch(function (err) {
        photoData = null;
        U.mount(photoPreview, null);
        U.mount(photoStatus, [
          el('span', { class: 'text-red', text: '这张图读不出来：' + (err && err.message ? err.message : '格式不支持') }),
          el('span', { class: 'text-small text-muted', text: ' 如果是文档（Excel / Word / CSV），请用下面「或者选文件」那个按钮。' })
        ]);
      });
    });

    function fillFromWords(words) {
      if (!words || !words.length) { U.toast('没有识别到英文单词', 'warn'); return; }
      ta.value = words.map(function (w) {
        if (typeof w === 'string') return w;
        return w.term + (w.meaning ? ' ' + w.meaning : '');
      }).join('\n');
      parseInput();
      U.toast('识别到 ' + words.length + ' 个词，已填进表格，检查无误再入库', 'ok', 4200);
    }

    var aiReadBtn = el('button', {
      class: 'btn btn-primary', type: 'button',
      onclick: function () {
        if (!photoData) { U.toast('先拍照或选一张图片', 'warn'); return; }
        aiReadBtn.disabled = true;
        U.mount(photoStatus, ['AI 正在读图…']);
        VL.ailookup.readImage(photoData).then(function (words) {
          fillFromWords(words);
          U.mount(photoStatus, ['AI 识别完成：' + words.length + ' 个词（中文释义也一起读出来了）']);
        }).catch(function (err) {
          U.mount(photoStatus, [el('span', { class: 'text-red', text: 'AI 识别失败：' + err.message }), el('div', { class: 'text-small text-muted', text: '可以改用下面的「本地 OCR 识别」。' })]);
        }).then(function () { aiReadBtn.disabled = false; });
      }
    }, '用 AI 识别图片');

    var ocrBtn = el('button', {
      class: 'btn', type: 'button',
      onclick: function () {
        if (!photoData) { U.toast('先拍照或选一张图片', 'warn'); return; }
        ocrBtn.disabled = true;
        U.mount(photoStatus, ['正在准备识别引擎（第一次需要下载，约 10-30 秒）…']);
        VL.ailookup.ocrImage(photoData, function (m) {
          U.mount(photoStatus, ['识别中：' + (m.status || '') + (m.progress ? ' ' + Math.round(m.progress * 100) + '%' : '')]);
        }).then(function (res) {
          fillFromWords(res.words);
          U.mount(photoStatus, ['本地识别完成：' + res.words.length + ' 个英文单词（中文释义会自动补上）']);
        }).catch(function (err) {
          U.mount(photoStatus, [el('span', { class: 'text-red', text: '本地识别失败：' + err.message })]);
        }).then(function () { ocrBtn.disabled = false; });
      }
    }, '用本地 OCR 识别英文');

    var photoCard = el('div', { class: 'card card-pad-sm' }, [
      el('div', { class: 'row-wrap' }, [
        el('strong', { text: '📷 拍照 / 上传图片识词' }),
        el('span', { class: 'text-small text-muted', text: '手机上点「拍照」会直接打开相机' })
      ]),
      el('div', { class: 'row-wrap mt' }, [
        el('span', { class: 'label', text: '选择图片：' }), photoInput
      ]),
      photoPreview,
      photoStatus,
      el('div', { class: 'row-wrap mt' }, [
        VL.ailookup.enabled() ? aiReadBtn : null,
        ocrBtn
      ]),
      VL.ailookup.enabled() ? null : el('div', { class: 'hint', text: '提示：配好 AI 接口后（设置与备份 → AI 接口）可以用「用 AI 识别图片」，中英对照的单词表能一次读全，包括中文释义和词性；不配也能用本地 OCR 只认英文，中文由内置词库自动补。' })
    ]);

    var body = el('div', { class: 'stack' }, [
      photoCard,
      el('div', { class: 'callout' }, '也可以直接打字或粘贴：一行一个单词就行。会按顺序自动查：① 内置词库 → ② 你自己录过的生词 → ③ 查不到的先留空，你在下面的表格里手写，或用 AI 批量补全。行首的「1.」「①」会自动去掉。'),
      ta,
      el('div', { class: 'row-wrap' }, [
        el('button', { class: 'btn', type: 'button', onclick: parseInput }, '识别并预览'),
        VL.ailookup.enabled() ? aiBtn : null,
        el('span', { class: 'text-small text-muted', text: parsed ? '' : '（先点「识别并预览」）' }),
        el('div', { class: 'spacer' }),
        el('label', { class: 'text-small text-muted' }, ['或者选文件：', file])
      ]),
      info,
      previewHost,
      footInfo
    ]);

    var ok = el('button', {
      class: 'btn btn-primary', type: 'button',
      onclick: function () {
        if (!parsed) parseInput();
        var chosen = rows.filter(function (r) { return r.include && String(r.term || '').trim(); });
        if (!chosen.length) { U.toast('还没有勾选要加入的词', 'warn'); return; }
        var r2 = VL.store.addWords(bookId, chosen.map(function (r) {
          return {
            term: String(r.term).trim(), meaning: String(r.meaning || '').trim(), pos: String(r.pos || '').trim(),
            phonetic: String(r.phonetic || '').trim().replace(/^\/|\/$/g, ''),
            example: r.example || '', exampleCn: r.exampleCn || '', source: 'import'
          };
        }));
        U.closeModal();
        VL.app.refreshAll();
        U.toast('已加入 ' + r2.added + ' 个生词' + (r2.skipped ? '，跳过重复 ' + r2.skipped + ' 个' : '') + (missingCount() ? '；还有词没释义，可以在列表里点释义补上' : ''), 'ok', 4200);
      }
    }, '加入生词库');

    U.openModal({
      title: '批量添加生词', size: 'wide',
      body: body,
      foot: [el('button', { class: 'btn', type: 'button', onclick: U.closeModal }, '取消'), ok]
    });
    setTimeout(function () { ta.focus(); }, 60);
  }

  // 兼容旧入口：批量导入 = 批量添加
  function importModal(bookId) { return batchAddModal(bookId); }

  // 完整词表整册导入（并入选词弹窗）
  function packSection(bookId, book) {
    var sel = el('select', { class: 'select' }, [el('option', { value: '' }, '正在加载完整词表清单…')]);
    var info = el('div', { class: 'hint' });
    var btn = el('button', { class: 'btn btn-primary', type: 'button' }, '整册导入到这个词库');

    function fill(items) {
      var priority = ['中考', '高考', '七年级上', '七年级下', '八年级上', '八年级下', '九年级'];
      items.sort(function (a, b) {
        function score(it) {
          for (var i = 0; i < priority.length; i++) if (it.name.indexOf(priority[i]) >= 0) return i;
          return 90;
        }
        var d = score(a) - score(b);
        return d !== 0 ? d : (b.count || 0) - (a.count || 0);
      });
      U.mount(sel, [el('option', { value: '' }, '请选择要整册导入的完整词表…')].concat(items.map(function (it, i) {
        return el('option', { value: String(i) }, it.name + '（' + (it.count || '?') + ' 词）');
      })));
      sel._items = items;
      U.mount(info, [el('span', { text: '共 ' + items.length + ' 个完整词表；选中后点右边按钮，一次把这册全部词导入。' })]);
    }

    btn.addEventListener('click', function () {
      var it = (sel._items || [])[Number(sel.value)];
      if (!it) { U.toast('请先在下拉框里选一个词表', 'warn'); return; }
      btn.disabled = true;
      btn.textContent = '下载中…';
      VL.packs.download(it).then(function (entries) {
        var r = VL.store.addWords(bookId || VL.store.activeBookId(), entries.map(function (e) {
          return { term: e[0], pos: e[1], meaning: e[2], phonetic: String(e[3] || '').replace(/^\/|\/$/g, ''), source: 'pack' };
        }));
        VIP_refresh();
        btn.textContent = '✓ 已导入 ' + r.added + ' 词';
        U.toast('已把「' + it.name + '」的 ' + r.added + ' 个词加入「' + book.name + '」', 'ok', 5000);
      }).catch(function (err) {
        btn.disabled = false;
        btn.textContent = '整册导入到这个词库';
        U.toast(err.message, 'error', 6000);
      });
    });

    function VIP_refresh() { if (VL.app && VL.app.refreshAll) VL.app.refreshAll(); }

    VL.packs.catalog().then(function (list) {
      var wanted = list.filter(function (it) {
        return (it.category === '青少年英语' || it.category === '中国考试') && (it.count || 0) >= 100;
      });
      fill(VL.packs.PRESET.concat(wanted));
    }).catch(function () {
      fill(VL.packs.PRESET);
      U.mount(info, [el('span', { class: 'text-red', text: '在线清单获取失败（需要联网），下面是默认的完整词表。' })]);
    });

    return el('div', { class: 'card card-pad-sm' }, [
      el('div', { class: 'row-wrap' }, [
        el('strong', { text: '📚 完整词表（整册导入）' }),
        el('span', { class: 'text-small text-muted', text: '需要联网一次；导入后永久离线可用' })
      ]),
      el('div', { class: 'row-wrap mt' }, [el('div', { class: 'grow' }, [sel]), btn]),
      el('div', { class: 'mt' }, [info])
    ]);
  }

  function pickFromGradeModal(bookId) {
    var groups = VL.wordlists.grouped();
    var flat = [];
    groups.forEach(function (g) { g.sources.forEach(function (s) { flat.push(s); }); });
    var currentSource = flat[0].id;
    var checked = {};
    var listHost = el('div');
    var countHost = el('div', { class: 'hint' });
    var book = VL.store.getBook(bookId);
    var existing = Object.create(null);
    book.words.forEach(function (w) { existing[w.key] = 1; });

    function renderList3() {
      var pool = VL.wordlists.pool(currentSource);
      U.mount(listHost, [
        el('div', { class: 'row-wrap mb' }, [
          el('button', { class: 'btn btn-sm', type: 'button', onclick: function () { pool.forEach(function (e) { checked[e.key] = true; }); renderList3(); } }, '全选'),
          el('button', { class: 'btn btn-sm', type: 'button', onclick: function () { checked = {}; renderList3(); } }, '全不选'),
          el('button', { class: 'btn btn-sm', type: 'button', onclick: function () { pool.forEach(function (e) { if (!existing[e.key]) checked[e.key] = true; }); renderList3(); } }, '只选还没收录的'),
          el('div', { class: 'spacer' }),
          el('span', { class: 'text-small text-muted', text: pool.length + ' 个词' })
        ]),
        el('div', { style: { maxHeight: '300px', overflow: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '8px' } },
          pool.map(function (e) {
            return el('label', { class: 'check-row' }, [
              el('input', {
                type: 'checkbox', checked: !!checked[e.key],
                onchange: function (ev) { checked[e.key] = ev.target.checked; updateCount(); }
              }),
              el('span', null, [el('strong', { text: e.term }), el('span', { class: 'text-muted', text: ' ' + e.pos + ' ' + e.cn })]),
              existing[e.key] ? el('span', { class: 'chip chip-green', style: { marginLeft: 'auto' }, text: '已收录' }) : null
            ]);
          }))
      ]);
      updateCount();
    }
    function updateCount() {
      var n = Object.keys(checked).filter(function (k) { return checked[k]; }).length;
      U.mount(countHost, [el('span', { text: '已选 ' + n + ' 个词' })]);
    }

    var selector = el('select', { class: 'select', onchange: function (e) { currentSource = e.target.value; checked = {}; renderList3(); } },
      groups.map(function (g) {
        return el('optgroup', { label: g.label }, g.sources.map(function (s) {
          return el('option', { value: s.id }, s.name + '（' + s.count + ' 词）');
        }));
      }));

    var body = el('div', { class: 'stack' }, [
      el('div', { class: 'callout warn' }, [
        el('strong', { text: '注意：这里是「内置核心词」（离线可用，各册/考纲合计约 1300 词），不是完整词表。' }),
        el('div', { class: 'mt', text: '要完整词表（中考 2135 词 / 高考 3854 词 / 人教版各册完整），请用工具栏的「📚 导入完整词表」。' })
      ]),
      el('div', { class: 'row-wrap' }, [
        el('button', {
          class: 'btn btn-primary btn-sm', type: 'button',
          onclick: function () { U.closeModal(); VL.packs.openImportModal(bookId || VL.store.activeBookId()); }
        }, '📚 去导入完整词表'),
        el('span', { class: 'text-small text-muted', text: '下面这部分是从人教版各册 / 中考 / 高考核心词里勾选，加进「' + book.name + '」。' })
      ]),
      packSection(bookId, book),
      el('div', { class: 'field' }, [el('label', { text: '选择词表' }), selector]),
      countHost, listHost
    ]);
    renderList3();

    var ok = el('button', {
      class: 'btn btn-primary', type: 'button',
      onclick: function () {
        var chosen = VL.wordlists.pool(currentSource).filter(function (e) { return checked[e.key]; });
        if (!chosen.length) { U.toast('还没有选择单词', 'warn'); return; }
        var r = VL.store.addWords(bookId, chosen.map(function (e) {
          return { term: e.term, meaning: e.cn, pos: e.pos, phonetic: e.ipa, example: e.ex, exampleCn: e.exCn, tags: e.tags, source: 'dict' };
        }));
        U.closeModal();
        VL.app.refreshAll();
        U.toast('新增 ' + r.added + ' 个生词' + (r.skipped ? '，已收录 ' + r.skipped + ' 个' : ''), 'ok');
      }
    }, '加入生词库');
    U.openModal({ title: '从教材 / 考纲词表选词', size: 'wide', body: body, foot: [el('button', { class: 'btn', type: 'button', onclick: U.closeModal }, '取消'), ok] });
  }

  function newBookModal() {
    U.formModal({
      title: '新建生词库',
      fields: [
        { name: 'name', label: '名称', required: true, value: '', placeholder: '例如：七年级下册 Unit 3' },
        { name: 'desc', label: '说明（可选）' }
      ],
      okText: '创建'
    }).then(function (v) {
      if (!v) return;
      VL.store.addBook({ name: v.name, desc: v.desc });
      VL.app.refreshAll();
      U.toast('已创建「' + v.name + '」', 'ok');
    });
  }

  /* ---------- 归档 ---------- */

  function archiveView(host) {
    var book = VL.store.activeBook();
    var words = VL.store.bookWords(book.id);
    var mastered = words.filter(function (w) { return w.status === 'mastered'; });
    var archived = words.filter(function (w) { return w.status === 'archived'; });
    var tests = book.tests || [];
    var articles = book.articles || [];
    var mastery = VL.srs.mastery(words);

    function wordTable(list, emptyText) {
      if (!list.length) return el('p', { class: 'text-small text-muted', text: emptyText });
      return el('div', { class: 'table-wrap' }, [
        el('table', { class: 'tbl' }, [
          el('thead', null, [el('tr', null, [
            el('th', { text: '单词' }), el('th', { text: '释义' }), el('th', { text: '复习' }), el('th', { text: '归档时间' }), el('th', { class: 'act', text: '' })
          ])]),
          el('tbody', null, list.map(function (w) {
            return el('tr', null, [
              el('td', null, [el('strong', { text: w.term }), el('div', { class: 'text-small text-muted', text: w.pos || '' })]),
              el('td', { text: w.meaning || '（无释义）' }),
              el('td', { class: 'text-small', text: w.srs.reps + ' 次 · 错 ' + w.srs.wrong + ' 次' }),
              el('td', { class: 'text-small text-muted', text: w.archivedAt ? U.fmtDateTime(w.archivedAt) : (w.masteredAt ? U.fmtDateTime(w.masteredAt) : '—') }),
              el('td', { class: 'act' }, [
                el('button', {
                  class: 'btn btn-sm', type: 'button',
                  onclick: function () { VL.store.restoreWord(w.id, book.id); VL.app.refreshAll(); U.toast('已恢复', 'ok'); }
                }, '恢复'),
                el('button', {
                  class: 'btn btn-sm btn-ghost text-red', type: 'button',
                  onclick: function () { removeOne(w, book.id); }
                }, '删除')
              ])
            ]);
          }))
        ])
      ]);
    }

    U.mount(host, [
      el('div', { class: 'view-head' }, [
        el('div', null, [
          el('h1', { id: 'v-archive', text: '归档 · ' + book.name }),
          el('div', { class: 'view-sub', text: '每个生词库都有自己独立的归档：已掌握/已归档的生词、检测记录、生成过的文章和学习档案。' })
        ]),
        el('div', { class: 'spacer' }),
        el('button', { class: 'btn', type: 'button', onclick: function () { exportBookFile(book.id); } }, '导出这个词库'),
        el('button', { class: 'btn', type: 'button', onclick: function () { batchAddModal(book.id); } }, '批量添加到这个词库')
      ]),
      el('div', { class: 'grid grid-4 mb' }, [
        statCard('生词记录', words.length, '含已归档与已掌握'),
        statCard('已掌握', mastery.mastered, mastery.rate + '% 掌握度'),
        statCard('检测次数', tests.length, tests.length ? '最近 ' + U.fmtDateTime(tests[0].at) : '还没有检测'),
        statCard('生成文章', articles.length, articles.length ? '最近 ' + U.fmtDateTime(articles[0].at) : '还没有生成')
      ]),
      el('div', { class: 'grid grid-2' }, [
        el('div', { class: 'card' }, [
          el('div', { class: 'card-head' }, [el('h3', { text: '已掌握（' + mastered.length + '）' }), el('span', { class: 'card-note', text: '走完艾宾浩斯全部节点' })]),
          wordTable(mastered, '还没有走完全部复习节点的生词。')
        ]),
        el('div', { class: 'card' }, [
          el('div', { class: 'card-head' }, [el('h3', { text: '手动归档（' + archived.length + '）' }), el('span', { class: 'card-note', text: '不再安排复习' })]),
          wordTable(archived, '没有手动归档的生词。')
        ])
      ]),
      el('div', { class: 'card mt' }, [
        el('div', { class: 'card-head' }, [el('h3', { text: '检测记录（' + tests.length + '）' })]),
        tests.length ? el('div', { class: 'table-wrap' }, [
          el('table', { class: 'tbl' }, [
            el('thead', null, [el('tr', null, [
              el('th', { text: '时间' }), el('th', { text: '题型' }), el('th', { text: '范围' }),
              el('th', { class: 'num', text: '成绩' }), el('th', { class: 'num', text: '用时' }), el('th', { text: '错题' })
            ])]),
            el('tbody', null, tests.slice(0, 30).map(function (t) {
              var rate = t.total ? Math.round((t.correct / t.total) * 100) : 0;
              var wrongList = (t.items || []).filter(function (i) { return !i.correct; }).map(function (i) { return i.term; });
              return el('tr', null, [
                el('td', { class: 'nowrap', text: U.fmtDateTime(t.at) }),
                el('td', { text: t.type }),
                el('td', { text: t.scope || '' }),
                el('td', { class: 'num', text: rate + '%（' + t.correct + '/' + t.total + '）' }),
                el('td', { class: 'num', text: (t.minutes || 1) + ' 分' }),
                el('td', { class: 'text-small', text: wrongList.slice(0, 8).join('、') + (wrongList.length > 8 ? '…' : '') })
              ]);
            }))
          ])
        ]) : el('p', { class: 'text-small text-muted', text: '还没有检测记录，去「生词检测」做一次吧。' })
      ]),
      el('div', { class: 'card mt' }, [
        el('div', { class: 'card-head' }, [el('h3', { text: '生成过的文章（' + articles.length + '）' })]),
        articles.length ? el('div', { class: 'stack', style: { gap: '8px' } }, articles.slice(0, 15).map(function (a) {
          return el('div', { class: 'row' }, [
            el('div', { class: 'grow' }, [
              el('div', { text: a.title }),
              el('div', { class: 'text-small text-muted', text: U.fmtDateTime(a.at) + ' · ' + (a.mode === 'ai' ? 'AI 生成' : '本地生成') + ' · ' + (a.wordCount || 0) + ' 词' + (a.score != null ? ' · 得分 ' + a.score + '%' : '') })
            ]),
            el('button', {
              class: 'btn btn-sm', type: 'button',
              onclick: function () {
                VL.app.go('reading');
                setTimeout(function () {
                  VL.reading.openSaved(Object.assign({}, a, {
                    engineLabel: a.mode === 'ai' ? 'AI 生成' : '本地生成（离线）', warnings: []
                  }));
                }, 0);
              }
            }, '重新阅读')
          ]);
        })) : el('p', { class: 'text-small text-muted', text: '还没有生成过文章。' })
      ])
    ]);
  }

  /* ---------- 设置 ---------- */

  function settingsView(host) {
    var s = VL.store.settings();
    var intervalList = VL.srs.intervals();

    function intervalEditor() {
      var unitOptions = [
        { v: String(U.MIN), l: '分钟' }, { v: String(U.HOUR), l: '小时' }, { v: String(U.DAY), l: '天' }
      ];
      function commit(i) {
        return function () {
          var row = document.getElementById('intervalRow' + i);
          if (!row) return;
          var num = Number(row.querySelector('input').value) || 1;
          var unit = Number(row.querySelector('select').value) || U.MIN;
          var vals = VL.srs.intervals().slice();
          vals[i] = Math.max(1000, num * unit);
          VL.store.setSettings({ intervals: vals });
          U.toast('已更新复习节奏', 'ok', 1600);
        };
      }
      return el('div', { class: 'stack', style: { gap: '6px' } }, intervalList.map(function (ms, i) {
        var unit = ms >= U.DAY && ms % U.DAY === 0 ? U.DAY : (ms >= U.HOUR && ms % U.HOUR === 0 ? U.HOUR : U.MIN);
        return el('div', { class: 'row', id: 'intervalRow' + i }, [
          el('span', { class: 'text-small text-muted', style: { width: '62px' }, text: '第 ' + (i + 1) + ' 次' }),
          el('input', { class: 'input', type: 'number', min: '1', value: String(ms / unit), style: { width: '90px' }, onchange: commit(i) }),
          el('select', { class: 'select', style: { width: 'auto' }, onchange: commit(i) },
            unitOptions.map(function (u) { return el('option', { value: u.v, selected: String(unit) === u.v }, u.l); })),
          el('span', { class: 'text-small text-muted', text: '之后复习' })
        ]);
      }));
    }

    var presets = el('div', { class: 'row-wrap' }, [
      el('button', {
        class: 'btn btn-sm', type: 'button',
        onclick: function () { VL.store.setSettings({ intervals: VL.srs.DEFAULT_INTERVALS.slice() }); settingsView(host); U.toast('已恢复经典艾宾浩斯节奏', 'ok'); }
      }, '经典艾宾浩斯（5分 → 60天）'),
      el('button', {
        class: 'btn btn-sm', type: 'button',
        onclick: function () { VL.store.setSettings({ intervals: [10 * U.MIN, U.HOUR, 8 * U.HOUR, U.DAY, 3 * U.DAY, 7 * U.DAY, 21 * U.DAY, 45 * U.DAY, 90 * U.DAY, 180 * U.DAY] }); settingsView(host); U.toast('已切换为宽松节奏', 'ok'); }
      }, '宽松（适合长期）'),
      el('button', {
        class: 'btn btn-sm', type: 'button',
        onclick: function () { VL.store.setSettings({ intervals: [U.MIN, 5 * U.MIN, 30 * U.MIN, 2 * U.HOUR, 8 * U.HOUR, U.DAY, 2 * U.DAY, 4 * U.DAY, 7 * U.DAY, 15 * U.DAY] }); settingsView(host); U.toast('已切换为紧凑节奏', 'ok'); }
      }, '紧凑（考前突击）')
    ]);

    var ai = s.ai;
    var aiStatus = el('div', { class: 'ai-status' }, [
      el('span', { class: 'ai-dot' + (ai.apiKey ? ' on' : '') }),
      ai.apiKey ? '已配置（Key 只保存在本机浏览器）' : '未配置：不填也能用本地生成和内置词典'
    ]);
    var testOut = el('div', { class: 'text-small text-muted' });
    var speakOut = el('div', { class: 'text-small text-muted' });

    var body = [
      el('div', { class: 'card mb' }, [
        el('div', { class: 'card-head' }, [el('h3', { text: '复习节奏（艾宾浩斯节点）' }), el('span', { class: 'card-note', text: '每答对一次就前进一格' })]),
        intervalEditor(),
        el('div', { class: 'mt' }, [presets]),
        el('hr'),
        el('div', { class: 'field-row' }, [
          el('div', { class: 'field' }, [
            el('label', { text: '每日新词上限' }),
            el('input', {
              class: 'input', type: 'number', min: '0', value: String(s.dailyNew || 20),
              onchange: function (e) { VL.store.setSettings({ dailyNew: Math.max(0, Number(e.target.value) || 0) }); U.toast('已保存', 'ok'); }
            })
          ]),
          el('div', { class: 'field' }, [
            el('label', { text: '「忘记」后多久重新出现' }),
            el('select', {
              class: 'select', onchange: function (e) { VL.store.setSettings({ relearnDelay: Number(e.target.value) }); U.toast('已保存', 'ok'); }
            }, [
              { v: 30 * 1000, l: '30 秒' }, { v: 60 * 1000, l: '1 分钟' },
              { v: 5 * 60 * 1000, l: '5 分钟' }, { v: 10 * 60 * 1000, l: '10 分钟' }
            ].map(function (o) { return el('option', { value: o.v, selected: s.relearnDelay === o.v }, o.l); }))
          ])
        ]),
        el('hr'),
        el('label', { class: 'check-row' }, [el('input', {
          type: 'checkbox', class: 'input', checked: s.autoArchive !== false,
          onchange: function (e) { VL.store.setSettings({ autoArchive: e.target.checked }); U.toast('已保存', 'ok'); }
        }), '生词走完全部复习节点后自动移入归档']),
        el('label', { class: 'check-row' }, [el('input', {
          type: 'checkbox', class: 'input', checked: s.autoSpeak !== false,
          onchange: function (e) { VL.store.setSettings({ autoSpeak: e.target.checked }); U.toast('已保存', 'ok'); }
        }), '卡片出现时自动朗读单词']),
        el('label', { class: 'check-row' }, [el('input', {
          type: 'checkbox', class: 'input', checked: !!s.reverse,
          onchange: function (e) { VL.store.setSettings({ reverse: e.target.checked }); U.toast('已保存', 'ok'); }
        }), '反向卡片：先看中文，回忆英文']),
      ]),
      el('div', { class: 'card mb' }, [
        el('div', { class: 'card-head' }, [
          el('h3', { text: '发音' }),
          el('span', { class: 'card-note', text: '真人录音需要联网，系统语音离线可用' })
        ]),
        el('div', { class: 'field mb' }, [
          el('label', { text: '发音方式' }),
          el('div', { class: 'seg' }, [
            { v: 'auto', l: '自动（真人优先）' }, { v: 'real', l: '只用真人发音' }, { v: 'system', l: '只用系统语音' }
          ].map(function (o) {
            return el('button', {
              class: 'chip chip-btn' + ((s.speakSource || 'auto') === o.v ? ' is-on' : ''), type: 'button',
              onclick: function () { VL.store.setSettings({ speakSource: o.v }); settingsView(host); U.toast('已切换：' + o.l, 'ok'); }
            }, o.l);
          }))
        ]),
        el('div', { class: 'field mb' }, [
          el('label', { text: '口音（真人发音）' }),
          el('div', { class: 'seg' }, [
            { v: 'us', l: '美音' }, { v: 'uk', l: '英音' }
          ].map(function (o) {
            return el('button', {
              class: 'chip chip-btn' + ((s.accent || 'us') === o.v ? ' is-on' : ''), type: 'button',
              onclick: function () { VL.store.setSettings({ accent: o.v }); settingsView(host); U.toast('已切换：' + o.l, 'ok'); }
            }, o.l);
          }))
        ]),
        el('div', { class: 'row-wrap' }, [
          el('button', {
            class: 'btn', type: 'button',
            onclick: function () {
              U.mount(speakOut, ['正在获取真人发音…']);
              U.playReal('vocabulary', s.accent).then(function (ok) {
                U.mount(speakOut, [ok ? el('span', { class: 'chip chip-green', text: '真人发音可以播放 ✓' })
                  : el('span', { class: 'chip chip-red', text: '连不上真人发音（检查一下网络），这时会自动用系统语音' })]);
              });
            }
          }, '试听真人发音'),
          el('button', {
            class: 'btn', type: 'button',
            onclick: function () { U.speak('vocabulary', { source: 'system' }); }
          }, '试听系统语音'),
          el('span', { class: 'text-small text-muted', text: '单词朗读用真人录音（有道），句子或断网时自动用系统语音。' })
        ]),
        speakOut,
        el('hr'),
        el('div', { class: 'field' }, [
          el('label', { text: '系统语音音色' }),
          el('div', { class: 'row-wrap' }, [
            el('select', {
              class: 'select', style: { maxWidth: '360px' },
              onchange: function (e) { VL.store.setSettings({ ttsVoice: e.target.value }); U.speak('Hello, this is my English voice.', { source: 'system' }); }
            }, [el('option', { value: '', selected: !s.ttsVoice }, '自动选择（优先挑自然的）')].concat(
              (window.speechSynthesis ? window.speechSynthesis.getVoices() : [])
                .filter(function (v) { return /^en/i.test(v.lang); })
                .map(function (v) {
                  var nice = /natural|online|neural|siri|google/i.test(v.name);
                  return el('option', { value: v.name, selected: s.ttsVoice === v.name }, (nice ? '★ ' : '') + v.name + '（' + v.lang + '）');
                })
            )),
            el('button', { class: 'btn btn-sm', type: 'button', onclick: function () { U.speak('Learning a new word is the beginning of a new world.', { source: 'system' }); } }, '试听')
          ]),
          el('div', { class: 'hint', text: '带 ★ 的是更像真人的自然语音。iPhone / iPad 上想更好听：设置 → 辅助功能 → 朗读内容 → 声音 → 英语 → 下载 Siri 声音（或 Alex），回到这里选中它即可。Windows 上用 Edge 也能获得更自然的在线语音。' })
        ])
      ]),
      el('div', { class: 'card mb' }, [
        el('div', { class: 'card-head' }, [el('h3', { text: 'AI 接口（生成文章 + 自动查词）' }), el('span', { class: 'card-note', text: '兼容 OpenAI 接口格式的服务' })]),
        el('div', { class: 'field-row' }, [
          el('div', { class: 'field' }, [
            el('label', { text: '接口地址（Base URL）' }),
            el('input', { class: 'input', value: ai.baseUrl, placeholder: 'https://api.openai.com/v1', onchange: function (e) { VL.store.setAI({ baseUrl: e.target.value.trim() }); U.toast('已保存', 'ok'); } })
          ]),
          el('div', { class: 'field' }, [
            el('label', { text: '模型名称' }),
            el('input', { class: 'input', value: ai.model, placeholder: 'gpt-4o-mini', onchange: function (e) { VL.store.setAI({ model: e.target.value.trim() }); U.toast('已保存', 'ok'); } })
          ])
        ]),
        el('div', { class: 'field mt' }, [
          el('label', { text: 'API Key' }),
          el('input', { class: 'input', type: 'password', value: ai.apiKey, placeholder: 'sk-…（只保存在这台电脑的浏览器里）', onchange: function (e) { VL.store.setAI({ apiKey: e.target.value.trim() }); settingsView(host); U.toast('已保存', 'ok'); } })
        ]),
        el('div', { class: 'row-wrap mt' }, [
          el('button', {
            class: 'btn', type: 'button',
            onclick: function () {
              U.mount(testOut, ['测试中…']);
              VL.reading.callAI({ sourceId: 'all', level: 1, questionCount: 4, topicLabel: '校园生活' }, [{ term: 'school', meaning: '学校' }, { term: 'friend', meaning: '朋友' }, { term: 'study', meaning: '学习' }, { term: 'happy', meaning: '高兴的' }, { term: 'teacher', meaning: '老师' }, { term: 'book', meaning: '书' }])
                .then(function (art) {
                  U.mount(testOut, [el('span', { class: 'chip chip-green', text: '连接成功：' + art.title + '（' + art.wordCount + ' 词，' + art.questions.length + ' 题）' })]);
                })
                .catch(function (err) {
                  U.mount(testOut, [el('span', { class: 'chip chip-red', text: '失败：' + err.message })]);
                });
            }
          }, '测试连接'),
          aiStatus
        ]),
        testOut,
        el('div', { class: 'callout mt' }, '配置好之后有两个用途：①「文章阅读」可以让 AI 写更自然的文章和题目；②查不到的单词可以「用 AI 查」，批量添加时也能一次补全几十个词的释义。浏览器直连需要服务端允许跨域（CORS）；不配置也完全不影响其他功能。')
      ]),
      el('div', { class: 'card mb' }, [
        el('div', { class: 'card-head' }, [
          el('h3', { text: '用户档案（多人分开记录）' }),
          el('span', { class: 'card-note', text: '每个用户的生词库、复习、检测、文章完全独立' })
        ]),
        el('div', { class: 'table-wrap' }, [
          el('table', { class: 'tbl' }, [
            el('thead', null, [el('tr', null, [
              el('th', { text: '用户' }), el('th', { text: '备注' }), el('th', { text: '创建时间' }), el('th', { class: 'act', text: '操作' })
            ])]),
            el('tbody', null, VL.store.profiles().map(function (p) {
              var isCur = p.id === VL.store.activeProfile().id;
              return el('tr', null, [
                el('td', null, [el('strong', { text: p.name }), isCur ? el('span', { class: 'chip chip-green', style: { marginLeft: '6px' }, text: '当前' }) : null]),
                el('td', { class: 'text-small text-muted', text: p.note || '' }),
                el('td', { class: 'text-small text-muted', text: U.fmtDate(p.createdAt) }),
                el('td', { class: 'act' }, [
                  isCur ? null : el('button', { class: 'btn btn-sm', type: 'button', onclick: function () { VL.app.switchProfile(p.id); } }, '切换'),
                  el('button', {
                    class: 'btn btn-sm btn-ghost', type: 'button',
                    onclick: function () {
                      U.formModal({
                        title: '重命名用户', size: 'narrow',
                        fields: [
                          { name: 'name', label: '名字', required: true, value: p.name },
                          { name: 'note', label: '备注', value: p.note || '' }
                        ],
                        okText: '保存'
                      }).then(function (v) {
                        if (!v) return;
                        VL.store.updateProfile(p.id, { name: v.name, note: v.note });
                        VL.app.refreshAll();
                        U.toast('已保存', 'ok');
                      });
                    }
                  }, '重命名'),
                  el('button', {
                    class: 'btn btn-sm btn-ghost', type: 'button',
                    onclick: function () {
                      var data = VL.store.exportProfile(p.id);
                      if (!data) return;
                      U.download('VocabLab-' + p.name + '-' + U.dayKey() + '.json', JSON.stringify(data, null, 2), 'application/json');
                    }
                  }, '导出'),
                  VL.store.profiles().length > 1 ? el('button', {
                    class: 'btn btn-sm btn-ghost text-red', type: 'button',
                    onclick: function () {
                      U.confirmBox({
                        title: '删除用户「' + p.name + '」？',
                        message: '这个用户的生词库、复习记录、检测和文章都会被删除，无法撤销。',
                        okText: '删除', danger: true
                      }).then(function (ok) {
                        if (!ok) return;
                        VL.store.deleteProfile(p.id);
                        VL.app.refreshAll();
                        U.toast('已删除「' + p.name + '」', 'ok');
                      });
                    }
                  }, '删除') : null
                ])
              ]);
            }))
          ])
        ]),
        el('div', { class: 'row-wrap mt' }, [
          el('button', { class: 'btn btn-primary', type: 'button', onclick: function () { VL.app.newProfilePrompt(); } }, '＋ 新建用户'),
          el('span', { class: 'text-small text-muted', text: '右上角下拉框也能随时切换用户。' })
        ])
      ]),
      el('div', { class: 'card mb' }, [
        el('div', { class: 'card-head' }, [el('h3', { text: '数据与备份' }), el('span', { class: 'card-note', text: '所有数据都在这台电脑的浏览器里' })]),
        el('div', { class: 'row-wrap' }, [
          el('button', { class: 'btn btn-primary', type: 'button', onclick: function () { U.download('VocabLab-备份-' + U.dayKey() + '.json', JSON.stringify(VL.store.exportAll(), null, 2), 'application/json'); } }, '导出全部备份（JSON）'),
          el('button', { class: 'btn', type: 'button', onclick: function () { U.download('VocabLab-' + VL.store.activeProfile().name + '-' + U.dayKey() + '.json', JSON.stringify(VL.store.exportProfile(), null, 2), 'application/json'); } }, '只导出当前用户'),
          el('button', { class: 'btn', type: 'button', onclick: function () { exportBookFile(VL.store.activeBookId()); } }, '只导出当前词库'),
          el('button', { class: 'btn', type: 'button', onclick: function () { U.download(VL.store.activeBook().name + '-生词表.csv', VL.store.exportCSV(), 'text/csv;charset=utf-8'); } }, '导出 CSV'),
          el('button', { class: 'btn', type: 'button', onclick: function () { batchAddModal(VL.store.activeBookId()); } }, '导入数据 / 批量添加'),
          el('button', {
            class: 'btn btn-danger', type: 'button',
            onclick: function () {
              U.confirmBox({ title: '清空所有数据？', message: '所有生词库、复习记录、检测记录都会被删除，且无法恢复。建议先导出备份。', okText: '我确定，清空', danger: true })
                .then(function (ok) {
                  if (!ok) return;
                  U.confirmBox({ title: '再确认一次', message: '真的要清空全部数据吗？', okText: '清空', danger: true }).then(function (ok2) {
                    if (!ok2) return;
                    VL.store.wipe();
                    VL.app.refreshAll();
                    U.toast('已清空所有数据', 'ok');
                  });
                });
            }
          }, '清空所有数据')
        ]),
        el('div', { class: 'callout warn mt' }, '「导出全部备份」会把所有用户一起打包；「只导出当前用户」只打包现在这个用户。导入时如果用户重名或词库重名，会自动加上「（导入）」，不会覆盖现有数据。换电脑、换浏览器或清理浏览数据之前，记得先导出备份。')
      ]),
      el('div', { class: 'card' }, [
        el('div', { class: 'card-head' }, [el('h3', { text: '外观' })]),
        el('div', { class: 'seg' }, [
          { v: 'auto', l: '跟随系统' }, { v: 'light', l: '浅色' }, { v: 'dark', l: '深色' }
        ].map(function (o) {
          return el('button', {
            class: 'chip chip-btn' + ((s.theme || 'auto') === o.v ? ' is-on' : ''), type: 'button',
            onclick: function () { VL.store.setSettings({ theme: o.v }); VL.app.applyTheme(); settingsView(host); }
          }, o.l);
        }))
      ])
    ];

    U.mount(host, [
      el('div', { class: 'view-head' }, [
        el('div', null, [el('h1', { id: 'v-settings', text: '设置与备份' }),
          el('div', { class: 'view-sub', text: '复习节奏、AI 接口、数据备份都在这里。' })])
      ])
    ].concat(body));
  }

  /* ---------- 说明 ---------- */

  function helpView(host) {
    U.mount(host, [
      el('div', { class: 'view-head' }, [
        el('div', null, [el('h1', { id: 'v-help', text: '使用说明' }),
          el('div', { class: 'view-sub', text: '五分钟上手：批量录词 → 卡片记忆 → 检测 → 阅读。' })])
      ]),
      el('div', { class: 'grid grid-2' }, [
        el('div', { class: 'card' }, [
          el('h3', { text: '1. 批量录制生词（最常用）' }),
          el('p', { class: 'text-2', text: '在「生词库」点「＋ 批量添加」，把单词一行一个粘进去（几十上百个都行），点「识别并预览」——系统会自动查中文意思，查不到的会标出来，你在表格里补上就好，确认无误再点「加入生词库」。' }),
          el('p', { class: 'text-small text-muted', text: '查词顺序：① 内置词库 → ② 你自己录过的所有生词（录过一次，下次自动带出释义）→ ③ 配了 AI 接口的话，可以点「用 AI 补全缺的释义」。' })
        ]),
        el('div', { class: 'card' }, [
          el('h3', { text: '2. 拍照识词（📷）' }),
          el('p', { class: 'text-2', text: '点「📷 拍照识词」，用手机对着单词表 / 课本词汇页拍一张（或从相册选图），再点识别：' }),
          el('ul', { class: 'list-plain' }, [
            el('li', { text: '「用 AI 识别图片」：中英对照的单词表能一次读全（含中文释义），需要先在设置里配好 AI 接口，并且用支持看图的模型（如 gpt-4o）' }),
            el('li', { text: '「用本地 OCR 识别英文」：不需要任何账号，第一次用会联网下载识别引擎（约 11MB），之后可离线；只认英文，中文释义由内置词库自动补' })
          ]),
          el('p', { class: 'text-small text-muted', text: '识别结果会直接填进预览表格，你可以勾掉不需要的词、补上缺的释义，再一次性入库。' })
        ]),
        el('div', { class: 'card' }, [
          el('h3', { text: '3. 上传自己的词表文件' }),
          el('p', { class: 'text-2', text: '「生词库 → ＋ 批量添加 → 或者选文件」可以一次选多个文件，也能把文件直接拖进去。支持的格式：' }),
          el('ul', { class: 'list-plain' }, [
            el('li', { text: 'Excel：.xlsx（序号列和表头行会自动跳过）' }),
            el('li', { text: 'Word：.docx（按段落读）' }),
            el('li', { text: '文本：.csv / .tsv / .txt / .md / .json，自动识别 UTF-8 / GBK 编码，Excel 导出的中文 CSV 不会乱码' }),
            el('li', { text: '图片：交给上面的拍照识词' }),
            el('li', { text: '旧版 .xls / .doc 请在 Office 里另存为 .xlsx / .docx；PDF 建议截图后拍照识别' })
          ]),
          el('p', { class: 'text-small text-muted', text: '所有文件都只在这台电脑的浏览器里读取，不会上传到任何服务器。读完后同样进入预览表格，勾选确认再入库。' })
        ]),
        el('div', { class: 'card' }, [
          el('h3', { text: '4. 发音' }),
          el('p', { class: 'text-2', text: '默认真人发音优先（有道真人录音，联网时使用），断网或句子较长时自动回落到系统语音。设置 → 发音 里可以切换：只用真人 / 只用系统 / 美音或英音，还能试听对比。' }),
          el('p', { class: 'text-small text-muted', text: '系统语音想更好听：iPhone 在 设置 → 辅助功能 → 朗读内容 → 声音 → 英语 里下载 Siri 声音；Windows 上用 Edge 能拿到更自然的在线语音。带 ★ 的语音就是这类。' })
        ]),
        el('div', { class: 'card' }, [
          el('h3', { text: '5. 自己改释义' }),
          el('p', { class: 'text-2', text: '释义永远是你说了算：在生词列表里点释义那一格就能直接改（回车保存）；卡片背面有「✎ 修改释义」；文章里点生词可以在收录前先改。' })
        ]),
        el('div', { class: 'card' }, [
          el('h3', { text: '6. 卡片记忆与艾宾浩斯' }),
          el('p', { class: 'text-2', text: '「卡片记忆」先给你今天到期的生词，翻卡看释义后按 忘记/模糊/认识/太简单 评分。答对一次前进一个节点：5 分钟 → 30 分钟 → 12 小时 → 1 天 → 2 天 → 4 天 → 7 天 → 15 天 → 30 天 → 60 天，走完就是「已掌握」。' }),
          el('div', { class: 'kbd-help' }, [
            el('span', { class: 'kbd', text: '空格' }), el('span', { text: '翻到卡片背面 / 回到正面' }),
            el('span', { class: 'kbd', text: '1 2 3 4' }), el('span', { text: '忘记 / 模糊 / 认识 / 太简单' }),
            el('span', { class: 'kbd', text: 'S' }), el('span', { text: '朗读这个单词' })
          ])
        ]),
        el('div', { class: 'card' }, [
          el('h3', { text: '7. 生词检测' }),
          el('p', { class: 'text-2', text: '词义匹配、中英选择、拼写填空、听音选词四种题型。结果会写回复习计划：答对进入下一个节点，答错回到起点，1 分钟后重新出现。' })
        ]),
        el('div', { class: 'card' }, [
          el('h3', { text: '8. 文章阅读 + 阅读题' }),
          el('p', { class: 'text-2', text: '选「我的生词库」或人教版某一册 / 中考高考考纲词表，点「本地生成」就能离线得到一篇用这些词写成的短文和阅读理解题；文章里的生词点一下就能（改完释义）加入生词库。配了 AI 接口还能用「AI 生成」写更自然的文章。' })
        ]),
        el('div', { class: 'card' }, [
          el('h3', { text: '9. 数据与备份' }),
          el('p', { class: 'text-2', text: '所有数据只保存在本机浏览器。换设备或清理浏览数据前，到「设置与备份」导出 JSON；也可以在「归档」里单独导出某个词库。' })
        ]),
        el('div', { class: 'card' }, [
          el('h3', { text: '在手机上用 / 装成 App' }),
          el('p', { class: 'text-2', text: '双击文件夹里的「一键启动（含手机访问）.bat」，手机连同一个 Wi-Fi，用终端里显示的 192.168.x.x:5180 地址打开即可。或者把整个文件夹传到静态托管后「添加到主屏幕」，断网也能用。' })
        ])
      ])
    ]);
  }

  VL.views = {
    dashboard: dashboard, words: wordsView, archive: archiveView,
    settings: settingsView, help: helpView,
    wsState: ws,
    addWordModal: addWordModal, batchAddModal: batchAddModal, importModal: importModal,
    pickFromGradeModal: pickFromGradeModal, newBookModal: newBookModal,
    editWordModal: editWordModal, editMeaningModal: editMeaningModal,
    startMeaningEdit: startMeaningEdit, exportBookFile: exportBookFile,
    barChart: barChart, ring: ring, statCard: statCard
  };
})();
