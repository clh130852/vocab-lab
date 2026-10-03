/* wordlists.js — 词表分组与选词（人教版各册 / 考纲 / 自建生词库） */
(function () {
  'use strict';
  var VL = (window.VL = window.VL || {});

  var KIND_LABEL = { textbook: '人教版教材', syllabus: '考纲', custom: '我的生词库' };

  function sourceOptions() {
    return VL.dict.sources().map(function (s) {
      return { id: s.id, name: s.name, short: s.short, kind: s.kind, stage: s.stage, grade: s.grade, count: s.count };
    });
  }

  function grouped() {
    var opts = sourceOptions();
    var order = ['textbook', 'syllabus'];
    return order.map(function (kind) {
      return {
        kind: kind,
        label: KIND_LABEL[kind],
        sources: opts.filter(function (s) { return s.kind === kind; })
      };
    }).filter(function (g) { return g.sources.length; });
  }

  function label(sourceId) {
    if (!sourceId) return '全部内置词库';
    if (sourceId === 'all') return '全部内置词库';
    if (sourceId.indexOf('book:') === 0) return '生词库';
    var s = VL.dict.getSource(sourceId);
    return s ? s.name : sourceId;
  }

  // 取某个词源的全部词条；'all' 表示整个内置词库
  function pool(sourceId) {
    if (!sourceId || sourceId === 'all') return VL.dict.all();
    var s = VL.dict.getSource(sourceId);
    if (!s) return VL.dict.all();
    return Object.keys(s.map).map(function (k) { return s.map[k]; });
  }

  VL.wordlists = {
    KIND_LABEL: KIND_LABEL,
    sourceOptions: sourceOptions,
    grouped: grouped,
    label: label,
    pool: pool
  };
})();
