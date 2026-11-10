// 予約サイトのサーバー（Google Apps Script）。スプレッドシートに予約を保存する。
// 使い方は reserve-kit/README.md を見る。最初に一度だけ setup() を実行する。
// 空き計算のルールは Core.gs（assets/core.js と同じ内容）にある。

var SHEET_RES = '予約';
var SHEET_SET = '設定';
var SHEET_BLOCK = '休業日・貸切';

// 予約シートの列（順番がそのままシートの列になる）
var RES_COLS = [
  ['id', '予約番号'], ['createdAt', '受付日時'], ['date', '来店日'], ['time', '時刻'],
  ['people', '人数'], ['plan', 'プラン'], ['name', 'お名前'], ['kana', 'フリガナ'],
  ['tel', '電話番号'], ['email', 'メール'], ['request', 'ご要望'], ['status', '状態'],
  ['memo', 'お店メモ'], ['source', '受付'], ['updatedAt', '更新日時']
];
var BLOCK_COLS = [['id', '番号'], ['date', '日付'], ['from', '開始'], ['to', '終了'], ['memo', 'メモ']];

// 設定シートの項目：キー、見出し、はじめの値、説明
var SETTINGS = [
  ['shopName', '店名', 'お店の名前', 'メールの差出人名と件名に入ります'],
  ['shopTel', '電話番号', '000-0000-0000', 'お客様へのメールに入ります'],
  ['shopEmail', '通知先メール', '', '新しい予約のお知らせが届くアドレス（空ならこのスプレッドシートの持ち主）'],
  ['capacity', '席数', '20', '同じ時間帯に入れる人数の合計'],
  ['stayMinutes', '滞在時間（分）', '120', 'この時間内に重なる予約の人数を合計して、空きを出します'],
  ['times', '受付時刻', '11:30,12:00,12:30,13:00,18:00,18:30,19:00,19:30,20:00', 'カンマで区切る'],
  ['closedWeekdays', '定休日（曜日）', '火', '例：火,水　（祝日や臨時休業は「休業日・貸切」シートへ）'],
  ['minPeople', 'ネット予約の最少人数', '1', ''],
  ['maxPeople', 'ネット予約の最多人数', '8', 'これより多い人数は「貸切・パーティーの相談」から受け付けます'],
  ['maxConsultPeople', '相談の最多人数', '100', ''],
  ['leadHours', '何時間前まで受け付けるか', '3', '例：3 なら、3時間後より先の時刻だけ選べる'],
  ['maxDays', '何日先まで受け付けるか', '60', ''],
  ['mode', '確定のしかた', 'お店が確認して確定', '「お店が確認して確定」か「すぐ確定」'],
  ['replyMail', 'お客様に受付メール', 'はい', '「はい」か「いいえ」'],
  ['confirmMail', '確定したらお客様にメール', 'はい', '管理画面で「確定」にしたとき送ります']
];

// ---------- 最初に一度だけ実行する ----------
function setup() {
  var ss = SpreadsheetApp.getActive();
  var res = sheet_(SHEET_RES, RES_COLS.map(function (c) { return c[1]; }));
  res.getRange('A:O').setNumberFormat('@');
  res.getRange(2, colOf_('status'), res.getMaxRows() - 1, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(ReserveCore.STATUSES, true).build());

  var set = ss.getSheetByName(SHEET_SET);
  if (!set) {
    set = ss.insertSheet(SHEET_SET);
    set.getRange('A:C').setNumberFormat('@');
    set.getRange(1, 1, 1, 3).setValues([['項目', '値', '説明']]).setFontWeight('bold');
    set.getRange(2, 1, SETTINGS.length, 3).setValues(SETTINGS.map(function (s) { return [s[1], s[2], s[3]]; }));
    set.setFrozenRows(1);
    set.setColumnWidth(1, 220); set.setColumnWidth(2, 360); set.setColumnWidth(3, 480);
  }

  var block = sheet_(SHEET_BLOCK, BLOCK_COLS.map(function (c) { return c[1]; }));
  block.getRange('A:E').setNumberFormat('@');

  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('ADMIN_KEY')) props.setProperty('ADMIN_KEY', newKey_());
  Logger.log('管理画面のパスコード：' + props.getProperty('ADMIN_KEY'));
}

// パスコードを忘れたとき：実行すると、ログに表示される
function showPasscode() {
  Logger.log('管理画面のパスコード：' + PropertiesService.getScriptProperties().getProperty('ADMIN_KEY'));
}

// パスコードを新しくする（前のパスコードは使えなくなる）
function resetPasscode() {
  PropertiesService.getScriptProperties().setProperty('ADMIN_KEY', newKey_());
  showPasscode();
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('予約').addItem('はじめの準備（setup）', 'setup').addToUi();
}

