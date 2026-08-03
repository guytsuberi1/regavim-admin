/* projects.js — ניהול פרויקטים: כרטיס לכל פרויקט עם פס תקציב/נוצל/מאזן אוטומטי + תת-משימות */
(function (global) {
  'use strict';
  var U = global.U;

  var PSTATUS = [{ key: 'תכנון', color: '#64748b' }, { key: 'בביצוע', color: '#2563eb' }, { key: 'הושלם', color: '#16a34a' }];
  var ISTATUS = [{ key: 'תכנון', color: '#64748b' }, { key: 'בביצוע', color: '#2563eb' }, { key: 'בוצע', color: '#16a34a' }];
  function money(n) { return (Math.round((n || 0) * 100) / 100).toLocaleString('he-IL') + ' ₪'; }
  function stColor(list, s) { var x = list.filter(function (q) { return q.key === s; })[0]; return x ? x.color : '#64748b'; }

  var focusNewProject = false;
  var showArchiveProj = false;
  // מצב כיווץ תת-משימות פר פרויקט (נשמר מקומית, לא בענן)
  var collapsedMap = (function () { try { return JSON.parse(localStorage.getItem('admin_proj_collapsed') || '{}'); } catch (e) { return {}; } })();
  function saveCollapsed() { try { localStorage.setItem('admin_proj_collapsed', JSON.stringify(collapsedMap)); } catch (e) {} }

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
  // בורר סטטוס כגלולה צבעונית מלאה — אותה קומפוננטה כמו בגיליון המשימות (Monday)
  function pSelect(obj, field, opts, onSave) {
    var sel = U.el('select', { class: 'm-status' },
      opts.map(function (o) { return U.el('option', { value: o.key, text: o.key }); }));
    sel.value = obj[field] || opts[0].key;
    function paint() { sel.style.background = stColor(opts, sel.value); }
    paint();
    sel.addEventListener('change', function () { obj[field] = sel.value; paint(); onSave(); });
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
  function statTile(label, valueNode, accent) {
    return U.el('div', { style: 'flex:1;min-width:120px;padding:8px 12px;border:1px solid var(--border,#e2e8f0);border-radius:10px;background:var(--bg,#f8fafc);' }, [
      U.el('div', { style: 'font-size:12px;color:var(--muted,#6b7884);margin-bottom:2px;', text: label }),
      U.el('div', { style: 'font-size:18px;font-weight:700;' + (accent ? 'color:' + accent + ';' : ''), }, [valueNode])
    ]);
  }
  function budgetBar(p) {
    var b = Store.projectBudget(p);
    var budgetInp = pNumber(p, p, 'budget', '0', function () { App.render(); });
    budgetInp.style.cssText = 'font-size:18px;font-weight:700;border:none;background:transparent;padding:0;width:100%;max-width:none;';
    budgetInp.addEventListener('focus', function () { budgetInp.style.borderBottom = '1px solid var(--brand,#2563eb)'; });
    budgetInp.addEventListener('blur', function () { budgetInp.style.borderBottom = 'none'; });

    var stats = U.el('div', { style: 'display:flex;gap:10px;flex-wrap:wrap;margin:10px 0 8px;' }, [
      statTile('תקציב (₪)', budgetInp),
      statTile('נוצל', U.el('span', { text: money(b.used) })),
      statTile('מאזן', U.el('span', { text: money(b.balance) + (b.over ? '  ⚠️ חריגה' : '') }), b.balance < 0 ? '#dc2626' : '#16a34a')
    ]);
    var wrap = U.el('div', null, [stats]);
    if (b.budget > 0) {
      var pct = Math.min(100, Math.round(b.used / b.budget * 100));
      wrap.appendChild(U.el('div', { style: 'height:8px;border-radius:6px;background:var(--border,#e2e8f0);overflow:hidden;' }, [
        U.el('div', { style: 'height:100%;width:' + pct + '%;background:' + (b.over ? '#dc2626' : '#16a34a') + ';transition:width .2s;' })
      ]));
    }
    return wrap;
  }

  // ---------- התקדמות תת-משימות (פס מקוטע לפי סטטוס) ----------
  function progressBar(p) {
    var items = p.items || [];
    if (!items.length) return null;
    var counts = {}; items.forEach(function (it) { counts[it.status] = (counts[it.status] || 0) + 1; });
    var total = items.length, done = counts['בוצע'] || 0;
    var segs = ISTATUS.map(function (st) {
      var n = counts[st.key] || 0;
      return n ? U.el('div', { title: st.key + ': ' + n, style: 'height:100%;width:' + (n / total * 100) + '%;background:' + st.color + ';' }) : null;
    }).filter(Boolean);
    return U.el('div', { style: 'margin:2px 0 12px;' }, [
      U.el('div', { style: 'display:flex;justify-content:space-between;font-size:12px;color:var(--muted,#6b7884);margin-bottom:4px;' }, [
        U.el('span', { text: 'התקדמות תת-משימות' }),
        U.el('span', { text: done + '/' + total + ' בוצעו (' + Math.round(done / total * 100) + '%)' })
      ]),
      U.el('div', { style: 'height:10px;border-radius:6px;overflow:hidden;display:flex;background:var(--border,#e2e8f0);' }, segs)
    ]);
  }

  // ---------- עמודת ציר זמן לתת-משימה (מתאריך היצירה עד תאריך יעד, מול היום) ----------
  function daysBetween(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / 86400000); }
  function timelineCell(p, it) {
    var wrap = U.el('div', { style: 'min-width:150px;' });
    var dueInp = transp(U.el('input', { type: 'date', value: it.due || '', style: 'font-size:12px;' }));
    dueInp.addEventListener('change', function () { it.due = dueInp.value; saveProj(p); App.render(); });
    wrap.appendChild(dueInp);
    var start = it.createdAt ? String(it.createdAt).slice(0, 10) : (p.createdAt ? String(p.createdAt).slice(0, 10) : '');
    if (start && it.due) {
      var today = U.todayISO();
      var total = daysBetween(start, it.due);
      var elapsed = daysBetween(start, today);
      var pct = total <= 0 ? 100 : Math.max(0, Math.min(100, Math.round(elapsed / total * 100)));
      var done = it.status === 'בוצע';
      var overdue = !done && it.due < today;
      var color = done ? '#16a34a' : (overdue ? '#dc2626' : '#2563eb');
      wrap.appendChild(U.el('div', { style: 'height:7px;border-radius:5px;background:var(--border,#e2e8f0);overflow:hidden;margin-top:4px;' }, [
        U.el('div', { style: 'height:100%;width:' + (done ? 100 : pct) + '%;background:' + color + ';' })
      ]));
      wrap.appendChild(U.el('div', { style: 'font-size:10px;color:var(--muted,#6b7884);margin-top:2px;', text: done ? 'בוצע' : (overdue ? 'באיחור' : pct + '% מהזמן חלף') }));
    }
    return wrap;
  }

  // ---------- עמודת מסמכים לתת-משימה (העלאה/הורדה מרובה) ----------
  function docsCell(p, it) {
    if (!it.docs) it.docs = [];
    var wrap = U.el('div', { style: 'display:flex;flex-direction:column;gap:4px;min-width:130px;' });
    function draw() {
      U.clear(wrap);
      it.docs.forEach(function (d, di) {
        var link = U.el('a', { href: '#', html: U.ICO.clip + ' ' + (d.name || 'קובץ'), title: d.name || 'קובץ', style: 'font-size:12px;cursor:pointer;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' });
        link.addEventListener('click', function (e) { e.preventDefault(); Store.taskFileUrl(d.path).then(function (url) { if (url) global.open(url, '_blank'); else U.toast('הקישור אינו זמין', 'error'); }); });
        var rm = U.el('button', { class: 'btn secondary', text: '×', title: 'הסרה', style: 'padding:0 6px;', onclick: function () { Store.deleteTaskFile(d.path); it.docs.splice(di, 1); saveProj(p); draw(); } });
        wrap.appendChild(U.el('div', { style: 'display:flex;align-items:center;gap:4px;' }, [link, rm]));
      });
      var finp = U.el('input', { type: 'file', style: 'display:none;' });
      finp.addEventListener('change', function () {
        var f = finp.files[0]; if (!f) return; U.toast('מעלה…', 'info');
        Store.uploadTaskFile(f).then(function (res) { it.docs.push(res); saveProj(p); draw(); U.toast('הקובץ הועלה'); })
          .catch(function (e) { U.toast('העלאה נכשלה: ' + e.message, 'error'); });
      });
      wrap.appendChild(U.el('button', { class: 'btn secondary', html: U.ICO.clip + ' העלאה', style: 'font-size:12px;padding:2px 8px;', onclick: function () { finp.click(); } }));
      wrap.appendChild(finp);
    }
    draw();
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
      var doneRow = it.status === 'בוצע';
      var tr = U.el('tr', { style: doneRow ? 'background:var(--primary-light,#e8f5e9);' : '' }, [
        grip,
        U.el('td', { style: 'min-width:150px;' }, pText(p, it, 'desc', 'תיאור', 'width:100%;')),
        U.el('td', null, pList(p, it, 'owner', owners, 'אחראי')),
        U.el('td', null, pSelect(it, 'status', ISTATUS, function () { saveProj(p); App.render(); })),
        U.el('td', null, pList(p, it, 'contractor', contractors, 'מבצע')),
        U.el('td', null, pNumber(p, it, 'cost', 'עלות', function () { App.render(); })),
        U.el('td', null, timelineCell(p, it)),
        U.el('td', null, docsCell(p, it)),
        U.el('td', { style: 'min-width:140px;' }, pText(p, it, 'notes', 'הערות', 'width:100%;')),
        U.el('td', null, U.el('button', { class: 'btn secondary', html: U.ICO.trash, title: 'מחיקת שורה', onclick: function () {
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
      U.el('thead', null, U.el('tr', null, ['', 'תיאור', 'באחריות של', 'סטטוס', 'מבצע', 'עלות', 'ציר זמן', 'מסמכים', 'הערות', ''].map(function (h) { return U.el('th', { text: h }); }))),
      tbody
    ]);
    // שורת הוספה מהירה
    var addDesc = U.el('input', { placeholder: '+ תת-משימה / הוצאה — תיאור ולחץ Enter', style: 'flex:2;min-width:160px;' });
    var addContractor = U.dataListInput('', contractors, 'מבצע'); addContractor._input.style.flex = '1'; addContractor._input.style.minWidth = '100px';
    var addCost = U.el('input', { type: 'number', min: '0', placeholder: 'עלות', style: 'max-width:110px;' });
    function addItem() {
      if (!addDesc.value.trim()) { addDesc.focus(); return; }
      if (!p.items) p.items = [];
      p.items.push({ id: Store.uid(), desc: addDesc.value.trim(), contractor: addContractor.get(), owner: '', cost: addCost.value.trim() === '' ? '' : U.num(addCost.value), notes: '', status: 'תכנון', due: '', docs: [], createdAt: new Date().toISOString() });
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
    var cardCollapsed = !!collapsedMap[p.id];
    var card = U.el('div', { class: 'card m-card', style: 'margin-bottom:12px;' });

    // כפתור כיווץ/פתיחה של כל הכרטיס (לכל פרויקט בנפרד)
    var chevron = U.el('button', { class: 'btn secondary ico', title: cardCollapsed ? 'פתיחת הפרויקט' : 'כיווץ הפרויקט',
      onclick: function () { collapsedMap[p.id] = !cardCollapsed; saveCollapsed(); App.render(); } }, cardCollapsed ? '▸' : '▾');

    // שורת כותרת: מזהה + שם (ימין) · סטטוס + מחיקה (שמאל)
    var numPill = U.el('span', { style: 'font-size:11px;font-weight:700;color:var(--muted,#6b7884);background:var(--bg,#f1f5f9);border-radius:6px;padding:2px 8px;white-space:nowrap;', text: p.num || '' });
    var nameInp = transp(U.el('input', { value: p.name || '', placeholder: 'שם הפרויקט', style: 'font-size:19px;font-weight:700;min-width:160px;flex:1;' }));
    nameInp.addEventListener('change', function () { p.name = nameInp.value.trim(); saveProj(p); });
    var statusSel = pSelect(p, 'status', PSTATUS, function () { if (p.status === 'הושלם') p.archived = true; saveProj(p); App.render(); });
    statusSel.classList.add('m-status-auto');
    var actionBtns = [];
    if (p.archived) {
      actionBtns.push(U.el('button', { class: 'btn secondary ico', html: U.ICO.restore, title: 'שחזור מהארכיון', onclick: function () { p.archived = false; saveProj(p); App.render(); } }));
    } else {
      actionBtns.push(U.el('button', { class: 'btn secondary ico', html: U.ICO.archive, title: 'העברה לארכיון', onclick: function () { p.archived = true; saveProj(p); App.render(); } }));
    }
    var statusDot = U.el('span', { class: 'm-cdot', style: 'background:' + stColor(PSTATUS, p.status) + ';', title: p.status || '' });
    card.appendChild(U.el('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;' },
      [chevron, statusDot, numPill, nameInp, U.el('span', { class: 'spacer' }), statusSel].concat(actionBtns)));

    // כשמכווץ — תקציר בשורה אחת בלבד
    if (cardCollapsed) {
      var cb = Store.projectBudget(p);
      card.appendChild(U.el('div', { style: 'display:flex;gap:14px;flex-wrap:wrap;margin-top:8px;color:var(--muted,#6b7884);font-size:13px;' }, [
        U.el('span', { text: '👤 ' + (p.owner || '—') }),
        U.el('span', { html: U.ICO.copy + ' ' + ((p.items || []).length) + ' תת-משימות' }),
        U.el('span', { style: (cb.over ? 'color:var(--danger,#c62828);font-weight:600;' : ''), text: 'מאזן:' + money(cb.budget - cb.used) })
      ]));
      return card;
    }

    // שורת מטא: אחראי
    var ownerPick = pList(p, p, 'owner', owners, 'בחירת אחראי'); ownerPick._input.style.minWidth = '150px'; ownerPick._input.style.fontSize = '13px';
    card.appendChild(U.el('div', { style: 'display:flex;align-items:center;gap:6px;margin-top:4px;color:var(--muted,#6b7884);font-size:13px;' }, [
      U.el('span', { text: '👤 אחראי:' }), ownerPick
    ]));

    card.appendChild(budgetBar(p));
    var pb = progressBar(p);
    if (pb) card.appendChild(pb);
    var notes = pText(p, p, 'notes', '📝 הערות לפרויקט…', 'width:100%;font-size:13px;color:var(--muted,#6b7884);');
    card.appendChild(U.el('div', { style: 'margin:2px 0 10px;' }, [notes]));

    // תת-משימות — ניתן לכווץ/לפתוח
    var collapsed = !!collapsedMap['items:' + p.id];
    var n = (p.items || []).length;
    var secHead = U.el('button', {
      class: 'btn secondary', style: 'margin:2px 0;',
      onclick: function () { collapsedMap['items:' + p.id] = !collapsed; saveCollapsed(); App.render(); }
    }, (collapsed ? '▸' : '▾') + ' תת-משימות (' + n + ')');
    card.appendChild(secHead);
    if (!collapsed) card.appendChild(itemsTable(p));
    return card;
  }

  // ---------- רינדור ----------
  function render(view) {
    var all = Store.projectsAll().sort(function (a, b) {
      var w = { 'בביצוע': 0, 'תכנון': 1, 'הושלם': 2 };
      return (w[a.status] || 1) - (w[b.status] || 1);
    });
    var activeProjects = all.filter(function (p) { return !p.archived; });
    var archivedProjects = all.filter(function (p) { return !!p.archived; });
    var projects = showArchiveProj ? archivedProjects : activeProjects;

    // הוספה מהירה
    var addName = U.el('input', { placeholder: '+ פרויקט חדש — שם ולחץ Enter', style: 'flex:1;min-width:220px;font-size:15px;' });
    function addProject() {
      if (!addName.value.trim()) { addName.focus(); return; }
      Store.upsertProject({ name: addName.value.trim(), owner: '', status: 'תכנון', budget: '', notes: '', items: [] });
      focusNewProject = true; App.render();
    }
    addName.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addProject(); } });

    view.appendChild(U.el('div', { class: 'page-head' }, [
      U.el('h2', { text: 'ניהול פרויקטים' }),
      U.el('span', { class: 'spacer' })
    ]));

    // תת-טאבים: פרויקטים פעילים / ארכיון
    view.appendChild(U.el('div', { class: 'subtabs', style: 'margin-bottom:12px;' }, [
      U.el('button', { class: showArchiveProj ? '' : 'active', onclick: function () { showArchiveProj = false; App.render(); } }, '🏗️ פרויקטים (' + activeProjects.length + ')'),
      U.el('button', { class: showArchiveProj ? 'active' : '', onclick: function () { showArchiveProj = true; App.render(); } }, '🗄️ ארכיון (' + archivedProjects.length + ')')
    ]));

    if (!showArchiveProj) {
      var totBudget = 0, totUsed = 0, over = 0;
      activeProjects.forEach(function (p) { var b = Store.projectBudget(p); totBudget += b.budget; totUsed += b.used; if (b.over) over++; });
      if (activeProjects.length) {
        view.appendChild(U.el('div', { class: 'kpi-row' }, [
          kpi('', activeProjects.length, 'פרויקטים', 'kpi-neutral'),
          kpi('', money(totBudget), 'סה"כ תקציב', 'kpi-neutral'),
          kpi('', money(totUsed), 'סה"כ נוצל', totUsed > totBudget && totBudget ? 'kpi-warn' : 'kpi-info'),
          over ? kpi('', over, 'בחריגת תקציב', 'kpi-warn') : null
        ].filter(Boolean)));
      }
      view.appendChild(U.el('div', { class: 'card', style: 'padding:10px;margin-bottom:14px;display:flex;gap:6px;align-items:center;' },
        [addName, U.el('button', { class: 'btn', text: 'צור פרויקט', onclick: addProject })]));
      if (focusNewProject) { focusNewProject = false; setTimeout(function () { addName.focus(); }, 0); }
    }

    if (!projects.length) {
      view.appendChild(U.el('div', { class: 'empty' }, showArchiveProj ? 'אין פרויקטים בארכיון.' : 'אין עדיין פרויקטים — הוסיפו אחד למעלה.'));
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
