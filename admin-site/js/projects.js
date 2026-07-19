/* projects.js — ניהול פרויקטים: כרטיס לכל פרויקט עם פס תקציב/נוצל/מאזן אוטומטי + תת-משימות */
(function (global) {
  'use strict';
  var U = global.U;

  var PSTATUS = [{ key: 'תכנון', color: '#64748b' }, { key: 'בביצוע', color: '#2563eb' }, { key: 'הושלם', color: '#16a34a' }];
  var ISTATUS = [{ key: 'תכנון', color: '#64748b' }, { key: 'בביצוע', color: '#2563eb' }, { key: 'בוצע', color: '#16a34a' }];
  function money(n) { return (Math.round((n || 0) * 100) / 100).toLocaleString('he-IL') + ' ₪'; }
  function stColor(list, s) { var x = list.filter(function (q) { return q.key === s; })[0]; return x ? x.color : '#64748b'; }

  var focusNewProject = false;

  // ---------- עוזרי עריכה ישירה (שמירה שקטה, בלי רינדור) ----------
  function saveProj(p) { Store.upsertProject(p); }
  function transp(el) {
    el.style.border = '1px solid transparent'; el.style.background = 'transparent'; el.style.padding = '4px 6px';
    el.addEventListener('focus', function () { el.style.background = 'var(--card,#fff)'; el.style.borderColor = 'var(--border,#d6dce1)'; });
    el.addEventListener('blur', function () { el.style.background = 'transparent'; el.style.borderColor = 'transparent'; });
    return el;
  }
  function pText(p, obj, field, ph, style) {
    var i = transp(U.el('input', { value: obj[field] || '', placeholder: ph || '', style: style || '', autocomplete: 'off' }));
    i.addEventListener('change', function () { obj[field] = i.value.trim(); saveProj(p); });
    return i;
  }
  function pList(p, obj, field, options, ph, rerender) {
    var w = U.dataListInput(obj[field] || '', options, ph || '');
    transp(w._input); w._input.style.minWidth = '110px';
    w._input.addEventListener('change', function () {
      obj[field] = w.get();
      if (field === 'contractor') rememberContractor(w.get());
      saveProj(p); if (rerender) App.render();
    });
    return w;
  }
  function pSelect(obj, field, opts, onSave) {
    var sel = U.el('select', { style: 'padding:4px 6px;border-color:' + stColor(opts, obj[field]) + ';' },
      opts.map(function (o) { return U.el('option', { value: o.key, text: o.key }); }));
    sel.value = obj[field] || opts[0].key;
    sel.addEventListener('change', function () { obj[field] = sel.value; onSave(); });
    return sel;
  }
  function pNumber(p, obj, field, ph, onChange) {
    var i = transp(U.el('input', { type: 'number', min: '0', step: '1', value: (obj[field] === '' || obj[field] == null) ? '' : obj[field], placeholder: ph || '', style: 'max-width:120px;' }));
    i.addEventListener('change', function () { obj[field] = i.value.trim() === '' ? '' : U.num(i.value); saveProj(p); if (onChange) onChange(); });
    return i;
  }
  function rememberContractor(v) {
    v = (v || '').trim(); if (!v) return;
    var s = Store.settings(); if (!s.contractors) s.contractors = [];
    if (s.contractors.indexOf(v) === -1) { s.contractors.push(v); Store.saveSettings(); }
  }

  // ---------- פס תקציב ----------
  function budgetBar(p) {
    var b = Store.projectBudget(p);
    var wrap = U.el('div', { style: 'margin:8px 0;' });
    var line = U.el('div', { style: 'display:flex;gap:14px;flex-wrap:wrap;align-items:center;font-size:14px;margin-bottom:4px;' }, [
      U.el('span', null, ['תקציב: ', pNumber(p, p, 'budget', 'סכום', function () { App.render(); })]),
      U.el('span', null, ['נוצל: ', U.el('strong', { text: money(b.used) })]),
      U.el('span', { style: b.balance < 0 ? 'color:#dc2626;font-weight:700;' : 'color:#16a34a;font-weight:600;' },
        ['מאזן: ', money(b.balance), b.over ? ' ⚠️ חריגה' : ''])
    ]);
    wrap.appendChild(line);
    if (b.budget > 0) {
      var pct = Math.min(100, Math.round(b.used / b.budget * 100));
      var track = U.el('div', { style: 'height:10px;border-radius:6px;background:var(--border,#e2e8f0);overflow:hidden;' }, [
        U.el('div', { style: 'height:100%;width:' + pct + '%;background:' + (b.over ? '#dc2626' : '#16a34a') + ';' })
      ]);
      wrap.appendChild(track);
    }
    return wrap;
  }

  // ---------- טבלת תת-משימות (עם גרירה לסידור מחדש) ----------
  var dragItemId = null;
  function reorderItems(p, targetId) {
    if (!dragItemId || dragItemId === targetId) return;
    var items = p.items || [];
    var fromIdx = items.map(function (x) { return x.id; }).indexOf(dragItemId);
    if (fromIdx < 0) return;
    var moved = items.splice(fromIdx, 1)[0];
    var toIdx = targetId ? items.map(function (x) { return x.id; }).indexOf(targetId) : items.length;
    if (toIdx < 0) toIdx = items.length;
    items.splice(toIdx, 0, moved);
    saveProj(p); App.render();
  }
  function itemsTable(p) {
    var contractors = Store.settings().contractors || [];
    var owners = Store.settings().taskOwners || [];
    var tbody = U.el('tbody', null, (p.items || []).map(function (it) {
      var grip = U.el('td', { style: 'width:24px;text-align:center;color:#94a3b8;cursor:grab;user-select:none;', title: 'גרור לשינוי סדר', text: '⠿' });
      var tr = U.el('tr', null, [
        grip,
        U.el('td', { style: 'min-width:150px;' }, pText(p, it, 'desc', 'תיאור', 'width:100%;')),
        U.el('td', null, pList(p, it, 'contractor', contractors, 'מבצע')),
        U.el('td', null, pList(p, it, 'owner', owners, 'אחראי')),
        U.el('td', null, pNumber(p, it, 'cost', 'עלות', function () { App.render(); })),
        U.el('td', { style: 'min-width:140px;' }, pText(p, it, 'notes', 'הערות', 'width:100%;')),
        U.el('td', null, pSelect(it, 'status', ISTATUS, function () { saveProj(p); App.render(); })),
        U.el('td', null, U.el('button', { class: 'btn secondary', text: '🗑', title: 'מחיקת שורה', onclick: function () {
          p.items = p.items.filter(function (x) { return x.id !== it.id; });
          saveProj(p); App.render();
        } }))
      ]);
      // גרירה מופעלת רק מהידית — כדי לא לפגוע בעריכת התאים
      grip.addEventListener('mousedown', function () { tr.draggable = true; });
      tr.addEventListener('dragstart', function (e) { dragItemId = it.id; tr.style.opacity = '.4'; e.dataTransfer.effectAllowed = 'move'; });
      tr.addEventListener('dragend', function () { tr.draggable = false; tr.style.opacity = ''; dragItemId = null; });
      tr.addEventListener('dragover', function (e) { e.preventDefault(); tr.style.boxShadow = 'inset 0 2px 0 var(--brand,#2563eb)'; });
      tr.addEventListener('dragleave', function () { tr.style.boxShadow = ''; });
      tr.addEventListener('drop', function (e) { e.preventDefault(); tr.style.boxShadow = ''; reorderItems(p, it.id); });
      return tr;
    }));
    var tbl = U.el('table', { class: 'grid', style: 'margin-top:4px;' }, [
      U.el('thead', null, U.el('tr', null, ['', 'תיאור', 'מבצע', 'באחריות של', 'עלות', 'הערות', 'סטטוס', ''].map(function (h) { return U.el('th', { text: h }); }))),
      tbody
    ]);
    // שורת הוספה מהירה
    var addDesc = U.el('input', { placeholder: '➕ תת-משימה / הוצאה — תיאור ולחץ Enter', style: 'flex:2;min-width:160px;' });
    var addContractor = U.dataListInput('', contractors, 'מבצע'); addContractor._input.style.flex = '1'; addContractor._input.style.minWidth = '100px';
    var addCost = U.el('input', { type: 'number', min: '0', placeholder: 'עלות', style: 'max-width:110px;' });
    function addItem() {
      if (!addDesc.value.trim()) { addDesc.focus(); return; }
      if (!p.items) p.items = [];
      p.items.push({ id: Store.uid(), desc: addDesc.value.trim(), contractor: addContractor.get(), owner: '', cost: addCost.value.trim() === '' ? '' : U.num(addCost.value), notes: '', status: 'תכנון' });
      rememberContractor(addContractor.get());
      saveProj(p); App.render();
    }
    addDesc.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addItem(); } });
    var addRow = U.el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:8px;' },
      [addDesc, addContractor, addCost, U.el('button', { class: 'btn secondary', text: 'הוסף', onclick: addItem })]);

    return U.el('div', null, [U.el('div', { class: 'tbl-scroll' }, [tbl]), addRow]);
  }

  // ---------- כרטיס פרויקט ----------
  function projectCard(p) {
    var owners = Store.settings().taskOwners || [];
    var card = U.el('div', { class: 'card', style: 'margin-bottom:16px;border-top:4px solid ' + stColor(PSTATUS, p.status) + ';' });
    var nameInp = transp(U.el('input', { value: p.name || '', placeholder: 'שם הפרויקט', style: 'font-size:18px;font-weight:700;min-width:200px;flex:1;' }));
    nameInp.addEventListener('change', function () { p.name = nameInp.value.trim(); saveProj(p); });
    var ownerPick = pList(p, p, 'owner', owners, 'אחראי'); ownerPick._input.style.minWidth = '120px';
    card.appendChild(U.el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;align-items:center;' }, [
      U.el('span', { style: 'color:#94a3b8;font-size:12px;', text: p.num || '' }),
      nameInp,
      U.el('span', { style: 'display:flex;align-items:center;gap:4px;', text: 'אחראי:' }),
      ownerPick,
      pSelect(p, 'status', PSTATUS, function () { saveProj(p); App.render(); }),
      U.el('button', { class: 'btn secondary', text: '🗑', title: 'מחיקת פרויקט', onclick: function () {
        Modal.confirm({ title: 'מחיקת פרויקט', text: 'למחוק את "' + (p.name || '') + '" וכל תת-המשימות שלו?', okLabel: 'מחיקה', danger: true }, function () { Store.deleteProject(p.id); App.render(); });
      } })
    ]));
    card.appendChild(budgetBar(p));
    var notes = pText(p, p, 'notes', 'הערות לפרויקט…', 'width:100%;font-size:13px;color:var(--muted,#6b7884);');
    card.appendChild(U.el('div', { style: 'margin:4px 0 8px;' }, [notes]));
    card.appendChild(itemsTable(p));
    return card;
  }

  // ---------- רינדור ----------
  function render(view) {
    var projects = Store.projectsAll().sort(function (a, b) {
      var w = { 'בביצוע': 0, 'תכנון': 1, 'הושלם': 2 };
      return (w[a.status] || 1) - (w[b.status] || 1);
    });

    // הוספה מהירה
    var addName = U.el('input', { placeholder: '➕ פרויקט חדש — שם ולחץ Enter', style: 'flex:1;min-width:220px;font-size:15px;' });
    function addProject() {
      if (!addName.value.trim()) { addName.focus(); return; }
      Store.upsertProject({ name: addName.value.trim(), owner: '', status: 'תכנון', budget: '', notes: '', items: [] });
      focusNewProject = true; App.render();
    }
    addName.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addProject(); } });

    view.appendChild(U.el('div', { class: 'page-head' }, [U.el('h2', { text: '🏗️ ניהול פרויקטים' })]));

    // סיכום
    var totBudget = 0, totUsed = 0, over = 0;
    projects.forEach(function (p) { var b = Store.projectBudget(p); totBudget += b.budget; totUsed += b.used; if (b.over) over++; });
    if (projects.length) {
      view.appendChild(U.el('div', { class: 'kpi-row' }, [
        kpi('🏗️', projects.length, 'פרויקטים', 'kpi-neutral'),
        kpi('💰', money(totBudget), 'סה"כ תקציב', 'kpi-neutral'),
        kpi('📉', money(totUsed), 'סה"כ נוצל', totUsed > totBudget && totBudget ? 'kpi-warn' : 'kpi-info'),
        over ? kpi('⚠️', over, 'בחריגת תקציב', 'kpi-warn') : null
      ].filter(Boolean)));
    }

    view.appendChild(U.el('div', { class: 'card', style: 'padding:10px;margin-bottom:14px;display:flex;gap:6px;align-items:center;' },
      [addName, U.el('button', { class: 'btn', text: 'צור פרויקט', onclick: addProject })]));
    if (focusNewProject) { focusNewProject = false; setTimeout(function () { addName.focus(); }, 0); }

    if (!projects.length) {
      view.appendChild(U.el('div', { class: 'empty' }, 'אין עדיין פרויקטים — הוסיפו אחד למעלה.'));
      return;
    }
    projects.forEach(function (p) { view.appendChild(projectCard(p)); });
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

  global.ProjectsView = { render: render };
})(window);
