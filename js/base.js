/* base.js — גיליון "נתוני בסיס": שני מרשמים עצמאיים —
   תלמידים (שם · כיתה · הערות) וספקים (שם · תחום · טלפון · אימייל · ח.פ · הערות).
   הכיתות נגזרות מטבלת התלמידים — כל שם כיתה שמופיע אצל תלמיד הוא כיתה קיימת.
   באחסון נשמר המבנה ההיסטורי settings.classes=[{name,students[]}] כדי שאישורי ההורים ימשיכו לעבוד.
   לכל טבלה ייבוא אקסל וקובץ לדוגמה משלה. */
(function (global) {
  'use strict';
  var U = global.U;

  // ---------- המרה בין המבנה השמור לטבלה שטוחה ----------
  function classes() {
    var s = Store.settings();
    if (!s.classes) s.classes = [];
    return s.classes;
  }
  function flatRows() {
    var out = [];
    classes().forEach(function (c) {
      (c.students || []).forEach(function (st) { out.push({ st: st, cls: c }); });
    });
    out.sort(function (a, b) {
      var ca = String(a.cls.name || ''), cb = String(b.cls.name || '');
      return ca.localeCompare(cb, 'he') || String(a.st.name || '').localeCompare(String(b.st.name || ''), 'he');
    });
    return out;
  }
  function classNames() {
    return classes().map(function (c) { return c.name || ''; }).filter(Boolean);
  }
  function classByName(name) {
    name = String(name || '').trim();
    var found = classes().filter(function (c) { return (c.name || '').trim() === name; })[0];
    if (found) return found;
    var c = { id: Store.uid(), name: name, students: [] };
    classes().push(c);
    return c;
  }
  function dropEmptyClasses() {
    var s = Store.settings();
    s.classes = (s.classes || []).filter(function (c) { return (c.students || []).length; });
  }
  function moveStudent(st, fromCls, toName) {
    toName = String(toName || '').trim();
    if (!toName || toName === (fromCls.name || '').trim()) return;
    fromCls.students = (fromCls.students || []).filter(function (x) { return x !== st; });
    classByName(toName).students.push(st);
    dropEmptyClasses();
    Store.saveClasses();
    App.render();
  }
  function addStudent(name, clsName, note) {
    name = String(name || '').trim();
    if (!name) return null;
    var c = classByName(String(clsName || '').trim() || 'ללא כיתה');
    var st = { id: Store.uid(), name: name, note: String(note || '').trim() };
    c.students.push(st);
    return st;
  }

  // ---------- עריכה ישירה ----------
  function bare(el) {
    el.style.border = '1px solid transparent';
    el.style.background = 'transparent';
    el.style.padding = '4px 6px';
    el.style.marginInline = '-7px';
    el.addEventListener('focus', function () { el.style.background = 'var(--card)'; el.style.borderColor = 'var(--border)'; });
    el.addEventListener('blur', function () { el.style.background = 'transparent'; el.style.borderColor = 'transparent'; });
    return el;
  }

  // ---------- אקסל: תשתית משותפת, מרשם נפרד לכל טבלה ----------
  function saveXlsx(aoa, cols, sheetName, fileName) {
    try {
      var wb = XLSX.utils.book_new();
      var ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = cols.map(function (w) { return { wch: w }; });
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      XLSX.writeFile(wb, fileName);
    } catch (e) { U.toast('יצירת הקובץ נכשלה: ' + e.message, 'error'); }
  }
  // קריאת הגיליון המלא ביותר בקובץ + איתור שורת הכותרת לפי מפת ביטויים
  function readSheet(file, matchers, requiredKey, onRows) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var wb = XLSX.read(new Uint8Array(reader.result), { type: 'array' });
        var rows = [], best = -1;
        wb.SheetNames.forEach(function (sn) {
          var r = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '' });
          var cells = 0;
          r.forEach(function (x) { x.forEach(function (v) { if (String(v).trim() !== '') cells++; }); });
          if (cells > best) { best = cells; rows = r; }
        });
        if (!rows.length) { U.toast('הקובץ ריק', 'error'); return; }

        var head = -1, col = {};
        for (var i = 0; i < Math.min(rows.length, 10) && head === -1; i++) {
          var map = {};
          rows[i].forEach(function (h, ci) {
            h = String(h).trim();
            for (var key in matchers) { if (map[key] == null && matchers[key].test(h)) { map[key] = ci; return; } }
          });
          if (map[requiredKey] != null) { head = i; col = map; }
        }
        if (head === -1) { U.toast('לא נמצאה עמודת החובה בקובץ', 'error'); return; }
        onRows(rows.slice(head + 1), col);
      } catch (e) {
        console.error(e);
        U.toast('שגיאה בקריאת הקובץ: ' + e.message, 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  }
  function pickFile(handler) {
    var inp = U.el('input', { type: 'file', accept: '.xlsx,.xls', style: 'display:none;' });
    inp.addEventListener('change', function () { if (inp.files[0]) handler(inp.files[0]); });
    document.body.appendChild(inp);
    inp.click();
    setTimeout(function () { document.body.removeChild(inp); }, 500);
  }

  // --- תלמידים ---
  function downloadStudentSample() {
    saveXlsx([['שם מלא', 'כיתה', 'הערות'],
      ['ישראל ישראלי', 'ט1', ''],
      ['משה כהן', 'ט1', 'אלרגיה לבוטנים'],
      ['דוד לוי', 'י2', '']],
      [24, 10, 30], 'תלמידים', 'תלמידים-לדוגמה.xlsx');
  }
  function importStudents(file) {
    readSheet(file, { name: /^שם/, cls: /כיתה|שכבה/, note: /הער/ }, 'name', function (rows, col) {
      var have = {};
      flatRows().forEach(function (r) { have[r.st.name + '|' + (r.cls.name || '')] = true; });
      var added = 0, skipped = 0;
      rows.forEach(function (row) {
        var nm = col.name != null ? String(row[col.name] || '').trim() : '';
        if (!nm) return;
        var cl = col.cls != null ? String(row[col.cls] || '').trim() : '';
        if (have[nm + '|' + cl]) { skipped++; return; }
        have[nm + '|' + cl] = true;
        addStudent(nm, cl, col.note != null ? row[col.note] : '');
        added++;
      });
      Store.saveClasses();
      U.toast('יובאו ' + added + ' תלמידים' + (skipped ? ' · ' + skipped + ' דילוגים (כבר קיימים)' : ''));
      App.render();
    });
  }

  // --- ספקים ---
  // המרשם המאוחד יושב בנתוני התקציב — אותו מאגר שהמזכירה בוחרת ממנו.
  function suppliers() { return Store.suppliersAll ? Store.suppliersAll() : []; }
  function supSave(sup, field, val) {
    Store.supplierSave(sup.id, field, val)
      .catch(function (e) { U.toast('השמירה נכשלה: ' + (e && e.message ? e.message : ''), 'error'); });
  }
  function downloadSupplierSample() {
    saveXlsx([['שם הספק', 'תחום', 'טלפון', 'אימייל', 'ח.פ / ע.מ', 'הערות'],
      ['מגן אש', 'כיבוי אש', '02-1234567', 'info@example.co.il', '512345678', 'ביקורת שנתית'],
      ['אוראל ברזל', 'מסגרות', '050-1234567', '', '', '']],
      [22, 16, 16, 24, 14, 30], 'ספקים', 'ספקים-לדוגמה.xlsx');
  }
  function importSuppliers(file) {
    readSheet(file, { name: /^שם/, field: /תחום|סוג|עיסוק/, phone: /טלפון|נייד/, email: /מייל|אימייל|דוא/,
      taxId: /ח\.?פ|ע\.?מ|עוסק|מזהה/, note: /הער/ }, 'name', function (rows, col) {
      var list = rows.map(function (row) {
        return {
          name: col.name != null ? row[col.name] : '',
          field: col.field != null ? row[col.field] : '',
          phone: col.phone != null ? row[col.phone] : '',
          email: col.email != null ? row[col.email] : '',
          taxId: col.taxId != null ? row[col.taxId] : '',
          note: col.note != null ? row[col.note] : ''
        };
      }).filter(function (r) { return String(r.name || '').trim(); });
      Store.suppliersBulkAdd(list).then(function (res) {
        U.toast('יובאו ' + res.added + ' ספקים' + (res.skipped ? ' · ' + res.skipped + ' כבר קיימים' : ''));
        App.render();
      }).catch(function (e) { U.toast('הייבוא נכשל: ' + (e && e.message ? e.message : ''), 'error'); });
    });
  }

  // ---------- מגש "ספקים לאישור" ----------
  // ספק שהמזכירה הקלידה בחשבונית ואינו מוכר במרשם — לא נכנס לבד.
  // התאמה ודאית (מפתח מנורמל זהה) כבר אוחדה אוטומטית; כאן נשאר רק מה שדורש הכרעה.
  // **הצעת הדמיון היא הצעה בלבד.** "אלי איטח" ו"אלי איטן" מקבלים אותו ציון דמיון
  // כמו "נחשון טכנולוגיה" ו"נחשון טכנולוגיות" — אחד אותו ספק והשני לא. רק אתה יודע.
  function pendingTray(view) {
    if (!Store.suppliersPending) return;
    var pend = Store.suppliersPending();
    if (!pend.length) return;

    var rows = pend.map(function (p) {
      var actions = U.el('td', { style: 'white-space:nowrap;' });
      if (p.suggestion) {
        actions.appendChild(U.el('button', { class: 'btn', text: 'אותו ספק', 
          title: 'השם יישמר ככינוי של "' + p.suggestion.name + '"', onclick: function () {
            Store.supplierMergeAlias(p.suggestion.id, p.name)
              .then(function () { U.toast('אוחד עם ' + p.suggestion.name); App.render(); })
              .catch(function (e) { U.toast('נכשל: ' + (e && e.message ? e.message : ''), 'error'); });
          } }));
        actions.appendChild(document.createTextNode(' '));
      }
      actions.appendChild(U.el('button', { class: 'btn secondary', text: 'ספק חדש', onclick: function () {
        Store.supplierAddFromInvoice(p.name)
          .then(function () { U.toast('נוסף למרשם'); App.render(); })
          .catch(function (e) { U.toast('נכשל: ' + (e && e.message ? e.message : ''), 'error'); });
      } }));
      actions.appendChild(document.createTextNode(' '));
      // למשל שם עובד שהוזן בטעות בשדה הספק — יורד מהמגש לתמיד
      actions.appendChild(U.el('button', { class: 'btn secondary', text: 'לא ספק',
        title: 'לא ייכנס למרשם ולא יופיע כאן שוב', onclick: function () {
          Store.supplierIgnore(p.name)
            .then(function () { U.toast('"' + p.name + '" לא ייחשב ספק'); App.render(); })
            .catch(function (e) { U.toast('נכשל: ' + (e && e.message ? e.message : ''), 'error'); });
        } }));

      return U.el('tr', null, [
        U.el('td', null, [
          U.el('strong', { text: p.name }),
          U.el('div', { class: 'muted', style: 'font-size:12px;', text: p.invoices + ' חשבוניות' })
        ]),
        U.el('td', null, p.suggestion
          ? U.el('div', null, [
              U.el('span', { text: p.suggestion.name }),
              U.el('span', { class: 'tag', style: 'margin-inline-start:6px;background:#fef3c7;color:#92400e;',
                text: Math.round(p.similarity * 100) + '% דומה' })
            ])
          : U.el('span', { class: 'muted', text: 'אין דומה במרשם' })),
        actions
      ]);
    });

    view.appendChild(U.el('div', { class: 'card', style: 'border-inline-start:4px solid #d97706;background:#fffbeb;margin-bottom:14px;' }, [
      U.el('div', { style: 'font-weight:700;margin-bottom:4px;', text: 'ספקים לאישור (' + pend.length + ')' }),
      U.el('div', { class: 'muted', style: 'font-size:13px;margin-bottom:10px;' },
        'שמות שהוזנו בחשבוניות ספק ואינם במרשם. החלטה אחת לכל שם — והיא נשמרת לתמיד. ' +
        'החזרים לעובדים אינם מופיעים כאן. החשבוניות עצמן לא משתנות: איחוד רק שומר את השם ככינוי של הספק הקיים.'),
      U.el('div', { class: 'tbl-scroll' }, [U.el('table', { class: 'grid' }, [
        U.el('thead', null, U.el('tr', null, ['שם מהחשבונית', 'הצעה', ''].map(function (h) { return U.el('th', { text: h }); }))),
        U.el('tbody', null, rows)
      ])])
    ]));
  }

  // ---------- טבלת הספקים ----------
  function supplierRow(s) {
    function inp(field, ph, style) {
      var i = bare(U.el('input', { value: s[field] || '', placeholder: ph, autocomplete: 'off',
        style: (style || 'width:100%;') }));
      i.addEventListener('change', function () {
        if (i.value.trim() === (s[field] || '')) return;
        s[field] = i.value.trim();
        supSave(s, field, s[field]);
      });
      return i;
    }
    var del = U.el('button', { class: 'btn secondary small', html: U.ICO.trash, title: 'הסרת ספק', onclick: function () {
      Modal.confirm({ title: 'הסרת ספק', text: 'להסיר את "' + (s.name || '') + '" מרשימת הספקים?\n' +
        'החשבוניות הקיימות אינן משתנות.', okLabel: 'הסרה', danger: true }, function () {
        Store.supplierDelete(s.id).then(function () { U.toast('הספק הוסר'); App.render(); })
          .catch(function (e) { U.toast('ההסרה נכשלה: ' + (e && e.message ? e.message : ''), 'error'); });
      });
    } });
    var waBtn = s.phone && U.waNumber(s.phone)
      ? U.el('a', { class: 'btn secondary small', href: 'https://wa.me/' + U.waNumber(s.phone),
          target: '_blank', rel: 'noopener', html: U.WA_SVG, title: 'וואטסאפ לספק' })
      : null;
    return U.el('tr', null, [
      U.el('td', { style: 'min-width:150px;' }, inp('name', 'שם הספק', 'width:100%;font-weight:500;')),
      U.el('td', { style: 'min-width:110px;' }, inp('field', 'תחום')),
      U.el('td', { style: 'min-width:120px;' }, inp('phone', 'טלפון', 'width:100%;direction:ltr;text-align:right;')),
      U.el('td', { style: 'min-width:150px;' }, inp('email', 'אימייל', 'width:100%;direction:ltr;text-align:right;')),
      U.el('td', { style: 'min-width:100px;' }, inp('taxId', 'ח.פ / ע.מ', 'width:100%;direction:ltr;text-align:right;')),
      U.el('td', { style: 'min-width:150px;' }, inp('note', 'הערות', 'width:100%;font-size:13px;color:var(--muted);')),
      U.el('td', { style: 'white-space:nowrap;' }, [waBtn, waBtn ? document.createTextNode(' ') : null, del].filter(Boolean))
    ]);
  }
  function suppliersTable(list) {
    return U.el('div', { class: 'tbl-scroll' }, [U.el('table', { class: 'grid' }, [
      U.el('thead', null, U.el('tr', null, ['שם הספק', 'תחום', 'טלפון', 'אימייל', 'ח.פ / ע.מ', 'הערות', '']
        .map(function (h) { return U.el('th', { text: h }); }))),
      U.el('tbody', null, list.map(supplierRow))
    ])]);
  }

  var focusSup = false, supFilter = '', supSynced = false;
  function supplierQuickAdd(view) {
    var name = U.el('input', { placeholder: '+ ספק חדש — שם ולחיצה על Enter', style: 'flex:2 1 180px;min-width:0;font-size:15px;' });
    var field = U.el('input', { placeholder: 'תחום', style: 'flex:1;min-width:110px;' });
    var phone = U.el('input', { placeholder: 'טלפון', style: 'flex:1;min-width:110px;direction:ltr;text-align:right;' });
    function add() {
      if (!name.value.trim()) { name.focus(); return; }
      Store.supplierCreate({ name: name.value.trim(), field: field.value.trim(), phone: phone.value.trim() })
        .then(function () { focusSup = true; U.toast('הספק נוסף'); App.render(); })
        .catch(function (e) { U.toast('ההוספה נכשלה: ' + (e && e.message ? e.message : ''), 'error'); });
    }
    [name, field, phone].forEach(function (i) {
      i.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    });
    view.appendChild(U.el('div', { class: 'card', style: 'padding:10px;margin-bottom:10px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;' },
      [name, field, phone, U.el('button', { class: 'btn', text: 'הוסף', onclick: add })]));
    if (focusSup) { focusSup = false; setTimeout(function () { name.focus(); }, 0); }
  }

  var focusAdd = false;
  function quickAdd(view) {
    var name = U.el('input', { placeholder: '+ תלמיד/ה חדש/ה — שם מלא ולחיצה על Enter', style: 'flex:2;min-width:200px;font-size:15px;' });
    var cls = U.dataListInput('', classNames(), 'כיתה');
    cls._input.style.flex = '0 0 120px';
    var note = U.el('input', { placeholder: 'הערות', style: 'flex:1;min-width:140px;' });
    function add() {
      if (!name.value.trim()) { name.focus(); return; }
      addStudent(name.value.trim(), cls.get(), note.value);
      Store.saveClasses();
      focusAdd = true;
      App.render();
    }
    name.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    note.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    view.appendChild(U.el('div', { class: 'card', style: 'padding:10px;margin-bottom:10px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;' },
      [name, cls, note, U.el('button', { class: 'btn', text: 'הוסף', onclick: add })]));
    if (focusAdd) { focusAdd = false; setTimeout(function () { name.focus(); }, 0); }
  }

  function kpi(val, label, cls) {
    return U.el('div', { class: 'kpi ' + (cls || 'kpi-neutral') }, [
      U.el('div', { class: 'kpi-ic' }),
      U.el('div', { class: 'kpi-body' }, [
        U.el('div', { class: 'kpi-row' }, U.el('div', { class: 'kpi-val', text: String(val) })),
        U.el('div', { class: 'kpi-lbl', text: label })
      ])
    ]);
  }

  function render(view) {
    if (!(Store.isAdmin && Store.isAdmin())) { view.appendChild(U.el('div', { class: 'empty' }, 'לנתוני הבסיס יש גישה למנהל בלבד.')); return; }

    var rows = flatRows();
    var names = classNames();

    view.appendChild(U.el('div', { class: 'page-head' }, [U.el('h2', { text: 'נתוני בסיס' })]));

    // אנשי צוות — מנוהלים בגיליון ניהול עובדים
    view.appendChild(U.el('div', { class: 'card m-card', style: 'margin-bottom:16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;' }, [
      U.el('div', null, [
        U.el('div', { style: 'font-weight:600;', text: 'אנשי צוות' }),
        U.el('div', { class: 'muted', style: 'font-size:12px;', text: 'מצבת העובדים (שם · תפקיד · טלפון · תגיות) מנוהלת בגיליון "ניהול עובדים".' })
      ]),
      U.el('span', { class: 'spacer' }),
      U.el('button', { class: 'btn secondary', text: 'למצבת העובדים ›', onclick: function () { App.setView('emp'); } })
    ]));

    view.appendChild(U.el('div', { class: 'page-head', style: 'margin-top:8px;' }, [
      U.el('h3', { text: 'תלמידים', style: 'font-size:17px;color:var(--brand-dark);' }),
      U.el('span', { class: 'spacer' }),
      U.el('button', { class: 'btn secondary', html: U.XLS_SVG + ' ייבוא תלמידים',
        title: 'ייבוא רשימת תלמידים מקובץ אקסל', onclick: function () { pickFile(importStudents); } }),
      U.el('button', { class: 'btn secondary', html: U.ICO.upload + ' קובץ לדוגמה',
        title: 'הורדת קובץ אקסל לדוגמה לייבוא תלמידים', onclick: downloadStudentSample })
    ]));
    view.appendChild(U.el('div', { class: 'kpi-grid' }, [
      kpi(rows.length, 'תלמידים'),
      kpi(names.length, 'כיתות', 'kpi-info')
    ]));

    quickAdd(view);

    if (!rows.length) {
      view.appendChild(U.el('div', { class: 'empty' }, [
        'עדיין אין תלמידים ברשימה.',
        U.el('div', { class: 'muted', style: 'font-size:13px;margin-top:6px;' },
          'אפשר להוסיף ידנית למעלה, או להוריד את הקובץ לדוגמה, למלא אותו ולייבא.')
      ]));
    } else {
      view.appendChild(studentsTable(rows));

      // מונה לכל כיתה — הכיתות נגזרות מהטבלה
      var byClass = {};
      rows.forEach(function (r) { var k = r.cls.name || ''; byClass[k] = (byClass[k] || 0) + 1; });
      view.appendChild(U.el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;align-items:center;' },
        [U.el('span', { class: 'muted', style: 'font-size:12px;', text: 'כיתות:' })].concat(
          Object.keys(byClass).sort(function (a, b) { return a.localeCompare(b, 'he'); }).map(function (k) {
            return U.el('span', { class: 'tag', text: k + ' · ' + byClass[k] });
          }))));
      view.appendChild(U.el('div', { class: 'muted', style: 'font-size:12px;margin-top:8px;',
        text: 'הכיתות נגזרות אוטומטית מעמודת הכיתה — שינוי הכיתה של תלמיד מעביר אותו, וכיתה שנשארה ריקה נעלמת. הרשימות משמשות למעקב "מי חתם / מי חסר" באישורי הורים.' }));
    }

    // ---------- ספקים ----------
    // איחוד ודאי + הגירת המרשם הישן — פעם אחת, בשקט, לפני שמציגים
    if (!supSynced) {
      supSynced = true;
      var chain = (Store.settings().suppliersMigrated || !Store.suppliersMigrateLocal)
        ? Promise.resolve(0) : Store.suppliersMigrateLocal();
      chain.then(function () { return Store.suppliersAutoMerge ? Store.suppliersAutoMerge() : 0; })
        .then(function (merged) { if (merged) { U.toast(merged + ' כתיבים אוחדו אוטומטית'); } App.render(); })
        .catch(function () { /* אין חיבור — המסך עדיין עובד */ });
    }
    var sup = suppliers();
    view.appendChild(U.el('div', { class: 'page-head', style: 'margin-top:24px;' }, [
      U.el('h3', { text: 'ספקים', style: 'font-size:17px;color:var(--brand-dark);' }),
      U.el('span', { class: 'spacer' }),
      U.el('button', { class: 'btn secondary', html: U.XLS_SVG + ' ייבוא ספקים',
        title: 'ייבוא רשימת ספקים מקובץ אקסל', onclick: function () { pickFile(importSuppliers); } }),
      U.el('button', { class: 'btn secondary', html: U.ICO.upload + ' קובץ לדוגמה',
        title: 'הורדת קובץ אקסל לדוגמה לייבוא ספקים', onclick: downloadSupplierSample })
    ]));

    var supQ = U.el('input', { value: supFilter, placeholder: 'חיפוש ספק — שם, תחום, טלפון…', style: 'flex:1 1 200px;min-width:0;' });
    supQ.addEventListener('input', function () { supFilter = supQ.value; renderSupTable(); });
    view.appendChild(U.el('div', { style: 'display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap;' }, [supQ]));

    pendingTray(view);
    supplierQuickAdd(view);

    var supWrap = U.el('div');
    view.appendChild(supWrap);
    function renderSupTable() {
      U.clear(supWrap);
      var q = supFilter.trim().toLowerCase();
      var list = q ? sup.filter(function (s) {
        return [s.name, s.field, s.phone, s.email, s.taxId, s.note]
          .some(function (v) { return String(v || '').toLowerCase().indexOf(q) > -1; });
      }) : sup.slice();
      list.sort(function (a, b) { return String(a.name || '').localeCompare(String(b.name || ''), 'he'); });
      if (!sup.length) {
        supWrap.appendChild(U.el('div', { class: 'empty' }, [
          'עדיין אין ספקים ברשימה.',
          U.el('div', { class: 'muted', style: 'font-size:13px;margin-top:6px;' },
            'אפשר להוסיף ידנית למעלה, או להוריד את הקובץ לדוגמה, למלא אותו ולייבא.')
        ]));
        return;
      }
      if (!list.length) { supWrap.appendChild(U.el('div', { class: 'empty' }, 'אין ספק שתואם את החיפוש.')); return; }
      supWrap.appendChild(suppliersTable(list));
      supWrap.appendChild(U.el('div', { class: 'muted', style: 'font-size:12px;margin-top:8px;',
        text: 'מוצגים ' + list.length + ' מתוך ' + sup.length + ' ספקים · הרשימה משמשת גם כבורר "מבצע" בגיליון הפרויקטים.' }));
    }
    renderSupTable();
  }

  global.BaseView = { render: render, importFile: importStudents, supplierNames: function () {
    return suppliers().map(function (s) { return s.name; }).filter(Boolean);
  } };
})(window);
