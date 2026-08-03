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

  var viewMode = 'table'; // 'table' | 'kanban'  (ציר זמן/דשבורד עברו לדשבורד המנהלים)
  var filters = { q: '', status: '', domain: '', owner: '', priority: '', due: '' };
  var sortBy = 'due';
  var showArchive = false;
  var groupBy = ''; // '' | 'domain' | 'owner' | 'status'
  // קיבוצים מכווצים (נשמר מקומית)
  var groupCollapsed = (function () { try { return JSON.parse(localStorage.getItem('admin_task_groups') || '{}'); } catch (e) { return {}; } })();
  function saveGroupState() { try { localStorage.setItem('admin_task_groups', JSON.stringify(groupCollapsed)); } catch (e) {} }

  // ארכוב אוטומטי: משימה שהושלמה לפני יותר מ-30 יום עוברת לארכיון
  var AUTO_ARCHIVE_DAYS = 30;
  function autoArchiveOld() {
    var cutoff = Date.now() - AUTO_ARCHIVE_DAYS * 86400000;
    Store.tasksAll().forEach(function (t) {
      if (t.archived || t.status !== 'הושלם') return;
      var when = Date.parse(t.lastDoneAt || t.updatedAt || '');
      if (when && when < cutoff) { t.archived = true; Store.upsertTask(t); }
    });
  }

  // ---------- צבעי תגיות (תחום/אחראי) — צבע קבוע ועקבי לפי הטקסט ----------
  // גוונים מרווחים על גלגל הצבעים (בהשראת פלטת Monday) — בלי ארבעה גוונים חמים דומים
  var CHIP_COLORS = [
    ['#dbeafe', '#1e40af'],  // כחול
    ['#dcfce7', '#166534'],  // ירוק
    ['#ede9fe', '#5b21b6'],  // סגול
    ['#ffedd5', '#9a3412'],  // כתום
    ['#cffafe', '#155e75'],  // תכלת
    ['#fce7f3', '#9d174d'],  // ורוד
    ['#fef9c3', '#854d0e'],  // צהוב
    ['#e0e7ff', '#3730a3'],  // אינדיגו
    ['#d1fae5', '#065f46'],  // ירוק־ים
    ['#fee2e2', '#991b1b'],  // אדום
    ['#f3e8ff', '#6b21a8'],  // סגול בהיר
    ['#e2e8f0', '#334155']   // אפור
  ];
  function hashOf(str) {
    var h = 5381;
    str = String(str || '');
    for (var i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
    return h;
  }
  function chipColor(str) {
    return CHIP_COLORS[hashOf(str) % CHIP_COLORS.length];
  }
  // צבע לאדם: לפי מיקומו ברשימת האחראים המוגדרת — כך שכל אחראי מקבל גוון שונה
  // בוודאות, ולא לפי גיבוב שעלול לתת לשניים את אותו צבע.
  function personColor(name) {
    var list = (Store.settings().taskOwners || []);
    var i = list.indexOf(name);
    if (i === -1) return chipColor(name);
    return CHIP_COLORS[i % CHIP_COLORS.length];
  }
  function colorChip(text, prefix, extra, isPerson) {
    if (!text) return null;
    var c = isPerson ? personColor(text) : chipColor(text);
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
      buttons.splice(1, 0, { label: 'מחיקה', class: 'danger', onClick: function (close) {
        close();
        Modal.confirm({ title: 'מחיקת משימה', text: 'למחוק את המשימה?', okLabel: 'מחיקה', danger: true }, function () {
          Store.deleteTask(task.id); App.render();
        });
      } });
    }
    Modal.open(isNew ? 'משימה חדשה' : '' + (task.num || 'משימה'), body, buttons);
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
  // --- רכיבים בסגנון Monday ---
  // תא סטטוס צבוע-מלא (החתימה הוויזואלית של Monday)
  function mStatusSel(t) {
    var sel = U.el('select', { class: 'm-status' }, STATUSES.map(function (o) { return U.el('option', { value: o.key, text: o.key }); }));
    sel.value = t.status || STATUSES[0].key;
    sel.style.background = stColor(sel.value);
    sel.addEventListener('change', function () {
      var r = Store.setTaskStatus(t.id, sel.value);
      if (r && r._renewed) U.toast('המשימה הקבועה חודשה ליעד ' + U.gregLabel(r.due));
      App.render();
    });
    return sel;
  }
  // עדיפות כגלולה צבעונית
  function mPrioSel(t) {
    var sel = U.el('select', { class: 'm-prio' }, PRIORITIES.map(function (o) { return U.el('option', { value: o.key, text: o.key }); }));
    sel.value = t.priority || 'בינוני';
    function paint() { var c = prColor(sel.value); sel.style.background = c + '22'; sel.style.color = c; }
    paint();
    sel.addEventListener('change', function () { saveField(t, 'priority', sel.value); paint(); });
    return sel;
  }
  // אווטאר עגול עם ראשי תיבות + פתיחה לעריכה בלחיצה
  function initialsOf(name) {
    var p = String(name || '').trim().split(/\s+/);
    return ((p[0] || '')[0] || '') + ((p[1] || '')[0] || '');
  }
  function ownerAvatar(t) {
    var wrap = U.el('span', { style: 'display:inline-block;' });
    function show() {
      U.clear(wrap);
      var name = t.owner;
      if (name) {
        var c = personColor(name);
        wrap.appendChild(U.el('span', { class: 'm-owner', title: 'לחיצה לשינוי האחראי', onclick: edit }, [
          U.el('span', { class: 'm-avatar', style: 'background:' + c[1] + ';', text: initialsOf(name) }),
          U.el('span', { class: 'm-oname', text: name })
        ]));
      } else {
        wrap.appendChild(U.el('span', { class: 'm-owner empty', title: 'שיוך אחראי', onclick: edit, text: '+ אחראי' }));
      }
    }
    function edit() {
      U.clear(wrap);
      var w = U.dataListInput(t.owner || '', Store.settings().taskOwners || [], 'אחראי');
      w._input.style.minWidth = '120px';
      wrap.appendChild(w); w._input.focus();
      var done = false;
      function commit() {
        if (done) return; done = true;
        saveField(t, 'owner', w.get());
        rememberValue('taskOwners', w.get());
        show();
      }
      w._input.addEventListener('change', commit);
      w._input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); commit(); } });
      w._input.addEventListener('blur', function () { setTimeout(commit, 120); });
    }
    show();
    return wrap;
  }

  // ---------- תת-משימות (בתבנית Subitems של Monday) ----------
  var subOpen = (function () { try { return JSON.parse(localStorage.getItem('admin_task_subopen') || '{}'); } catch (e) { return {}; } })();
  function saveSubOpen() { try { localStorage.setItem('admin_task_subopen', JSON.stringify(subOpen)); } catch (e) {} }
  function subsOf(t) { return Array.isArray(t.subs) ? t.subs : []; }
  // Rollup: סיכום תת-המשימות אל שורת האב
  function subRollup(t) {
    var subs = subsOf(t);
    if (!subs.length) return null;
    var done = subs.filter(function (s) { return s.status === 'הושלם'; }).length;
    return { done: done, total: subs.length, pct: Math.round(done / subs.length * 100) };
  }
  function rollupChip(t) {
    var r = subRollup(t);
    if (!r) return null;
    var full = r.done === r.total;
    return U.el('span', {
      class: 'm-rollup', title: 'תת-משימות: ' + r.done + ' מתוך ' + r.total + ' הושלמו',
      style: full ? 'border-color:var(--ok,#16a34a);color:var(--ok,#16a34a);' : ''
    }, [
      U.el('span', { text: '⛓ ' + r.done + '/' + r.total }),
      U.el('span', { class: 'm-rbar' }, [U.el('span', { style: 'width:' + r.pct + '%;background:' + (full ? 'var(--ok,#16a34a)' : 'var(--brand,#1d4e89)') + ';' })])
    ]);
  }
  // טבלת תת-המשימות שנפתחת מתחת לשורת האב
  function subTable(t) {
    if (!t.subs) t.subs = [];
    var owners = Store.settings().taskOwners || [];
    var rows = t.subs.map(function (s, idx) {
      var title = U.el('input', { value: s.title || '', placeholder: 'תת-משימה', style: 'width:100%;border:1px solid transparent;background:transparent;padding:5px 7px;' });
      title.addEventListener('focus', function () { title.style.background = '#fff'; title.style.borderColor = 'var(--border,#e2e7ec)'; });
      title.addEventListener('blur', function () { title.style.background = 'transparent'; title.style.borderColor = 'transparent'; });
      title.addEventListener('change', function () { s.title = title.value.trim(); Store.upsertTask(t); });

      var ow = U.dataListInput(s.owner || '', owners, 'אחראי');
      ow._input.style.cssText = 'min-width:100px;border:1px solid transparent;background:transparent;padding:5px 7px;';
      ow._input.addEventListener('change', function () { s.owner = ow.get(); rememberValue('taskOwners', ow.get()); Store.upsertTask(t); });

      var st = U.el('select', { class: 'm-status', style: 'min-width:92px;font-size:12px;padding:6px 8px;' },
        STATUSES.map(function (o) { return U.el('option', { value: o.key, text: o.key }); }));
      st.value = s.status || 'פתוח';
      st.style.background = stColor(st.value);
      st.addEventListener('change', function () { s.status = st.value; Store.upsertTask(t); App.render(); });

      var due = U.el('input', { type: 'date', value: s.due || '', style: 'border:1px solid transparent;background:transparent;padding:5px 7px;font-size:12px;' });
      due.addEventListener('change', function () { s.due = due.value; Store.upsertTask(t); App.render(); });

      var del = U.el('button', { class: 'm-iconbtn', html: U.ICO.trash, title: 'מחיקת תת-משימה', onclick: function () {
        t.subs.splice(idx, 1); Store.upsertTask(t); App.render();
      } });
      return U.el('tr', null, [
        U.el('td', { style: 'min-width:180px;' }, [title]),
        U.el('td', null, [ow]),
        U.el('td', null, [st]),
        U.el('td', { style: 'white-space:nowrap;' }, [due]),
        U.el('td', null, [U.el('div', { class: 'm-actions' }, [del])])
      ]);
    });
    var tbl = U.el('table', { class: 'grid m-grid m-subgrid' }, [
      U.el('thead', null, U.el('tr', null, ['תת-משימה', 'אחראי', 'סטטוס', 'יעד', ''].map(function (h) { return U.el('th', { text: h }); }))),
      U.el('tbody', null, rows)
    ]);
    var add = U.el('input', { placeholder: '+ תת-משימה — כתוב ולחץ Enter', style: 'flex:1;min-width:200px;' });
    function addSub() {
      var v = add.value.trim(); if (!v) return;
      t.subs.push({ id: Store.uid(), title: v, owner: '', status: 'פתוח', due: '' });
      Store.upsertTask(t); subOpen[t.id] = true; saveSubOpen(); App.render();
    }
    add.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addSub(); } });
    return U.el('div', { class: 'm-subwrap' }, [
      rows.length ? tbl : U.el('div', { class: 'muted', style: 'font-size:12.5px;padding:2px 0 8px;', text: 'אין עדיין תת-משימות.' }),
      U.el('div', { style: 'display:flex;gap:6px;margin-top:8px;' }, [add, U.el('button', { class: 'btn secondary', text: 'הוסף', onclick: addSub })])
    ]);
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
    var desc = U.el('input', { placeholder: '+ משימה חדשה — כתוב תיאור ולחץ Enter', style: 'flex:2;min-width:180px;font-size:15px;' });
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
    // בנייד מוצגים רק התיאור וכפתור ההוספה; שאר השדות נערכים בשורה עצמה
    [domain, owner, priority, due].forEach(function (n) { n.classList.add('m-qa-extra'); });
    var card = U.el('div', { class: 'card m-quickadd', style: 'padding:10px;margin-bottom:10px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;' },
      [desc, domain, owner, priority, due, addBtn]);
    host.appendChild(card);
    if (focusAddDesc) { focusAddDesc = false; setTimeout(function () { desc.focus(); }, 0); }
  }

  // ---------- עמודות מותאמות (סגנון Monday) ----------
  var COL_TYPES = [
    { key: 'text', label: 'טקסט' },
    { key: 'number', label: 'מספר' },
    { key: 'date', label: 'תאריך' },
    { key: 'label', label: 'תווית צבעונית' },
    { key: 'check', label: 'צ׳ק-בוקס' },
    { key: 'link', label: 'קישור' },
    { key: 'file', label: 'קובץ / מסמך' }
  ];
  function taskColumns() { return Store.settings().taskColumns || []; }
  function customVal(t, colId) { return (t.custom && t.custom[colId] != null) ? t.custom[colId] : ''; }
  function saveCustom(t, colId, val) {
    if (!t.custom) t.custom = {};
    if (val === '' || val == null) delete t.custom[colId]; else t.custom[colId] = val;
    Store.upsertTask(t);
  }
  function transpInput(inp) {
    inp.style.cssText += 'border:1px solid transparent;background:transparent;padding:4px 6px;margin-inline:-7px;';
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
          var link = U.el('a', { href: '#', html: U.ICO.clip + ' ' + (v.name || 'קובץ'), title: v.name || 'קובץ', style: 'cursor:pointer;font-size:13px;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block;vertical-align:middle;' });
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
          fwrap.appendChild(U.el('button', { class: 'btn secondary', html: U.ICO.clip + ' העלאה', style: 'font-size:12px;padding:2px 8px;', onclick: function () { finp.click(); } }));
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
        var del = U.el('button', { class: 'btn secondary', html: U.ICO.trash, onclick: function () { col.options.splice(i, 1); drawOpts(); } });
        optWrap.appendChild(U.el('div', { style: 'display:flex;gap:6px;align-items:center;margin-bottom:6px;' }, [sw, v, del]));
      });
      var addv = U.el('input', { placeholder: '+ ערך חדש ולחץ Enter', style: 'flex:1;' });
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
      buttons.splice(1, 0, { label: 'מחיקת עמודה', class: 'danger', onClick: function (close) {
        close();
        Modal.confirm({ title: 'מחיקת עמודה', text: 'למחוק את העמודה "' + (col.name || '') + '"? הנתונים בעמודה יוסרו מהתצוגה.', okLabel: 'מחיקה', danger: true }, function () {
          var s = Store.settings(); var idx = (s.taskColumns || []).map(function (x) { return x.id; }).indexOf(col.id);
          if (idx >= 0) s.taskColumns.splice(idx, 1); Store.saveSettings(); App.render();
        });
      } });
    }
    Modal.open(isNew ? 'עמודה חדשה' : 'עמודה:' + (col.name || ''), body, buttons);
  }

  function groupLabel(t) {
    if (groupBy === 'domain') return t.domain || 'ללא תחום';
    if (groupBy === 'owner') return t.owner || 'ללא אחראי';
    if (groupBy === 'status') return t.status || 'פתוח';
    return '';
  }
  function renderTable(host, list) {
    if (!showArchive) quickAddRow(host);
    if (!list.length) { host.appendChild(U.el('div', { class: 'empty' }, showArchive ? 'הארכיון ריק.' : 'אין משימות שתואמות לסינון')); return; }
    if (groupBy) {
      var groups = {}, order = [];
      list.forEach(function (t) { var g = groupLabel(t); if (!groups[g]) { groups[g] = []; order.push(g); } groups[g].push(t); });
      order.sort(function (a, b) { return String(a).localeCompare(String(b), 'he'); });
      order.forEach(function (g) {
        var items = groups[g];
        var openDone = items.filter(function (t) { return t.status !== 'הושלם'; }).length;
        var key = groupBy + ':' + g;
        var isCollapsed = !!groupCollapsed[key];
        var gc = groupBy === 'status' ? stColor(g) : chipColor(g)[1];
        var headBtn = U.el('button', {
          class: 'm-group',
          onclick: function () { groupCollapsed[key] = !isCollapsed; saveGroupState(); App.render(); }
        }, [
          U.el('span', { style: 'color:var(--muted);font-size:12px;', text: isCollapsed ? '▸' : '▾' }),
          U.el('span', { class: 'm-gbar', style: 'background:' + gc + ';' }),
          U.el('span', { class: 'm-gname', style: 'color:' + gc + ';', text: g }),
          U.el('span', { class: 'm-gcount', text: items.length + ' משימות · ' + openDone + ' פתוחות' })
        ]);
        host.appendChild(headBtn);
        if (!isCollapsed) {
          host.appendChild(tableFor(items));
          if (!showArchive) host.appendChild(groupAddRow(g));
        }
      });
      return;
    }
    host.appendChild(tableFor(list));
    if (!showArchive) host.appendChild(groupAddRow(null));
  }
  // שורת "+ הוספה" בתחתית כל קבוצה (כמו Monday) — יורשת אוטומטית את ערך הקבוצה
  var focusAddGroup = null; // הקבוצה שיש להחזיר אליה פוקוס אחרי הוספה
  function groupAddRow(g) {
    var inp = U.el('input', {
      class: 'm-addinput',
      placeholder: '＋ הוסף משימה' + (g ? ' ל' + g : '') + ' — כתוב ולחץ Enter'
    });
    // הפוקוס נשאר בשורת הקבוצה שממנה הוספת, ולא קופץ לתיבה העליונה
    if (focusAddGroup === (g || '__none__')) {
      focusAddGroup = null;
      setTimeout(function () { inp.focus(); }, 0);
    }
    function add() {
      var v = inp.value.trim(); if (!v) return;
      var rec = { desc: v, domain: '', owner: '', priority: 'בינוני', status: 'פתוח', due: '', notes: '', kind: 'חד פעמי', freq: '', subs: [] };
      // ירושת ערך הקבוצה שאליה מוסיפים
      if (g && groupBy === 'domain' && g !== 'ללא תחום') rec.domain = g;
      if (g && groupBy === 'owner' && g !== 'ללא אחראי') rec.owner = g;
      if (g && groupBy === 'status') rec.status = g;
      Store.upsertTask(rec);
      focusAddGroup = g || '__none__';
      App.render();
    }
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    return U.el('div', { class: 'm-addrow' }, [inp]);
  }
  function tableFor(list) {
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
    var tbl = U.el('table', { class: 'grid m-grid' }, [
      U.el('thead', null, U.el('tr', null, headCells)),
      U.el('tbody', null, list.reduce(function (acc, t) {
        var overdue = (Store.daysToDue(t.due) != null && Store.daysToDue(t.due) < 0 && t.status !== 'הושלם');
        var isSubOpen = !!subOpen[t.id];
        var nSubs = subsOf(t).length;
        // חץ פתיחת תת-משימות (בתבנית Monday) — משמאל לתיאור
        var chev = U.el('button', {
          class: 'm-chev' + (isSubOpen ? ' open' : '') + (nSubs ? ' has' : ''),
          title: nSubs ? (isSubOpen ? 'סגירת תת-משימות' : 'פתיחת ' + nSubs + ' תת-משימות') : 'הוספת תת-משימות',
          onclick: function () { subOpen[t.id] = !isSubOpen; saveSubOpen(); App.render(); }
        }, isSubOpen ? '▾' : '▸');
        var descCell = U.el('td', { style: 'min-width:200px;' }, [
          U.el('div', { style: 'display:flex;align-items:flex-start;gap:4px;' }, [
            chev,
            U.el('div', { style: 'flex:1;min-width:0;' }, [
              areaText(t, 'desc', 'תיאור', 'font-weight:500;'),
              areaText(t, 'notes', 'הערות…', 'font-size:12px;color:var(--muted,#6b7884);')
            ])
          ]),
          rollupChip(t),
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
          U.el('td', null, ownerAvatar(t)),
          U.el('td', null, mPrioSel(t)),
          U.el('td', { style: 'min-width:120px;' }, mStatusSel(t)),
          U.el('td', { style: 'white-space:nowrap;' }, [dueInput, daysBadge(t) ? U.el('div', { style: 'margin-top:2px;' }, [daysBadge(t)]) : null]),
          kindCell
        ];
        cols.forEach(function (col) { rowCells.push(U.el('td', null, [customCell(t, col)])); });
        rowCells.push(U.el('td', { text: '' })); // עמודת ה־＋
        var acts = [];
        if (t.archived) {
          acts.push(U.el('button', { class: 'm-iconbtn', html: U.ICO.restore, title: 'שחזור מהארכיון', onclick: function () { saveField(t, 'archived', false); App.render(); } }));
          acts.push(U.el('button', { class: 'm-iconbtn', html: U.ICO.trash, title: 'מחיקה לצמיתות', onclick: function () {
            Modal.confirm({ title: 'מחיקה לצמיתות', text: 'למחוק לצמיתות את "' + (t.desc || '') + '"?', okLabel: 'מחיקה', danger: true }, function () { Store.deleteTask(t.id); App.render(); });
          } }));
        } else {
          acts.push(U.el('button', { class: 'm-iconbtn', html: U.ICO.archive, title: 'העברה לארכיון', onclick: function () { saveField(t, 'archived', true); App.render(); } }));
          acts.push(U.el('button', { class: 'm-iconbtn', html: U.ICO.trash, title: 'מחיקה', onclick: function () {
            Modal.confirm({ title: 'מחיקת משימה', text: 'למחוק את "' + (t.desc || '') + '"?', okLabel: 'מחיקה', danger: true }, function () { Store.deleteTask(t.id); App.render(); });
          } }));
        }
        rowCells.push(U.el('td', { style: 'white-space:nowrap;' }, [U.el('div', { class: 'm-actions' }, acts)]));
        acc.push(U.el('tr', { class: overdue ? 'row-over' : (t.status === 'הושלם' ? 'row-done' : '') }, rowCells));
        // שורת תת-המשימות — נפתחת מתחת לאב על כל רוחב הטבלה
        if (isSubOpen) {
          acc.push(U.el('tr', { class: 'm-subrow' }, [
            U.el('td', { colspan: String(rowCells.length) }, [subTable(t)])
          ]));
        }
        return acc;
      }, []))
    ]);
    return U.el('div', { class: 'tbl-scroll' }, [tbl]);
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
        // כרטיס Monday: לבן ונקי. העדיפות מסומנת בנקודה קטנה, האיחור בצ'יפ — לא ברקע צבעוני.
        var card = U.el('div', { class: 'kb-card' + (overdue ? ' kb-late' : ''), draggable: 'true' });
        card.addEventListener('dragstart', function (e) { e.dataTransfer.setData('text/plain', t.id); card.classList.add('kb-drag'); });
        card.addEventListener('dragend', function () { card.classList.remove('kb-drag'); });
        card.appendChild(U.el('div', { class: 'kb-title' }, [
          U.el('span', { class: 'kb-dot', style: 'background:' + prColor(t.priority) + ';', title: 'עדיפות ' + (t.priority || 'בינוני') }),
          U.el('span', { text: t.desc || '' })
        ]));
        var meta = U.el('div', { style: 'display:flex;flex-wrap:wrap;gap:4px;align-items:center;' }, [
          plainChip(t.domain),
          colorChip(t.owner, '👤 ', '', true),
          daysBadge(t),
          t.kind === 'קבוע' ? U.el('span', { title: 'קבועה · ' + freqLabel(t.freq), text: '🔁', style: 'font-size:12px;' }) : null
        ].filter(Boolean));
        card.appendChild(meta);
        card.addEventListener('click', function (e) { if (!card.classList.contains('kb-drag')) openModal(JSON.parse(JSON.stringify(t))); });
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
        t.owner ? colorChip(t.owner, '👤 ', '', true) : null,
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
        colorChip(o, '👤 ', '', true) || plainChip(o),
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
    autoArchiveOld();
    var everything = Store.tasksAll();
    var activeTasks = everything.filter(function (t) { return !t.archived; });
    var archivedTasks = everything.filter(function (t) { return !!t.archived; });
    var all = showArchive ? archivedTasks : activeTasks;
    var s = Store.settings();

    // שתי דרכים להוסיף: שורת הוספה מהירה בטבלה + כפתור חלון (זמין תמיד)
    var addBtn = U.el('button', { class: 'btn', html: U.ICO.plus + ' משימה חדשה', onclick: function () { openModal(null); } });
    // ציר הזמן והדשבורד הועברו לגיליון "דשבורד מנהלים" (ייבנה בהמשך)
    var toggle = U.el('div', { class: 'subtabs', style: 'display:inline-flex;margin:0;' }, [
      U.el('button', { class: viewMode === 'table' ? 'active' : '', text: '☰ טבלה', onclick: function () { viewMode = 'table'; App.render(); } }),
      U.el('button', { class: viewMode === 'kanban' ? 'active' : '', text: '▤ קנבן', onclick: function () { viewMode = 'kanban'; App.render(); } })
    ]);
    view.appendChild(U.el('div', { class: 'page-head' }, [
      U.el('h2', { text: 'ניהול משימות' }),
      U.el('span', { class: 'spacer' }),
      toggle, showArchive ? null : addBtn
    ].filter(Boolean)));

    // תת-טאבים: משימות פעילות / ארכיון
    view.appendChild(U.el('div', { class: 'subtabs', style: 'margin-bottom:12px;' }, [
      U.el('button', { class: showArchive ? '' : 'active', onclick: function () { showArchive = false; App.render(); } }, 'משימות (' + activeTasks.length + ')'),
      U.el('button', { class: showArchive ? 'active' : '', onclick: function () { showArchive = true; App.render(); } }, 'ארכיון (' + archivedTasks.length + ')')
    ]));

    // סיכום
    var open = all.filter(function (t) { return t.status === 'פתוח'; }).length;
    var prog = all.filter(function (t) { return t.status === 'בתהליך'; }).length;
    var overdue = all.filter(function (t) { return t.status !== 'הושלם' && Store.daysToDue(t.due) != null && Store.daysToDue(t.due) < 0; }).length;
    view.appendChild(U.el('div', { class: 'kpi-row' }, [
      kpi('', open, 'פתוחות', 'kpi-neutral'),
      kpi('⏳', prog, 'בתהליך', 'kpi-info'),
      kpi('', overdue, 'באיחור', overdue ? 'kpi-warn' : 'kpi-neutral')
    ]));

    // ---------- סרגל כלים קומפקטי: חיפוש + סינון אחד + מיון + קיבוץ ----------
    var isDash = viewMode === 'dashboard';
    var notDone = all.filter(function (t) { return t.status !== 'הושלם'; });
    var bucketDefs = [
      { key: 'overdue', label: 'באיחור' },
      { key: 'week', label: 'השבוע' },
      { key: 'ahead', label: '⏭ בהמשך' },
      { key: 'none', label: 'ללא יעד' }
    ];
    var DUE_LBL = {}; bucketDefs.forEach(function (b) { DUE_LBL[b.key] = b.label; });
    var SORT_LBL = { due: 'יעד', priority: 'עדיפות', domain: 'תחום', owner: 'אחראי' };
    var GROUP_LBL = { '': 'ללא', domain: 'תחום', owner: 'אחראי', status: 'סטטוס' };

    if (!isDash) {
      var q = U.el('input', { class: 'm-search', value: filters.q, placeholder: '🔍 חיפוש משימה…' });
      q.addEventListener('input', function () { filters.q = q.value; refresh(); });

      // כפתור שפותח פאנל (משתמש במנגנון הסגירה הגלובלי של amenu)
      function popBtn(label, badge, buildBody, extraClass) {
        var wrap = U.el('div', { class: 'amenu m-pop' });
        var btn = U.el('button', { class: 'btn secondary m-popbtn' + (badge ? ' on' : '') + (extraClass || '') }, [
          U.el('span', { text: label }),
          badge ? U.el('span', { class: 'm-badge', text: String(badge) }) : null,
          U.el('span', { style: 'font-size:10px;opacity:.6;', text: '▾' })
        ].filter(Boolean));
        var pop = U.el('div', { class: 'amenu-pop m-poppanel' });
        buildBody(pop);
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var was = pop.classList.contains('open');
          U.$all('.amenu-pop.open').forEach(function (p) { p.classList.remove('open'); });
          if (!was) pop.classList.add('open');
        });
        pop.addEventListener('click', function (e) { e.stopPropagation(); });
        wrap.appendChild(btn); wrap.appendChild(pop);
        return wrap;
      }
      function popSection(title, node) {
        return U.el('div', { class: 'm-popsec' }, [U.el('label', { text: title }), node]);
      }
      function filterSel(cur, opts, label, key) {
        var sl = U.el('select', null, [U.el('option', { value: '', text: label })].concat(opts.map(function (o) { return U.el('option', { value: o, text: o }); })));
        sl.value = cur;
        // רינדור מלא — כדי שמונה הסינונים והצ'יפים הפעילים יתעדכנו מיד
        sl.addEventListener('change', function () { filters[key] = sl.value; App.render(); });
        return sl;
      }
      var activeCount = ['status', 'domain', 'owner', 'priority', 'due'].filter(function (k) { return filters[k]; }).length;

      var filterBtn = popBtn('⚙️ סינון', activeCount, function (pop) {
        pop.appendChild(popSection('סטטוס', filterSel(filters.status, STATUSES.map(function (x) { return x.key; }), 'הכל', 'status')));
        pop.appendChild(popSection('תחום', filterSel(filters.domain, s.taskDomains || [], 'הכל', 'domain')));
        pop.appendChild(popSection('אחראי', filterSel(filters.owner, s.taskOwners || [], 'הכל', 'owner')));
        pop.appendChild(popSection('עדיפות', filterSel(filters.priority, PRIORITIES.map(function (x) { return x.key; }), 'הכל', 'priority')));
        var dueWrap = U.el('div', { style: 'display:flex;gap:5px;flex-wrap:wrap;' }, bucketDefs.map(function (bd) {
          var n = notDone.filter(function (t) { return dueBucket(t) === bd.key; }).length;
          var on = filters.due === bd.key;
          var b = U.el('button', { class: 'm-duechip' + (on ? ' on' : ''), text: bd.label + ' ' + n });
          b.addEventListener('click', function () { filters.due = on ? '' : bd.key; App.render(); });
          return b;
        }));
        pop.appendChild(popSection('תאריך יעד', dueWrap));
        if (activeCount) {
          pop.appendChild(U.el('button', { class: 'btn secondary', style: 'width:100%;margin-top:10px;justify-content:center;', text: '✕ ניקוי כל הסינונים', onclick: function () {
            filters.status = filters.domain = filters.owner = filters.priority = filters.due = ''; App.render();
          } }));
        }
      });

      var toolbar = U.el('div', { class: 'm-toolbar' }, [q, filterBtn]);
      if (viewMode === 'table') {
        toolbar.appendChild(popBtn('↕️ מיון: ' + SORT_LBL[sortBy], 0, function (pop) {
          Object.keys(SORT_LBL).forEach(function (k) {
            pop.appendChild(U.el('button', { class: 'm-popitem' + (sortBy === k ? ' on' : ''), text: SORT_LBL[k], onclick: function () { sortBy = k; App.render(); } }));
          });
        }));
        toolbar.appendChild(popBtn('▦ קיבוץ: ' + GROUP_LBL[groupBy], 0, function (pop) {
          Object.keys(GROUP_LBL).forEach(function (k) {
            pop.appendChild(U.el('button', { class: 'm-popitem' + (groupBy === k ? ' on' : ''), text: GROUP_LBL[k], onclick: function () { groupBy = k; App.render(); } }));
          });
        }));
      }
      view.appendChild(toolbar);

      // צ'יפים של הסינונים הפעילים — הסרה בלחיצה
      if (activeCount) {
        var chipDefs = [
          { key: 'status', txt: filters.status }, { key: 'domain', txt: filters.domain },
          { key: 'owner', txt: '👤 ' + filters.owner }, { key: 'priority', txt: 'עדיפות: ' + filters.priority },
          { key: 'due', txt: DUE_LBL[filters.due] }
        ].filter(function (c) { return filters[c.key]; });
        view.appendChild(U.el('div', { class: 'm-chiprow' }, chipDefs.map(function (c) {
          return U.el('button', { class: 'm-fchip', title: 'הסרת הסינון', text: c.txt + '  ✕', onclick: function () { filters[c.key] = ''; App.render(); } });
        }).concat([
          U.el('button', { class: 'm-clearall', text: 'נקה הכל', onclick: function () {
            filters.status = filters.domain = filters.owner = filters.priority = filters.due = ''; App.render();
          } })
        ])));
      }
    }

    var host = U.el('div');
    view.appendChild(host);

    function refresh() {
      U.clear(host);
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
          U.el('h3', { style: 'margin-top:0;', text: 'המשימות שלי מאירועים (' + mine.length + ')' }),
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

  // renderTimeline/renderDashboard נשמרים לשימוש גיליון "דשבורד מנהלים" שייבנה בהמשך
  global.TasksView = { render: render, renderTimeline: renderTimeline, renderDashboard: renderDashboard };
})(window);
