// 予約のルール（空き計算・受付チェック）。
// ブラウザ（予約画面・お試しモード）と Google Apps Script（gas/Core.gs）で同じものを使う。
// このファイルを直したら、gas/Core.gs にも同じ内容をコピーする（tests/core.test.js が一致を確認する）。

var ReserveCore = (function () {
  // 空き席を使う状態。「相談」はお店が確定するまで席を押さえない。
  var ACTIVE = ['仮予約', '確定', '来店'];
  var STATUSES = ['相談', '仮予約', '確定', '来店', 'キャンセル', '無断キャンセル'];
  var WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

  function toMin(hhmm) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  }

  function isDate(s) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
  }

  function dayIndex(dateStr) {
    var p = dateStr.split('-');
    return Math.floor(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000);
  }

  function weekday(dateStr) {
    return (dayIndex(dateStr) + 4) % 7; // 1970-01-01 は木曜
  }

  // "YYYY-MM-DD" と "HH:mm" を、比べられる分の数にする
  function stamp(dateStr, hhmm) {
    return dayIndex(dateStr) * 1440 + (toMin(hhmm) || 0);
  }

  function addDays(dateStr, n) {
    var d = new Date((dayIndex(dateStr) + n) * 86400000);
    return d.toISOString().slice(0, 10);
  }

  function isActive(r) {
    return ACTIVE.indexOf(r.status) >= 0;
  }

  function isBlocked(blocks, dateStr, hhmm) {
    var t = toMin(hhmm);
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      if (b.date !== dateStr) continue;
      var from = toMin(b.from), to = toMin(b.to);
      if (from === null && to === null) return true; // 終日
      if ((from === null || t >= from) && (to === null || t < to)) return true;
    }
    return false;
  }

  function isClosedDay(rules, blocks, dateStr) {
    if (rules.closedWeekdays.indexOf(weekday(dateStr)) >= 0) return true;
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      if (b.date === dateStr && !b.from && !b.to) return true;
    }
    return false;
  }

  // その時刻に、まだ何名入れるか（前後の滞在時間が重なる予約の人数を引く）
  function remaining(rules, reservations, dateStr, hhmm, ignoreId) {
    var t = toMin(hhmm), used = 0;
    for (var i = 0; i < reservations.length; i++) {
      var r = reservations[i];
      if (r.date !== dateStr || !isActive(r) || r.id === ignoreId) continue;
      if (Math.abs(toMin(r.time) - t) < rules.stayMinutes) used += Number(r.people) || 0;
    }
    return rules.capacity - used;
  }

  // ネット予約を受けられる期間か（何時間前まで・何日先まで）
  function inWindow(rules, dateStr, hhmm, now) {
    var s = stamp(dateStr, hhmm), n = stamp(now.date, now.time);
    if (s - n < rules.leadHours * 60) return false;
    return dayIndex(dateStr) - dayIndex(now.date) <= rules.maxDays;
  }

  // 1日分の時刻ごとの空き
  function slots(rules, reservations, blocks, dateStr, now) {
    var closed = isClosedDay(rules, blocks, dateStr);
    return rules.times.map(function (hhmm) {
      var left = closed || isBlocked(blocks, dateStr, hhmm) || !inWindow(rules, dateStr, hhmm, now)
        ? 0 : Math.max(0, remaining(rules, reservations, dateStr, hhmm));
      return { time: hhmm, remaining: left, open: left >= rules.minPeople };
    });
  }

  // カレンダーの印：'closed'（休み）／'none'（×）／'few'（△）／'ok'（○）／'out'（受付期間外）
  function dayMark(rules, reservations, blocks, dateStr, now) {
    if (dayIndex(dateStr) < dayIndex(now.date) || dayIndex(dateStr) - dayIndex(now.date) > rules.maxDays) return 'out';
    if (isClosedDay(rules, blocks, dateStr)) return 'closed';
    var list = slots(rules, reservations, blocks, dateStr, now);
    var open = list.filter(function (s) { return s.open; });
    if (!open.length) return 'none';
    var roomy = open.filter(function (s) { return s.remaining >= rules.capacity * 0.3; });
    return roomy.length * 2 >= list.length ? 'ok' : 'few';
  }

  // ネットからの予約を受けてよいか。だめなら理由（お客様に見せる文）を返す。
  function check(rules, reservations, blocks, req, now) {
    if (!isDate(req.date) || rules.times.indexOf(req.time) < 0) return '日付か時刻が正しくありません。';
    var people = Number(req.people);
    if (!(people >= 1) || Math.floor(people) !== people) return '人数を入力してください。';
    if (!String(req.name || '').trim()) return 'お名前を入力してください。';
    if (!/^[0-9+\-() ]{10,16}$/.test(String(req.tel || '').trim())) return '電話番号を確認してください。';
    if (req.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.email)) return 'メールアドレスを確認してください。';
    if (!inWindow(rules, req.date, req.time, now)) return 'この日時は、ネットでは受け付けていません。お電話でご相談ください。';
    if (isClosedDay(rules, blocks, req.date) || isBlocked(blocks, req.date, req.time)) return 'この日時はお休みか、貸切です。';
    if (req.consult) {
      if (people > rules.maxConsultPeople) return 'この人数は、お電話でご相談ください。';
      return null; // 相談は席を押さえないので、空きは見ない
    }
    if (people < rules.minPeople || people > rules.maxPeople) {
      return 'ネット予約は ' + rules.minPeople + '〜' + rules.maxPeople + '名様です。それ以外はお電話でご相談ください。';
    }
    if (remaining(rules, reservations, req.date, req.time) < people) return '申し訳ありません。この時刻は満席になりました。別の時刻をお選びください。';
    return null;
  }

  // 設定シートの値（文字）を、ルールの形にそろえる
  function normalizeRules(raw) {
    function num(v, d) { var n = Number(v); return isFinite(n) && String(v).trim() !== '' ? n : d; }
    var times = Array.isArray(raw.times) ? raw.times : String(raw.times || '').split(/[,、\s]+/);
    var closed = Array.isArray(raw.closedWeekdays) ? raw.closedWeekdays
      : String(raw.closedWeekdays || '').split(/[,、\s]+/).filter(Boolean).map(function (w) {
          var i = WEEKDAYS.indexOf(w.replace('曜日', '').replace('曜', ''));
          return i >= 0 ? i : Number(w);
        });
    return {
      shopName: String(raw.shopName || ''),
      capacity: num(raw.capacity, 20),
      stayMinutes: num(raw.stayMinutes, 120),
      times: times.map(function (t) { return String(t).trim(); }).filter(function (t) { return toMin(t) !== null; })
        .sort(function (a, b) { return toMin(a) - toMin(b); }),
      closedWeekdays: closed.filter(function (n) { return n >= 0 && n <= 6; }),
      minPeople: num(raw.minPeople, 1),
      maxPeople: num(raw.maxPeople, 8),
      maxConsultPeople: num(raw.maxConsultPeople, 100),
      leadHours: num(raw.leadHours, 3),
      maxDays: num(raw.maxDays, 60),
      mode: raw.mode === 'instant' || raw.mode === 'すぐ確定' ? 'instant' : 'request'
    };
  }

  // ネット予約の最初の状態
  function firstStatus(rules, req) {
    if (req.consult) return '相談';
    return rules.mode === 'instant' ? '確定' : '仮予約';
  }

  return {
    ACTIVE: ACTIVE, STATUSES: STATUSES, WEEKDAYS: WEEKDAYS,
    toMin: toMin, isDate: isDate, weekday: weekday, addDays: addDays, stamp: stamp,
    isActive: isActive, isBlocked: isBlocked, isClosedDay: isClosedDay,
    remaining: remaining, inWindow: inWindow, slots: slots, dayMark: dayMark,
    check: check, normalizeRules: normalizeRules, firstStatus: firstStatus
  };
})();

if (typeof module !== 'undefined') module.exports = ReserveCore;
