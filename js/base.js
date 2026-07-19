/* base.js — נתוני בסיס: מצבת עובדים, ייבוא מאקסל, תעריפים, סטטוסים, גיבוי */
(function (global) {
  'use strict';
  var U = global.U;

  var TAGS = ['מורה', 'מתגבר', 'מדריך', 'מנהלה'];

  // ---------- טופס עובד ----------
  function openEmpModal(emp) {
    emp = emp || { active: true, tags: [] };
    var first = U.el('input', { value: emp.firstName || '', placeholder: 'שם פרטי' });
    var last = U.el('input', { value: emp.lastName || '', placeholder: 'שם משפחה' });
    var phone = U.el('input', { value: emp.phone || '', placeholder: '050-0000000', type: 'tel' });
    var email = U.el('input', { value: emp.email || '', placeholder: 'אימייל (לזיהוי משתמש מחובר)', type: 'email' });
    var tz = U.el('input', { value: emp.tz || '', placeholder: 'תעודת זהות' });
    var role = U.el('select', null, [
      U.el('option', { value: '', text: 'ללא (עובד רגיל)' }),
      U.el('option', { value: 'secretary', text: 'מזכירות — הזנת מרכז למידה' }),
      U.el('option', { value: 'admin', text: 'מנהל — גישה מלאה' })
    ]);
    role.value = emp.role || '';
    var tagBoxes = TAGS.map(function (t) {
      var cb = U.el('input', { type: 'checkbox', checked: (emp.tags || []).indexOf(t) !== -1 });
      return { tag: t, cb: cb, node: U.el('label', { class: 'tag', style: 'display:inline-flex;align-items:center;gap:4px;margin-inline-end:8px;cursor:pointer;' }, [cb, t]) };
    });
    var active = U.el('input', { type: 'checkbox', checked: emp.active !== false });
    var notes = U.el('textarea', { rows: 2, placeholder: 'הערות' }, emp.notes || '');
    var err = U.el('div', { class: 'field-err' });

    function fld(label, node) { return U.el('div', { class: 'field' }, [U.el('label', { text: label }), node]); }
    var body = U.el('div', null, [
      U.el('div', { class: 'row' }, [fld('שם פרטי', first), fld('שם משפחה', last)]),
      U.el('div', { class: 'row' }, [fld('טלפון', phone), fld('אימייל', email)]),
      U.el('div', { class: 'row' }, [fld('ת.ז', tz), fld('הרשאה באפליקציה', role)]),
      fld('תגיות', U.el('div', null, tagBoxes.map(function (t) { return t.node; }))),
      fld('הערות', notes),
      U.el('label', { style: 'display:flex;align-items:center;gap:6px;cursor:pointer;' }, [active, 'עובד פעיל']),
      err
    ]);
    Modal.open(emp.id ? '✏️ עריכת עובד' : '➕ עובד חדש', body, [
      { label: 'ביטול', class: 'secondary' },
      { label: 'שמירה', onClick: function (close) {
        if (!first.value.trim()) { err.textContent = 'נדרש שם פרטי'; first.focus(); return; }
        emp.firstName = first.value.trim();
        emp.lastName = last.value.trim();
        emp.phone = phone.value.trim();
        emp.email = email.value.trim();
        emp.tz = tz.value.trim();
        emp.role = role.value;
        emp.tags = tagBoxes.filter(function (t) { return t.cb.checked; }).map(function (t) { return t.tag; });
        emp.active = active.checked;
        emp.notes = notes.value.trim();
        Store.upsertEmployee(emp);
        close();
        U.toast('העובד נשמר');
        App.render();
      } }
    ]);
  }

  // ---------- ייבוא מצבת מאקסל ----------
  function importExcel(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var wb = XLSX.read(new Uint8Array(reader.result), { type: 'array' });
        var rows = [];
        wb.SheetNames.forEach(function (sn) {
          var sheetRows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '' });
          if (sheetRows.length > rows.length) rows = sheetRows; // הגיליון העשיר ביותר
        });
        if (!rows.length) { U.toast('הקובץ ריק', 'error'); return; }
        // איתור שורת כותרת: שורה שמכילה תא "שם"
        var headIdx = -1, cols = {};
        for (var i = 0; i < Math.min(rows.length, 10); i++) {
          for (var c = 0; c < rows[i].length; c++) {
            var v = String(rows[i][c]).trim();
            if (v === 'שם' || v === 'שם פרטי') {
              headIdx = i;
              break;
            }
          }
          if (headIdx !== -1) break;
        }
        if (headIdx === -1) { U.toast('לא נמצאה שורת כותרת עם עמודת "שם"', 'error'); return; }
        rows[headIdx].forEach(function (h, c) {
          h = String(h).trim();
          if (h === 'שם' || h === 'שם פרטי') cols.first = c;
          else if (h === 'שם משפחה') cols.last = c;
          else if (h.indexOf('טלפון') !== -1 || h === 'סלולרי') cols.phone = c;
          else if (h.indexOf('מייל') !== -1 || h.toLowerCase() === 'email') cols.email = c;
          else if (h.indexOf('ת.ז') !== -1 || h.indexOf('זהות') !== -1) cols.tz = c;
        });
        var existing = {};
        Store.employees(true).forEach(function (e) { existing[Store.empName(e)] = true; });
        var added = 0, skipped = 0;
        for (var r = headIdx + 1; r < rows.length; r++) {
          var firstName = String(rows[r][cols.first] || '').trim();
          if (!firstName) continue;
          var lastName = cols.last != null ? String(rows[r][cols.last] || '').trim() : '';
          var full = (firstName + ' ' + lastName).trim();
          if (existing[full]) { skipped++; continue; }
          existing[full] = true;
          Store.upsertEmployee({
            firstName: firstName, lastName: lastName,
            phone: cols.phone != null ? String(rows[r][cols.phone] || '').trim() : '',
            email: cols.email != null ? String(rows[r][cols.email] || '').trim() : '',
            tz: cols.tz != null ? String(rows[r][cols.tz] || '').trim() : '',
            role: '', tags: [], active: true, notes: ''
          });
          added++;
        }
        U.toast('יובאו ' + added + ' עובדים' + (skipped ? ' (' + skipped + ' דילוגים — קיימים כבר)' : ''));
        App.render();
      } catch (e) {
        console.error(e);
        U.toast('שגיאה בקריאת הקובץ: ' + e.message, 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // ---------- הגדרות ----------
  function openSettingsModal() {
    var s = Store.settings();
    var hourly = U.el('input', { type: 'number', step: '1', value: s.hourlyRate });
    var km = U.el('input', { type: 'number', step: '0.1', value: s.kmRate });
    var manager = U.el('input', { value: s.managerName || '' });
    function fld(label, node) { return U.el('div', { class: 'field' }, [U.el('label', { text: label }), node]); }
    var body = U.el('div', null, [
      fld('תעריף שעת תגבור (₪)', hourly),
      fld('תעריף נסיעות לק"מ (₪)', km),
      fld('שם המנהל (חתימה על הדוחות)', manager)
    ]);
    Modal.open('⚙️ הגדרות תעריפים', body, [
      { label: 'ביטול', class: 'secondary' },
      { label: 'שמירה', onClick: function (close) {
        s.hourlyRate = U.num(hourly.value, 80);
        s.kmRate = U.num(km.value, 0.9);
        s.managerName = manager.value.trim() || s.managerName;
        Store.saveSettings();
        close();
        U.toast('ההגדרות נשמרו');
        App.render();
      } }
    ]);
  }

  // ---------- עריכת סטטוסים ----------
  function openStatusesModal() {
    var s = Store.settings();
    var list = (s.statuses || []).map(function (st) { return { id: st.id, label: st.label, color: st.color }; });
    var wrap = U.el('div');
    function renderList() {
      U.clear(wrap);
      list.forEach(function (st, i) {
        var lbl = U.el('input', { value: st.label, style: 'flex:1;' });
        lbl.addEventListener('input', function () { st.label = lbl.value; });
        var color = U.el('input', { type: 'color', value: st.color || '#64748b', style: 'width:44px;padding:2px;' });
        color.addEventListener('input', function () { st.color = color.value; });
        var del = U.el('button', { class: 'btn secondary', text: '🗑', title: 'מחיקה', onclick: function () { list.splice(i, 1); renderList(); } });
        wrap.appendChild(U.el('div', { style: 'display:flex;gap:6px;margin-bottom:6px;align-items:center;' }, [lbl, color, del]));
      });
    }
    renderList();
    var addBtn = U.el('button', { class: 'btn secondary', text: '➕ סטטוס חדש', onclick: function () {
      list.push({ id: Store.uid(), label: '', color: '#64748b' });
      renderList();
    } });
    var body = U.el('div', null, [
      U.el('p', { class: 'muted', style: 'margin-top:0;', text: 'הסטטוסים שמופיעים בלוח השכר החודשי.' }),
      wrap, addBtn
    ]);
    Modal.open('🏷️ עריכת סטטוסים', body, [
      { label: 'ביטול', class: 'secondary' },
      { label: 'שמירה', onClick: function (close) {
        s.statuses = list.filter(function (st) { return st.label.trim(); });
        Store.saveSettings();
        close();
        U.toast('הסטטוסים נשמרו');
        App.render();
      } }
    ]);
  }

  // ---------- רינדור ----------
  function render(view) {
    var isAdmin = Store.isAdmin();
    var head = U.el('div', { class: 'page-head' }, [
      U.el('h2', { text: '🗂️ נתוני בסיס' }),
      U.el('span', { class: 'spacer' }),
      isAdmin && U.actionMenu([
        { icon: '⚙️', label: 'תעריפים והגדרות', onClick: openSettingsModal },
        { icon: '🏷️', label: 'עריכת סטטוסים', onClick: openStatusesModal },
        null,
        { html: U.XLS_SVG, label: 'ייבוא מצבת מאקסל', onClick: function () {
          var inp = U.el('input', { type: 'file', accept: '.xlsx,.xls', style: 'display:none;' });
          inp.addEventListener('change', function () { if (inp.files[0]) importExcel(inp.files[0]); });
          document.body.appendChild(inp);
          inp.click();
          setTimeout(function () { document.body.removeChild(inp); }, 500);
        } },
        { icon: '💾', label: 'גיבוי לקובץ JSON', onClick: Store.exportJSON },
        { icon: '📤', label: 'שחזור מגיבוי', onClick: function () {
          var inp = U.el('input', { type: 'file', accept: '.json', style: 'display:none;' });
          inp.addEventListener('change', function () {
            if (!inp.files[0]) return;
            Modal.confirm({ title: 'שחזור מגיבוי', text: 'השחזור יחליף את כל הנתונים הנוכחיים. להמשיך?', okLabel: 'שחזור', danger: true }, function () {
              Store.importJSONFile(inp.files[0], function (e) {
                if (e) U.toast('שגיאה בשחזור: ' + e.message, 'error');
                else { U.toast('הגיבוי שוחזר'); App.render(); }
              });
            });
          });
          document.body.appendChild(inp);
          inp.click();
          setTimeout(function () { document.body.removeChild(inp); }, 500);
        } }
      ])
    ].filter(Boolean));
    view.appendChild(head);

    var s = Store.settings();
    view.appendChild(U.el('div', { class: 'kpi-row' }, [
      kpi('👥', Store.employees().length, 'עובדים פעילים'),
      kpi('💰', s.hourlyRate + ' ₪', 'תעריף שעת תגבור'),
      kpi('🚗', s.kmRate + ' ₪', 'תעריף לק"מ')
    ]));

    var addBtn = isAdmin && U.el('button', { class: 'btn', text: '➕ עובד חדש', onclick: function () { openEmpModal(null); } });
    var search = U.el('input', { placeholder: '🔍 חיפוש עובד…', style: 'max-width:240px;' });
    var bar = U.el('div', { style: 'display:flex;gap:8px;margin:12px 0;align-items:center;' }, [search, U.el('span', { class: 'spacer' }), addBtn].filter(Boolean));
    view.appendChild(bar);

    var tblWrap = U.el('div');
    view.appendChild(tblWrap);

    function renderTable() {
      U.clear(tblWrap);
      var q = (search.value || '').trim();
      var emps = Store.employees(true).filter(function (e) {
        return !q || Store.empName(e).indexOf(q) !== -1;
      });
      emps.sort(function (a, b) {
        if ((a.active !== false) !== (b.active !== false)) return a.active !== false ? -1 : 1;
        return Store.empName(a).localeCompare(Store.empName(b), 'he');
      });
      if (!emps.length) {
        tblWrap.appendChild(U.el('div', { class: 'empty' }, 'אין עובדים במצבת — ייבאו מאקסל (⋮ למעלה) או הוסיפו ידנית'));
        return;
      }
      var tbl = U.el('table', { class: 'grid' }, [
        U.el('thead', null, U.el('tr', null, ['שם', 'טלפון', 'אימייל', 'תגיות', 'הרשאה', 'סטטוס', ''].map(function (h) { return U.el('th', { text: h }); }))),
        U.el('tbody', null, emps.map(function (e) {
          return U.el('tr', { style: e.active === false ? 'opacity:.5;' : '' }, [
            U.el('td', null, [
              U.el('strong', { text: Store.empName(e) }),
              e.notes ? U.el('div', { class: 'muted', style: 'font-size:12px;', text: e.notes }) : null
            ]),
            U.el('td', { text: e.phone || '' }),
            U.el('td', { text: e.email || '' }),
            U.el('td', null, (e.tags || []).map(function (t) { return U.el('span', { class: 'tag', text: t, style: 'margin-inline-end:4px;' }); })),
            U.el('td', { text: e.role ? Store.roleLabel(e.role) : '' }),
            U.el('td', { text: e.active === false ? 'לא פעיל' : 'פעיל' }),
            U.el('td', null, isAdmin ? U.el('button', { class: 'btn secondary', text: '✏️', title: 'עריכה', onclick: function () { openEmpModal(e); } }) : null)
          ]);
        }))
      ]);
      var scroll = U.el('div', { class: 'tbl-scroll' }, [tbl]);
      tblWrap.appendChild(scroll);
    }
    search.addEventListener('input', renderTable);
    renderTable();
  }

  function kpi(icon, val, label) {
    return U.el('div', { class: 'kpi kpi-neutral' }, [
      U.el('span', { class: 'kpi-ic', text: icon }),
      U.el('div', { class: 'kpi-body' }, [
        U.el('div', { class: 'kpi-val', text: String(val) }),
        U.el('div', { class: 'kpi-lbl', text: label })
      ])
    ]);
  }

  global.BaseView = { render: render };
})(window);
