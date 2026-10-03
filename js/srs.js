/* srs.js — 艾宾浩斯遗忘曲线复习调度
 *
 * 复习节点（默认）：5 分钟 → 30 分钟 → 12 小时 → 1 天 → 2 天 → 4 天 → 7 天 → 15 天 → 30 天 → 60 天
 * 每通过一次，进入下一个节点；全部通过即视为“已掌握”。
 */
(function () {
  'use strict';
  var VL = (window.VL = window.VL || {});
  var U = VL.util;

  var MIN = U.MIN, HOUR = U.HOUR, DAY = U.DAY;

  var DEFAULT_INTERVALS = [5 * MIN, 30 * MIN, 12 * HOUR, DAY, 2 * DAY, 4 * DAY, 7 * DAY, 15 * DAY, 30 * DAY, 60 * DAY];
  var MAX_LEVEL = DEFAULT_INTERVALS.length;   // 10：走完最后一个节点即为掌握
  var RELEARN_DELAY = 60 * 1000;              // 「忘记」后重新出现的默认间隔

  function intervals() {
    var custom = VL.store && VL.store.settings().intervals;
    if (custom && custom.length === DEFAULT_INTERVALS.length) return custom;
    return DEFAULT_INTERVALS;
  }

  function relearnDelay() {
    var v = VL.store && VL.store.settings().relearnDelay;
    return typeof v === 'number' && v > 0 ? v : RELEARN_DELAY;
  }

  function intervalFor(level) {
    var list = intervals();
    if (level <= 0) return relearnDelay();
    if (level > list.length) return list[list.length - 1];
    return list[level - 1];
  }

  function stageLabel(level) {
    if (level <= 0) return '新词';
    if (level > MAX_LEVEL) return '已掌握';
    return U.fmtDuration(intervals()[level - 1]);
  }

  // 记忆强度分组（用于图表与筛选）
  function strengthGroup(word) {
    var lv = word.srs ? word.srs.level : 0;
    if (word.status === 'mastered' || lv > MAX_LEVEL) return 'mastered';
    if (lv <= 2) return 'weak';
    if (lv <= 5) return 'mid';
    if (lv <= 8) return 'good';
    return 'strong';
  }

  var STRENGTH_LABEL = { weak: '刚起步（0-2）', mid: '初步记住（3-5）', good: '比较牢固（6-8）', strong: '接近掌握（9-10）', mastered: '已掌握' };

  function newSrs() {
    return {
      level: 0, dueAt: Date.now(), lastAt: 0,
      reps: 0, lapses: 0, right: 0, wrong: 0, streak: 0,
      history: []
    };
  }

  function normalize(word) {
    if (!word.srs) word.srs = newSrs();
    var s = word.srs;
    if (typeof s.level !== 'number') s.level = 0;
    if (typeof s.dueAt !== 'number') s.dueAt = Date.now();
    if (typeof s.reps !== 'number') s.reps = 0;
    if (typeof s.lapses !== 'number') s.lapses = 0;
    if (typeof s.right !== 'number') s.right = 0;
    if (typeof s.wrong !== 'number') s.wrong = 0;
    if (typeof s.streak !== 'number') s.streak = 0;
    if (!Array.isArray(s.history)) s.history = [];
    return s;
  }

  // 评分：'forgot' | 'hard' | 'good' | 'easy'
  function grade(word, key, opts) {
    var o = opts || {};
    var now = o.now || Date.now();
    var s = normalize(word);
    var from = s.level;
    var to = from;
    var mastered = false;

    if (key === 'forgot') {
      to = 0;
      s.lapses += 1; s.wrong += 1; s.streak = 0;
    } else if (key === 'hard') {
      to = Math.max(0, from - 1);
      s.streak = 0;
      if (o.test) { s.right += 1; } else { s.wrong += 1; }
    } else if (key === 'good') {
      to = from + 1;
      s.streak += 1;
      s.right += 1;
    } else { // easy
      to = from + 2;
      s.streak += 2;
      s.right += 1;
    }

    if (to > MAX_LEVEL) { mastered = true; to = MAX_LEVEL + 1; }

    var due;
    if (mastered) {
      due = 0;
    } else if (key === 'forgot') {
      due = now + relearnDelay();
    } else if (key === 'hard') {
      due = now + Math.max(relearnDelay(), Math.round(intervalFor(to) * (to > 0 ? 0.5 : 1)));
    } else {
      due = now + intervalFor(to);
    }

    s.level = to;
    s.dueAt = mastered ? 0 : due;
    s.lastAt = now;
    s.reps += 1;
    s.history.push({ at: now, grade: key, from: from, to: to, src: o.source || 'card' });
    if (s.history.length > 80) s.history = s.history.slice(-80);

    if (mastered) {
      word.status = 'mastered';
      word.masteredAt = now;
    } else if (word.status === 'mastered') {
      word.status = 'learning';   // 掌握后被重新答错，回到学习中
      word.masteredAt = 0;
    }

    word.updatedAt = now;
    return { from: from, to: to, dueAt: s.dueAt, mastered: mastered, label: stageLabel(to) };
  }

  // 检测题结果 → 调度。答对算通过，答错重置。
  function applyTestResult(word, correct, opts) {
    var o = opts || {};
    var key;
    if (!correct) key = 'forgot';
    else key = o.slow ? 'good' : (o.fast ? 'easy' : 'good');
    return grade(word, key, Object.assign({ test: true, source: 'test' }, o));
  }

  function isDue(word, now) {
    if (!word || word.status === 'archived') return false;
    if (word.status === 'mastered') return false;
    var s = normalize(word);
    return s.dueAt <= (now || Date.now());
  }

  function isNew(word) {
    var s = normalize(word);
    return word.status !== 'archived' && word.status !== 'mastered' && s.reps === 0;
  }

  function dueList(words, now) {
    var t = now || Date.now();
    return (words || []).filter(function (w) { return isDue(w, t); })
      .sort(function (a, b) { return a.srs.dueAt - b.srs.dueAt; });
  }

  function newList(words) {
    return (words || []).filter(isNew).sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });
  }

  function nextDueAt(words, now) {
    var t = now || Date.now(), best = 0;
    (words || []).forEach(function (w) {
      if (w.status === 'archived' || w.status === 'mastered') return;
      var d = w.srs && w.srs.dueAt;
      if (!d) return;
      if (d > t && (!best || d < best)) best = d;
    });
    return best;
  }

  // 未来 N 天的复习量预测（含逾期）
  function forecast(words, days) {
    var n = days || 7;
    var t0 = U.startOfDay();
    var buckets = [];
    var overdue = 0;
    (words || []).forEach(function (w) {
      if (w.status === 'archived' || w.status === 'mastered') return;
      var d = (w.srs && w.srs.dueAt) || 0;
      if (d <= Date.now()) { overdue += 1; return; }
      var idx = Math.floor((U.startOfDay(d) - t0) / U.DAY);
      if (idx < 0) idx = 0;
      if (idx < n) buckets[idx] = (buckets[idx] || 0) + 1;
    });
    var out = [];
    for (var i = 0; i < n; i++) {
      out.push({
        ts: t0 + i * U.DAY,
        label: i === 0 ? '今天' : (i === 1 ? '明天' : (i + 1) + ' 天后'),
        short: (function () { var d = new Date(t0 + i * U.DAY); return (d.getMonth() + 1) + '/' + d.getDate(); })(),
        count: buckets[i] || 0
      });
    }
    return { days: out, overdue: overdue };
  }

  function levelBuckets(words) {
    var out = { weak: 0, mid: 0, good: 0, strong: 0, mastered: 0 };
    (words || []).forEach(function (w) {
      if (w.status === 'archived') return;
      out[strengthGroup(w)] += 1;
    });
    return out;
  }

  function mastery(words) {
    var total = 0, mastered = 0;
    (words || []).forEach(function (w) {
      if (w.status === 'archived') return;
      total += 1;
      if (w.status === 'mastered' || (w.srs && w.srs.level > MAX_LEVEL)) mastered += 1;
    });
    return { total: total, mastered: mastered, rate: total ? Math.round((mastered / total) * 100) : 0 };
  }

  VL.srs = {
    DEFAULT_INTERVALS: DEFAULT_INTERVALS,
    MAX_LEVEL: MAX_LEVEL,
    STRENGTH_LABEL: STRENGTH_LABEL,
    intervals: intervals,
    intervalFor: intervalFor,
    stageLabel: stageLabel,
    strengthGroup: strengthGroup,
    newSrs: newSrs,
    normalize: normalize,
    grade: grade,
    applyTestResult: applyTestResult,
    isDue: isDue,
    isNew: isNew,
    dueList: dueList,
    newList: newList,
    nextDueAt: nextDueAt,
    forecast: forecast,
    levelBuckets: levelBuckets,
    mastery: mastery
  };
})();
