// お店の予約管理画面
(function () {
  var R = window.Reserve, C = R.C, Core = R.Core, $ = function (id) { return document.getElementById(id); };
  R.applyTheme();
  document.title = '予約管理｜' + C.shop.name;
  $('shopName').textContent = C.shop.name;
  if (R.DEMO) {
    $('demoBadge').classList.remove('hidden');
    $('loginHint').textContent = 'お試しモードのパスコードは demo です。';
  }

  var KEY = 'reserve-kit-admin';
  var today = R.tokyoNow().date;
  var state = {
    key: '', rules: Core.normalizeRules(C.demoRules), now: R.tokyoNow(),
    rows: [], blocks: [], from: today, to: Core.addDays(today, 30), q: '', status: 'active',
    month: today.slice(0, 7), monthRows: [], editing: null
  };

  // ---- ログイン ----
  function remembered() { try { return sessionStorage.getItem(KEY) || ''; } catch (e) { return ''; } }
  function remember(k) { try { if (k) sessionStorage.setItem(KEY, k); else sessionStorage.removeItem(KEY); } catch (e) { /* なにもしない */ } }

  function login(key) {
    return R.call({ action: 'admin.login', key: key }).then(function (res) {
      if (!res.ok) { $('loginMsg').innerHTML = '<div class="msg err">' + R.esc(res.error) + '</div>'; remember(''); return; }
      state.key = key; remember(key);
      state.rules = Core.normalizeRules(res.rules);
      $('login').classList.add('hidden');
      $('main').classList.remove('hidden');
      $('topActions').classList.remove('hidden');
      loadList();
    });
  }
  $('loginForm').addEventListener('submit', function (e) { e.preventDefault(); login($('pass').value.trim()); });
  $('logoutBtn').onclick = function () { remember(''); location.reload(); };

  function api(body) {
    body.key = state.key;
    return R.call(body).then(function (res) {
      if (res.auth === false) { remember(''); alert('もう一度ログインしてください。'); location.reload(); }
      return res;
    });
  }

  // ---- 一覧 ----
  var FILTERS = [
    ['active', '有効な予約'], ['todo', '要対応（相談・仮予約）'], ['all', 'すべて'], ['canceled', 'キャンセル']
  ];
  FILTERS.forEach(function (f) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.dataset.f = f[0]; b.textContent = f[1];
    b.onclick = function () { state.status = f[0]; renderList(); };
    $('chips').appendChild(b);
  });

  $('from').value = state.from; $('to').value = state.to;
  $('from').onchange = function () { state.from = this.value || today; loadList(); };
  $('to').onchange = function () { state.to = this.value || Core.addDays(today, 30); loadList(); };
  var qTimer;
  $('q').oninput = function () { clearTimeout(qTimer); var v = this.value; qTimer = setTimeout(function () { state.q = v.trim(); loadList(); }, 350); };
  $('todayBtn').onclick = function () { setRange(today, today); };

  function setRange(from, to) {
    state.from = from; state.to = to; state.q = '';
    $('from').value = from; $('to').value = to; $('q').value = '';
    showTab('list');
    loadList();
  }

  function loadList() {
    $('listMsg').innerHTML = '<p class="muted small"><span class="spinner"></span> 読み込んでいます…</p>';
    // まとめ（今日・要対応）のため、今日より前の分は含めずに、範囲を少し広く読む
    var from = state.from < today ? state.from : today;
    return api({ action: 'admin.list', from: from, to: state.to > Core.addDays(today, 90) ? state.to : Core.addDays(today, 90), q: state.q })
      .then(function (res) {
        $('listMsg').innerHTML = res.ok ? '' : '<div class="msg err">' + R.esc(res.error) + '</div>';
        if (!res.ok) return;
        state.all = res.reservations; state.blocks = res.blocks;
        state.rules = Core.normalizeRules(res.rules); state.now = res.now || state.now;
        renderStats(); renderList(); renderBlocks();
      });
  }

  function matches(r) {
    if (state.status === 'active') return Core.isActive(r) || r.status === '相談';
    if (state.status === 'todo') return r.status === '相談' || r.status === '仮予約';
    if (state.status === 'canceled') return r.status === 'キャンセル' || r.status === '無断キャンセル';
    return true;
  }

  function sortRows(a, b) { return (a.date + a.time).localeCompare(b.date + b.time); }

  function renderList() {
    Array.prototype.forEach.call($('chips').children, function (c) { c.classList.toggle('on', c.dataset.f === state.status); });
    var rows = (state.all || []).filter(function (r) {
      return (state.q || (r.date >= state.from && r.date <= state.to)) && matches(r);
    }).sort(sortRows);
    state.rows = rows;
    var box = $('list');
    if (!rows.length) { box.innerHTML = '<p class="empty">この条件の予約はありません。</p>'; return; }
    var html = '', current = '';
    rows.forEach(function (r) {
      if (r.date !== current) {
        if (current) html += '</div>';
        current = r.date;
        var dayRows = rows.filter(function (x) { return x.date === r.date && Core.isActive(x); });
        var people = dayRows.reduce(function (s, x) { return s + (Number(x.people) || 0); }, 0);
        html += '<div class="day-group"><div class="day-head"><b>' + R.jpDate(r.date, true) +
          (r.date === today ? '<span class="today">今日</span>' : '') + '</b><span class="muted small">' + dayRows.length + '件・' + people + '名</span></div>';
      }
      var canceled = r.status === 'キャンセル' || r.status === '無断キャンセル';
      html += '<button type="button" class="row' + (canceled ? ' cancel' : '') + '" data-id="' + R.esc(r.id) + '">' +
        '<span class="t">' + R.esc(r.time) + '</span>' +
        '<span class="who"><b>' + R.esc(r.name) + ' 様</b>' + R.esc(r.people) + '名' +
        '<span class="sub">' + R.esc([r.plan, r.source, r.request ? '要望あり' : '', r.memo ? 'メモあり' : ''].filter(Boolean).join('・')) + '</span></span>' +
        '<span class="badge st-' + R.esc(r.status) + '">' + R.esc(r.status) + '</span></button>';
    });
    box.innerHTML = html + '</div>';
    box.querySelectorAll('.row').forEach(function (el) {
      el.onclick = function () { openEdit(state.all.filter(function (r) { return r.id === el.dataset.id; })[0]); };
    });
  }

  function renderStats() {
    var all = state.all || [];
    var todays = all.filter(function (r) { return r.date === today && Core.isActive(r); });
    var todo = all.filter(function (r) { return (r.status === '相談' || r.status === '仮予約') && r.date >= today; });
    var week = all.filter(function (r) { return r.date >= today && r.date <= Core.addDays(today, 6) && Core.isActive(r); });
    function sum(list) { return list.reduce(function (s, r) { return s + (Number(r.people) || 0); }, 0); }
    $('stats').innerHTML =
      '<button type="button" class="stat" id="stToday"><b>' + todays.length + '件・' + sum(todays) + '名</b><span>今日のご予約</span></button>' +
      '<button type="button" class="stat' + (todo.length ? ' alert' : '') + '" id="stTodo"><b>' + todo.length + '件</b><span>要対応（相談・仮予約）</span></button>' +
      '<button type="button" class="stat" id="stWeek"><b>' + week.length + '件・' + sum(week) + '名</b><span>今日から7日間</span></button>';
    $('stToday').onclick = function () { state.status = 'active'; setRange(today, today); };
    $('stTodo').onclick = function () { state.status = 'todo'; setRange(today, Core.addDays(today, state.rules.maxDays + 30)); };
    $('stWeek').onclick = function () { state.status = 'active'; setRange(today, Core.addDays(today, 6)); };
  }

  // ---- タブ ----
  document.querySelectorAll('.tab').forEach(function (t) { t.onclick = function () { showTab(t.dataset.tab); }; });
  function showTab(name) {
    document.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('on', t.dataset.tab === name); });
    ['list', 'cal', 'block'].forEach(function (n) { $('tab-' + n).classList.toggle('hidden', n !== name); });
    if (name === 'cal') loadMonth();
  }

  // ---- カレンダー ----
  function shiftMonth(ym, n) {
    var y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + n;
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    return y + '-' + String(m + 1).padStart(2, '0');
  }
  $('calPrev').onclick = function () { state.month = shiftMonth(state.month, -1); loadMonth(); };
  $('calNext').onclick = function () { state.month = shiftMonth(state.month, 1); loadMonth(); };

  function loadMonth() {
    var first = state.month + '-01', last = Core.addDays(shiftMonth(state.month, 1) + '-01', -1);
    $('calLabel').textContent = +state.month.slice(0, 4) + '年' + +state.month.slice(5) + '月';
    api({ action: 'admin.list', from: first, to: last }).then(function (res) {
      if (!res.ok) return;
      state.blocks = res.blocks;
      var cal = $('acal');
      cal.innerHTML = Core.WEEKDAYS.map(function (w) { return '<div class="wd">' + w + '</div>'; }).join('');
      for (var b = 0; b < Core.weekday(first); b++) cal.insertAdjacentHTML('beforeend', '<span class="acell blank"></span>');
      for (var d = first; d <= last; d = Core.addDays(d, 1)) {
        var list = res.reservations.filter(function (r) { return r.date === d && Core.isActive(r); }); // eslint-disable-line no-loop-func
        var pending = res.reservations.filter(function (r) { return r.date === d && (r.status === '相談' || r.status === '仮予約'); }).length; // eslint-disable-line no-loop-func
        var people = list.reduce(function (s, r) { return s + (Number(r.people) || 0); }, 0);
        var closed = Core.isClosedDay(state.rules, state.blocks, d);
        var el = document.createElement('button');
        el.type = 'button';
        el.className = 'acell' + (closed ? ' closed' : '') + (d === today ? ' today' : '');
        el.innerHTML = '<span class="d">' + +d.slice(8) + (closed ? ' 休' : '') + '</span>' +
          (list.length ? '<span class="c">' + list.length + '件／' + people + '名</span>' : '') +
          (pending ? '<span class="p">要対応 ' + pending + '</span>' : '');
        el.onclick = (function (dd) { return function () { state.status = 'all'; setRange(dd, dd); }; })(d);
        cal.appendChild(el);
      }
    });
  }

  // ---- 休業日・貸切 ----
  function renderBlocks() {
    var list = (state.blocks || []).filter(function (b) { return b.date >= Core.addDays(today, -1); })
      .sort(function (a, b) { return (a.date + a.from).localeCompare(b.date + b.from); });
    $('blocks').innerHTML = list.length ? list.map(function (b) {
      return '<div class="block-row"><span><b>' + R.jpDate(b.date, true) + '</b>　' +
        (b.from || b.to ? R.esc((b.from || '') + '〜' + (b.to || '')) : '終日') + '　<span class="muted">' + R.esc(b.memo) + '</span></span>' +
        '<button class="btn small ghost" type="button" data-id="' + R.esc(b.id) + '">消す</button></div>';
    }).join('') : '<p class="empty">これからの休業日・貸切は、まだありません。</p>';
    $('blocks').querySelectorAll('button').forEach(function (btn) {
      btn.onclick = function () {
        if (!confirm('この休業日・貸切を消しますか？')) return;
        api({ action: 'admin.unblock', id: btn.dataset.id }).then(loadList);
      };
    });
    var r = state.rules;
    $('rulesText').textContent = '今の受付ルール：席数 ' + r.capacity + '名／滞在 ' + r.stayMinutes + '分／ネット予約 ' + r.minPeople + '〜' + r.maxPeople + '名／' +
      r.leadHours + '時間前まで・' + r.maxDays + '日先まで／定休日 ' + (r.closedWeekdays.map(function (w) { return Core.WEEKDAYS[w]; }).join('・') || 'なし') +
      '／' + (r.mode === 'instant' ? 'すぐ確定' : 'お店が確認して確定') + (R.DEMO ? '（お試しモードは config.js の demoRules）' : '（スプレッドシートの「設定」で変えられます）');
  }
  $('blockForm').addEventListener('submit', function (e) {
    e.preventDefault();
    api({ action: 'admin.block', date: $('b-date').value, from: $('b-from').value, to: $('b-to').value, memo: $('b-memo').value })
      .then(function (res) {
        $('blockMsg').innerHTML = res.ok ? '' : '<div class="msg err">' + R.esc(res.error) + '</div>';
        if (res.ok) { $('blockForm').reset(); loadList(); }
      });
  });

  // ---- 予約の詳しい内容 ----
  var dlg = $('dlg');
  $('d-status').innerHTML = Core.STATUSES.map(function (s) { return '<option>' + s + '</option>'; }).join('');
  $('planList').innerHTML = C.plans.map(function (p) { return '<option value="' + R.esc(p.name) + '">'; }).join('');
  var FIELDS = ['date', 'time', 'people', 'status', 'plan', 'name', 'kana', 'tel', 'email', 'request', 'memo'];

  function openEdit(r) {
    state.editing = r || null;
    var v = r || { date: state.from >= today ? state.from : today, time: state.rules.times[0] || '18:00', people: 2, status: '確定', plan: '', name: '', kana: '', tel: '', email: '', request: '', memo: '' };
    FIELDS.forEach(function (k) { $('d-' + k).value = v[k] || ''; });
    $('dlgTitle').textContent = r ? r.name + ' 様のご予約' : '予約を入れる（電話・来店など）';
    $('dlgMeta').textContent = r ? '予約番号 ' + r.id + '　受付 ' + r.createdAt + '（' + r.source + '）　更新 ' + r.updatedAt : '';
    $('dlgMsg').innerHTML = '';
    links();
    $('notifyRow').classList.toggle('hidden', !r || r.status === '確定');
    var q = $('quick');
    q.innerHTML = '';
    if (r) {
      [['確定', '確定にする'], ['来店', '来店した'], ['キャンセル', 'キャンセル'], ['無断キャンセル', '無断キャンセル']].forEach(function (s) {
        if (r.status === s[0]) return;
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'btn small' + (s[0] === '確定' ? '' : ' ghost'); b.textContent = s[1];
        b.onclick = function () { $('d-status').value = s[0]; save(); };
        q.appendChild(b);
      });
    }
    dlg.showModal();
  }
  function links() {
    var tel = $('d-tel').value.trim(), mail = $('d-email').value.trim();
    $('telLink').textContent = tel ? '電話する' : ''; $('telLink').href = 'tel:' + tel.replace(/[^0-9+]/g, '');
    $('mailLink').textContent = mail ? 'メールする' : ''; $('mailLink').href = 'mailto:' + mail;
  }
  $('d-tel').oninput = links; $('d-email').oninput = links;
  $('newBtn').onclick = function () { openEdit(null); };
  $('saveBtn').onclick = function () { save(); };

  function save(force) {
    var data = {};
    FIELDS.forEach(function (k) { data[k] = $('d-' + k).value.trim(); });
    if (!data.date || !data.time || !data.name || !(Number(data.people) >= 1)) {
      $('dlgMsg').innerHTML = '<div class="msg err">来店日・時刻・人数・お名前を入れてください。</div>';
      return;
    }
    var body = state.editing
      ? { action: 'admin.update', id: state.editing.id, patch: data, force: !!force, notify: $('d-notify').checked }
      : { action: 'admin.create', data: data, force: !!force };
    $('saveBtn').disabled = true;
    api(body).then(function (res) {
      $('saveBtn').disabled = false;
      if (res.warning) { if (confirm(res.warning)) save(true); return; }
      if (!res.ok) { $('dlgMsg').innerHTML = '<div class="msg err">' + R.esc(res.error) + '</div>'; return; }
      dlg.close();
      loadList();
      if (!$('tab-cal').classList.contains('hidden')) loadMonth();
    });
  }

  // ---- CSV（いま一覧に出ている予約） ----
  $('csvBtn').onclick = function () {
    var cols = [['id', '予約番号'], ['date', '来店日'], ['time', '時刻'], ['people', '人数'], ['plan', 'プラン'], ['name', 'お名前'], ['kana', 'フリガナ'],
      ['tel', '電話番号'], ['email', 'メール'], ['request', 'ご要望'], ['status', '状態'], ['memo', 'お店メモ'], ['source', '受付'], ['createdAt', '受付日時']];
    function cell(v) { v = String(v === undefined ? '' : v); if (/^[=+\-@]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; }
    var csv = [cols.map(function (c) { return cell(c[1]); }).join(',')].concat(state.rows.map(function (r) {
      return cols.map(function (c) { return cell(r[c[0]]); }).join(',');
    })).join('\r\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })); // Excel で文字化けしないよう BOM を付ける
    a.download = '予約_' + state.from + '_' + state.to + '.csv';
    a.click();
  };

  var saved = remembered();
  if (saved) login(saved);
})();
