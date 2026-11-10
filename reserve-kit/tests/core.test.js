// node reserve-kit/tests/core.test.js で実行する。
// 空き計算のルールと、Code.gs をスプレッドシートのにせものの上で動かして確かめる。
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var root = path.join(__dirname, '..');
var Core = require(path.join(root, 'assets/core.js'));
var tests = 0;
function test(name, fn) { fn(); tests++; console.log('ok - ' + name); }

test('gas/Core.gs は assets/core.js と同じ', function () {
  assert.strictEqual(fs.readFileSync(path.join(root, 'gas/Core.gs'), 'utf8'), fs.readFileSync(path.join(root, 'assets/core.js'), 'utf8'));
});

var rules = Core.normalizeRules({
  capacity: '10', stayMinutes: '120', times: '18:00, 18:30,19:00,20:00', closedWeekdays: '火,水曜日',
  minPeople: '1', maxPeople: '6', leadHours: '3', maxDays: '30', mode: 'お店が確認して確定'
});
var now = { date: '2026-11-10', time: '12:00' }; // 火曜日

test('設定シートの文字をルールにする', function () {
  assert.deepStrictEqual(rules.times, ['18:00', '18:30', '19:00', '20:00']);
  assert.deepStrictEqual(rules.closedWeekdays, [2, 3]);
  assert.strictEqual(rules.capacity, 10);
  assert.strictEqual(rules.mode, 'request');
  assert.strictEqual(Core.normalizeRules({ mode: 'すぐ確定' }).mode, 'instant');
});

test('曜日と日付の計算', function () {
  assert.strictEqual(Core.weekday('2026-11-10'), 2);
  assert.strictEqual(Core.addDays('2026-12-31', 1), '2027-01-01');
});

var res = [
  { id: 'a', date: '2026-11-12', time: '18:00', people: '6', status: '確定' },
  { id: 'b', date: '2026-11-12', time: '19:00', people: '2', status: '仮予約' },
  { id: 'c', date: '2026-11-12', time: '18:30', people: '9', status: 'キャンセル' },
  { id: 'd', date: '2026-11-12', time: '18:00', people: '30', status: '相談' }
];

test('滞在時間が重なる有効な予約だけを数える', function () {
  assert.strictEqual(Core.remaining(rules, res, '2026-11-12', '18:00'), 2); // a + b
  assert.strictEqual(Core.remaining(rules, res, '2026-11-12', '20:00'), 8); // b だけ（18:00 とは120分ちょうどで重ならない）
  assert.strictEqual(Core.remaining(rules, res, '2026-11-12', '18:00', 'a'), 8);
});

test('予約のチェック', function () {
  var ok = { date: '2026-11-12', time: '20:00', people: 4, name: '山田', tel: '090-1234-5678' };
  assert.strictEqual(Core.check(rules, res, [], ok, now), null);
  assert.match(Core.check(rules, res, [], Object.assign({}, ok, { time: '18:30' }), now), /満席/);
  assert.match(Core.check(rules, res, [], Object.assign({}, ok, { people: 7 }), now), /1〜6名/);
  assert.match(Core.check(rules, res, [], ok, { date: '2026-11-12', time: '17:30' }), /受け付けていません/); // 3時間前を過ぎた
  assert.match(Core.check(rules, res, [], Object.assign({}, ok, { date: '2026-11-11' }), now), /お休み/); // 水曜
  assert.match(Core.check(rules, res, [], Object.assign({}, ok, { tel: '123' }), now), /電話番号/);
  assert.match(Core.check(rules, res, [], Object.assign({}, ok, { date: '2026-12-31' }), now), /受け付けていません/);
  // 相談は満席でも受ける（席は押さえない）
  assert.strictEqual(Core.check(rules, res, [], Object.assign({}, ok, { time: '18:00', people: 40, consult: true }), now), null);
});

test('休業日・貸切', function () {
  var blocks = [{ date: '2026-11-13', from: '18:00', to: '19:00' }, { date: '2026-11-14', from: '', to: '' }];
  var s = Core.slots(rules, [], blocks, '2026-11-13', now);
  assert.deepStrictEqual(s.map(function (x) { return x.open; }), [false, false, true, true]);
  assert.strictEqual(Core.dayMark(rules, [], blocks, '2026-11-14', now), 'closed');
  assert.strictEqual(Core.dayMark(rules, [], [], '2026-11-11', now), 'closed');
  assert.strictEqual(Core.dayMark(rules, [], [], '2026-11-09', now), 'out');
  assert.strictEqual(Core.dayMark(rules, [], [], '2026-11-12', now), 'ok');
  assert.strictEqual(Core.dayMark(rules, res, [], '2026-11-12', now), 'few');
});

