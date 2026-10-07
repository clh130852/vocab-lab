/* packs.js — 导入完整词表（中考 / 高考 / 人教版 / 四六级 …）
 *
 * 数据来自公开的 qwerty-learner 词库项目（jsDelivr CDN），由浏览器直接取回本机，
 * 不经过任何中间服务器；取回来之后立刻转成本应用的词条格式，可以离线使用。
 * 只在点「导入」那一刻需要联网。
 */
(function () {
  'use strict';
  var VL = (window.VL = window.VL || {});
  var U = VL.util;
  var el = U.el;

  var CDN = 'https://cdn.jsdelivr.net/gh/Kaiyiwing/qwerty-learner@master/public';
  var INDEX_URL = 'https://cdn.jsdelivr.net/gh/Kaiyiwing/qwerty-learner@master/src/resources/dictionary.ts';
  var CACHE_KEY = 'vocablab.packcat.v1';
  var TIMEOUT = 25000;

  function fetchText(url) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { reject(new Error('网络超时（需要联网才能下载词表）')); }, TIMEOUT);
      fetch(url).then(function (r) {
        clearTimeout(timer);
        if (!r.ok) { reject(new Error('下载失败：HTTP ' + r.status)); return; }
        return r.text().then(resolve);
      }).catch(function (e) {
        clearTimeout(timer);
        reject(new Error('下载失败：' + (e && e.message ? e.message : '网络不可用')));
      });
    });
  }

  // 词条格式：[name, usphone, ukphone, trans[]]
  function normalize(rows) {
    var out = [];
    (rows || []).forEach(function (w) {
      var term = String((w && (w.name || w.word)) || '').trim();
      if (!term || !/^[A-Za-z][A-Za-z'’.\- ]*$/.test(term)) return;
      var trans = w.trans || w.translation || [];
      if (typeof trans === 'string') trans = [trans];
      var pos = '', meaning = '';
      (trans || []).forEach(function (t) {
        var s = String(t || '').trim();
        if (!s) return;
        var m = s.match(/^([a-z]+\.(?:\s*\/\s*[a-z]+\.)?)\s*(.+)$/i);
        if (m && !pos) { pos = m[1].replace(/\s/g, ''); s = m[2]; }
        meaning = meaning ? (meaning + '；' + s) : s;
      });
      out.push([term, pos, meaning, String(w.usphone || w.ukphone || '').trim()]);
    });
    return out;
  }

  function catalog(force) {
    if (!force) {
      var cached = null;
      try { cached = U.safeJSON(localStorage.getItem(CACHE_KEY) || 'null'); } catch (e) { cached = null; }
      if (cached && cached.length) return Promise.resolve(cached);
    }
    return fetchText(INDEX_URL).then(function (text) {
      var items = [];
      var re = /\{[^{}]*?url:\s*'(\/dicts\/[^']+)'[^{}]*?\}/g, m;
      while ((m = re.exec(text)) !== null) {
        var block = m[0];
        var name = (block.match(/name:\s*'([^']*)'/) || [])[1] || '';
        var desc = (block.match(/description:\s*'([^']*)'/) || [])[1] || '';
        var cat = (block.match(/category:\s*'([^']*)'/) || [])[1] || '其他';
        var len = Number((block.match(/length:\s*(\d+)/) || [])[1] || 0);
        var lang = (block.match(/languageCategory:\s*'([^']*)'/) || [])[1] || 'en';
        if (!name || lang !== 'en') continue;
        items.push({ name: name, desc: desc, category: cat, url: m[1], count: len });
      }
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(items)); } catch (e) {}
      return items;
    });
  }

  function download(item) {
    return fetchText(CDN + item.url).then(function (t) {
      var rows;
      try { rows = JSON.parse(t); } catch (e) { throw new Error('词表数据格式不对'); }
      if (!Array.isArray(rows)) rows = rows.words || rows.data || [];
      var entries = normalize(rows);
      if (!entries.length) throw new Error('这个词表里没有可用的词条');
      return entries;
    });
  }

  /* ---------- UI：导入完整词表 ---------- */

  var PRESET = [
    { name: '高考 3500（完整）', category: '推荐', desc: '含中文释义与音标，约 3800 词', url: '/dicts/GaoKao_3500.json', count: 3854 }
  ];

  var QUICK = ['中考', '高考', '人教版', '小学', '四级', '六级', '考研', '雅思', '托福', 'GRE'];
  var CAT_ORDER = { '推荐': 0, '青少年英语': 1, '中国考试': 2, '国际考试': 3 };

  function openImportModal(bookId) {
    // 一键导入组合：人教版五册 + 中考 + 高考
    var COMBO = [
      { url: '/dicts/GaoKao_3500.json', label: '高考 3500（完整）' },
      { kw: '中考核心词', label: '中考核心词' },
      { kw: '人教版七年级上册', label: '人教版七年级上' },
      { kw: '人教版七年级下册', label: '人教版七年级下' },
      { kw: '人教版八年级上册', label: '人教版八年级上' },
      { kw: '人教版八年级下册', label: '人教版八年级下' },
      { kw: '人教版九年级全册', label: '人教版九年级全册' }
    ];
    var host = null, items = [], all = [], filter = '';

    var search = el('input', {
      class: 'input', type: 'search', placeholder: '搜索词表（中考 / 高考 / 人教版 / 四级 / 雅思…）',
      oninput: function (e) { filter = e.target.value; render(); }
    });
    var quick = el('div', { class: 'seg' }, QUICK.map(function (label) {
      return el('button', {
        class: 'chip chip-btn', type: 'button',
        onclick: function () { filter = label; search.value = label; render(); }
      }, label);
    }).concat([el('button', {
      class: 'chip chip-btn', type: 'button',
      onclick: function () { filter = ''; search.value = ''; render(); }
    }, '全部')]));
    var status = el('div', { class: 'hint', text: '正在获取词表清单…（只需要联网这一次）' });
    var listHost = el('div', { class: 'stack', style: { gap: '6px', maxHeight: '46vh', overflow: 'auto' } });
    var comboBtn = el('button', { class: 'btn btn-primary', type: 'button' }, '🚀 一键导入这 7 个完整词表');
    var comboInfo = el('div', { class: 'hint', text: '人教版七上·七下·八上·八下·九全 + 中考核心词 + 高考3500，自动各建一个词库。' });

    comboBtn.addEventListener('click', function () {
      comboBtn.disabled = true;
      catalog().then(function (items) {
        var todo = [];
        COMBO.forEach(function (spec) {
          var hit = items.filter(function (it) {
            return spec.url ? it.url === spec.url
              : ((it.desc || '').indexOf(spec.kw) >= 0 || it.name.indexOf(spec.kw) >= 0);
          })[0];
          if (hit) todo.push({ item: hit, label: spec.label });
        });
        if (!todo.length) throw new Error('没找到这些词表（可能词库源变了）');
        var i = 0;
        function step() {
          if (i >= todo.length) {
            comboBtn.textContent = '✓ 全部导入完成（' + todo.length + ' 个词库）';
            U.mount(comboInfo, [el('span', { class: 'text-green', text: '完成！关掉这个窗口，去左边词库列表看看。' })]);
            if (VL.app && VL.app.refreshAll) VL.app.refreshAll();
            return;
          }
          var t = todo[i];
          comboBtn.textContent = '导入中 ' + (i + 1) + '/' + todo.length + '：' + t.label + '…';
          download(t.item).then(function (entries) {
            var b = VL.store.addBook({ name: t.label + '（' + entries.length + ' 词）', desc: '完整词表 · ' + (t.item.category || '') });
            VL.store.addWords(b.id, entries.map(function (e) {
              return { term: e[0], pos: e[1], meaning: e[2], phonetic: String(e[3] || '').replace(/^\/|\/$/g, ''), source: 'pack' };
            }));
            i += 1;
            step();
          }).catch(function (err) {
            U.mount(comboInfo, [el('span', { class: 'text-red', text: t.label + ' 导入失败：' + err.message })]);
            i += 1;
            setTimeout(step, 800);
          });
        }
        step();
      }).catch(function (err) {
        comboBtn.disabled = false;
        comboBtn.textContent = '🚀 一键导入这 7 个完整词表';
        U.toast(err.message, 'error', 6000);
      });
    });

    function render() {
      var q = U.normTerm(filter);
      var shown = all.filter(function (it) {
        return !q || it.name.toLowerCase().indexOf(q) >= 0 || (it.desc || '').toLowerCase().indexOf(q) >= 0 || it.category.indexOf(filter) >= 0;
      });
      U.mount(status, [el('span', { text: '共 ' + all.length + ' 个词表' + (q ? '，匹配 ' + shown.length + ' 个' : '') + '（每个词表点「导入」后会自动建一个新词库）' })]);
      U.mount(listHost, shown.slice(0, 120).map(function (it) {
        var btn = el('button', { class: 'btn btn-sm btn-primary', type: 'button' }, '导入');
        btn.addEventListener('click', function () {
          btn.disabled = true;
          btn.textContent = '下载中…';
          download(it).then(function (entries) {
            var name = it.name + (it.count ? '（' + entries.length + ' 词）' : '');
            var b = VL.store.addBook({ name: name, desc: '完整词表 · 来自 ' + it.category });
            var r = VL.store.addWords(b.id, entries.map(function (e) {
              return { term: e[0], pos: e[1], meaning: e[2], phonetic: String(e[3] || '').replace(/^\/|\/$/g, ''), source: 'pack' };
            }));
            VL.store.setActiveBook(b.id);
            VL.app.refreshAll();
            btn.textContent = '✓ 已导入 ' + r.added;
            U.toast('已新建词库「' + name + '」，导入 ' + r.added + ' 个词', 'ok', 5000);
          }).catch(function (err) {
            btn.disabled = false;
            btn.textContent = '导入';
            U.toast(err.message, 'error', 6000);
          });
        });
        return el('div', { class: 'row', style: { borderBottom: '1px dashed var(--border)', paddingBottom: '6px' } }, [
          el('div', { class: 'grow' }, [
            el('div', null, [el('strong', { text: it.name }), el('span', { class: 'chip', style: { marginLeft: '6px' }, text: it.category })]),
            el('div', { class: 'text-small text-muted', text: (it.count ? it.count + ' 词 · ' : '') + (it.desc || '') })
          ]),
          btn
        ]);
      }));
    }

    U.openModal({
      title: '导入完整词表', size: 'wide',
      body: el('div', { class: 'stack' }, [
        el('div', { class: 'callout' }, '这些是公开的完整词表（中考 / 高考 / 人教版 / 四六级 / 雅思托福…），带中文释义和音标。点「导入」后会新建一个同名生词库并装进去，之后完全离线可用。'),
        el('div', { class: 'card card-pad-sm' }, [el('div', { class: 'row-wrap' }, [comboBtn]), el('div', { class: 'mt' }, [comboInfo])]),
        search, quick, status, listHost
      ]),
      foot: [el('button', { class: 'btn', type: 'button', onclick: U.closeModal }, '关闭')]
    });

    // 先立刻用默认词表把列表显示出来（不用等联网），联网成功后再补全
    all = PRESET.slice();
    render();
    U.mount(status, [el('span', { text: '正在获取完整词表清单…（如果手机网络慢，下面已经可以先导入「高考 3500」）' }), el('button', {
      class: 'btn btn-sm', type: 'button', style: { marginLeft: '8px' },
      onclick: function () { loadCatalog(true); }
    }, '重试')]);

    function loadCatalog() {
      catalog().then(function (list) {
      var extra = [];
      var seen = Object.create(null);
      PRESET.concat(list).forEach(function (it) {
        if (seen[it.url] && it.category === '推荐') return;
        seen[it.url] = 1;
        extra.push(it);
      });
      all = extra.sort(function (a, b) {
        var ra = CAT_ORDER[a.category] === undefined ? 9 : CAT_ORDER[a.category];
        var rb = CAT_ORDER[b.category] === undefined ? 9 : CAT_ORDER[b.category];
        if (ra !== rb) return ra - rb;
        return (b.count || 0) - (a.count || 0);
      });
      render();
      }).catch(function (err) {
        U.mount(status, [
          el('span', { class: 'text-red', text: '在线清单获取失败：' + err.message + '（手机上可能网络不通；可以先导入下面的高考 3500）' }),
          el('button', {
            class: 'btn btn-sm', type: 'button', style: { marginLeft: '8px' },
            onclick: function () { loadCatalog(); }
          }, '重试')
        ]);
      });
    }
    loadCatalog();
  }

  VL.packs = {
    catalog: catalog,
    download: download,
    normalize: normalize,
    openImportModal: openImportModal,
    CDN: CDN,
    PRESET: PRESET
  };
})();
