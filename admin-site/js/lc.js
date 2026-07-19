/* lc.js — דוח מרכז למידה: שורות תגבור פר מתגבר + נסיעות + חישוב תשלום */
(function (global) {
  'use strict';
  var U = global.U;

  var selectedEmpId = null;

  // מתגברים: עובדים עם תגית "מתגבר", ובנוסף כל מי שכבר יש לו רשומות בחודש
  function tutors(month) {
    var ids = {};
    Store.employees().forEach(function (e) {
      if ((e.tags || []).indexOf('מתגבר') !== -1) ids[e.id] = true;
    });
    Store.records('lc', month).forEach(function (r) { if (r.empId) ids[r.empId] = true; });
    return Object.keys(ids).map(Store.empById).filter(Boolean)
      .sort(function (a, b) { return Store.empName(a).localeCompare(Store.empName(b), 'he'); });
  }

  function empTotals(month, empId) {
    var s = Store.settings();
    var hours = 0;
    Store.records('lc', month, function (r) { return r.empId === empId; })
      .forEach(function (r) { hours += U.num(r.hours); });
    var t = Store.lcTravel(month, empId);
    var travel = t ? U.num(t.km) * U.num(t.days) * s.kmRate : 0;
    return { hours: hours, pay: hours * s.hourlyRate, travel: travel, total: hours * s.hourlyRate + travel };
  }

  function money(n) { return (Math.round(n * 100) / 100).toLocaleString('he-IL') + ' ₪'; }

  function openRecModal(month, empId, rec) {
    rec = rec || { empId: empId };
    var date = U.el('input', { type: 'date', value: rec.date || U.todayISO() });
    var subject = U.el('input', { value: rec.subject || '', placeholder: 'מתמטיקה / אנגלית / בחינה בע"פ…' });
    var klass = U.el('input', { value: rec.klass || '', placeholder: 'י / יא / יב…', style: 'max-width:110px;' });
    var students = U.el('input', { value: rec.students || '', placeholder: 'שם התלמיד; אם קבוצה — כל השמות' });
    var hours = U.el('input', { type: 'number', step: '0.5', min: '0', value: rec.hours != null ? rec.hours : 1, style: 'max-width:110px;' });
    var err = U.el('div', { class: 'field-err' });
    function fld(label, node) { return U.el('div', { class: 'field' }, [U.el('label', { text: label }), node]); }
    var body = U.el('div', null, [
      U.el('div', { class: 'row' }, [fld('תאריך', date), fld('שעות', hours)]),
      U.el('div', { class: 'row' }, [fld('מקצוע תגבור', subject), fld('כיתה', klass)]),
      fld('תלמיד/ים', students),
      err
    ]);
    Modal.open(rec.id ? '✏️ עריכת שורה' : '➕ שורת תגבור', body, [
      { label: 'ביטול', class: 'secondary' },
      { label: 'שמירה', onClick: function (close) {
        if (!date.value) { err.textContent = 'נדרש תאריך'; return; }
        if (!U.num(hours.value)) { err.textContent = 'נדרש מספר שעות'; return; }
        rec.date = date.value;
        rec.subject = subject.value.trim();
        rec.klass = klass.value.trim();
        rec.students = students.value.trim();
        rec.hours = U.num(hours.value);
        Store.upsertRecord('lc', month, rec);
        close();
        App.render();
      } }
    ]);
  }

  function openTravelModal(month, empId) {
    var t = Store.lcTravel(month, empId) || {};
    var s = Store.settings();
    var km = U.el('input', { type: 'number', step: '1', min: '0', value: t.km != null ? t.km : '', placeholder: 'ק"מ הלוך ושוב' });
    var days = U.el('input', { type: 'number', step: '1', min: '0', value: t.days != null ? t.days : '', placeholder: 'ימי עבודה' });
    var calc = U.el('div', { class: 'muted' });
    function upd() {
      calc.textContent = 'תשלום נסיעות: ' + U.num(km.value) + ' ק"מ × ' + U.num(days.value) + ' ימים × ' + s.kmRate + ' ₪ = ' + money(U.num(km.value) * U.num(days.value) * s.kmRate);
    }
    km.addEventListener('input', upd);
    days.addEventListener('input', upd);
    upd();
    function fld(label, node) { return U.el('div', { class: 'field' }, [U.el('label', { text: label }), node]); }
    Modal.open('🚗 נסיעות — ' + Store.empName(empId), U.el('div', null, [
      U.el('div', { class: 'row' }, [fld('ק"מ הלוך ושוב', km), fld('כמות ימי עבודה', days)]),
      calc
    ]), [
      { label: 'ביטול', class: 'secondary' },
      { label: 'שמירה', onClick: function (close) {
        Store.setLcTravel(month, empId, U.num(km.value), U.num(days.value));
        close();
        App.render();
      } }
    ]);
  }

  function render(view) {
    var month = App.currentMonth();
    view.appendChild(App.monthHeader('📚 דוח מרכז למידה'));

    var list = tutors(month);
    if (!list.length) {
      view.appendChild(U.el('div', { class: 'empty' }, [
        'אין מתגברים במצבת. ',
        U.el('div', { class: 'muted', style: 'margin-top:6px;' }, 'בנתוני בסיס — סמנו לעובדים את התגית "מתגבר" והם יופיעו כאן.')
      ]));
      return;
    }
    if (!selectedEmpId || !list.some(function (e) { return e.id === selectedEmpId; })) selectedEmpId = list[0].id;

    // סרגל בחירת מתגבר (subtabs) עם סכום לצד השם
    var tabs = U.el('div', { class: 'subtabs' }, list.map(function (e) {
      var t = empTotals(month, e.id);
      var b = U.el('button', {
        class: e.id === selectedEmpId ? 'active' : '',
        onclick: function () { selectedEmpId = e.id; App.render(); }
      }, [Store.empName(e) + (t.hours ? ' · ' + t.hours + ' ש׳' : '')]);
      return b;
    }));
    view.appendChild(tabs);

    var emp = Store.empById(selectedEmpId);
    var s = Store.settings();
    var recs = Store.records('lc', month, function (r) { return r.empId === selectedEmpId; });
    var totals = empTotals(month, selectedEmpId);
    var travel = Store.lcTravel(month, selectedEmpId);

    var card = U.el('div', { class: 'card' });
    card.appendChild(U.el('div', { class: 'page-head', style: 'margin-bottom:8px;' }, [
      U.el('h3', { text: Store.empName(emp) + (emp.phone ? ' · ' + emp.phone : '') }),
      U.el('span', { class: 'spacer' }),
      U.el('button', { class: 'btn secondary', text: '🚗 נסיעות', onclick: function () { openTravelModal(month, selectedEmpId); } }),
      U.el('button', { class: 'btn', text: '➕ שורת תגבור', onclick: function () { openRecModal(month, selectedEmpId, null); } })
    ]));

    if (!recs.length) {
      card.appendChild(U.el('div', { class: 'empty' }, 'אין עדיין שורות החודש — לחצו "➕ שורת תגבור"'));
    } else {
      var tbl = U.el('table', { class: 'grid' }, [
        U.el('thead', null, U.el('tr', null, ['תאריך', 'מקצוע', 'כיתה', 'תלמיד/ים', 'שעות', ''].map(function (h) { return U.el('th', { text: h }); }))),
        U.el('tbody', null, recs.map(function (r) {
          return U.el('tr', null, [
            U.el('td', { text: U.gregLabel(r.date) + ' (' + U.weekdayName(r.date) + ')' }),
            U.el('td', { text: r.subject || '' }),
            U.el('td', { text: r.klass || '' }),
            U.el('td', { text: r.students || '' }),
            U.el('td', { text: String(r.hours) }),
            U.el('td', null, [
              U.el('button', { class: 'btn secondary', text: '✏️', title: 'עריכה', onclick: function () { openRecModal(month, selectedEmpId, JSON.parse(JSON.stringify(r))); } }),
              ' ',
              U.el('button', { class: 'btn secondary', text: '🗑', title: 'מחיקה', onclick: function () {
                Modal.confirm({ title: 'מחיקת שורה', text: 'למחוק את שורת התגבור?', okLabel: 'מחיקה', danger: true }, function () {
                  Store.deleteRecord('lc', month, r.id);
                  App.render();
                });
              } })
            ])
          ]);
        }))
      ]);
      card.appendChild(U.el('div', { class: 'tbl-scroll' }, [tbl]));
    }

    // פס סיכום
    var travelTxt = travel && (U.num(travel.km) * U.num(travel.days)) > 0
      ? travel.km + ' ק"מ × ' + travel.days + ' ימים = ' + money(totals.travel)
      : 'ללא';
    card.appendChild(U.el('div', { class: 'totbar' }, [
      U.el('span', null, ['סה"כ שעות: ', U.el('strong', { text: String(totals.hours) })]),
      U.el('span', null, ['תעריף: ', U.el('strong', { text: s.hourlyRate + ' ₪' })]),
      U.el('span', null, ['נסיעות: ', U.el('strong', { text: travelTxt })]),
      U.el('span', null, ['סה"כ לתשלום: ', U.el('strong', { text: money(totals.total) })])
    ]));
    view.appendChild(card);
  }

  global.LcView = { render: render };
})(window);
