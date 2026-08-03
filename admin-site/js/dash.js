/* dash.js — דשבורד מנהלים: מרכז נתונים מכל הגיליונות.
   שלוש שאלות: מה דחוף לי היום · מה מחכה לאישור שלי · איפה יש סיכון כספי או רגולטורי. */
(function (global) {
  'use strict';
  var U = global.U;

  var SOON_DAYS = 14;      // "מתקרב" לצורך דדליינים
  var WARN_DAYS = 60;      // תפוגת אישורי בטיחות

  function daysTo(iso) {
    if (!iso) return null;
    var d = U.fromISO(iso); d.setHours(0, 0, 0, 0);
    var t = U.fromISO(U.todayISO()); t.setHours(0, 0, 0, 0);
    return Math.round((d - t) / 86400000);
  }
  function ils(n) {
    return new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(Math.round(n || 0)) + ' ₪';
  }
  function dateLabel(iso) { return iso ? U.gregLabel(iso) + '/' + iso.slice(2, 4) : ''; }

  function card(title, rows, action) {
    var head = U.el('div', { style: 'display:flex;align-items:center;gap:8px;margin:0 0 8px;' }, [
      U.el('h3', { style: 'margin:0;font-size:16px;', text: title }),
      U.el('span', { class: 'spacer' }),
      action || null
    ].filter(Boolean));
    return U.el('div', { class: 'card m-card' }, [head].concat(rows));
  }
  function emptyLine(txt) {
    return U.el('div', { class: 'muted', style: 'font-size:13px;padding:6px 0;', text: txt });
  }
  function goBtn(label, viewId) {
    return U.el('button', { class: 'btn secondary small', text: label + ' ›',
      onclick: function () { App.setView(viewId); } });
  }
  function line(kids) {
    return U.el('div', { style: 'display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);' },
      kids.filter(Boolean));
  }
  function chip(text, style) { return U.el('span', { class: 'tag', style: 'font-size:12px;' + (style || ''), text: text }); }
  var RED = 'background:#fee2e2;color:#991b1b;border-color:#991b1b33;';
  var ORANGE = 'background:#fef3c7;color:#92400e;border-color:#92400e33;';

  // ---------- מונים עליונים ----------
  function kpiRow(view, data) {
    function kpi(val, label, cls, onClick) {
      var el = U.el('div', { class: 'kpi ' + (cls || 'kpi-neutral'), style: onClick ? 'cursor:pointer;' : '' }, [
        U.el('div', { class: 'kpi-ic' }),
        U.el('div', { class: 'kpi-body' }, [
          U.el('div', { class: 'kpi-row' }, U.el('div', { class: 'kpi-val', text: String(val) })),
          U.el('div', { class: 'kpi-lbl', text: label })
        ])
      ]);
      if (onClick) el.addEventListener('click', onClick);
      return el;
    }
    view.appendChild(U.el('div', { class: 'kpi-grid' }, [
      kpi(data.overdue.length, 'משימות באיחור', data.overdue.length ? 'kpi-bad' : 'kpi-good',
        function () { App.setView('tasks'); }),
      kpi(data.pendingSubs, 'דיווחי עובדים לאישור', data.pendingSubs ? 'kpi-warn' : 'kpi-neutral',
        function () { App.setView('queue'); }),
      kpi(data.pendingInv, 'חשבוניות לאישור', data.pendingInv ? 'kpi-warn' : 'kpi-neutral',
        function () { App.setView('kk'); }),
      kpi(ils(data.unplanned), 'כסף מאושר שלא תוכנן', data.unplanned > 0 ? 'kpi-bad' : 'kpi-good',
        function () { App.setView('kk'); }),
      kpi(data.certAlerts.length, 'אישורים שפגו/עומדים לפוג', data.certAlerts.length ? 'kpi-bad' : 'kpi-good',
        function () { App.setView('safety'); })
    ]));
  }

  // ---------- מה מחכה לאישור שלי ----------
  function inboxCard(data) {
    var rows = [];
    if (data.pendingSubs) {
      rows.push(line([
        U.el('span', { style: 'flex:1;', text: 'דיווחי עובדים מהפורטל' }),
        chip(data.pendingSubs + ' ממתינים', ORANGE),
        goBtn('לתור', 'queue')
      ]));
    }
    if (data.pendingInv) {
      rows.push(line([
        U.el('span', { style: 'flex:1;', text: 'חשבוניות קולות קוראים' }),
        chip(data.pendingInv + ' ממתינות', ORANGE),
        goBtn('לאישור', 'kk')
      ]));
    }
    if (data.absMissing) {
      rows.push(line([
        U.el('span', { style: 'flex:1;', text: 'היעדרויות שחסר להן אישור' }),
        chip(data.absMissing + ' חסרים', ORANGE),
        goBtn('להיעדרויות', 'abs')
      ]));
    }
    if (!rows.length) rows.push(emptyLine('אין כלום שממתין לך — נקי'));
    return card('מחכה לאישור שלי', rows);
  }

  // ---------- סיכון כספי ----------
  function moneyCard(data) {
    var rows = [];
    data.kkRisk.forEach(function (r) {
      var n = daysTo(r.spendDeadline);
      rows.push(line([
        U.el('span', { style: 'flex:1;min-width:0;font-weight:500;', text: r.name }),
        chip('נותר ' + ils(r.unplanned), RED),
        n != null ? chip('לניצול עד ' + dateLabel(r.spendDeadline) + (n >= 0 ? ' · ' + n + ' י׳' : ' · עבר'),
          n < 30 ? RED : ORANGE) : null
      ]));
    });
    data.kkDeadlines.forEach(function (r) {
      rows.push(line([
        U.el('span', { style: 'flex:1;min-width:0;font-weight:500;', text: r.name }),
        chip('הגשה עד ' + dateLabel(r.deadline) + ' · ' + daysTo(r.deadline) + ' י׳', ORANGE)
      ]));
    });
    data.overBudget.forEach(function (p) {
      rows.push(line([
        U.el('span', { style: 'flex:1;min-width:0;font-weight:500;', text: p.name }),
        chip('חריגה ' + ils(p.over), RED),
        goBtn('לפרויקט', 'projects')
      ]));
    });
    if (!rows.length) rows.push(emptyLine('אין סיכון כספי פתוח'));
    return card('סיכון כספי', rows, data.kkRisk.length || data.kkDeadlines.length ? goBtn('קולות קוראים', 'kk') : null);
  }

  // ---------- בטיחות ורישוי ----------
  function safetyCard(data) {
    var rows = data.certAlerts.slice(0, 6).map(function (r) {
      var exp = Store.safetyExpiry(r);
      var n = daysTo(exp);
      return line([
        U.el('span', { style: 'flex:1;min-width:0;font-weight:500;', text: r.name }),
        chip(n < 0 ? 'פג לפני ' + Math.abs(n) + ' י׳' : 'פג בעוד ' + n + ' י׳', n < 0 ? RED : ORANGE)
      ]);
    });
    if (!rows.length) rows.push(emptyLine('כל האישורים בתוקף'));
    if (data.certAlerts.length > 6) {
      rows.push(U.el('div', { class: 'muted', style: 'font-size:12px;padding-top:6px;',
        text: 'ועוד ' + (data.certAlerts.length - 6) + '…' }));
    }
    return card('בטיחות ורישוי', rows, goBtn('לגיליון', 'safety'));
  }

  // ---------- לוח השכר של החודש ----------
  function payrollCard(month) {
    var s = Store.settings();
    var statuses = (s.statuses || []);
    var entries = Store.pstatAll ? Store.pstatAll(month) : null;
    var emps = Store.employees().length;
    var done = 0, inprog = 0;
    if (entries) {
      Object.keys(entries).forEach(function (k) {
        var st = entries[k] && entries[k].statusId;
        if (!st) return;
        var def = statuses.filter(function (x) { return x.id === st; })[0];
        if (!def) return;
        if (/נסגר|הושלם/.test(def.name || '')) done++;
        else if (/בתהליך/.test(def.name || '')) inprog++;
      });
    }
    var rows = [
      line([U.el('span', { style: 'flex:1;', text: 'עובדים בלוח' }), chip(String(emps))]),
      line([U.el('span', { style: 'flex:1;', text: 'נסגרו' }), chip(String(done), done ? 'background:#dcfce7;color:#166534;' : '')]),
      line([U.el('span', { style: 'flex:1;', text: 'בתהליך' }), chip(String(inprog), inprog ? ORANGE : '')])
    ];
    return card('לוח שכר — ' + U.monthLabel(month), rows, goBtn('ללוח', 'status'));
  }

  // ---------- איסוף הנתונים ----------
  function collect(month) {
    var today = U.todayISO();
    var tasks = (Store.tasksAll() || []).filter(function (t) { return !t.archived && t.status !== 'הושלם'; });
    var overdue = tasks.filter(function (t) {
      var d = Store.daysToDue(t.due); return d != null && d < 0;
    });

    var pendingSubs = Store.pendingCount ? Store.pendingCount() : 0;
    var pendingInv = Store.kkPendingInvoices ? Store.kkPendingInvoices().length : 0;

    var absMissing = 0;
    (Store.records('abs', month, function (r) { return r.kind === 'absence'; }) || []).forEach(function (r) {
      if (r.approval === 'missing') absMissing++;
    });

    var unplanned = 0, kkRisk = [], kkDeadlines = [];
    (Store.kkAll ? Store.kkAll() : []).forEach(function (r) {
      var m = Store.kkMoney(r);
      var funded = ['approved', 'spending', 'closed'].indexOf(r.status) !== -1;
      if (funded && r.status !== 'closed' && m.unplanned > 0) {
        unplanned += m.unplanned;
        // סיכון אמיתי: נשאר כסף וגם יש תאריך ניצול שמתקרב
        var n = daysTo(r.spendDeadline);
        if (n != null && n <= 90) kkRisk.push({ name: r.name, unplanned: m.unplanned, spendDeadline: r.spendDeadline });
      }
      if (!funded && r.status !== 'rejected' && r.deadline) {
        var d = daysTo(r.deadline);
        if (d != null && d >= 0 && d <= SOON_DAYS) kkDeadlines.push({ name: r.name, deadline: r.deadline });
      }
    });
    kkRisk.sort(function (a, b) { return b.unplanned - a.unplanned; });
    kkDeadlines.sort(function (a, b) { return String(a.deadline).localeCompare(String(b.deadline)); });

    var overBudget = [];
    (Store.projectsAll ? Store.projectsAll() : []).forEach(function (p) {
      if (p.archived) return;
      var b = Store.projectBudget(p);
      if (b && b.over) overBudget.push({ name: p.name, over: b.used - b.budget });
    });

    var certAlerts = [];
    (Store.safetyAll ? Store.safetyAll() : []).forEach(function (r) {
      if (r.na) return;
      var exp = Store.safetyExpiry(r);
      if (!exp) return;
      var n = daysTo(exp);
      if (n != null && n <= WARN_DAYS) certAlerts.push(r);
    });
    certAlerts.sort(function (a, b) {
      return String(Store.safetyExpiry(a)).localeCompare(String(Store.safetyExpiry(b)));
    });

    return {
      tasks: tasks, overdue: overdue, pendingSubs: pendingSubs, pendingInv: pendingInv,
      absMissing: absMissing, unplanned: unplanned, kkRisk: kkRisk, kkDeadlines: kkDeadlines,
      overBudget: overBudget, certAlerts: certAlerts
    };
  }

  // ---------- רינדור ----------
  function render(view) {
    var month = App.currentMonth();
    var data = collect(month);

    view.appendChild(U.el('div', { class: 'page-head' }, [
      U.el('h2', { text: 'דשבורד מנהלים' }),
      U.el('span', { class: 'spacer' }),
      U.el('span', { class: 'muted', style: 'font-size:13px;',
        text: U.hebrewDate(U.todayISO()) + ' · ' + U.weekdayName(U.todayISO()) })
    ]));

    kpiRow(view, data);

    // שורה ראשונה: מה מחכה לי · סיכון כספי · בטיחות
    view.appendChild(U.el('div', { style: 'display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));margin-bottom:12px;' }, [
      inboxCard(data),
      moneyCard(data),
      safetyCard(data),
      payrollCard(month)
    ]));

    // בלוקי המשימות — נבנו בגיליון המשימות ושמורים לכאן
    if (global.TasksView && TasksView.renderDashboard) {
      TasksView.renderDashboard(view, Store.tasksAll().filter(function (t) { return !t.archived; }));
    }

    // ציר הזמן הוויזואלי
    if (global.TasksView && TasksView.renderTimeline) {
      var tl = U.el('div', { class: 'card m-card', style: 'margin-top:12px;' }, [
        U.el('h3', { style: 'margin:0 0 8px;font-size:16px;', text: 'ציר זמן — מפתיחה עד יעד' })
      ]);
      var host = U.el('div');
      tl.appendChild(host);
      TasksView.renderTimeline(host, data.tasks);
      view.appendChild(tl);
    }
  }

  global.DashView = { render: render };
})(window);
