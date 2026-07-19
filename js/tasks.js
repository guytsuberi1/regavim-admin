/* tasks.js — גיליון ניהול משימות (בבנייה; ממתין לתכנון מול המשתמש) */
(function (global) {
  'use strict';
  var U = global.U;

  function render(view) {
    view.appendChild(U.el('div', { class: 'page-head' }, [U.el('h2', { text: '✅ ניהול משימות' })]));
    view.appendChild(U.el('div', { class: 'card', style: 'max-width:560px;' }, [
      U.el('p', { style: 'font-size:15px;line-height:1.7;margin-top:0;' },
        'הגיליון הזה בתכנון — נעצב אותו יחד לפני הבנייה.'),
      U.el('p', { class: 'muted', style: 'margin-bottom:0;' },
        'בקרוב: רשימת משימות אדמיניסטרטיביות עם אחראי, תאריך יעד, סטטוס ותזכורות.')
    ]));
  }

  global.TasksView = { render: render };
})(window);
