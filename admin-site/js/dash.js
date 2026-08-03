/* dash.js — דשבורד מנהלים. שתי שכבות במסך אחד:
   (1) "מה בוער" — מונים שמופיעים רק כשיש מה לטפל בו. מסך נקי = הכול תקין.
   (2) "תמונת מצב" — כרטיסים לפי סדר העדיפות: רישוי ובטיחות · אישורים · השבוע הקרוב · כסף · שכר. */
(function (global) {
  'use strict';
  var U = global.U;

  var WEEK_DAYS = 14;      // "השבוע הקרוב" — חלון הימים לאירועים
  var WARN_DAYS = 60;      // תפוגת אישורי בטיחות
  var SPEND_DAYS = 90;     // ממתי דדליין ניצול כסף נחשב סיכון

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
  function go(viewId) { App.setView(viewId); }

  var RED = 'background:#fee2e2;color:#991b1b;border-color:#991b1b33;';
  var ORANGE = 'background:#fef3c7;color:#92400e;border-color:#92400e33;';
  var GREEN = 'background:#dcfce7;color:#166534;border-color:#16653433;';

  function chip(text, style) { return U.el('span', { class: 'tag', style: 'font-size:12px;' + (style || ''), text: text }); }
  function line(kids) {
    return U.el('div', { class: 'dash-line' }, kids.filter(Boolean));
  }
  function label(text) { return U.el('span', { style: 'flex:1;min-width:0;', text: text }); }
  function emptyLine(txt) { return U.el('div', { class: 'muted', style: 'font-size:13px;padding:6px 0;', text: txt }); }
  function goBtn(text, viewId) {
    return U.el('button', { class: 'btn secondary small', text: text + ' ›', onclick: function () { go(viewId); } });
  }
  // כותרת הכרטיס היא הקישור לגיליון — בלי כפתור נפרד
  function card(title, viewId, rows) {
    var head = U.el('h3', { class: 'dash-title', title: 'מעבר לגיליון' }, [
      U.el('span', { text: title }),
      U.el('span', { class: 'dash-chev', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
        + 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 6l-6 6 6 6"/></svg>' })
    ]);
    head.addEventListener('click', function () { go(viewId); });
    return U.el('div', { class: 'card m-card' }, [head].concat(rows));
  }

  // ---------- איסוף הנתונים ----------
  function collect(month) {
    var d = {};

    // --- 1. רישוי ובטיחות ---
    var LICENSE_GROUP = 'רישוי מוסד';
    var safety = Store.safetyAll ? Store.safetyAll() : [];
    d.license = null;
    d.certsExpired = []; d.certsSoon = []; d.licDocs = []; d.licMissing = [];
    safety.forEach(function (r) {
      // הרישיון עצמו מוצג בנפרד (כרטיס משלו) — לא נספר שוב ברשימת האישורים
      if (r.main || r.name === Store.LICENSE_MAIN_NAME) { d.license = r; return; }
      if (r.group === LICENSE_GROUP) {
        if (r.na) return;
        d.licDocs.push(r);
        if (!r.docPath && !r.issuedAt) d.licMissing.push(r);
        return;
      }
      if (r.na) return;
      var exp = Store.safetyExpiry(r);
      if (!exp) return;
      var n = daysTo(exp);
      if (n == null) return;
      if (n < 0) d.certsExpired.push(r);
      else if (n <= WARN_DAYS) d.certsSoon.push(r);
    });
    function byExpiry(a, b) {
      return String(Store.safetyExpiry(a)).localeCompare(String(Store.safetyExpiry(b)));
    }
    d.certsExpired.sort(byExpiry); d.certsSoon.sort(byExpiry);
    d.licenseDays = d.license ? daysTo(Store.safetyExpiry(d.license)) : null;

    // --- 2. תורי אישורים ---
    d.pendingSubs = Store.pendingCount ? Store.pendingCount() : 0;
    d.pendingInv = Store.kkPendingInvoices ? Store.kkPendingInvoices().length : 0;
    d.absMissing = 0;
    (Store.records('abs', month, function (r) { return r.kind === 'absence'; }) || []).forEach(function (r) {
      if (r.approval === 'missing' || (!r.approval && !r.docPath)) d.absMissing++;
    });

    // --- 3. השבוע הקרוב ---
    d.events = [];
    (Store.eventsAll ? Store.eventsAll() : []).forEach(function (ev) {
      if (!ev.date) return;
      var n = daysTo(ev.date);
      if (n == null || n < 0 || n > WEEK_DAYS) return;
      var open = (ev.tasks || []).filter(function (t) { return t.status !== 'בוצע'; });
      d.events.push({ ev: ev, days: n, open: open.length, total: (ev.tasks || []).length });
    });
    d.events.sort(function (a, b) { return a.days - b.days; });
    d.eventsOpen = d.events.reduce(function (s, x) { return s + x.open; }, 0);

    // --- 4. כסף ---
    d.unplanned = 0; d.kkRows = []; d.kkDeadlines = [];
    (Store.kkAll ? Store.kkAll() : []).forEach(function (r) {
      var m = Store.kkMoney(r);
      var funded = ['approved', 'spending', 'closed'].indexOf(r.status) !== -1;
      if (funded && r.status !== 'closed') {
        if (m.unplanned > 0) d.unplanned += m.unplanned;
        d.kkRows.push({ name: r.name, m: m, spendDeadline: r.spendDeadline });
      }
      if (!funded && r.status !== 'rejected' && r.deadline) {
        var n = daysTo(r.deadline);
        if (n != null && n >= 0 && n <= 30) d.kkDeadlines.push({ name: r.name, deadline: r.deadline, days: n });
      }
    });
    d.kkRows.sort(function (a, b) { return b.m.unplanned - a.m.unplanned; });
    d.kkDeadlines.sort(function (a, b) { return a.days - b.days; });
    d.kkUrgent = d.kkRows.filter(function (r) {
      var n = daysTo(r.spendDeadline);
      return r.m.unplanned > 0 && n != null && n <= SPEND_DAYS;
    });

    d.overBudget = [];
    (Store.projectsAll ? Store.projectsAll() : []).forEach(function (p) {
      if (p.archived) return;
      var b = Store.projectBudget(p);
      if (b && b.over) d.overBudget.push({ name: p.name, over: b.used - b.budget });
    });

    // --- 5. שכר ומשימות ---
    var emps = Store.employees().filter(function (e) { return e.active !== false; });
    var closed = 0, inprog = 0;
    emps.forEach(function (e) {
      var en = Store.pstatEntry(month, e.id);
      if (!en) return;
      if (en.status === 'נסגר') closed++;
      else if (en.status === 'בתהליך') inprog++;
    });
    d.payroll = { total: emps.length, closed: closed, inprog: inprog };

    var tasks = (Store.tasksAll() || []).filter(function (t) { return !t.archived && t.status !== 'הושלם'; });
    d.overdue = tasks.filter(function (t) { var n = Store.daysToDue(t.due); return n != null && n < 0; });
    d.dueSoon = tasks.filter(function (t) { var n = Store.daysToDue(t.due); return n != null && n >= 0 && n <= 7; });
    d.overdue.sort(function (a, b) { return String(a.due).localeCompare(String(b.due)); });
    d.dueSoon.sort(function (a, b) { return String(a.due).localeCompare(String(b.due)); });

    return d;
  }

  // ---------- שכבה 1: מה בוער ----------
  function alertTiles(view, d) {
    var tiles = [];
    function tile(val, lbl, cls, viewId, sub) {
      var el = U.el('div', { class: 'kpi ' + cls, style: 'cursor:pointer;' }, [
        U.el('div', { class: 'kpi-ic' }),
        U.el('div', { class: 'kpi-body' }, [
          U.el('div', { class: 'kpi-row' }, U.el('div', { class: 'kpi-val', text: String(val) })),
          U.el('div', { class: 'kpi-lbl', text: lbl }),
          sub ? U.el('div', { class: 'kpi-sub', text: sub }) : null
        ].filter(Boolean))
      ]);
      el.addEventListener('click', function () { go(viewId); });
      tiles.push(el);
    }

    // סדר העדיפות שנקבע: רישוי ובטיחות → אישורים → השבוע הקרוב → כסף
    if (d.license && d.licenseDays != null && d.licenseDays <= WARN_DAYS) {
      tile(d.licenseDays < 0 ? 'פג' : d.licenseDays,
        d.licenseDays < 0 ? 'רישיון המוסד פג תוקף' : 'ימים לחידוש רישיון המוסד',
        d.licenseDays < 0 ? 'kpi-bad' : 'kpi-warn', 'safety');
    }
    if (d.certsExpired.length) tile(d.certsExpired.length, 'אישורי בטיחות שפגו', 'kpi-bad', 'safety',
      d.certsExpired[0].name);
    if (d.certsSoon.length) tile(d.certsSoon.length, 'פגים תוך ' + WARN_DAYS + ' יום', 'kpi-warn', 'safety');
    if (d.licMissing.length) tile(d.licMissing.length, 'מסמכי רישוי חסרים', 'kpi-warn', 'safety');

    if (d.pendingSubs) tile(d.pendingSubs, 'דיווחי עובדים לאישור', 'kpi-warn', 'queue');
    if (d.pendingInv) tile(d.pendingInv, 'חשבוניות לאישור', 'kpi-warn', 'kk');
    if (d.absMissing) tile(d.absMissing, 'היעדרויות בלי אישור', 'kpi-warn', 'abs');

    if (d.eventsOpen) tile(d.eventsOpen, 'משימות פתוחות באירועים קרובים', 'kpi-info', 'events',
      d.events.length ? d.events[0].ev.title : '');

    if (d.unplanned > 0) tile(ils(d.unplanned), 'כסף מאושר שעוד לא תוכנן', 'kpi-bad', 'kk',
      d.kkUrgent.length ? d.kkUrgent.length + ' ק"ק עם דדליין ניצול קרוב' : '');
    if (d.overdue.length) tile(d.overdue.length, 'משימות באיחור', 'kpi-bad', 'tasks');

    if (!tiles.length) {
      view.appendChild(U.el('div', { class: 'card m-card dash-clear' }, [
        U.el('div', { style: 'font-size:17px;font-weight:600;', text: 'הכול נקי' }),
        U.el('div', { class: 'muted', style: 'font-size:13px;margin-top:4px;',
          text: 'אין אישור שפג, אין דיווח שממתין לך ואין כסף שלא תוכנן.' })
      ]));
      return;
    }
    view.appendChild(U.el('div', { class: 'kpi-grid' }, tiles));
  }

  // ---------- שכבה 2: כרטיסים ----------
  function licenseCard(d) {
    var rows = [];
    if (d.license) {
      var exp = Store.safetyExpiry(d.license);
      var n = d.licenseDays;
      var st = n == null ? chip('לא הוזן תאריך') :
        n < 0 ? chip('פג לפני ' + Math.abs(n) + ' י׳', RED) :
        n <= WARN_DAYS ? chip('פג בעוד ' + n + ' י׳', ORANGE) : chip('בתוקף', GREEN);
      rows.push(U.el('div', { class: 'dash-hero' }, [
        U.el('div', { style: 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;' }, [
          U.el('strong', { style: 'font-size:17px;', text: 'רישיון מוסד' }), st
        ]),
        U.el('div', { class: 'muted', style: 'font-size:13px;margin-top:4px;',
          text: exp ? 'בתוקף עד ' + dateLabel(exp) : 'לא הוזן תאריך תוקף' }),
        U.el('div', { style: 'margin-top:8px;' }, [
          U.el('div', { class: 'dash-bar' }, U.el('span', {
            style: 'width:' + (d.licDocs.length ? Math.round((d.licDocs.length - d.licMissing.length) / d.licDocs.length * 100) : 0) + '%;'
          })),
          U.el('div', { class: 'muted', style: 'font-size:12px;margin-top:4px;',
            text: (d.licDocs.length - d.licMissing.length) + ' מתוך ' + d.licDocs.length + ' מסמכי רישוי מוכנים' })
        ])
      ]));
    }
    d.certsExpired.slice(0, 4).forEach(function (r) {
      var n = daysTo(Store.safetyExpiry(r));
      rows.push(line([label(r.name), chip('פג לפני ' + Math.abs(n) + ' י׳', RED)]));
    });
    d.certsSoon.slice(0, 4).forEach(function (r) {
      var n = daysTo(Store.safetyExpiry(r));
      rows.push(line([label(r.name), chip('בעוד ' + n + ' י׳', ORANGE)]));
    });
    if (!d.certsExpired.length && !d.certsSoon.length) rows.push(emptyLine('כל אישורי הבטיחות בתוקף'));
    return card('רישוי ובטיחות', 'safety', rows);
  }

  function inboxCard(d) {
    var rows = [];
    if (d.pendingSubs) rows.push(line([label('דיווחי עובדים מהפורטל'), chip(d.pendingSubs + ' ממתינים', ORANGE), goBtn('לתור', 'queue')]));
    if (d.pendingInv) rows.push(line([label('חשבוניות קולות קוראים'), chip(d.pendingInv + ' ממתינות', ORANGE), goBtn('להכרעה', 'kk')]));
    if (d.absMissing) rows.push(line([label('היעדרויות בלי מסמך אישור'), chip(d.absMissing + ' חסרים', ORANGE), goBtn('להיעדרויות', 'abs')]));
    if (!rows.length) rows.push(emptyLine('אין כלום שממתין לאישור שלך'));
    return card('מחכה לאישור שלי', 'queue', rows);
  }

  function weekCard(d) {
    var rows = d.events.slice(0, 6).map(function (x) {
      var when = x.days === 0 ? 'היום' : x.days === 1 ? 'מחר' : 'בעוד ' + x.days + ' י׳';
      return line([
        U.el('span', { style: 'flex:1;min-width:0;' }, [
          U.el('div', { style: 'font-weight:500;', text: x.ev.title || 'אירוע' }),
          U.el('div', { class: 'muted', style: 'font-size:12px;',
            text: U.weekdayName(x.ev.date) + ' · ' + dateLabel(x.ev.date) + (x.ev.location ? ' · ' + x.ev.location : '') })
        ]),
        chip(when, x.days <= 2 ? ORANGE : ''),
        x.open ? chip(x.open + ' משימות פתוחות', RED) : chip('מוכן', GREEN)
      ]);
    });
    if (!rows.length) rows.push(emptyLine('אין אירועים ב-' + WEEK_DAYS + ' הימים הקרובים'));
    return card('השבוע הקרוב', 'events', rows);
  }

  function moneyCard(d) {
    var rows = [];
    d.kkRows.slice(0, 5).forEach(function (r) {
      var n = daysTo(r.spendDeadline);
      rows.push(U.el('div', { class: 'dash-line', style: 'flex-direction:column;align-items:stretch;gap:4px;' }, [
        U.el('div', { style: 'display:flex;align-items:center;gap:8px;' }, [
          U.el('span', { style: 'flex:1;min-width:0;font-weight:500;', text: r.name }),
          r.m.unplanned > 0 ? chip('לא תוכנן ' + ils(r.m.unplanned), n != null && n <= SPEND_DAYS ? RED : ORANGE)
            : chip('מתוכנן במלואו', GREEN)
        ]),
        U.el('div', { class: 'muted', style: 'font-size:12px;',
          text: 'אושר ' + ils(r.m.approved) + ' · נוצל ' + ils(r.m.used) + ' · מתוכנן ' + ils(r.m.planned) +
            (n != null ? ' · לניצול עד ' + dateLabel(r.spendDeadline) + (n < 0 ? ' (עבר)' : ' · ' + n + ' י׳') : '') })
      ]));
    });
    d.kkDeadlines.slice(0, 3).forEach(function (r) {
      rows.push(line([label(r.name), chip('הגשה עד ' + dateLabel(r.deadline) + ' · ' + r.days + ' י׳', ORANGE)]));
    });
    d.overBudget.slice(0, 3).forEach(function (p) {
      rows.push(line([label(p.name), chip('חריגה ' + ils(p.over), RED), goBtn('לפרויקט', 'projects')]));
    });
    if (!rows.length) rows.push(emptyLine('אין קולות קוראים במימוש ואין חריגות תקציב'));
    else if (d.unplanned > 0) {
      rows.push(U.el('div', { style: 'display:flex;align-items:center;gap:8px;padding-top:8px;font-weight:600;' }, [
        label('סה"כ כסף מאושר שלא תוכנן'), chip(ils(d.unplanned), RED)
      ]));
    }
    return card('כסף — קולות קוראים ופרויקטים', 'kk', rows);
  }

  function payrollCard(d, month) {
    var p = d.payroll;
    var pct = p.total ? Math.round(p.closed / p.total * 100) : 0;
    var rows = [
      U.el('div', { class: 'dash-bar' }, U.el('span', { style: 'width:' + pct + '%;' })),
      U.el('div', { class: 'muted', style: 'font-size:12px;margin:4px 0 8px;',
        text: p.closed + ' מתוך ' + p.total + ' עובדים נסגרו (' + pct + '%)' }),
      p.inprog ? line([label('בתהליך'), chip(String(p.inprog), ORANGE)]) : null,
      p.total - p.closed - p.inprog > 0 ? line([label('טרם נפתחו'), chip(String(p.total - p.closed - p.inprog))]) : null
    ].filter(Boolean);
    return card('לוח שכר — ' + U.monthLabel(month), 'status', rows);
  }

  function tasksCard(d) {
    var rows = [];
    // תיאור המשימה נשמר בשדה desc (לא title) — כמו בגיליון המשימות
    function taskLabel(t) { return String(t.desc || t.title || '').trim() || 'משימה ללא תיאור'; }
    d.overdue.slice(0, 5).forEach(function (t) {
      var n = Math.abs(Store.daysToDue(t.due));
      rows.push(line([label(taskLabel(t)), chip('באיחור ' + n + ' י׳', RED)]));
    });
    d.dueSoon.slice(0, 5).forEach(function (t) {
      var n = Store.daysToDue(t.due);
      rows.push(line([label(taskLabel(t)), chip(n === 0 ? 'להיום' : 'בעוד ' + n + ' י׳', n <= 2 ? ORANGE : '')]));
    });
    if (!rows.length) rows.push(emptyLine('אין משימות באיחור או ליעד השבוע'));
    return card('המשימות שלי', 'tasks', rows);
  }

  // ---------- רינדור ----------
  function render(view) {
    var month = App.currentMonth();
    var d = collect(month);

    view.appendChild(U.el('div', { class: 'page-head' }, [
      U.el('h2', { text: 'דשבורד' }),
      U.el('span', { class: 'spacer' }),
      U.el('span', { class: 'muted', style: 'font-size:13px;',
        text: U.weekdayName(U.todayISO()) + ' · ' + U.hebrewDate(U.todayISO()) })
    ]));

    alertTiles(view, d);

    view.appendChild(U.el('div', { class: 'dash-cards' }, [
      licenseCard(d),
      inboxCard(d),
      weekCard(d),
      moneyCard(d),
      tasksCard(d),
      payrollCard(d, month)
    ]));
  }

  global.DashView = { render: render, collect: collect };
})(window);
