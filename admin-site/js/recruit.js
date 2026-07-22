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

  // ---------- המרת מועמד שהתקבל לעובד ----------
  function offerConversion(c) {
    if (c.convertedEmpId && Store.empById(c.convertedEmpId)) return; // כבר הועבר
    var already = Store.employees(true).filter(function (e) { return Store.empName(e) === (c.name || '').trim(); })[0];
    if (already) return; // קיים במצבת בשם זהה
    Modal.confirm({
      title: '🎉 המועמד התקבל',
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
    if (status === 'התקבל') offerConversion(c);
    App.render();
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
    var name = U.el('input', { placeholder: '➕ מועמד חדש — שם מלא ולחיצה על Enter', style: 'flex:2;min-width:180px;font-size:15px;' });
    var phone = U.el('input', { placeholder: 'טלפון', type: 'tel', style: 'flex:1;min-width:110px;' });
    var target = U.dataListInput('', positionTitles(), 'מיועד ל־');
    target._input.style.flex = '1'; target._input.style.minWidth = '110px';
    function add() {
      if (!name.value.trim()) { name.focus(); return; }
      Store.upsertCandidate({
        name: name.value.trim(), phone: phone.value.trim(), target: target.get(),
        city: '', status: 'התעניין', interviewer: '', hasCv: false, hasGrapho: false,
        impression: '', familyStatus: '', notes: '', year: yearFilter || DEFAULT_YEAR
      });
      focusAdd = true;
      App.render();
    }
    name.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    host.appendChild(U.el('div', { class: 'card', style: 'padding:10px;margin-bottom:10px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;' },
      [name, phone, target, U.el('button', { class: 'btn', text: 'הוסף', onclick: add })]));
    if (focusAdd) { focusAdd = false; setTimeout(function () { name.focus(); }, 0); }
  }

  function statusSel(c) {
    var sel = U.el('select', { style: 'padding:4px 6px;color:' + stColor(c.status) + ';font-weight:600;' },
      STATUSES.map(function (s) { return U.el('option', { value: s.key, text: s.key }); }));
    sel.value = c.status || 'התעניין';
    sel.addEventListener('change', function () { setStatus(c, sel.value); });
    return sel;
  }

  function convertedBadge(c) {
    if (!c.convertedEmpId) return null;
    var emp = Store.empById(c.convertedEmpId);
    if (!emp) return null;
    return U.el('span', {
      class: 'tag', text: '👤 במצבת', title: 'הועבר למצבת העובדים — לחיצה פותחת את הכרטיס',
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
            convertedBadge(c)
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
          U.el('td', null, U.el('button', { class: 'btn secondary', text: '🗑', title: 'מחיקה', onclick: function () {
            Modal.confirm({ title: 'מחיקת מועמד', text: 'למחוק את "' + (c.name || '') + '"?', okLabel: 'מחיקה', danger: true },
              function () { Store.deleteCandidate(c.id); App.render(); });
          } }))
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
        var card = U.el('div', { class: 'kb-card', draggable: 'true', style: 'border-inline-start:4px solid ' + stColor(c.status) + ';' });
        card.addEventListener('dragstart', function (e) { e.dataTransfer.setData('text/plain', c.id); card.classList.add('kb-drag'); });
        card.addEventListener('dragend', function () { card.classList.remove('kb-drag'); });
        card.appendChild(U.el('div', { style: 'display:flex;align-items:center;gap:6px;' }, [
          U.el('span', { style: 'font-weight:600;font-size:14px;', text: c.name || '' }),
          convertedBadge(c)
        ].filter(Boolean)));
        card.appendChild(U.el('div', { style: 'display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin-top:4px;' }, [
          c.target ? U.el('span', { class: 'tag', text: c.target }) : null,
          c.interviewer ? U.el('span', { class: 'muted', style: 'font-size:12px;', text: '🎤 ' + c.interviewer }) : null,
          c.hasCv ? U.el('span', { title: 'קורות חיים התקבלו', text: '📄', style: 'font-size:12px;' }) : null
        ].filter(Boolean)));
        if (c.impression) card.appendChild(U.el('div', { class: 'muted', style: 'font-size:12px;margin-top:4px;', text: '💬 ' + c.impression }));
        body.appendChild(card);
      });
      if (!items.length) body.appendChild(U.el('div', { class: 'muted', style: 'text-align:center;padding:16px 0;font-size:13px;', text: 'ריק' }));
      return U.el('div', { class: 'kb-col' }, [
        U.el('div', { class: 'kb-head', style: 'border-top:3px solid ' + st.color + ';' }, [
          U.el('span', { text: st.key }),
          U.el('span', { class: 'kb-count', text: String(items.length) })
        ]),
        body
      ]);
    });
    host.appendChild(U.el('div', { class: 'kb-board' }, cols));
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

  function renderCands(view) {
    var isAdmin = Store.isAdmin();
    var toggle = U.el('div', { class: 'subtabs', style: 'display:inline-flex;margin:0;' }, [
      U.el('button', { class: viewMode === 'kanban' ? 'active' : '', text: '▤ קנבן', onclick: function () { viewMode = 'kanban'; App.render(); } }),
      U.el('button', { class: viewMode === 'table' ? 'active' : '', text: '☰ טבלה', onclick: function () { viewMode = 'table'; App.render(); } })
    ]);
    view.appendChild(U.el('div', { class: 'page-head' }, [
      U.el('h2', { text: '🎯 מועמדים' }),
      U.el('span', { class: 'spacer' }),
      toggle,
      isAdmin && U.actionMenu([
        { html: U.XLS_SVG, label: 'ייבוא מועמדים מאקסל', onClick: pickExcelFile }
      ])
    ].filter(Boolean)));

    var list = filteredCands();
    var inProcess = list.filter(function (c) { return c.status === 'התעניין' || c.status === 'הגיע לראיון'; }).length;
    view.appendChild(U.el('div', { class: 'kpi-row' }, [
      kpi('🎯', list.length, 'מועמדים'),
      kpi('⏳', inProcess, 'בתהליך'),
      kpi('🎉', list.filter(function (c) { return c.status === 'התקבל'; }).length, 'התקבלו')
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
    var title = U.el('input', { placeholder: '➕ משרה חדשה — שם התפקיד ולחיצה על Enter', style: 'flex:2;min-width:200px;font-size:15px;' });
    var scope = U.el('input', { placeholder: 'אחוז משרה', style: 'flex:0 0 110px;' });
    function add() {
      if (!title.value.trim()) { title.focus(); return; }
      Store.upsertPosition({ title: title.value.trim(), scope: scope.value.trim(), filledBy: '', flyer: '', notes: '' });
      focusAdd = true;
      App.render();
    }
    title.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    host.appendChild(U.el('div', { class: 'card', style: 'padding:10px;margin-bottom:10px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;' },
      [title, scope, U.el('button', { class: 'btn', text: 'הוסף', onclick: add })]));
    if (focusAdd) { focusAdd = false; setTimeout(function () { title.focus(); }, 0); }
  }

  function renderPositions(view) {
    view.appendChild(U.el('div', { class: 'page-head' }, [
      U.el('h2', { text: '📌 משרות פנויות' }),
      U.el('span', { class: 'spacer' })
    ]));

    var list = Store.positions();
    var open = list.filter(function (p) { return !(p.filledBy || '').trim(); });
    view.appendChild(U.el('div', { class: 'kpi-row' }, [
      kpi('📌', list.length, 'משרות'),
      kpi('🕳️', open.length, 'טרם אוישו'),
      kpi('✅', list.length - open.length, 'אוישו')
    ]));

    var host = U.el('div');
    view.appendChild(host);
    quickAddPos(host);
    if (!list.length) { host.appendChild(U.el('div', { class: 'empty' }, 'אין משרות — הוסיפו למעלה או ייבאו עם המועמדים מאקסל')); return; }

    var tbl = U.el('table', { class: 'grid' }, [
      U.el('thead', null, U.el('tr', null, ['תפקיד', 'אחוז משרה', 'מאויש ע"י', 'פלייר', 'מועמדים', ''].map(function (h) {
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

        var flyerSel = U.el('select', { style: 'padding:4px 6px;' }, FLYER.map(function (f) {
          return U.el('option', { value: f, text: f || '—' });
        }));
        flyerSel.value = p.flyer || '';
        flyerSel.addEventListener('change', function () { savePos(p, 'flyer', flyerSel.value); });

        var filled = (p.filledBy || '').trim();
        return U.el('tr', { style: filled ? 'opacity:.65;' : '' }, [
          U.el('td', { style: 'min-width:160px;' }, [
            inpText(p, 'title', savePos, 'תפקיד', 'font-weight:600;width:100%;'),
            inpText(p, 'notes', savePos, 'הערות…', 'width:100%;font-size:12px;color:var(--muted,#6b7884);')
          ]),
          U.el('td', null, inpText(p, 'scope', savePos, '1 / 0.5…', 'max-width:80px;')),
          U.el('td', null, inpList(p, 'filledBy', savePos, Store.employees().map(Store.empName), 'טרם אויש')),
          U.el('td', null, [flyerSel]),
          candCell,
          U.el('td', null, U.el('button', { class: 'btn secondary', text: '🗑', title: 'מחיקה', onclick: function () {
            Modal.confirm({ title: 'מחיקת משרה', text: 'למחוק את המשרה "' + (p.title || '') + '"?', okLabel: 'מחיקה', danger: true },
              function () { Store.deletePosition(p.id); App.render(); });
          } }))
        ]);
      }))
    ]);
    host.appendChild(U.el('div', { class: 'tbl-scroll' }, [tbl]));
  }

  global.CandView = { render: renderCands };
  global.PosView = { render: renderPositions, importFile: importExcel };
})(window);
