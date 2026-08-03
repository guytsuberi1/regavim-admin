/* recruit.js — גיוס: מועמדים למשרות (טבלה + קנבן) ומשרות פנויות. עריכה ישירה בטבלאות */
(function (global) {
  'use strict';
  var U = global.U;

  var STATUSES = [
    { key: 'התעניין', color: '#64748b' },
    { key: 'הגיע לראיון', color: '#2563eb' },
    { key: 'התקבל', color: '#16a34a' },
    { key: 'לא רלוונטי', color: '#94a3b8' }
  ];
  function stColor(s) {
    var x = STATUSES.filter(function (q) { return q.key === s; })[0];
    return x ? x.color : '#64748b';
  }
  var FLYER = ['', 'בוצע', 'לא בוצע', 'לא צריך'];

  var DEFAULT_YEAR = 'תשפ"ז';

  var viewMode = 'kanban'; // 'kanban' | 'table'
  var yearFilter = '';     // '' = הכל
  var targetFilter = '';   // סינון מועמדים לפי משרה (מהמסך משרות)
  var focusAdd = false;

  // ---------- עוזרי עריכה ישירה (בסגנון גיליון המשימות) ----------
  function saveCand(c, field, val) { c[field] = val; Store.upsertCandidate(c); }
  function savePos(p, field, val) { p[field] = val; Store.upsertPosition(p); }

  function bareStyle(i) {
    i.style.border = '1px solid transparent';
    i.style.background = 'transparent';
    i.style.padding = '4px 6px';
    i.addEventListener('focus', function () { i.style.background = 'var(--card,#fff)'; i.style.borderColor = 'var(--border,#d6dce1)'; });
    i.addEventListener('blur', function () { i.style.background = 'transparent'; i.style.borderColor = 'transparent'; });
    return i;
  }
  function inpText(rec, field, save, ph, style) {
    var i = U.el('input', { value: rec[field] || '', placeholder: ph || '', style: style || '', autocomplete: 'off' });
    bareStyle(i);
    i.addEventListener('change', function () { save(rec, field, i.value.trim()); });
    return i;
  }
  function inpList(rec, field, save, options, ph) {
    var w = U.dataListInput(rec[field] || '', options, ph || '');
    bareStyle(w._input);
    w._input.style.minWidth = '90px';
    w._input.addEventListener('change', function () { save(rec, field, w.get()); });
    return w;
  }
  function inpCheck(rec, field, save) {
    var cb = U.el('input', { type: 'checkbox', checked: !!rec[field] });
    cb.addEventListener('change', function () { save(rec, field, cb.checked); });
    return cb;
  }

  // ---------- הודעות למועמדים ----------
  // הנוסחים נערכים במסך ההגדרות; כאן רק ברירות המחדל והמשתנים.
  var MSG_VARS = '{שם} · {משרה} · {מראיין} · {טלפון_מזכירה} · {חתימה}';
  var MSG_DEFAULTS = {
    'התעניין':
      'שלום {שם},\n' +
      'חוזר אליך בעקבות פנייתך למשרת {משרה} בישיבת רגבים בנימין.\n' +
      'אשמח לתאם ראיון — נא ליצור קשר עם המזכירה בטלפון {טלפון_מזכירה} לתיאום מועד.\n' +
      'זמין לכל שאלה.\n{חתימה}',
    'הגיע לראיון':
      'שלום {שם},\n' +
      'תודה שהגעת לראיון למשרת {משרה}.\n' +
      'נעדכן אותך בהמשך התהליך בהקדם.\n' +
      'תודה ובהצלחה.\n{חתימה}',
    'התקבל':
      'שלום {שם},\n' +
      'שמחים לבשר שהתקבלת למשרת {משרה} בישיבת רגבים בנימין!\n' +
      'ניצור קשר לתיאום המשך תהליך הקליטה והחתמת המסמכים.\n' +
      'ברוך הבא.\n{חתימה}',
    'לא רלוונטי':
      'שלום {שם},\n' +
      'תודה על התעניינותך במשרת {משרה} בישיבת רגבים בנימין.\n' +
      'לאחר בחינת המועמדויות בחרנו להתקדם עם מועמד אחר.\n' +
      'נשמח לשמור את פרטיך לפניות עתידיות. בהצלחה בהמשך הדרך.\n{חתימה}'
  };
  var SIGN_DEFAULT = 'בברכה,\n{מנהלן} · מנהלן ישיבת רגבים בנימין';
  // "לא רלוונטי" לא נפתח לבד — הודעת דחייה נשלחת רק בלחיצה מפורשת
  var AUTO_STATUSES = { 'התעניין': 1, 'הגיע לראיון': 1, 'התקבל': 1 };

  function firstName(c) { return String(c.name || '').trim().split(/\s+/)[0] || ''; }
  function signature() {
    var s = Store.settings();
    var txt = s.recruitSign != null ? s.recruitSign : SIGN_DEFAULT;
    return txt.replace(/\{מנהלן\}/g, s.managerName || Store.myName() || '');
  }
  function msgTemplate(status) {
    var t = (Store.settings().recruitMsg || {})[status];
    return t != null && String(t).trim() !== '' ? t : (MSG_DEFAULTS[status] || '');
  }
  function buildMsg(c, status) {
    var s = Store.settings();
    return msgTemplate(status)
      .replace(/\{שם\}/g, firstName(c))
      .replace(/\{משרה\}/g, (c.target || '').trim() || 'המשרה')
      .replace(/\{מראיין\}/g, (c.interviewer || '').trim())
      .replace(/\{טלפון_מזכירה\}/g, (s.secretaryPhone || '').trim())
      .replace(/\{חתימה\}/g, signature())
      .replace(/[ \t]+\n/g, '\n');
  }
  function logSend(c, status, channel, text) {
    if (!Array.isArray(c.msgLog)) c.msgLog = [];
    c.msgLog.push({ at: new Date().toISOString(), status: status, channel: channel, text: text });
    Store.upsertCandidate(c);
  }
  function lastSend(c) {
    var log = c.msgLog || [];
    return log.length ? log[log.length - 1] : null;
  }
  // חיווי: מתי נשלחה ההודעה האחרונה; ריחוף מציג את כל ההיסטוריה
  function sentBadge(c) {
    var last = lastSend(c);
    if (!last) return null;
    var title = (c.msgLog || []).map(function (m) {
      return U.gregLabel(String(m.at).slice(0, 10)) + ' · ' + m.status + ' · ' + m.channel;
    }).join('\n');
    return U.el('span', { class: 'tag', title: 'הודעות שנשלחו:\n' + title,
      style: 'background:#dcfce7;color:#166534;border-color:#16653433;font-size:11px;white-space:nowrap;',
      text: 'נשלח ' + U.gregLabel(String(last.at).slice(0, 10)) });
  }

  function offerMessage(c, status, done) {
    status = status || c.status || 'התעניין';
    if (!MSG_DEFAULTS[status]) { done && done(); return; }
    var phone = (c.phone || '').trim();
    var ta = U.el('textarea', { rows: 9, style: 'width:100%;font-size:14px;line-height:1.6;' }, buildMsg(c, status));
    var prev = lastSend(c);
    var body = U.el('div', null, [
      U.el('div', { class: 'muted', style: 'font-size:13px;margin-bottom:8px;',
        text: 'הסטטוס: "' + status + '". אפשר לערוך את הנוסח ולשלוח ל' + (c.name || 'מועמד') +
          (phone ? ' (' + phone + ')' : '') + ':' }),
      ta,
      prev ? U.el('div', { class: 'muted', style: 'font-size:12px;margin-top:6px;',
        text: 'הודעה קודמת נשלחה ב-' + U.gregLabel(String(prev.at).slice(0, 10)) + ' (' + prev.status + ' · ' + prev.channel + ')' }) : null,
      phone ? null : U.el('div', { class: 'field-err', style: 'margin-top:6px;',
        text: 'למועמד אין מספר טלפון — אפשר להעתיק את הנוסח ולשלוח ידנית.' }),
      U.el('div', { class: 'muted', style: 'font-size:12px;margin-top:6px;',
        text: 'את הנוסחים הקבועים עורכים במסך ההגדרות.' })
    ].filter(Boolean));

    function after(close, channel) {
      logSend(c, status, channel, ta.value);
      close();
      App.render();
      done && done();
    }
    Modal.open('שליחת הודעה למועמד', body, [
      { label: 'לא עכשיו', class: 'secondary', onClick: function (close) { close(); done && done(); } },
      { label: 'העתקה', class: 'secondary', onClick: function (close) {
        try {
          navigator.clipboard.writeText(ta.value);
          U.toast('הנוסח הועתק');
          after(close, 'העתקה');
        } catch (e) { U.toast('ההעתקה נכשלה', 'error'); }
      } },
      { label: 'SMS', class: 'secondary', onClick: function (close) {
        if (!phone) { U.toast('אין מספר טלפון למועמד', 'error'); return; }
        window.open('sms:' + phone.replace(/[^0-9+]/g, '') + '?body=' + encodeURIComponent(ta.value), '_blank');
        after(close, 'SMS');
      } },
      { label: 'שליחה בוואטסאפ', onClick: function (close) {
        if (!phone) { U.toast('אין מספר טלפון למועמד', 'error'); return; }
        window.open('https://wa.me/' + U.waNumber(phone) + '?text=' + encodeURIComponent(ta.value), '_blank');
        after(close, 'וואטסאפ');
      } }
    ]);
  }
  // כפתור שליחה ידני — קיים בכל שורה, והדרך היחידה לשלוח הודעת "לא רלוונטי"
  function sendBtn(c) {
    return U.el('button', {
      class: 'btn secondary small', html: U.ICO.send,
      title: 'שליחת הודעה למועמד (' + (c.status || 'התעניין') + ')',
      onclick: function (e) { e.stopPropagation(); offerMessage(c, c.status || 'התעניין'); }
    });
  }

  // ---------- המרת מועמד שהתקבל לעובד ----------
  function offerConversion(c) {
    if (c.convertedEmpId && Store.empById(c.convertedEmpId)) return; // כבר הועבר
    var already = Store.employees(true).filter(function (e) { return Store.empName(e) === (c.name || '').trim(); })[0];
    if (already) return; // קיים במצבת בשם זהה
    Modal.confirm({
      title: 'המועמד התקבל',
      text: 'להעביר את "' + c.name + '" למצבת העובדים?\nהפרטים יועברו וייפתח תהליך קליטה.',
      okLabel: 'העברה למצבת', cancelLabel: 'לא עכשיו'
    }, function () {
      var parts = (c.name || '').trim().split(/\s+/);
      var emp = Store.upsertEmployee({
        firstName: parts[0] || '', lastName: parts.slice(1).join(' '),
        jobTitle: c.target || '', phone: c.phone || '', email: '', tz: '',
        role: '', tags: [], active: true,
        notes: [c.city ? 'מגורים: ' + c.city : '', c.notes || ''].filter(Boolean).join(' · '),
        onboard: { status: 'progress', note: 'הועבר מגיליון המועמדים' }
      });
      c.convertedEmpId = emp.id;
      Store.upsertCandidate(c);
      U.toast('"' + c.name + '" נוסף למצבת — נפתח תהליך קליטה');
      App.setView('emp');
      EmpView.open(emp.id, 'onboard');
    });
  }
  function setStatus(c, status) {
    c.status = status;
    Store.upsertCandidate(c);
    App.render();
    if (!AUTO_STATUSES[status]) {                      // "לא רלוונטי" — רק בלחיצה על כפתור השליחה
      if (status === 'התקבל') offerConversion(c);
      return;
    }
    offerMessage(c, status, function () {
      if (status === 'התקבל') offerConversion(c);
    });
  }

  // ---------- ייבוא מועמדים מאקסל (הקובץ של גיא: מועמדים + משרות זו לצד זו) ----------
  function importExcel(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var wb = XLSX.read(new Uint8Array(reader.result), { type: 'array' });
        var rows = [], bestCells = -1;
        wb.SheetNames.forEach(function (sn) {
          var sheetRows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '' });
          var cells = 0;
          sheetRows.forEach(function (r) { r.forEach(function (v) { if (String(v).trim() !== '') cells++; }); });
          if (cells > bestCells) { bestCells = cells; rows = sheetRows; }
        });
        if (!rows.length) { U.toast('הקובץ ריק', 'error'); return; }
        // שורת כותרת: מכילה "שם מלא"
        var headIdx = -1, cols = {}, pcols = {};
        for (var i = 0; i < Math.min(rows.length, 10); i++) {
          if (rows[i].some(function (v) { return String(v).trim() === 'שם מלא'; })) { headIdx = i; break; }
        }
        if (headIdx === -1) { U.toast('לא נמצאה שורת כותרת עם "שם מלא"', 'error'); return; }
        rows[headIdx].forEach(function (h, cIdx) {
          h = String(h).trim();
          if (h === 'שם מלא') cols.name = cIdx;
          else if (h.indexOf('מגורים') !== -1) cols.city = cIdx;
          else if (h.indexOf('טלפון') !== -1) cols.phone = cIdx;
          else if (h.indexOf('מיועד') !== -1) cols.target = cIdx;
          else if (h === 'סטטוס') cols.status = cIdx;
          else if (h.indexOf('מול מי') !== -1) cols.interviewer = cIdx;
          else if (h.indexOf('קורות חיים') !== -1) cols.cv = cIdx;
          else if (h.indexOf('גרפולוגיה') !== -1) cols.grapho = cIdx;
          else if (h.indexOf('התרשמות') !== -1) cols.impression = cIdx;
          else if (h.indexOf('משפחתי') !== -1) cols.family = cIdx;
          else if (h === 'הערות') cols.notes = cIdx;
          // טבלת המשרות (עמודות נפרדות באותה שורה)
          else if (h === 'תפקיד') pcols.title = cIdx;
          else if (h.indexOf('מאויש') !== -1) pcols.filledBy = cIdx;
          else if (h.indexOf('אחוז') !== -1) pcols.scope = cIdx;
          else if (h.indexOf('פלייר') !== -1) pcols.flyer = cIdx;
        });
        var cell = function (row, map, key) { return map[key] != null ? String(row[map[key]] || '').trim() : ''; };

        // משרות
        var posByTitle = {};
        Store.positions().forEach(function (p) { posByTitle[p.title] = p; });
        var addedPos = 0;
        if (pcols.title != null) {
          for (var r = headIdx + 1; r < rows.length; r++) {
            var title = cell(rows[r], pcols, 'title');
            if (!title || posByTitle[title]) continue;
            var flyerRaw = cell(rows[r], pcols, 'flyer');
            var flyer = /בוצע/.test(flyerRaw) ? (/לא בוצע/.test(flyerRaw) ? 'לא בוצע' : 'בוצע')
              : /לא צריך/.test(flyerRaw) ? 'לא צריך' : '';
            posByTitle[title] = Store.upsertPosition({
              title: title,
              filledBy: cell(rows[r], pcols, 'filledBy').replace(/^\?$/, ''),
              scope: cell(rows[r], pcols, 'scope'),
              flyer: flyer, notes: ''
            });
            addedPos++;
          }
        }

        // מועמדים
        var existing = {};
        Store.candidates().forEach(function (c) { existing[c.name] = true; });
        var added = 0, skipped = 0;
        for (var r2 = headIdx + 1; r2 < rows.length; r2++) {
          var name = cell(rows[r2], cols, 'name');
          if (!name) continue;
          if (existing[name]) { skipped++; continue; }
          existing[name] = true;
          var stRaw = cell(rows[r2], cols, 'status');
          var status = STATUSES.filter(function (s) { return s.key === stRaw; })[0] ? stRaw : 'התעניין';
          Store.upsertCandidate({
            name: name,
            city: cell(rows[r2], cols, 'city'),
            phone: cell(rows[r2], cols, 'phone'),
            target: cell(rows[r2], cols, 'target'),
            status: status,
            interviewer: cell(rows[r2], cols, 'interviewer'),
            hasCv: /יש/.test(cell(rows[r2], cols, 'cv')),
            hasGrapho: cell(rows[r2], cols, 'grapho') !== '' && !/אין/.test(cell(rows[r2], cols, 'grapho')),
            impression: cell(rows[r2], cols, 'impression'),
            familyStatus: cell(rows[r2], cols, 'family'),
            notes: cell(rows[r2], cols, 'notes'),
            year: DEFAULT_YEAR
          });
          added++;
        }
        var msg = 'יובאו ' + added + ' מועמדים';
        if (addedPos) msg += ' ו-' + addedPos + ' משרות';
        if (skipped) msg += ' · ' + skipped + ' דילוגים (קיימים)';
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

  // ---------- מסך מועמדים ----------
  function positionTitles() {
    return Store.positions().map(function (p) { return p.title; });
  }
  function candYears() {
    var set = {};
    Store.candidates().forEach(function (c) { set[c.year || DEFAULT_YEAR] = 1; });
    return Object.keys(set).sort();
  }
  function filteredCands() {
    return Store.candidates().filter(function (c) {
      if (yearFilter && (c.year || DEFAULT_YEAR) !== yearFilter) return false;
      if (targetFilter && (c.target || '') !== targetFilter) return false;
      return true;
    });
  }

  function quickAddCand(host) {
    var name = U.el('input', { placeholder: '+ מועמד חדש — שם מלא ולחיצה על Enter', style: 'flex:2;min-width:180px;font-size:15px;' });
    var phone = U.el('input', { placeholder: 'טלפון', type: 'tel', style: 'flex:1;min-width:110px;' });
    var target = U.dataListInput('', positionTitles(), 'מיועד ל־');
    target._input.style.flex = '1'; target._input.style.minWidth = '110px';
    function add() {
      if (!name.value.trim()) { name.focus(); return; }
      var rec = Store.upsertCandidate({
        name: name.value.trim(), phone: phone.value.trim(), target: target.get(),
        city: '', status: 'התעניין', interviewer: '', hasCv: false, hasGrapho: false,
        impression: '', familyStatus: '', notes: '', year: yearFilter || DEFAULT_YEAR
      });
      focusAdd = true;
      App.render();
      offerMessage(rec, 'התעניין');      // הרגע הנכון להשיב לפנייה
    }
    name.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    host.appendChild(U.el('div', { class: 'card', style: 'padding:10px;margin-bottom:10px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;' },
      [name, phone, target, U.el('button', { class: 'btn', text: 'הוסף', onclick: add })]));
    if (focusAdd) { focusAdd = false; setTimeout(function () { name.focus(); }, 0); }
  }

  function statusSel(c) {
    var sel = U.el('select', { class: 'm-status', style: 'min-width:112px;font-size:12px;padding:7px 8px;' },
      STATUSES.map(function (s) { return U.el('option', { value: s.key, text: s.key }); }));
    sel.value = c.status || 'התעניין';
    sel.style.background = stColor(sel.value);
    sel.addEventListener('change', function () { setStatus(c, sel.value); });
    return sel;
  }

  function convertedBadge(c) {
    if (!c.convertedEmpId) return null;
    var emp = Store.empById(c.convertedEmpId);
    if (!emp) return null;
    return U.el('span', {
      class: 'tag', text: 'במצבת', title: 'הועבר למצבת העובדים — לחיצה פותחת את הכרטיס',
      style: 'cursor:pointer;background:#e8f5e9;border-color:#16a34a;color:#1b5e20;',
      onclick: function (e) { e.stopPropagation(); App.setView('emp'); EmpView.open(emp.id); }
    });
  }

  function renderCandTable(host, list) {
    quickAddCand(host);
    if (!list.length) { host.appendChild(U.el('div', { class: 'empty' }, 'אין מועמדים — הוסיפו למעלה או ייבאו מאקסל (⋮)')); return; }
    var tbl = U.el('table', { class: 'grid' }, [
      U.el('thead', null, U.el('tr', null, ['שם', 'טלפון', 'מיועד ל־', 'סטטוס', 'מול מי?', 'קו"ח', 'גרפולוגיה', 'התרשמות', 'מצב משפחתי', ''].map(function (h) {
        return U.el('th', { text: h });
      }))),
      U.el('tbody', null, list.map(function (c) {
        var nameCell = U.el('td', { style: 'min-width:170px;' }, [
          U.el('div', { style: 'display:flex;align-items:center;gap:6px;' }, [
            inpText(c, 'name', saveCand, 'שם מלא', 'font-weight:600;width:100%;'),
            convertedBadge(c), sentBadge(c)
          ].filter(Boolean)),
          inpText(c, 'city', saveCand, 'מגורים…', 'width:100%;font-size:12px;color:var(--muted,#6b7884);'),
          inpText(c, 'notes', saveCand, 'הערות…', 'width:100%;font-size:12px;color:var(--muted,#6b7884);')
        ]);
        return U.el('tr', null, [
          nameCell,
          U.el('td', null, inpText(c, 'phone', saveCand, 'טלפון')),
          U.el('td', null, inpList(c, 'target', saveCand, positionTitles(), 'משרה')),
          U.el('td', null, statusSel(c)),
          U.el('td', null, inpList(c, 'interviewer', saveCand, Store.employees().map(Store.empName), 'מראיין')),
          U.el('td', { class: 'center' }, inpCheck(c, 'hasCv', saveCand)),
          U.el('td', { class: 'center' }, inpCheck(c, 'hasGrapho', saveCand)),
          U.el('td', null, inpText(c, 'impression', saveCand, 'התרשמות…')),
          U.el('td', null, inpText(c, 'familyStatus', saveCand, 'רווק/נשוי…', 'max-width:90px;')),
          U.el('td', { style: 'white-space:nowrap;' }, [
            sendBtn(c), ' ',
            U.el('button', { class: 'btn secondary', html: U.ICO.trash, title: 'מחיקה', onclick: function () {
              Modal.confirm({ title: 'מחיקת מועמד', text: 'למחוק את "' + (c.name || '') + '"?', okLabel: 'מחיקה', danger: true },
                function () { Store.deleteCandidate(c.id); App.render(); });
            } })
          ])
        ]);
      }))
    ]);
    host.appendChild(U.el('div', { class: 'tbl-scroll' }, [tbl]));
  }

  function renderCandKanban(host, list) {
    quickAddCand(host);
    var cols = STATUSES.map(function (st) {
      var items = list.filter(function (c) { return (c.status || 'התעניין') === st.key; });
      var body = U.el('div', { class: 'kb-body' });
      body.addEventListener('dragover', function (e) { e.preventDefault(); body.classList.add('kb-over'); });
      body.addEventListener('dragleave', function () { body.classList.remove('kb-over'); });
      body.addEventListener('drop', function (e) {
        e.preventDefault(); body.classList.remove('kb-over');
        var id = e.dataTransfer.getData('text/plain');
        var c = id && Store.candidateById(id);
        if (c && c.status !== st.key) setStatus(c, st.key);
      });
      items.forEach(function (c) {
        // כרטיס Monday: לבן ונקי, הסטטוס בנקודה קטנה — כמו בקנבן המשימות
        var card = U.el('div', { class: 'kb-card', draggable: 'true' });
        card.addEventListener('dragstart', function (e) { e.dataTransfer.setData('text/plain', c.id); card.classList.add('kb-drag'); });
        card.addEventListener('dragend', function () { card.classList.remove('kb-drag'); });
        card.appendChild(U.el('div', { class: 'kb-title' }, [
          U.el('span', { class: 'kb-dot', style: 'background:' + stColor(c.status) + ';', title: c.status || '' }),
          U.el('span', { text: c.name || '' }),
          convertedBadge(c), sentBadge(c),
          U.el('span', { class: 'spacer' }), sendBtn(c)
        ].filter(Boolean)));
        card.appendChild(U.el('div', { style: 'display:flex;flex-wrap:wrap;gap:4px;align-items:center;' }, [
          c.target ? U.el('span', { class: 'tag', text: c.target }) : null,
          c.interviewer ? U.el('span', { class: 'muted', style: 'font-size:12px;', text: '🎤 ' + c.interviewer }) : null,
          c.hasCv ? U.el('span', { title: 'קורות חיים התקבלו', text: '📄', style: 'font-size:12px;' }) : null
        ].filter(Boolean)));
        if (c.impression) card.appendChild(U.el('div', { class: 'muted', style: 'font-size:12px;margin-top:4px;', text: '💬 ' + c.impression }));
        body.appendChild(card);
      });
      if (!items.length) body.appendChild(U.el('div', { class: 'muted', style: 'text-align:center;padding:16px 0;font-size:13px;', text: 'ריק' }));
      return U.el('div', { class: 'kb-col' }, [
        U.el('div', { class: 'kb-head' }, [
          U.el('span', { class: 'kb-hdot', style: 'background:' + st.color + ';' }),
          U.el('span', { class: 'kb-hname', text: st.key }),
          U.el('span', { class: 'kb-count', text: String(items.length) })
        ]),
        body
      ]);
    });
    host.appendChild(U.el('div', { class: 'kb-board' }, cols));
  }

  function kpi(cls, val, label) {
    return U.el('div', { class: 'kpi ' + (cls || 'kpi-neutral') }, [
      U.el('div', { class: 'kpi-ic' }),
      U.el('div', { class: 'kpi-body' }, [
        U.el('div', { class: 'kpi-row' }, U.el('div', { class: 'kpi-val', text: String(val) })),
        U.el('div', { class: 'kpi-lbl', text: label })
      ])
    ]);
  }

  function renderCands(view) {
    var isAdmin = Store.isAdmin();
    var toggle = U.el('div', { class: 'subtabs', style: 'display:inline-flex;margin:0;' }, [
      U.el('button', { class: viewMode === 'kanban' ? 'active' : '', html: U.ICO.board + ' קנבן',
        title: 'תצוגת קנבן', onclick: function () { viewMode = 'kanban'; App.render(); } }),
      U.el('button', { class: viewMode === 'table' ? 'active' : '', html: U.ICO.table + ' טבלה',
        title: 'תצוגת טבלה', onclick: function () { viewMode = 'table'; App.render(); } })
    ]);
    view.appendChild(U.el('div', { class: 'page-head' }, [
      U.el('h2', { text: 'מועמדים' }),
      U.el('span', { class: 'spacer' }),
      toggle,
      isAdmin && U.actionMenu([
        { html: U.XLS_SVG, label: 'ייבוא מועמדים מאקסל', onClick: pickExcelFile }
      ])
    ].filter(Boolean)));

    var list = filteredCands();
    var inProcess = list.filter(function (c) { return c.status === 'התעניין' || c.status === 'הגיע לראיון'; }).length;
    view.appendChild(U.el('div', { class: 'kpi-grid' }, [
      kpi('kpi-neutral', list.length, 'מועמדים'),
      kpi('kpi-info', inProcess, 'בתהליך'),
      kpi('kpi-good', list.filter(function (c) { return c.status === 'התקבל'; }).length, 'התקבלו')
    ]));

    // סינונים: שנה + משרה
    var years = candYears();
    var filters = U.el('div', { style: 'display:flex;gap:6px;align-items:center;margin:0 0 12px;flex-wrap:wrap;' });
    if (years.length > 1) {
      filters.appendChild(U.el('span', { class: 'muted', style: 'font-size:13px;', text: 'שנה:' }));
      years.forEach(function (y) {
        var b = U.el('button', { class: 'tag', style: 'cursor:pointer;' + (yearFilter === y ? 'outline:2px solid var(--brand);' : ''), text: y });
        b.addEventListener('click', function () { yearFilter = yearFilter === y ? '' : y; App.render(); });
        filters.appendChild(b);
      });
    }
    if (targetFilter) {
      filters.appendChild(U.el('span', { class: 'tag', style: 'background:var(--brand-light);', text: '📌 ' + targetFilter + ' ✕', onclick: function () { targetFilter = ''; App.render(); } }));
    }
    if (filters.childNodes.length) view.appendChild(filters);

    var host = U.el('div');
    view.appendChild(host);
    if (viewMode === 'table') renderCandTable(host, list);
    else renderCandKanban(host, list);
  }

  // ---------- מסך משרות ----------
  function quickAddPos(host) {
    var title = U.el('input', { placeholder: '+ משרה חדשה — שם התפקיד ולחיצה על Enter', style: 'flex:2;min-width:200px;font-size:15px;' });
    var scope = U.el('input', { placeholder: 'אחוז משרה (%)', inputmode: 'numeric', style: 'flex:0 0 130px;' });
    var salary = U.el('input', { placeholder: 'שכר מתוקצב (₪)', inputmode: 'numeric', style: 'flex:0 0 150px;' });
    function add() {
      if (!title.value.trim()) { title.focus(); return; }
      Store.upsertPosition({ title: title.value.trim(), scope: scope.value.trim().replace(/%/g, ''), scopePct: true,
        salary: salary.value.trim(), filledBy: '', flyer: '', notes: '' });
      focusAdd = true;
      App.render();
    }
    title.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    host.appendChild(U.el('div', { class: 'card', style: 'padding:10px;margin-bottom:10px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;' },
      [title, scope, salary, U.el('button', { class: 'btn', text: 'הוסף', onclick: add })]));
    if (focusAdd) { focusAdd = false; setTimeout(function () { title.focus(); }, 0); }
  }

  // "מאויש ע"י" — מועמדים שהתקבלו למשרה זו. מועמד שכבר אויש במשרה אחרת
  // מוצג נעול עם שם המשרה, כדי שלא יאויש פעמיים בטעות.
  function filledBySelect(p) {
    var takenElsewhere = {};
    Store.positions().forEach(function (q) {
      if (q.id === p.id) return;
      var v = (q.filledBy || '').trim();
      if (v) takenElsewhere[v] = q.title || 'משרה אחרת';
    });
    var accepted = Store.candidates()
      .filter(function (c) { return c.status === 'התקבל' && (c.target || '') === p.title; })
      .map(function (c) { return c.name; });
    var cur = (p.filledBy || '').trim();
    if (cur && accepted.indexOf(cur) === -1) accepted.push(cur);   // ערך קיים שאינו ברשימה (מייבוא)

    var sel = U.el('select', { style: 'padding:4px 6px;min-width:130px;' },
      [U.el('option', { value: '', text: 'טרם אויש' })].concat(accepted.map(function (n) {
        var taken = takenElsewhere[n];
        return U.el('option', {
          value: n, disabled: taken && n !== cur ? 'disabled' : null,
          text: n + (taken && n !== cur ? '  — מאויש ב"' + taken + '"' : '')
        });
      })));
    sel.value = cur;
    sel.addEventListener('change', function () {
      var v = sel.value.trim();
      if (v && takenElsewhere[v]) {                                 // הגנה כפולה
        U.toast('"' + v + '" כבר מאויש במשרת "' + takenElsewhere[v] + '"', 'error');
        sel.value = cur; return;
      }
      savePos(p, 'filledBy', v);
      App.render();
    });
    return sel;
  }

  // ---------- פלייר: סטטוס + קובץ מצורף ----------
  function flyerCell(p) {
    var wrap = U.el('div', { style: 'display:flex;gap:4px;align-items:center;' });
    var sel = U.el('select', { style: 'padding:4px 6px;' }, FLYER.map(function (f) {
      return U.el('option', { value: f, text: f || '—' });
    }));
    sel.value = p.flyer || '';
    sel.addEventListener('change', function () { savePos(p, 'flyer', sel.value); });
    wrap.appendChild(sel);

    if (p.flyerPath) {
      var view = U.el('button', { class: 'btn secondary small', html: U.ICO.clip, title: p.flyerName || 'צפייה בפלייר' });
      view.addEventListener('click', function () {
        view.disabled = true;
        Store.taskFileUrl(p.flyerPath).then(function (url) {
          view.disabled = false;
          if (url) window.open(url, '_blank');
          else U.toast('לא הצלחתי לפתוח את הקובץ', 'error');
        });
      });
      wrap.appendChild(view);
    }
    var inp = U.el('input', { type: 'file', accept: 'image/*,.pdf', style: 'display:none;' });
    var up = U.el('button', { class: 'btn secondary small', html: U.ICO.upload,
      title: p.flyerPath ? 'החלפת הפלייר' : 'העלאת פלייר' });
    up.addEventListener('click', function () { inp.click(); });
    inp.addEventListener('change', function () {
      var f = inp.files[0];
      if (!f) return;
      up.disabled = true;
      Store.uploadTaskFile(f).then(function (res) {
        p.flyerPath = res.path; p.flyerName = res.name; p.flyer = 'בוצע';
        Store.upsertPosition(p);
        U.toast('הפלייר צורף');
        App.render();
      }).catch(function (e) {
        up.disabled = false;
        U.toast('העלאת הפלייר נכשלה: ' + (e && e.message ? e.message : ''), 'error');
      });
      inp.value = '';
    });
    wrap.appendChild(up);
    wrap.appendChild(inp);
    return wrap;
  }

  // ---------- שדה מספרי עם סיומת קבועה (% / ₪) ----------
  function numField(p, field, suffix, ph, width) {
    var i = U.el('input', { value: p[field] != null ? p[field] : '', placeholder: ph || '',
      inputmode: 'numeric', style: 'width:' + (width || 56) + 'px;text-align:center;' });
    bareStyle(i);
    i.addEventListener('change', function () { savePos(p, field, i.value.trim()); });
    return U.el('span', { class: 'suffix-field' }, [i, U.el('span', { class: 'sfx', text: suffix })]);
  }

  // אחוז משרה: הנתונים הישנים נשמרו כשבר (1 / 0.5) — ממירים פעם אחת לאחוזים
  function migrateScopes() {
    var changed = 0;
    Store.positions().forEach(function (p) {
      if (p.scopePct) return;
      var raw = String(p.scope == null ? '' : p.scope).trim();
      if (/^(0?\.\d+|1(\.0+)?)$/.test(raw)) p.scope = String(Math.round(parseFloat(raw) * 100));
      else p.scope = raw.replace(/%/g, '').trim();
      p.scopePct = true;
      Store.upsertPosition(p);
      changed++;
    });
    return changed;
  }

  // ---------- גרירה לסידור השורות ----------
  var dragPosId = null;
  function applyDrag(tr, p, list) {
    tr.setAttribute('draggable', 'true');
    tr.addEventListener('dragstart', function (e) {
      dragPosId = p.id;
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', p.id); } catch (err) {}
      tr.classList.add('row-drag');
    });
    tr.addEventListener('dragend', function () { dragPosId = null; tr.classList.remove('row-drag'); });
    tr.addEventListener('dragover', function (e) {
      if (!dragPosId || dragPosId === p.id) return;
      e.preventDefault();
      tr.classList.add('row-drop-before');
    });
    tr.addEventListener('dragleave', function () { tr.classList.remove('row-drop-before'); });
    tr.addEventListener('drop', function (e) {
      e.preventDefault();
      tr.classList.remove('row-drop-before');
      if (!dragPosId || dragPosId === p.id) return;
      var ids = list.map(function (x) { return x.id; }).filter(function (id) { return id !== dragPosId; });
      ids.splice(ids.indexOf(p.id), 0, dragPosId);
      Store.reorderPositions(ids);
      dragPosId = null;
      App.render();
    });
  }

  function renderPositions(view) {
    view.appendChild(U.el('div', { class: 'page-head' }, [
      U.el('h2', { text: 'משרות פנויות' }),
      U.el('span', { class: 'spacer' })
    ]));

    migrateScopes();
    var list = Store.positions();
    var open = list.filter(function (p) { return !(p.filledBy || '').trim(); });
    view.appendChild(U.el('div', { class: 'kpi-grid' }, [
      kpi('kpi-neutral', list.length, 'משרות'),
      kpi(open.length ? 'kpi-warn' : 'kpi-good', open.length, 'טרם אוישו'),
      kpi('kpi-good', list.length - open.length, 'אוישו')
    ]));

    var host = U.el('div');
    view.appendChild(host);
    quickAddPos(host);
    if (!list.length) { host.appendChild(U.el('div', { class: 'empty' }, 'אין משרות — הוסיפו למעלה או ייבאו עם המועמדים מאקסל')); return; }

    var tbl = U.el('table', { class: 'grid' }, [
      U.el('thead', null, U.el('tr', null, ['', 'תפקיד', 'אחוז משרה', 'שכר מתוקצב', 'מאויש ע"י', 'פלייר', 'מועמדים', ''].map(function (h) {
        return U.el('th', { text: h });
      }))),
      U.el('tbody', null, list.map(function (p) {
        // סיכום מועמדים למשרה (התאמה לפי שם התפקיד בשדה "מיועד ל־")
        var cands = Store.candidates().filter(function (c) { return (c.target || '') === p.title; });
        var byStatus = {};
        cands.forEach(function (c) { var k = c.status || 'התעניין'; byStatus[k] = (byStatus[k] || 0) + 1; });
        var chips = STATUSES.filter(function (s) { return byStatus[s.key]; }).map(function (s) {
          return U.el('span', { class: 'tag', style: 'margin-inline-end:4px;border-color:' + s.color + ';color:' + s.color + ';', text: s.key + ' ' + byStatus[s.key] });
        });
        var candCell = U.el('td', null, cands.length ? [
          U.el('span', {
            style: 'cursor:pointer;', title: 'הצגת המועמדים למשרה זו',
            onclick: function () { targetFilter = p.title; App.setView('cand'); }
          }, chips)
        ] : [U.el('span', { class: 'muted', text: '—' })]);

        var filled = (p.filledBy || '').trim();
        var tr = U.el('tr', { style: filled ? 'opacity:.65;' : '' }, [
          U.el('td', { style: 'width:28px;' }, U.el('span', { class: 'row-grip', html: U.ICO.grip, title: 'גררו לסידור השורות' })),
          U.el('td', { style: 'min-width:160px;' }, [
            inpText(p, 'title', savePos, 'תפקיד', 'font-weight:600;width:100%;'),
            inpText(p, 'notes', savePos, 'הערות…', 'width:100%;font-size:12px;color:var(--muted,#6b7884);')
          ]),
          U.el('td', null, numField(p, 'scope', '%', '100', 52)),
          U.el('td', null, numField(p, 'salary', '₪', 'שכר', 80)),
          U.el('td', null, filledBySelect(p)),
          U.el('td', null, flyerCell(p)),
          candCell,
          U.el('td', null, U.el('button', { class: 'btn secondary', html: U.ICO.trash, title: 'מחיקה', onclick: function () {
            Modal.confirm({ title: 'מחיקת משרה', text: 'למחוק את המשרה "' + (p.title || '') + '"?', okLabel: 'מחיקה', danger: true },
              function () { Store.deletePosition(p.id); App.render(); });
          } }))
        ]);
        applyDrag(tr, p, list);
        return tr;
      }))
    ]);
    host.appendChild(U.el('div', { class: 'tbl-scroll' }, [tbl]));
  }

  global.CandView = { render: renderCands, MSG_DEFAULTS: MSG_DEFAULTS, SIGN_DEFAULT: SIGN_DEFAULT, MSG_VARS: MSG_VARS };
  global.PosView = { render: renderPositions, importFile: importExcel };
})(window);
