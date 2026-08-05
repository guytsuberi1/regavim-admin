/* budget.js — גיליון "ניהול תקציב": קורא ישירות את נתוני אפליקציית התקציב (אותה שורת app_state).
   שלושה מסכים: גיליון ניהול · תקציב מול ביצוע · חיפוש חכם (חשבוניות/ספקים/עובדים במקום אחד).
   ההזנה נשארת אצל המזכירה — כאן מנהלים תקציב וצופים. */
(function (global) {
  'use strict';
  var U = global.U;

  var subTab = 'sheet';                 // 'sheet' | 'dash' | 'search'
  var openRows = {};                    // פיזור חודשי פתוח לפי מזהה קטגוריה
  var mainFilter = '';
  var q = '', qMain = '', qFrom = '', qTo = '', qKind = '';
  var subscribed = false;

  function ils(n) {
    return new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(Math.round(n || 0)) + ' ₪';
  }
  function pct(n) { return (n * 100).toFixed(1) + '%'; }
  function monthLabel(ym) {
    var p = String(ym).split('-');
    return ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יונ', 'יול', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'][parseInt(p[1], 10) - 1] + ' ' + p[0].slice(2);
  }

  // ---------- חישובים (זהים לאפליקציית התקציב) ----------
  function actualBySub() {
    var m = {};
    Store.budgetTransactions().forEach(function (t) {
      var k = t.main + '||' + t.sub;
      m[k] = (m[k] || 0) + t.amount;
    });
    return m;
  }
  function actualByMonthSub() {
    var m = {};
    Store.budgetTransactions().forEach(function (t) {
      var k = t.main + '||' + t.sub, ym = String(t.date).slice(0, 7);
      if (!m[k]) m[k] = {};
      m[k][ym] = (m[k][ym] || 0) + t.amount;
    });
    return m;
  }
  function mainOrder() {
    var seen = [];
    Store.budgetCategories().forEach(function (c) { if (seen.indexOf(c.main) === -1) seen.push(c.main); });
    return seen;
  }
  function monthlyPlanOf(c, n) {
    if (Array.isArray(c.monthlyPlan) && c.monthlyPlan.length === n) {
      return c.monthlyPlan.map(function (x) { return U.num(x, 0); });
    }
    var even = (U.num(c.annualBudget, 0)) / (n || 1);
    var out = [];
    for (var i = 0; i < n; i++) out.push(even);
    return out;
  }
  function relPct(annual, actual, frac) {
    var rel = annual * frac;
    return rel > 0 ? actual / rel : (actual > 0 ? 2 : 0);
  }
  function paceClass(annual, actual, frac) {
    if (annual > 0 && actual > annual) return 'pb-red';
    var r = relPct(annual, actual, frac);
    return r > 1 ? 'pb-red' : (r >= 0.85 ? 'pb-orange' : 'pb-green');
  }

  // פס התקדמות עם סמן "איפה היינו אמורים להיות" לפי חלק השנה שחלף
  function progressBar(actual, annual, frac) {
    var ratio = annual > 0 ? actual / annual : (actual > 0 ? 1 : 0);
    var fill = Math.min(100, ratio * 100);
    var marker = Math.min(100, frac * 100);
    return U.el('div', { class: 'bpb ' + paceClass(annual, actual, frac),
      title: 'הסמן מציין את חלק השנה שחלף (' + pct(frac) + ')' }, [
      U.el('div', { class: 'bpb-fill', style: 'width:' + fill.toFixed(1) + '%;' }),
      U.el('div', { class: 'bpb-marker', style: 'inset-inline-start:' + marker.toFixed(1) + '%;' }),
      U.el('span', { class: 'bpb-label', text: annual > 0 ? pct(actual / annual) : (actual > 0 ? '∞' : '—') })
    ]);
  }
  // תחזית לסוף השנה: הקצב עד היום מוכפל בשנה מלאה
  function forecastCell(actual, annual, frac) {
    if (!frac) return U.el('td', { class: 'muted', text: '—' });
    var proj = actual / frac, diff = proj - annual;
    if (annual > 0 && diff > annual * 0.005) {
      return U.el('td', null, [
        U.el('div', { style: 'color:#b91c1c;font-weight:700;', text: ils(proj) }),
        U.el('div', { style: 'font-size:11px;color:#b91c1c;', text: 'חריגה צפויה ' + ils(diff) })
      ]);
    }
    if (annual === 0 && proj > 0) {
      return U.el('td', null, [
        U.el('div', { style: 'color:#b91c1c;font-weight:700;', text: ils(proj) }),
        U.el('div', { style: 'font-size:11px;color:#b91c1c;', text: 'ללא תקציב' })
      ]);
    }
    return U.el('td', { text: ils(proj) });
  }

  // ---------- גיליון ניהול ----------
  function sheetView(view) {
    var cats = Store.budgetCategories();
    if (!cats.length) { view.appendChild(U.el('div', { class: 'empty' }, 'לא נטענו קטגוריות מאפליקציית התקציב.')); return; }
    var frac = Store.budgetFyFraction(), actual = actualBySub(), months = Store.budgetFyMonths();
    var amSub = actualByMonthSub();
    var mains = mainOrder().filter(function (m) { return !mainFilter || m === mainFilter; });

    var body = [];
    var gB = 0, gA = 0;
    mains.forEach(function (main) {
      var subs = cats.filter(function (c) { return c.main === main; });
      var mB = 0, mA = 0;
      subs.forEach(function (c) {
        mB += U.num(c.annualBudget, 0);
        mA += actual[c.main + '||' + c.sub] || 0;
      });
      gB += mB; gA += mA;
      body.push(U.el('tr', { class: 'b-main' }, [
        U.el('td', { text: main }),
        U.el('td', { text: ils(mB) }),
        U.el('td'),
        U.el('td', { text: ils(mA) }),
        U.el('td', { style: mB - mA < 0 ? 'color:#b91c1c;' : '', text: ils(mB - mA) }),
        U.el('td', null, progressBar(mA, mB, frac)),
        forecastCell(mA, mB, frac)
      ]));

      subs.forEach(function (c) {
        var a = actual[c.main + '||' + c.sub] || 0;
        var annual = U.num(c.annualBudget, 0);
        var open = !!openRows[c.id];
        var nameCell = U.el('td', { style: 'padding-inline-start:18px;' }, [
          U.el('button', { class: 'b-link', title: 'פיזור חודשי',
            onclick: function () { openRows[c.id] = !open; App.render(); } },
            [U.el('span', { class: 'b-chev', text: open ? '▾' : '▸' }), ' ', c.sub || ''])
        ]);
        body.push(U.el('tr', null, [
          nameCell,
          U.el('td', { text: annual ? ils(annual) : '—' }),
          U.el('td', { class: 'muted', text: c.owner || '' }),
          U.el('td', { text: a ? ils(a) : '—' }),
          U.el('td', { style: annual - a < 0 ? 'color:#b91c1c;font-weight:600;' : '', text: ils(annual - a) }),
          U.el('td', null, progressBar(a, annual, frac)),
          forecastCell(a, annual, frac)
        ]));
        if (open) {
          var plan = monthlyPlanOf(c, months.length);
          var am = amSub[c.main + '||' + c.sub] || {};
          var grid = U.el('div', { class: 'b-months' }, months.map(function (ym, i) {
            var act = am[ym] || 0;
            return U.el('div', { class: 'b-month' + (act > plan[i] && plan[i] > 0 ? ' over' : '') }, [
              U.el('div', { class: 'b-month-lbl', text: monthLabel(ym) }),
              U.el('div', { class: 'b-month-plan', text: 'תוכנן ' + ils(plan[i]) }),
              U.el('div', { class: 'b-month-act', text: 'בפועל ' + ils(act) })
            ]);
          }));
          body.push(U.el('tr', null, U.el('td', { colspan: '7' }, [
            U.el('div', { class: 'muted', style: 'font-size:12px;margin-bottom:6px;',
              text: 'פיזור חודשי — ' + c.sub + (c.note ? ' · ' + c.note : '') }),
            grid
          ])));
        }
      });
    });
    body.push(U.el('tr', { class: 'b-grand' }, [
      U.el('td', { text: 'סה"כ כללי' }),
      U.el('td', { text: ils(gB) }),
      U.el('td'),
      U.el('td', { text: ils(gA) }),
      U.el('td', { style: gB - gA < 0 ? 'color:#b91c1c;' : '', text: ils(gB - gA) }),
      U.el('td', null, progressBar(gA, gB, frac)),
      forecastCell(gA, gB, frac)
    ]));

    view.appendChild(U.el('div', { class: 'tbl-scroll' }, [U.el('table', { class: 'grid b-sheet' }, [
      U.el('thead', null, U.el('tr', null, ['קטגוריה', 'תקציב שנתי', 'אחראי', 'נוצל', 'יתרה', 'ניצול מול קצב השנה', 'תחזית לסוף השנה']
        .map(function (h) { return U.el('th', { text: h }); }))),
      U.el('tbody', null, body)
    ])]));
    view.appendChild(U.el('div', { class: 'muted', style: 'font-size:12px;margin-top:6px;',
      text: 'לחיצה על שם קטגוריה פותחת את הפיזור החודשי · הסמן בפס מציין כמה מהשנה חלף (' + pct(frac) + ') — פס שעבר אותו הוא קצב חריג.' }));
  }

  // ---------- תקציב מול ביצוע ----------
  function dashView(view) {
    var cats = Store.budgetCategories();
    var frac = Store.budgetFyFraction(), actual = actualBySub(), months = Store.budgetFyMonths();
    var amSub = actualByMonthSub();

    var rows = mainOrder().map(function (main) {
      var subs = cats.filter(function (c) { return c.main === main; });
      var b = 0, a = 0;
      subs.forEach(function (c) { b += U.num(c.annualBudget, 0); a += actual[c.main + '||' + c.sub] || 0; });
      return { main: main, budget: b, actual: a };
    }).sort(function (x, y) { return y.actual - x.actual; });

    view.appendChild(U.el('div', { class: 'card m-card', style: 'margin-bottom:14px;' }, [
      U.el('h3', { style: 'margin:0 0 10px;font-size:16px;', text: 'תקציב מול ביצוע לפי קטגוריה ראשית' })
    ].concat(rows.map(function (r) {
      return U.el('div', { style: 'margin-bottom:10px;' }, [
        U.el('div', { style: 'display:flex;gap:8px;align-items:baseline;font-size:13px;margin-bottom:3px;' }, [
          U.el('strong', { style: 'flex:1;min-width:0;', text: r.main }),
          U.el('span', { class: 'muted', text: ils(r.actual) + ' מתוך ' + ils(r.budget) }),
          U.el('span', { style: r.budget - r.actual < 0 ? 'color:#b91c1c;font-weight:600;' : 'color:var(--muted);',
            text: 'יתרה ' + ils(r.budget - r.actual) })
        ]),
        progressBar(r.actual, r.budget, frac)
      ]);
    }))));

    // תוכנן מול בפועל לפי חודש
    var planned = months.map(function () { return 0; });
    var actualM = months.map(function () { return 0; });
    cats.forEach(function (c) {
      var plan = monthlyPlanOf(c, months.length);
      plan.forEach(function (v, i) { planned[i] += v; });
      var am = amSub[c.main + '||' + c.sub] || {};
      months.forEach(function (ym, i) { actualM[i] += (am[ym] || 0); });
    });
    var max = Math.max.apply(null, [1].concat(planned).concat(actualM));
    view.appendChild(U.el('div', { class: 'card m-card' }, [
      U.el('h3', { style: 'margin:0 0 10px;font-size:16px;', text: 'תוכנן מול בפועל — לפי חודש' }),
      U.el('div', { class: 'b-chart' }, months.map(function (ym, i) {
        return U.el('div', { class: 'b-bar-col', title: monthLabel(ym) + ': תוכנן ' + ils(planned[i]) + ' · בפועל ' + ils(actualM[i]) }, [
          U.el('div', { class: 'b-bars' }, [
            U.el('div', { class: 'b-bar plan', style: 'height:' + (planned[i] / max * 100).toFixed(1) + '%;' }),
            U.el('div', { class: 'b-bar act' + (actualM[i] > planned[i] ? ' over' : ''), style: 'height:' + (actualM[i] / max * 100).toFixed(1) + '%;' })
          ]),
          U.el('div', { class: 'b-bar-lbl', text: monthLabel(ym) })
        ]);
      })),
      U.el('div', { class: 'muted', style: 'font-size:12px;margin-top:8px;' }, [
        U.el('span', { class: 'b-key plan' }), ' תוכנן   ',
        U.el('span', { class: 'b-key act' }), ' בפועל'
      ])
    ]));
  }

  // ---------- חיפוש חכם: חשבוניות · ספקים · עובדים במקום אחד ----------
  function searchView(view) {
    var all = Store.budgetTransactions();
    var mains = mainOrder();

    var qi = U.el('input', { value: q, placeholder: 'חיפוש חופשי — ספק, עובד, מס׳ חשבונית, תיאור…', style: 'flex:2;min-width:200px;' });
    var mainSel = U.el('select', { style: 'max-width:190px;' },
      [U.el('option', { value: '', text: 'כל הקטגוריות' })].concat(mains.map(function (m) { return U.el('option', { value: m, text: m }); })));
    mainSel.value = qMain;
    var kindSel = U.el('select', { style: 'max-width:150px;' }, [
      U.el('option', { value: '', text: 'הכול' }),
      U.el('option', { value: 'invoice', text: 'חשבוניות ספקים' }),
      U.el('option', { value: 'reimburse', text: 'החזרים לעובדים' })
    ]);
    kindSel.value = qKind;
    var from = U.el('input', { type: 'date', value: qFrom, style: 'max-width:150px;' });
    var to = U.el('input', { type: 'date', value: qTo, style: 'max-width:150px;' });

    function apply() {
      q = qi.value.trim(); qMain = mainSel.value; qKind = kindSel.value;
      qFrom = from.value; qTo = to.value;
      App.render();
    }
    qi.addEventListener('change', apply);
    [mainSel, kindSel, from, to].forEach(function (el) { el.addEventListener('change', apply); });

    view.appendChild(U.el('div', { class: 'card', style: 'padding:10px;margin-bottom:12px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;' },
      [qi, mainSel, kindSel, from, to,
       U.el('button', { class: 'btn secondary', text: 'ניקוי', onclick: function () {
         q = qMain = qKind = qFrom = qTo = ''; App.render();
       } })]));

    var needle = q.toLowerCase();
    var list = all.filter(function (t) {
      if (qMain && t.main !== qMain) return false;
      if (qKind && t.kind !== qKind) return false;
      if (qFrom && String(t.date) < qFrom) return false;
      if (qTo && String(t.date) > qTo) return false;
      if (!needle) return true;
      return (t.payee + ' ' + t.sub + ' ' + t.main + ' ' + t.invoiceNo + ' ' + t.description).toLowerCase().indexOf(needle) !== -1;
    }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });

    var total = 0;
    list.forEach(function (t) { total += t.amount; });

    // סיכום לפי מקבל התשלום — זה "סיכום ספקים" ו"סיכום עובדים" באותו מקום
    var byPayee = {};
    list.forEach(function (t) {
      var k = t.payee || '(ללא שם)';
      if (!byPayee[k]) byPayee[k] = { name: k, kind: t.kind, total: 0, count: 0 };
      byPayee[k].total += t.amount;
      byPayee[k].count++;
    });
    var payees = Object.keys(byPayee).map(function (k) { return byPayee[k]; })
      .sort(function (a, b) { return b.total - a.total; });

    view.appendChild(U.el('div', { class: 'kpi-grid' }, [
      kpi(String(list.length), 'תנועות', 'kpi-neutral'),
      kpi(ils(total), 'סה"כ', 'kpi-info'),
      kpi(String(payees.length), 'ספקים / עובדים', 'kpi-neutral')
    ]));

    if (!list.length) {
      view.appendChild(U.el('div', { class: 'empty' }, 'אין תנועות שתואמות לחיפוש.'));
      return;
    }

    view.appendChild(U.el('h3', { style: 'font-size:15px;margin:14px 0 6px;', text: 'לפי ספק / עובד' }));
    view.appendChild(U.el('div', { class: 'tbl-scroll' }, [U.el('table', { class: 'grid' }, [
      U.el('thead', null, U.el('tr', null, ['שם', 'סוג', 'תנועות', 'סה"כ'].map(function (h) { return U.el('th', { text: h }); }))),
      U.el('tbody', null, payees.slice(0, 40).map(function (p) {
        return U.el('tr', { style: 'cursor:pointer;', title: 'סינון לפי ' + p.name, onclick: function () { q = p.name; App.render(); } }, [
          U.el('td', null, U.el('strong', { text: p.name })),
          U.el('td', { class: 'muted', text: p.kind === 'reimburse' ? 'החזר לעובד' : 'ספק' }),
          U.el('td', { text: String(p.count) }),
          U.el('td', { style: 'font-weight:600;', text: ils(p.total) })
        ]);
      }))
    ])]));

    view.appendChild(U.el('h3', { style: 'font-size:15px;margin:16px 0 6px;', text: 'התנועות (' + list.length + ')' }));
    view.appendChild(U.el('div', { class: 'tbl-scroll' }, [U.el('table', { class: 'grid' }, [
      U.el('thead', null, U.el('tr', null, ['תאריך', 'קטגוריה', 'תת-קטגוריה', 'ספק / עובד', 'מס׳ חשבונית', 'תיאור', 'סכום']
        .map(function (h) { return U.el('th', { text: h }); }))),
      U.el('tbody', null, list.slice(0, 300).map(function (t) {
        return U.el('tr', null, [
          U.el('td', { style: 'white-space:nowrap;', text: t.date ? U.gregLabel(t.date) + '/' + String(t.date).slice(2, 4) : '' }),
          U.el('td', { text: t.main }),
          U.el('td', { text: t.sub }),
          U.el('td', null, U.el('strong', { text: t.payee })),
          U.el('td', { class: 'muted', text: t.invoiceNo }),
          U.el('td', { class: 'muted', text: t.description }),
          U.el('td', { style: 'font-weight:600;white-space:nowrap;', text: ils(t.amount) })
        ]);
      }))
    ])]));
    if (list.length > 300) {
      view.appendChild(U.el('div', { class: 'muted', style: 'font-size:12px;margin-top:6px;',
        text: 'מוצגות 300 התנועות האחרונות מתוך ' + list.length + ' — צמצמו את החיפוש כדי לראות את השאר.' }));
    }
  }

  function kpi(val, label, cls) {
    return U.el('div', { class: 'kpi ' + (cls || 'kpi-neutral') }, [
      U.el('div', { class: 'kpi-ic' }),
      U.el('div', { class: 'kpi-body' }, [
        U.el('div', { class: 'kpi-row' }, U.el('div', { class: 'kpi-val', text: val })),
        U.el('div', { class: 'kpi-lbl', text: label })
      ])
    ]);
  }

  // ---------- רינדור ----------
  function render(view) {
    if (!subscribed && Store.budgetSubscribe) {
      subscribed = true;
      Store.budgetSubscribe(function () { App.render(); });   // המזכירה מזינה — המסך מתעדכן
    }

    var st = Store.budgetState();
    var fy = Store.budgetFiscalYear();
    var TITLES = { sheet: 'ניהול תקציב', dash: 'תקציב מול ביצוע', search: 'חיפוש חכם' };
    view.appendChild(U.el('div', { class: 'page-head' }, [
      U.el('h2', { text: TITLES[subTab] || 'ניהול תקציב' }),
      fy.start ? U.el('span', { class: 'tag', text: 'שנת כספים ' + U.gregLabel(fy.start) + '/' + fy.start.slice(0, 4) + ' – ' + U.gregLabel(fy.end) + '/' + fy.end.slice(0, 4) }) : null,
      U.el('span', { class: 'spacer' }),
      U.el('button', { class: 'btn secondary', html: U.ICO.refresh + ' רענון', onclick: function () {
        Store.budgetLoad(true).then(function () { U.toast('הנתונים רועננו'); App.render(); });
      } })
    ].filter(Boolean)));

    if (!st) {
      view.appendChild(U.el('div', { class: 'card', style: 'border-inline-start:4px solid #d97706;' }, [
        U.el('div', { style: 'font-weight:600;', text: 'נתוני התקציב לא נטענו' }),
        U.el('div', { class: 'muted', style: 'font-size:13px;margin-top:4px;',
          text: Store.budgetLoadError() ? ('הסיבה מהשרת: ' + Store.budgetLoadError()) : 'ייתכן שהנתונים עדיין נטענים — נסו "רענון".' })
      ]));
      return;
    }

    if (subTab === 'sheet') {
      var mains = mainOrder();
      var chips = U.el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;align-items:center;' },
        [U.el('span', { class: 'muted', style: 'font-size:12px;', text: 'קטגוריה:' })].concat(mains.map(function (m) {
          return U.el('button', { class: 'tag', style: 'cursor:pointer;' + (mainFilter === m ? 'background:var(--brand);color:#fff;' : ''),
            text: m, onclick: function () { mainFilter = mainFilter === m ? '' : m; App.render(); } });
        })));
      view.appendChild(chips);
      sheetView(view);
    } else if (subTab === 'dash') dashView(view);
    else searchView(view);

    view.appendChild(U.el('div', { class: 'muted', style: 'font-size:12px;margin-top:14px;padding-top:8px;border-top:1px solid var(--border);',
      text: 'הנתונים מגיעים בזמן אמת מאפליקציית ניהול התקציב. הזנת חשבוניות נעשית שם, על ידי המזכירות.' }));
  }

  // שלושה מסכים = שלושה תת-טאבים של הגיליון (הניווט מנוהל ב-app.js)
  function viewFor(mode) {
    return { render: function (view) { subTab = mode; render(view); } };
  }
  global.BudgetView = viewFor('sheet');
  global.BudgetDashView = viewFor('dash');
  global.BudgetSearchView = viewFor('search');
})(window);
