/* kk.js — קולות קוראים: מעקב מפרסום ועד דיווח שנתי, עם משיכת חשבוניות מאפליקציית התקציב */
(function (global) {
  'use strict';
  var U = global.U;

  // מחזור החיים כפי שגיא תיאר אותו
  var STATUSES = [
    { key: 'published', label: '📢 פורסם', color: '#64748b' },
    { key: 'prep', label: '✍️ בהכנה', color: '#d97706' },
    { key: 'submitted', label: '📤 הוגש', color: '#2563eb' },
    { key: 'approved', label: '✅ התקבל הקצבה', color: '#16a34a' },
    { key: 'spending', label: '💰 מימוש', color: '#0d9488' },
    { key: 'closed', label: '🏁 דווח ונסגר', color: '#475569' },
    { key: 'rejected', label: '❌ לא אושר / לא רלוונטי', color: '#b91c1c' }
  ];
  // התחומים כפי שמופיעים בעמודת "באחריות" באקסל ("בינוי- גיא צוברי")
  var DOMAINS = ['בינוי', 'ביטחון', 'פנימיה', 'בית ספר', 'הכנה לצה"ל', 'הסעות',
                 'הצטיידות', 'חקלאות', 'מטבח', 'בוגרים', 'אחר'];
  // סטטוס שורת תכנון — במילים של האקסל
  var PLAN_STATUS = ['תכנון', 'בביצוע'];
  function stDef(k) { return STATUSES.filter(function (s) { return s.key === k; })[0] || STATUSES[0]; }
  // שלבים שבהם הכסף כבר אושר — רק להם יש משמעות לתמונת הניצול
  function isFunded(rec) { return ['approved', 'spending', 'closed'].indexOf(rec.status) !== -1; }

  var subTab = 'list';      // 'list' | 'inbox'
  var showClosed = false;

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

  // ---------- טופס קול קורא ----------
  function openModal(rec) {
    var isNew = !rec;
    rec = rec ? JSON.parse(JSON.stringify(rec)) : { status: 'published', planned: [], docs: [] };
    var err = U.el('div', { class: 'field-err' });
    function fld(l, n) { return U.el('div', { class: 'field' }, [U.el('label', { text: l }), n]); }

    var name = U.el('input', { value: rec.name || '', placeholder: 'שם הקול הקורא' });
    var funder = U.el('input', { value: rec.funder || '', placeholder: 'משרד החינוך / מפעל הפיס / הרשות…' });
    var domain = U.el('select', null, [U.el('option', { value: '', text: '— ללא תחום —' })].concat(
      DOMAINS.map(function (d) { return U.el('option', { value: d, text: d }); })));
    domain.value = rec.domain || '';
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
    var amountFunder = U.el('input', { type: 'number', min: '0', step: '1', value: rec.amountFunder != null ? rec.amountFunder : '', placeholder: 'חלק הגורם המממן' });
    var amountSelf = U.el('input', { type: 'number', min: '0', step: '1', value: rec.amountSelf != null ? rec.amountSelf : '', placeholder: 'מצ׳ינג — חלק הישיבה' });
    var spendDeadline = U.el('input', { type: 'date', value: rec.spendDeadline || '' });
    var reportDate = U.el('input', { type: 'date', value: rec.reportDate || '' });
    var owner = U.el('input', { value: rec.owner || '', placeholder: 'אחראי' });
    var note = U.el('textarea', { rows: 2, placeholder: 'הערות' }, rec.note || '');

    Modal.open(isNew ? '➕ קול קורא חדש' : '✏️ עריכת קול קורא', U.el('div', null, [
      fld('שם הקול הקורא', name),
      U.el('div', { class: 'row' }, [fld('תחום', domain), fld('אחראי', owner)]),
      fld('גוף מממן', funder),
      U.el('div', { class: 'row' }, [fld('סטטוס', status), fld('שנת כספים', year)]),
      fld('קטגוריה באפליקציית התקציב (מקור החשבוניות)', budgetSub),
      U.el('div', { class: 'row' }, [fld('תאריך פרסום', publishedAt), fld('תאריך הגשה אחרון', deadline)]),
      U.el('div', { class: 'row' }, [fld('הוגש בפועל', submittedAt), fld('תאריך אישור', approvedAt)]),
      U.el('div', { class: 'row' }, [fld('סכום מאושר — הגורם המממן', amountFunder), fld('מצ׳ינג — חלק הישיבה', amountSelf)]),
      U.el('div', { class: 'row' }, [fld('תאריך אחרון לניצול', spendDeadline), fld('תאריך דיווח נדרש', reportDate)]),
      fld('הערות', note),
      err
    ]), [
      { label: 'ביטול', class: 'secondary' },
      { label: 'שמירה', onClick: function (close) {
        if (!name.value.trim()) { err.textContent = 'נדרש שם'; name.focus(); return; }
        rec.name = name.value.trim();
        rec.funder = funder.value.trim();
        rec.domain = domain.value;
        rec.status = status.value;
        rec.year = year.value.trim();
        rec.budgetSub = budgetSub.value;
        rec.publishedAt = publishedAt.value;
        rec.deadline = deadline.value;
        rec.submittedAt = submittedAt.value;
        rec.approvedAt = approvedAt.value;
        rec.amountFunder = amountFunder.value.trim() === '' ? '' : U.num(amountFunder.value);
        rec.amountSelf = amountSelf.value.trim() === '' ? '' : U.num(amountSelf.value);
        rec.spendDeadline = spendDeadline.value;
        rec.reportDate = reportDate.value;
        rec.owner = owner.value.trim();
        rec.note = note.value.trim();
        Store.upsertKk(rec);
        close();
        App.render();
      } }
    ]);
  }

  function fyLabel() {
    var fy = Store.budgetFiscalYear();
    if (fy && fy.start) return fy.start.slice(0, 4) + '/' + String(parseInt(fy.start.slice(0, 4), 10) + 1).slice(2);
    var t = U.todayISO(), y = parseInt(t.slice(0, 4), 10);
    if (parseInt(t.slice(5, 7), 10) < 9) y--;   // שנת הישיבה: 1/9 עד 31/8
    return y + '/' + String(y + 1).slice(2);
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
      m.over ? U.el('div', { style: 'font-size:12px;color:#b91c1c;font-weight:600;margin-top:4px;', text: '⚠️ נוצל + מתוכנן חורגים מהסכום שאושר' }) : null
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
        U.el('td', null, U.el('button', { class: 'btn secondary small', text: '🗑', title: 'מחיקה', onclick: function () {
          rec.planned = rec.planned.filter(function (x) { return x.id !== p.id; });
          saveRec();
        } }))
      ]);
    });
    var addDesc = U.el('input', { placeholder: '➕ הוצאה מתוכננת — תיאור ואנטר' });
    addDesc.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || !addDesc.value.trim()) return;
      rec.planned.push({ id: 'pl' + Date.now().toString(36), desc: addDesc.value.trim(), supplier: '', amount: 0, status: 'תכנון', date: '' });
      addDesc.value = '';
      saveRec();
    });
    return U.el('div', null, [
      U.el('div', { class: 'tbl-scroll' }, [U.el('table', { class: 'grid' }, [
        U.el('thead', null, U.el('tr', null, ['מה מתכננים', 'מבצע', 'עלות', 'סטטוס', 'מתי', ''].map(function (h) { return U.el('th', { text: h }); }))),
        U.el('tbody', null, rows.length ? rows : [U.el('tr', null, U.el('td', { colspan: '6', class: 'muted', text: 'עוד לא תוכננה הוצאה — כאן מתכננים קדימה' }))])
      ])]),
      U.el('div', { style: 'margin-top:8px;' }, [addDesc])
    ]);
  }

  // ---------- כרטיס קול קורא ----------
  function collapsedKey() { return 'admin_kk_collapsed'; }
  function collapsedMap() {
    try { return JSON.parse(localStorage.getItem(collapsedKey()) || '{}'); } catch (e) { return {}; }
  }
  function setCollapsed(id, val) {
    var m = collapsedMap(); m[id] = val;
    try { localStorage.setItem(collapsedKey(), JSON.stringify(m)); } catch (e) {}
  }

  function card(rec) {
    var st = stDef(rec.status);
    var collapsed = collapsedMap()[rec.id] !== false;   // ברירת מחדל: מכווץ
    var head = U.el('div', { style: 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;cursor:pointer;' }, [
      U.el('span', { style: 'font-size:16px;', text: collapsed ? '▶' : '▼' }),
      U.el('strong', { style: 'font-size:16px;', text: rec.name || '(ללא שם)' }),
      U.el('span', { class: 'tag', style: 'background:' + st.color + '22;border-color:' + st.color + ';color:' + st.color + ';', text: st.label }),
      rec.domain ? U.el('span', { class: 'tag', style: 'font-size:12px;', text: rec.domain }) : null,
      rec.owner ? U.el('span', { class: 'muted', style: 'font-size:13px;', text: rec.owner }) : null,
      U.el('span', { class: 'spacer' }),
      // צ'יפ התאריך הרלוונטי לשלב: לפני הגשה — הדדליין; אחרי אישור — הניצול
      isFunded(rec) ? deadlineChip(rec.spendDeadline, 'ניצול עד') : deadlineChip(rec.deadline, 'הגשה עד')
    ].filter(Boolean));
    head.addEventListener('click', function () { setCollapsed(rec.id, !collapsed); App.render(); });

    var body = null;
    if (!collapsed) {
      body = U.el('div', { style: 'margin-top:12px;' }, [
        isFunded(rec) ? moneyCard(rec) : U.el('div', { class: 'muted', style: 'font-size:13px;' },
          'תמונת הכסף תוצג אחרי שהקול הקורא יסומן כ"אושר" ויוזן סכום ההקצבה.'),
        isFunded(rec) ? U.el('h4', { style: 'margin:16px 0 6px;', text: '🧾 חשבוניות שאושרו (מאפליקציית התקציב)' }) : null,
        isFunded(rec) ? invoicesTable(rec) : null,
        isFunded(rec) ? U.el('h4', { style: 'margin:16px 0 6px;', text: '📅 תכנון קדימה' }) : null,
        isFunded(rec) ? plannedTable(rec) : null,
        U.el('div', { style: 'display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;' }, [
          U.el('button', { class: 'btn secondary small', text: '✏️ עריכה', onclick: function () { openModal(rec); } }),
          U.el('button', { class: 'btn secondary small', text: '🗑 מחיקה', onclick: function () {
            Modal.confirm({ title: 'מחיקה', text: 'למחוק את "' + rec.name + '"?', okLabel: 'מחיקה', danger: true }, function () {
              Store.deleteKk(rec.id); App.render();
            });
          } })
        ]),
        rec.note ? U.el('div', { class: 'muted', style: 'font-size:13px;margin-top:8px;', text: rec.note }) : null
      ].filter(Boolean));
    }
    return U.el('div', { class: 'card', style: 'margin-bottom:10px;border-top:4px solid ' + st.color + ';' },
      [head].concat(body ? [body] : []));
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
          U.el('button', { class: 'btn', text: '✅ אישור', onclick: function () {
            if (!sel.value) { U.toast('בחרו לאיזה קול קורא לשייך', 'error'); return; }
            Store.setKkInvoiceDecision(inv.id, { status: 'approved', kkId: sel.value });
            U.toast('החשבונית אושרה ונכנסה לניצול');
            App.render();
          } }),
          U.el('button', { class: 'btn secondary', text: '✕ דחייה', onclick: function () {
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
  function list(view) {
    var recs = Store.kkAll();
    var open = recs.filter(function (r) { return r.status !== 'closed' && r.status !== 'rejected'; });
    var done = recs.filter(function (r) { return r.status === 'closed' || r.status === 'rejected'; });

    // שורת "מה דחוף עכשיו"
    var soon = open.filter(function (r) {
      var n = daysTo(r.deadline);
      return !isFunded(r) && n !== null && n >= 0 && n <= 14;
    });
    var waiting = open.filter(function (r) { return r.status === 'submitted'; });
    var unplanned = 0, totalApproved = 0;
    recs.filter(isFunded).forEach(function (r) {
      var m = Store.kkMoney(r);
      totalApproved += m.approved;
      if (m.unplanned > 0 && r.status !== 'closed') unplanned += m.unplanned;
    });

    function kpi(icon, val, label, color) {
      return U.el('div', { class: 'kpi' }, [
        U.el('div', { class: 'kpi-ic', text: icon }),
        U.el('div', null, [
          U.el('div', { class: 'kpi-val', style: color ? 'color:' + color + ';' : '', text: String(val) }),
          U.el('div', { class: 'kpi-lbl', text: label })
        ])
      ]);
    }
    view.appendChild(U.el('div', { class: 'kpi-row' }, [
      kpi('⏰', soon.length, 'הגשות שנסגרות תוך 14 יום', soon.length ? '#b91c1c' : ''),
      kpi('📤', waiting.length, 'ממתינים לתשובה'),
      kpi('💰', ils(unplanned), 'כסף מאושר שעוד לא תוכנן', unplanned > 0 ? '#b91c1c' : '#16a34a'),
      kpi('🏦', ils(totalApproved), 'סה"כ הקצבות השנה')
    ]));

    if (!recs.length) {
      view.appendChild(U.el('div', { class: 'empty' }, 'אין עדיין קולות קוראים — הוסיפו את הראשון בכפתור למעלה'));
      return;
    }
    open.forEach(function (r) { view.appendChild(card(r)); });

    if (done.length) {
      view.appendChild(U.el('button', {
        class: 'btn secondary', style: 'margin-top:10px;',
        text: (showClosed ? '▾ ' : '▸ ') + 'סגורים ונדחים (' + done.length + ')',
        onclick: function () { showClosed = !showClosed; App.render(); }
      }));
      if (showClosed) done.forEach(function (r) { view.appendChild(card(r)); });
    }
  }

  // ---------- רינדור ראשי ----------
  function render(view) {
    var pendingCount = Store.kkPendingInvoices().length;

    view.appendChild(U.el('div', { class: 'page-head' }, [
      U.el('h2', { text: '📣 קולות קוראים' }),
      U.el('span', { class: 'spacer' }),
      U.el('button', { class: 'btn secondary', text: '🔄 רענון מהתקציב', onclick: function () {
        Store.budgetLoad(true).then(function () { U.toast('הנתונים רועננו'); App.render(); });
      } }),
      U.el('button', { class: 'btn', text: '➕ קול קורא חדש', onclick: function () { openModal(null); } })
    ]));

    view.appendChild(U.el('div', { class: 'subtabs', style: 'margin-bottom:14px;' }, [
      U.el('button', { class: subTab === 'list' ? 'active' : '', text: '📣 קולות קוראים',
        onclick: function () { subTab = 'list'; App.render(); } }),
      U.el('button', { class: subTab === 'inbox' ? 'active' : '',
        html: '📥 אישור חשבוניות' + (pendingCount ? ' <span class="tab-badge">' + pendingCount + '</span>' : ''),
        onclick: function () { subTab = 'inbox'; App.render(); } })
    ]));

    // חיווי כשאין גישה לנתוני התקציב — לא להשאיר מסך שקט
    if (!Store.budgetState()) {
      var e = Store.budgetLoadError();
      view.appendChild(U.el('div', { class: 'card', style: 'margin-bottom:12px;border-inline-start:4px solid #d97706;' }, [
        U.el('div', { style: 'font-weight:600;', text: '⚠️ הנתונים מאפליקציית ניהול התקציב לא נטענו' }),
        U.el('div', { class: 'muted', style: 'font-size:13px;margin-top:4px;',
          text: e ? ('הסיבה מהשרת: ' + e) : 'ייתכן שהנתונים עדיין נטענים — נסו "רענון מהתקציב".' })
      ]));
    }

    if (subTab === 'inbox') inbox(view);
    else list(view);
  }

  global.KkView = { render: render };
})(window);
