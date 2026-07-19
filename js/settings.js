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

    // ---------- סטטוסים ----------
    var statusesCard = U.el('div', { class: 'card', style: 'max-width:560px;margin-bottom:16px;' });
    statusesCard.appendChild(U.el('h3', { text: '🏷️ סטטוסים בלוח השכר' }));
    statusesCard.appendChild(U.el('p', { class: 'muted', style: 'margin-top:0;', text: 'הסטטוסים שאפשר לבחור לכל עובד בלוח השכר החודשי.' }));
    var list = (s.statuses || []).map(function (st) { return { id: st.id, label: st.label, color: st.color }; });
    var rowsWrap = U.el('div');
    function renderStatuses() {
      U.clear(rowsWrap);
      list.forEach(function (st, i) {
        var lbl = U.el('input', { value: st.label, style: 'flex:1;' });
        lbl.addEventListener('input', function () { st.label = lbl.value; });
        var color = U.el('input', { type: 'color', value: st.color || '#64748b', style: 'width:44px;padding:2px;' });
        color.addEventListener('input', function () { st.color = color.value; });
        var del = U.el('button', { class: 'btn secondary', text: '🗑', title: 'מחיקה', onclick: function () { list.splice(i, 1); renderStatuses(); } });
        rowsWrap.appendChild(U.el('div', { style: 'display:flex;gap:6px;margin-bottom:6px;align-items:center;' }, [lbl, color, del]));
      });
    }
    renderStatuses();
    statusesCard.appendChild(rowsWrap);
    statusesCard.appendChild(U.el('div', { style: 'display:flex;gap:8px;margin-top:8px;' }, [
      U.el('button', { class: 'btn secondary', text: '➕ סטטוס חדש', onclick: function () {
        list.push({ id: Store.uid(), label: '', color: '#64748b' });
        renderStatuses();
      } }),
      U.el('button', { class: 'btn', text: '💾 שמירת סטטוסים', onclick: function () {
        s.statuses = list.filter(function (st) { return st.label.trim(); });
        Store.saveSettings();
        U.toast('הסטטוסים נשמרו');
        App.render();
      } })
    ]));
    view.appendChild(statusesCard);

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