// ---------- Code.gs をにせもののスプレッドシートで動かす ----------
function fakeSheet(name) {
  var rows = [];
  var sh = {
    name: name, rows: rows,
    getLastRow: function () { return rows.length; },
    getMaxRows: function () { return 1000; },
    getRange: function (r, c, nr, nc) {
      if (typeof r === 'string') return { setNumberFormat: function () { return this; } };
      return {
        setValues: function (v) {
          v.forEach(function (row, i) { rows[r - 1 + i] = rows[r - 1 + i] || []; row.forEach(function (x, j) { rows[r - 1 + i][c - 1 + j] = x; }); });
          return this;
        },
        getDisplayValues: function () {
          var out = [];
          for (var i = 0; i < nr; i++) { out.push([]); for (var j = 0; j < nc; j++) out[i].push(String(((rows[r - 1 + i] || [])[c - 1 + j]) || '').replace(/^'/, '')); }
          return out;
        },
        setFontWeight: function () { return this; }, setNumberFormat: function () { return this; }, setDataValidation: function () { return this; }
      };
    },
    getDataRange: function () { return sh.getRange(1, 1, rows.length, 3); },
    appendRow: function (row) { rows.push(row.slice()); },
    deleteRow: function (i) { rows.splice(i - 1, 1); },
    setFrozenRows: function () {}, setColumnWidth: function () {}
  };
  return sh;
}

var sheets = {}, mails = [], props = {};
var ctx = {
  console: console, JSON: JSON, Math: Math, String: String, Number: Number, Date: Date, Object: Object, Array: Array,
  SpreadsheetApp: {
    getActive: function () {
      return {
        getSheetByName: function (n) { return sheets[n] || null; },
        insertSheet: function (n) { sheets[n] = fakeSheet(n); return sheets[n]; },
        getSpreadsheetTimeZone: function () { return 'Asia/Tokyo'; },
        getUrl: function () { return 'https://docs.google.com/spreadsheets/d/x'; }
      };
    },
    newDataValidation: function () { var b = { requireValueInList: function () { return b; }, build: function () { return {}; } }; return b; },
    getUi: function () { return {}; }
  },
  PropertiesService: { getScriptProperties: function () { return { getProperty: function (k) { return props[k] || null; }, setProperty: function (k, v) { props[k] = v; } }; } },
  CacheService: { getScriptCache: function () { var m = {}; return { get: function (k) { return m[k]; }, put: function (k, v) { m[k] = v; } }; } },
  LockService: { getScriptLock: function () { return { waitLock: function () {}, releaseLock: function () {} }; } },
  Utilities: {
    getUuid: function () { return '0123abcd-4567-89ef-0123-456789abcdef'; },
    formatDate: function (d, tz, f) { return f === 'yyyy-MM-dd' ? '2026-11-10' : '12:00'; }
  },
  MailApp: { sendEmail: function () { mails.push(arguments); } },
  Session: { getEffectiveUser: function () { return { getEmail: function () { return 'owner@example.com'; } }; } },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: function (s) { return { setMimeType: function () { return JSON.parse(s); } }; } },
  Logger: { log: function () {} }
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'gas/Core.gs'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'gas/Code.gs'), 'utf8'), ctx);
function post(body) { return ctx.doPost({ postData: { contents: JSON.stringify(body) } }); }

test('Code.gs：setup でシートとパスコードができる', function () {
  ctx.setup();
  assert.ok(sheets['予約'] && sheets['設定'] && sheets['休業日・貸切']);
  assert.strictEqual(props.ADMIN_KEY.length, 10);
  assert.strictEqual(ctx.rules_().capacity, 20);
});

test('Code.gs：ネット予約 → 空き状況 → 管理画面で確定', function () {
  var r = post({ action: 'reserve', date: '2026-11-12', time: '18:00', people: 4, name: '=山田', tel: '090-1234-5678', email: 'a@example.com' });
  assert.ok(r.ok, r.error);
  assert.strictEqual(r.status, '仮予約');
  assert.strictEqual(sheets['予約'].rows[1][6], "'=山田"); // 式にならない
  assert.strictEqual(mails.length, 2); // お店とお客様

  var m = ctx.doGet({ parameter: { month: '2026-11' } });
  assert.deepStrictEqual(m.occupancy, [{ date: '2026-11-12', time: '18:00', people: 4, status: '仮予約' }]);
  assert.strictEqual(JSON.stringify(m).indexOf('山田'), -1); // 個人情報は出さない

  assert.strictEqual(post({ action: 'admin.list', key: 'wrong' }).auth, false);
  var list = post({ action: 'admin.list', key: props.ADMIN_KEY });
  assert.strictEqual(list.reservations.length, 1);
  assert.strictEqual(list.reservations[0].name, '=山田');

  var u = post({ action: 'admin.update', key: props.ADMIN_KEY, id: r.id, patch: { status: '確定', memo: '窓際' } });
  assert.ok(u.ok, u.error);
  assert.strictEqual(mails.length, 3); // 確定メール
  assert.strictEqual(post({ action: 'admin.list', key: props.ADMIN_KEY }).reservations[0].memo, '窓際');
});

test('Code.gs：満席の警告と、休業日', function () {
  var w = post({ action: 'admin.create', key: props.ADMIN_KEY, data: { date: '2026-11-12', time: '18:30', people: 20, name: '電話の方' } });
  assert.ok(w.warning);
  assert.ok(post({ action: 'admin.create', key: props.ADMIN_KEY, force: true, data: { date: '2026-11-12', time: '18:30', people: 20, name: '電話の方' } }).ok);
  assert.match(post({ action: 'reserve', date: '2026-11-12', time: '19:00', people: 2, name: '佐藤', tel: '0900000000' }).error, /満席/);

  var b = post({ action: 'admin.block', key: props.ADMIN_KEY, date: '2026-11-13', memo: '貸切' });
  assert.ok(b.ok);
  assert.match(post({ action: 'reserve', date: '2026-11-13', time: '19:00', people: 2, name: '佐藤', tel: '0900000000' }).error, /お休み/);
  assert.ok(post({ action: 'admin.unblock', key: props.ADMIN_KEY, id: b.block.id }).ok);
  assert.ok(post({ action: 'reserve', date: '2026-11-13', time: '19:00', people: 2, name: '佐藤', tel: '0900000000' }).ok);
});

console.log('\n' + tests + ' tests passed');
