/* week.js — לוח שבועי כללי: מי מהצוות עובד בכל יום (לפי המבנה השבועי בכרטיס העובד) */
(function (global) {
  'use strict';
  var U = global.U;

  var TAGS = ['מורה', 'פנימיה', 'מנהלה', 'מתגבר'];
  var DAYS_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳'];
  var DAYS_FULL = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי'];

  var filterTag = '';

  // "08:00" → "8:00" · טווח לתצוגה; יום מסומן בלי שעות → ✓
  function fmtTime(t) { return String(t || '').replace(/^0/, ''); }
  function hoursLabel(wh) {
    if (!wh) return '';
    if (!wh.from && !wh.to) return '✓';
    return fmtTime(wh.from) + '–' + fmtTime(wh.to);
  }

  function render(view) {
    var all = Store.employees().map(function (e) {
      if (!Array.isArray(e.workDays)) e.workDays = [];
      if (!e.workHours) {
        e.workHours = {};
        e.workDays.forEach(function (d) { e.workHours[d] = { from: '', to: '' }; });
      }
      return e;
    });

    view.appendChild(U.el('div', { class: 'page-head' }, [
      U.el('h2', { text: '🗓️ לוח שבועי' }),
      U.el('span', { class: 'spacer' })
    ]));

    var tagChips = U.el('div', { style: 'display:flex;gap:6px;align-items:center;margin:0 0 12px;flex-wrap:wrap;' },
      [U.el('span', { class: 'muted', style: 'font-size:13px;', text: 'סינון:' })].concat(TAGS.map(function (t) {
        var b = U.el('button', { class: 'tag', style: 'cursor:pointer;' + (filterTag === t ? 'outline:2px solid var(--brand);' : ''), text: t });
        b.addEventListener('click', function () { filterTag = filterTag === t ? '' : t; App.render(); });
        return b;
      })));
    view.appendChild(tagChips);

    var emps = all.filter(function (e) {
      return !filterTag || (e.tags || []).indexOf(filterTag) !== -1;
    });
    var withDays = emps.filter(function (e) { return Object.keys(e.workHours).length; });
    var withoutDays = emps.filter(function (e) { return !Object.keys(e.workHours).length; });
    withDays.sort(function (a, b) { return Store.empName(a).localeCompare(Store.empName(b), 'he'); });

    if (!withDays.length) {
      view.appendChild(U.el('div', { class: 'empty' }, [
        'עדיין לא הוגדר מבנה שבועי לאף עובד',
        U.el('div', { class: 'muted', style: 'font-size:13px;margin-top:6px;' },
          'נכנסים לכרטיס עובד → לשונית "תפקיד ומבנה שבועי" ומסמנים את ימי העבודה')
      ]));
    } else {
      // ספירה לכל יום
      var counts = [0, 0, 0, 0, 0, 0];
      withDays.forEach(function (e) { Object.keys(e.workHours).forEach(function (d) { counts[Number(d)]++; }); });

      var tbl = U.el('table', { class: 'grid week-grid' }, [
        U.el('thead', null, U.el('tr', null,
          [U.el('th', { text: 'שם' })].concat(DAYS_FULL.map(function (d, i) {
            return U.el('th', null, [
              U.el('div', { text: d }),
              U.el('div', { class: 'muted', style: 'font-size:11px;font-weight:400;', text: counts[i] + ' בצוות' })
            ]);
          })))),
        U.el('tbody', null, withDays.map(function (e) {
          return U.el('tr', { style: 'cursor:pointer;', onclick: function () {
            App.setView('emp');
            EmpView.open(e.id, 'roledef');
          } }, [
            U.el('td', null, [
              U.el('strong', { text: Store.empName(e) }),
              e.jobTitle ? U.el('div', { class: 'muted', style: 'font-size:12px;', text: e.jobTitle }) : null
            ])
          ].concat(DAYS_FULL.map(function (d, i) {
            var wh = e.workHours[i];
            return U.el('td', { class: wh ? 'wd-cell on' : 'wd-cell' }, wh ? hoursLabel(wh) : '');
          })));
        }))
      ]);
      view.appendChild(U.el('div', { class: 'tbl-scroll' }, [tbl]));
    }

    if (withoutDays.length) {
      view.appendChild(U.el('div', { class: 'card', style: 'margin-top:14px;' }, [
        U.el('div', { class: 'muted', style: 'font-size:13px;margin-bottom:6px;' },
          '⏳ טרם הוגדר מבנה שבועי (' + withoutDays.length + ') — לחיצה על שם פותחת את הכרטיס:'),
        U.el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;' }, withoutDays.map(function (e) {
          return U.el('span', { class: 'tag', text: Store.empName(e), style: 'cursor:pointer;', onclick: function () {
            App.setView('emp');
            EmpView.open(e.id, 'roledef');
          } });
        }))
      ]));
    }
  }

  global.WeekView = { render: render };
})(window);