// ---------- Web API ----------
// GET ?action=month&month=YYYY-MM … 空き状況（お客様の名前などは出さない）
function doGet(e) {
  try {
    var month = String((e.parameter || {}).month || '');
    if (!/^\d{4}-\d{2}$/.test(month)) month = now_().date.slice(0, 7);
    var rules = rules_();
    var occupancy = readRows_(SHEET_RES, RES_COLS).filter(function (r) {
      return r.date.slice(0, 7) === month && ReserveCore.isActive(r);
    }).map(function (r) {
      return { date: r.date, time: r.time, people: Number(r.people) || 0, status: r.status };
    });
    var blocks = readRows_(SHEET_BLOCK, BLOCK_COLS).filter(function (b) { return b.date.slice(0, 7) === month; })
      .map(function (b) { return { date: b.date, from: b.from, to: b.to }; });
    return json_({ ok: true, rules: rules, occupancy: occupancy, blocks: blocks, now: now_() });
  } catch (err) {
    return json_({ ok: false, error: 'エラーが起きました。お電話でご予約ください。' });
  }
}

// POST（本文はJSON）。action で処理を分ける。admin. で始まるものはパスコードが必要。
function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: '送信内容が読めません。' }); }
  var action = String(body.action || '');
  if (action.indexOf('admin.') === 0 && !authorized_(body.key)) {
    return json_({ ok: false, error: 'パスコードが違います。', auth: false });
  }
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    var handlers = {
      'reserve': reserve_,
      'admin.login': adminLogin_,
      'admin.list': adminList_,
      'admin.create': adminCreate_,
      'admin.update': adminUpdate_,
      'admin.block': adminBlock_,
      'admin.unblock': adminUnblock_
    };
    if (!handlers[action]) return json_({ ok: false, error: '知らない操作です。' });
    return json_(handlers[action](body));
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: '混み合っています。少し待ってから、もう一度お試しください。' });
  } finally {
    lock.releaseLock();
  }
}

// ---------- お客様の予約 ----------
function reserve_(body) {
  if (body.website) return { ok: true, id: '-' }; // ロボット対策（見えない入力欄）
  var rules = rules_();
  var req = pick_(body);
  req.consult = !!body.consult;
  var all = readRows_(SHEET_RES, RES_COLS);
  var blocks = readRows_(SHEET_BLOCK, BLOCK_COLS);
  var problem = ReserveCore.check(rules, all, blocks, req, now_());
  if (problem) return { ok: false, error: problem };

  req.id = newId_(all);
  req.status = ReserveCore.firstStatus(rules, req);
  req.source = 'ネット';
  req.createdAt = req.updatedAt = nowText_();
  appendRow_(SHEET_RES, RES_COLS, req);

  var s = settings_();
  safeMail_(function () { mailShop_(s, req); });
  if (req.email && s.replyMail !== 'いいえ') safeMail_(function () { mailCustomer_(s, req, 'received'); });
  return { ok: true, id: req.id, status: req.status };
}

// ---------- 管理画面 ----------
function adminLogin_() {
  return { ok: true, rules: rules_() };
}

function adminList_(body) {
  var today = now_().date;
  var from = ReserveCore.isDate(body.from) ? body.from : ReserveCore.addDays(today, -7);
  var to = ReserveCore.isDate(body.to) ? body.to : ReserveCore.addDays(today, 90);
  var q = String(body.q || '').trim();
  var rows = readRows_(SHEET_RES, RES_COLS).filter(function (r) {
    if (q) return [r.id, r.name, r.kana, r.tel, r.email].join(' ').indexOf(q) >= 0;
    return r.date >= from && r.date <= to;
  });
  return { ok: true, reservations: rows, blocks: readRows_(SHEET_BLOCK, BLOCK_COLS), rules: rules_(), now: now_() };
}

// 電話などで受けた予約を、お店が入れる（受付期間の制限なし、満席でも force で入れられる）
function adminCreate_(body) {
  var rules = rules_();
  var r = pick_(body.data || {});
  r.status = ReserveCore.STATUSES.indexOf((body.data || {}).status) >= 0 ? body.data.status : '確定';
  r.memo = clean_((body.data || {}).memo);
  if (!ReserveCore.isDate(r.date) || ReserveCore.toMin(r.time) === null) return { ok: false, error: '日付と時刻を入れてください。' };
  if (!r.name) return { ok: false, error: 'お名前を入れてください。' };
  var all = readRows_(SHEET_RES, RES_COLS);
  var warn = capacityWarning_(rules, all, r, null);
  if (warn && !body.force) return { ok: false, warning: warn };
  r.id = newId_(all);
  r.source = clean_((body.data || {}).source) || '電話';
  r.createdAt = r.updatedAt = nowText_();
  appendRow_(SHEET_RES, RES_COLS, r);
  return { ok: true, reservation: r };
}

