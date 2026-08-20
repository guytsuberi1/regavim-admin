/* gefen.js — דיווח גפ"ן. הגיליון עדיין לא נבנה; המסך הזה מחזיק את המקום
   ומתאר מה מתוכנן, כדי שהטאב לא יוביל למסך ריק. */
(function (global) {
  'use strict';
  var U = global.U;

  // מה שהגיליון אמור לכלול כשייבנה — נכתב כאן ולא רק בתיעוד,
  // כדי שגיא יראה על מה מדובר ויוכל לתקן לפני שמתחילים.
  var PLANNED = [
    'תמונת התקציב של גפ"ן מול הניצול בפועל, לפי אותה שנת כספים של שאר הגיליון',
    'פירוט התוכניות שנרכשו — ספק, היקף, כיתות משתתפות',
    'מעקב אחר הדיווח למשרד החינוך: מה דווח, מה נותר, ומה המועד',
    'משיכת החשבוניות הרלוונטיות מאפליקציית התקציב, כמו בקולות קוראים'
  ];

  function render(view) {
    view.appendChild(U.el('div', { class: 'page-head' }, [
      U.el('h2', { text: 'דיווח גפ"ן' }),
      U.el('span', { class: 'tag', text: 'בבנייה' }),
      U.el('span', { class: 'spacer' })
    ]));

    view.appendChild(U.el('div', { class: 'card m-card' }, [
      U.el('div', { style: 'font-weight:600;margin-bottom:6px;', text: 'הגיליון בבנייה' }),
      U.el('div', { class: 'muted', style: 'font-size:13px;line-height:1.7;margin-bottom:14px;',
        text: 'זה הגיליון האחרון שנותר. עד שייבנה, הדיווח מתנהל מחוץ למערכת. ' +
              'המקום שמור כאן, בין "קולות קוראים" ל"חיפוש חכם".' }),
      U.el('div', { style: 'font-weight:600;font-size:14px;margin-bottom:6px;', text: 'מה מתוכנן להיכנס' }),
      U.el('ul', { class: 'muted', style: 'font-size:13px;line-height:1.9;margin:0;padding-inline-start:18px;' },
        PLANNED.map(function (t) { return U.el('li', { text: t }); }))
    ]));

    view.appendChild(U.el('div', { class: 'muted', style: 'font-size:12px;margin-top:10px;',
      text: 'אם חסר כאן משהו שחייב להיכנס לגיליון — זה הזמן להגיד, לפני שמתחילים לבנות.' }));
  }

  global.GefenView = { render: render };
})(window);
