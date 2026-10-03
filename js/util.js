/* util.js — 基础工具：DOM、时间、字符串、提示、弹窗、朗读 */
(function () {
  'use strict';
  var VL = (window.VL = window.VL || {});

  /* ---------- DOM ---------- */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  // el('div', {class:'x', text:'hi', onclick:fn}, [child, 'text'])
  function el(tag, props, children) {
    var node = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'html') { node.innerHTML = v; return; }
        if (k === 'text') { node.textContent = v; return; }
        if (k === 'class') { node.className = v; return; }
        if (k === 'dataset') { Object.keys(v).forEach(function (d) { node.dataset[d] = v[d]; }); return; }
        if (k === 'style' && typeof v === 'object') { Object.keys(v).forEach(function (s) { node.style[s] = v[s]; }); return; }
        if (k.slice(0, 2) === 'on' && typeof v === 'function') { node.addEventListener(k.slice(2), v); return; }
        if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'hidden' || k === 'selected') { node[k] = v; return; }
        node.setAttribute(k, v);
      });
    }
    appendAll(node, children);
    return node;
  }

  function appendAll(node, children) {
    if (children === null || children === undefined || children === false) return node;
    if (Array.isArray(children)) {
      children.forEach(function (c) { appendAll(node, c); });
      return node;
    }
    node.appendChild(children instanceof Node ? children : document.createTextNode(String(children)));
    return node;
  }

  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); return node; }
  function mount(node, children) { clear(node); appendAll(node, children); return node; }

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* ---------- 时间 ---------- */

  var MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;

  function startOfDay(ts) {
    var d = new Date(ts === undefined ? Date.now() : ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  function dayKey(ts) {
    var d = new Date(ts === undefined ? Date.now() : ts);
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
  }
  function daysAgoKey(n) { return dayKey(startOfDay() - n * DAY); }

  function fmtDuration(ms) {
    if (ms < 0) ms = 0;
    if (ms < MIN) return Math.max(1, Math.round(ms / 1000)) + ' 秒';
    if (ms < HOUR) return Math.round(ms / MIN) + ' 分钟';
    if (ms < DAY) {
      var h = Math.floor(ms / HOUR), m = Math.round((ms % HOUR) / MIN);
      return m ? h + ' 小时 ' + m + ' 分' : h + ' 小时';
    }
    var d = Math.floor(ms / DAY), hh = Math.round((ms % DAY) / HOUR);
    return hh ? d + ' 天 ' + hh + ' 小时' : d + ' 天';
  }

  function fmtWhen(ts) {
    if (!ts) return '—';
    var diff = ts - Date.now();
    if (diff <= 0) return '现在';
    return fmtDuration(diff) + '后';
  }

  function fmtDateTime(ts) {
    if (!ts) return '—';
    var d = new Date(ts);
    var p = function (n) { return n < 10 ? '0' + n : '' + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function fmtDate(ts) {
    if (!ts) return '—';
    var d = new Date(ts);
    var p = function (n) { return n < 10 ? '0' + n : '' + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  /* ---------- 数组 / 字符串 ---------- */

  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function sample(arr, n) { return shuffle(arr).slice(0, n); }

  function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function uniqBy(arr, keyFn) {
    var seen = Object.create(null), out = [];
    (arr || []).forEach(function (x) {
      var k = keyFn(x);
      if (k === undefined || k === null || k === '') return;
      if (seen[k]) return;
      seen[k] = 1; out.push(x);
    });
    return out;
  }

  function groupBy(arr, keyFn) {
    var out = Object.create(null);
    (arr || []).forEach(function (x) {
      var k = keyFn(x);
      if (!out[k]) out[k] = [];
      out[k].push(x);
    });
    return out;
  }

  function debounce(fn, ms) {
    var t = null;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms || 200);
    };
  }

  // 归一化英文单词：小写、去首尾空格、折叠内部空格
  function normTerm(s) {
    return String(s === null || s === undefined ? '' : s).trim().replace(/\s+/g, ' ').toLowerCase();
  }

  function highlight(text, query) {
    var t = String(text === null || text === undefined ? '' : text);
    var q = String(query || '').trim();
    if (!q) return esc(t);
    var i = t.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return esc(t);
    return esc(t.slice(0, i)) + '<mark>' + esc(t.slice(i, i + q.length)) + '</mark>' + esc(t.slice(i + q.length));
  }

  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one)); }

  function pct(a, b) { return b ? Math.round((a / b) * 100) : 0; }

  /* ---------- 提示 ---------- */

  var toastHost = null;
  function toast(msg, kind, ms) {
    if (!toastHost) toastHost = $('#toastHost');
    if (!toastHost) return null;
    var node = el('div', { class: 'toast' + (kind ? ' ' + kind : ''), role: kind === 'error' ? 'alert' : 'status' }, msg);
    toastHost.appendChild(node);
    var t = setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, ms || (kind === 'error' ? 5200 : 2600));
    node.addEventListener('click', function () { clearTimeout(t); if (node.parentNode) node.parentNode.removeChild(node); });
    return node;
  }

  /* ---------- 弹窗 ---------- */

  var modalHost, modalTitleEl, modalBodyEl, modalFootEl, lastFocus, escHandler = null, onCloseCb = null;

  function initModal() {
    modalHost = $('#modalHost');
    modalTitleEl = $('#modalTitle');
    modalBodyEl = $('#modalBody');
    modalFootEl = $('#modalFoot');
    modalHost.addEventListener('click', function (e) {
      if (e.target.getAttribute && e.target.getAttribute('data-close')) closeModal();
    });
  }

  function openModal(opts) {
    if (!modalHost) initModal();
    var o = opts || {};
    lastFocus = document.activeElement;
    var box = $('.modal', modalHost);
    box.className = 'modal' + (o.size ? ' ' + o.size : '');
    modalTitleEl.textContent = o.title || '';
    mount(modalBodyEl, o.body);
    mount(modalFootEl, o.foot);
    onCloseCb = o.onClose || null;
    modalHost.hidden = false;
    if (!escHandler) {
      escHandler = function (e) { if (e.key === 'Escape' && !modalHost.hidden) { e.stopPropagation(); closeModal(); } };
      document.addEventListener('keydown', escHandler, true);
    }
    var focusable = $('input, select, textarea, button.btn-primary', modalBodyEl) || $('button', modalFootEl);
    if (focusable) setTimeout(function () { focusable.focus(); }, 30);
    return { body: modalBodyEl, foot: modalFootEl, close: closeModal };
  }

  function closeModal() {
    if (!modalHost || modalHost.hidden) return;
    modalHost.hidden = true;
    mount(modalBodyEl, null); mount(modalFootEl, null);
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
    var cb = onCloseCb; onCloseCb = null;
    if (cb) cb();
  }

  function confirmBox(opts) {
    var o = opts || {};
    return new Promise(function (resolve) {
      var settled = false;
      var ok = el('button', {
        class: 'btn ' + (o.danger ? 'btn-danger' : 'btn-primary'), type: 'button',
        onclick: function () { settled = true; closeModal(); resolve(true); }
      }, o.okText || '确定');
      var cancel = el('button', { class: 'btn', type: 'button', onclick: function () { settled = true; closeModal(); resolve(false); } }, o.cancelText || '取消');
      openModal({
        title: o.title || '请确认', size: 'narrow',
        body: el('div', null, [el('p', { text: o.message || '' }), o.detail ? el('p', { class: 'text-small text-muted', text: o.detail }) : null]),
        foot: [cancel, ok],
        onClose: function () { if (!settled) resolve(false); }
      });
    });
  }

  // 简易表单弹窗：fields = [{name,label,type,value,placeholder,hint,options,required}]
  function formModal(opts) {
    var o = opts || {};
    return new Promise(function (resolve) {
      var inputs = {};
      var body = el('div', { class: 'stack' }, (o.fields || []).map(function (f) {
        var input;
        if (f.type === 'textarea') {
          input = el('textarea', { class: 'textarea', placeholder: f.placeholder || '', value: f.value || '', rows: f.rows || 6 });
        } else if (f.type === 'select') {
          input = el('select', { class: 'select' }, (f.options || []).map(function (op) {
            return el('option', { value: op.value, selected: String(op.value) === String(f.value) }, op.label);
          }));
        } else if (f.type === 'checkbox') {
          input = el('input', { type: 'checkbox', class: 'input', checked: !!f.value });
        } else {
          input = el('input', { class: 'input', type: f.type || 'text', placeholder: f.placeholder || '', value: f.value || '' });
        }
        inputs[f.name] = input;
        var field = el('div', { class: 'field' }, [el('label', { text: f.label || f.name }), input, f.hint ? el('div', { class: 'hint', text: f.hint }) : null]);
        if (f.type === 'checkbox') {
          mount(field, el('label', { class: 'check-row' }, [input, f.label || f.name]));
        }
        return field;
      }));
      function collect() {
        var out = {};
        (o.fields || []).forEach(function (f) {
          var v = inputs[f.name].type === 'checkbox' ? inputs[f.name].checked : inputs[f.name].value;
          out[f.name] = typeof v === 'string' ? v.trim() : v;
        });
        return out;
      }
      var ok = el('button', {
        class: 'btn btn-primary', type: 'button', onclick: function () {
          var values = collect();
          var missing = (o.fields || []).filter(function (f) { return f.required && !values[f.name]; });
          if (missing.length) { toast('请填写：' + missing.map(function (f) { return f.label || f.name; }).join('、'), 'warn'); return; }
          closeModal(); resolve(values);
        }
      }, o.okText || '确定');
      openModal({ title: o.title || '编辑', size: o.size || 'narrow', body: body, foot: [el('button', { class: 'btn', type: 'button', onclick: function () { closeModal(); resolve(null); } }, '取消'), ok], onClose: function () { resolve(null); } });
      var enterTarget = body.querySelector('input, textarea');
      body.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || (e.target.tagName !== 'TEXTAREA'))) { e.preventDefault(); ok.click(); }
      });
    });
  }

  function resolvePromiseClose(value) { closeModal(); return Promise.resolve(value); }

  /* ---------- 文件 ---------- */

  function download(filename, content, mime) {
    var blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = el('a', { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 400);
  }

  function readFile(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result)); };
      fr.onerror = function () { reject(fr.error); };
      fr.readAsText(file, 'utf-8');
    });
  }

  function readImageFile(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result)); };   // data:image/...;base64,...
      fr.onerror = function () { reject(fr.error); };
      fr.readAsDataURL(file);
    });
  }

  // 图片 → dataURL，顺便缩放（手机拍的照片太大，缩放后识别更快也更准）
  function imageToDataURL(file, maxSize, quality) {
    return new Promise(function (resolve, reject) {
      readImageFile(file).then(function (dataUrl) {
        var img = new Image();
        img.onload = function () {
          var max = maxSize || 1600;
          var w = img.width, h = img.height;
          if (w <= max && h <= max) { resolve(dataUrl); return; }
          var scale = Math.min(max / w, max / h);
          var canvas = document.createElement('canvas');
          canvas.width = Math.round(w * scale);
          canvas.height = Math.round(h * scale);
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          try { resolve(canvas.toDataURL('image/jpeg', quality || 0.85)); }
          catch (e) { resolve(dataUrl); }
        };
        img.onerror = function () { reject(new Error('这张图片读不出来，换一张试试（支持 jpg / png / heic 转成的图片）')); };
        img.src = dataUrl;
      }).catch(reject);
    });
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { toast('已复制到剪贴板', 'ok'); },
        function () { toast('复制失败，请手动选择文本', 'error'); });
    }
    var ta = el('textarea', { value: text, style: { position: 'fixed', left: '-9999px' } });
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('已复制到剪贴板', 'ok'); } catch (e) { toast('复制失败', 'error'); }
    document.body.removeChild(ta);
  }

  /* ---------- 朗读 ---------- */

  var voices = [];
  function loadVoices() {
    if (!window.speechSynthesis) return;
    voices = window.speechSynthesis.getVoices() || [];
  }
  if (window.speechSynthesis) {
    loadVoices();
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
  }

  function ttsSupported() { return !!window.speechSynthesis; }

  function pickVoice(prefer) {
    if (!voices.length) loadVoices();
    var en = voices.filter(function (v) { return /^en/i.test(v.lang || ''); });
    if (!en.length) return null;
    if (prefer) {
      var hit = en.filter(function (v) { return v.name.toLowerCase().indexOf(String(prefer).toLowerCase()) >= 0; });
      if (hit.length) return hit[0];
    }
    // 优先挑「真人感」的系统语音（Natural / Online / Neural / Siri 等）
    var pref = [
      'Natural', 'Online', 'Neural', 'Siri', 'Google US English', 'Aria', 'Jenny', 'Guy',
      'Samantha', 'Daniel', 'Karen', 'Microsoft Zira', 'Alex'
    ];
    for (var i = 0; i < pref.length; i++) {
      var m = en.filter(function (v) { return v.name.indexOf(pref[i]) >= 0; });
      if (m.length) return m[0];
    }
    var us = en.filter(function (v) { return /en-US/i.test(v.lang); });
    return us[0] || en[0];
  }

  function speak(text, opts) {
    var o = opts || {};
    var cfg = (VL.store && VL.store.settings) ? VL.store.settings() : {};
    var source = o.source || cfg.speakSource || 'auto';
    var str = String(text || '').trim();
    if (!str) return false;

    // 真人发音优先（联网时用有道的真人录音，失败自动回落到系统语音）
    if (source !== 'system' && str.length <= 90) {
      playReal(str, cfg.accent).then(function (ok) {
        if (ok) return;
        if (source === 'real') toast('真人发音需要联网，已改用系统语音', 'warn', 2800);
        systemSpeak(str, o, cfg);
      });
      return true;
    }
    return systemSpeak(str, o, cfg);
  }

  var audioEl = null;
  var realSeq = 0;

  function realSources(text, accent) {
    var t = encodeURIComponent(text);
    var type = accent === 'uk' ? 1 : 2;
    return [
      'https://dict.youdao.com/dictvoice?audio=' + t + '&type=' + type,
      'https://fanyi.baidu.com/gettts?lan=' + (accent === 'uk' ? 'uk' : 'en') + '&text=' + t + '&spd=3&source=web'
    ];
  }

  // 用 <audio> 直接播放真人录音：媒体元素不受 CORS 限制，联网就能用
  function playReal(text, accent) {
    return new Promise(function (resolve) {
      if (!window.Audio) { resolve(false); return; }
      if (!audioEl) audioEl = new Audio();
      var seq = ++realSeq;
      var urls = realSources(text, accent);
      var i = 0;
      var settled = false;

      function next() {
        if (settled || seq !== realSeq) return;
        if (i >= urls.length) { settled = true; resolve(false); return; }
        var url = urls[i++];
        var stepDone = false;
        var timer = setTimeout(function () { if (!stepDone) { stepDone = true; detach(); next(); } }, 5000);
        function detach() {
          clearTimeout(timer);
          audioEl.oncanplay = null;
          audioEl.onerror = null;
          audioEl.onloadeddata = null;
        }
        audioEl.onerror = function () { if (stepDone) return; stepDone = true; detach(); next(); };
        audioEl.onloadeddata = function () {
          if (stepDone) return;
          stepDone = true;
          detach();
          audioEl.play().then(function () {
            if (!settled) { settled = true; resolve(true); }
          }).catch(function () {
            if (!settled) { settled = true; resolve(false); }
          });
        };
        try {
          audioEl.pause();
          audioEl.src = url;
          audioEl.load();
        } catch (e) { detach(); next(); }
      }
      next();
    });
  }

  function systemSpeak(text, o, cfg) {
    if (!ttsSupported()) { toast('当前浏览器不支持朗读', 'warn'); return false; }
    var preferVoice = o.voice !== undefined ? o.voice : cfg.ttsVoice;
    try {
      if (o.stop !== false) window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(String(text));
      var v = pickVoice(preferVoice);
      if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = 'en-US'; }
      u.rate = o.rate || cfg.ttsRate || 0.92;
      u.pitch = 1;
      window.speechSynthesis.speak(u);
      return true;
    } catch (e) { return false; }
  }

  function hasRealAudio() { return !!window.Audio; }

  function speakList(items, opts) {
    if (!ttsSupported()) return;
    window.speechSynthesis.cancel();
    (items || []).forEach(function (t) {
      var u = new SpeechSynthesisUtterance(String(t));
      var v = pickVoice((opts || {}).voice);
      if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = 'en-US'; }
      u.rate = (opts || {}).rate || 0.92;
      window.speechSynthesis.speak(u);
    });
  }

  /* ---------- 其它 ---------- */

  var _colorCache = {};
  function hashColor(str) {
    if (_colorCache[str]) return _colorCache[str];
    var h = 0, s = String(str);
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
    var c = 'hsl(' + h + ' 46% 48%)';
    _colorCache[str] = c;
    return c;
  }

  function safeJSON(text) {
    try { return JSON.parse(text); } catch (e) { return null; }
  }

  // 从可能带 ```json 包裹的文本里抽取 JSON 对象
  function extractJSON(text) {
    var s = String(text || '');
    var fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) s = fenced[1];
    var direct = safeJSON(s.trim());
    if (direct) return direct;
    var start = s.indexOf('{'), end = s.lastIndexOf('}');
    if (start >= 0 && end > start) return safeJSON(s.slice(start, end + 1));
    return null;
  }

  VL.util = {
    $: $, $$: $$, el: el, clear: clear, mount: mount, appendAll: appendAll, esc: esc, uid: uid,
    MIN: MIN, HOUR: HOUR, DAY: DAY,
    startOfDay: startOfDay, dayKey: dayKey, daysAgoKey: daysAgoKey,
    fmtDuration: fmtDuration, fmtWhen: fmtWhen, fmtDateTime: fmtDateTime, fmtDate: fmtDate,
    clamp: clamp, shuffle: shuffle, sample: sample, pickRandom: pickRandom,
    uniqBy: uniqBy, groupBy: groupBy, debounce: debounce, normTerm: normTerm,
    highlight: highlight, plural: plural, pct: pct,
    toast: toast, openModal: openModal, closeModal: closeModal, confirmBox: confirmBox,
    formModal: formModal, resolvePromiseClose: resolvePromiseClose,
    download: download, readFile: readFile, readImageFile: readImageFile, imageToDataURL: imageToDataURL, copyText: copyText,
    speak: speak, speakList: speakList, ttsSupported: ttsSupported, pickVoice: pickVoice,
    playReal: playReal, hasRealAudio: hasRealAudio, realSources: realSources,
    hashColor: hashColor, safeJSON: safeJSON, extractJSON: extractJSON
  };
})();
