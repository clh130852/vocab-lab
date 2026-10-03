/* 自检脚本： node tools/validate.js
 * 1) 语法检查所有 js  2) 词库数据完整性  3) 模板槽位可填充性
 * 4) 本地文章生成压力测试  5) 艾宾浩斯调度逻辑测试  6) 页面引用与离线缓存清单
 */
var fs = require('fs');
var path = require('path');
var cp = require('child_process');

var root = path.resolve(__dirname, '..');
var errors = [];
var warnings = [];
var passed = [];

function fail(msg) { errors.push(msg); }
function warn(msg) { warnings.push(msg); }
function ok(msg) { passed.push(msg); }

/* ---------- 1. 语法检查 ---------- */

function jsFiles() {
  var dir = path.join(root, 'js');
  return fs.readdirSync(dir).filter(function (f) { return /\.js$/.test(f); }).map(function (f) { return path.join(dir, f); });
}

jsFiles().concat([path.join(root, 'sw.js'), path.join(root, 'tools', 'serve.js'), __filename]).forEach(function (f) {
  var r = cp.spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (r.status !== 0) fail('语法错误 ' + path.relative(root, f) + '：' + (r.stderr || '').split('\n')[0]);
});
ok('语法检查：' + jsFiles().length + ' 个 js 文件');

/* ---------- 载入模块 ---------- */

var store = {};
global.window = {};
global.localStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
  setItem: function (k, v) { store[k] = String(v); },
  removeItem: function (k) { delete store[k]; }
};
global.navigator = { clipboard: null, userAgent: 'node' };

global.document = { createElement: function () { throw new Error('DOM 不可用'); } };

['util', 'dict', 'wordlists', 'templates', 'srs', 'store', 'reading', 'ailookup', 'readers', 'cards', 'test', 'views'].forEach(function (m) {
  require(path.join(root, 'js', m + '.js'));
});
var VL = global.window.VL;

/* ---------- 模块 API 交叉检查 ---------- */

var KNOWN_MODULES = {
  util: VL.util, dict: VL.dict, wordlists: VL.wordlists, srs: VL.srs,
  store: VL.store, reading: VL.reading, ailookup: VL.ailookup, readers: VL.readers,
  cards: VL.cards, test: VL.test, views: VL.views
};
var missingApi = Object.create(null);
jsFiles().forEach(function (f) {
  var code = fs.readFileSync(f, 'utf8');
  var re = /VL\.([A-Za-z_]+)\.([A-Za-z_]+)/g, m;
  while ((m = re.exec(code)) !== null) {
    var mod = m[1], api = m[2];
    if (!KNOWN_MODULES[mod]) continue;
    if (typeof KNOWN_MODULES[mod][api] === 'undefined') {
      missingApi[mod + '.' + api] = path.basename(f);
    }
  }
});
Object.keys(missingApi).forEach(function (k) { fail('调用了不存在的接口：VL.' + k + '（出现于 ' + missingApi[k] + '）'); });
if (!Object.keys(missingApi).length) ok('模块接口交叉检查：所有 VL.* 调用都能在对应模块里找到');

if (!VL || !VL.dict || !VL.store || !VL.srs || !VL.templates || !VL.reading) {
  fail('模块没有正确挂载到 window.VL');
  report();
}

/* ---------- 2. 词库数据 ---------- */

var sources = VL.dict.sources();
if (sources.length < 5) fail('内置词表数量异常：' + sources.length);

var totalRows = 0, noMeaning = 0, noExample = 0, badTag = 0, dupInSource = 0;
var validTags = Object.keys(VL.dict.TAG_LABELS);
sources.forEach(function (s) {
  var src = VL.dict.getSource(s.id);
  var seen = Object.create(null);
  src.words.forEach(function (row) {
    totalRows += 1;
    var term = String(row[0] || '').trim();
    if (!term) { fail('空词条 in ' + s.id); return; }
    if (seen[term]) { dupInSource += 1; warn('词表内重复：' + s.id + ' → ' + term); }
    seen[term] = 1;
    if (!row[2]) { noMeaning += 1; warn('缺释义：' + s.id + ' → ' + term); }
    if (!row[4]) noExample += 1;
    String(row[6] || '').split(/[,，]/).filter(Boolean).forEach(function (t) {
      if (validTags.indexOf(t.trim()) < 0) { badTag += 1; warn('未知标签：' + term + ' → ' + t); }
    });
  });
});
ok('词表：' + sources.length + ' 份 / ' + totalRows + ' 条原始词条 / 去重后 ' + VL.dict.size() + ' 个单词');
ok('例句覆盖率：' + Math.round(((totalRows - noExample) / totalRows) * 100) + '%（' + (totalRows - noExample) + '/' + totalRows + '）');
if (noMeaning) fail('有 ' + noMeaning + ' 个词条缺少中文释义');

/* ---------- 3. 模板槽位 ---------- */

