/* abs.js — סיכום היעדרויות: 4 מקטעים (kind פר רשומה בשורת abs:YYYY-MM)
   absence — היעדרות/מילואים · work — עבודה בזמן מילואים · travel — נסיעות · trip — גמול טיול */
(function (global) {
  'use strict';
  var U = global.U;

  var KINDS = [
    { kind: 'absence', icon: '🪖', title: 'היעדרויות / מילואים',
      cols: ['שם', 'תאריכים', 'שעות', 'סיבה', 'אישור', 'ניכוי שכר', 'הערות'] },
    { kind: 'work', icon: '💪', title: 'עבודה בזמן מילואים',
      cols: ['שם', 'תאריכים', 'שעות', 'הערות'] },
    { kind: 'travel', icon: '🚗', title: 'דוח נסיעות',
      cols: ['שם', 'תאריך', 'נתיב', 'ק"מ', 'הערות'] },
    { kind: 'trip', icon: '🏕️', title: 'גמול טיול',
      cols: ['שם', 'מטרת הטיול', 'יציאה', 'חזרה', 'לילות', 'הערות'] }
  ];

  // שם עובד — חיפוש חופשי במצבת (כמו במילוי מקום)
  function nameField(rec) {
    var picker = U.dataListInput(rec.name || '', Store.employees().map(Store.empName), 'חיפוש עובד…');
    return { input: picker._input, node: picker, get: picker.get };
  }

  // תצוגת טווח תאריכים: מ-fromDate/toDate החדשים, אחרת מחרוזת dates הישנה (מהפורטל)
  function datesDisplay(rec) {
    if (rec.fromDate) {
      var f = U.gregLabel(rec.fromDate);
      if (rec.toDate && rec.toDate !== rec.fromDate) return f + ' – ' + U.gregLabel(rec.toDate);
      return f;
    }
    return rec.dates || '';
  }

  function fld(label, node) { return U.el('div', { class: 'field' }, [U.el('label', { text: label }), node]); }

  function openModal(month, kind, rec) {
    rec = rec || { kind: kind };
    var name = nameField(rec);
    var err = U.el('div', { class: 'field-err' });
    var fields = [], collect;

    if (kind === 'absence') {
      // תאריכים — בורר תאריך יחיד + תאריך-עד אופציונלי (טווח)
      var fromDate = U.el('input', { type: 'date', value: rec.fromDate || '' });
      var toDate = U.el('input', { type: 'date', value: rec.toDate || '' });
      var hours = U.el('input', { type: 'number', step: '0.5', min: '0', value: rec.hours != null && rec.hours !== '' && !isNaN(rec.hours) ? rec.hours : '', placeholder: 'מס׳ שעות', style: 'max-width:130px;' });
      var reason = U.el('select', null, ['מחלה', 'מילואים', 'חופשת לידה', 'אחר'].map(function (x) { return U.el('option', { value: x, text: x }); }));
      if (rec.reason) reason.value = rec.reason;
      var approval = U.el('select', null, [
        U.el('option', { value: 'received', text: 'אישור התקבל (מצורף)' }),
        U.el('option', { value: 'missing', text: 'אישור חסר' }),
        U.el('option', { value: 'none', text: 'לא נדרש' })
      ]);
      approval.value = rec.approval || 'missing';
      // ניכוי מהשכר — כן/לא (רק גיא ממלא; המסך ממילא למנהל בלבד)
      var deduction = U.el('select', null, [
        U.el('option', { value: 'none', text: 'ללא ניכוי' }),
        U.el('option', { value: 'yes', text: 'יש ניכוי משכר' })
      ]);
      deduction.value = (rec.deduction === 'yes' || /יש/.test(rec.deduction || '')) ? 'yes' : 'none';
      var note = U.el('input', { value: rec.note || '', placeholder: 'הערות' });
      fields = [
        fld('שם העובד', name.node),
        U.el('div', { class: 'row' }, [fld('מתאריך', fromDate), fld('עד תאריך (לטווח)', toDate)]),
        U.el('div', { class: 'row' }, [fld('מס׳ שעות', hours), fld('סיבת ההיעדרות', reason)]),
        U.el('div', { class: 'row' }, [fld('אישור היעדרות', approval), fld('ניכוי מהשכר', deduction)]),
        fld('הערות', note)
      ];
      collect = function () {
        rec.fromDate = fromDate.value;
        rec.toDate = toDate.value;
        rec.dates = datesDisplay({ fromDate: fromDate.value, toDate: toDate.value });
        rec.hours = hours.value.trim();
        rec.reason = reason.value;
        rec.approval = approval.value;
        rec.deduction = deduction.value; // 'none' | 'yes'
        rec.note = note.value.trim();
        return rec.fromDate ? null : 'נדרש תאריך';
      };
    } else if (kind === 'work') {
      var wdates = U.el('input', { value: rec.dates || '', placeholder: 'תאריכים' });
      var whours = U.el('input', { value: rec.hours || '', placeholder: 'כמות שעות / "דוח מצורף" / "עבד כרגיל"' });
      var wnote = U.el('input', { value: rec.note || '', placeholder: 'הערות' });
      fields = [
        fld('שם העובד', name.node),
        U.el('div', { class: 'row' }, [fld('תאריכים', wdates), fld('כמות שעות', whours)]),
        fld('הערות', wnote)
      ];
      collect = function () {
        rec.dates = wdates.value.trim();
        rec.hours = whours.value.trim();
        rec.note = wnote.value.trim();
        return rec.dates ? null : 'נדרשים תאריכים';
      };
    } else if (kind === 'travel') {
      var tdate = U.el('input', { type: 'date', value: rec.date || U.todayISO() });
      var route = U.el('input', { value: rec.route || '', placeholder: 'נתיב (מאיפה לאן)' });
      var km = U.el('input', { type: 'number', step: '1', min: '0', value: rec.km != null ? rec.km : '', placeholder: 'ק"מ', style: 'max-width:130px;' });
      var tnote = U.el('input', { value: rec.note || '', placeholder: 'הערות' });
      fields = [
        fld('שם העובד', name.node),
        U.el('div', { class: 'row' }, [fld('תאריך', tdate), fld('ק"מ', km)]),
        U.el('div', { class: 'row' }, [fld('נתיב', route), fld('הערות', tnote)])
      ];
      collect = function () {
        rec.date = tdate.value;
        rec.route = route.value.trim();
        rec.km = U.num(km.value);
        rec.note = tnote.value.trim();
        return rec.km ? null : 'נדרש מספר ק"מ';
      };
    } else { // trip
      var purpose = U.el('input', { value: rec.purpose || '', placeholder: 'מטרת הטיול / הפעילות' });
      var dep = U.el('input', { type: 'datetime-local', value: rec.depart || '' });
      var ret = U.el('input', { type: 'datetime-local', value: rec.ret || '' });
      var nights = U.el('input', { type: 'number', min: '0', step: '1', value: rec.nights != null ? rec.nights : 0, style: 'max-width:110px;' });
      var klass = U.el('input', { value: rec.klass || '', placeholder: 'כיתה', style: 'max-width:110px;' });
      var meals = U.el('input', { value: rec.meals || '', placeholder: 'ארוחות (בוקר/צהריים/ערב)' });
      var pnote = U.el('input', { value: rec.note || '', placeholder: 'הערות' });
      fields = [
        fld('שם העובד', name.node),
        fld('מטרת הטיול', purpose),
        U.el('div', { class: 'row' }, [fld('יציאה', dep), fld('חזרה', ret)]),
        U.el('div', { class: 'row' }, [fld('מס׳ לילות', nights), fld('כיתה', klass)]),
        U.el('div', { class: 'row' }, [fld('ארוחות', meals), fld('הערות', pnote)])
      ];
      collect = function () {
        rec.purpose = purpose.value.trim();
        rec.depart = dep.value;
        rec.ret = ret.value;
        rec.nights = U.num(nights.value);
        rec.klass = klass.value.trim();
        rec.meals = meals.value.trim();
        rec.note = pnote.value.trim();
        return rec.depart ? null : 'נדרש מועד יציאה';
      };
    }

    var def = KINDS.filter(function (k) { return k.kind === kind; })[0];
    Modal.open((rec.id ? '✏️ עריכה — ' : '➕ ') + def.title, U.el('div', null, fields.concat([err])), [
      { label: 'ביטול', class: 'secondary' },
      { label: 'שמירה', onClick: function (close) {
        rec.name = name.input.value.trim();
        if (!rec.name) { err.textContent = 'נדרש שם עובד'; return; }
        var problem = collect();
        if (problem) { err.textContent = problem; return; }
        rec.kind = kind;
        Store.upsertRecord('abs', month, rec);
        close();
        App.render();
      } }
    ]);
  }

  function fmtDT(v) {
    if (!v) return '';
    var d = new Date(v);
    if (isNaN(d)) return v;
    return d.getDate() + '/' + (d.getMonth() + 1) + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function approvalCell(r) {
    if (r.kind !== 'absence') return null;
    var lbl = { received: '✓ מצורף', missing: '⚠️ חסר', none: '—' }[r.approval] || '⚠️ חסר';
    var cell = U.el('td', null, [U.el('span', { text: lbl, style: r.approval === 'missing' ? 'color:#d97706;font-weight:600;' : '' })]);
    if (r.filePath) {
      var btn = U.el('button', { class: 'btn secondary', text: '📎', title: 'צפייה באישור שהועלה', style: 'margin-inline-start:6px;' });
      btn.addEventListener('click', function () {
        btn.disabled = true;
        Store.approvalFileUrl(r.filePath).then(function (url) {
          btn.disabled = false;
          if (url) window.open(url, '_blank');
          else U.toast('לא הצלחתי לפתוח את הקובץ', 'error');
        });
      });
      cell.appendChild(btn);
    }
    return cell;
  }

  function rowCells(r) {
    if (r.kind === 'absence') {
      var ded = (r.deduction === 'yes' || /יש/.test(r.deduction || '')) ? 'יש ניכוי' : 'ללא ניכוי';
      return [
        U.el('td', null, U.el('strong', { text: r.name })),
        U.el('td', { text: datesDisplay(r) }),
        U.el('td', { text: (r.hours === '' || r.hours == null) ? '-' : r.hours }),
        U.el('td', { text: r.reason || '' }),
        approvalCell(r),
        U.el('td', { text: ded }),
        U.el('td', { text: r.note || '' })
      ];
    }
    if (r.kind === 'work') {
      return [
        U.el('td', null, U.el('strong', { text: r.name })),
        U.el('td', { text: r.dates || '' }),
        U.el('td', { text: r.hours || '' }),
        U.el('td', { text: r.note || '' })
      ];
    }
    if (r.kind === 'travel') {
      return [
        U.el('td', null, U.el('strong', { text: r.name })),
        U.el('td', { text: r.date ? U.gregLabel(r.date) : '' }),
        U.el('td', { text: r.route || '' }),
        U.el('td', { text: String(r.km || '') }),
        U.el('td', { text: r.note || '' })
      ];
    }
    return [
      U.el('td', null, U.el('strong', { text: r.name })),
      U.el('td', { text: r.purpose || '' }),
      U.el('td', { text: fmtDT(r.depart) }),
      U.el('td', { text: fmtDT(r.ret) }),
      U.el('td', { text: String(r.nights || 0) }),
      U.el('td', { text: r.note || '' })
    ];
  }

  function render(view) {
    var month = App.currentMonth();
    view.appendChild(App.monthHeader('🪖 היעדרויות וגמולים'));

    KINDS.forEach(function (def) {
      var recs = Store.records('abs', month, function (r) { return r.kind === def.kind; });
      var card = U.el('div', { class: 'card', style: 'margin-bottom:14px;' });
      card.appendChild(U.el('div', { class: 'page-head', style: 'margin-bottom:8px;' }, [
        U.el('h3', { text: def.icon + ' ' + def.title + (recs.length ? ' (' + recs.length + ')' : '') }),
        U.el('span', { class: 'spacer' }),
        U.el('button', { class: 'btn secondary', text: '➕ הוספה', onclick: function () { openModal(month, def.kind, null); } })
      ]));
      if (!recs.length) {
        card.appendChild(U.el('div', { class: 'muted', style: 'padding:6px 2px;' }, 'אין רשומות החודש'));
      } else {
        var tbl = U.el('table', { class: 'grid' }, [
          U.el('thead', null, U.el('tr', null, def.cols.concat(['']).map(function (h) { return U.el('th', { text: h }); }))),
          U.el('tbody', null, recs.map(function (r) {
            return U.el('tr', null, rowCells(r).concat([
              U.el('td', null, [
                U.el('button', { class: 'btn secondary', text: '✏️', title: 'עריכה', onclick: function () { openModal(month, def.kind, JSON.parse(JSON.stringify(r))); } }),
                ' ',
                U.el('button', { class: 'btn secondary', text: '🗑', title: 'מחיקה', onclick: function () {
                  Modal.confirm({ title: 'מחיקה', text: 'למחוק את הרשומה של ' + r.name + '?', okLabel: 'מחיקה', danger: true }, function () {
                    Store.deleteRecord('abs', month, r.id);
                    App.render();
                  });
                } })
              ])
            ]));
          }))
        ]);
        card.appendChild(U.el('div', { class: 'tbl-scroll' }, [tbl]));
      }
      view.appendChild(card);
    });
  }

  global.AbsView = { render: render };
})(window);