function adminUpdate_(body) {
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_RES);
  var all = readRows_(SHEET_RES, RES_COLS);
  var index = -1;
  for (var i = 0; i < all.length; i++) if (all[i].id === body.id) index = i;
  if (index < 0) return { ok: false, error: '予約が見つかりません。' };
  var before = all[index];
  var after = JSON.parse(JSON.stringify(before));
  var patch = body.patch || {};
  ['date', 'time', 'people', 'plan', 'name', 'kana', 'tel', 'email', 'request', 'memo'].forEach(function (k) {
    if (patch[k] !== undefined) after[k] = clean_(patch[k]);
  });
  if (patch.status !== undefined) {
    if (ReserveCore.STATUSES.indexOf(patch.status) < 0) return { ok: false, error: '状態が正しくありません。' };
    after.status = patch.status;
  }
  var warn = capacityWarning_(rules_(), all, after, before.id);
  var changedSeat = after.date !== before.date || after.time !== before.time ||
    Number(after.people) !== Number(before.people) || ReserveCore.isActive(after) !== ReserveCore.isActive(before);
  if (warn && changedSeat && !body.force) return { ok: false, warning: warn };
  after.updatedAt = nowText_();
  sh.getRange(index + 2, 1, 1, RES_COLS.length).setValues([RES_COLS.map(function (c) { return safeCell_(after[c[0]]); })]);

  var s = settings_();
  if (after.status === '確定' && before.status !== '確定' && after.email && s.confirmMail !== 'いいえ' && body.notify !== false) {
    safeMail_(function () { mailCustomer_(s, after, 'confirmed'); });
  }
  return { ok: true, reservation: after };
}

function adminBlock_(body) {
  var b = { date: clean_(body.date), from: clean_(body.from), to: clean_(body.to), memo: clean_(body.memo) };
  if (!ReserveCore.isDate(b.date)) return { ok: false, error: '日付を入れてください。' };
  if ((b.from && ReserveCore.toMin(b.from) === null) || (b.to && ReserveCore.toMin(b.to) === null)) return { ok: false, error: '時刻は 18:00 のように入れてください。' };
  b.id = 'B' + Utilities.getUuid().slice(0, 8);
  appendRow_(SHEET_BLOCK, BLOCK_COLS, b);
  return { ok: true, block: b };
}

function adminUnblock_(body) {
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_BLOCK);
  var rows = readRows_(SHEET_BLOCK, BLOCK_COLS);
  for (var i = rows.length - 1; i >= 0; i--) {
    if (rows[i].id === body.id) { sh.deleteRow(i + 2); return { ok: true }; }
  }
  return { ok: false, error: '見つかりません。' };
}

function capacityWarning_(rules, all, r, ignoreId) {
  if (!ReserveCore.isActive(r) || ReserveCore.toMin(r.time) === null) return null;
  var left = ReserveCore.remaining(rules, all, r.date, r.time, ignoreId);
  if (left >= Number(r.people)) return null;
  return 'この時間帯は、あと ' + Math.max(0, left) + ' 名分しか空いていません（席数 ' + rules.capacity + '）。それでも入れますか？';
}

// ---------- メール ----------
function mailShop_(s, r) {
  var to = s.shopEmail || Session.getEffectiveUser().getEmail();
  if (!to) return;
  MailApp.sendEmail({
    to: to,
    subject: '【新しい' + (r.status === '相談' ? 'ご相談' : 'ご予約') + '】' + jpDate_(r.date) + ' ' + r.time + ' ' + r.people + '名 ' + r.name + '様',
    body: summary_(r) + '\n状態：' + r.status + '\n\n管理画面かスプレッドシートで確認してください。\n' + SpreadsheetApp.getActive().getUrl()
  });
}

