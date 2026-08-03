/* base.js — גיליון "נתוני בסיס": טבלת תלמידים אחת (שם · כיתה · הערות).
   הכיתות נגזרות מהטבלה — כל שם כיתה שמופיע אצל תלמיד הוא כיתה קיימת.
   באחסון נשמר המבנה ההיסטורי settings.classes=[{name,students[]}] כדי שאישורי ההורים ימשיכו לעבוד. */
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

  // ---------- אקסל ----------
  var SAMPLE = [['שם מלא', 'כיתה', 'הערות'],
    ['ישראל ישראלי', 'ט1', ''],
    ['משה כהן', 'ט1', 'אלרגיה לבוטנים'],
    ['דוד לוי', 'י2', '']];

  function downloadSample() {
    try {
      var wb = XLSX.utils.book_new();
      var ws = XLSX.utils.aoa_to_sheet(SAMPLE);
      ws['!cols'] = [{ wch: 24 }, { wch: 10 }, { wch: 30 }];
      XLSX.utils.book_append_sheet(wb, ws, 'תלמידים');
      XLSX.writeFile(wb, 'תלמידים-לדוגמה.xlsx');
    } catch (e) { U.toast('יצירת הקובץ נכשלה: ' + e.message, 'error'); }
  }

  function importExcel(file) {
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

        // שורת כותרת: מחפשים "שם" ו"כיתה" בעשר השורות הראשונות
        var head = -1, col = {};
        for (var i = 0; i < Math.min(rows.length, 10) && head === -1; i++) {
          var map = {};
          rows[i].forEach(function (h, ci) {
            h = String(h).trim();
            if (/^שם/.test(h)) map.name = ci;
            else if (/כיתה|שכבה/.test(h)) map.cls = ci;
            else if (/הער/.test(h)) map.note = ci;
          });
          if (map.name != null) { head = i; col = map; }
        }
        if (head === -1) { U.toast('לא נמצאה עמודת "שם מלא" בקובץ', 'error'); return; }

        var have = {};
        flatRows().forEach(function (r) { have[r.st.name + '|' + (r.cls.name || '')] = true; });
        var added = 0, skipped = 0;
        for (var r2 = head + 1; r2 < rows.length; r2++) {
          var row = rows[r2];
          var nm = col.name != null ? String(row[col.name] || '').trim() : '';
          if (!nm) continue;
          var cl = col.cls != null ? String(row[col.cls] || '').trim() : '';
          if (have[nm + '|' + cl]) { skipped++; continue; }
          have[nm + '|' + cl] = true;
          addStudent(nm, cl, col.note != null ? row[col.note] : '');
          added++;
        }
        Store.saveClasses();
        U.toast('יובאו ' + added + ' תלמידים' + (skipped ? ' · ' + skipped + ' דילוגים (כבר קיימים)' : ''));
        App.render();
      } catch (e) {
        console.error(e);
        U.toast('שגיאה בקריאת הקובץ: ' + e.message, 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  }
  function pickFile() {
    var inp = U.el('input', { type: 'file', accept: '.xlsx,.xls', style: 'display:none;' });
    inp.addEventListener('change', function () { if (inp.files[0]) importExcel(inp.files[0]); });
    document.body.appendChild(inp);
    inp.click();
    setTimeout(function () { document.body.removeChild(inp); }, 500);
  }

  // ---------- טבלת התלמידים ----------
  function studentsTable(rows) {
    var names = classNames();
    var body = rows.map(function (r) {
      var nameInp = bare(U.el('input', { value: r.st.name || '', placeholder: 'שם מלא', style: 'width:100%;font-weight:500;' }));
      nameInp.addEventListener('change', function () { r.st.name = nameInp.value.trim(); Store.saveClasses(); });

      var clsW = U.dataListInput(r.cls.name || '', names, 'כיתה');
      bare(clsW._input);
      clsW._input.style.maxWidth = '110px';
      clsW._input.addEventListener('change', function () { moveStudent(r.st, r.cls, clsW.get()); });

      var noteInp = bare(U.el('input', { value: r.st.note || '', placeholder: 'רגישות / מידע רלוונטי', style: 'width:100%;font-size:13px;color:var(--muted);' }));
      noteInp.addEventListener('change', function () { r.st.note = noteInp.value.trim(); Store.saveClasses(); });

      var del = U.el('button', { class: 'btn secondary small', html: U.ICO.trash, title: 'הסרת תלמיד/ה', onclick: function () {
        Modal.confirm({ title: 'הסרת תלמיד/ה', text: 'להסיר את "' + (r.st.name || '') + '" מהרשימה?', okLabel: 'הסרה', danger: true }, function () {
          r.cls.students = r.cls.students.filter(function (x) { return x !== r.st; });
          dropEmptyClasses();
          Store.saveClasses();
          App.render();
        });
      } });

      return U.el('tr', null, [
        U.el('td', { style: 'min-width:170px;' }, nameInp),
        U.el('td', null, clsW),
        U.el('td', { style: 'min-width:200px;' }, noteInp),
        U.el('td', null, del)
      ]);
    });
    return U.el('div', { class: 'tbl-scroll' }, [U.el('table', { class: 'grid' }, [
      U.el('thead', null, U.el('tr', null, ['שם מלא', 'כיתה', 'הערות', ''].map(function (h) { return U.el('th', { text: h }); }))),
      U.el('tbody', null, body)
    ])]);
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

    view.appendChild(U.el('div', { class: 'page-head' }, [
      U.el('h2', { text: 'נתוני בסיס' }),
      U.el('span', { class: 'spacer' }),
      U.el('button', { class: 'btn secondary', html: U.XLS_SVG + ' ייבוא מאקסל', onclick: pickFile }),
      U.el('button', { class: 'btn secondary', html: U.ICO.upload + ' קובץ לדוגמה', title: 'הורדת קובץ אקסל לדוגמה לייבוא', onclick: downloadSample })
    ]));

    // אנשי צוות — מנוהלים בגיליון ניהול עובדים
    view.appendChild(U.el('div', { class: 'card m-card', style: 'margin-bottom:16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;' }, [
      U.el('div', null, [
        U.el('div', { style: 'font-weight:600;', text: 'אנשי צוות' }),
        U.el('div', { class: 'muted', style: 'font-size:12px;', text: 'מצבת העובדים (שם · תפקיד · טלפון · תגיות) מנוהלת בגיליון "ניהול עובדים".' })
      ]),
      U.el('span', { class: 'spacer' }),
      U.el('button', { class: 'btn secondary', text: 'למצבת העובדים ›', onclick: function () { App.setView('emp'); } })
    ]));

    view.appendChild(U.el('div', { class: 'page-head', style: 'margin-top:8px;' },
      [U.el('h3', { text: 'תלמידים', style: 'font-size:17px;color:var(--brand-dark);' })]));
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
      return;
    }

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

  global.BaseView = { render: render, importFile: importExcel };
})(window);
