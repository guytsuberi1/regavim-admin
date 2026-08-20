/* gefen.js — דיווח גפ"ן. גיליון שממוקד בדיווח: כל שורה = מענה, עם כל השדות
   שהמזכירה צריכה לשיוך חשבונית בכספים 2000, סטטוסים למעקב, תאריך יעד לדיווח,
   ייבוא תכנון מהאקסל של פורטל גפ"ן, ומשיכת חשבוניות מאפליקציית התקציב. */
(function (global) {
  'use strict';
  var U = global.U;

  // סטטוסים — במילים של גיא, עם צבע לכל מצב (ירוק = כסף חזר)
  var INV_STATUS = [
    { key: 'אין', color: '#64748b' },
    { key: 'הוגש', color: '#2563eb' },
    { key: 'שולם', color: '#16a34a' }
  ];
  var SUB_STATUS = [
    { key: '', label: '—', color: '#94a3b8' },
    { key: 'התקבל ע"י המזכירה', label: 'התקבל ע"י המזכירה', color: '#d97706' },
    { key: 'הוגש בכספים 2000', label: 'הוגש בכספים 2000', color: '#2563eb' },
    { key: 'שויך', label: 'שויך', color: '#16a34a' }
  ];
  function stColor(list, key) {
    var d = list.filter(function (x) { return x.key === key; })[0];
    return d ? d.color : list[0].color;
  }

  function ils(n) {
    return new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(Math.round(n || 0)) + ' ₪';
  }

  // ---------- שנת הכספים המוצגת — אותו בורר משותף של גיליון ניהול התקציב ----------
  function fyLabel() { return global.App && App.fyLabel ? App.fyLabel() : ''; }
  function activeLabel() {
    var cur = Store.budgetCurrentFy ? Store.budgetCurrentFy() : {};
    return cur.year ? (cur.year + '/' + String(cur.year + 1).slice(2)) : '';
  }
  function shownYearKey() {
    var y = global.App && App.currentFy ? App.currentFy() : null;
    return y != null ? String(y) : '';
  }
  function inShownFy(rec) {
    var shown = fyLabel();
    var y = String(rec.year || '').trim();
    if (!y) return shown === activeLabel();     // רשומה בלי שנה = השנה הפעילה
    return y === shown;
  }
  function fySelect() {
    var years = Store.budgetFyYears ? Store.budgetFyYears() : [];
    if (!years.length) return null;
    var sel = U.el('select', { title: 'שנת כספים' }, years.map(function (f) {
      return U.el('option', { value: String(f.year), text: 'שנת ' + f.label });
    }));
    var cur = global.App && App.currentFy ? App.currentFy() : null;
    if (cur != null) sel.value = String(cur);
    sel.addEventListener('change', function () { App.setFy(sel.value); });
    return sel;
  }

  // ---------- עריכה ישירה בתאים ----------
  function bare(el) {
    el.style.border = '1px solid transparent';
    el.style.background = 'transparent';
    el.style.padding = '4px 6px';
    el.style.marginInline = '-7px';
    el.addEventListener('focus', function () { el.style.background = 'var(--card)'; el.style.borderColor = 'var(--border)'; });
    el.addEventListener('blur', function () { el.style.background = 'transparent'; el.style.borderColor = 'transparent'; });
    return el;
  }
  function save(r) { Store.upsertGefen(r); }
  function cellText(r, field, ph, width) {
    var i = bare(U.el('input', { value: r[field] || '', placeholder: ph || '', autocomplete: 'off',
      style: 'width:' + (width || 110) + 'px;' }));
    i.addEventListener('change', function () { r[field] = i.value.trim(); save(r); });
    return i;
  }
  function cellMoney(r, field) {
    return bare(U.moneyInput({
      value: r[field] != null && r[field] !== '' ? r[field] : '',
      placeholder: '0', style: 'max-width:88px;text-align:right;font-weight:600;',
      onSave: function (v) { r[field] = v; save(r); refreshTotals(); }
    }));
  }
  function cellStatus(r, field, list) {
    var sel = U.el('select', { class: 'm-status m-status-auto', style: 'font-size:12px;padding:6px 8px;min-width:92px;' },
      list.map(function (x) { return U.el('option', { value: x.key, text: x.label || x.key }); }));
    sel.value = r[field] || list[0].key;
    sel.style.background = stColor(list, sel.value);
    sel.addEventListener('change', function () {
      r[field] = sel.value;
      sel.style.background = stColor(list, sel.value);
      save(r);
      refreshTotals();
    });
    return sel;
  }
  // תאריך יעד לדיווח — אדום כשעבר, כתום כשקרוב. זה מה ששומר שהכסף מגיע בזמן.
  function cellDue(r) {
    var wrap = U.el('div', { style: 'display:flex;align-items:center;gap:6px;' });
    var i = bare(U.el('input', { type: 'date', value: r.due || '', style: 'max-width:120px;' }));
    i.addEventListener('change', function () { r.due = i.value; save(r); App.render(); });
    wrap.appendChild(i);
    if (r.due && r.invStatus !== 'שולם') {
      var d = U.fromISO(r.due); d.setHours(0, 0, 0, 0);
      var t = U.fromISO(U.todayISO()); t.setHours(0, 0, 0, 0);
      var n = Math.round((d - t) / 86400000);
      if (n < 0) wrap.appendChild(U.el('span', { class: 'tl tl-red', text: 'באיחור' }));
      else if (n <= 14) wrap.appendChild(U.el('span', { class: 'tl tl-orange', text: 'עוד ' + n + ' ימים' }));
    }
    return wrap;
  }

  // ---------- סיכומים: תקציב · מתוכנן · בוצע ----------
  // מתוכנן = סכום התקצוב של כל השורות. בוצע = תקצוב השורות ששולמו.
  function totalsOf(recs) {
    var planned = 0, done = 0;
    recs.forEach(function (r) {
      var b = U.num(r.budget, 0);
      planned += b;
      if (r.invStatus === 'שולם') done += b;
    });
    return { planned: planned, done: done };
  }
  var totalsBar = null;
  function refreshTotals() {
    // רענון המונים במקום — בלי App.render שגונב פוקוס באמצע הקלדה
    if (totalsBar && totalsBar.update) totalsBar.update();
  }
  function buildTotals(recs) {
    var year = shownYearKey();
    var bar = U.el('div', { class: 'kpi-grid' });
    function fill() {
      U.clear(bar);
      var t = totalsOf(recs());
      var budget = Store.gefenBudgetFor(year);
      var left = budget - t.planned;
      function kpi(cls, valNode, lbl, sub) {
        return U.el('div', { class: 'kpi ' + cls }, [
          U.el('div', { class: 'kpi-ic' }),
          U.el('div', { class: 'kpi-body' }, [
            U.el('div', { class: 'kpi-row' }, valNode),
            U.el('div', { class: 'kpi-lbl', text: lbl }),
            sub ? U.el('div', { class: 'kpi-sub', text: sub }) : null
          ].filter(Boolean))
        ]);
      }
      // סה"כ התקציב מוזן ידנית — ההקצאה מגיעה מהפורטל, לא מאפליקציית התקציב
      var bIn = U.moneyInput({
        value: budget || '', placeholder: '0',
        style: 'max-width:130px;font-size:22px;font-weight:600;border:0;padding:0;background:transparent;',
        onSave: function (v) { Store.setGefenBudget(year, v); fill(); }
      });
      bar.appendChild(kpi('kpi-info', bIn, 'סה"כ תקציב גפ"ן', 'הזנה ידנית — לפי ההקצאה בפורטל'));
      bar.appendChild(kpi('kpi-neutral', U.el('div', { class: 'kpi-val', text: ils(t.planned) }), 'מתוכנן', 'סכום התקצוב של כל המענים'));
      bar.appendChild(kpi('kpi-good', U.el('div', { class: 'kpi-val', text: ils(t.done) }), 'בוצע (שולם)',
        budget ? Math.round(t.done / budget * 100) + '% מהתקציב' : ''));
      bar.appendChild(kpi(left < 0 ? 'kpi-bad' : 'kpi-neutral',
        U.el('div', { class: 'kpi-val', style: left < 0 ? 'color:#dc2626;' : '', text: ils(left) }),
        'נותר ללא תכנון', left < 0 ? 'התכנון עובר את התקציב' : ''));
    }
    fill();
    bar.update = fill;
    totalsBar = bar;
    return bar;
  }

  // ---------- ייבוא תכנון מהאקסל של פורטל גפ"ן ----------
  // עמודות הייצוא מהפורטל: מסלול רכישה · קוד דווח · סוג מענה · שם מענה ·
  // מספר חשבונית · קוד ושם ספק · סכום פריט · סטטוס חשבונית (חלקן ריקות בתכנון).
  var IMPORT_COLS = {
    track: ['מסלול רכישה'],
    code: ['קוד דווח', 'קוד דיווח'],
    answerType: ['סוג מענה'],
    answerName: ['שם מענה'],
    invoiceNo: ['מספר חשבונית'],
    supplier: ['קוד ושם ספק', 'שם ספק'],
    budget: ['סכום פריט', 'תקצוב', 'סכום']
  };
  // הפורטל מייצא "מאגרי משרד, מאגרי משרד, מאגרי משרד" — אותו ערך משוכפל בפסיקים.
  // משאירים כל ערך פעם אחת, כמו באקסל שגיא ניהל ידנית.
  function dedupeCsv(v) {
    var seen = {}, out = [];
    String(v || '').split(',').forEach(function (x) {
      x = x.trim();
      if (x && !seen[x]) { seen[x] = 1; out.push(x); }
    });
    return out.join(', ');
  }
  function importFromPortal(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var wb;
      try { wb = XLSX.read(new Uint8Array(reader.result), { type: 'array' }); }
      catch (e) { U.toast('לא ניתן לקרוא את הקובץ: ' + e.message, 'error'); return; }
      // הגיליון עם הכי הרבה תוכן — הפורטל מייצא גיליון אחד, אבל ליתר ביטחון
      var rows = [], best = -1;
      wb.SheetNames.forEach(function (sn) {
        var r = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '' });
        var cells = 0;
        r.forEach(function (x) { x.forEach(function (v) { if (String(v).trim() !== '') cells++; }); });
        if (cells > best) { best = cells; rows = r; }
      });
      if (!rows.length) { U.toast('הקובץ ריק', 'error'); return; }

      // איתור שורת הכותרת ומיפוי עמודות לפי השם
      var head = -1, col = {};
      for (var i = 0; i < Math.min(rows.length, 10) && head === -1; i++) {
        var map = {};
        rows[i].forEach(function (v, ci) {
          var t = String(v).trim();
          Object.keys(IMPORT_COLS).forEach(function (f) {
            if (map[f] == null && IMPORT_COLS[f].indexOf(t) !== -1) map[f] = ci;
          });
        });
        if (map.answerName != null) { head = i; col = map; }
      }
      if (head === -1) { U.toast('לא נמצאה עמודת "שם מענה" — זה לא קובץ ייצוא מפורטל גפ"ן?', 'error'); return; }

      var year = shownYearKey(), yearLabel = fyLabel();
      var existing = {};
      Store.gefenAll().filter(inShownFy).forEach(function (r) {
        existing[String(r.answerName || '').trim()] = r;
      });
      var added = 0, updated = 0;
      for (var ri = head + 1; ri < rows.length; ri++) {
        var row = rows[ri];
        function val(f) {
          var v = col[f] != null ? String(row[col[f]] == null ? '' : row[col[f]]).trim() : '';
          return f === 'track' ? dedupeCsv(v) : v;
        }
        var name = val('answerName');
        if (!name || name.indexOf('סה"כ') !== -1) continue;
        var rec = existing[name];
        if (rec) {
          // עדכון תכנון: ממלאים רק שדות ריקים — לא דורסים מה שגיא כבר ערך
          var changed = false;
          ['track', 'code', 'answerType', 'supplier', 'invoiceNo'].forEach(function (f) {
            var v = val(f);
            if (v && !rec[f]) { rec[f] = v; changed = true; }
          });
          var b = U.num(val('budget').replace(/[^0-9.-]/g, ''), 0);
          if (b && !U.num(rec.budget, 0)) { rec.budget = b; changed = true; }
          if (changed) { Store.upsertGefen(rec); updated++; }
        } else {
          Store.upsertGefen({
            track: val('track'), code: val('code'), answerType: val('answerType'),
            answerName: name, supplier: val('supplier'), invoiceNo: val('invoiceNo'),
            budget: U.num(val('budget').replace(/[^0-9.-]/g, ''), 0),
            invStatus: 'אין', subStatus: '', due: '', note: '',
            year: year === String((Store.budgetCurrentFy() || {}).year) ? '' : yearLabel
          });
          added++;
        }
      }
      U.toast(added + ' מענים נוספו' + (updated ? ' · ' + updated + ' עודכנו' : ''));
      App.render();
    };
    reader.readAsArrayBuffer(file);
  }

  // ---------- מגש חשבוניות מאפליקציית התקציב ----------
  function invoiceTray(recs) {
    var pending = Store.gefenPendingInvoices();
    if (!pending.length) return null;
    var rows = pending.map(function (inv) {
      var sel = U.el('select', null,
        [U.el('option', { value: '', text: 'בחרו מענה…' })].concat(recs.map(function (r) {
          return U.el('option', { value: r.id, text: (r.answerName || '(ללא שם)') });
        })));
      return U.el('tr', null, [
        U.el('td', { text: inv.date ? U.gregLabel(inv.date) : '—' }),
        U.el('td', { text: inv.supplier || '—' }),
        U.el('td', { text: inv.invoiceNo || '—' }),
        U.el('td', { text: ils(inv.amount) }),
        U.el('td', { text: inv.description || inv.sub || '' }),
        U.el('td', { class: 'actions' }, [
          U.el('button', { class: 'btn small', text: 'שיוך', onclick: function () {
            if (!sel.value) { U.toast('בחרו מענה לשיוך', 'error'); return; }
            var rec = Store.gefenById(sel.value);
            Store.setGefenInvoiceDecision(inv.id, { status: 'approved', rowId: sel.value });
            // שיוך ממלא שדות ריקים בשורה — לא דורס מה שכבר הוזן
            if (rec) {
              if (!rec.invoiceNo && inv.invoiceNo) rec.invoiceNo = inv.invoiceNo;
              if (!rec.supplier && inv.supplier) rec.supplier = inv.supplier;
              if (rec.subStatus === '') rec.subStatus = 'התקבל ע"י המזכירה';
              Store.upsertGefen(rec);
            }
            U.toast('החשבונית שויכה');
            App.render();
          } }),
          U.el('button', { class: 'btn secondary small', text: 'לא גפ"ן', title: 'החשבונית לא שייכת לגפ"ן',
            onclick: function () {
              Store.setGefenInvoiceDecision(inv.id, { status: 'rejected', rowId: '' });
              App.render();
            } }),
          sel
        ])
      ]);
    });
    return U.el('div', { class: 'card m-card', style: 'margin-bottom:14px;border-inline-start:4px solid var(--brand);' }, [
      U.el('div', { style: 'font-weight:600;margin-bottom:8px;', text: '📥 חשבוניות גפ"ן מאפליקציית התקציב — ממתינות לשיוך (' + pending.length + ')' }),
      U.el('div', { class: 'tbl-scroll' }, U.el('table', { class: 'grid' }, [
        U.el('thead', null, U.el('tr', null, ['תאריך', 'ספק', 'מס\' חשבונית', 'סכום', 'תיאור', ''].map(function (h) { return U.el('th', { text: h }); }))),
        U.el('tbody', null, rows)
      ]))
    ]);
  }

  // ---------- המסך ----------
  function render(view) {
    var all = Store.gefenAll();
    var recs = all.filter(inShownFy);

    var fileInp = U.el('input', { type: 'file', accept: '.xlsx,.xls', style: 'display:none;' });
    fileInp.addEventListener('change', function () {
      var f = fileInp.files && fileInp.files[0];
      if (f) importFromPortal(f);
      fileInp.value = '';
    });

    view.appendChild(U.el('div', { class: 'page-head' }, [
      U.el('h2', { text: 'דיווח גפ"ן' }),
      fySelect(),
      U.el('span', { class: 'spacer' }),
      U.el('button', { class: 'btn secondary', html: U.ICO.upload + ' טעינת תכנון מפורטל גפ"ן',
        title: 'קובץ האקסל שמופק מאתר גפ"ן (דיווח ביצוע)',
        onclick: function () { fileInp.click(); } }),
      fileInp
    ].filter(Boolean)));

    view.appendChild(buildTotals(function () { return Store.gefenAll().filter(inShownFy); }));

    var tray = invoiceTray(recs);
    if (tray) view.appendChild(tray);

    if (!recs.length) {
      view.appendChild(U.el('div', { class: 'card m-card' }, U.el('div', { class: 'empty' }, [
        U.el('div', null, 'אין עדיין מענים לשנת ' + fyLabel() + '.'),
        U.el('div', { class: 'empty-actions' }, [
          U.el('button', { class: 'btn', text: '📥 טעינה מפורטל גפ"ן', onclick: function () { fileInp.click(); } })
        ])
      ])));
    } else {
      var body = recs.map(function (r) {
        return U.el('tr', null, [
          U.el('td', null, cellText(r, 'track', 'מסלול רכישה', 95)),
          U.el('td', null, cellText(r, 'code', 'קוד', 46)),
          U.el('td', null, cellText(r, 'answerType', 'סוג מענה', 120)),
          U.el('td', null, cellText(r, 'answerName', 'שם מענה', 150)),
          U.el('td', null, cellText(r, 'supplier', 'ספק', 95)),
          U.el('td', null, cellText(r, 'invoiceNo', 'מס\' חשבונית', 78)),
          U.el('td', null, cellMoney(r, 'budget')),
          U.el('td', null, cellDue(r)),
          U.el('td', null, cellStatus(r, 'invStatus', INV_STATUS)),
          U.el('td', null, cellStatus(r, 'subStatus', SUB_STATUS)),
          U.el('td', { class: 'actions' }, U.el('span', { class: 'm-actions' },
            U.el('button', { class: 'm-iconbtn', title: 'מחיקה', html: U.ICO.trash, onclick: function () {
              Modal.confirm({ title: 'מחיקה', text: 'למחוק את "' + (r.answerName || 'המענה') + '"?', okLabel: 'מחיקה', danger: true },
                function () { Store.deleteGefen(r.id); App.render(); });
            } })))
        ]);
      });
      view.appendChild(U.el('div', { class: 'tbl-scroll' }, U.el('table', { class: 'grid' }, [
        U.el('thead', null, U.el('tr', null,
          ['מסלול רכישה', 'קוד דיווח', 'סוג מענה', 'שם מענה', 'ספק', 'מס\' חשבונית', 'תקצוב', 'תאריך יעד לדיווח', 'סטטוס חשבונית', 'סטטוס הגשה', '']
            .map(function (h) { return U.el('th', { text: h }); }))),
        U.el('tbody', null, body)
      ])));
    }

    // הוספה מהירה — שם מענה + Enter, כמו בכל הגיליונות
    var add = U.el('input', { class: 'm-addinput', placeholder: '＋ הוסף מענה — כתוב שם ולחץ Enter' });
    add.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var v = add.value.trim(); if (!v) return;
      var year = shownYearKey();
      Store.upsertGefen({
        track: '', code: '', answerType: '', answerName: v, supplier: '', invoiceNo: '',
        budget: 0, invStatus: 'אין', subStatus: '', due: '', note: '',
        year: year === String((Store.budgetCurrentFy() || {}).year) ? '' : fyLabel()
      });
      App.render();
    });
    view.appendChild(U.el('div', { class: 'm-addrow', style: 'margin-top:10px;' }, add));

    view.appendChild(U.el('div', { class: 'muted', style: 'font-size:12px;margin-top:8px;',
      text: 'העמודות מסלול רכישה · קוד דיווח · סוג מענה · שם מענה · ספק · מס\' חשבונית · תקצוב הן מה שהמזכירה ' +
            'צריכה לשיוך בכספים 2000. "בוצע" = מענים שסטטוס החשבונית שלהם "שולם".' }));
  }

  global.GefenView = { render: render };
})(window);