function matchSlot(e, slot) {
  if (slot.allow && slot.allow.length) return slot.allow.indexOf(e.key) >= 0;
  if (slot.pos && slot.pos.length && slot.pos.indexOf(e.pos) < 0) return false;
  if (slot.tags && slot.tags.length && !e.tags.some(function (t) { return slot.tags.indexOf(t) >= 0; })) return false;
  if (slot.deny && slot.deny.indexOf(e.key) >= 0) return false;
  return true;
}

var dictAll = VL.dict.all();
VL.templates.forEach(function (t) {
  Object.keys(t.slots || {}).forEach(function (name) {
    var slot = t.slots[name];
    var cand = dictAll.filter(function (e) { return matchSlot(e, slot); });
    if (!cand.length) fail('槽位没有候选词：模板 ' + t.id + ' / ' + name);
    else if (cand.length < 4) warn('槽位候选偏少：模板 ' + t.id + ' / ' + name + '（' + cand.length + ' 个）');
  });
  if (!t.questions || t.questions.length < 3) warn('模板题量偏少：' + t.id);
});
ok('模板：' + VL.templates.length + ' 个，槽位候选检查完成');

/* ---------- 4. 本地生成压力测试 ---------- */

VL.store.load();
var genRuns = 0;
var srcPool = sources.map(function (s) { return s.id; }).concat(['all']);
var genFail = 0;
for (var i = 0; i < 300; i++) {
  var art = VL.reading.localGenerate({
    sourceId: srcPool[i % srcPool.length],
    topic: 'auto',
    level: (i % 3) + 1,
    questionCount: 6
  });
  genRuns += 1;
  var text = art.paragraphs.join(' ');
  if (!text || art.paragraphs.length < 3) { genFail += 1; warn('生成文章段数异常：' + art.templateId); continue; }
  if (/\{[^}]+\}/.test(text)) { genFail += 1; fail('文章里有未替换的占位符：' + art.templateId + ' → ' + text.match(/\{[^}]+\}/)[0]); }
  if (!art.targetWords.length) { genFail += 1; fail('文章没有目标词：' + art.templateId); }
  art.targetWords.forEach(function (w) {
    if (!new RegExp('\\b' + w.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(text)) {
      warn('目标词没有出现在文章里：' + art.templateId + ' → ' + w.term);
    }
  });
  art.questions.forEach(function (q) {
    if (/\{[^}]+\}/.test(q.stem) || q.options.some(function (o) { return /\{[^}]+\}/.test(o); })) {
      genFail += 1; fail('题目里有未替换的占位符：' + art.templateId);
    }
    if (q.options.length < 3) { genFail += 1; fail('选项太少：' + art.templateId + ' → ' + q.stem); }
    if (q.answer < 0 || q.answer >= q.options.length) { genFail += 1; fail('答案下标越界：' + art.templateId); }
    var uniq = {};
    q.options.forEach(function (o) { uniq[o] = 1; });
    if (Object.keys(uniq).length < q.options.length) { genFail += 1; fail('选项重复：' + art.templateId + ' → ' + q.stem + ' ' + JSON.stringify(q.options)); }
  });
}
if (genFail) fail('生成测试失败 ' + genFail + ' 次');
else ok('本地生成：' + genRuns + ' 次随机生成全部通过（无占位符残留、选项无重复、答案有效）');

/* ---------- 5. 导入解析 ---------- */

var parsed = VL.store.parseImportText('apple 苹果\nbanana, n., 香蕉, bəˈnɑːnə\n| careful | adj. | 仔细的 |\n# comment\n');
if (parsed.length !== 3) fail('导入解析异常，期望 3 条，实际 ' + parsed.length);
else {
  var p1 = VL.store.parseImportText('important adj. 重要的')[0];
  if (p1.pos !== 'adj.' || p1.meaning !== '重要的') fail('词性拆分失败：pos=' + p1.pos + ' meaning=' + p1.meaning);
  else {
    var two = VL.store.parseImportText('1. apple\n苹果\n2. banana\n香蕉\nkind\nadj. 友好的');
    if (two.length !== 3) fail('两行式导入解析异常，期望 3 条，实际 ' + two.length);
    else if (two[0].term !== 'apple' || two[0].meaning !== '苹果') fail('两行式导入：第一条解析错误 → ' + JSON.stringify(two[0]));
    else if (two[1].term !== 'banana' || two[1].meaning !== '香蕉') fail('两行式导入：第二条解析错误 → ' + JSON.stringify(two[1]));
    else if (two[2].term !== 'kind' || two[2].meaning !== '友好的') fail('两行式导入：第三条解析错误 → ' + JSON.stringify(two[2]));
    else ok('批量导入解析：空格 / 逗号 / 表格 / 两行式（单词+释义分行）四种写法都能识别，序号会自动去掉');
  }
}

/* ---------- 6. 艾宾浩斯调度 ---------- */

var w = VL.store.makeWord({ term: 'validation', meaning: '验证' });
var seq = [];
for (var k = 0; k <= VL.srs.MAX_LEVEL; k++) {
  var r = VL.srs.grade(w, 'good');
  seq.push(r.to);
}
if (w.status !== 'mastered') fail('连续答对后没有标记为已掌握（level=' + w.srs.level + '）');
else ok('艾宾浩斯：学完 + 走完 ' + VL.srs.MAX_LEVEL + ' 个复习节点（' + (VL.srs.MAX_LEVEL + 1) + ' 次「认识」）后进入已掌握');