function mailCustomer_(s, r, kind) {
  var head, lead;
  if (kind === 'confirmed') {
    head = 'ご予約が確定しました';
    lead = 'ご予約が確定しました。ご来店をお待ちしております。';
  } else if (r.status === '相談') {
    head = 'ご相談を受け付けました';
    lead = 'ご相談を受け付けました。内容を確認して、お店からご連絡いたします。\nこの時点では、まだご予約は確定していません。';
  } else if (r.status === '仮予約') {
    head = 'ご予約を受け付けました';
    lead = 'ご予約を受け付けました。お店で確認して、確定のご連絡をいたします。\nこの時点では、まだご予約は確定していません。';
  } else {
    head = 'ご予約が確定しました';
    lead = 'ご予約ありがとうございます。ご予約が確定しました。';
  }
  var opts = { name: s.shopName };
  if (s.shopEmail) opts.replyTo = s.shopEmail;
  MailApp.sendEmail(r.email, '【' + s.shopName + '】' + head + '（予約番号 ' + r.id + '）',
    r.name + ' 様\n\n' + lead + '\n\n' + summary_(r) +
    '\n\n変更・キャンセルは、お電話でご連絡ください。\n' + s.shopName + '　' + s.shopTel + '\n\n※このメールは送信専用です。', opts);
}

function summary_(r) {
  return [
    '予約番号：' + r.id,
    '日時：' + jpDate_(r.date) + ' ' + r.time,
    '人数：' + r.people + '名',
    r.plan ? 'プラン：' + r.plan : '',
    'お名前：' + r.name + (r.kana ? '（' + r.kana + '）' : '') + ' 様',
    '電話：' + r.tel,
    r.request ? 'ご要望：\n' + r.request : ''
  ].filter(Boolean).join('\n');
}

function safeMail_(fn) {
  try { fn(); } catch (err) { console.error('メールを送れませんでした', err); }
}

// ---------- 小さな道具 ----------
function rules_() {
  return ReserveCore.normalizeRules(settings_());
}

function settings_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_SET);
  var values = sh ? sh.getDataRange().getDisplayValues() : [];
  var byLabel = {};
  values.forEach(function (row) { byLabel[row[0]] = String(row[1]).trim(); });
  var s = {};
  SETTINGS.forEach(function (d) { s[d[0]] = byLabel[d[1]] !== undefined ? byLabel[d[1]] : d[2]; });
  return s;
}

function pick_(d) {
  return {
    date: clean_(d.date), time: clean_(d.time), people: String(Math.floor(Number(d.people) || 0)),
    plan: clean_(d.plan), name: clean_(d.name), kana: clean_(d.kana), tel: clean_(d.tel),
    email: clean_(d.email), request: clean_(d.request).slice(0, 1000)
  };
}

function clean_(v) {
  return v === undefined || v === null ? '' : String(v).trim().slice(0, 2000);
}

// = や + で始まる文字が、シートで式として動かないようにする
function safeCell_(v) {
  v = v === undefined || v === null ? '' : String(v);
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}

function sheet_(name, headers) {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function colOf_(key) {
  for (var i = 0; i < RES_COLS.length; i++) if (RES_COLS[i][0] === key) return i + 1;
  return -1;
}

function readRows_(name, cols) {
  var sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, cols.length).getDisplayValues()
    .filter(function (row) { return row[0] !== ''; })
    .map(function (row) {
      var o = {};
      cols.forEach(function (c, i) { o[c[0]] = String(row[i]).trim(); });
      if (o.date) o.date = o.date.replace(/\//g, '-').replace(/-(\d)(?!\d)/g, '-0$1');
      if (o.time && /^\d:/.test(o.time)) o.time = '0' + o.time;
      return o;
    });
}

function appendRow_(name, cols, obj) {
  SpreadsheetApp.getActive().getSheetByName(name).appendRow(cols.map(function (c) { return safeCell_(obj[c[0]]); }));
}

function newId_(all) {
  var used = {};
  all.forEach(function (r) { used[r.id] = true; });
  var day = now_().date.replace(/-/g, '').slice(2);
  for (;;) {
    var id = 'R' + day + '-' + String(Math.floor(1000 + Math.random() * 9000));
    if (!used[id]) return id;
  }
}

function newKey_() {
  return Utilities.getUuid().replace(/-/g, '').slice(0, 10);
}

function authorized_(key) {
  var real = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  if (!real || !key) return false;
  var bad = CacheService.getScriptCache();
  var fails = Number(bad.get('fails') || 0);
  if (fails >= 20) return false; // 10分に20回まちがえたら、しばらく受け付けない
  if (String(key) === real) return true;
  bad.put('fails', String(fails + 1), 600);
  return false;
}

function now_() {
  var tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone() || 'Asia/Tokyo';
  var d = new Date();
  return { date: Utilities.formatDate(d, tz, 'yyyy-MM-dd'), time: Utilities.formatDate(d, tz, 'HH:mm') };
}

function nowText_() {
  var n = now_();
  return n.date + ' ' + n.time;
}

function jpDate_(dateStr) {
  var p = dateStr.split('-');
  return Number(p[1]) + '月' + Number(p[2]) + '日（' + ReserveCore.WEEKDAYS[ReserveCore.weekday(dateStr)] + '）';
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
