/* base.js — נתוני בסיס: מצבת עובדים, ייבוא מאקסל, תעריפים, סטטוסים, גיבוי */
(function (global) {
  'use strict';
  var U = global.U;

  var TAGS = ['מורה', 'פנימיה', 'מנהלה', 'מתגבר'];

  // ---------- טופס עובד ----------
  function openEmpModal(emp) {
    emp = emp || { active: true, tags: [] };
    var first = U.el('input', { value: emp.firstName || '', placeholder: 'שם פרטי' });
    var last = U.el('input', { value: emp.lastName || '', placeholder: 'שם משפחה' });
    var jobTitle = U.el('input', { value: emp.jobTitle || '', placeholder: 'תפקיד בישיבה (למשל: ר"מ כיתה יא, מרכז למידה)' });
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
      fld('תפקיד בישיבה', jobTitle),
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
        emp.jobTitle = jobTitle.value.trim();
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
            if (v === 'שם' || v === 'שם פרטי') { headIdx = i; break; }
          }
          if (headIdx !== -1) break;
        }
        if (headIdx === -1) { U.toast('לא נמצאה שורת כותרת עם עמודת "שם"', 'error'); return; }
        rows[headIdx].forEach(function (h, c) {
          h = String(h).trim();
          var low = h.toLowerCase();
          if (h === 'שם' || h === 'שם פרטי') cols.first = c;
          else if (h.indexOf('שם משפחה') !== -1) cols.last = c;
          else if (h.indexOf('פלאפון') !== -1 || h.indexOf('פלפון') !== -1 || h.indexOf('טלפון') !== -1 || h.indexOf('נייד') !== -1 || h === 'סלולרי') cols.phone = c;
          else if (h.indexOf('מייל') !== -1 || h.indexOf('דוא') !== -1 || low === 'email') cols.email = c;
          else if (h.indexOf('ת.ז') !== -1 || h.indexOf('ת"ז') !== -1 || h.indexOf('זהות') !== -1) cols.tz = c;
          else if (h.indexOf('תפקיד') !== -1) cols.jobTitle = c;
          else if (h.indexOf('מס') !== -1 && h.indexOf('עובד') !== -1 && cols.empNum == null) cols.empNum = c;
        });
        if (cols.last == null) cols.last = cols.first + 2; // גיבוי: מבנה הקובץ המוכר (שם | מס | שם משפחה)

        // מיפוי תפקיד → תגית לגיליונות (מתגבר/מורה/פנימיה/מנהלה)
        function tagsFor(title) {
          title = String(title || '');
          var t = [];
          var isLC = /מרכז\s*למידה/.test(title);
          var isDorm = /מדריך|פנימי|אם\s*בית/.test(title);
          var isPrincipal = /מנהל\s*תיכון/.test(title); // מנהל תיכון נחשב מורה
          if (isLC) t.push('מתגבר');
          // מורה — אך לא מרכז למידה (שגם מכיל "רכז")
          if (isPrincipal || (!isLC && /מורה|ר["׳']?מ|מ["׳']?מ|רכז|מלמד/.test(title))) t.push('מורה');
          if (isDorm) t.push('פנימיה');
          if (!isPrincipal && (/מזכיר|מנהלן/.test(title) || (/מנהל/.test(title) && !isDorm))) t.push('מנהלה');
          return t.filter(function (x, i, a) { return a.indexOf(x) === i; });
        }

        var existing = {};
        Store.employees(true).forEach(function (e) { existing[Store.empName(e)] = true; });
        var cell = function (row, key) { return cols[key] != null ? String(row[cols[key]] || '').trim() : ''; };
        var added = 0, skipped = 0, inactive = 0;
        for (var r = headIdx + 1; r < rows.length; r++) {
          var firstName = String(rows[r][cols.first] || '').trim();
          if (!firstName || firstName === '?') continue;
          var lastName = cell(rows[r], 'last');
          if (lastName === '?') lastName = '';
          var full = (firstName + ' ' + lastName).trim();
          if (existing[full]) { skipped++; continue; }
          existing[full] = true;
          // "עזב"/"עזבה" בעמודת מספר העובד → עובד שסיים, נשמר כלא-פעיל
          var left = /עזב/.test(cell(rows[r], 'empNum'));
          if (left) inactive++;
          var jobTitle = cell(rows[r], 'jobTitle');
          Store.upsertEmployee({
            firstName: firstName, lastName: lastName,
            jobTitle: jobTitle,
            phone: cell(rows[r], 'phone'),
            email: cell(rows[r], 'email'),
            tz: cell(rows[r], 'tz'),
            role: '', tags: tagsFor(jobTitle), active: !left, notes: ''
          });
          added++;
        }
        var msg = 'יובאו ' + added + ' עובדים';
        if (inactive) msg += ' (' + inactive + ' סומנו לא-פעילים — "עזב")';
        if (skipped) msg += ' · ' + skipped + ' דילוגים (קיימים כבר)';
        U.toast(msg);
        App.render();
      } catch (e) {
        console.error(e);
        U.toast('שגיאה בקריאת הקובץ: ' + e.message, 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // ---------- ייבוא מצבת (כפתור) ----------
  function pickExcelFile() {
    var inp = U.el('input', { type: 'file', accept: '.xlsx,.xls', style: 'display:none;' });
    inp.addEventListener('change', function () { if (inp.files[0]) importExcel(inp.files[0]); });
    document.body.appendChild(inp);
    inp.click();
    setTimeout(function () { document.body.removeChild(inp); }, 500);
  }

  // ---------- רינדור ----------
  function render(view) {
    var isAdmin = Store.isAdmin();
    var head = U.el('div', { class: 'page-head' }, [
      U.el('h2', { text: '🗂️ נתוני בסיס' }),
      U.el('span', { class: 'spacer' }),
      isAdmin && U.el('button', { class: 'btn secondary', html: U.XLS_SVG + ' ייבוא מאקסל', onclick: pickExcelFile })
    ].filter(Boolean));
    view.appendChild(head);

    view.appendChild(U.el('div', { class: 'kpi-row' }, [
      kpi('👥', Store.employees().length, 'עובדים פעילים'),
      kpi('👤', Store.employees(true).length, 'סה"כ במצבת')
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
        U.el('thead', null, U.el('tr', null, ['שם', 'תפקיד', 'טלפון', 'אימייל', 'תגיות', 'הרשאה', 'סטטוס', ''].map(function (h) { return U.el('th', { text: h }); }))),
        U.el('tbody', null, emps.map(function (e) {
          return U.el('tr', { style: e.active === false ? 'opacity:.5;' : '' }, [
            U.el('td', null, [
              U.el('strong', { text: Store.empName(e) }),
              e.notes ? U.el('div', { class: 'muted', style: 'font-size:12px;', text: e.notes }) : null
            ]),
            U.el('td', { text: e.jobTitle || '' }),
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
