/* ailookup.js — 用大模型查生词（可选功能）
 * 当内置词库和「你自己录过的生词」里都查不到时，可以用设置里的 AI 接口批量查释义。
 * 只用你填的接口，Key 只存在本机。
 */
(function () {
  'use strict';
  var VL = (window.VL = window.VL || {});
  var U = VL.util;

  function enabled() {
    var ai = VL.store.settings().ai || {};
    return !!(ai.apiKey && ai.baseUrl);
  }

  function buildPrompt(terms) {
    return [
      '你是英汉词典。请为下面每个英文单词给出适合中国中小学生的词条信息。',
      '单词列表：',
      terms.join(', '),
      '',
      '要求：',
      '1. meaning 用简明中文，多个义项用「；」分隔，最多 3 个，不要写英文解释；',
      '2. pos 用 n. / v. / adj. / adv. / prep. / conj. / pron. 这类缩写；',
      '3. phonetic 用国际音标（不带斜杠）；',
      '4. example 造一个不超过 10 个词的英文例句，exampleCn 是它的中文翻译。',
      '只输出 JSON，不要任何多余文字，格式：',
      '{"words":[{"term":"apple","pos":"n.","meaning":"苹果","phonetic":"ˈæpl","example":"I eat an apple every day.","exampleCn":"我每天吃一个苹果。"}]}',
      '注意：必须为列表里的每个单词都返回一条，term 用原样小写形式。'
    ].join('\n');
  }

  function translate(terms) {
    var list = (terms || []).map(function (t) { return String(t || '').trim(); }).filter(Boolean);
    if (!list.length) return Promise.resolve([]);
    if (!enabled()) return Promise.reject(new Error('还没有配置 AI 接口（设置与备份 → AI 文章生成）'));

    var ai = VL.store.settings().ai;
    var url = String(ai.baseUrl).replace(/\/+$/, '') + '/chat/completions';
    var body = {
      model: ai.model || 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        { role: 'system', content: '你是一部可靠的英汉词典，只输出合法 JSON。' },
        { role: 'user', content: buildPrompt(list) }
      ]
    };
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + ai.apiKey },
      body: JSON.stringify(body)
    }).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (t) {
          throw new Error('接口返回 ' + res.status + '：' + String(t).slice(0, 160));
        });
      }
      return res.json();
    }).then(function (json) {
      var content = json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
      if (!content) throw new Error('接口没有返回内容');
      var data = U.extractJSON(content);
      if (!data || !data.words) throw new Error('模型输出不是有效的词条 JSON');
      return data.words.map(function (w) {
        return {
          term: String(w.term || w.word || '').trim(),
          pos: String(w.pos || '').trim(),
          meaning: String(w.meaning || w.cn || '').trim(),
          phonetic: String(w.phonetic || w.ipa || '').replace(/^\/|\/$/g, '').trim(),
          example: String(w.example || '').trim(),
          exampleCn: String(w.exampleCn || '').trim()
        };
      }).filter(function (w) { return w.term; });
    });
  }

  VL.ailookup = {
    enabled: enabled,
    translate: translate,
    buildPrompt: buildPrompt,
    readImage: readImage,
    ocrImage: ocrImage,
    wordsFromText: wordsFromText
  };

  /* ---------- 拍照识词 ---------- */

  // ① 用 AI 看图（需要配置接口 + 支持图片的模型，中文释义也能一起读出来）
  function readImage(dataUrl) {
    if (!enabled()) return Promise.reject(new Error('还没有配置 AI 接口（设置与备份 → AI 接口）'));
    var ai = VL.store.settings().ai;
    var url = String(ai.baseUrl).replace(/\/+$/, '') + '/chat/completions';
    var prompt = [
      '这是一张英语单词表 / 教材页面的照片。',
      '请把照片里出现的英语单词全部提取出来，并给出对应的中文释义。',
      '要求：',
      '1. 只提取真正的英语单词（跳过页码、题号、中文标题、练习题指令等无关文字）；',
      '2. 如果照片里本来就有中文释义，就照抄照片里的释义；没有的话你补一个常用释义；',
      '3. meaning 用简明中文，多个义项用「；」分隔；pos 用 n. / v. / adj. / adv. 这类缩写；',
      '4. 按在照片里出现的顺序输出；',
      '5. 只输出 JSON，不要任何解释：',
      '{"words":[{"term":"apple","pos":"n.","meaning":"苹果"}]}'
    ].join('\n');
    var body = {
      model: ai.model || 'gpt-4o-mini',
      temperature: 0.1,
      messages: [
        { role: 'system', content: '你是英语单词表识别助手，只输出合法 JSON。' },
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: dataUrl } }
          ]
        }
      ]
    };
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + ai.apiKey },
      body: JSON.stringify(body)
    }).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (t) {
          var msg = String(t).slice(0, 200);
          if (/model|vision|image|multimodal/i.test(msg)) msg += '（当前模型可能不支持看图，换成 gpt-4o / qwen-vl-max / glm-4v 这类支持图片的模型试试）';
          throw new Error('接口返回 ' + res.status + '：' + msg);
        });
      }
      return res.json();
    }).then(function (json) {
      var content = json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
      if (!content) throw new Error('接口没有返回内容');
      var data = U.extractJSON(content);
      if (!data || !data.words) throw new Error('没有从图片里识别出单词');
      return data.words.map(function (w) {
        return {
          term: String(w.term || w.word || '').trim(),
          pos: String(w.pos || '').trim(),
          meaning: String(w.meaning || w.cn || '').trim()
        };
      }).filter(function (w) { return /^[A-Za-z]/.test(w.term); });
    });
  }

  /* ---------- ② 本地 OCR（Tesseract，联网下载识别引擎后在本机跑） ---------- */

  var tesseractPromise = null;
  var OCR_CDNS = [
    'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.0/dist/tesseract.min.js',
    'https://unpkg.com/tesseract.js@5.1.0/dist/tesseract.min.js'
  ];

  function loadTesseract() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (tesseractPromise) return tesseractPromise;
    tesseractPromise = new Promise(function (resolve, reject) {
      var i = 0;
      function tryNext() {
        if (i >= OCR_CDNS.length) { tesseractPromise = null; reject(new Error('识别引擎下载失败，请检查网络')); return; }
        var s = document.createElement('script');
        s.src = OCR_CDNS[i++];
        s.onload = function () { window.Tesseract ? resolve(window.Tesseract) : tryNext(); };
        s.onerror = function () { tryNext(); };
        document.head.appendChild(s);
      }
      tryNext();
    });
    return tesseractPromise;
  }

  // 只抠英文单词：中文释义在识别完之后由查词链自动补
  function wordsFromText(text) {
    var list = String(text || '').match(/[A-Za-z][A-Za-z'’-]{1,20}/g) || [];
    var seen = Object.create(null);
    var out = [];
    list.forEach(function (w) {
      var k = w.toLowerCase().replace(/[’]/g, "'");
      if (k.length < 2 || seen[k]) return;
      seen[k] = 1;
      out.push(w);
    });
    return out;
  }

  function ocrImage(dataUrl, onProgress) {
    var LANGS = [
      {
        // 只把语言包指到 jsDelivr（国内可访问，比默认的 tessdata 服务器稳）
        langPath: 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0'
      },
      {}   // 再试一次默认配置
    ];
    function attempt(i) {
      return loadTesseract().then(function (T) {
        var opts = Object.assign({}, LANGS[i], {
          logger: function (m) { if (onProgress && m && m.status) onProgress(m); }
        });
        return T.recognize(dataUrl, 'eng', opts);
      }).catch(function (err) {
        if (i + 1 < LANGS.length) {
          if (onProgress) onProgress({ status: '换一个下载源重试中' });
          return attempt(i + 1);
        }
        var detail = (err && err.name ? err.name + ': ' : '') + (err && err.message ? err.message : '识别失败');
        throw new Error(detail + '（识别引擎第一次用需要联网下载语言包约 11MB；如果一直失败，可以改用「用 AI 识别图片」）');
      });
    }
    return attempt(0).then(function (res) {
      var text = (res && res.data && res.data.text) || '';
      return { text: text, words: wordsFromText(text) };
    });
  }
})();
