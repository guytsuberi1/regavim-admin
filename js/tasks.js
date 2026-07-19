/* tasks.js — גיליון ניהול משימות: טבלה חכמה + קנבן, משימות קבועות שמתחדשות */
(function (global) {
  'use strict';
  var U = global.U;

  var PRIORITIES = [
    { key: 'גבוה', color: '#dc2626' },
    { key: 'בינוני', color: '#d97706' },
    { key: 'נמוך', color: '#64748b' }
  ];
  var STATUSES = [
    { key: 'פתוח', color: '#64748b' },
    { key: 'בתהליך', color: '#2563eb' },
    { key: 'הושלם', color: '#16a34a' }
  ];
  var FREQS = [
    { key: 'weekly', label: 'שבועי' },
    { key: 'monthly', label: 'חודשי' },
    { key: 'quarterly', label: 'רבעוני' },
    { key: 'yearly', label: 'שנתי' }
  ];
  function freqLabel(f) { var x = FREQS.filter(function (q) { return q.key === f; })[0]; return x ? x.label : ''; }
  function prColor(p) { var x = PRIORITIES.filter(function (q) { return q.key === p; })[0]; return x ? x.color : '#64748b'; }
  function stColor(s) { var x = STATUSES.filter(function (q) { return q.key === s; })[0]; return x ? x.color : '#64748b'; }
  function prWeight(p) { return p === 'גבוה' ? 0 : p === 'בינוני' ? 1 : 2; }

  var viewMode = 'table'; // 'table' | 'kanban'
  var filters = { q: '', status: '', domain: '', owner: '', priority: '' };
  var sortBy = 'due';

  // ---------- טופס משימה ----------
  function listInput(value, options, placeholder) {
    var id = 'dl_' + Math.random().toString(36).slice(2, 8);
    var dl = U.el('datalist', { id: id }, options.map(function (o) { return U.el('option', { value: o }); }));
    var inp = U.el('input', { value: value || '', list: id, placeholder: placeholder || '', autocomplete: 'off' });
    var wrap = U.el('div', null, [inp, dl]);
    wrap._input = inp;
    return wrap;
  }
  function sel(value, options) {
    return U.el('select', null, options.map(function (o) {
      return U.el('option', { value: o.key || o, text: o.label || o.key || o });
    }));
  }

  function openModal(task) {
    var s = Store.settings();
    var isNew = !task;
    task = task || { priority: 'בינוני', status: 'פתוח', kind: 'חד פעמי', freq: 'monthly' };
    var domain = listInput(task.domain, s.taskDomains || [], 'בחירה או הקלדה חופשית');
    var desc = U.el('textarea', { rows: 2, placeholder: 'מה צריך לעשות' }, task.desc || '');
    var owner = listInput(task.owner, s.taskOwners || [], 'שם האחראי');
    var priority = sel(task.priority, PRIORITIES); priority.value = task.priority || 'בינוני';
    var status = sel(task.status, STATUSES); status.value = task.status || 'פתוח';
    var due = U.el('input', { type: 'date', value: task.due || '' });
    var kind = sel(task.kind, [{ key: 'חד פעמי' }, { key: 'קבוע' }]); kind.value = task.kind || 'חד פעמי';
    var freq = sel(task.freq, FREQS); freq.value = task.freq || 'monthly';
    var notes = U.el('textarea', { rows: 2, placeholder: 'הערות' }, task.notes || '');
    var err = U.el('div', { class: 'field-err' });

    var freqField = U.el('div', { class: 'field' }, [U.el('label', { text: 'תדירות ההתחדשות' }), freq]);
    function syncFreq() { freqField.style.display = kind.value === 'קבוע' ? '' : 'none'; }
    kind.addEventListener('change', syncFreq); syncFreq();

    function fld(label, node) { return U.el('div', { class: 'field' }, [U.el('label', { text: label }), node]); }
    var body = U.el('div', null, [
      U.el('div', { class: 'row' }, [fld('תחום', domain), fld('באחריות של', owner)]),
      fld('תיאור', desc),
      U.el('div', { class: 'row' }, [fld('עדיפות', priority), fld('סטטוס', status)]),
      U.el('div', { class: 'row' }, [fld('תאריך יעד', due), fld('סוג משימה', kind)]),
      freqField,
      fld('הערות', notes),
      err
    ]);

    var buttons = [
      { label: 'ביטול', class: 'secondary' },
      { label: 'שמירה', onClick: function (close) {
        var d = domain._input.value.trim();
        if (!desc.value.trim()) { err.textContent = 'נדרש תיאור'; desc.focus(); return; }
        task.domain = d;
        task.desc = desc.value.trim();
        task.owner = owner._input.value.trim();
        task.priority = priority.value;
        task.status = status.value;
        task.due = due.value;
        task.kind = kind.value;
        task.freq = kind.value === 'קבוע' ? freq.value : '';
        task.notes = notes.value.trim();
        // הוספת תחום/אחראי חדשים לרשימות ההגדרות
        rememberValue('taskDomains', d);
        rememberValue('taskOwners', task.owner);
        var saved = Store.upsertTask(task);
        close();
        if (saved._renewed) U.toast('המשימה הקבועה חודשה ליעד ' + U.gregLabel(saved.due));
        else U.toast('המשימה נשמרה');
        App.render();
      } }
    ];
    if (!isNew) {
      buttons.splice(1, 0, { label: '🗑 מחיקה', class: 'danger', onClick: function (close) {
        close();
        Modal.confirm({ title: 'מחיקת משימה', text: 'למחוק את המשימה?', okLabel: 'מחיקה', danger: true }, function () {
          Store.deleteTask(task.id); App.render();
        });
      } });
    }
    Modal.open(isNew ? '➕ משימה חדשה' : '✏️ ' + (task.num || 'משימה'), body, buttons);
  }

  // ---------- ייבוא משימות מאקסל ----------
  function toISODate(v) {
    if (v == null || v === '') return '';
    if (v instanceof Date && !isNaN(v)) {
      return v.getFullYear() + '-' + String(v.getMonth() + 1).padStart(2, '0') + '-' + String(v.getDate()).padStart(2, '0');
    }
    if (typeof v === 'number') { // מספר סידורי של אקסל
      var d = new Date(Math.round((v - 25569) * 86400000));
      if (!isNaN(d)) return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
    }
    var s = String(v).trim(); // dd/mm/yy או dd.mm.yy
    var m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/);
    if (m) {
      var yy = m[3].length === 2 ? '20' + m[3] : m[3];
      return yy + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
    }
    return '';
  }

  function importExcel(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var wb = XLSX.read(new Uint8Array(reader.result), { type: 'array', cellDates: true });
        // מעדיפים גיליון בשם "משימות"; אחרת הראשון שיש בו כותרת "מזהה משימה"/"תיאור"
        var sheetName = wb.SheetNames.filter(function (n) { return n.trim() === 'משימות'; })[0];
        var rows;
        function readSheet(n) { return XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '' }); }
        function headRow(rws) {
          for (var i = 0; i < Math.min(rws.length, 6); i++) {
            var joined = rws[i].map(function (c) { return String(c); }).join('|');
            if (joined.indexOf('תיאור') !== -1 || joined.indexOf('מזהה משימה') !== -1) return i;
          }
          return -1;
        }
        if (sheetName) rows = readSheet(sheetName);
        else {
          wb.SheetNames.forEach(function (n) { var r = readSheet(n); if (headRow(r) !== -1 && (!rows || r.length > rows.length)) rows = r; });
        }
        if (!rows || !rows.length) { U.toast('לא נמצא גיליון משימות מתאים', 'error'); return; }
        var hi = headRow(rows);
        if (hi === -1) { U.toast('לא נמצאה שורת כותרת (תיאור/מזהה משימה)', 'error'); return; }
        var cols = {};
        rows[hi].forEach(function (h, c) {
          h = String(h).trim();
          if (h.indexOf('מזהה') !== -1) cols.num = c;
          else if (h === 'תחום' || h === 'ק"ק') cols.domain = c;
          else if (h.indexOf('תיאור') !== -1) cols.desc = c;
          else if (h.indexOf('באחריות') !== -1) cols.owner = c;
          else if (h.indexOf('עדיפות') !== -1) cols.priority = c;
          else if (h.indexOf('סטטוס') !== -1) cols.status = c;
          else if (h.indexOf('תאריך יעד') !== -1) cols.due = c;
          else if (h.indexOf('הערות') !== -1) cols.notes = c;
          else if (h.indexOf('סוג') !== -1) cols.kind = c;
        });
        if (cols.desc == null) { U.toast('לא נמצאה עמודת "תיאור"', 'error'); return; }
        var cell = function (row, key) { return cols[key] != null ? row[cols[key]] : ''; };
        var validStatus = { 'פתוח': 1, 'בתהליך': 1, 'הושלם': 1 };
        var validPr = { 'גבוה': 1, 'בינוני': 1, 'נמוך': 1 };
        // מניעת ייבוא כפול — מזהים קיימים
        var existingNums = {};
        Store.tasksAll().forEach(function (t) { if (t.num) existingNums[t.num] = 1; });
        var out = [], dup = 0;
        for (var r = hi + 1; r < rows.length; r++) {
          var desc = String(cell(rows[r], 'desc') || '').trim();
          if (!desc) continue; // מדלגים על שורות ריקות שכבר ממוספרות
          var num = String(cell(rows[r], 'num') || '').trim();
          if (num && existingNums[num]) { dup++; continue; }
          var status = String(cell(rows[r], 'status') || '').trim();
          var pr = String(cell(rows[r], 'priority') || '').trim();
          var kind = String(cell(rows[r], 'kind') || '').trim();
          var domain = String(cell(rows[r], 'domain') || '').trim();
          var owner = String(cell(rows[r], 'owner') || '').trim();
          out.push({
            num: num,
            domain: domain,
            desc: desc,
            owner: owner,
            priority: validPr[pr] ? pr : 'בינוני',
            status: validStatus[status] ? status : 'פתוח',
            due: toISODate(cell(rows[r], 'due')),
            notes: String(cell(rows[r], 'notes') || '').trim(),
            kind: kind === 'קבוע' ? 'קבוע' : 'חד פעמי',
            freq: kind === 'קבוע' ? 'monthly' : ''
          });
          rememberValue('taskDomains', domain);
          rememberValue('taskOwners', owner);
        }
        if (!out.length) { U.toast(dup ? 'כל המשימות כבר קיימות (' + dup + ' דילוגים)' : 'לא נמצאו משימות לייבוא', dup ? 'info' : 'error'); return; }
        Store.addTasksBulk(out);
        U.toast('יובאו ' + out.length + ' משימות' + (dup ? ' · ' + dup + ' דילוגים (קיימות)' : ''));
        App.render();
      } catch (e) {
        console.error(e);
        U.toast('שגיאה בקריאת הקובץ: ' + e.message, 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function pickExcel() {
    var inp = U.el('input', { type: 'file', accept: '.xlsx,.xls', style: 'display:none;' });
    inp.addEventListener('change', function () { if (inp.files[0]) importExcel(inp.files[0]); });
    document.body.appendChild(inp);
    inp.click();
    setTimeout(function () { document.body.removeChild(inp); }, 500);
  }

  function rememberValue(key, val) {
    val = (val || '').trim();
    if (!val) return;
    var s = Store.settings();
    if (!s[key]) s[key] = [];
    if (s[key].indexOf(val) === -1 && val !== 'אחר') { s[key].push(val); Store.saveSettings(); }
  }

  // ---------- סינון ומיון ----------
  function applyFilters(list) {
    var q = filters.q.trim();
    return list.filter(function (t) {
      if (filters.status && t.status !== filters.status) return false;
      if (filters.domain && t.domain !== filters.domain) return false;
      if (filters.owner && t.owner !== filters.owner) return false;
      if (filters.priority && t.priority !== filters.priority) return false;
      if (q && (String(t.desc || '') + ' ' + String(t.notes || '') + ' ' + String(t.domain || '') + ' ' + String(t.owner || '')).indexOf(q) === -1) return false;
      return true;
    });
  }
  function sortTasks(list) {
    var arr = list.slice();
    arr.sort(function (a, b) {
      if (sortBy === 'priority') return prWeight(a.priority) - prWeight(b.priority) || dueCmp(a, b);
      if (sortBy === 'domain') return String(a.domain || '').localeCompare(String(b.domain || ''), 'he') || dueCmp(a, b);
      if (sortBy === 'owner') return String(a.owner || '').localeCompare(String(b.owner || ''), 'he') || dueCmp(a, b);
      return dueCmp(a, b); // ברירת מחדל — לפי יעד
    });
    return arr;
  }
  function dueCmp(a, b) {
    var da = a.due || '9999-99-99', db = b.due || '9999-99-99';
    return da.localeCompare(db);
  }

  // ---------- רכיבים ----------
  function daysBadge(t) {
    var d = Store.daysToDue(t.due);
    if (d == null) return null;
    var overdue = d < 0 && t.status !== 'הושלם';
    var txt = d < 0 ? 'באיחור ' + (-d) + ' י׳' : (d === 0 ? 'היום' : 'בעוד ' + d + ' י׳');
    return U.el('span', { class: 'tag', style: 'font-size:11px;' + (overdue ? 'background:#fee2e2;color:#991b1b;' : d <= 3 ? 'background:#fef3c7;color:#92400e;' : '') , text: txt });
  }
  function priorityDot(p) {
    return U.el('span', { title: 'עדיפות ' + p, style: 'display:inline-block;width:10px;height:10px;border-radius:50%;background:' + prColor(p) + ';margin-inline-end:6px;' });
  }
  function domainChip(d) {
    if (!d) return null;
    return U.el('span', { class: 'tag', style: 'font-size:11px;', text: d });
  }

  // ---------- טבלה ----------
  function renderTable(host, list) {
    if (!list.length) { host.appendChild(U.el('div', { class: 'empty' }, 'אין משימות שתואמות לסינון')); return; }
    var tbl = U.el('table', { class: 'grid' }, [
      U.el('thead', null, U.el('tr', null, ['#', 'תחום', 'תיאור', 'אחראי', 'עדיפות', 'סטטוס', 'יעד', 'ימים', 'סוג', ''].map(function (h) { return U.el('th', { text: h }); }))),
      U.el('tbody', null, list.map(function (t) {
        var overdue = (Store.daysToDue(t.due) != null && Store.daysToDue(t.due) < 0 && t.status !== 'הושלם');
        var stSel = U.el('select', { style: 'border-color:' + stColor(t.status) + ';min-width:96px;' },
          STATUSES.map(function (x) { return U.el('option', { value: x.key, text: x.key }); }));
        stSel.value = t.status;
        stSel.addEventListener('change', function () {
          var r = Store.setTaskStatus(t.id, stSel.value);
          if (r && r._renewed) U.toast('המשימה הקבועה חודשה ליעד ' + U.gregLabel(r.due));
          App.render();
        });
        return U.el('tr', { style: overdue ? 'background:#fef2f2;' : '' }, [
          U.el('td', { style: 'white-space:nowrap;color:#94a3b8;font-size:12px;', text: t.num || '' }),
          U.el('td', null, domainChip(t.domain)),
          U.el('td', null, [
            U.el('div', { style: 'display:flex;align-items:center;' }, [priorityDot(t.priority), U.el('span', { text: t.desc || '' })]),
            t.notes ? U.el('div', { class: 'muted', style: 'font-size:12px;', text: t.notes }) : null,
            t.kind === 'קבוע' && t.lastDoneAt ? U.el('div', { class: 'muted', style: 'font-size:11px;', text: 'בוצע לאחרונה: ' + new Date(t.lastDoneAt).toLocaleDateString('he-IL') }) : null
          ]),
          U.el('td', { text: t.owner || '' }),
          U.el('td', { text: t.priority || '' }),
          U.el('td', null, stSel),
          U.el('td', { style: 'white-space:nowrap;', text: t.due ? U.gregLabel(t.due) : '' }),
          U.el('td', null, daysBadge(t)),
          U.el('td', { style: 'white-space:nowrap;font-size:12px;', text: t.kind === 'קבוע' ? '🔁 ' + freqLabel(t.freq) : 'חד פעמי' }),
          U.el('td', null, U.el('button', { class: 'btn secondary', text: '✏️', title: 'עריכה', onclick: function () { openModal(JSON.parse(JSON.stringify(t))); } }))
        ]);
      }))
    ]);
    host.appendChild(U.el('div', { class: 'tbl-scroll' }, [tbl]));
  }

  // ---------- קנבן ----------
  function renderKanban(host, list) {
    var cols = STATUSES.map(function (st) {
      var items = list.filter(function (t) { return t.status === st.key; });
      var body = U.el('div', { class: 'kb-body', 'data-status': st.key });
      body.addEventListener('dragover', function (e) { e.preventDefault(); body.classList.add('kb-over'); });
      body.addEventListener('dragleave', function () { body.classList.remove('kb-over'); });
      body.addEventListener('drop', function (e) {
        e.preventDefault(); body.classList.remove('kb-over');
        var id = e.dataTransfer.getData('text/plain');
        if (!id) return;
        var r = Store.setTaskStatus(id, st.key);
        if (r && r._renewed) U.toast('המשימה הקבועה חודשה ליעד ' + U.gregLabel(r.due));
        App.render();
      });
      items.forEach(function (t) {
        var overdue = (Store.daysToDue(t.due) != null && Store.daysToDue(t.due) < 0 && t.status !== 'הושלם');
        var card = U.el('div', { class: 'kb-card', draggable: 'true', style: 'border-inline-start:4px solid ' + prColor(t.priority) + ';' + (overdue ? 'background:#fef2f2;' : '') });
        card.addEventListener('dragstart', function (e) { e.dataTransfer.setData('text/plain', t.id); card.classList.add('kb-drag'); });
        card.addEventListener('dragend', function () { card.classList.remove('kb-drag'); });
        card.appendChild(U.el('div', { style: 'font-weight:600;font-size:14px;margin-bottom:4px;', text: t.desc || '' }));
        var meta = U.el('div', { style: 'display:flex;flex-wrap:wrap;gap:4px;align-items:center;' }, [
          domainChip(t.domain),
          t.owner ? U.el('span', { class: 'muted', style: 'font-size:12px;', text: '👤 ' + t.owner }) : null,
          daysBadge(t),
          t.kind === 'קבוע' ? U.el('span', { title: 'קבועה · ' + freqLabel(t.freq), text: '🔁', style: 'font-size:12px;' }) : null
        ].filter(Boolean));
        card.appendChild(meta);
        card.addEventListener('click', function (e) { if (!card.classList.contains('kb-drag')) openModal(JSON.parse(JSON.stringify(t))); });
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

  // ---------- רינדור ----------
  function render(view) {
    var all = Store.tasksAll();
    var s = Store.settings();

    var addBtn = U.el('button', { class: 'btn', text: '➕ משימה חדשה', onclick: function () { openModal(null); } });
    var toggle = U.el('div', { class: 'subtabs', style: 'display:inline-flex;margin:0;' }, [
      U.el('button', { class: viewMode === 'table' ? 'active' : '', text: '☰ טבלה', onclick: function () { viewMode = 'table'; App.render(); } }),
      U.el('button', { class: viewMode === 'kanban' ? 'active' : '', text: '▤ קנבן', onclick: function () { viewMode = 'kanban'; App.render(); } })
    ]);
    var importBtn = U.el('button', { class: 'btn secondary', html: U.XLS_SVG + ' ייבוא מאקסל', onclick: pickExcel });
    view.appendChild(U.el('div', { class: 'page-head' }, [
      U.el('h2', { text: '✅ ניהול משימות' }),
      U.el('span', { class: 'spacer' }),
      toggle, importBtn, addBtn
    ]));

    // סיכום
    var open = all.filter(function (t) { return t.status === 'פתוח'; }).length;
    var prog = all.filter(function (t) { return t.status === 'בתהליך'; }).length;
    var overdue = all.filter(function (t) { return t.status !== 'הושלם' && Store.daysToDue(t.due) != null && Store.daysToDue(t.due) < 0; }).length;
    view.appendChild(U.el('div', { class: 'kpi-row' }, [
      kpi('📂', open, 'פתוחות', 'kpi-neutral'),
      kpi('⏳', prog, 'בתהליך', 'kpi-info'),
      kpi('⚠️', overdue, 'באיחור', overdue ? 'kpi-warn' : 'kpi-neutral')
    ]));

    // סרגל סינון
    var q = U.el('input', { value: filters.q, placeholder: '🔍 חיפוש…', style: 'max-width:200px;' });
    q.addEventListener('input', function () { filters.q = q.value; refresh(); });
    function filterSel(cur, opts, label, key) {
      var sl = U.el('select', null, [U.el('option', { value: '', text: label })].concat(opts.map(function (o) { return U.el('option', { value: o, text: o }); })));
      sl.value = cur;
      sl.addEventListener('change', function () { filters[key] = sl.value; refresh(); });
      return sl;
    }
    var sortSel = U.el('select', null, [
      U.el('option', { value: 'due', text: 'מיון: יעד' }),
      U.el('option', { value: 'priority', text: 'מיון: עדיפות' }),
      U.el('option', { value: 'domain', text: 'מיון: תחום' }),
      U.el('option', { value: 'owner', text: 'מיון: אחראי' })
    ]);
    sortSel.value = sortBy;
    sortSel.addEventListener('change', function () { sortBy = sortSel.value; refresh(); });
    var bar = U.el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin:10px 0;align-items:center;' }, [
      q,
      filterSel(filters.status, STATUSES.map(function (x) { return x.key; }), 'כל הסטטוסים', 'status'),
      filterSel(filters.domain, s.taskDomains || [], 'כל התחומים', 'domain'),
      filterSel(filters.owner, s.taskOwners || [], 'כל האחראים', 'owner'),
      filterSel(filters.priority, PRIORITIES.map(function (x) { return x.key; }), 'כל העדיפויות', 'priority'),
      viewMode === 'table' ? sortSel : null
    ].filter(Boolean));
    view.appendChild(bar);

    var host = U.el('div');
    view.appendChild(host);

    function refresh() {
      U.clear(host);
      var list = sortTasks(applyFilters(all));
      if (!all.length) {
        host.appendChild(U.el('div', { class: 'empty' }, [
          'אין עדיין משימות.',
          U.el('div', { class: 'muted', style: 'margin-top:6px;' }, 'לחצו "➕ משימה חדשה" כדי להתחיל.')
        ]));
        return;
      }
      if (viewMode === 'kanban') renderKanban(host, list);
      else renderTable(host, list);
    }
    refresh();
  }

  function kpi(icon, val, label, cls) {
    return U.el('div', { class: 'kpi ' + (cls || 'kpi-neutral') }, [
      U.el('span', { class: 'kpi-ic', text: icon }),
      U.el('div', { class: 'kpi-body' }, [
        U.el('div', { class: 'kpi-val', text: String(val) }),
        U.el('div', { class: 'kpi-lbl', text: label })
      ])
    ]);
  }

  global.TasksView = { render: render };
})(window);
