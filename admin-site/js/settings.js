/* settings.js — מסך הגדרות: תעריפים, חתימה, סטטוסים, גיבוי/שחזור */
(function (global) {
  'use strict';
  var U = global.U;

  function fld(label, node, hint) {
    return U.el('div', { class: 'field' }, [
      U.el('label', { text: label }),
      node,
      hint ? U.el('div', { class: 'muted', style: 'font-size:12px;margin-top:2px;', text: hint }) : null
    ].filter(Boolean));
  }

  // ---------- אירועים וטיולים: תפקידים, מחסן משימות, סוגי אירועים ----------
  function empOptions(selectedId) {
    return [U.el('option', { value: '', text: '— לא משויך —' })].concat(
      Store.employees().map(function (e) { return U.el('option', { value: e.id, text: Store.empName(e) }); }));
  }
  function eventRolesCard() {
    var s = Store.settings();
    var list = U.el('div');
    function draw() {
      U.clear(list);
      (s.eventRoles || []).forEach(function (r, idx) {
        var name = U.el('input', { value: r.name || '', style: 'flex:1;min-width:120px;' });
        name.addEventListener('change', function () { r.name = name.value.trim(); Store.saveSettings(); });
        var sel = U.el('select', { style: 'min-width:160px;' }, empOptions(r.empId));
        sel.value = r.empId || '';
        sel.addEventListener('change', function () { r.empId = sel.value; Store.saveSettings(); });
        var del = U.el('button', { class: 'btn secondary', text: '🗑', title: 'מחיקת תפקיד', onclick: function () { s.eventRoles.splice(idx, 1); Store.saveSettings(); draw(); } });
        list.appendChild(U.el('div', { style: 'display:flex;gap:6px;align-items:center;margin-bottom:6px;flex-wrap:wrap;' }, [name, U.el('span', { class: 'muted', text: '→' }), sel, del]));
      });
    }
    draw();
    var addName = U.el('input', { placeholder: 'תפקיד חדש', style: 'flex:1;min-width:120px;' });
    function add() { if (!addName.value.trim()) return; if (!s.eventRoles) s.eventRoles = []; s.eventRoles.push({ name: addName.value.trim(), empId: '' }); Store.saveSettings(); addName.value = ''; draw(); }
    addName.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    return U.el('div', { class: 'card', style: 'max-width:560px;margin-bottom:16px;' }, [
      U.el('h3', { text: '🧑‍🤝‍🧑 תפקידים ומיפוי לעובדים' }),
      U.el('p', { class: 'muted', style: 'margin-top:0;font-size:12px;', text: 'כל תפקיד ממופה לעובד מהמצבת. משימות אירוע מקבלות אחראי אוטומטי לפי המיפוי.' }),
      list,
      U.el('div', { style: 'display:flex;gap:6px;margin-top:8px;' }, [addName, U.el('button', { class: 'btn secondary', text: 'הוסף תפקיד', onclick: add })])
    ]);
  }
  function taskCatalogCard() {
    var s = Store.settings();
    var roleNames = (s.eventRoles || []).map(function (r) { return r.name; });
    var list = U.el('div');
    function draw() {
      U.clear(list);
      (s.taskCatalog || []).forEach(function (c, idx) {
        var title = U.el('input', { value: c.title || '', style: 'flex:2;min-width:150px;' });
        title.addEventListener('change', function () { c.title = title.value.trim(); Store.saveSettings(); });
        var roleW = U.dataListInput(c.defaultRole || '', roleNames, 'תפקיד ברירת מחדל');
        roleW._input.style.minWidth = '140px';
        roleW._input.addEventListener('change', function () { c.defaultRole = roleW.get(); Store.saveSettings(); });
        var del = U.el('button', { class: 'btn secondary', text: '🗑', title: 'מחיקת משימה', onclick: function () { s.taskCatalog.splice(idx, 1); Store.saveSettings(); draw(); } });
        list.appendChild(U.el('div', { style: 'display:flex;gap:6px;align-items:center;margin-bottom:6px;flex-wrap:wrap;' }, [title, roleW, del]));
      });
    }
    draw();
    var addT = U.el('input', { placeholder: 'משימה חדשה', style: 'flex:2;min-width:150px;' });
    function add() { if (!addT.value.trim()) return; if (!s.taskCatalog) s.taskCatalog = []; s.taskCatalog.push({ id: Store.uid(), title: addT.value.trim(), defaultRole: '' }); Store.saveSettings(); addT.value = ''; draw(); }
    addT.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    return U.el('div', { class: 'card', style: 'max-width:560px;margin-bottom:16px;' }, [
      U.el('h3', { text: '📋 מחסן משימות' }),
      U.el('p', { class: 'muted', style: 'margin-top:0;font-size:12px;', text: 'כל סוגי המשימות האפשריים לאירועים. לכל אחת תפקיד-אחראי ברירת מחדל.' }),
      list,
      U.el('div', { style: 'display:flex;gap:6px;margin-top:8px;' }, [addT, U.el('button', { class: 'btn secondary', text: 'הוסף משימה', onclick: add })])
    ]);
  }
  function eventTypesCard() {
    var s = Store.settings();
    var list = U.el('div');
    function draw() {
      U.clear(list);
      (s.eventTypes || []).forEach(function (t, idx) {
        var label = U.el('input', { value: t.label || '', style: 'font-weight:600;flex:1;min-width:140px;' });
        label.addEventListener('change', function () { t.label = label.value.trim(); Store.saveSettings(); });
        var del = U.el('button', { class: 'btn secondary', text: '🗑', title: 'מחיקת סוג', onclick: function () { s.eventTypes.splice(idx, 1); Store.saveSettings(); draw(); } });
        var checks = (s.taskCatalog || []).map(function (c) {
          var cb = U.el('input', { type: 'checkbox', checked: (t.defaultTaskIds || []).indexOf(c.id) !== -1 });
          cb.addEventListener('change', function () {
            if (!t.defaultTaskIds) t.defaultTaskIds = [];
            var i = t.defaultTaskIds.indexOf(c.id);
            if (cb.checked && i === -1) t.defaultTaskIds.push(c.id);
            else if (!cb.checked && i !== -1) t.defaultTaskIds.splice(i, 1);
            Store.saveSettings();
          });
          return U.el('label', { style: 'display:inline-flex;align-items:center;gap:4px;font-size:12px;margin:0 8px 4px 0;cursor:pointer;' }, [cb, c.title]);
        });
        list.appendChild(U.el('div', { style: 'border:1px solid var(--border,#d6dce1);border-radius:8px;padding:10px;margin-bottom:8px;' }, [
          U.el('div', { style: 'display:flex;gap:6px;align-items:center;margin-bottom:6px;' }, [label, del]),
          U.el('div', { style: 'display:flex;flex-wrap:wrap;' }, checks.length ? checks : [U.el('span', { class: 'muted', style: 'font-size:12px;', text: 'אין משימות במחסן' })])
        ]));
      });
    }
    draw();
    var addL = U.el('input', { placeholder: 'סוג אירוע חדש', style: 'flex:1;min-width:150px;' });
    function add() { if (!addL.value.trim()) return; if (!s.eventTypes) s.eventTypes = []; s.eventTypes.push({ id: Store.uid(), label: addL.value.trim(), defaultTaskIds: [], scheduleTemplate: [] }); Store.saveSettings(); addL.value = ''; draw(); }
    addL.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    return U.el('div', { class: 'card', style: 'max-width:560px;margin-bottom:16px;' }, [
      U.el('h3', { text: '🗓️ סוגי אירועים ותבניות משימות' }),
      U.el('p', { class: 'muted', style: 'margin-top:0;font-size:12px;', text: 'לכל סוג אירוע — סמנו אילו משימות מהמחסן יסומנו מראש בעת יצירת אירוע מהסוג הזה.' }),
      list,
      U.el('div', { style: 'display:flex;gap:6px;margin-top:8px;' }, [addL, U.el('button', { class: 'btn secondary', text: 'הוסף סוג', onclick: add })])
    ]);
  }

  function render(view) {
    if (!Store.isAdmin()) {
      view.appendChild(U.el('div', { class: 'empty' }, 'למסך ההגדרות יש גישה למנהל בלבד.'));
      return;
    }
    var s = Store.settings();
    view.appendChild(U.el('div', { class: 'page-head' }, [U.el('h2', { text: '⚙️ הגדרות' })]));

    // ---------- תעריפים וחתימה ----------
    var hourly = U.el('input', { type: 'number', step: '1', min: '0', value: s.hourlyRate, style: 'max-width:160px;' });
    var km = U.el('input', { type: 'number', step: '0.1', min: '0', value: s.kmRate, style: 'max-width:160px;' });
    var manager = U.el('input', { value: s.managerName || '', style: 'max-width:280px;' });

    var ratesCard = U.el('div', { class: 'card', style: 'max-width:560px;margin-bottom:16px;' }, [
      U.el('h3', { text: '💰 תעריפים וחתימה' }),
      fld('תעריף שעת תגבור (₪)', hourly, 'משמש בחישוב דוח מרכז למידה'),
      fld('תעריף נסיעות לק"מ (₪)', km, 'משמש בחישוב נסיעות במרכז למידה ובדוח הנסיעות'),
      fld('חתימת המנהל', manager, 'השם שיופיע בתחתית כל דוח בחבילת ה-PDF'),
      U.el('div', { style: 'margin-top:8px;' }, [
        U.el('button', { class: 'btn', text: '💾 שמירת הגדרות', onclick: function () {
          s.hourlyRate = U.num(hourly.value, 80);
          s.kmRate = U.num(km.value, 0.9);
          s.managerName = manager.value.trim() || s.managerName;
          Store.saveSettings();
          U.toast('ההגדרות נשמרו');
          App.render();
        } })
      ])
    ]);
    view.appendChild(ratesCard);

    // ---------- אירועים וטיולים ----------
    view.appendChild(U.el('div', { class: 'page-head', style: 'margin-top:8px;' }, [U.el('h3', { text: '🗓️ תכנון אירועים וטיולים', style: 'font-size:17px;color:var(--primary-dark,#1b5e20);' })]));
    view.appendChild(eventRolesCard());
    view.appendChild(taskCatalogCard());
    view.appendChild(eventTypesCard());

    // ---------- גיבוי ושחזור ----------
    var backupCard = U.el('div', { class: 'card danger-zone', style: 'max-width:560px;' }, [
      U.el('h3', { text: '💾 גיבוי ושחזור' }),
      U.el('p', { class: 'muted', style: 'margin-top:0;', text: 'גיבוי מוריד את כל הנתונים לקובץ. שחזור מחליף את כל הנתונים הנוכחיים.' }),
      U.el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;' }, [
        U.el('button', { class: 'btn secondary', text: '⬇️ גיבוי לקובץ JSON', onclick: Store.exportJSON }),
        U.el('button', { class: 'btn danger', text: '⬆️ שחזור מגיבוי', onclick: function () {
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
        } })
      ])
    ]);
    view.appendChild(backupCard);
  }

  global.SettingsView = { render: render };
})(window);
