// お店ごとに変えるところは、このファイルだけです。
// 受付のルール（席数・時刻・定休日など）は、スプレッドシートの「設定」シートで変えます。
window.RESERVE_CONFIG = {
  // Google Apps Script を「ウェブアプリ」として公開したときの URL（…/exec）。
  // 空のままだと「お試しモード」で動きます（データはこのブラウザの中だけに保存）。
  apiUrl: '',

  shop: {
    name: 'Sample Bistro',
    tagline: 'ご予約',
    tel: '000-0000-0000',
    address: '〒000-0000 ○○県○○市○○町1-2-3',
    hours: 'ランチ 11:30〜15:00 ／ ディナー 18:00〜22:00',
    homeUrl: '',          // お店のサイト（あれば「サイトへ戻る」が出ます）
    privacyUrl: ''        // プライバシーポリシーのページ（あればフォームにリンクが出ます）
  },

  // 色と文字。お店の雰囲気に合わせて変えてください。
  theme: {
    bg: '#f7f4ee',
    surface: '#ffffff',
    ink: '#1f1c18',
    muted: '#6f6a62',
    line: '#e2ddd3',
    accent: '#7b5a3c',
    onAccent: '#ffffff',
    font: "'Zen Kaku Gothic New', 'Hiragino Sans', 'Noto Sans JP', sans-serif",
    fontUrl: 'https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap'
  },

  // 予約画面で選べるプラン。consult: true は「相談」として受け付け、席は押さえません（お店から連絡）。
  plans: [
    { name: '席のみのご予約', note: 'お料理は当日お選びください' },
    { name: 'おまかせコース', price: '5,500円〜／名', note: '2名様から', minPeople: 2 },
    { name: '貸切・パーティーのご相談', note: '人数や内容をうかがって、お店からご連絡します', consult: true, minPeople: 10 }
  ],

  // フォームの下に出す、ご案内
  notes: [
    'ご予約の時間から15分を過ぎてご連絡がない場合は、キャンセルとさせていただくことがあります。',
    'アレルギーや苦手な食材は、ご要望の欄にお書きください。'
  ],

  // お試しモードのときだけ使うルール（本番ではスプレッドシートの「設定」シートが使われます）
  demoRules: {
    shopName: 'Sample Bistro',
    capacity: 20,
    stayMinutes: 120,
    times: ['11:30', '12:00', '12:30', '13:00', '18:00', '18:30', '19:00', '19:30', '20:00'],
    closedWeekdays: [2],
    minPeople: 1,
    maxPeople: 8,
    maxConsultPeople: 100,
    leadHours: 3,
    maxDays: 60,
    mode: 'request'
  }
};
