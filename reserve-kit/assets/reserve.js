// お客様の予約画面
(function () {
  var R = window.Reserve, C = R.C, Core = R.Core, $ = function (id) { return document.getElementById(id); };
  R.applyTheme();

  var state = {
    rules: Core.normalizeRules(C.demoRules), now: R.tokyoNow(),
    plan: 0, people: 2, month: R.tokyoNow().date.slice(0, 7), date: '', time: '',
    data: {} // month -> { occupancy, blocks }
  };

  // ---- お店の情報 ----
  document.title = 'ご予約｜' + C.shop.name;
  $('shopName').textContent = C.shop.name;
  $('tagline').textContent = C.shop.tagline || 'ご予約';
  $('footName').textContent = C.shop.name;
  $('footAddr').textContent = C.shop.address || '';
  $('footHours').textContent = C.shop.hours || '';
  $('footTel').textContent = C.shop.tel;
  $('footTel').href = 'tel:' + C.shop.tel.replace(/[^0-9+]/g, '');
  if (C.shop.homeUrl) { $('brand').href = C.shop.homeUrl; $('homeLink').href = C.shop.homeUrl; $('homeLink').classList.remove('hidden'); }
  if (C.shop.privacyUrl) { $('privacyLink').href = C.shop.privacyUrl; $('agreeRow').classList.remove('hidden'); }
  if (R.DEMO) $('demoBadge').classList.remove('hidden');
  (C.notes || []).forEach(function (n) { var li = document.createElement('li'); li.textContent = n; $('notes').appendChild(li); });

  // ---- 1. プラン ----
  C.plans.forEach(function (p, i) {
    var label = document.createElement('label');
    label.className = 'plan';
    label.innerHTML = '<input type="radio" name="plan" value="' + i + '"' + (i === 0 ? ' checked' : '') + '>' +
      '<span><b>' + R.esc(p.name) + '</b>' + (p.price ? '<span class="price">' + R.esc(p.price) + '</span> ' : '') +
      (p.note ? '<span class="muted small">' + R.esc(p.note) + '</span>' : '') + '</span>';
    label.querySelector('input').addEventListener('change', function () { state.plan = i; clampPeople(); refresh(); });
    $('plans').appendChild(label);
  });

  function plan() { return C.plans[state.plan] || {}; }

  // ---- 2. 人数 ----
  function peopleRange() {
    var p = plan(), r = state.rules;
    var min = Math.max(r.minPeople, p.minPeople || 1);
    var max = p.consult ? r.maxConsultPeople : r.maxPeople;
    return { min: min, max: Math.max(min, max) };
  }
  function clampPeople() {
    var g = peopleRange();
    state.people = Math.min(g.max, Math.max(g.min, state.people));
  }
  $('minus').onclick = function () { state.people--; clampPeople(); refresh(); };
  $('plus').onclick = function () { state.people++; clampPeople(); refresh(); };

  // ---- 3. カレンダー ----
  // 相談は席を押さえないので、お休みと受付期間だけを見る
  function viewRules() {
    var r = Object.assign({}, state.rules);
    if (plan().consult) { r.capacity = 1e9; r.minPeople = 1; } else { r.minPeople = state.people; }
    return r;
  }
  function monthData() { return state.data[state.month] || { occupancy: [], blocks: [] }; }

  function shiftMonth(ym, n) {
    var y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + n;
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    return y + '-' + String(m + 1).padStart(2, '0');
  }
  var firstMonth = state.month;
  function lastMonth() { return Core.addDays(state.now.date, state.rules.maxDays).slice(0, 7); }

  $('prev').onclick = function () { state.month = shiftMonth(state.month, -1); loadMonth(); };
  $('next').onclick = function () { state.month = shiftMonth(state.month, 1); loadMonth(); };

  function loadMonth() {
    renderCal();
    if (state.data[state.month]) return;
    var ym = state.month;
    $('calMsg').innerHTML = '<p class="muted small"><span class="spinner"></span> 空き状況を読み込んでいます…</p>';
    R.call({ action: 'month', month: ym }).then(function (res) {
      if (!res.ok) { $('calMsg').innerHTML = '<div class="msg err">' + R.esc(res.error || '読み込めませんでした。') + '</div>'; return; }
      state.rules = Core.normalizeRules(res.rules);
      if (res.now) state.now = res.now;
      state.data[ym] = { occupancy: res.occupancy, blocks: res.blocks };
      $('calMsg').innerHTML = '';
      clampPeople();
      refresh();
    });
  }

  function renderCal() {
    var ym = state.month, d = monthData(), rules = viewRules();
    $('monthLabel').textContent = +ym.slice(0, 4) + '年' + +ym.slice(5, 7) + '月';
    $('prev').disabled = ym <= firstMonth;
    $('next').disabled = ym >= lastMonth();
    var cal = $('cal');
    cal.innerHTML = Core.WEEKDAYS.map(function (w) { return '<div class="wd">' + w + '</div>'; }).join('');
    var first = ym + '-01', lead = Core.weekday(first);
    for (var b = 0; b < lead; b++) cal.insertAdjacentHTML('beforeend', '<span class="day blank"></span>');
    var loaded = !!state.data[ym];
    for (var day = first; day.slice(0, 7) === ym; day = Core.addDays(day, 1)) {
      var mark = loaded ? Core.dayMark(rules, d.occupancy, d.blocks, day, state.now) : 'out';
      var sym = { ok: '○', few: '△', none: '×', closed: '休', out: '' }[mark];
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'day ' + mark + (day === state.date ? ' sel' : '');
      btn.disabled = mark === 'out' || mark === 'closed' || mark === 'none';
      btn.innerHTML = '<span class="d">' + +day.slice(8) + '</span><span class="m">' + sym + '</span>';
      btn.setAttribute('aria-label', R.jpDate(day) + ' ' + ({ ok: '空きあり', few: '残りわずか', none: '満席', closed: 'お休み', out: '受付していません' }[mark]));
      btn.onclick = (function (dd) { return function () { state.date = dd; state.time = ''; refresh(); $('s-time').scrollIntoView({ behavior: 'smooth', block: 'start' }); }; })(day);
      cal.appendChild(btn);
    }
  }

  // ---- 4. 時刻 ----
  function renderTimes() {
    var box = $('times');
    box.innerHTML = '';
    var on = !!state.date && !!state.data[state.date.slice(0, 7)];
    $('s-time').classList.toggle('off', !on);
    if (!on) { $('timeLead').textContent = '日にちを選ぶと、時刻が出ます。'; return; }
    var d = state.data[state.date.slice(0, 7)], rules = viewRules();
    var list = Core.slots(rules, d.occupancy, d.blocks, state.date, state.now);
    $('timeLead').textContent = R.jpDate(state.date) + '　' + state.people + '名様で選べる時刻';
    var any = false;
    list.forEach(function (s) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'time' + (s.time === state.time ? ' sel' : '');
      b.disabled = !s.open;
      any = any || s.open;
      var label = plan().consult ? (s.open ? 'ご相談可' : '—') : (!s.open ? '満席' : s.remaining <= state.rules.capacity * 0.3 ? '残りわずか' : '空きあり');
      b.innerHTML = '<b>' + s.time + '</b><span>' + label + '</span>';
      b.onclick = function () { state.time = s.time; refresh(); $('s-form').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
      box.appendChild(b);
    });
    if (!any) $('timeLead').textContent = 'この日は、' + state.people + '名様で選べる時刻がありません。別の日をお選びください。';
    if (state.time && !list.some(function (s) { return s.time === state.time && s.open; })) state.time = '';
  }

  function refresh() {
    var g = peopleRange();
    $('people').textContent = state.people + '名';
    $('minus').disabled = state.people <= g.min;
    $('plus').disabled = state.people >= g.max;
    var note = [];
    if (plan().consult) note.push('人数がまだ決まっていなければ、おおよそで大丈夫です。');
    else if (state.people >= state.rules.maxPeople) note.push((state.rules.maxPeople + 1) + '名様以上は、' + (consultPlan() ? '「' + consultPlan().name + '」からお申し込みいただくか、' : '') + 'お電話でご相談ください。');
    $('peopleNote').textContent = note.join(' ');
    renderCal();
    renderTimes();
    $('s-form').classList.toggle('off', !state.time);
  }
  function consultPlan() { return C.plans.filter(function (p) { return p.consult; })[0]; }

  // ---- 5. フォーム → 確認 → 送信 ----
  var form = $('form');
  function values() {
    var f = new FormData(form), o = {};
    f.forEach(function (v, k) { o[k] = String(v).trim(); });
    return o;
  }
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var v = values(), errs = [];
    if (!v.name) errs.push('お名前を入力してください。');
    if (!/^[0-9+\-() ]{10,16}$/.test(v.tel.replace(/[０-９－]/g, function (c) { return c === '－' ? '-' : String.fromCharCode(c.charCodeAt(0) - 0xFEE0); }))) errs.push('電話番号を確認してください（例：090-1234-5678）。');
    if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) errs.push('メールアドレスを確認してください。');
    if (C.shop.privacyUrl && !$('agree').checked) errs.push('個人情報の取り扱いへの同意をお願いします。');
    $('formMsg').innerHTML = errs.length ? '<div class="msg err">' + errs.map(R.esc).join('<br>') + '</div>' : '';
    if (errs.length) return;
    var rows = [
      ['日時', R.jpDate(state.date, true) + ' ' + state.time], ['人数', state.people + '名'], ['プラン', plan().name],
      ['お名前', v.name + (v.kana ? '（' + v.kana + '）' : '') + ' 様'], ['電話', v.tel], ['メール', v.email || '（なし）'], ['ご要望', v.request || '（なし）']
    ];
    $('summary').innerHTML = rows.map(function (r) { return '<dt>' + r[0] + '</dt><dd>' + R.esc(r[1]) + '</dd>'; }).join('');
    $('sendMsg').innerHTML = plan().consult
      ? '<div class="msg info">ご相談として受け付けます。お店から折り返しご連絡します。まだご予約は確定しません。</div>'
      : state.rules.mode === 'request' ? '<div class="msg info">送信後、お店で確認してから確定のご連絡をします。</div>' : '';
    show('confirm');
  });
  $('back').onclick = function () { show('form'); };

  $('send').onclick = function () {
    var btn = this, v = values();
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> 送信しています';
    v.tel = v.tel.replace(/[０-９－]/g, function (c) { return c === '－' ? '-' : String.fromCharCode(c.charCodeAt(0) - 0xFEE0); });
    R.call(Object.assign(v, { action: 'reserve', date: state.date, time: state.time, people: state.people, plan: plan().name, consult: !!plan().consult }))
      .then(function (res) {
        btn.disabled = false;
        btn.textContent = '送信する';
        if (!res.ok) {
          $('sendMsg').innerHTML = '<div class="msg err">' + R.esc(res.error) + '</div>';
          // 空きが変わったかもしれないので、「直す」で読み直す
          state.month = state.date.slice(0, 7);
          delete state.data[state.month];
          return;
        }
        $('doneTitle').textContent = res.status === '確定' ? 'ご予約が確定しました' : res.status === '相談' ? 'ご相談を受け付けました' : 'ご予約を受け付けました';
        $('doneId').textContent = res.id;
        $('doneText').textContent = (res.status === '確定' ? 'ご来店をお待ちしております。' : 'お店で確認して、ご連絡いたします。まだ確定ではありません。') +
          (v.email ? '受付のメールをお送りしました。' : '') + '変更やキャンセルは、お電話（' + C.shop.tel + '）でご連絡ください。';
        show('done');
      });
  };

  function show(which) {
    var steps = ['s-plan', 's-people', 's-date', 's-time', 's-form'];
    steps.forEach(function (id) { $(id).classList.toggle('hidden', which === 'confirm' || which === 'done'); });
    $('s-confirm').classList.toggle('hidden', which !== 'confirm');
    $('s-done').classList.toggle('hidden', which !== 'done');
    if (which === 'form') { loadMonth(); refresh(); }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  clampPeople();
  refresh();
  loadMonth();
})();
