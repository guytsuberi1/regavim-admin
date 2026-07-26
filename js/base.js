/* base.js — גיליון "נתוני בסיס": תלמידים לפי כיתה (אנשי צוות מנוהלים בגיליון ניהול עובדים) */
(function (global) {
  'use strict';
  var U = global.U;

  function studentsTable(c) {
    if (!c.students) c.students = [];
    var tbody = U.el('tbody', null, c.students.map(function (st, si) {
      var name = U.el('input', { value: st.name || '', style: 'width:100%;padding:4px 6px;' });
      name.addEventListener('change', function () { st.name = name.value.trim(); Store.saveClasses(); });
      var note = U.el('input', { value: st.note || '', placeholder: 'רגישות / מידע רלוונטי', style: 'width:100%;padding:4px 6px;font-size:13px;color:var(--muted,#6b7884);' });
      note.addEventListener('change', function () { st.note = note.value.trim(); Store.saveClasses(); });
      var del = U.el('button', { class: 'btn secondary', text: '🗑', title: 'הסרת תלמיד/ה', onclick: function () { c.students.splice(si, 1); Store.saveClasses(); App.render(); } });
      return U.el('tr', null, [U.el('td', { style: 'min-width:150px;' }, [name]), U.el('td', { style: 'min-width:180px;' }, [note]), U.el('td', null, [del])]);
    }));
    var tbl = U.el('table', { class: 'grid', style: 'margin-top:4px;' }, [
      U.el('thead', null, U.el('tr', null, ['שם התלמיד/ה', 'הערה', ''].map(function (h) { return U.el('th', { text: h }); }))),
      tbody
    ]);
    var addName = U.el('input', { placeholder: '➕ שם תלמיד/ה ולחצו Enter', style: 'flex:1;min-width:180px;' });
    function add() { var v = addName.value.trim(); if (!v) return; c.students.push({ id: Store.uid(), name: v, note: '' }); Store.saveClasses(); App.render(); }
    addName.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    var addRow = U.el('div', { style: 'display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;' }, [addName, U.el('button', { class: 'btn secondary', text: 'הוסף', onclick: add })]);
    return U.el('div', null, [U.el('div', { class: 'tbl-scroll' }, [tbl]), addRow]);
  }

  function render(view) {
    if (!(Store.isAdmin && Store.isAdmin())) { view.appendChild(U.el('div', { class: 'empty' }, 'לנתוני הבסיס יש גישה למנהל בלבד.')); return; }
    var s = Store.settings();

    view.appendChild(U.el('div', { class: 'page-head' }, [U.el('h2', { text: '🗂️ נתוני בסיס' })]));

    // אנשי צוות — מנוהלים בגיליון ניהול עובדים
    view.appendChild(U.el('div', { class: 'card', style: 'max-width:760px;margin-bottom:18px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;' }, [
      U.el('div', null, [
        U.el('div', { style: 'font-weight:600;', text: '👥 אנשי צוות' }),
        U.el('div', { class: 'muted', style: 'font-size:12px;', text: 'מצבת העובדים (שם · תפקיד · טלפון · תגיות) מנוהלת בגיליון "ניהול עובדים".' })
      ]),
      U.el('span', { class: 'spacer' }),
      U.el('button', { class: 'btn secondary', text: 'למצבת העובדים ›', onclick: function () { App.setView('emp'); } })
    ]));

    // תלמידים לפי כיתה
    view.appendChild(U.el('div', { class: 'page-head', style: 'margin-top:8px;' }, [U.el('h3', { text: '🎓 תלמידים לפי כיתה', style: 'font-size:17px;color:var(--primary-dark,#1b5e20);' })]));
    view.appendChild(U.el('p', { class: 'muted', style: 'font-size:13px;margin:0 0 10px;' }, 'רשימות התלמידים משמשות למעקב "מי חתם / מי חסר" באישורי הורים.'));

    (s.classes || []).forEach(function (c, idx) {
      var name = U.el('input', { value: c.name || '', style: 'font-weight:700;font-size:17px;min-width:120px;padding:4px 6px;' });
      name.addEventListener('change', function () { c.name = name.value.trim(); Store.saveClasses(); });
      var count = U.el('span', { class: 'muted', style: 'font-size:12px;', text: ((c.students || []).length) + ' תלמידים' });
      var del = U.el('button', { class: 'btn secondary ico', text: '🗑', title: 'מחיקת כיתה', onclick: function () {
        Modal.confirm({ title: 'מחיקת כיתה', text: 'למחוק את הכיתה "' + (c.name || '') + '" וכל התלמידים בה?', okLabel: 'מחיקה', danger: true }, function () { s.classes.splice(idx, 1); Store.saveClasses(); App.render(); });
      } });
      view.appendChild(U.el('div', { class: 'card', style: 'max-width:760px;margin-bottom:14px;border-top:3px solid var(--primary,#2e7d32);' }, [
        U.el('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;' }, [U.el('span', { text: '🏫' }), name, count, U.el('span', { class: 'spacer' }), del]),
        studentsTable(c)
      ]));
    });

    if (!(s.classes || []).length) {
      view.appendChild(U.el('div', { class: 'muted', style: 'font-size:13px;margin-bottom:10px;', text: 'עדיין אין כיתות — הוסיפו כיתה למטה.' }));
    }

    var addClass = U.el('input', { placeholder: 'שם כיתה חדשה (למשל: י1)', style: 'flex:1;min-width:180px;' });
    function addC() { if (!addClass.value.trim()) return; if (!s.classes) s.classes = []; s.classes.push({ id: Store.uid(), name: addClass.value.trim(), students: [] }); Store.saveClasses(); App.render(); }
    addClass.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addC(); } });
    view.appendChild(U.el('div', { class: 'card', style: 'max-width:760px;padding:10px;display:flex;gap:6px;align-items:center;flex-wrap:wrap;' }, [addClass, U.el('button', { class: 'btn', text: 'הוסף כיתה', onclick: addC })]));
  }

  global.BaseView = { render: render };
})(window);
