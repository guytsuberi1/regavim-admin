/* users.js — ניהול הרשאות וחשבונות התחברות (מנהל בלבד).
   שלוש רמות: מנהל · הנהלה · מזכירות. יצירת חשבון/איפוס סיסמה דרך פונקציית השרת manage-users,
   ופרטי ההתחברות נשלחים לעובד בוואטסאפ. */
(function (global) {
  'use strict';
  var U = global.U;

  var SITE_URL = 'https://guytsuberi1.github.io/regavim-admin/';
  var ROLE_OPTS = [
    { key: 'secretary', label: 'מזכירות — מרכז למידה בלבד' },
    { key: 'manager', label: 'הנהלה — כל הגיליונות (בלי הגדרות ונתוני בסיס)' },
    { key: 'admin', label: 'מנהל — גישה מלאה' }
  ];

  // סיסמה ראשונית קריאה: בלי i/l/o/0/1 שמתבלבלים, ובמחולל אקראי קריפטוגרפי
  function randIndex(max) {
    try {
      if (global.crypto && global.crypto.getRandomValues) {
        var lim = 256 - (256 % max), buf = new Uint8Array(1);
        for (var k = 0; k < 50; k++) {
          global.crypto.getRandomValues(buf);
          if (buf[0] < lim) return buf[0] % max;
        }
      }
    } catch (e) {}
    return Math.floor(Math.random() * max);
  }
  function genPassword() {
    var a = 'abcdefghjkmnpqrstuvwxyz', n = '23456789', s = '';
    for (var i = 0; i < 6; i++) s += a[randIndex(a.length)];
    for (var j = 0; j < 4; j++) s += n[randIndex(n.length)];
    return s;
  }
  function credsMessage(name, email, password) {
    return 'שלום ' + name + ',\n' +
      'פרטי הכניסה לאפליקציית התפעול של ישיבת רגבים בנימין:\n' +
      'קישור: ' + SITE_URL + '\n' +
      'אימייל: ' + email + '\n' +
      'סיסמה: ' + password + '\n' +
      'מומלץ לשמור את ההודעה.';
  }

  // יצירה/איפוס סיסמה ואז פתיחת וואטסאפ עם הפרטים מוכנים לשליחה
  function sendCredentials(emp, email, hasAccount) {
    Modal.confirm({
      title: 'שליחת פרטי התחברות בוואטסאפ',
      text: (hasAccount ? 'תיווצר סיסמה חדשה ל' : 'ייווצר חשבון ל') + '"' + Store.empName(emp) + '"' +
        '\nוייפתח וואטסאפ עם האימייל, הסיסמה והקישור מוכנים לשליחה.',
      okLabel: 'המשך'
    }, function () {
      var win = window.open('', '_blank');            // נפתח מיד — אחרת חוסם הפופאפים חוסם
      if (win) win.opener = null;
      var pwd = genPassword();
      Store.manageUsers({ action: hasAccount ? 'resetPassword' : 'create', email: email, password: pwd })
        .then(function () {
          var wn = U.waNumber(emp.phone);
          var url = (wn ? 'https://wa.me/' + wn : 'https://wa.me/') +
            '?text=' + encodeURIComponent(credsMessage(Store.empName(emp), email, pwd));
          if (win) win.location = url; else window.open(url, '_blank');
          U.toast(hasAccount ? 'הסיסמה אופסה — ההודעה מוכנה בוואטסאפ' : 'החשבון נוצר — ההודעה מוכנה בוואטסאפ');
          App.render();
        })
        .catch(function (e) {
          if (win) win.close();
          U.toast('שגיאה: ' + (e.message || e), 'error');
        });
    });
  }

  function copyCredentials(emp, email, hasAccount) {
    var pwd = genPassword();
    Store.manageUsers({ action: hasAccount ? 'resetPassword' : 'create', email: email, password: pwd })
      .then(function () {
        var txt = credsMessage(Store.empName(emp), email, pwd);
        return navigator.clipboard.writeText(txt).then(function () { U.toast('פרטי ההתחברות הועתקו'); });
      })
      .catch(function (e) { U.toast('שגיאה: ' + (e.message || e), 'error'); });
  }

  function delAccount(emp, email) {
    Modal.confirm({
      title: 'מחיקת חשבון התחברות',
      text: 'למחוק את חשבון ההתחברות של "' + Store.empName(emp) + '" (' + email + ')?\n' +
        'הוא לא יוכל להתחבר יותר. רשומת העובד עצמה לא תימחק.',
      okLabel: 'מחיקה', danger: true
    }, function () {
      Store.manageUsers({ action: 'delete', email: email })
        .then(function () { U.toast('החשבון נמחק'); App.render(); })
        .catch(function (e) { U.toast('שגיאה: ' + (e.message || e), 'error'); });
    });
  }

  function roleSelect(email) {
    var sel = U.el('select', { style: 'min-width:210px;' },
      ROLE_OPTS.map(function (o) { return U.el('option', { value: o.key, text: o.label }); }));
    sel.value = Store.roleOf ? Store.roleOf(email) : 'secretary';
    sel.addEventListener('change', function () {
      Store.setUserRole(email, sel.value);
      if (email === Store.currentEmail()) {
        U.toast('שינית את ההרשאה של עצמך — המסך נטען מחדש…');
        setTimeout(function () { location.reload(); }, 1200);
        return;
      }
      U.toast('ההרשאה עודכנה');
      App.render();
    });
    return sel;
  }

  var q = '';
  function matches(e) {
    var s = q.trim().toLowerCase();
    if (!s) return true;
    return [Store.empName(e), e.email, e.jobTitle, (e.tags || []).join(' ')]
      .some(function (v) { return String(v || '').toLowerCase().indexOf(s) > -1; });
  }

  function buildTable(emps, accounts, unknown) {
    var rows = emps.map(function (e) {
      var email = (e.email || '').trim();
      var hasAccount = email && accounts[email.toLowerCase()];
      var status;
      if (!email) status = U.el('span', { class: 'tag', style: 'background:#fee2e2;color:#b91c1c;', text: 'חסר אימייל' });
      else if (unknown) status = U.el('span', { class: 'muted', text: '—' });
      else if (hasAccount) status = U.el('span', { class: 'tag', style: 'background:#dcfce7;color:#166534;', text: 'יש חשבון' });
      else status = U.el('span', { class: 'tag', style: 'background:#fef3c7;color:#92400e;', text: 'אין חשבון' });

      var actions = U.el('td', { style: 'white-space:nowrap;' });
      if (!email) {
        actions.appendChild(U.el('span', { class: 'muted', style: 'font-size:12px;', text: 'הוסיפו אימייל בכרטיס העובד' }));
      } else if (unknown) {
        actions.appendChild(U.el('span', { class: 'muted', style: 'font-size:12px;', text: 'נדרשת פריסת manage-users' }));
      } else {
        actions.appendChild(U.el('button', {
          class: 'btn', html: U.WA_SVG + (hasAccount ? ' סיסמה חדשה' : ' פתיחת חשבון'),
          title: hasAccount ? 'איפוס סיסמה ושליחה בוואטסאפ' : 'יצירת חשבון ושליחת הפרטים בוואטסאפ',
          onclick: function () { sendCredentials(e, email, hasAccount); }
        }));
        actions.appendChild(document.createTextNode(' '));
        actions.appendChild(U.el('button', {
          class: 'btn secondary small', html: U.ICO.copy, title: 'יצירת סיסמה והעתקת הפרטים ללוח',
          onclick: function () { copyCredentials(e, email, hasAccount); }
        }));
        if (hasAccount) {
          actions.appendChild(document.createTextNode(' '));
          actions.appendChild(U.el('button', {
            class: 'btn secondary small', html: U.ICO.trash, title: 'מחיקת חשבון ההתחברות',
            onclick: function () { delAccount(e, email); }
          }));
        }
      }

      return U.el('tr', null, [
        U.el('td', null, [
          U.el('strong', { text: Store.empName(e) }),
          e.jobTitle ? U.el('div', { class: 'muted', style: 'font-size:12px;', text: e.jobTitle }) : null
        ].filter(Boolean)),
        U.el('td', { style: 'direction:ltr;text-align:right;', text: email || '—' }),
        U.el('td', null, status),
        U.el('td', null, email ? roleSelect(email) : U.el('span', { class: 'muted', text: '—' })),
        actions
      ]);
    });

    return U.el('div', { class: 'tbl-scroll' }, [U.el('table', { class: 'grid' }, [
      U.el('thead', null, U.el('tr', null, ['עובד', 'אימייל התחברות', 'חשבון', 'הרשאה', 'פעולות']
        .map(function (h) { return U.el('th', { text: h }); }))),
      U.el('tbody', null, rows.length ? rows
        : [U.el('tr', null, U.el('td', { colspan: '5', class: 'center muted',
            text: q.trim() ? 'אין עובד שתואם את החיפוש.' : 'אין עובדים פעילים במצבת.' }))])
    ])]);
  }

  function render(view) {
    if (!Store.isAdmin()) { view.appendChild(U.el('div', { class: 'empty' }, 'למסך ההרשאות יש גישה למנהל בלבד.')); return; }

    view.appendChild(U.el('div', { class: 'page-head' }, [
      U.el('h2', { text: 'ניהול הרשאות' }),
      U.el('span', { class: 'spacer' }),
      U.el('button', { class: 'btn secondary', html: U.ICO.refresh, title: 'רענון', onclick: function () { App.render(); } })
    ]));
    view.appendChild(U.el('div', { class: 'card m-card', style: 'margin-bottom:14px;' }, [
      U.el('div', { class: 'muted', style: 'font-size:13px;line-height:1.7;' }, [
        U.el('div', null, 'לכל עובד עם אימייל אפשר לפתוח חשבון התחברות ולקבוע מה הוא רואה:'),
        U.el('div', null, '· מנהל — כל הגיליונות, כולל הגדרות ונתוני בסיס.'),
        U.el('div', null, '· הנהלה — כל הגיליונות למעט הגדרות ונתוני בסיס.'),
        U.el('div', null, '· מזכירות — מרכז למידה בלבד.'),
        U.el('div', { style: 'margin-top:4px;' }, 'האימייל נקבע בכרטיס העובד (ניהול עובדים).')
      ])
    ]));

    var all = Store.employees().slice().sort(function (a, b) {
      return Store.empName(a).localeCompare(Store.empName(b), 'he');
    });

    // חיפוש — הטבלה נבנית מחדש בלי App.render() כדי לא לאבד פוקוס תוך כדי הקלדה
    var qi = U.el('input', { value: q, placeholder: 'חיפוש עובד — שם, אימייל, תפקיד…', style: 'flex:1;min-width:0;' });
    var count = U.el('span', { class: 'muted', style: 'font-size:12px;white-space:nowrap;' });
    view.appendChild(U.el('div', { style: 'display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap;' }, [
      qi, count,
      U.el('button', { class: 'btn secondary small', text: 'ניקוי',
        onclick: function () { q = ''; qi.value = ''; redraw(); } })
    ]));

    var wrap = U.el('div');
    view.appendChild(wrap);
    wrap.appendChild(U.el('div', { class: 'card', text: 'טוען חשבונות…' }));

    var accountsMap = null, unknownAcc = false;
    function redraw() {
      var emps = all.filter(matches);
      count.textContent = 'מוצגים ' + emps.length + ' מתוך ' + all.length;
      U.clear(wrap);
      wrap.appendChild(buildTable(emps, accountsMap || {}, unknownAcc));
    }
    qi.addEventListener('input', function () { q = qi.value; if (accountsMap || unknownAcc) redraw(); });

    Store.manageUsers({ action: 'list' }).then(function (res) {
      var accounts = {};
      (res.users || []).forEach(function (u) { if (u.email) accounts[String(u.email).toLowerCase()] = true; });
      accountsMap = accounts;
      redraw();
    }).catch(function (e) {
      // הפונקציה אינה זמינה — קביעת ההרשאות עצמה לא תלויה בשרת וממשיכה לעבוד
      unknownAcc = true;
      var msg = (e && e.message) ? e.message : 'פונקציית manage-users לא נענתה';
      var diag = U.el('div', { class: 'muted', style: 'font-size:12px;margin-top:6px;', text: 'בודק מה בדיוק קרה…' });
      view.insertBefore(U.el('div', { class: 'card', style: 'border-color:#d97706;background:#fffbeb;margin-bottom:10px;' }, [
        U.el('div', { style: 'font-weight:600;', text: 'יצירת חשבונות ואיפוס סיסמאות אינם זמינים כרגע' }),
        U.el('div', { class: 'muted', style: 'font-size:12px;margin-top:4px;', text: 'ההודעה מהספרייה: ' + msg }),
        diag,
        U.el('div', { class: 'muted', style: 'font-size:12px;margin-top:6px;',
          text: 'קביעת ההרשאות בטבלה למטה עובדת כרגיל — רק פתיחת חשבון, איפוס סיסמה ומחיקה חסומים.' })
      ]), wrap);
      redraw();
      // ההודעה של supabase-js זהה לשלוש תקלות שונות לגמרי — קריאה ישירה מגלה איזו מהן
      if (Store.manageUsersDiagnose) {
        Store.manageUsersDiagnose().then(function (d) {
          U.clear(diag);
          diag.appendChild(U.el('div', { style: 'font-weight:600;font-size:12px;color:var(--text);',
            text: 'הסיבה האמיתית' + (d.status ? ' (קוד ' + d.status + ')' : '') + ':' }));
          diag.appendChild(U.el('div', { style: 'font-size:12px;color:var(--text);', text: d.hint }));
          if (d.body) diag.appendChild(U.el('div', { style: 'font-size:11px;direction:ltr;text-align:right;margin-top:2px;', text: d.body }));
        });
      }
    });
  }

  global.UsersView = { render: render };
})(window);
