/* sub.js — דוח שעות מילוי מקום: שורות פר מורה מחליף */
(function (global) {
  'use strict';
  var U = global.U;

  var selectedEmpId = null;

  // מחליפים: כל מי שיש לו רשומות החודש; הוספה — בחירה מכל המצבת
  function substitutes(month) {
    var ids = {};
    Store.records('sub', month).forEach(function (r) { if (r.empId) ids[r.empId] = true; });
    return Object.keys(ids).map(Store.empById).filter(Boolean)
      .sort(function (a, b) { return Store.empName(a).localeCompare(Store.empName(b), 'he'); });
  }

  // מפת "מורה נעדר → סיבה" מתוך דוח ההיעדרויות של החודש (רק מי שדיווח או שגיא רשם)
  function absentMap(month) {
    var map = {};
    Store.records('abs', month, function (r) { return r.kind === 'absence'; }).forEach(function (r) {
      if (r.name && !map[r.name]) map[r.name] = r.reason || '';
    });
    return map;
  }

  function openRecModal(month, empId, rec) {
    rec = rec || { empId: empId };
    // המורה המחליף — חיפוש חופשי במצבת (רק כשמוסיפים שורה חדשה כללית)
    var empNames = Store.employees().map(Store.empName);
    var subPicker = empId ? null : U.dataListInput(rec.empId ? Store.empName(rec.empId) : '', empNames, 'חיפוש מורה מחליף…');
    var date = U.el('input', { type: 'date', value: rec.date || U.todayISO() });
    // מורה נעדר — רק מי שמופיע בדוח ההיעדרויות של החודש
    var amap = absentMap(month);
    var absentNames = Object.keys(amap).sort(function (a, b) { return a.localeCompare(b, 'he'); });
    var absent = U.dataListInput(rec.absentName || '', absentNames, absentNames.length ? 'בחירה מדוח ההיעדרויות…' : 'אין היעדרויות רשומות החודש');
    var reason = U.el('input', { value: rec.reason || '', placeholder: 'מיל׳ / מחלה / השתלמות…' });
    // מילוי אוטומטי של סיבת ההיעדרות לפי המורה הנעדר
    absent._input.addEventListener('change', function () {
      var nm = absent.get();
      if (amap[nm] != null && !reason.value.trim()) reason.value = amap[nm];
    });
    absent._input.addEventListener('input', function () {
      var nm = absent.get();
      if (amap[nm]) reason.value = amap[nm];
    });
    var hours = U.el('input', { type: 'number', step: '0.5', min: '0', value: rec.hours != null ? rec.hours : 1, style: 'max-width:110px;' });
    var purpose = U.el('input', { value: rec.purpose || '', placeholder: 'תנ"ך / הוראה / ניהול תיכון…' });
    var note = U.el('input', { value: rec.note || '', placeholder: 'הערות' });
    var err = U.el('div', { class: 'field-err' });
    function fld(label, node) { return U.el('div', { class: 'field' }, [U.el('label', { text: label }), node]); }
    var body = U.el('div', null, [
      subPicker ? fld('המורה המחליף', subPicker) : null,
      U.el('div', { class: 'row' }, [fld('תאריך', date), fld('מס׳ שעות', hours)]),
      fld('המורה הנעדר', absent),
      absentNames.length ? null : U.el('div', { class: 'muted', style: 'font-size:12px;margin-top:-6px;' }, 'טיפ: מורים נעדרים נמשכים מדוח ההיעדרויות. רשמו שם היעדרות והם יופיעו כאן.'),
      U.el('div', { class: 'row' }, [fld('סיבת ההיעדרות', reason), fld('פירוט ייעוד השעה', purpose)]),
      fld('הערות', note),
      err
    ]);
    Modal.open(rec.id ? '✏️ עריכת שורה' : '➕ שורת מילוי מקום', body, [
      { label: 'ביטול', class: 'secondary' },
      { label: 'שמירה', onClick: function (close) {
        var targetEmp = empId;
        if (!targetEmp && subPicker) {
          var nm = subPicker.get();
          var match = Store.employees().filter(function (e) { return Store.empName(e) === nm; })[0];
          if (!match) { err.textContent = 'בחרו מורה מחליף מהרשימה'; return; }
          targetEmp = match.id;
        }
        if (!targetEmp) { err.textContent = 'נדרש לבחור את המורה המחליף'; return; }
        if (!date.value) { err.textContent = 'נדרש תאריך'; return; }
        if (!U.num(hours.value)) { err.textContent = 'נדרש מספר שעות'; return; }
        rec.empId = targetEmp;
        rec.date = date.value;
        rec.absentName = absent.get();
        rec.reason = reason.value.trim();
        rec.hours = U.num(hours.value);
        rec.purpose = purpose.value.trim();
        rec.note = note.value.trim();
        Store.upsertRecord('sub', month, rec);
        selectedEmpId = targetEmp;
        close();
        App.render();
      } }
    ]);
  }

  function render(view) {
    var month = App.currentMonth();
    view.appendChild(App.monthHeader('🔁 דוח מילוי מקום', [
      U.el('span', { class: 'spacer' }),
      U.el('button', { class: 'btn', text: '➕ שורת מילוי מקום', onclick: function () { openRecModal(month, null, null); } })
    ]));

    var list = substitutes(month);
    if (!list.length) {
      view.appendChild(U.el('div', { class: 'empty' }, 'אין עדיין דיווחי מילוי מקום החודש — לחצו "➕ שורת מילוי מקום"'));
      return;
    }
    if (!selectedEmpId || !list.some(function (e) { return e.id === selectedEmpId; })) selectedEmpId = list[0].id;

    var tabs = U.el('div', { class: 'subtabs' }, list.map(function (e) {
      var hrs = 0;
      Store.records('sub', month, function (r) { return r.empId === e.id; }).forEach(function (r) { hrs += U.num(r.hours); });
      return U.el('button', {
        class: e.id === selectedEmpId ? 'active' : '',
        onclick: function () { selectedEmpId = e.id; App.render(); }
      }, [Store.empName(e) + ' · ' + hrs + ' ש׳']);
    }));
    view.appendChild(tabs);

    var recs = Store.records('sub', month, function (r) { return r.empId === selectedEmpId; });
    var totalHours = 0;
    recs.forEach(function (r) { totalHours += U.num(r.hours); });

    var card = U.el('div', { class: 'card' });
    card.appendChild(U.el('div', { class: 'page-head', style: 'margin-bottom:8px;' }, [
      U.el('h3', { text: Store.empName(selectedEmpId) }),
      U.el('span', { class: 'spacer' }),
      U.el('button', { class: 'btn', text: '➕ שורה ל' + Store.empName(selectedEmpId), onclick: function () { openRecModal(month, selectedEmpId, null); } })
    ]));

    var tbl = U.el('table', { class: 'grid' }, [
      U.el('thead', null, U.el('tr', null, ['תאריך', 'מורה נעדר', 'סיבת היעדרות', 'שעות', 'ייעוד השעה', 'הערות', ''].map(function (h) { return U.el('th', { text: h }); }))),
      U.el('tbody', null, recs.map(function (r) {
        return U.el('tr', null, [
          U.el('td', { text: U.gregLabel(r.date) + ' (' + U.weekdayName(r.date) + ')' }),
          U.el('td', { text: r.absentName || '' }),
          U.el('td', { text: r.reason || '' }),
          U.el('td', { text: String(r.hours) }),
          U.el('td', { text: r.purpose || '' }),
          U.el('td', { text: r.note || '' }),
          U.el('td', null, [
            U.el('button', { class: 'btn secondary', text: '✏️', title: 'עריכה', onclick: function () { openRecModal(month, selectedEmpId, JSON.parse(JSON.stringify(r))); } }),
            ' ',
            U.el('button', { class: 'btn secondary', text: '🗑', title: 'מחיקה', onclick: function () {
              Modal.confirm({ title: 'מחיקת שורה', text: 'למחוק את השורה?', okLabel: 'מחיקה', danger: true }, function () {
                Store.deleteRecord('sub', month, r.id);
                App.render();
              });
            } })
          ])
        ]);
      }))
    ]);
    card.appendChild(U.el('div', { class: 'tbl-scroll' }, [tbl]));
    card.appendChild(U.el('div', { class: 'totbar' }, [
      U.el('span', null, ['סה"כ שעות מילוי מקום: ', U.el('strong', { text: String(totalHours) })])
    ]));
    view.appendChild(card);
  }

  global.SubView = { render: render };
})(window);
