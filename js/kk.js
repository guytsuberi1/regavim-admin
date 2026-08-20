/* kk.js — קולות קוראים: מעקב מפרסום ועד דיווח שנתי, עם משיכת חשבוניות מאפליקציית התקציב */
(function (global) {
  'use strict';
  var U = global.U;

  // מחזור החיים כפי שגיא תיאר אותו
  var STATUSES = [
    { key: 'published', label: 'פורסם', color: '#64748b' },
    { key: 'prep', label: 'בהכנה', color: '#d97706' },
    { key: 'submitted', label: 'הוגש', color: '#2563eb' },
    { key: 'approved', label: 'התקבל הקצבה', color: '#16a34a' },
    { key: 'spending', label: 'מימוש', color: '#0d9488' },
    { key: 'reporting', label: 'בדיווח', color: '#7c3aed' },
    { key: 'closed', label: 'דווח ונסגר', color: '#475569' },
    { key: 'rejected', label: 'לא אושר / לא רלוונטי', color: '#b91c1c' }
  ];

  // המסלול: שלושה שלבי-על. הצ'ק-ליסט תלוי בשלב ולא בסטטוס המדויק,
  // כדי שהזזת סטטוס בתוך אותו שלב (למשל "פורסם"→"בהכנה") לא תחליף רשימה.
  var STAGES = [
    { key: 'submit', label: 'הגשה',  statuses: ['published', 'prep', 'submitted'] },
    { key: 'spend',  label: 'מימוש', statuses: ['approved', 'spending'] },
    { key: 'report', label: 'דיווח', statuses: ['reporting', 'closed'] }
  ];
  function stageOf(rec) {
    var st = (rec && rec.status) || 'published';
    for (var i = 0; i < STAGES.length; i++) if (STAGES[i].statuses.indexOf(st) !== -1) return STAGES[i].key;
    return '';                       // "לא אושר" — מחוץ למסלול
  }
  function stageIdx(key) {
    for (var i = 0; i < STAGES.length; i++) if (STAGES[i].key === key) return i;
    return -1;
  }
  // רשימת המשימות של שלב, עם יצירה עצלה כדי שרשומות ותיקות לא ייפלו
  function stepsOf(rec, stage) {
    if (!rec.steps) rec.steps = {};
    if (!rec.steps[stage]) rec.steps[stage] = [];
    return rec.steps[stage];
  }
  function stepCount(rec, stage) {
    var l = stepsOf(rec, stage);
    return { total: l.length, done: l.filter(function (t) { return t.done; }).length };
  }
  // רשימת פתיחה גנרית — כשאין מסמך רשמי, כדי שהשלב לא יהיה מסך ריק
  var DEFAULT_STEPS = {
    submit: ['הורדת טופס הבקשה מאתר הגוף המממן', 'מילוי פרטי המוסד והפעילות',
             'אישור ניהול תקין / ניהול ספרים', 'אישור רישוי המוסד', 'תקציב מוצע לפעילות',
             'חתימת מורשי חתימה', 'הגשה במערכת המקוונת', 'שמירת אישור ההגשה'],
    report: ['איסוף כל החשבוניות והקבלות', 'התאמת ההוצאות לסעיפי התקציב שאושרו',
             'מילוי טופס דיווח ביצוע', 'אישור רו"ח / מנהל כספים',
             'תמונות ותיעוד הפעילות', 'הגשת הדיווח במערכת', 'שמירת אישור הדיווח']
  };
  function newStep(title, help, form, link) {
    return { id: 'st' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
             title: title, help: help || '', form: form || '', link: link || '',
             file: null, done: false, note: '' };
  }
  // סטטוס שורת תכנון — במילים של האקסל
  var PLAN_STATUS = ['תכנון', 'בביצוע'];
  function stDef(k) { return STATUSES.filter(function (s) { return s.key === k; })[0] || STATUSES[0]; }
  // שלבים שבהם הכסף כבר אושר — רק להם יש משמעות לתמונת הניצול
  function isFunded(rec) { return ['approved', 'spending', 'reporting', 'closed'].indexOf(rec.status) !== -1; }

  var subTab = 'list';      // 'list' (מבט על) | 'inbox'
  var selectedId = null;    // קול קורא פתוח בפירוט

  function ils(n) {
    return new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(Math.round(n || 0)) + ' ₪';
  }
  // ימים עד תאריך — שלילי = עבר
  function daysTo(iso) {
    if (!iso) return null;
    var d = U.fromISO(iso); d.setHours(0, 0, 0, 0);
    var t = U.fromISO(U.todayISO()); t.setHours(0, 0, 0, 0);
    return Math.round((d - t) / 86400000);
  }
  // צ'יפ תאריך עם ספירה לאחור — אדום כשדחוף, אפור כשעבר
  function deadlineChip(iso, label) {
    if (!iso) return U.el('span', { class: 'muted', style: 'font-size:12px;', text: label + ': —' });
    var n = daysTo(iso);
    var style = 'font-size:12px;';
    if (n < 0) style += 'opacity:.6;';
    else if (n <= 7) style += 'background:#fee2e2;border-color:#b91c1c;color:#b91c1c;font-weight:600;';
    else if (n <= 21) style += 'background:#fef3c7;border-color:#d97706;color:#92400e;';
    var txt = label + ': ' + U.gregLabel(iso) + '/' + iso.slice(2, 4);
    if (n >= 0) txt += ' · עוד ' + n + ' ימים';
    else txt += ' · עבר';
    return U.el('span', { class: 'tag', style: style, text: txt });
  }

  // ---------- עריכה ישירה בשורות הטבלה ----------
  // כל שדה עוצר את בועת הקליק, אחרת הלחיצה על התא פותחת את מסך הפירוט.
  function stopBubble(el) {
    ['click', 'mousedown', 'focus'].forEach(function (ev) {
      el.addEventListener(ev, function (e) { e.stopPropagation(); });
    });
    return el;
  }
  function bare(el) {
    el.style.border = '1px solid transparent';
    el.style.background = 'transparent';
    el.style.padding = '4px 6px';
    el.style.marginInline = '-7px';
    el.addEventListener('focus', function () { el.style.background = 'var(--card)'; el.style.borderColor = 'var(--border)'; });
    el.addEventListener('blur', function () { el.style.background = 'transparent'; el.style.borderColor = 'transparent'; });
    return stopBubble(el);
  }
  function saveKk(r) { Store.upsertKk(r); }
  function cellText(r, field, ph, style) {
    var i = bare(U.el('input', { value: r[field] || '', placeholder: ph || '', style: style || '', autocomplete: 'off' }));
    i.addEventListener('change', function () { r[field] = i.value.trim(); saveKk(r); });
    return i;
  }
  function cellDate(r, field) {
    var i = bare(U.el('input', { type: 'date', value: r[field] || '', style: 'max-width:132px;' }));
    i.addEventListener('change', function () { r[field] = i.value; saveKk(r); App.render(); });
    return i;
  }
  function cellMoney(r, field, rerender) {
    return bare(U.moneyInput({
      value: r[field] != null && r[field] !== '' ? r[field] : '',
      placeholder: '0', style: 'max-width:104px;text-align:right;font-weight:600;',
      onSave: function (v) {
        if (v !== r[field]) r.amountManual = true;    // ערך ידני לא נדרס בסנכרון מהתקציב
        r[field] = v;
        saveKk(r);
        if (rerender) App.render();
      }
    }));
  }
  // בורר סטטוס צבוע-מלא — שינוי ישירות מהטבלה, בלי להיכנס לעריכה
  function cellStatus(r) {
    var sel = U.el('select', { class: 'm-status m-status-auto', style: 'font-size:12px;padding:6px 10px;min-width:118px;' },
      STATUSES.map(function (x) { return U.el('option', { value: x.key, text: x.label }); }));
    sel.value = r.status || 'published';
    sel.style.background = stDef(sel.value).color;
    stopBubble(sel);
    sel.addEventListener('change', function () { r.status = sel.value; saveKk(r); App.render(); });
    return sel;
  }

  // ---------- טופס קול קורא ----------
  function openModal(rec) {
    var isNew = !rec;
    rec = rec ? JSON.parse(JSON.stringify(rec)) : { status: 'published', planned: [], docs: [] };
    var err = U.el('div', { class: 'field-err' });
    function fld(l, n) { return U.el('div', { class: 'field' }, [U.el('label', { text: l }), n]); }

    var name = U.el('input', { value: rec.name || '', placeholder: 'שם הקול הקורא' });
    var funder = U.el('input', { value: rec.funder || '', placeholder: 'משרד החינוך / הרשות…' });
    var status = U.el('select', null, STATUSES.map(function (s) { return U.el('option', { value: s.key, text: s.label }); }));
    status.value = rec.status || 'published';
    var year = U.el('input', { value: rec.year || fyLabel(), placeholder: 'שנת כספים' });

    // מפתח החיבור לאפליקציית התקציב
    var subs = Store.budgetKkSubs();
    var budgetSub = U.el('select', null, [U.el('option', { value: '', text: '— לא מקושר —' })].concat(
      subs.map(function (c) { return U.el('option', { value: c.sub, text: c.sub }); })));
    if (rec.budgetSub && subs.filter(function (c) { return c.sub === rec.budgetSub; }).length === 0) {
      budgetSub.appendChild(U.el('option', { value: rec.budgetSub, text: rec.budgetSub + ' (לא נמצא בתקציב)' }));
    }
    budgetSub.value = rec.budgetSub || '';

    var publishedAt = U.el('input', { type: 'date', value: rec.publishedAt || '' });
    var deadline = U.el('input', { type: 'date', value: rec.deadline || '' });
    var submittedAt = U.el('input', { type: 'date', value: rec.submittedAt || '' });
    var approvedAt = U.el('input', { type: 'date', value: rec.approvedAt || '' });
    var amountFunder = U.el('input', { type: 'number', min: '0', step: '1', value: rec.amountFunder != null ? rec.amountFunder : '', placeholder: '0' });
    var amountSelf = U.el('input', { type: 'number', min: '0', step: '1', value: rec.amountSelf != null ? rec.amountSelf : '', placeholder: '0' });
    var owner = U.el('input', { value: rec.owner || '', placeholder: 'אחראי' });
    var note = U.el('textarea', { rows: 2, placeholder: 'הערות' }, rec.note || '');

    Modal.open(isNew ? 'קול קורא חדש' : 'עריכת קול קורא', U.el('div', null, [
      fld('שם הקול הקורא', name),
      U.el('div', { class: 'row' }, [fld('אחראי', owner), fld('גוף מממן', funder)]),
      U.el('div', { class: 'row' }, [fld('סטטוס', status), fld('שנת כספים', year)]),
      fld('קטגוריה באפליקציית התקציב (מקור החשבוניות)', budgetSub),
      U.el('div', { class: 'row' }, [fld('תאריך פרסום', publishedAt), fld('תאריך יעד (הגשה / ניצול / דיווח)', deadline)]),
      U.el('div', { class: 'row' }, [fld('הוגש בפועל', submittedAt), fld('תאריך אישור', approvedAt)]),
      U.el('div', { class: 'row' }, [fld('סכום מאושר — הגורם המממן', amountFunder), fld('מצ׳ינג — חלק הישיבה', amountSelf)]),
      fld('הערות', note),
      err
    ]), [
      { label: 'ביטול', class: 'secondary' },
      { label: 'שמירה', onClick: function (close) {
        if (!name.value.trim()) { err.textContent = 'נדרש שם'; name.focus(); return; }
        rec.name = name.value.trim();
        rec.funder = funder.value.trim();
        rec.status = status.value;
        rec.year = year.value.trim();
        rec.budgetSub = budgetSub.value;
        rec.publishedAt = publishedAt.value;
        rec.deadline = deadline.value;
        rec.submittedAt = submittedAt.value;
        rec.approvedAt = approvedAt.value;
        var newFunder = amountFunder.value.trim() === '' ? '' : U.num(amountFunder.value);
        // סכום שהוזן ידנית לא ידרס בסנכרון הבא מהתקציב
        if (newFunder !== rec.amountFunder) rec.amountManual = true;
        rec.amountFunder = newFunder;
        rec.amountSelf = amountSelf.value.trim() === '' ? '' : U.num(amountSelf.value);
        rec.owner = owner.value.trim();
        rec.note = note.value.trim();
        Store.upsertKk(rec);
        close();
        App.render();
      } }
    ]);
  }

  // עד כה היו שלושה תאריכי יעד (הגשה · ניצול · דיווח). אוחדו לשדה אחד — deadline.
  function migrateDates() {
    Store.kkAll().forEach(function (r) {
      if (r.datesMerged) return;
      if (!r.deadline) r.deadline = r.spendDeadline || r.reportDate || '';
      delete r.spendDeadline; delete r.reportDate;
      r.datesMerged = true;
      Store.upsertKk(r);
    });
  }

  // שנת הכספים המוצגת משותפת עם גיליון ניהול התקציב (App.currentFy) —
  // החלפת שנה שם מחליפה גם כאן, ולהפך.
  function fyLabel() {
    if (App.fyLabel) {
      var l = App.fyLabel();
      if (l) return l;
    }
    var fy = Store.budgetFiscalYear();
    if (fy && fy.start) return fy.start.slice(0, 4) + '/' + String(parseInt(fy.start.slice(0, 4), 10) + 1).slice(2);
    var t = U.todayISO(), y = parseInt(t.slice(0, 4), 10);
    if (parseInt(t.slice(5, 7), 10) < 9) y--;   // שנת הישיבה: 1/9 עד 31/8
    return y + '/' + String(y + 1).slice(2);
  }
  // רשומה שייכת לשנה המוצגת? רשומה ישנה בלי שנה נחשבת לשנה הפעילה,
  // אחרת היא הייתה נעלמת מהמסך בלי שאיש ביקש.
  function activeLabel() {
    var f = Store.budgetCurrentFy ? Store.budgetCurrentFy() : null;
    return f ? (f.year + '/' + String(f.year + 1).slice(2)) : '';
  }
  function inShownFy(rec) {
    var shown = fyLabel();
    var y = String(rec.year || '').trim();
    if (!y) return shown === activeLabel();
    return y === shown;
  }
  // בורר שנה זהה לזה שבגיליון הניהול — אותו מצב, אותה התנהגות
  function fySelect() {
    var years = Store.budgetFyYears ? Store.budgetFyYears() : [];
    if (!years.length) return null;
    var sel = U.el('select', { style: 'max-width:150px;', title: 'שנת כספים (1/9–31/8)' },
      years.map(function (y) { return U.el('option', { value: String(y.year), text: 'שנת ' + y.label }); }));
    sel.value = String(App.currentFy ? App.currentFy() : '');
    sel.addEventListener('change', function () { App.setFy(sel.value); });
    return sel;
  }

  // ---------- פס הכסף: נוצל · מתוכנן · ללא תכנון ----------
  function moneyBar(m) {
    var used = Math.max(0, Math.min(100, m.usedPct));
    var plan = Math.max(0, Math.min(100 - used, m.plannedPct));
    return U.el('div', { style: 'display:flex;height:12px;border-radius:6px;overflow:hidden;background:#fee2e2;border:1px solid var(--border);' }, [
      U.el('div', { style: 'width:' + used + '%;background:#16a34a;', title: 'נוצל' }),
      U.el('div', { style: 'width:' + plan + '%;background:#2563eb;', title: 'מתוכנן' })
    ]);
  }

  function moneyCard(rec) {
    var m = Store.kkMoney(rec);
    function box(label, val, color) {
      return U.el('div', { style: 'flex:1;min-width:110px;' }, [
        U.el('div', { class: 'muted', style: 'font-size:12px;', text: label }),
        U.el('div', { style: 'font-size:18px;font-weight:700;' + (color ? 'color:' + color + ';' : ''), text: ils(val) })
      ]);
    }
    return U.el('div', null, [
      U.el('div', { style: 'display:flex;gap:12px;flex-wrap:wrap;margin-bottom:8px;' }, [
        box('אושר', m.approved),
        box('נוצל', m.used, '#16a34a'),
        box('מתוכנן', m.planned, '#2563eb'),
        box('נותר ללא תכנון', m.unplanned, m.unplanned > 0 ? '#b91c1c' : '#6b7884')
      ]),
      moneyBar(m),
      // כמו באקסל: סה"כ מחויב (נוצל + מתוכנן) מול התקציב, והמאזן ביניהם
      U.el('div', { style: 'display:flex;gap:14px;flex-wrap:wrap;margin-top:8px;font-size:13px;' }, [
        U.el('span', null, [U.el('span', { class: 'muted', text: 'סה"כ מחויב: ' }),
          U.el('strong', { text: ils(m.used + m.planned) })]),
        U.el('span', null, [U.el('span', { class: 'muted', text: 'מאזן: ' }),
          U.el('strong', { style: 'color:' + (m.unplanned < 0 ? '#b91c1c' : '#16a34a') + ';', text: ils(m.unplanned) })])
      ]),
      m.funder || m.self
        ? U.el('div', { class: 'muted', style: 'font-size:12px;margin-top:6px;',
            text: 'מתוכם: ' + ils(m.funder) + ' מהגורם המממן · ' + ils(m.self) + ' מצ׳ינג של הישיבה' })
        : null,
      m.over ? U.el('div', { style: 'font-size:12px;color:#b91c1c;font-weight:600;margin-top:4px;', text: 'נוצל + מתוכנן חורגים מהסכום שאושר' }) : null
    ].filter(Boolean));
  }

  // ---------- חשבוניות מאושרות (מאפליקציית התקציב) ----------
  function invoicesTable(rec) {
    var list = Store.kkInvoicesFor(rec);
    if (!list.length) return U.el('div', { class: 'muted', style: 'padding:6px 2px;font-size:13px;' }, 'אין עדיין חשבוניות מאושרות לקול קורא זה');
    return U.el('div', { class: 'tbl-scroll' }, [U.el('table', { class: 'grid' }, [
      U.el('thead', null, U.el('tr', null, ['תאריך', 'ספק', 'תיאור', 'חשבונית', 'סכום'].map(function (h) { return U.el('th', { text: h }); }))),
      U.el('tbody', null, list.map(function (inv) {
        return U.el('tr', null, [
          U.el('td', { text: inv.date ? U.gregLabel(inv.date) + '/' + inv.date.slice(2, 4) : '' }),
          U.el('td', { text: inv.supplier }),
          U.el('td', { text: inv.description }),
          U.el('td', { text: inv.invoiceNo }),
          U.el('td', { text: ils(inv.amount) })
        ]);
      }))
    ])]);
  }

  // ---------- חשבוניות מתוכננות (הזנה ידנית) ----------
  function plannedTable(rec) {
    function saveRec() { Store.upsertKk(rec); App.render(); }
    var rows = (rec.planned || []).map(function (p) {
      function inp(field, attrs) {
        var el = U.el('input', Object.assign({ class: 'transp', value: p[field] || '' }, attrs || {}));
        el.addEventListener('change', function () {
          p[field] = field === 'amount' ? U.num(el.value) : el.value.trim();
          saveRec();
        });
        return el;
      }
      var stSel = U.el('select', { class: 'transp', style: 'max-width:110px;' },
        PLAN_STATUS.map(function (x) { return U.el('option', { value: x, text: x }); }));
      stSel.value = p.status || 'תכנון';
      stSel.addEventListener('change', function () { p.status = stSel.value; saveRec(); });
      return U.el('tr', null, [
        U.el('td', null, inp('desc', { placeholder: 'מה מתכננים' })),
        U.el('td', null, inp('supplier', { placeholder: 'מבצע' })),
        U.el('td', null, inp('amount', { type: 'number', min: '0', step: '1', style: 'max-width:110px;' })),
        U.el('td', null, stSel),
        U.el('td', null, inp('date', { type: 'date' })),
        U.el('td', null, inp('note', { placeholder: 'צורך / הערה' })),
        U.el('td', null, U.el('button', { class: 'btn secondary small', html: U.ICO.trash, title: 'מחיקה', onclick: function () {
          rec.planned = rec.planned.filter(function (x) { return x.id !== p.id; });
          saveRec();
        } }))
      ]);
    });
    var addDesc = U.el('input', { placeholder: '+ הוצאה מתוכננת — תיאור ואנטר' });
    addDesc.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || !addDesc.value.trim()) return;
      rec.planned.push({ id: 'pl' + Date.now().toString(36), desc: addDesc.value.trim(), supplier: '', amount: 0, status: 'תכנון', date: '', note: '' });
      addDesc.value = '';
      saveRec();
    });
    return U.el('div', null, [
      U.el('div', { class: 'tbl-scroll' }, [U.el('table', { class: 'grid' }, [
        U.el('thead', null, U.el('tr', null, ['מה מתכננים', 'מבצע', 'עלות', 'סטטוס', 'מתי', 'צורך / הערה', ''].map(function (h) { return U.el('th', { text: h }); }))),
        U.el('tbody', null, rows.length ? rows : [U.el('tr', null, U.el('td', { colspan: '7', class: 'muted', text: 'עוד לא תוכננה הוצאה — כאן מתכננים קדימה' }))])
      ])]),
      U.el('div', { style: 'margin-top:8px;' }, [addDesc])
    ]);
  }

  // שורת כסף מצומצמת לשלב הדיווח — המספרים שצריך כדי לדווח, בלי דף הניהול המלא
  function moneyStrip(rec) {
    var m = Store.kkMoney(rec);
    function cell(lbl, val, style) {
      return U.el('div', { class: 'kk-strip-c' }, [
        U.el('div', { class: 'kk-strip-v', style: style || '', text: ils(val) }),
        U.el('div', { class: 'kk-strip-l', text: lbl })
      ]);
    }
    var open = false;
    var full = U.el('div', { style: 'display:none;margin-top:12px;' });
    var toggle = U.el('button', { class: 'btn secondary small', text: 'פירוט החשבוניות' });
    toggle.addEventListener('click', function () {
      open = !open;
      if (open && !full.childElementCount) full.appendChild(invoicesTable(rec));
      full.style.display = open ? '' : 'none';
      toggle.textContent = open ? 'סגירת הפירוט' : 'פירוט החשבוניות';
    });
    return U.el('div', { class: 'card m-card', style: 'margin-bottom:12px;' }, [
      U.el('div', { class: 'kk-strip' }, [
        cell('אושר', m.approved),
        cell('נוצל', m.used),
        cell('יתרה', m.approved - m.used, (m.approved - m.used) < 0 ? 'color:#b91c1c;' : ''),
        U.el('span', { class: 'spacer' }),
        toggle
      ]),
      full
    ]);
  }

  // ---------- המסלול: פס השלבים בראש הכרטיס ----------
  function stepper(rec) {
    var cur = stageOf(rec), idx = stageIdx(cur);
    if (!cur) {
      return U.el('div', { class: 'card m-card', style: 'margin-bottom:12px;' },
        U.el('div', { class: 'muted', text: 'הקול הקורא סומן "לא אושר / לא רלוונטי" — אין לו מסלול פעיל.' }));
    }
    return U.el('div', { class: 'kk-steps' }, STAGES.map(function (st, i) {
      var c = stepCount(rec, st.key);
      var cls = 'kk-step' + (i === idx ? ' cur' : (i < idx ? ' done' : ''));
      return U.el('div', { class: cls }, [
        U.el('span', { class: 'kk-step-n', text: i < idx ? '✓' : String(i + 1) }),
        U.el('div', { class: 'kk-step-txt' }, [
          U.el('div', { class: 'kk-step-lbl', text: st.label }),
          U.el('div', { class: 'kk-step-sub',
            text: st.key === 'spend' ? 'ניהול הכסף'
                : (c.total ? c.done + ' מתוך ' + c.total + ' משימות' : 'אין עדיין משימות') })
        ])
      ]);
    }));
  }

  // ---------- צ'ק-ליסט של שלב ----------
  function stepRow(rec, stage, t) {
    var openHelp = false;
    var row;
    function save() { saveKk(rec); }

    var cb = U.el('input', { type: 'checkbox' });
    cb.checked = !!t.done;
    cb.addEventListener('change', function () {
      t.done = cb.checked;
      t.doneAt = cb.checked ? U.todayISO() : '';
      save(); App.render();
    });

    var title = U.el('input', { class: 'transp kk-task-title', value: t.title || '', placeholder: 'תיאור המשימה' });
    title.addEventListener('change', function () { t.title = title.value.trim(); save(); });

    var help = U.el('div', { class: 'kk-task-help', style: 'display:none;' });
    function fillHelp() {
      help.innerHTML = '';
      var ta = U.el('textarea', { rows: 3, placeholder: 'מה צריך לעשות, איפה מורידים את הטופס, מי חותם…',
        style: 'width:100%;font-size:13px;' });
      ta.value = t.help || '';
      ta.addEventListener('change', function () { t.help = ta.value.trim(); save(); });
      var form = U.el('input', { value: t.form || '', placeholder: 'טופס/מסמך נדרש (לא חובה)', style: 'width:100%;' });
      form.addEventListener('change', function () { t.form = form.value.trim(); save(); refreshChips(); });
      var link = U.el('input', { value: t.link || '', placeholder: 'https://…  קישור לטופס או לעמוד הקול הקורא',
        style: 'width:100%;direction:ltr;text-align:left;' });
      link.addEventListener('change', function () { t.link = link.value.trim(); save(); refreshChips(); });

      // קובץ מצורף — הטופס הריק/ההנחיות, כדי שלא לחפש אותו מחדש בכל שנה
      var fInp = U.el('input', { type: 'file', style: 'display:none;' });
      fInp.addEventListener('change', function () {
        var f = fInp.files && fInp.files[0]; if (!f) return;
        U.toast('מעלה…');
        Store.uploadTaskFile(f).then(function (up) {
          t.file = { path: up.path, name: up.name }; save(); U.toast('הקובץ צורף'); refreshChips(); fileRowBtn.textContent = 'החלפת הקובץ';
        }).catch(function (e) { U.toast('ההעלאה נכשלה: ' + (e && e.message ? e.message : ''), 'error'); });
      });
      var fileRowBtn = U.el('button', { class: 'btn secondary small', text: t.file ? 'החלפת הקובץ' : '📎 צירוף טופס',
        onclick: function () { fInp.click(); } });
      var fileRow = U.el('div', { style: 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;' }, [
        fileRowBtn,
        t.file ? U.el('button', { class: 'btn secondary small', text: 'הסרה', onclick: function () {
          var old = t.file && t.file.path;
          t.file = null; save();
          if (old) Store.deleteTaskFile(old).catch(function () {});
          refreshChips(); fileRowBtn.textContent = '📎 צירוף טופס';
        } }) : null,
        fInp
      ].filter(Boolean));

      help.appendChild(U.el('div', { class: 'field' }, [U.el('label', { text: 'עזרה' }), ta]));
      help.appendChild(U.el('div', { class: 'row' }, [
        U.el('div', { class: 'field' }, [U.el('label', { text: 'טופס נדרש' }), form]),
        U.el('div', { class: 'field' }, [U.el('label', { text: 'קישור' }), link])
      ]));
      help.appendChild(U.el('div', { class: 'field' }, [U.el('label', { text: 'קובץ מצורף' }), fileRow]));
    }
    // צ'יפים לפתיחה מהירה — בלי להיכנס לעריכה
    function formChip() {
      return t.form ? U.el('span', { class: 'tag kk-chip-s', title: 'טופס נדרש', text: t.form }) : null;
    }
    function linkChip() {
      if (!t.link) return null;
      return U.el('a', { class: 'tag kk-chip', href: t.link, target: '_blank', rel: 'noopener',
        title: t.link, text: '🔗 קישור' });
    }
    function fileChip() {
      if (!t.file || !t.file.path) return null;
      var a = U.el('button', { class: 'tag kk-chip', title: t.file.name || 'קובץ', text: '📎 ' + (t.file.name || 'קובץ') });
      a.addEventListener('click', function () {
        Store.taskFileUrl(t.file.path).then(function (url) {
          if (url) window.open(url, '_blank'); else U.toast('לא ניתן לפתוח את הקובץ', 'error');
        });
      });
      return a;
    }

    var helpBtn = U.el('button', { class: 'm-iconbtn', title: 'עזרה, קישור וטופס', text: (t.help || t.form || t.link || t.file) ? 'ⓘ' : '＋' });
    helpBtn.addEventListener('click', function () {
      openHelp = !openHelp;
      if (openHelp) fillHelp();
      help.style.display = openHelp ? '' : 'none';
      helpBtn.classList.toggle('on', openHelp);
    });

    var del = U.el('button', { class: 'm-iconbtn', title: 'מחיקת המשימה', html: U.ICO.trash });
    del.addEventListener('click', function () {
      var list = stepsOf(rec, stage), i = list.indexOf(t);
      if (i !== -1) list.splice(i, 1);
      save(); App.render();
    });

    var head = U.el('div', { class: 'kk-task-head' }, [
      cb, title, formChip(), linkChip(), fileChip(),
      U.el('span', { class: 'spacer' }),
      helpBtn, del
    ].filter(Boolean));
    // רענון הצ'יפים במקום — App.render באמצע עריכה סוגר את פאנל העזרה וגונב את הפוקוס
    function refreshChips() {
      Array.prototype.slice.call(head.querySelectorAll('.kk-chip, .kk-chip-s')).forEach(function (n) { n.remove(); });
      var sp = head.querySelector('.spacer');
      [formChip(), linkChip(), fileChip()].filter(Boolean).forEach(function (n) { head.insertBefore(n, sp); });
      helpBtn.textContent = (t.help || t.form || t.link || t.file) ? 'ⓘ' : '＋';
    }

    row = U.el('div', { class: 'kk-task' + (t.done ? ' done' : '') }, [
      head,
      t.help ? U.el('div', { class: 'kk-task-hint', text: t.help }) : null,
      help
    ].filter(Boolean));
    return row;
  }

  function stepsCard(rec, stage, title) {
    var list = stepsOf(rec, stage), c = stepCount(rec, stage);
    var pct = c.total ? Math.round(c.done / c.total * 100) : 0;

    var head = U.el('div', { class: 'kk-steps-head' }, [
      U.el('h3', { style: 'margin:0;', text: title }),
      U.el('span', { class: 'spacer' }),
      c.total ? U.el('span', { class: 'muted', style: 'font-size:13px;', text: c.done + '/' + c.total }) : null,
      c.total ? U.el('span', { class: 'kk-prog' }, U.el('span', { style: 'width:' + pct + '%;' })) : null
    ].filter(Boolean));

    var rows = U.el('div', { class: 'kk-tasks' }, list.map(function (t) { return stepRow(rec, stage, t); }));

    var add = U.el('input', { class: 'm-addinput', placeholder: '＋ הוסף משימה — כתוב ולחץ Enter' });
    add.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var v = add.value.trim(); if (!v) return;
      list.push(newStep(v));
      saveKk(rec); App.render();
    });

    var body = [head, rows, U.el('div', { class: 'm-addrow' }, add)];
    if (!list.length) {
      body.splice(1, 0, U.el('div', { class: 'kk-empty' }, [
        U.el('div', { class: 'muted', text: 'אין עדיין משימות לשלב הזה.' }),
        U.el('div', { class: 'empty-actions' }, [
          U.el('button', { class: 'btn secondary small', text: 'התחל מרשימת ברירת מחדל', onclick: function () {
            (DEFAULT_STEPS[stage] || []).forEach(function (x) { list.push(newStep(x)); });
            saveKk(rec); App.render();
          } })
        ])
      ]));
    }
    return U.el('div', { class: 'card m-card', style: 'margin-bottom:12px;' }, body);
  }

  // ---------- המסמך הרשמי + בניית המשימות ממנו ----------
  function docCard(rec) {
    var has = !!(rec.doc && rec.doc.path);
    var fileInp = U.el('input', { type: 'file', accept: '.pdf,.doc,.docx,.png,.jpg,.jpeg', style: 'display:none;' });
    fileInp.addEventListener('change', function () {
      var f = fileInp.files && fileInp.files[0]; if (!f) return;
      U.toast('מעלה את המסמך…');
      Store.uploadKkDoc(rec, f)
        .then(function () { U.toast('המסמך נשמר'); App.render(); })
        .catch(function (e) { U.toast('ההעלאה נכשלה: ' + (e && e.message ? e.message : ''), 'error'); });
    });

    var actions = [
      U.el('button', { class: has ? 'btn secondary' : 'btn', text: has ? 'החלפת המסמך' : '📎 העלאת המסמך הרשמי',
        onclick: function () { fileInp.click(); } })
    ];
    if (has) {
      actions.unshift(U.el('button', { class: 'btn secondary', text: 'פתיחת המסמך', onclick: function () {
        Store.kkDocUrl(rec).then(function (url) {
          if (url) window.open(url, '_blank');
          else U.toast('לא ניתן לפתוח את המסמך', 'error');
        });
      } }));
      actions.push(U.el('button', { class: 'btn', text: '🤖 בנה משימות מהמסמך',
        onclick: function () { runDocAI(rec); } }));
      actions.push(U.el('button', { class: 'btn secondary small', title: 'הסרת המסמך', html: U.ICO.trash,
        onclick: function () {
          Modal.confirm({ title: 'הסרת המסמך', text: 'להסיר את "' + (rec.doc.name || 'המסמך') + '"?', okLabel: 'הסרה', danger: true },
            function () { Store.removeKkDoc(rec).then(function () { App.render(); }); });
        } }));
    }

    return U.el('div', { class: 'card m-card', style: 'margin-bottom:12px;' }, [
      U.el('div', { style: 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;' }, [
        U.el('div', { style: 'flex:1;min-width:200px;' }, [
          U.el('div', { style: 'font-weight:600;', text: 'המסמך הרשמי של הקול הקורא' }),
          U.el('div', { class: 'muted', style: 'font-size:13px;margin-top:2px;',
            text: has ? (rec.doc.name || 'מסמך') + (rec.aiAt ? ' · המשימות נבנו ממנו ב-' + U.gregLabel(rec.aiAt.slice(0, 10)) : '')
                      : 'המסמך שמפרט מה נדרש להגשה ולדיווח. אחרי ההעלאה אפשר לבקש מה-AI לבנות ממנו את המשימות.' })
        ]),
        U.el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;' }, actions)
      ]),
      fileInp
    ]);
  }

  // חיווי חשיבה — דקה של שקט נראית כמו תקלה
  function openThinking(messages) {
    var spinner = U.el('div', { style: 'width:46px;height:46px;border:4px solid var(--brand-light);border-top-color:var(--brand);border-radius:50%;animation:spin .8s linear infinite;' });
    var line = U.el('div', { style: 'font-size:15px;font-weight:600;color:var(--brand-dark);text-align:center;min-height:20px;', text: messages[0] });
    var sub = U.el('div', { class: 'muted', style: 'font-size:12px;text-align:center;', text: 'זה עשוי לקחת עד כדקה — אפשר להשאיר את החלון פתוח.' });
    var body = U.el('div', { style: 'display:flex;flex-direction:column;align-items:center;gap:14px;padding:22px 8px;' }, [spinner, line, sub]);
    var close = Modal.open('ה-AI קורא את המסמך…', body, []);
    var i = 0;
    var iv = setInterval(function () { if (i < messages.length - 1) { i++; line.textContent = messages[i]; } }, 5500);
    return function () { clearInterval(iv); close(); };
  }

  function runDocAI(rec) {
    // Gemini קורא PDF ותמונות, אבל לא קובצי Word — עדיף להגיד את זה מראש
    // מאשר לתת לו להיכשל עם שגיאה לא מובנת מהשרת.
    var ext = String((rec.doc && rec.doc.name) || (rec.doc && rec.doc.path) || '').split('.').pop().toLowerCase();
    if (ext === 'doc' || ext === 'docx') {
      Modal.confirm({
        title: 'המסמך הוא קובץ Word',
        text: 'הקריאה האוטומטית עובדת על PDF ועל צילומים בלבד.\n' +
              'פתחו את הקובץ ב-Word → "שמירה בשם" → PDF, והעלו את ה-PDF במקומו.',
        okLabel: 'הבנתי'
      }, function () {});
      return;
    }
    var stop = openThinking(['מעלה את המסמך לניתוח…', 'קורא מה נדרש להגשה…', 'בונה את משימות הדיווח…', 'כמעט מוכן…']);
    Store.kkDocToTasks({
      bucket: 'task-files',
      path: rec.doc.path,
      fileName: rec.doc.name || '',
      context: { name: rec.name || '', funder: rec.funder || '', today: U.todayISO() }
    }).then(function (res) {
      stop();
      var sub = (res && res.submit) || [], rep = (res && res.report) || [];
      if (!sub.length && !rep.length) { U.toast('ה-AI לא הצליח לחלץ משימות מהמסמך', 'error'); return; }
      openDraftReview(rec, res);
    }).catch(function (e) {
      stop();
      U.toast('הניתוח נכשל: ' + (e && e.message ? e.message : ''), 'error');
    });
  }

  // טיוטה לאישור — אף פעם לא כותבים ישירות על הרשימות של גיא
  function openDraftReview(rec, res) {
    var picked = {};
    function section(key, label, items) {
      if (!items.length) return null;
      var rows = items.map(function (t, i) {
        var id = key + ':' + i;
        picked[id] = true;
        var cb = U.el('input', { type: 'checkbox' });
        cb.checked = true;
        cb.addEventListener('change', function () { picked[id] = cb.checked; });
        return U.el('div', { class: 'kk-task' }, [
          U.el('div', { class: 'kk-task-head' }, [
            cb,
            U.el('span', { style: 'font-weight:500;', text: t.title || '' }),
            t.form ? U.el('span', { class: 'tag', text: t.form }) : null
          ].filter(Boolean)),
          t.help ? U.el('div', { class: 'kk-task-hint', text: t.help }) : null
        ].filter(Boolean));
      });
      return U.el('div', { style: 'margin-bottom:14px;' }, [
        U.el('div', { style: 'font-weight:600;margin-bottom:6px;', text: label + ' (' + items.length + ')' }),
        U.el('div', { class: 'kk-tasks' }, rows)
      ]);
    }
    var sub = (res.submit || []), rep = (res.report || []);
    var replace = U.el('input', { type: 'checkbox' });
    var body = U.el('div', null, [
      res.summary ? U.el('div', { class: 'muted', style: 'font-size:13px;margin-bottom:10px;', text: res.summary }) : null,
      section('submit', 'משימות להגשה', sub),
      section('report', 'משימות לדיווח', rep),
      U.el('label', { style: 'display:flex;align-items:center;gap:8px;font-size:13px;' },
        [replace, U.el('span', { text: 'להחליף את הרשימות הקיימות (במקום להוסיף אליהן)' })])
    ].filter(Boolean));

    Modal.open('טיוטת משימות מהמסמך', body, [
      { label: 'ביטול', class: 'secondary' },
      { label: 'הוספה לקול הקורא', onClick: function (close) {
        if (replace.checked) { rec.steps.submit = []; rec.steps.report = []; }
        sub.forEach(function (t, i) { if (picked['submit:' + i]) stepsOf(rec, 'submit').push(newStep(t.title, t.help, t.form, t.link)); });
        rep.forEach(function (t, i) { if (picked['report:' + i]) stepsOf(rec, 'report').push(newStep(t.title, t.help, t.form, t.link)); });
        if (res.funder && !rec.funder) rec.funder = res.funder;
        if (res.deadline && !rec.deadline) rec.deadline = res.deadline;
        rec.aiAt = new Date().toISOString();
        saveKk(rec);
        close();
        U.toast('המשימות נוספו');
        App.render();
      } }
    ]);
  }

  // ---------- מסך פירוט של קול קורא בודד ----------
  function detail(view, rec) {
    var st = stDef(rec.status);

    view.appendChild(U.el('div', { class: 'page-head' }, [
      U.el('button', { class: 'btn secondary', text: '→ חזרה למבט על',
        onclick: function () { selectedId = null; App.render(); } }),
      U.el('h2', { text: rec.name || '(ללא שם)', style: 'margin-inline-start:8px;' }),
      U.el('span', { class: 'tag', style: 'background:' + st.color + '22;border-color:' + st.color + ';color:' + st.color + ';', text: st.label }),
      U.el('span', { class: 'spacer' }),
      deadlineChip(rec.deadline, isFunded(rec) ? 'ניצול/דיווח עד' : 'הגשה עד'),
      U.el('button', { class: 'btn', html: U.ICO.edit + ' עריכה', onclick: function () { openModal(rec); } })
    ].filter(Boolean)));

    var meta = [
      rec.funder ? 'גוף מממן: ' + rec.funder : '',
      rec.owner ? 'באחריות: ' + rec.owner : '',
      rec.submittedAt ? 'הוגש: ' + U.gregLabel(rec.submittedAt) + '/' + rec.submittedAt.slice(2, 4) : '',
      rec.approvedAt ? 'אושר: ' + U.gregLabel(rec.approvedAt) + '/' + rec.approvedAt.slice(2, 4) : '',
      rec.year ? 'שנה: ' + rec.year : ''
    ].filter(Boolean).join(' · ');
    if (meta) view.appendChild(U.el('div', { class: 'muted', style: 'margin:-8px 0 12px;font-size:13px;', text: meta }));

    // המסלול — פס השלבים, ומתחתיו רק מה ששייך לשלב הנוכחי
    var stage = stageOf(rec);
    view.appendChild(stepper(rec));

    // המסמך הרשמי זמין בכל שלב — ממנו נבנות המשימות של ההגשה ושל הדיווח
    if (stage) view.appendChild(docCard(rec));

    if (stage === 'submit') {
      view.appendChild(stepsCard(rec, 'submit', 'משימות להגשה'));
    } else if (stage === 'spend') {
      // שלב המימוש = דף ניהול התקציב של הקול הקורא (החלטת גיא)
      view.appendChild(U.el('div', { class: 'card', style: 'margin-bottom:12px;' }, [moneyCard(rec)]));
      view.appendChild(U.el('div', { class: 'card', style: 'margin-bottom:12px;' }, [
        U.el('h3', { style: 'margin-top:0;', text: 'חשבוניות שאושרו (מאפליקציית התקציב)' }),
        invoicesTable(rec)
      ]));
      view.appendChild(U.el('div', { class: 'card', style: 'margin-bottom:12px;' }, [
        U.el('h3', { style: 'margin-top:0;', text: 'תכנון קדימה' }),
        plannedTable(rec)
      ]));
    } else if (stage === 'report') {
      // "בדיווח" — המשימות הן העיקר, ומעליהן שורת המספרים שצריך כדי לדווח.
      // "דווח ונסגר" — דף הכסף נשאר פתוח לצפייה (בקשת גיא), מתחת למשימות.
      if (rec.status === 'closed') {
        view.appendChild(stepsCard(rec, 'report', 'משימות לדיווח'));
        view.appendChild(U.el('div', { class: 'card', style: 'margin-bottom:12px;' }, [moneyCard(rec)]));
        view.appendChild(U.el('div', { class: 'card', style: 'margin-bottom:12px;' }, [
          U.el('h3', { style: 'margin-top:0;', text: 'חשבוניות שאושרו (מאפליקציית התקציב)' }),
          invoicesTable(rec)
        ]));
      } else {
        view.appendChild(moneyStrip(rec));
        view.appendChild(stepsCard(rec, 'report', 'משימות לדיווח'));
      }
    }

    if (rec.note) view.appendChild(U.el('div', { class: 'card' }, [U.el('div', { class: 'muted', text: rec.note })]));

    view.appendChild(U.el('div', { style: 'margin-top:14px;' }, [
      U.el('button', { class: 'btn secondary small', html: U.ICO.trash + ' מחיקת הקול הקורא', onclick: function () {
        Modal.confirm({ title: 'מחיקה', text: 'למחוק את "' + rec.name + '"?', okLabel: 'מחיקה', danger: true }, function () {
          Store.deleteKk(rec.id); selectedId = null; App.render();
        });
      } })
    ]));
  }

  // קטגוריות "קולות קוראים" שקיימות בתקציב ועדיין לא מנוהלות כאן.
  // הסנכרון אוטומטי בטעינה — הכרטיס הזה הוא רשת ביטחון למקרה שמשהו לא נמשך.
  function missingFromBudget() {
    var linked = {};
    Store.kkAll().forEach(function (r) { if (r.budgetSub) linked[r.budgetSub] = true; });
    return Store.budgetKkSubs().filter(function (c) { return !linked[c.sub]; });
  }
  function syncCard() {
    var missing = missingFromBudget();
    if (!missing.length) return null;
    return U.el('div', { class: 'card', style: 'margin-bottom:12px;border-inline-start:4px solid var(--brand);' }, [
      U.el('div', { style: 'display:flex;align-items:center;gap:10px;flex-wrap:wrap;' }, [
        U.el('div', { style: 'flex:1;min-width:220px;' }, [
          U.el('div', { style: 'font-weight:600;', text: '' + missing.length + ' קולות קוראים קיימים בתקציב ועדיין לא כאן' }),
          U.el('div', { class: 'muted', style: 'font-size:13px;margin-top:2px;',
            text: missing.map(function (c) { return c.sub; }).join(' · ') })
        ]),
        U.el('button', { class: 'btn', text: 'הוספת כולם', onclick: function () {
          var n = Store.syncKkFromBudget();
          U.toast(n + ' קולות קוראים נוספו מהתקציב');
          App.render();
        } })
      ])
    ]);
  }

  // ---------- מבט על — שורה לכל קול קורא ----------
  function overview(view) {
    // מסונן לשנת הכספים המוצגת — אותה שנה שנבחרה בגיליון ניהול התקציב
    var all = Store.kkAll();
    var recs = all.filter(inShownFy);
    // הכול בטבלה אחת; ק"ק שדווח ונסגר או שאינו רלוונטי יורד לתחתית הטבלה ומוצג בעמעום
    function isDone(r) { return r.status === 'closed' || r.status === 'rejected'; }
    var openRecs = recs.filter(function (r) { return !isDone(r); });

    var soon = openRecs.filter(function (r) {
      var n = daysTo(r.deadline);
      return !isFunded(r) && n !== null && n >= 0 && n <= 14;
    });
    var waiting = openRecs.filter(function (r) { return r.status === 'submitted'; });
    var unplanned = 0, totalApproved = 0;
    recs.filter(isFunded).forEach(function (r) {
      var m = Store.kkMoney(r);
      totalApproved += m.approved;
      if (m.unplanned > 0 && r.status !== 'closed') unplanned += m.unplanned;
    });

    function kpi(cls, val, label, color) {
      return U.el('div', { class: 'kpi ' + (cls || 'kpi-neutral') }, [
        U.el('div', { class: 'kpi-ic' }),
        U.el('div', { class: 'kpi-body' }, [
          U.el('div', { class: 'kpi-row' },
            U.el('div', { class: 'kpi-val', style: color ? 'color:' + color + ';' : '', text: String(val) })),
          U.el('div', { class: 'kpi-lbl', text: label })
        ])
      ]);
    }
    view.appendChild(U.el('div', { class: 'kpi-grid' }, [
      kpi(soon.length ? 'kpi-bad' : 'kpi-neutral', soon.length, 'הגשות שנסגרות תוך 14 יום', soon.length ? '#b91c1c' : ''),
      kpi('kpi-info', waiting.length, 'ממתינים לתשובה'),
      kpi(unplanned > 0 ? 'kpi-bad' : 'kpi-good', ils(unplanned), 'כסף מאושר שעוד לא תוכנן', unplanned > 0 ? '#b91c1c' : '#16a34a'),
      kpi('kpi-neutral', ils(totalApproved), 'סה"כ הקצבות השנה')
    ]));

    var sync = syncCard();
    if (sync) view.appendChild(sync);

    if (!recs.length) {
      view.appendChild(U.el('div', { class: 'empty' },
        'הרשימה נמשכת מאפליקציית ניהול התקציב. אם היא ריקה — נסו "רענון מהתקציב".'));
      return;
    }

    function table(list) {
      // מיון לפי דחיפות: קודם כסף שאושר ולא תוכנן, אחריו הגשות שהדדליין מתקרב, ואז לפי שם
      list = list.slice().sort(function (a, b) {
        if (isDone(a) !== isDone(b)) return isDone(a) ? 1 : -1;   // הסגורים תמיד בסוף
        var ma = Store.kkMoney(a), mb = Store.kkMoney(b);
        var ua = isFunded(a) ? Math.max(0, ma.unplanned) : 0;
        var ub = isFunded(b) ? Math.max(0, mb.unplanned) : 0;
        if (ua !== ub) return ub - ua;
        var da = (!isFunded(a) && daysTo(a.deadline) !== null && daysTo(a.deadline) >= 0) ? daysTo(a.deadline) : 9999;
        var db = (!isFunded(b) && daysTo(b.deadline) !== null && daysTo(b.deadline) >= 0) ? daysTo(b.deadline) : 9999;
        if (da !== db) return da - db;
        return String(a.name || '').localeCompare(String(b.name || ''), 'he');
      });
      var tot = { approved: 0, used: 0, planned: 0, balance: 0 };
      var body = list.map(function (r) {
        var m = Store.kkMoney(r), st = stDef(r.status);
        tot.approved += m.approved; tot.used += m.used; tot.planned += m.planned;
        // ק"ק שנסגר או שאינו רלוונטי — אין לו "נותר לתכנון", ולכן גם לא נספר בסיכום
        if (!isDone(r)) tot.balance += m.unplanned;
        var dl = daysTo(r.deadline);
        var dlStyle = '';
        if (!isFunded(r) && dl !== null && dl >= 0 && dl <= 14) dlStyle = 'color:#b91c1c;font-weight:600;';
        var tr = U.el('tr', { style: 'cursor:pointer;' + (isDone(r) ? 'opacity:.62;' : '') }, [
          U.el('td', { style: 'min-width:170px;' }, [
            cellText(r, 'name', 'שם הקול הקורא', 'font-weight:600;width:100%;'),
            cellText(r, 'funder', 'גוף מממן…', 'width:100%;font-size:12px;color:var(--muted);')
          ]),
          U.el('td', null, cellStatus(r)),
          U.el('td', null, cellMoney(r, 'amountFunder', true)),
          U.el('td', { style: m.used ? (m.approved && m.used > m.approved ? 'color:#b91c1c;font-weight:600;' : 'color:#16a34a;') : '',
                       text: m.used ? ils(m.used) : '—' }),
          U.el('td', { style: m.planned ? 'color:#2563eb;' : '', text: m.planned ? ils(m.planned) : '—' }),
          U.el('td', { style: (isFunded(r) && !isDone(r)) ? (m.unplanned !== 0 ? 'color:#b91c1c;font-weight:600;' : 'color:#16a34a;') : '',
                       title: m.unplanned < 0 ? 'חריגה — נוצל ומתוכנן עולים על ההקצבה' : '',
                       text: (isFunded(r) && !isDone(r)) ? (m.unplanned < 0 ? '⚠️ ' + ils(m.unplanned) : ils(m.unplanned)) : '—' }),
          U.el('td', { style: dlStyle }, cellDate(r, 'deadline')),
          U.el('td', null, cellText(r, 'owner', 'אחראי', 'max-width:110px;'))
        ]);
        tr.addEventListener('click', function () { selectedId = r.id; App.render(); });
        return tr;
      });
      // שורת סיכום — כמו "סה"כ כסף" בסוף האקסל
      body.push(U.el('tr', { style: 'background:var(--brand-light);font-weight:700;' }, [
        U.el('td', { text: 'סה"כ' }), U.el('td'),
        U.el('td', { text: ils(tot.approved) }),
        U.el('td', { text: ils(tot.used) }),
        U.el('td', { text: ils(tot.planned) }),
        U.el('td', { style: tot.balance !== 0 ? 'color:#b91c1c;' : '', text: ils(tot.balance) }),
        U.el('td'), U.el('td')
      ]));
      return U.el('div', { class: 'tbl-scroll' }, [U.el('table', { class: 'grid' }, [
        U.el('thead', null, U.el('tr', null,
          ['שם הקול הקורא', 'סטטוס', 'הקצבה', 'נוצל', 'מתוכנן', 'נותר ללא תכנון', 'תאריך יעד', 'באחריות']
            .map(function (h) { return U.el('th', { text: h }); }))),
        U.el('tbody', null, body)
      ])]);
    }

    view.appendChild(table(recs));
    view.appendChild(U.el('div', { class: 'muted', style: 'font-size:12px;margin-top:6px;',
      text: 'אפשר לערוך שם, סטטוס, הקצבה, תאריך יעד ואחראי ישירות בטבלה · לחיצה על שאר השורה פותחת את הפירוט המלא · ' +
            'קולות קוראים שדווחו ונסגרו מופיעים בתחתית הטבלה' }));
  }

  // ---------- תור אישור החשבוניות ----------
  function inbox(view) {
    var pending = Store.kkPendingInvoices();
    var recs = Store.kkAll();

    view.appendChild(U.el('div', { class: 'card', style: 'margin-bottom:12px;' }, [
      U.el('div', { class: 'muted', style: 'font-size:13px;' },
        'כל חשבונית שמוזנת באפליקציית ניהול התקציב תחת "קולות קוראים" מגיעה לכאן לאישור שלך. ' +
        'רק אחרי אישור היא נספרת ב"נוצל" של הקול הקורא — כך שטעות בסיווג לא נכנסת לדוח.')
    ]));

    if (!pending.length) {
      view.appendChild(U.el('div', { class: 'empty' }, 'אין חשבוניות שממתינות לאישור'));
      return;
    }

    pending.forEach(function (inv) {
      // ניחוש ראשוני: הקול הקורא שמקושר לאותה תת-קטגוריה
      var guess = recs.filter(function (r) { return r.budgetSub && r.budgetSub === inv.sub; })[0];
      var sel = U.el('select', null, [U.el('option', { value: '', text: '— בחרו קול קורא —' })].concat(
        recs.map(function (r) { return U.el('option', { value: r.id, text: r.name }); })));
      if (guess) sel.value = guess.id;

      var row = U.el('div', { class: 'card', style: 'margin-bottom:8px;' }, [
        U.el('div', { style: 'display:flex;gap:10px;align-items:center;flex-wrap:wrap;' }, [
          U.el('span', { style: 'font-size:20px;', text: inv.kind === 'reimburse' ? '👤' : '🧾' }),
          U.el('div', { style: 'flex:1;min-width:200px;' }, [
            U.el('div', null, [
              U.el('strong', { text: inv.supplier || '(ללא ספק)' }),
              U.el('span', { style: 'margin-inline-start:8px;font-weight:700;', text: ils(inv.amount) })
            ]),
            U.el('div', { class: 'muted', style: 'font-size:13px;', text: [
              inv.date ? U.gregLabel(inv.date) + '/' + inv.date.slice(2, 4) : '',
              inv.invoiceNo ? 'חשבונית ' + inv.invoiceNo : '',
              inv.description
            ].filter(Boolean).join(' · ') }),
            U.el('div', { class: 'muted', style: 'font-size:12px;', text: 'סווג בתקציב כ: ' + (inv.sub || '—') })
          ]),
          sel,
          U.el('button', { class: 'btn', text: 'אישור', onclick: function () {
            if (!sel.value) { U.toast('בחרו לאיזה קול קורא לשייך', 'error'); return; }
            Store.setKkInvoiceDecision(inv.id, { status: 'approved', kkId: sel.value });
            U.toast('החשבונית אושרה ונכנסה לניצול');
            App.render();
          } }),
          U.el('button', { class: 'btn secondary', text: 'דחייה', onclick: function () {
            Store.setKkInvoiceDecision(inv.id, { status: 'rejected', kkId: '' });
            U.toast('החשבונית נדחתה ולא תיספר');
            App.render();
          } })
        ])
      ]);
      view.appendChild(row);
    });
  }

  // ---------- רשימת הקולות הקוראים ----------
  // ---------- רינדור ראשי ----------
  function render(view) {
    migrateDates();
    if (selectedId) {
      var rec = Store.kkById(selectedId);
      if (rec && !rec.deleted) { detail(view, rec); return; }
      selectedId = null;
    }
    var pendingCount = Store.kkPendingInvoices().length;

    var ySel = fySelect();
    view.appendChild(U.el('div', { class: 'page-head' }, [
      U.el('h2', { text: 'קולות קוראים' }),
      ySel || null,
      U.el('span', { class: 'spacer' }),
      U.el('button', { class: 'btn secondary', html: U.ICO.refresh + ' רענון מהתקציב', onclick: function () {
        Store.budgetLoad(true).then(function () {
          var added = Store.syncKkFromBudget();
          U.toast(added ? ('הנתונים רועננו · ' + added + ' קולות קוראים חדשים נוספו') : 'הנתונים רועננו');
          App.render();
        });
      } }),
      U.el('button', { class: 'btn', html: U.ICO.plus + ' קול קורא חדש',
        title: 'לקול קורא שעדיין לא קיים באפליקציית התקציב',
        onclick: function () { openModal(null); } })
    ]));

    view.appendChild(U.el('div', { class: 'subtabs', style: 'margin-bottom:14px;' }, [
      U.el('button', { class: subTab === 'list' ? 'active' : '', text: 'מבט על',
        onclick: function () { subTab = 'list'; App.render(); } }),
      U.el('button', { class: subTab === 'inbox' ? 'active' : '',
        html: 'אישור חשבוניות' + (pendingCount ? ' <span class="tab-badge">' + pendingCount + '</span>' : ''),
        onclick: function () { subTab = 'inbox'; App.render(); } })
    ]));

    // חיווי כשאין גישה לנתוני התקציב — לא להשאיר מסך שקט
    if (!Store.budgetState()) {
      var e = Store.budgetLoadError();
      view.appendChild(U.el('div', { class: 'card', style: 'margin-bottom:12px;border-inline-start:4px solid #d97706;' }, [
        U.el('div', { style: 'font-weight:600;', text: 'הנתונים מאפליקציית ניהול התקציב לא נטענו' }),
        U.el('div', { class: 'muted', style: 'font-size:13px;margin-top:4px;',
          text: e ? ('הסיבה מהשרת: ' + e) : 'ייתכן שהנתונים עדיין נטענים — נסו "רענון מהתקציב".' })
      ]));
    }

    if (subTab === 'inbox') inbox(view);
    else overview(view);
  }

  global.KkView = { render: render };
})(window);
