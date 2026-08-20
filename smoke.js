/* smoke.js — בדיקת עשן לכל המסכים. להריץ לפני כל פרסום:  node smoke.js
   נולד מבאג שהגיע לגיא: מחיקת קוד השאירה תחביר תקין אבל גיליון ריק לגמרי.
   node --check לא תופס את זה — רק רינדור אמיתי תופס.
   הבדיקה נכשלת אם מסך זרק שגיאה או יצא ריק. */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const VIEWS = [
  'dash', 'status', 'queue', 'lc', 'sub', 'abs', 'pdf',
  'emp', 'week', 'cand', 'pos', 'tasks', 'projects', 'events',
  'budget', 'bsearch', 'kk', 'gefen', 'safety', 'base', 'bcats', 'users', 'settings'
];

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push({ view: current, msg: 'PAGEERROR: ' + e.message }));
  p.on('console', m => {
    if (m.type() === 'error' && !/ERR_FAILED|ERR_BLOCKED|net::/.test(m.text())) {
      errs.push({ view: current, msg: 'CONSOLE: ' + m.text().slice(0, 200) });
    }
  });
  let current = '(load)';
  await p.route('**/*', r => r.request().url().startsWith('file://') ? r.continue() : r.abort());
  await p.goto('file:///home/user/regavim-admin/admin-site/index.html?local=1',
    { waitUntil: 'domcontentloaded', timeout: 25000 });
  await p.waitForTimeout(2500);

  // נתוני תקציב מדומים — כדי שמסכי התקציב יהיו עם תוכן אמיתי ולא ריקים לגיטימית
  await p.evaluate(() => {
    const st = {
      fiscalYear: { start: '2025-09-01', end: '2026-09-01' },
      categoriesYear: 2025,
      fyCats: { 2026: [{ id: 'p1', main: 'תחזוקה', sub: 'חשמל', annualBudget: 10 }] },
      categories: [
        { id: 'c1', main: 'תחזוקה', sub: 'חשמל', annualBudget: 100000 },
        { id: 'c2', main: 'קולות קוראים', sub: 'ביטחון', annualBudget: 222000 }
      ],
      transactions: [{ id: 't1', kind: 'invoice', date: '2026-03-01', main: 'תחזוקה', sub: 'חשמל',
                       amount: 5000, supplier: 'מגן אש' }]
    };
    Store.budgetState = () => st;
    Store.budgetFiscalYear = () => st.fiscalYear;
    Store.budgetTransactions = () => st.transactions.slice();
    Store.budgetCurrentFy = () => ({ year: 2025, label: '2025/26', start: '2025-09-01', end: '2026-08-31' });
    Store.budgetFyYears = () => [{ year: 2025, label: '2025/26', start: '2025-09-01', end: '2026-08-31' },
                                { year: 2026, label: '2026/27', start: '2026-09-01', end: '2027-08-31' }];
    Store.budgetCategoriesYear = () => 2025;
    Store.budgetCategoriesFor = y => String(y) === '2025' ? st.categories.slice() : ((st.fyCats || {})[y] || []).slice();
    Store.budgetIsActiveFy = () => false;
    Store.budgetSnapshotFor = () => null;
    Store.budgetSumOf = l => (l || []).reduce((a, c) => a + Number(c.annualBudget || 0), 0);
    Store.budgetCategories = () => st.categories.slice();
    Store.budgetSubscribe = () => {};
    Store.budgetLoadError = () => '';
    Store.budgetLoad = () => Promise.resolve();
    // בלי חיבור לענן, מסך תור האישורים קורא loadSubmissions ואז App.render בלולאה אינסופית.
    // לצורך הבדיקה מחזירים רשימה קבועה.
    Store.submissions = () => [];
    Store.loadSubmissions = () => Promise.resolve([]);
    Store.kkPendingInvoices = Store.kkPendingInvoices || (() => []);
    Store.manageUsers = () => Promise.reject(new Error('offline'));
    Store.manageUsersDiagnose = () => Promise.resolve({ kind: 'blocked', status: 0, hint: 'offline' });
    Store.suppliersMigrateLocal = () => Promise.resolve(0);
    Store.suppliersAutoMerge = () => Promise.resolve(0);
    Store.suppliersPending = () => [];
    Store.suppliersAll = () => [{ id: 's1', name: 'מגן אש', aliases: [] }];
  });

  const rows = [];
  for (const v of VIEWS) {
    current = v;
    const before = errs.length;
    await p.evaluate(id => App.setView(id), v);
    await p.waitForTimeout(250);
    const info = await p.evaluate(() => {
      const el = document.getElementById('view');
      return { chars: (el.innerText || '').trim().length, nodes: el.querySelectorAll('*').length };
    });
    const newErrs = errs.length - before;
    // מסך תקין = בלי שגיאות, ועם תוכן אמיתי (לא שלד ריק)
    const ok = newErrs === 0 && info.chars > 40 && info.nodes > 10;
    rows.push({ view: v, ok, chars: info.chars, nodes: info.nodes, errs: newErrs });
  }

  await b.close();

  const bad = rows.filter(r => !r.ok);
  rows.forEach(r => console.log(`${r.ok ? '✓' : '✗'} ${r.view.padEnd(10)} ${String(r.chars).padStart(6)} תווים · ${String(r.nodes).padStart(4)} אלמנטים` + (r.errs ? `  ← ${r.errs} שגיאות` : '')));
  if (errs.length) {
    console.log('\n--- שגיאות ---');
    errs.forEach(e => console.log(`[${e.view}] ${e.msg}`));
  }
  console.log(`\n${rows.length - bad.length}/${rows.length} מסכים תקינים`);
  if (bad.length) {
    console.log('נכשלו: ' + bad.map(r => r.view).join(', '));
    process.exit(1);
  }
  console.log('הכול תקין — מותר לפרסם');
})();
