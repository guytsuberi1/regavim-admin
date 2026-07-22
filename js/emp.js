/* emp.js — ניהול עובדים: מצבת, כרטיס עובד מלא, הגדרת תפקיד, מבנה שבועי, ייבוא מאקסל ודף לעובד */
(function (global) {
  'use strict';
  var U = global.U;

  var TAGS = ['מורה', 'פנימיה', 'מנהלה', 'מתגבר'];
  var DAYS_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳'];
  var DAYS_FULL = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי'];

  var EMPLOYMENT = [
    { key: 'amuta', label: 'עמותה' },
    { key: 'moe', label: 'משרד החינוך' },
    { key: 'kablan', label: 'קבלן' }
  ];
  function employmentLabel(k) {
    var e = EMPLOYMENT.filter(function (x) { return x.key === k; })[0];
    return e ? e.label : '';
  }

  var ONBOARD = [
    { key: 'none', label: 'לא התחיל' },
    { key: 'progress', label: 'בתהליך' },
    { key: 'done', label: 'הושלם' }
  ];
  var PENSION = [
    { key: 'none', label: 'טרם טופל' },
    { key: 'inprog', label: 'בטיפול' },
    { key: 'done', label: 'טופל' },
    { key: 'na', label: 'אין צורך' }
  ];
  var CHECKS = [
    { key: 'locker', label: 'לוקר' },
    { key: 'teamMail', label: 'מייל צוות' },
    { key: 'whatsapp', label: 'ווטסאפ הודעות' },
    { key: 'firstAid', label: 'קורס עזרה ראשונה' }
  ];
  function keyLabel(list, k) {
    var x = list.filter(function (i) { return i.key === k; })[0];
    return x ? x.label : list[0].label;
  }

  // השלמת שדות חדשים לעובד ותיק (לא שומר — רק מנרמל בזיכרון)
  function norm(e) {
    if (!e.checks) e.checks = {};
    if (!e.onboard) e.onboard = { status: 'none', note: '' };
    if (!e.pension) e.pension = { status: 'none', note: '' };
    if (!e.roleDef) e.roleDef = { purpose: '', duties: '', reportsTo: '', metrics: '' };
    if (!Array.isArray(e.workDays)) e.workDays = [];
    return e;
  }

  var selectedId = null; // עובד פתוח בכרטיס
  var cardTab = 'info';
  var filterTag = '';
  var filterEmployment = '';

  // ---------- טופס פרטי עובד (מודאל) ----------
  function openEmpModal(emp) {
    emp = norm(emp || { active: true, tags: [] });
    var first = U.el('input', { value: emp.firstName || '', placeholder: 'שם פרטי' });
    var last = U.el('input', { value: emp.lastName || '', placeholder: 'שם משפחה' });
    var jobTitle = U.el('input', { value: emp.jobTitle || '', placeholder: 'תפקיד בישיבה (למשל: ר"מ כיתה יא, מרכז למידה)' });
    var phone = U.el('input', { value: emp.phone || '', placeholder: '050-0000000', type: 'tel' });
    var email = U.el('input', { value: emp.email || '', placeholder: 'אימייל (לזיהוי משתמש מחובר)', type: 'email' });
    var tz = U.el('input', { value: emp.tz || '', placeholder: 'תעודת זהות' });
    var employment = U.el('select', null, [U.el('option', { value: '', text: '— לא הוגדר —' })].concat(
      EMPLOYMENT.map(function (x) { return U.el('option', { value: x.key, text: x.label }); })));
    employment.value = emp.employment || '';
    var empNumInternal = U.el('input', { value: emp.empNumInternal || '', placeholder: 'מס׳ עובד פנימי' });
    var empNumAmuta = U.el('input', { value: emp.empNumAmuta || '', placeholder: 'מס׳ עובד בעמותה' });
    var startDate = U.el('input', { type: 'date', value: emp.startDate || '' });
    var travelKm = U.el('input', { type: 'number', step: '1', min: '0', value: emp.travelKm != null ? emp.travelKm : '', placeholder: 'ק"מ הלוך ושוב (למתגברי מרכז למידה)' });
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
    var hasCv = U.el('input', { type: 'checkbox', checked: !!emp.hasCv });
    var hasContract = U.el('input', { type: 'checkbox', checked: !!emp.hasContract });
    var active = U.el('input', { type: 'checkbox', checked: emp.active !== false });
    var notes = U.el('textarea', { rows: 2, placeholder: 'הערות' }, emp.notes || '');
    var err = U.el('div', { class: 'field-err' });

    function fld(label, node) { return U.el('div', { class: 'field' }, [U.el('label', { text: label }), node]); }
    function cbRow(cb, label) { return U.el('label', { style: 'display:inline-flex;align-items:center;gap:6px;cursor:pointer;margin-inline-end:14px;' }, [cb, label]); }
    var body = U.el('div', null, [
      U.el('div', { class: 'row' }, [fld('שם פרטי', first), fld('שם משפחה', last)]),
      fld('תפקיד בישיבה', jobTitle),
      U.el('div', { class: 'row' }, [fld('טלפון', phone), fld('אימייל', email)]),
      U.el('div', { class: 'row' }, [fld('ת.ז', tz), fld('סוג העסקה', employment)]),
      U.el('div', { class: 'row' }, [fld('מס׳ עובד פנימי', empNumInternal), fld('מס׳ עובד בעמותה', empNumAmuta)]),
      U.el('div', { class: 'row' }, [fld('תאריך תחילת עבודה', startDate), fld('הרשאה באפליקציה', role)]),
      fld('ק"מ נסיעה הלוך ושוב (למתגבר)', travelKm),
      fld('תגיות', U.el('div', null, tagBoxes.map(function (t) { return t.node; }))),
      fld('מסמכים', U.el('div', null, [cbRow(hasCv, 'קורות חיים ✓'), cbRow(hasContract, 'חוזה חתום ✓')])),
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
        emp.employment = employment.value;
        emp.empNumInternal = empNumInternal.value.trim();
        emp.empNumAmuta = empNumAmuta.value.trim();
        emp.startDate = startDate.value || '';
        emp.travelKm = travelKm.value.trim() === '' ? '' : U.num(travelKm.value);
        emp.role = role.value;
        emp.tags = tagBoxes.filter(function (t) { return t.cb.checked; }).map(function (t) { return t.tag; });
        emp.hasCv = hasCv.checked;
        emp.hasContract = hasContract.checked;
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
  // תא "מסומן" בקובץ: ˅ / כן / V — ריק או "אין …" נחשב לא מסומן
  function isChecked(v) {
    v = String(v || '').trim();
    if (!v || v.indexOf('אין') !== -1) return false;
    return true;
  }
  function importExcel(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var wb = XLSX.read(new Uint8Array(reader.result), { type: 'array' });
        // בחירת הגיליון העשיר ביותר — לפי מספר תאים מלאים (לא שורות: גיליונות מכילים שורות ריקות)
        var rows = [], bestCells = -1;
        wb.SheetNames.forEach(function (sn) {
          var sheetRows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '' });
          var cells = 0;
          sheetRows.forEach(function (r) {
            r.forEach(function (c) { if (String(c).trim() !== '') cells++; });
          });
          if (cells > bestCells) { bestCells = cells; rows = sheetRows; }
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
          else if ((h.indexOf('מייל') !== -1 || h.indexOf('דוא') !== -1 || low === 'email') && h.indexOf('צוות') !== -1) cols.teamMail = c;
          else if (h.indexOf('מייל') !== -1 || h.indexOf('דוא') !== -1 || low === 'email') cols.email = c;
          else if (h.indexOf('ת.ז') !== -1 || h.indexOf('ת"ז') !== -1 || h.indexOf('זהות') !== -1) cols.tz = c;
          else if (h.indexOf('תפקיד') !== -1) cols.jobTitle = c;
          else if (h.indexOf('מס') !== -1 && h.indexOf('עובד') !== -1 && h.indexOf('עמותה') !== -1) cols.empNumAmuta = c;
          else if (h.indexOf('מס') !== -1 && h.indexOf('עובד') !== -1) cols.empNumInternal = c;
          else if (h.indexOf('עמותה') !== -1) cols.amuta = c;
          else if (h.indexOf('משרד החינוך') !== -1) cols.moe = c;
          else if (h.indexOf('לוקר') !== -1) cols.locker = c;
          else if (h.indexOf('קליטה') !== -1) cols.onboard = c;
          else if (h.indexOf('ווטסאפ') !== -1 || h.indexOf('וואטסאפ') !== -1) cols.whatsapp = c;
          else if (h.indexOf('עזרה ראשונה') !== -1) cols.firstAid = c;
          else if (h.indexOf('פנסיה') !== -1) cols.pension = c;
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
          if (isPrincipal || (!isLC && /מורה|ר["׳']?מ|מ["׳']?מ|רכז|מלמד/.test(title))) t.push('מורה');
          if (isDorm) t.push('פנימיה');
          if (!isPrincipal && (/מזכיר|מנהלן/.test(title) || (/מנהל/.test(title) && !isDorm))) t.push('מנהלה');
          return t.filter(function (x, i, a) { return a.indexOf(x) === i; });
        }
        // סטטוס קליטה מתוך הטקסט החופשי בקובץ
        function onboardFrom(txt) {
          txt = String(txt || '').trim();
          if (!txt) return null;
          if (isChecked(txt) && txt.length <= 2) return { status: 'done', note: '' }; // ˅ בלבד
          if (/נחתם|נקלט|הושלם/.test(txt)) return { status: 'done', note: txt };
          return { status: 'progress', note: txt };
        }
        // סטטוס פנסיה מתוך הטקסט החופשי
        function pensionFrom(txt) {
          txt = String(txt || '').trim();
          if (!txt) return null;
          if (/אין צורך/.test(txt)) return { status: 'na', note: '' };
          if (/קיים|טופל|הועבר/.test(txt)) return { status: 'done', note: txt };
          return { status: 'inprog', note: txt };
        }

        var byName = {};
        Store.employees(true).forEach(function (e) { byName[Store.empName(e)] = e; });
        var cell = function (row, key) { return cols[key] != null ? String(row[cols[key]] || '').trim() : ''; };
        var added = 0, updated = 0, inactive = 0;
        for (var r = headIdx + 1; r < rows.length; r++) {
          var firstName = String(rows[r][cols.first] || '').trim();
          if (!firstName || firstName === '?') continue;
          var lastName = cell(rows[r], 'last');
          if (lastName === '?') lastName = '';
          var full = (firstName + ' ' + lastName).trim();

          var empNumRaw = cell(rows[r], 'empNumInternal');
          var left = /עזב/.test(empNumRaw); // "עזב"/"עזבה" → עובד שסיים
          var jobTitle = cell(rows[r], 'jobTitle');
          var amutaCell = cell(rows[r], 'amuta');
          var employment = '';
          if (/קבלן/.test(amutaCell) || /קבלן/.test(cell(rows[r], 'onboard'))) employment = 'kablan';
          else if (isChecked(cell(rows[r], 'moe'))) employment = 'moe';
          else if (isChecked(amutaCell)) employment = 'amuta';

          var fresh = {
            phone: cell(rows[r], 'phone'), email: cell(rows[r], 'email'), tz: cell(rows[r], 'tz'),
            jobTitle: jobTitle,
            empNumInternal: left ? '' : empNumRaw,
            empNumAmuta: cell(rows[r], 'empNumAmuta'),
            employment: employment,
            onboard: onboardFrom(cell(rows[r], 'onboard')),
            pension: pensionFrom(cell(rows[r], 'pension')),
            checks: {
              locker: cols.locker != null ? isChecked(cell(rows[r], 'locker')) : null,
              teamMail: cols.teamMail != null ? isChecked(cell(rows[r], 'teamMail')) : null,
              whatsapp: cols.whatsapp != null ? isChecked(cell(rows[r], 'whatsapp')) : null,
              firstAid: cols.firstAid != null ? isChecked(cell(rows[r], 'firstAid')) : null
            }
          };

          var existing = byName[full];
          if (existing) {
            // עדכון עדין: ממלא רק שדות ריקים, לא דורס מה שהוזן ידנית
            norm(existing);
            var changed = false;
            ['phone', 'email', 'tz', 'jobTitle', 'empNumInternal', 'empNumAmuta', 'employment'].forEach(function (k) {
              if (!existing[k] && fresh[k]) { existing[k] = fresh[k]; changed = true; }
            });
            if (fresh.onboard && existing.onboard.status === 'none' && !existing.onboard.note) { existing.onboard = fresh.onboard; changed = true; }
            if (fresh.pension && existing.pension.status === 'none' && !existing.pension.note) { existing.pension = fresh.pension; changed = true; }
            CHECKS.forEach(function (ck) {
              if (fresh.checks[ck.key] === true && !existing.checks[ck.key]) { existing.checks[ck.key] = true; changed = true; }
            });
            if (left && existing.active !== false) { existing.active = false; changed = true; inactive++; }
            if (changed) { Store.upsertEmployee(existing); updated++; }
            continue;
          }

          if (left) inactive++;
          var emp = norm({
            firstName: firstName, lastName: lastName,
            jobTitle: jobTitle,
            phone: fresh.phone, email: fresh.email, tz: fresh.tz,
            empNumInternal: fresh.empNumInternal, empNumAmuta: fresh.empNumAmuta,
            employment: fresh.employment,
            role: '', tags: tagsFor(jobTitle), active: !left, notes: ''
          });
          if (fresh.onboard) emp.onboard = fresh.onboard;
          if (fresh.pension) emp.pension = fresh.pension;
          CHECKS.forEach(function (ck) { if (fresh.checks[ck.key] === true) emp.checks[ck.key] = true; });
          Store.upsertEmployee(emp);
          byName[full] = emp;
          added++;
        }
        var msg = 'יובאו ' + added + ' עובדים חדשים';
        if (updated) msg += ' · עודכנו ' + updated;
        if (inactive) msg += ' · ' + inactive + ' סומנו לא-פעילים ("עזב")';
        U.toast(msg);
        App.render();
      } catch (e) {
        console.error(e);
        U.toast('שגיאה בקריאת הקובץ: ' + e.message, 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function pickExcelFile() {
    var inp = U.el('input', { type: 'file', accept: '.xlsx,.xls', style: 'display:none;' });
    inp.addEventListener('change', function () { if (inp.files[0]) importExcel(inp.files[0]); });
    document.body.appendChild(inp);
    inp.click();
    setTimeout(function () { document.body.removeChild(inp); }, 500);
  }

  // ---------- דף לעובד (הדפסה) ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function linesList(txt) {
    var items = String(txt || '').split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
    if (!items.length) return '<p class="muted">— לא הוגדר —</p>';
    return '<ul>' + items.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>';
  }
  function openEmpDoc(emp) {
    norm(emp);
    var s = Store.settings();
    var today = U.todayISO();
    var reportsTo = emp.roleDef.reportsTo ? Store.empName(emp.roleDef.reportsTo) : '';
    var manages = Store.employees().filter(function (e) {
      return e.roleDef && e.roleDef.reportsTo === emp.id && e.id !== emp.id;
    }).map(Store.empName);
    var daysRow = DAYS_FULL.map(function (d, i) {
      var on = emp.workDays.indexOf(i) !== -1;
      return '<td class="' + (on ? 'day-on' : 'day-off') + '">' + (on ? '✓' : '—') + '</td>';
    }).join('');
    var h = '<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8">'
      + '<title>הגדרת תפקיד — ' + esc(Store.empName(emp)) + '</title>'
      + '<style>'
      + 'body{font-family:"Rubik","Segoe UI",Arial,sans-serif;margin:0;padding:0;color:#111;background:#f1f5f9;}'
      + '.bar{position:sticky;top:0;background:#143b69;color:#fff;padding:10px 16px;display:flex;gap:10px;align-items:center;}'
      + '.bar button{background:#1d4e89;color:#fff;border:1px solid rgba(255,255,255,.4);border-radius:8px;padding:8px 18px;font-size:15px;font-family:inherit;cursor:pointer;}'
      + 'section.page{background:#fff;max-width:800px;margin:16px auto;padding:30px 36px;box-shadow:0 1px 4px rgba(0,0,0,.15);}'
      + '.head{text-align:center;border-bottom:2px solid #143b69;padding-bottom:12px;margin-bottom:20px;}'
      + '.head h1{margin:0;font-size:26px;color:#143b69;} .head .sub{font-size:15px;color:#555;margin-top:4px;}'
      + 'h2{font-size:18px;color:#143b69;margin:20px 0 6px;border-bottom:1px solid #cbd5e1;padding-bottom:4px;}'
      + 'ul{margin:6px 0;padding-inline-start:22px;} li{margin:3px 0;}'
      + 'table{width:100%;border-collapse:collapse;margin:8px 0;font-size:14px;}'
      + 'th,td{border:1px solid #cbd5e1;padding:7px 8px;text-align:center;}'
      + 'th{background:#e3edf9;color:#143b69;}'
      + '.day-on{background:#e8f5e9;color:#1b5e20;font-weight:700;font-size:16px;}'
      + '.day-off{color:#bbb;}'
      + '.muted{color:#777;font-size:13px;}'
      + '.meta{display:flex;justify-content:space-between;font-size:13px;color:#555;margin-top:4px;}'
      + '.sign{display:flex;justify-content:space-between;gap:40px;margin-top:44px;font-size:14px;}'
      + '.sign div{flex:1;border-top:1px solid #333;padding-top:6px;text-align:center;}'
      + '@media print{body{background:#fff;} .bar{display:none;} section.page{box-shadow:none;margin:0;max-width:none;padding:12mm 14mm;}}'
      + '</style></head><body>'
      + '<div class="bar"><button onclick="window.print()">🖨️ הדפסה / שמירה כ-PDF</button>'
      + '<span style="font-size:13px;opacity:.85;">דף הגדרת תפקיד לעובד — לתת ביד או לשלוח</span></div>'
      + '<section class="page">'
      + '<div class="head"><h1>' + esc(s.orgName || 'ישיבת רגבים בנימין') + '</h1>'
      + '<div class="sub">הגדרת תפקיד ומבנה שבועי</div></div>'
      + '<div class="meta"><span><strong>' + esc(Store.empName(emp)) + '</strong> · ' + esc(emp.jobTitle || '') + '</span>'
      + '<span>' + esc(U.hebrewDate(today)) + ' · ' + esc(U.gregLabel(today) + '/' + today.slice(0, 4)) + '</span></div>'
      + '<h2>ייעוד התפקיד</h2>'
      + (emp.roleDef.purpose ? '<p>' + esc(emp.roleDef.purpose) + '</p>' : '<p class="muted">— לא הוגדר —</p>')
      + '<h2>תחומי אחריות</h2>' + linesList(emp.roleDef.duties)
      + '<h2>כפיפות</h2>'
      + '<p>' + (reportsTo ? 'מדווח ל: <strong>' + esc(reportsTo) + '</strong>' : '<span class="muted">לא הוגדר למי מדווח</span>')
      + (manages.length ? '<br>מדווחים אליו: ' + esc(manages.join(', ')) : '') + '</p>'
      + '<h2>מדדי הצלחה</h2>' + linesList(emp.roleDef.metrics)
      + '<h2>מבנה שבועי</h2>'
      + '<table><tr>' + DAYS_FULL.map(function (d) { return '<th>' + d + '</th>'; }).join('') + '</tr>'
      + '<tr>' + daysRow + '</tr></table>'
      + '<div class="sign"><div>חתימת העובד</div><div>חתימת המנהל</div></div>'
      + '</section></body></html>';
    var w = window.open('', '_blank');
    if (!w) { U.toast('הדפדפן חסם את החלון — אפשרו חלונות קופצים', 'error'); return; }
    w.document.write(h);
    w.document.close();
  }

  // ---------- כרטיס עובד ----------
  function openCard(id, tab) {
    selectedId = id;
    cardTab = tab || 'info';
    App.render();
  }

  function infoLine(label, value, extra) {
    return U.el('div', { class: 'def-item' }, [
      U.el('label', { text: label }),
      U.el('div', { class: 'def-val' }, [value || U.el('span', { class: 'muted', text: '—' })].concat(extra || []))
    ]);
  }
  function txt(v) { return v ? U.el('span', { text: v }) : null; }

  function renderCard(view, emp) {
    norm(emp);
    var isAdmin = Store.isAdmin();

    // כותרת הכרטיס
    var head = U.el('div', { class: 'page-head' }, [
      U.el('button', { class: 'btn secondary', text: '→ חזרה למצבת', onclick: function () { selectedId = null; App.render(); } }),
      U.el('h2', { text: Store.empName(emp), style: 'margin-inline-start:8px;' }),
      emp.active === false ? U.el('span', { class: 'tag', text: 'לא פעיל', style: 'opacity:.7;' }) : null,
      U.el('span', { class: 'spacer' }),
      isAdmin && U.el('button', { class: 'btn secondary', text: '🖨️ דף לעובד', onclick: function () { openEmpDoc(emp); } }),
      isAdmin && U.el('button', { class: 'btn', text: '✏️ עריכת פרטים', onclick: function () { openEmpModal(emp); } })
    ].filter(Boolean));
    view.appendChild(head);
    if (emp.jobTitle) view.appendChild(U.el('div', { class: 'muted', style: 'margin:-8px 0 12px;font-size:15px;', text: emp.jobTitle }));

    // לשוניות הכרטיס
    var tabs = [
      { id: 'info', label: '👤 פרטים' },
      { id: 'roledef', label: '📄 תפקיד ומבנה שבועי' },
      { id: 'onboard', label: '📥 קליטה' },
      { id: 'activity', label: '📊 פעילות' }
    ];
    view.appendChild(U.el('div', { class: 'subtabs', style: 'margin-bottom:14px;' }, tabs.map(function (t) {
      return U.el('button', { class: cardTab === t.id ? 'active' : '', onclick: function () { cardTab = t.id; App.render(); } }, t.label);
    })));

    var body = U.el('div');
    view.appendChild(body);
    if (cardTab === 'info') renderInfoTab(body, emp);
    else if (cardTab === 'roledef') renderRoleDefTab(body, emp, isAdmin);
    else if (cardTab === 'onboard') renderOnboardTab(body, emp, isAdmin);
    else renderActivityTab(body, emp);
  }

  function renderInfoTab(body, emp) {
    var waNum = U.waNumber(emp.phone);
    var card = U.el('div', { class: 'card' }, [
      U.el('div', { class: 'def-grid' }, [
        infoLine('טלפון', txt(emp.phone), waNum ? [U.el('a', {
          class: 'btn secondary small', style: 'margin-inline-start:8px;', href: 'https://wa.me/' + waNum,
          target: '_blank', html: U.WA_SVG
        })] : []),
        infoLine('אימייל', txt(emp.email)),
        infoLine('ת.ז', txt(emp.tz)),
        infoLine('סוג העסקה', txt(employmentLabel(emp.employment))),
        infoLine('מס׳ עובד פנימי', txt(emp.empNumInternal)),
        infoLine('מס׳ עובד בעמותה', txt(emp.empNumAmuta)),
        infoLine('תאריך תחילת עבודה', txt(emp.startDate ? U.gregLabel(emp.startDate) + '/' + emp.startDate.slice(0, 4) : '')),
        infoLine('ק"מ נסיעה (מתגבר)', txt(emp.travelKm !== '' && emp.travelKm != null ? String(emp.travelKm) : '')),
        infoLine('הרשאה באפליקציה', txt(emp.role ? Store.roleLabel(emp.role) : '')),
        infoLine('תגיות', (emp.tags || []).length ? U.el('span', null, (emp.tags || []).map(function (t) {
          return U.el('span', { class: 'tag', text: t, style: 'margin-inline-end:4px;' });
        })) : null),
        infoLine('קורות חיים', txt(emp.hasCv ? '✓ יש' : '')),
        infoLine('חוזה חתום', txt(emp.hasContract ? '✓ יש' : ''))
      ])
    ]);
    body.appendChild(card);
    if (emp.notes) {
      body.appendChild(U.el('div', { class: 'card', style: 'margin-top:12px;' }, [
        U.el('label', { class: 'muted', style: 'font-size:13px;', text: 'הערות' }),
        U.el('div', { style: 'white-space:pre-line;', text: emp.notes })
      ]));
    }
  }

  function renderRoleDefTab(body, emp, isAdmin) {
    var rd = emp.roleDef;
    var purpose = U.el('textarea', { rows: 2, placeholder: 'משפט או שניים: בשביל מה התפקיד קיים' }, rd.purpose || '');
    var duties = U.el('textarea', { rows: 6, placeholder: 'תחום אחריות בכל שורה' }, rd.duties || '');
    var metrics = U.el('textarea', { rows: 3, placeholder: 'מדד הצלחה בכל שורה' }, rd.metrics || '');
    var others = Store.employees().filter(function (e) { return e.id !== emp.id; });
    others.sort(function (a, b) { return Store.empName(a).localeCompare(Store.empName(b), 'he'); });
    var reportsTo = U.el('select', null, [U.el('option', { value: '', text: '— לא הוגדר —' })].concat(
      others.map(function (e) { return U.el('option', { value: e.id, text: Store.empName(e) }); })));
    reportsTo.value = rd.reportsTo || '';
    var manages = Store.employees().filter(function (e) {
      return e.roleDef && e.roleDef.reportsTo === emp.id && e.id !== emp.id;
    });

    // מבנה שבועי — כפתורי ימים
    var dayBtns = DAYS_SHORT.map(function (d, i) {
      var on = emp.workDays.indexOf(i) !== -1;
      var b = U.el('button', { class: 'wday' + (on ? ' on' : ''), text: d, title: 'יום ' + DAYS_FULL[i], disabled: !isAdmin });
      b.addEventListener('click', function () {
        var idx = emp.workDays.indexOf(i);
        if (idx === -1) emp.workDays.push(i); else emp.workDays.splice(idx, 1);
        emp.workDays.sort();
        b.classList.toggle('on');
      });
      return b;
    });

    function fld(label, node, hint) {
      return U.el('div', { class: 'field', style: 'margin-bottom:12px;' }, [
        U.el('label', { text: label }),
        node,
        hint ? U.el('div', { class: 'muted', style: 'font-size:12px;margin-top:2px;', text: hint }) : null
      ]);
    }

    var card = U.el('div', { class: 'card' }, [
      fld('🎯 ייעוד התפקיד', purpose),
      fld('📋 תחומי אחריות', duties, 'כל שורה — תחום אחריות אחד; כך זה יופיע כרשימה בדף המודפס'),
      fld('🪜 מדווח ל־', reportsTo),
      manages.length ? U.el('div', { class: 'field', style: 'margin-bottom:12px;' }, [
        U.el('label', { text: 'מדווחים אליו' }),
        U.el('div', null, manages.map(function (e) {
          return U.el('span', { class: 'tag', text: Store.empName(e), style: 'margin-inline-end:4px;cursor:pointer;', onclick: function () { openCard(e.id, 'roledef'); } });
        }))
      ]) : null,
      fld('📈 מדדי הצלחה', metrics, 'כל שורה — מדד אחד'),
      fld('📅 מבנה שבועי — באילו ימים עובד', U.el('div', { class: 'wdays' }, dayBtns)),
      isAdmin && U.el('div', { style: 'display:flex;gap:8px;margin-top:6px;' }, [
        U.el('button', { class: 'btn', text: '💾 שמירה', onclick: function () {
          rd.purpose = purpose.value.trim();
          rd.duties = duties.value;
          rd.metrics = metrics.value;
          rd.reportsTo = reportsTo.value;
          Store.upsertEmployee(emp);
          U.toast('הגדרת התפקיד נשמרה');
          App.render();
        } }),
        U.el('button', { class: 'btn secondary', text: '🖨️ דף לעובד', onclick: function () { openEmpDoc(emp); } })
      ])
    ].filter(Boolean));
    body.appendChild(card);
  }

  function renderOnboardTab(body, emp, isAdmin) {
    function saveNow() { Store.upsertEmployee(emp); }

    var obStatus = U.el('select', { disabled: !isAdmin }, ONBOARD.map(function (x) {
      return U.el('option', { value: x.key, text: x.label });
    }));
    obStatus.value = emp.onboard.status || 'none';
    obStatus.addEventListener('change', function () { emp.onboard.status = obStatus.value; saveNow(); });
    var obNote = U.el('textarea', { rows: 2, placeholder: 'איפה זה עומד — "חוזה נחתם ונשלח", "נשלחו טפסים לרחל"…', disabled: !isAdmin }, emp.onboard.note || '');
    obNote.addEventListener('change', function () { emp.onboard.note = obNote.value.trim(); saveNow(); });

    var checkRows = CHECKS.map(function (ck) {
      var cb = U.el('input', { type: 'checkbox', checked: !!emp.checks[ck.key], disabled: !isAdmin });
      cb.addEventListener('change', function () { emp.checks[ck.key] = cb.checked; saveNow(); });
      return U.el('label', { style: 'display:flex;align-items:center;gap:8px;cursor:pointer;padding:6px 0;' }, [cb, ck.label]);
    });

    var pnStatus = U.el('select', { disabled: !isAdmin }, PENSION.map(function (x) {
      return U.el('option', { value: x.key, text: x.label });
    }));
    pnStatus.value = emp.pension.status || 'none';
    pnStatus.addEventListener('change', function () { emp.pension.status = pnStatus.value; saveNow(); });
    var pnNote = U.el('textarea', { rows: 2, placeholder: 'הערות — "נשלחה תזכורת בווטסאפ", "שלחתי במייל למיכל"…', disabled: !isAdmin }, emp.pension.note || '');
    pnNote.addEventListener('change', function () { emp.pension.note = pnNote.value.trim(); saveNow(); });

    function fld(label, node) { return U.el('div', { class: 'field', style: 'margin-bottom:10px;' }, [U.el('label', { text: label }), node]); }
    body.appendChild(U.el('div', { class: 'cards-3' }, [
      U.el('div', { class: 'card' }, [
        U.el('h3', { text: '📥 תהליך קליטה', style: 'margin-top:0;' }),
        fld('סטטוס', obStatus),
        fld('פירוט', obNote)
      ]),
      U.el('div', { class: 'card' }, [
        U.el('h3', { text: '✅ צ׳קליסט תפעולי', style: 'margin-top:0;' }),
        U.el('div', null, checkRows)
      ]),
      U.el('div', { class: 'card' }, [
        U.el('h3', { text: '🏦 פנסיה וגמול השתלמות', style: 'margin-top:0;' }),
        fld('סטטוס', pnStatus),
        fld('הערות', pnNote)
      ])
    ]));
    body.appendChild(U.el('div', { class: 'muted', style: 'font-size:12px;margin-top:8px;', text: 'שינויים במסך זה נשמרים מיד' }));
  }

  function renderActivityTab(body, emp) {
    var months = Store.knownMonths();
    var name = Store.empName(emp);
    var rows = [];
    months.forEach(function (m) {
      var lcH = 0, subH = 0, absN = 0;
      Store.records('lc', m, function (r) { return r.empId === emp.id; }).forEach(function (r) { lcH += U.num(r.hours); });
      Store.records('sub', m, function (r) { return r.empId === emp.id; }).forEach(function (r) { subH += U.num(r.hours); });
      absN = Store.records('abs', m, function (r) { return r.kind === 'absence' && (r.name === name || r.empId === emp.id); }).length;
      if (lcH || subH || absN) rows.push({ m: m, lcH: lcH, subH: subH, absN: absN });
    });
    if (!rows.length) {
      body.appendChild(U.el('div', { class: 'empty' }, 'אין עדיין פעילות רשומה לעובד זה בגיליונות השכר'));
      return;
    }
    var tbl = U.el('table', { class: 'grid' }, [
      U.el('thead', null, U.el('tr', null, ['חודש', 'שעות מרכז למידה', 'שעות מילוי מקום', 'דיווחי היעדרות'].map(function (h) {
        return U.el('th', { text: h });
      }))),
      U.el('tbody', null, rows.map(function (r) {
        return U.el('tr', null, [
          U.el('td', { text: U.monthLabel(r.m) }),
          U.el('td', { text: r.lcH ? String(r.lcH) : '—' }),
          U.el('td', { text: r.subH ? String(r.subH) : '—' }),
          U.el('td', { text: r.absN ? String(r.absN) : '—' })
        ]);
      }))
    ]);
    body.appendChild(U.el('div', { class: 'tbl-scroll' }, [tbl]));
    body.appendChild(U.el('div', { class: 'muted', style: 'font-size:12px;margin-top:8px;', text: 'הנתונים נמשכים אוטומטית מגיליונות דוחות השכר' }));
  }

  // ---------- טבלת המצבת ----------
  function kpi(icon, val, label) {
    return U.el('div', { class: 'kpi kpi-neutral' }, [
      U.el('span', { class: 'kpi-ic', text: icon }),
      U.el('div', { class: 'kpi-body' }, [
        U.el('div', { class: 'kpi-val', text: String(val) }),
        U.el('div', { class: 'kpi-lbl', text: label })
      ])
    ]);
  }

  function onboardChip(emp) {
    var st = (emp.onboard && emp.onboard.status) || 'none';
    if (st === 'done') return U.el('span', { class: 'tag', style: 'background:#e8f5e9;border-color:#16a34a;color:#1b5e20;', text: 'הושלמה' });
    if (st === 'progress') return U.el('span', { class: 'tag', style: 'background:#fef3c7;border-color:#d97706;color:#92400e;', text: 'בתהליך' });
    return U.el('span', { class: 'muted', text: '—' });
  }

  function renderTable(view) {
    var isAdmin = Store.isAdmin();
    var all = Store.employees(true).map(norm);
    var active = all.filter(function (e) { return e.active !== false; });

    var head = U.el('div', { class: 'page-head' }, [
      U.el('h2', { text: '👤 עובדים' }),
      U.el('span', { class: 'spacer' }),
      isAdmin && U.actionMenu([
        { html: U.XLS_SVG, label: 'ייבוא מצבת מאקסל', onClick: pickExcelFile }
      ]),
      isAdmin && U.el('button', { class: 'btn', text: '➕ עובד חדש', onclick: function () { openEmpModal(null); } })
    ].filter(Boolean));
    view.appendChild(head);

    view.appendChild(U.el('div', { class: 'kpi-row' }, [
      kpi('👥', active.length, 'עובדים פעילים'),
      kpi('📥', active.filter(function (e) { return e.onboard.status === 'progress'; }).length, 'בתהליך קליטה'),
      kpi('🏢', active.filter(function (e) { return e.employment === 'amuta'; }).length, 'עובדי עמותה'),
      kpi('🏫', active.filter(function (e) { return e.employment === 'moe'; }).length, 'משרד החינוך')
    ]));

    var search = U.el('input', { placeholder: '🔍 חיפוש עובד…', style: 'max-width:220px;' });
    var tagChips = U.el('div', { style: 'display:flex;gap:6px;align-items:center;' }, TAGS.map(function (t) {
      var b = U.el('button', { class: 'tag', style: 'cursor:pointer;' + (filterTag === t ? 'outline:2px solid var(--brand);' : ''), text: t });
      b.addEventListener('click', function () { filterTag = filterTag === t ? '' : t; App.render(); });
      return b;
    }));
    var empSel = U.el('select', { style: 'max-width:160px;' }, [U.el('option', { value: '', text: 'כל סוגי ההעסקה' })].concat(
      EMPLOYMENT.map(function (x) { return U.el('option', { value: x.key, text: x.label }); })));
    empSel.value = filterEmployment;
    empSel.addEventListener('change', function () { filterEmployment = empSel.value; App.render(); });

    view.appendChild(U.el('div', { style: 'display:flex;gap:10px;margin:12px 0;align-items:center;flex-wrap:wrap;' }, [search, tagChips, empSel]));

    var tblWrap = U.el('div');
    view.appendChild(tblWrap);

    function renderRows() {
      U.clear(tblWrap);
      var q = (search.value || '').trim();
      var emps = all.filter(function (e) {
        if (q && Store.empName(e).indexOf(q) === -1 && (e.jobTitle || '').indexOf(q) === -1) return false;
        if (filterTag && (e.tags || []).indexOf(filterTag) === -1) return false;
        if (filterEmployment && e.employment !== filterEmployment) return false;
        return true;
      });
      emps.sort(function (a, b) {
        if ((a.active !== false) !== (b.active !== false)) return a.active !== false ? -1 : 1;
        return Store.empName(a).localeCompare(Store.empName(b), 'he');
      });
      if (!emps.length) {
        tblWrap.appendChild(U.el('div', { class: 'empty' }, 'אין עובדים תואמים — ייבאו מאקסל (⋮ למעלה) או הוסיפו ידנית'));
        return;
      }
      var tbl = U.el('table', { class: 'grid' }, [
        U.el('thead', null, U.el('tr', null, ['שם', 'טלפון', 'סוג העסקה', 'ימי עבודה', 'קליטה', 'תגיות', 'סטטוס'].map(function (h) {
          return U.el('th', { text: h });
        }))),
        U.el('tbody', null, emps.map(function (e) {
          var tr = U.el('tr', { style: (e.active === false ? 'opacity:.5;' : '') + 'cursor:pointer;' }, [
            U.el('td', null, [
              U.el('strong', { text: Store.empName(e) }),
              e.jobTitle ? U.el('div', { class: 'muted', style: 'font-size:12px;', text: e.jobTitle }) : null
            ]),
            U.el('td', { text: e.phone || '' }),
            U.el('td', { text: employmentLabel(e.employment) }),
            U.el('td', null, e.workDays.length
              ? U.el('span', { class: 'wd-mini', text: e.workDays.map(function (i) { return DAYS_SHORT[i]; }).join(' ') })
              : U.el('span', { class: 'muted', text: '—' })),
            U.el('td', null, [onboardChip(e)]),
            U.el('td', null, (e.tags || []).map(function (t) { return U.el('span', { class: 'tag', text: t, style: 'margin-inline-end:4px;' }); })),
            U.el('td', { text: e.active === false ? 'לא פעיל' : 'פעיל' })
          ]);
          tr.addEventListener('click', function () { openCard(e.id); });
          return tr;
        }))
      ]);
      tblWrap.appendChild(U.el('div', { class: 'tbl-scroll' }, [tbl]));
    }
    search.addEventListener('input', renderRows);
    renderRows();
  }

  // ---------- רינדור ראשי ----------
  function render(view) {
    if (selectedId) {
      var emp = Store.empById(selectedId);
      if (emp) { renderCard(view, emp); return; }
      selectedId = null;
    }
    renderTable(view);
  }

  global.EmpView = { render: render, open: openCard, importFile: importExcel };
})(window);
