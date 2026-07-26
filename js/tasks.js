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
  var filters = { q: '', status: '', domain: '', owner: '', priority: '', due: '' };
  var sortBy = 'due';

  // ---------- צבעי תגיות (תחום/אחראי) — צבע קבוע ועקבי לפי הטקסט ----------
  var CHIP_COLORS = [
    ['#fee2e2', '#991b1b'], ['#ffedd5', '#9a3412'], ['#fef3c7', '#92400e'],
    ['#ecfccb', '#3f6212'], ['#dcfce7', '#166534'], ['#cffafe', '#155e75'],
    ['#dbeafe', '#1e40af'], ['#ede9fe', '#5b21b6'], ['#fce7f3', '#9d174d'],
    ['#e2e8f0', '#334155']
  ];
  function chipColor(str) {
    var h = 0;
    str = String(str || '');
    for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 997;
    return CHIP_COLORS[h % CHIP_COLORS.length];
  }
  function colorChip(text, prefix, extra) {
    if (!text) return null;
    var c = chipColor(text);
    return U.el('span', {
      class: 'tag',
      style: 'font-size:12px;font-weight:600;background:' + c[0] + ';color:' + c[1] + ';border-color:' + c[1] + '44;' + (extra || ''),
      text: (prefix || '') + text
    });
  }
  // תגית רגילה (בלי צבע מיוחד) — לתחום
  function plainChip(text, extra) {
    if (!text) return null;
    return U.el('span', { class: 'tag', style: 'font-size:12px;' + (extra || ''), text: text });
  }

  // ---------- סינון לפי יעד: דליים ----------
  function endOfWeekISO() { // שבת של השבוע הנוכחי (א׳–ש׳)
    var d = new Date();
    return U.addDays(U.toISO(d), 6 - d.getDay());
  }
  function dueBucket(t) {
    if (!t.due) return 'none';
    var d = Store.daysToDue(t.due);
    if (d < 0) return 'overdue';
    if (t.due <= endOfWeekISO()) return 'week';
    return 'ahead';
  }

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
      if (filters.due && dueBucket(t) !== filters.due) return false;
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

  // ---------- טבלה עם עריכה ישירה ----------
  var focusAddDesc = false; // בקשה למקד את שדה ההוספה אחרי רינדור

  // עוזרי-עריכה: שמירה שקטה (בלי רינדור) לתאים שאינם משנים סינון/מיון
  function saveField(t, field, val) { t[field] = val; Store.upsertTask(t); }
  function inpText(t, field, ph, style) {
    var i = U.el('input', { value: t[field] || '', placeholder: ph || '', style: (style || '') + 'border:1px solid transparent;background:transparent;padding:4px 6px;', autocomplete: 'off' });
    i.addEventListener('focus', function () { i.style.background = 'var(--card,#fff)'; i.style.borderColor = 'var(--border,#d6dce1)'; });
    i.addEventListener('blur', function () { i.style.background = 'transparent'; i.style.borderColor = 'transparent'; });
    i.addEventListener('change', function () { saveField(t, field, i.value.trim()); });
    return i;
  }
  function inpList(t, field, options, ph) {
    var w = U.dataListInput(t[field] || '', options, ph || '');
    w._input.style.cssText = 'border:1px solid transparent;background:transparent;padding:4px 6px;min-width:90px;';
    w._input.addEventListener('focus', function () { w._input.style.background = 'var(--card,#fff)'; w._input.style.borderColor = 'var(--border,#d6dce1)'; });
    w._input.addEventListener('blur', function () { w._input.style.background = 'transparent'; w._input.style.borderColor = 'transparent'; });
    w._input.addEventListener('change', function () { saveField(t, field, w.get()); rememberValue(field === 'domain' ? 'taskDomains' : 'taskOwners', w.get()); });
    return w;
  }
  // תיאור/הערות — textarea שנשבר לשורות ומתרחב לפי התוכן (רואים הכל גם במסך צר)
  function areaText(t, field, ph, style) {
    var a = U.el('textarea', { rows: 1, placeholder: ph || '' });
    a.value = t[field] || '';
    a.style.cssText = (style || '') + 'width:100%;resize:none;overflow:hidden;border:1px solid transparent;background:transparent;padding:4px 6px;font-family:inherit;line-height:1.4;';
    function fit() { a.style.height = 'auto'; a.style.height = a.scrollHeight + 'px'; }
    a.addEventListener('focus', function () { a.style.background = 'var(--card,#fff)'; a.style.borderColor = 'var(--border,#d6dce1)'; });
    a.addEventListener('blur', function () { a.style.background = 'transparent'; a.style.borderColor = 'transparent'; });
    a.addEventListener('input', fit);
    a.addEventListener('change', function () { saveField(t, field, a.value.trim()); });
    setTimeout(fit, 0);
    return a;
  }
  // תגית שנפתחת לעריכה בלחיצה (תחום/אחראי). colored — צבע לפי השם (לאחראי בלבד)
  function chipEdit(t, field, options, ph, prefix, colored) {
    var wrap = U.el('span', { style: 'display:inline-block;' });
    function show() {
      U.clear(wrap);
      var val = t[field];
      if (val) {
        var chip = colored ? colorChip(val, prefix, 'cursor:pointer;') : plainChip(val, 'cursor:pointer;');
        chip.title = 'לחיצה לעריכה';
        chip.addEventListener('click', edit);
        wrap.appendChild(chip);
      } else {
        wrap.appendChild(U.el('button', {
          class: 'tag', text: '+ ' + ph, onclick: edit,
          style: 'cursor:pointer;font-size:12px;color:var(--muted,#6b7884);border-style:dashed;background:transparent;'
        }));
      }
    }
    function edit() {
      U.clear(wrap);
      var w = U.dataListInput(t[field] || '', options, ph);
      w._input.style.minWidth = '110px';
      wrap.appendChild(w);
      w._input.focus();
      var done = false;
      function commit() {
        if (done) return;
        done = true;
        saveField(t, field, w.get());
        rememberValue(field === 'domain' ? 'taskDomains' : 'taskOwners', w.get());
        show();
      }
      w._input.addEventListener('change', commit);
      w._input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); commit(); } });
      w._input.addEventListener('blur', function () { setTimeout(commit, 120); });
    }
    show();
    return wrap;
  }
  function selField(t, field, opts, onChangeRerender) {
    var sel = U.el('select', { style: 'padding:4px 6px;' }, opts.map(function (o) { return U.el('option', { value: o.key || o, text: o.label || o.key || o }); }));
    sel.value = t[field] || (opts[0].key || opts[0]);
    sel.addEventListener('change', function () {
      if (field === 'status') {
        var r = Store.setTaskStatus(t.id, sel.value);
        if (r && r._renewed) U.toast('המשימה הקבועה חודשה ליעד ' + U.gregLabel(r.due));
        App.render();
        return;
      }
      saveField(t, field, sel.value);
      if (onChangeRerender) App.render();
    });
    return sel;
  }

  function quickAddRow(host) {
    var s = Store.settings();
    var draft = { priority: 'בינוני', status: 'פתוח', kind: 'חד פעמי', freq: 'monthly' };
    var desc = U.el('input', { placeholder: '➕ משימה חדשה — כתוב תיאור ולחץ Enter', style: 'flex:2;min-width:180px;font-size:15px;' });
    var domain = U.dataListInput('', s.taskDomains || [], 'תחום'); domain._input.style.flex = '1'; domain._input.style.minWidth = '90px';
    var owner = U.dataListInput('', s.taskOwners || [], 'אחראי'); owner._input.style.flex = '1'; owner._input.style.minWidth = '90px';
    var priority = U.el('select', null, PRIORITIES.map(function (p) { return U.el('option', { value: p.key, text: p.key }); })); priority.value = 'בינוני';
    var due = U.el('input', { type: 'date', style: 'max-width:150px;' });
    function add() {
      if (!desc.value.trim()) { desc.focus(); return; }
      Store.upsertTask({ desc: desc.value.trim(), domain: domain.get(), owner: owner.get(),
        priority: priority.value, status: 'פתוח', due: due.value, notes: '', kind: 'חד פעמי', freq: '' });
      rememberValue('taskDomains', domain.get());
      rememberValue('taskOwners', owner.get());
      focusAddDesc = true;
      App.render();
    }
    desc.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    var addBtn = U.el('button', { class: 'btn', text: 'הוסף', onclick: add });
    var card = U.el('div', { class: 'card', style: 'padding:10px;margin-bottom:10px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;' },
      [desc, domain, owner, priority, due, addBtn]);
    host.appendChild(card);
    if (focusAddDesc) { focusAddDesc = false; setTimeout(function () { desc.focus(); }, 0); }
  }

  // ---------- עמודות מותאמות (סגנון Monday) ----------
  var COL_TYPES = [
    { key: 'text', label: '📝 טקסט' },
    { key: 'number', label: '🔢 מספר' },
    { key: 'date', label: '📅 תאריך' },
    { key: 'label', label: '🏷️ תווית צבעונית' },
    { key: 'check', label: '✔️ צ׳ק-בוקס' },
    { key: 'link', label: '🔗 קישור' },
    { key: 'file', label: '📎 קובץ / מסמך' }
  ];
  function taskColumns() { return Store.settings().taskColumns || []; }
  function customVal(t, colId) { return (t.custom && t.custom[colId] != null) ? t.custom[colId] : ''; }
  function saveCustom(t, colId, val) {
    if (!t.custom) t.custom = {};
    if (val === '' || val == null) delete t.custom[colId]; else t.custom[colId] = val;
    Store.upsertTask(t);
  }
  function transpInput(inp) {
    inp.style.cssText += 'border:1px solid transparent;background:transparent;padding:4px 6px;';
    inp.addEventListener('focus', function () { inp.style.background = 'var(--card,#fff)'; inp.style.borderColor = 'var(--border,#d6dce1)'; });
    inp.addEventListener('blur', function () { inp.style.background = 'transparent'; inp.style.borderColor = 'transparent'; });
    return inp;
  }
  function customCell(t, col) {
    var val = customVal(t, col.id);
    if (col.type === 'check') {
      var cb = U.el('input', { type: 'checkbox' }); cb.checked = !!val;
      cb.addEventListener('change', function () { saveCustom(t, col.id, cb.checked ? true : ''); });
      return cb;
    }
    if (col.type === 'label') {
      var opts = col.options || [];
      var sel = U.el('select', { style: 'padding:4px 8px;border-radius:6px;border:1px solid var(--border,#d6dce1);' },
        [U.el('option', { value: '', text: '—' })].concat(opts.map(function (o) { return U.el('option', { value: o.value, text: o.value }); })));
      sel.value = val || '';
      function paint() {
        var o = opts.filter(function (x) { return x.value === sel.value; })[0];
        if (o) { sel.style.background = o.color; sel.style.color = o.textColor || '#333'; sel.style.fontWeight = '600'; }
        else { sel.style.background = ''; sel.style.color = ''; sel.style.fontWeight = ''; }
      }
      paint();
      sel.addEventListener('change', function () { saveCustom(t, col.id, sel.value); paint(); });
      return sel;
    }
    if (col.type === 'date') {
      var di = transpInput(U.el('input', { type: 'date', value: val || '' }));
      di.addEventListener('change', function () { saveCustom(t, col.id, di.value); });
      return di;
    }
    if (col.type === 'file') {
      var fwrap = U.el('span', { style: 'display:inline-flex;align-items:center;gap:6px;' });
      var drawFile = function () {
        U.clear(fwrap);
        var v = customVal(t, col.id);
        if (v && v.path) {
          var link = U.el('a', { href: '#', text: '📎 ' + (v.name || 'קובץ'), title: v.name || 'קובץ', style: 'cursor:pointer;font-size:13px;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block;vertical-align:middle;' });
          link.addEventListener('click', function (e) { e.preventDefault(); Store.taskFileUrl(v.path).then(function (url) { if (url) global.open(url, '_blank'); else U.toast('הקישור אינו זמין', 'error'); }); });
          var rm = U.el('button', { class: 'btn secondary', text: '×', title: 'הסרת הקובץ', style: 'padding:0 7px;', onclick: function () { Store.deleteTaskFile(v.path); saveCustom(t, col.id, ''); drawFile(); } });
          fwrap.appendChild(link); fwrap.appendChild(rm);
        } else {
          var finp = U.el('input', { type: 'file', style: 'display:none;' });
          finp.addEventListener('change', function () {
            var f = finp.files[0]; if (!f) return;
            U.toast('מעלה…', 'info');
            Store.uploadTaskFile(f).then(function (res) { saveCustom(t, col.id, res); drawFile(); U.toast('הקובץ הועלה'); })
              .catch(function (e) { U.toast('העלאה נכשלה: ' + e.message, 'error'); });
          });
          fwrap.appendChild(U.el('button', { class: 'btn secondary', text: '📎 העלאה', style: 'font-size:12px;padding:2px 8px;', onclick: function () { finp.click(); } }));
          fwrap.appendChild(finp);
        }
      };
      drawFile();
      return fwrap;
    }
    if (col.type === 'link') {
      var wrap = U.el('span', { style: 'display:inline-flex;align-items:center;gap:4px;' });
      var li = transpInput(U.el('input', { value: val || '', placeholder: 'https://…', style: 'min-width:110px;' }));
      li.addEventListener('change', function () { saveCustom(t, col.id, li.value.trim()); });
      wrap.appendChild(li);
      if (val) wrap.appendChild(U.el('a', { href: val, target: '_blank', rel: 'noopener', text: '↗', title: 'פתיחה', style: 'text-decoration:none;font-size:15px;' }));
      return wrap;
    }
    var inp = transpInput(U.el('input', { value: val || '', type: col.type === 'number' ? 'number' : 'text', style: 'min-width:80px;' }));
    inp.addEventListener('change', function () { saveCustom(t, col.id, col.type === 'number' ? (inp.value === '' ? '' : U.num(inp.value)) : inp.value.trim()); });
    return inp;
  }
  function openColumnModal(col) {
    var isNew = !col;
    col = col ? JSON.parse(JSON.stringify(col)) : { id: 'c_' + Store.uid(), name: '', type: 'text', options: [] };
    var name = U.el('input', { value: col.name || '', placeholder: 'שם העמודה (למשל: מסמך, קטגוריה)' });
    var type = U.el('select', null, COL_TYPES.map(function (c) { return U.el('option', { value: c.key, text: c.label }); })); type.value = col.type || 'text';
    var err = U.el('div', { class: 'field-err' });
    var optWrap = U.el('div');
    function drawOpts() {
      U.clear(optWrap);
      (col.options || []).forEach(function (o, i) {
        var v = U.el('input', { value: o.value || '', placeholder: 'ערך', style: 'flex:1;' });
        v.addEventListener('change', function () { o.value = v.value.trim(); });
        var sw = U.el('span', { style: 'width:22px;height:22px;border-radius:5px;flex:0 0 auto;background:' + (o.color || '#e2e8f0') + ';border:1px solid #0002;' });
        var del = U.el('button', { class: 'btn secondary', text: '🗑', onclick: function () { col.options.splice(i, 1); drawOpts(); } });
        optWrap.appendChild(U.el('div', { style: 'display:flex;gap:6px;align-items:center;margin-bottom:6px;' }, [sw, v, del]));
      });
      var addv = U.el('input', { placeholder: '➕ ערך חדש ולחץ Enter', style: 'flex:1;' });
      function addOpt() { var x = addv.value.trim(); if (!x) return; if (!col.options) col.options = []; var c = CHIP_COLORS[col.options.length % CHIP_COLORS.length]; col.options.push({ value: x, color: c[0], textColor: c[1] }); addv.value = ''; drawOpts(); }
      addv.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addOpt(); } });
      optWrap.appendChild(U.el('div', { style: 'display:flex;gap:6px;' }, [addv, U.el('button', { class: 'btn secondary', text: 'הוסף', onclick: addOpt })]));
    }
    var optField = U.el('div', { class: 'field' }, [U.el('label', { text: 'ערכי התווית' }), optWrap]);
    function syncType() { optField.style.display = type.value === 'label' ? '' : 'none'; drawOpts(); }
    type.addEventListener('change', syncType); syncType();
    function fld(l, n) { return U.el('div', { class: 'field' }, [U.el('label', { text: l }), n]); }
    var body = U.el('div', null, [fld('שם העמודה', name), fld('סוג', type), optField, err]);
    var buttons = [
      { label: 'ביטול', class: 'secondary' },
      { label: 'שמירה', onClick: function (close) {
        if (!name.value.trim()) { err.textContent = 'נדרש שם עמודה'; return; }
        col.name = name.value.trim(); col.type = type.value;
        if (col.type !== 'label') delete col.options;
        var s = Store.settings(); if (!s.taskColumns) s.taskColumns = [];
        var idx = s.taskColumns.map(function (x) { return x.id; }).indexOf(col.id);
        if (idx >= 0) s.taskColumns[idx] = col; else s.taskColumns.push(col);
        Store.saveSettings(); close(); App.render();
      } }
    ];
    if (!isNew) {
      buttons.splice(1, 0, { label: '🗑 מחיקת עמודה', class: 'danger', onClick: function (close) {
        close();
        Modal.confirm({ title: 'מחיקת עמודה', text: 'למחוק את העמודה "' + (col.name || '') + '"? הנתונים בעמודה יוסרו מהתצוגה.', okLabel: 'מחיקה', danger: true }, function () {
          var s = Store.settings(); var idx = (s.taskColumns || []).map(function (x) { return x.id; }).indexOf(col.id);
          if (idx >= 0) s.taskColumns.splice(idx, 1); Store.saveSettings(); App.render();
        });
      } });
    }
    Modal.open(isNew ? '➕ עמודה חדשה' : '✏️ עמודה: ' + (col.name || ''), body, buttons);
  }

  function renderTable(host, list) {
    quickAddRow(host);
    if (!list.length) { host.appendChild(U.el('div', { class: 'empty' }, 'אין משימות שתואמות לסינון')); return; }
    var cols = taskColumns();
    var headCells = ['#', 'תחום', 'תיאור', 'אחראי', 'עדיפות', 'סטטוס', 'יעד', 'סוג'].map(function (h) { return U.el('th', { text: h }); });
    cols.forEach(function (col) {
      headCells.push(U.el('th', { style: 'white-space:nowrap;' }, [
        U.el('span', { text: col.name }),
        U.el('button', { text: '⋮', title: 'עריכת עמודה', style: 'background:none;border:none;cursor:pointer;color:inherit;font-size:15px;padding:0 2px;', onclick: function () { openColumnModal(col); } })
      ]));
    });
    headCells.push(U.el('th', { style: 'white-space:nowrap;' }, [U.el('button', { class: 'btn secondary', text: '＋ עמודה', title: 'הוספת עמודה', style: 'font-size:12px;padding:2px 8px;', onclick: function () { openColumnModal(null); } })]));
    headCells.push(U.el('th', { text: '' }));
    var tbl = U.el('table', { class: 'grid' }, [
      U.el('thead', null, U.el('tr', null, headCells)),
      U.el('tbody', null, list.map(function (t) {
        var overdue = (Store.daysToDue(t.due) != null && Store.daysToDue(t.due) < 0 && t.status !== 'הושלם');
        var descCell = U.el('td', { style: 'min-width:200px;' }, [
          areaText(t, 'desc', 'תיאור', 'font-weight:500;'),
          areaText(t, 'notes', 'הערות…', 'font-size:12px;color:var(--muted,#6b7884);'),
          t.kind === 'קבוע' && t.lastDoneAt ? U.el('div', { class: 'muted', style: 'font-size:11px;padding-inline:6px;', text: 'בוצע לאחרונה: ' + new Date(t.lastDoneAt).toLocaleDateString('he-IL') }) : null
        ]);
        var dueInput = U.el('input', { type: 'date', value: t.due || '', style: 'border:1px solid transparent;background:transparent;padding:4px 6px;' });
        dueInput.addEventListener('focus', function () { dueInput.style.background = 'var(--card,#fff)'; dueInput.style.borderColor = 'var(--border,#d6dce1)'; });
        dueInput.addEventListener('blur', function () { dueInput.style.background = 'transparent'; dueInput.style.borderColor = 'transparent'; });
        // רינדור מחדש: תאריך היעד משפיע על צבע השורה, תגית האיחור, המיון והסינון
        dueInput.addEventListener('change', function () { saveField(t, 'due', dueInput.value); App.render(); });

        var kindSel = selField(t, 'kind', [{ key: 'חד פעמי' }, { key: 'קבוע' }], true);
        var kindCell = U.el('td', { style: 'white-space:nowrap;' }, [kindSel]);
        if (t.kind === 'קבוע') {
          var freqSel = selField(t, 'freq', FREQS, false);
          freqSel.style.marginTop = '4px';
          kindCell.appendChild(U.el('div', null, [freqSel]));
        }

        var rowCells = [
          U.el('td', { style: 'white-space:nowrap;color:#94a3b8;font-size:12px;', text: t.num || '' }),
          U.el('td', null, chipEdit(t, 'domain', Store.settings().taskDomains || [], 'תחום')),
          descCell,
          U.el('td', null, chipEdit(t, 'owner', Store.settings().taskOwners || [], 'אחראי', '👤 ', true)),
          U.el('td', null, selField(t, 'priority', PRIORITIES, false)),
          U.el('td', null, selField(t, 'status', STATUSES, false)),
          U.el('td', { style: 'white-space:nowrap;' }, [dueInput, daysBadge(t) ? U.el('div', { style: 'margin-top:2px;' }, [daysBadge(t)]) : null]),
          kindCell
        ];
        cols.forEach(function (col) { rowCells.push(U.el('td', null, [customCell(t, col)])); });
        rowCells.push(U.el('td', { text: '' })); // עמודת ה־＋
        rowCells.push(U.el('td', null, U.el('button', { class: 'btn secondary', text: '🗑', title: 'מחיקה', onclick: function () {
          Modal.confirm({ title: 'מחיקת משימה', text: 'למחוק את "' + (t.desc || '') + '"?', okLabel: 'מחיקה', danger: true }, function () { Store.deleteTask(t.id); App.render(); });
        } })));
        return U.el('tr', { style: overdue ? 'background:#fef2f2;' : '' }, rowCells);
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
          plainChip(t.domain),
          colorChip(t.owner, '👤 '),
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

  // ---------- ציר זמן (Gantt) ----------
  function renderTimeline(host, list) {
    var today = U.todayISO();
    function startOf(t) { return t.createdAt ? String(t.createdAt).slice(0, 10) : today; }
    function daysBetween(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / 86400000); }
    var withDue = list.filter(function (t) { return t.due; });
    if (!withDue.length) { host.appendChild(U.el('div', { class: 'empty' }, list.length ? 'אין משימות עם תאריך יעד להצגה בציר הזמן.' : 'אין משימות.')); return; }
    var minD = today, maxD = today;
    withDue.forEach(function (t) { var s = startOf(t); if (s < minD) minD = s; if (t.due < minD) minD = t.due; if (t.due > maxD) maxD = t.due; });
    minD = U.addDays(minD, -3); maxD = U.addDays(maxD, 3);
    var span = Math.max(1, daysBetween(minD, maxD));
    var pxDay = span <= 30 ? 26 : span <= 90 ? 13 : span <= 240 ? 6 : 3;
    var barW = span * pxDay, LABEL_W = 190;
    function x(iso) { return daysBetween(minD, iso) * pxDay; }

    var inner = U.el('div', { style: 'direction:ltr;min-width:' + (LABEL_W + barW + 24) + 'px;' });
    // סרגל תאריכים (תוויות בימי ראשון)
    var ruler = U.el('div', { style: 'position:relative;height:20px;margin-left:' + LABEL_W + 'px;border-bottom:1px solid var(--border,#d6dce1);' });
    var cur = minD;
    while (cur <= maxD) {
      var dt = new Date(cur + 'T00:00:00');
      if (dt.getDay() === 0 || cur === minD) {
        ruler.appendChild(U.el('span', { style: 'position:absolute;bottom:2px;left:' + x(cur) + 'px;font-size:10px;color:var(--muted,#6b7884);white-space:nowrap;', text: dt.getDate() + '/' + (dt.getMonth() + 1) }));
      }
      cur = U.addDays(cur, 1);
    }
    inner.appendChild(ruler);

    withDue.sort(function (a, b) { return String(startOf(a)).localeCompare(String(startOf(b))) || dueCmp(a, b); });
    withDue.forEach(function (t) {
      var s = startOf(t); if (s > t.due) s = t.due;
      var overdue = t.status !== 'הושלם' && t.due < today;
      var done = t.status === 'הושלם';
      var barColor = done ? '#16a34a' : prColor(t.priority);
      var left = x(s), w = Math.max(6, x(t.due) - x(s));
      var track = U.el('div', { style: 'position:relative;height:26px;flex:0 0 auto;width:' + barW + 'px;border-bottom:1px solid #f1f5f9;' });
      track.appendChild(U.el('div', { style: 'position:absolute;top:0;bottom:0;left:' + x(today) + 'px;width:2px;background:#dc2626;opacity:.7;' }));
      var bar = U.el('div', {
        title: (t.desc || '') + ' · ' + U.gregLabel(s) + ' → ' + U.gregLabel(t.due),
        style: 'position:absolute;top:5px;height:16px;border-radius:8px;cursor:pointer;left:' + left + 'px;width:' + w + 'px;background:' + barColor + ';' + (overdue ? 'box-shadow:0 0 0 2px #dc2626;' : '') + (done ? 'opacity:.55;' : '')
      });
      bar.addEventListener('click', function () { openModal(JSON.parse(JSON.stringify(t))); });
      track.appendChild(bar);
      var label = U.el('div', { title: t.desc || '', style: 'direction:rtl;flex:0 0 ' + LABEL_W + 'px;width:' + LABEL_W + 'px;padding:4px 8px;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-bottom:1px solid #f1f5f9;' }, [
        priorityDot(t.priority), U.el('span', { text: t.desc || '' })
      ]);
      inner.appendChild(U.el('div', { style: 'display:flex;align-items:stretch;' }, [label, track]));
    });
    host.appendChild(U.el('div', { class: 'tbl-scroll' }, [inner]));

    var noDue = list.filter(function (t) { return !t.due; });
    if (noDue.length) host.appendChild(U.el('div', { class: 'muted', style: 'font-size:12px;margin-top:10px;', text: noDue.length + ' משימות ללא תאריך יעד אינן מוצגות בציר.' }));
  }

  // ---------- דשבורד ----------
  function dashCard(title, rows) {
    return U.el('div', { class: 'card' }, [
      U.el('h3', { style: 'margin:0 0 8px;font-size:16px;color:var(--primary-dark,#1b5e20);', text: title })
    ].concat(rows));
  }
  function renderDashboard(host, all) {
    var today = U.todayISO();
    function isOverdue(t) { var d = Store.daysToDue(t.due); return d != null && d < 0; }
    var notDone = all.filter(function (t) { return t.status !== 'הושלם'; });
    // דירוג חשיבות: באיחור → עדיפות → דדליין קרוב
    var ranked = notDone.slice().sort(function (a, b) {
      var oa = isOverdue(a) ? 0 : 1, ob = isOverdue(b) ? 0 : 1;
      if (oa !== ob) return oa - ob;
      if (prWeight(a.priority) !== prWeight(b.priority)) return prWeight(a.priority) - prWeight(b.priority);
      return dueCmp(a, b);
    });

    function emptyLine(txt) { return U.el('div', { class: 'muted', style: 'font-size:13px;padding:6px 0;', text: txt }); }
    function taskLine(t) {
      var row = U.el('div', { style: 'display:flex;align-items:center;gap:8px;padding:5px 0;cursor:pointer;border-bottom:1px solid var(--border,#eef1f4);' }, [
        priorityDot(t.priority),
        U.el('span', { style: 'font-weight:500;flex:1;min-width:0;', text: t.desc || '' }),
        t.owner ? colorChip(t.owner, '👤 ') : null,
        daysBadge(t)
      ].filter(Boolean));
      row.addEventListener('click', function () { openModal(JSON.parse(JSON.stringify(t))); });
      return row;
    }

    var grid = U.el('div', { class: 'dash-cols', style: 'display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));' });

    // 5 המשימות המובילות
    var top5 = ranked.slice(0, 5);
    grid.appendChild(dashCard('⭐ 5 המשימות המובילות', top5.length ? top5.map(taskLine) : [emptyLine('אין משימות פתוחות 🎉')]));

    // עומס לפי אחראי
    var byOwner = {}, order = [];
    notDone.forEach(function (t) {
      var o = t.owner || 'ללא אחראי';
      if (!byOwner[o]) { byOwner[o] = { open: 0, overdue: 0 }; order.push(o); }
      byOwner[o].open++; if (isOverdue(t)) byOwner[o].overdue++;
    });
    order.sort(function (a, b) { return byOwner[b].overdue - byOwner[a].overdue || byOwner[b].open - byOwner[a].open; });
    grid.appendChild(dashCard('👥 עומס לפי אחראי', order.length ? order.map(function (o) {
      var d = byOwner[o];
      return U.el('div', { style: 'display:flex;align-items:center;gap:8px;padding:5px 0;' }, [
        colorChip(o, '👤 ') || plainChip(o),
        U.el('span', { class: 'spacer' }),
        U.el('span', { class: 'tag', style: 'font-size:12px;', text: d.open + ' פתוחות' }),
        d.overdue ? U.el('span', { class: 'tag', style: 'font-size:12px;background:#fee2e2;color:#991b1b;', text: d.overdue + ' באיחור' }) : null
      ].filter(Boolean));
    }) : [emptyLine('אין משימות פתוחות')]));

    // אירועים קרובים השבוע
    var eventsWeek = [];
    if (Store.eventsAll) {
      var eow = endOfWeekISO();
      eventsWeek = Store.eventsAll().filter(function (e) { return !e.archived && e.date && e.date >= today && e.date <= eow; })
        .sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
    }
    grid.appendChild(dashCard('🗓️ אירועים קרובים השבוע', eventsWeek.length ? eventsWeek.map(function (e) {
      return U.el('div', { style: 'display:flex;align-items:center;gap:8px;padding:5px 0;' }, [
        U.el('span', { style: 'font-weight:600;', text: e.title || 'אירוע' }),
        U.el('span', { class: 'tag', style: 'font-size:12px;', text: U.gregLabel(e.date) }),
        e.group ? plainChip(e.group) : null,
        U.el('span', { class: 'spacer' }),
        U.el('button', { class: 'btn secondary', style: 'font-size:12px;padding:4px 10px;', text: 'לאירוע ›', onclick: function () { App.setView('events'); } })
      ].filter(Boolean));
    }) : [emptyLine('אין אירועים השבוע')]));

    // משימות באיחור
    var overdueList = ranked.filter(isOverdue);
    grid.appendChild(dashCard('⚠️ משימות באיחור (' + overdueList.length + ')', overdueList.length ? overdueList.map(taskLine) : [emptyLine('אין משימות באיחור 👍')]));

    host.appendChild(grid);
  }

  // ---------- רינדור ----------
  function render(view) {
    var all = Store.tasksAll();
    var s = Store.settings();

    // שתי דרכים להוסיף: שורת הוספה מהירה בטבלה + כפתור חלון (זמין תמיד)
    var addBtn = U.el('button', { class: 'btn', text: '➕ משימה חדשה', onclick: function () { openModal(null); } });
    var toggle = U.el('div', { class: 'subtabs', style: 'display:inline-flex;margin:0;' }, [
      U.el('button', { class: viewMode === 'table' ? 'active' : '', text: '☰ טבלה', onclick: function () { viewMode = 'table'; App.render(); } }),
      U.el('button', { class: viewMode === 'kanban' ? 'active' : '', text: '▤ קנבן', onclick: function () { viewMode = 'kanban'; App.render(); } }),
      U.el('button', { class: viewMode === 'timeline' ? 'active' : '', text: '📅 ציר זמן', onclick: function () { viewMode = 'timeline'; App.render(); } }),
      U.el('button', { class: viewMode === 'dashboard' ? 'active' : '', text: '📊 דשבורד', onclick: function () { viewMode = 'dashboard'; App.render(); } })
    ]);
    view.appendChild(U.el('div', { class: 'page-head' }, [
      U.el('h2', { text: '✅ ניהול משימות' }),
      U.el('span', { class: 'spacer' }),
      toggle, addBtn
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

    // בדשבורד — בלי סרגלי סינון/יעד
    var isDash = viewMode === 'dashboard';
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
    if (!isDash) view.appendChild(bar);

    // סינון מהיר לפי יעד — באיחור / השבוע / בהמשך / ללא יעד
    var notDone = all.filter(function (t) { return t.status !== 'הושלם'; });
    var bucketDefs = [
      { key: 'overdue', label: '⚠️ באיחור', activeStyle: 'background:#fee2e2;color:#991b1b;border-color:#991b1b;' },
      { key: 'week', label: '📅 השבוע', activeStyle: 'background:#fef3c7;color:#92400e;border-color:#92400e;' },
      { key: 'ahead', label: '⏭️ בהמשך', activeStyle: '' },
      { key: 'none', label: '🚫 ללא יעד', activeStyle: '' }
    ];
    var dueBar = U.el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;margin:0 0 10px;align-items:center;' },
      [U.el('span', { class: 'muted', style: 'font-size:13px;', text: 'יעד:' })].concat(bucketDefs.map(function (bd) {
        var n = notDone.filter(function (t) { return dueBucket(t) === bd.key; }).length;
        var active = filters.due === bd.key;
        var b = U.el('button', {
          class: 'tag',
          style: 'cursor:pointer;font-size:12px;' + (active ? (bd.activeStyle || 'background:var(--brand-light);') + 'outline:2px solid var(--brand);' : ''),
          text: bd.label + ' ' + n
        });
        b.addEventListener('click', function () { filters.due = active ? '' : bd.key; App.render(); });
        return b;
      })));
    if (viewMode === 'table' || viewMode === 'kanban') view.appendChild(dueBar);

    var host = U.el('div');
    view.appendChild(host);

    function refresh() {
      U.clear(host);
      if (viewMode === 'dashboard') { renderDashboard(host, all); return; }
      if (viewMode === 'timeline') { renderTimeline(host, applyFilters(all)); return; }
      var list = sortTasks(applyFilters(all));
      if (viewMode === 'kanban') {
        if (!all.length) {
          host.appendChild(U.el('div', { class: 'empty' }, [
            'אין עדיין משימות.',
            U.el('div', { class: 'muted', style: 'margin-top:6px;' }, 'עברו לתצוגת טבלה כדי להוסיף משימה במהירות.')
          ]));
        } else renderKanban(host, list);
      } else {
        renderTable(host, list); // כולל שורת הוספה מהירה — מוצג גם כשאין משימות
      }
    }
    refresh();

    // משימות מאירועים ששויכו אליי (קריאה-בלבד) — שילוב עם גיליון תכנון אירועים וטיולים
    var myId = Store.currentEmpId && Store.currentEmpId();
    if (myId && Store.eventsAll) {
      var mine = [];
      Store.eventsAll().forEach(function (ev) {
        (ev.tasks || []).forEach(function (t) { if (t.empId === myId && t.status !== 'בוצע') mine.push({ ev: ev, task: t }); });
      });
      if (mine.length) {
        var rows = mine.map(function (p) {
          return U.el('div', { style: 'display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--border,#d6dce1);border-radius:8px;margin-bottom:6px;flex-wrap:wrap;' }, [
            U.el('span', { text: p.task.status === 'בתהליך' ? '⏳' : '📂' }),
            U.el('span', { style: 'font-weight:600;', text: p.task.title }),
            U.el('span', { class: 'tag', text: (p.ev.title || 'אירוע') + (p.ev.date ? ' · ' + U.gregLabel(p.ev.date) : '') }),
            U.el('span', { class: 'spacer' }),
            U.el('button', { class: 'btn secondary', text: 'לאירוע ›', onclick: function () { App.setView('events'); } })
          ]);
        });
        view.appendChild(U.el('div', { class: 'card', style: 'margin-top:16px;border-top:4px solid var(--primary,#2e7d32);' }, [
          U.el('h3', { style: 'margin-top:0;', text: '🗓️ המשימות שלי מאירועים (' + mine.length + ')' }),
          U.el('div', { class: 'muted', style: 'font-size:12px;margin-bottom:8px;', text: 'משימות שהוקצו לך בגיליון תכנון אירועים וטיולים. הניהול נעשה בכרטיס האירוע.' })
        ].concat(rows)));
      }
    }
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
