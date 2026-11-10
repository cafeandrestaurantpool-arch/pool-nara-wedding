// 予約画面と管理画面で共通の部品：テーマ、サーバーとのやりとり、お試しモード。
(function () {
  var C = window.RESERVE_CONFIG;
  var Core = window.ReserveCore;
  var DEMO = !C.apiUrl;

  // ---- テーマ（config.js の色をCSSに渡す） ----
  function applyTheme() {
    var t = C.theme || {}, s = document.documentElement.style;
    var map = { bg: '--bg', surface: '--surface', ink: '--ink', muted: '--muted', line: '--line', accent: '--ac', onAccent: '--on-ac', font: '--font' };
    Object.keys(map).forEach(function (k) { if (t[k]) s.setProperty(map[k], t[k]); });
    if (t.fontUrl) {
      var l = document.createElement('link');
      l.rel = 'stylesheet'; l.href = t.fontUrl;
      document.head.appendChild(l);
    }
  }

  // ---- 日付の道具 ----
  function tokyoNow() {
    var parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date());
    var p = {};
    parts.forEach(function (x) { p[x.type] = x.value; });
    return { date: p.year + '-' + p.month + '-' + p.day, time: p.hour + ':' + p.minute };
  }

  function jpDate(dateStr, withYear) {
    var p = dateStr.split('-');
    return (withYear ? p[0] + '年' : '') + Number(p[1]) + '月' + Number(p[2]) + '日（' + Core.WEEKDAYS[Core.weekday(dateStr)] + '）';
  }

  function esc(s) {
    return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---- 本番：Google Apps Script ----
  function get(params) {
    var q = Object.keys(params).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
    return fetch(C.apiUrl + '?' + q).then(function (r) { return r.json(); });
  }

  function post(body) {
    // text/plain にすると、Apps Script でも事前確認（CORS）なしで送れる
    return fetch(C.apiUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); });
  }

  // ---- お試しモード：Code.gs と同じ動きを、ブラウザの中だけで ----
  var KEY = 'reserve-kit-demo:' + C.shop.name;
  var DEMO_PASS = 'demo';

  function load() {
    try {
      var d = JSON.parse(localStorage.getItem(KEY));
      if (d && d.reservations) return d;
    } catch (e) { /* 保存できないブラウザでは、毎回サンプルから */ }
    return seed();
  }

  function save(d) {
    try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { /* 保存できなくても動かす */ }
  }

  // 見本の予約（お試しで画面を見せるため）
  function seed() {
    var rules = Core.normalizeRules(C.demoRules);
    var today = tokyoNow().date, list = [], n = 0;
    var names = [['山田 花子', 'ヤマダ ハナコ'], ['佐藤 健', 'サトウ ケン'], ['鈴木 美咲', 'スズキ ミサキ'], ['高橋 大輔', 'タカハシ ダイスケ'], ['田中 結衣', 'タナカ ユイ'], ['伊藤 翔', 'イトウ ショウ']];
    for (var day = 0; day < 21; day++) {
      var date = Core.addDays(today, day);
      if (rules.closedWeekdays.indexOf(Core.weekday(date)) >= 0) continue;
      var count = (day * 7) % 5;
      for (var j = 0; j < count; j++) {
        var nm = names[(day + j) % names.length];
        var status = day === 0 ? '確定' : (j % 3 === 0 ? '仮予約' : '確定');
        list.push({
          id: 'R' + date.replace(/-/g, '').slice(2) + '-' + (1000 + (n++)), createdAt: today + ' 10:00',
          date: date, time: rules.times[(day + j * 3) % rules.times.length], people: String(2 + ((day + j) % 5)),
          plan: C.plans[(day + j) % 2].name, name: nm[0], kana: nm[1], tel: '090-0000-00' + String(10 + n),
          email: '', request: j === 1 ? '誕生日のお祝いです' : '', status: status, memo: '', source: j % 2 ? '電話' : 'ネット', updatedAt: today + ' 10:00'
        });
      }
    }
    list.push({
      id: 'R' + today.replace(/-/g, '').slice(2) + '-9001', createdAt: today + ' 09:30', date: Core.addDays(today, 30), time: '18:00',
      people: '35', plan: '貸切・パーティーのご相談', name: '中村 さくら', kana: 'ナカムラ サクラ', tel: '080-0000-0000', email: '',
      request: '結婚式の二次会で、貸切を考えています。', status: '相談', memo: '', source: 'ネット', updatedAt: today + ' 09:30'
    });
    return { reservations: list, blocks: [] };
  }

  function demoId(all) {
    var day = tokyoNow().date.replace(/-/g, '').slice(2), used = {};
    all.forEach(function (r) { used[r.id] = true; });
    for (;;) { var id = 'R' + day + '-' + Math.floor(1000 + Math.random() * 9000); if (!used[id]) return id; }
  }

  function demoWarn(rules, all, r, ignoreId) {
    if (!Core.isActive(r)) return null;
    var left = Core.remaining(rules, all, r.date, r.time, ignoreId);
    return left >= Number(r.people) ? null
      : 'この時間帯は、あと ' + Math.max(0, left) + ' 名分しか空いていません（席数 ' + rules.capacity + '）。それでも入れますか？';
  }

  function stampNow() { var n = tokyoNow(); return n.date + ' ' + n.time; }

  function demoCall(body) {
    var d = load(), rules = Core.normalizeRules(C.demoRules), now = tokyoNow();
    var fields = ['date', 'time', 'people', 'plan', 'name', 'kana', 'tel', 'email', 'request'];
    function pick(src) { var o = {}; fields.forEach(function (k) { o[k] = String(src[k] === undefined ? '' : src[k]).trim(); }); return o; }
    if (body.action === 'month') {
      return {
        ok: true, rules: rules, now: now,
        occupancy: d.reservations.filter(function (r) { return r.date.slice(0, 7) === body.month && Core.isActive(r); })
          .map(function (r) { return { date: r.date, time: r.time, people: Number(r.people), status: r.status }; }),
        blocks: d.blocks.filter(function (b) { return b.date.slice(0, 7) === body.month; })
      };
    }
    if (body.action === 'reserve') {
      var req = pick(body); req.consult = !!body.consult;
      var problem = Core.check(rules, d.reservations, d.blocks, req, now);
      if (problem) return { ok: false, error: problem };
      req.id = demoId(d.reservations); req.status = Core.firstStatus(rules, req); req.source = 'ネット';
      req.memo = ''; req.createdAt = req.updatedAt = stampNow(); delete req.consult;
      d.reservations.push(req); save(d);
      return { ok: true, id: req.id, status: req.status };
    }
    if (body.action.indexOf('admin.') === 0 && body.key !== DEMO_PASS) return { ok: false, auth: false, error: 'パスコードが違います（お試しモードは demo）。' };
    if (body.action === 'admin.login') return { ok: true, rules: rules };
    if (body.action === 'admin.list') {
      var q = String(body.q || '').trim();
      return {
        ok: true, rules: rules, now: now, blocks: d.blocks,
        reservations: d.reservations.filter(function (r) {
          return q ? [r.id, r.name, r.kana, r.tel, r.email].join(' ').indexOf(q) >= 0 : r.date >= body.from && r.date <= body.to;
        })
      };
    }
    if (body.action === 'admin.create') {
      var r = pick(body.data);
      r.status = Core.STATUSES.indexOf(body.data.status) >= 0 ? body.data.status : '確定';
      r.memo = String(body.data.memo || ''); r.source = body.data.source || '電話';
      if (!Core.isDate(r.date) || Core.toMin(r.time) === null) return { ok: false, error: '日付と時刻を入れてください。' };
      if (!r.name) return { ok: false, error: 'お名前を入れてください。' };
      var w = demoWarn(rules, d.reservations, r, null);
      if (w && !body.force) return { ok: false, warning: w };
      r.id = demoId(d.reservations); r.createdAt = r.updatedAt = stampNow();
      d.reservations.push(r); save(d);
      return { ok: true, reservation: r };
    }
    if (body.action === 'admin.update') {
      var i = d.reservations.findIndex(function (x) { return x.id === body.id; });
      if (i < 0) return { ok: false, error: '予約が見つかりません。' };
      var before = d.reservations[i], after = Object.assign({}, before), p = body.patch || {};
      fields.concat(['memo', 'status']).forEach(function (k) { if (p[k] !== undefined) after[k] = String(p[k]).trim(); });
      var warn = demoWarn(rules, d.reservations, after, before.id);
      var moved = after.date !== before.date || after.time !== before.time || Number(after.people) !== Number(before.people) || Core.isActive(after) !== Core.isActive(before);
      if (warn && moved && !body.force) return { ok: false, warning: warn };
      after.updatedAt = stampNow(); d.reservations[i] = after; save(d);
      return { ok: true, reservation: after };
    }
    if (body.action === 'admin.block') {
      if (!Core.isDate(body.date)) return { ok: false, error: '日付を入れてください。' };
      var b = { id: 'B' + Date.now().toString(36), date: body.date, from: body.from || '', to: body.to || '', memo: body.memo || '' };
      d.blocks.push(b); save(d);
      return { ok: true, block: b };
    }
    if (body.action === 'admin.unblock') {
      d.blocks = d.blocks.filter(function (x) { return x.id !== body.id; }); save(d);
      return { ok: true };
    }
    return { ok: false, error: '知らない操作です。' };
  }

  function call(body) {
    if (DEMO) {
      return new Promise(function (resolve) { setTimeout(function () { resolve(demoCall(body)); }, 250); });
    }
    var p = body.action === 'month' ? get({ action: 'month', month: body.month }) : post(body);
    return p.catch(function () { return { ok: false, error: '通信できませんでした。電波の良いところで、もう一度お試しください。' }; });
  }

  function resetDemo() { try { localStorage.removeItem(KEY); } catch (e) { /* なにもしない */ } }

  window.Reserve = { C: C, Core: Core, DEMO: DEMO, applyTheme: applyTheme, call: call, tokyoNow: tokyoNow, jpDate: jpDate, esc: esc, resetDemo: resetDemo };
})();