var w2 = VL.store.makeWord({ term: 'reset', meaning: '重置' });
VL.srs.grade(w2, 'good');
VL.srs.grade(w2, 'good');
VL.srs.grade(w2, 'forgot');
if (w2.srs.level !== 0) fail('答错后没有回到起点（level=' + w2.srs.level + '）');
else ok('艾宾浩斯：答错后回到起点，' + Math.round((w2.srs.dueAt - Date.now()) / 1000) + ' 秒后重新出现');

var w3 = VL.store.makeWord({ term: 'fresh', meaning: '新鲜的' });
var dueNow = VL.srs.dueList([w3]);
if (!dueNow.length) fail('新词创建后应当立即到期，但 dueList 为空');
else ok('新词：创建后立即进入待复习队列');

/* ---------- 6.5 查词链：内置词库 → 你自己录过的生词 ---------- */

/* ---------- 6.2 文件读取：编码识别 + 表格转文本 ---------- */

var gbk = new Uint8Array([0xC6, 0xBB, 0xB9, 0xFB]);   // GBK 编码的「苹果」
if (VL.readers.decodeText(gbk.buffer) !== '苹果') fail('GBK 编码识别失败：' + VL.readers.decodeText(gbk.buffer));
else ok('文件读取：GBK（Excel 导出的中文 CSV）能自动识别编码');
var utf8buf = Buffer.from('苹果', 'utf8');
if (VL.readers.decodeText(utf8buf) !== '苹果') fail('UTF-8 解码失败');
var tableText = VL.readers.rowsToText([
  ['1', 'apple', 'n.', '苹果'],
  ['', '', ''],
  ['2', 'banana', '', '香蕉']
]);
if (tableText !== 'apple\tn.\t苹果\nbanana\t\t香蕉') fail('表格转文本异常：' + JSON.stringify(tableText));
else ok('文件读取：Excel 表格能转成词表文本（序号列自动去掉）');
if (VL.readers.extOf('词表.XLSX') !== 'xlsx') fail('扩展名识别失败');

VL.store.addWord(VL.store.activeBookId(), { term: 'zelkova', meaning: '榉树（我自己录的）' });
var foundMine = VL.dict.get('zelkova');
if (!foundMine || foundMine.cn !== '榉树（我自己录的）') fail('查词链：自己录过的词没有变成词典来源');
else if (foundMine.from !== 'user') fail('查词链：来源标记错误 → ' + foundMine.from);
else ok('查词链：录过一次的词，之后查词会自动带出你写的释义');
var builtin = VL.dict.get('apple');
if (!builtin || builtin.cn !== '苹果') fail('查词链：内置词库查词被破坏');
else ok('查词链：内置词库优先，未被用户数据覆盖');
var fc = VL.srs.forecast([w, w2], 7);
if (fc.days.length !== 7) fail('forecast 天数错误');
else ok('复习预测：未来 7 天分布计算正常');

/* ---------- 7. 页面引用与缓存清单 ---------- */

var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
var refs = [];
(html.match(/(?:src|href)="([^"]+)"/g) || []).forEach(function (m) {
  var v = m.replace(/^[a-z]+="/, '').replace(/"$/, '');
  if (/^(https?:|#|data:)/.test(v)) return;
  refs.push(v);
});
refs.forEach(function (r) {
  if (!fs.existsSync(path.join(root, r))) fail('index.html 引用了不存在的文件：' + r);
});
ok('页面引用：' + refs.length + ' 个本地资源都存在');

var sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
var swFiles = (sw.match(/'\.[^']*'/g) || []).map(function (s) { return s.replace(/'/g, '').replace(/^\.\//, ''); });
swFiles.filter(function (f) { return f && f !== '.'; }).forEach(function (f) {
  if (!fs.existsSync(path.join(root, f))) warn('sw.js 缓存清单里的文件不存在：' + f);
});
svCheck(swFiles);
function svCheck(list) { ok('离线缓存清单：' + list.filter(function (f) { return f && f !== '.'; }).length + ' 个文件已核对'); }

/* ---------- 输出 ---------- */

function report() {
  console.log('');
  passed.forEach(function (p) { console.log('  ✓ ' + p); });
  if (warnings.length) {
    console.log('\n  提醒（不影响使用）：');
    warnings.slice(0, 25).forEach(function (w) { console.log('  ! ' + w); });
    if (warnings.length > 25) console.log('  ! …还有 ' + (warnings.length - 25) + ' 条');
  }
  if (errors.length) {
    console.log('\n  错误：');
    errors.forEach(function (e) { console.log('  ✗ ' + e); });
    console.log('\n自检未通过：' + errors.length + ' 个错误。');
    process.exit(1);
  }
  console.log('\n全部自检通过（' + passed.length + ' 项）。');
}

report();
