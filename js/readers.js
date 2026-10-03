/* readers.js — 本机读取各种格式的词表文件（全部在浏览器里完成，不上传任何东西）
 *   .txt / .csv / .tsv / .md / .json  → 文本（自动识别 UTF-8 / GBK / UTF-16 编码）
 *   .xlsx / .docx                     → 自己解 zip + 解析 XML，不需要联网、不需要装插件
 *   .xls / .doc                       → 旧版二进制格式，提示另存为新格式
 *   .pdf                              → 提示截图后用「拍照识词」
 *   image/*                           → 交给拍照识词流程
 */
(function () {
  'use strict';
  var VL = (window.VL = window.VL || {});

  function byLocal(root, name) {
    var all = root.getElementsByTagName('*');
    var out = [];
    for (var i = 0; i < all.length; i++) if (all[i].localName === name) out.push(all[i]);
    return out;
  }

  function readArrayBuffer(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { reject(fr.error || new Error('读取失败')); };
      fr.readAsArrayBuffer(file);
    });
  }

  // 文本文件：自动处理 BOM，UTF-8 解不出来就按 GBK 解（Excel 导出的中文 CSV 常见）
  function decodeText(buf) {
    var bytes = new Uint8Array(buf);
    if (!bytes.length) return '';
    if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) return new TextDecoder('utf-8').decode(bytes.subarray(3));
    if (bytes[0] === 0xFF && bytes[1] === 0xFE) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
    if (bytes[0] === 0xFE && bytes[1] === 0xFF) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
    var utf8 = new TextDecoder('utf-8').decode(buf);
    if (utf8.indexOf('\uFFFD') >= 0) {
      try { return new TextDecoder('gbk').decode(buf); } catch (e) { return utf8; }
    }
    return utf8;
  }

  function readTextSmart(file) {
    return readArrayBuffer(file).then(decodeText);
  }

  /* ---------- zip（xlsx / docx 本质是 zip） ---------- */

  function inflateRaw(bytes) {
    if (typeof DecompressionStream === 'undefined') {
      return Promise.reject(new Error('这个浏览器版本太旧，读不了 xlsx/docx，请另存为 .csv 或 .txt'));
    }
    var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Response(stream).arrayBuffer().then(function (buf) { return new Uint8Array(buf); });
  }

  function unzip(arrayBuffer) {
    var bytes = new Uint8Array(arrayBuffer);
    var dv = new DataView(arrayBuffer);
    var eocd = -1;
    for (var i = bytes.length - 22; i >= 0 && i >= bytes.length - 22 - 65535; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) return Promise.reject(new Error('不是有效的 xlsx / docx 文件'));
    var count = dv.getUint16(eocd + 10, true);
    var p = dv.getUint32(eocd + 16, true);
    var entries = [];
    var decoder = new TextDecoder('utf-8');
    for (var n = 0; n < count; n++) {
      if (p + 46 > bytes.length || dv.getUint32(p, true) !== 0x02014b50) break;
      var method = dv.getUint16(p + 10, true);
      var compSize = dv.getUint32(p + 20, true);
      var nameLen = dv.getUint16(p + 28, true);
      var extraLen = dv.getUint16(p + 30, true);
      var commentLen = dv.getUint16(p + 32, true);
      var localOffset = dv.getUint32(p + 42, true);
      var name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
      if (dv.getUint32(localOffset, true) === 0x04034b50) {
        var lNameLen = dv.getUint16(localOffset + 26, true);
        var lExtraLen = dv.getUint16(localOffset + 28, true);
        var dataStart = localOffset + 30 + lNameLen + lExtraLen;
        entries.push({ name: name, method: method, data: bytes.subarray(dataStart, dataStart + compSize) });
      }
      p += 46 + nameLen + extraLen + commentLen;
    }
    return Promise.all(entries.map(function (e) {
      if (e.method === 0) return Promise.resolve({ name: e.name, bytes: e.data });
      if (e.method !== 8) return Promise.resolve(null);
      return inflateRaw(e.data).then(function (out) { return { name: e.name, bytes: out }; }, function () { return null; });
    })).then(function (list) {
      var map = Object.create(null);
      list.forEach(function (x) { if (x) map[x.name] = x.bytes; });
      return map;
    });
  }

  /* ---------- xlsx → 表格 ---------- */

  function colIndex(letters) {
    var s = String(letters || '').toUpperCase();
    var n = 0;
    for (var i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64);
    return n - 1;
  }

  function xlsxRows(map) {
    var dec = new TextDecoder('utf-8');
    var shared = [];
    if (map['xl/sharedStrings.xml']) {
      var sdoc = new DOMParser().parseFromString(dec.decode(map['xl/sharedStrings.xml']), 'application/xml');
      shared = byLocal(sdoc, 'si').map(function (si) {
        return byLocal(si, 't').map(function (t) { return t.textContent; }).join('');
      });
    }
    var sheetName = Object.keys(map).filter(function (k) { return /^xl\/worksheets\/sheet\d+\.xml$/i.test(k); }).sort()[0];
    if (!sheetName) throw new Error('这个 Excel 里没有找到工作表');
    var doc = new DOMParser().parseFromString(dec.decode(map[sheetName]), 'application/xml');
    var rows = [];
    byLocal(doc, 'row').forEach(function (row) {
      var cells = [];
      byLocal(row, 'c').forEach(function (c) {
        var col = colIndex((c.getAttribute('r') || 'A').replace(/[^A-Za-z]/g, '')) || 0;
        var t = c.getAttribute('t');
        var val = '';
        if (t === 's') {
          var idx = Number((byLocal(c, 'v')[0] || {}).textContent);
          val = shared[idx] || '';
        } else if (t === 'inlineStr') {
          val = byLocal(c, 't').map(function (x) { return x.textContent; }).join('');
        } else {
          var v = byLocal(c, 'v')[0];
          val = v ? v.textContent : '';
        }
        cells[col] = String(val == null ? '' : val).trim();
      });
      var out = [];
      for (var i = 0; i < cells.length; i++) out.push(cells[i] === undefined ? '' : cells[i]);
      rows.push(out);
    });
    return rows;
  }

  // 表格 → 文本行（丢掉纯数字的序号列，其余用制表符连起来，交给统一的解析器）
  var HEADER_RE = /^(序号|编号|no\.?|index|#|单词|词汇|生词|word|words|词性|pos\.?|part of speech|中文|释义|意思|含义|meaning|translation|翻译|音标|phonetic|ipa|例句|example|sentence|备注|note)$/i;

  function rowsToText(rows) {
    var lines = [];
    (rows || []).forEach(function (cells) {
      var c = (cells || []).slice();
      while (c.length && /^\d{1,3}$/.test(c[0])) c.shift();
      while (c.length && c[c.length - 1] === '') c.pop();
      if (!c.length) return;
      if (!/[A-Za-z\u4e00-\u9fa5]/.test(c.join(''))) return;
      // 表头行（单词 / 词性 / 中文…）直接跳过
      var filled = c.filter(function (x) { return String(x).trim() !== ''; });
      if (filled.length && filled.every(function (x) { return HEADER_RE.test(String(x).trim()); })) return;
      lines.push(c.join('\t'));
    });
    return lines.join('\n');
  }

  /* ---------- docx → 文本 ---------- */

  function docxText(map) {
    var bytes = map['word/document.xml'];
    if (!bytes) throw new Error('这个 Word 文档里没有正文');
    var doc = new DOMParser().parseFromString(new TextDecoder('utf-8').decode(bytes), 'application/xml');
    var parts = [];
    byLocal(doc, 'p').forEach(function (p) {
      var line = byLocal(p, 't').map(function (t) { return t.textContent; }).join('').trim();
      if (line) parts.push(line);
    });
    return parts.join('\n');
  }

  /* ---------- 统一入口 ---------- */

  function extOf(name) {
    var m = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
    return m ? m[1] : '';
  }

  function parseFile(file) {
    var ext = extOf(file.name);
    if (/^image\//.test(file.type) || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'heic', 'heif'].indexOf(ext) >= 0) {
      return Promise.resolve({ kind: 'image', name: file.name });
    }
    if (ext === 'xlsx' || ext === 'xlsm') {
      return readArrayBuffer(file).then(unzip).then(function (map) {
        return { kind: 'text', name: file.name, text: rowsToText(xlsxRows(map)), note: 'Excel 表格' };
      }).catch(function (e) { return { kind: 'error', name: file.name, message: '读取 Excel 失败：' + e.message }; });
    }
    if (ext === 'docx') {
      return readArrayBuffer(file).then(unzip).then(function (map) {
        return { kind: 'text', name: file.name, text: docxText(map), note: 'Word 文档' };
      }).catch(function (e) { return { kind: 'error', name: file.name, message: '读取 Word 失败：' + e.message }; });
    }
    if (ext === 'xls' || ext === 'doc') {
      return Promise.resolve({
        kind: 'error', name: file.name,
        message: '旧版 .' + ext + ' 格式不支持（这是二进制老格式）。请在 Excel / Word 里「另存为」.xlsx 或 .docx，或另存为 .csv 再上传。'
      });
    }
    if (ext === 'pdf') {
      return Promise.resolve({
        kind: 'error', name: file.name,
        message: 'PDF 不能直接读词。建议把 PDF 那页截图 / 拍照，然后用上面的「拍照识词」识别，一样能进词库。'
      });
    }
    if (['txt', 'csv', 'tsv', 'md', 'markdown', 'text', 'json', 'list'].indexOf(ext) >= 0 || /^text\//.test(file.type) || !ext) {
      return readTextSmart(file).then(function (text) {
        if (ext === 'json') {
          var parsed = VL.util.safeJSON(text);
          if (parsed && Array.isArray(parsed.words)) {
            return {
              kind: 'text', name: file.name, note: 'JSON 词表',
              text: parsed.words.map(function (w) {
                if (typeof w === 'string') return w;
                return [w.term || w.word || '', w.pos || '', w.meaning || w.cn || ''].filter(Boolean).join('\t');
              }).join('\n')
            };
          }
        }
        return { kind: 'text', name: file.name, text: text, note: '文本' };
      }).catch(function (e) { return { kind: 'error', name: file.name, message: '读取失败：' + e.message }; });
    }
    return Promise.resolve({ kind: 'error', name: file.name, message: '不认识的格式（.' + (ext || '?') + '）。支持的格式见下面说明。' });
  }

  VL.readers = {
    parseFile: parseFile,
    readTextSmart: readTextSmart,
    decodeText: decodeText,
    unzip: unzip,
    xlsxRows: xlsxRows,
    rowsToText: rowsToText,
    docxText: docxText,
    extOf: extOf
  };
})();
