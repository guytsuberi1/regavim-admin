/* abs.js — סיכום היעדרויות: 4 מקטעים (kind פר רשומה בשורת abs:YYYY-MM)
   absence — היעדרות/מילואים · work — עבודה בזמן מילואים · travel — נסיעות · trip — גמול טיול */
(function (global) {
  'use strict';
  var U = global.U;

  var KINDS = [
    { kind: 'absence', icon: '', title: 'היעדרויות / מילואים',
      cols: ['שם', 'תאריכים', 'שעות', 'סיבה', 'אישור', 'ניכוי שכר', 'הערות'] },
    { kind: 'work', icon: '', title: 'עבודה בזמן מילואים',
      cols: ['שם', 'תאריכים', 'שעות', 'הערות'] },
    { kind: 'travel', icon: '', title: 'דוח נסיעות',
      cols: ['שם', 'תאריך', 'נתיב', 'ק"מ', 'הערות'] },
    { kind: 'trip', icon: '', title: 'גמול טיול',
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

      // מסמך אישור — להשלמת קובץ שהגיע אחרי הדיווח (או להחלפת קובץ קיים)
      var filePath = rec.filePath || '';
      var fileInput = U.el('input', { type: 'file', accept: 'image/*,.pdf', style: 'display:none;' });
      var pickBtn = U.el('button', { type: 'button', class: 'btn secondary small' });
      var viewBtn = U.el('button', { type: 'button', class: 'btn secondary small', html: U.ICO.clip + ' צפייה' });
      var fileStatus = U.el('span', { class: 'muted', style: 'font-size:13px;' });
      function paintFile(msg) {
        pickBtn.textContent = filePath ? 'החלפת הקובץ' : 'העלאת קובץ';
        viewBtn.style.display = filePath ? '' : 'none';
        fileStatus.textContent = msg || (filePath ? 'קובץ מצורף' : 'לא צורף קובץ');
      }
      paintFile();
      pickBtn.addEventListener('click', function () { fileInput.click(); });
      viewBtn.addEventListener('click', function () {
        viewBtn.disabled = true;
        Store.approvalFileUrl(filePath).then(function (url) {
          viewBtn.disabled = false;
          if (url) window.open(url, '_blank');
          else U.toast('לא הצלחתי לפתוח את הקובץ', 'error');
        });
      });
      fileInput.addEventListener('change', function () {
        var f = fileInput.files[0];
        if (!f) return;
        err.textContent = '';
        pickBtn.disabled = true;
        paintFile('מעלה…');
        Store.uploadApproval(f).then(function (path) {
          filePath = path;
          approval.value = 'received';   // יש קובץ → הסטטוס מתעדכן לבד
          pickBtn.disabled = false;
          paintFile('הקובץ הועלה');
          U.toast('הקובץ הועלה — הסטטוס עודכן ל"אישור התקבל". נותר לשמור.');
        }).catch(function (e) {
          pickBtn.disabled = false;
          paintFile();
          err.textContent = 'העלאת הקובץ נכשלה: ' + (e && e.message ? e.message : 'שגיאה לא ידועה');
        });
        fileInput.value = '';
      });

      fields = [
        fld('שם העובד', name.node),
        U.el('div', { class: 'row' }, [fld('מתאריך', fromDate), fld('עד תאריך (לטווח)', toDate)]),
        U.el('div', { class: 'row' }, [fld('מס׳ שעות', hours), fld('סיבת ההיעדרות', reason)]),
        U.el('div', { class: 'row' }, [fld('אישור היעדרות', approval), fld('ניכוי מהשכר', deduction)]),
        fld('מסמך אישור', U.el('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;' },
          [pickBtn, viewBtn, fileStatus, fileInput])),
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
        rec.filePath = filePath;
        return rec.fromDate ? null : 'נדרש תאריך';
      };
    } else if (kind === 'work') {
      var wnote = U.el('input', { value: rec.note || '', placeholder: 'הערות' });
      var hasDays = rec.days && Object.keys(rec.days).length;
      fields = [
        fld('שם העובד', name.node),
        fld('הערות', wnote),
        U.el('div', { class: 'muted', style: 'font-size:13px;margin-top:4px;line-height:1.6;' },
          hasDays
            ? 'התאריכים וסה"כ השעות מחושבים מדוח השעות היום-יומי (' + rec.dates + ' · ' + rec.hours + ' שעות).'
            : 'אחרי השמירה ייפתח דוח השעות החודשי — שם ממלאים כניסה ויציאה לכל יום, והתאריכים והסה"כ מתמלאים לבד.')
      ];
      collect = function () {
        rec.note = wnote.value.trim();
        return null;                     // שם העובד לבדו מספיק — השאר מגיע מהדוח
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
    Modal.open((rec.id ? 'עריכה —' : '') + def.title, U.el('div', null, fields.concat([err])), [
      { label: 'ביטול', class: 'secondary' },
      { label: 'שמירה', onClick: function (close) {
        rec.name = name.input.value.trim();
        if (!rec.name) { err.textContent = 'נדרש שם עובד'; return; }
        var problem = collect();
        if (problem) { err.textContent = problem; return; }
        rec.kind = kind;
        var isNew = !rec.id;
        var saved = Store.upsertRecord('abs', month, rec) || rec;
        close();
        App.render();
        if (kind === 'work' && isNew) openReport(month, saved);
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
    var lbl = { received: 'מצורף', missing: 'חסר', none: '—' }[r.approval] || 'חסר';
    var cell = U.el('td', null, [U.el('span', { text: lbl, style: r.approval === 'missing' ? 'color:#d97706;font-weight:600;' : '' })]);
    if (r.filePath) {
      var btn = U.el('button', { class: 'btn secondary', html: U.ICO.clip, title: 'צפייה באישור שהועלה', style: 'margin-inline-start:6px;' });
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


  // ---------- דוח שעות חודשי (עבודה בזמן מילואים) ----------
  // מבנה: rec.days = { 'YYYY-MM-DD': { in, out, note } } · הסיכום בשורה הראשית נגזר ממנו.
  var DAY_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

  function monthDays(month) {
    var y = parseInt(month.slice(0, 4), 10), m = parseInt(month.slice(5, 7), 10);
    var last = new Date(y, m, 0).getDate(), out = [];
    for (var d = 1; d <= last; d++) {
      var iso = month + '-' + String(d).padStart(2, '0');
      out.push({ iso: iso, dow: U.fromISO(iso).getDay(), dnum: d });
    }
    return out;
  }
  // הפרש שעות בין כניסה ליציאה; חצייה של חצות נספרת ליום הבא
  function hoursBetween(a, b) {
    if (!a || !b) return 0;
    var p1 = a.split(':'), p2 = b.split(':');
    var m1 = parseInt(p1[0], 10) * 60 + parseInt(p1[1] || '0', 10);
    var m2 = parseInt(p2[0], 10) * 60 + parseInt(p2[1] || '0', 10);
    var diff = m2 - m1;
    if (diff < 0) diff += 24 * 60;
    return Math.round(diff / 6) / 10;      // עיגול לעשירית שעה
  }
  function reportTotal(rec) {
    var t = 0;
    var days = rec.days || {};
    Object.keys(days).forEach(function (k) {
      var d = days[k];
      t += d.hours != null && d.hours !== '' ? U.num(d.hours) : hoursBetween(d.in, d.out);
    });
    return Math.round(t * 10) / 10;
  }
  function reportRange(rec, month) {
    var days = rec.days || {}, worked = [];
    monthDays(month).forEach(function (d) {
      var e = days[d.iso];
      if (e && (e.in || e.out || e.hours)) worked.push(d.dnum);
    });
    if (!worked.length) return '';
    var mm = parseInt(month.slice(5, 7), 10);
    if (worked.length === 1) return worked[0] + '/' + mm;
    // כותבים את החודש בשני הצדדים — בטקסט RTL טווח עם חודש אחד נקרא הפוך
    return worked[0] + '/' + mm + ' – ' + worked[worked.length - 1] + '/' + mm;
  }

  // מילוי אוטומטי בפתיחה ראשונה: ימי מילואים מדוח ההיעדרויות + שעות העבודה מהלוח השבועי
  function autoFill(rec, month) {
    var emp = Store.employees(true).filter(function (e) { return Store.empName(e) === rec.name; })[0];
    var days = rec.days || (rec.days = {});
    // ימי מילואים של אותו עובד באותו חודש
    Store.records('abs', month, function (r) { return r.kind === 'absence' && r.name === rec.name; })
      .forEach(function (a) {
        if (!/מילואים/.test(a.reason || '')) return;
        var from = a.fromDate, to = a.toDate || a.fromDate;
        if (!from) return;
        monthDays(month).forEach(function (d) {
          if (d.iso >= from && d.iso <= to) {
            days[d.iso] = days[d.iso] || {};
            if (!days[d.iso].note) days[d.iso].note = 'מילואים';
          }
        });
      });
    // שעות לפי הלוח השבועי בכרטיס העובד
    if (emp && emp.workHours) {
      monthDays(month).forEach(function (d) {
        var wh = emp.workHours[d.dow];
        if (!wh || (!wh.from && !wh.to)) return;
        days[d.iso] = days[d.iso] || {};
        // ביום מילואים לא ממלאים שעות מראש — הדוח נועד לתעד מה נעבד בפועל
        if (/מילואים/.test(days[d.iso].note || '')) return;
        if (!days[d.iso].in && !days[d.iso].out) { days[d.iso].in = wh.from || ''; days[d.iso].out = wh.to || ''; }
      });
    }
    rec.autoFilled = true;
  }

  function openReport(month, rec) {
    var work = JSON.parse(JSON.stringify(rec));
    if (!work.days) work.days = {};
    if (!work.autoFilled) autoFill(work, month);

    var totalEl = U.el('b', { text: '0' });
    var rows = [];
    function recalc() {
      var t = 0;
      rows.forEach(function (r) {
        var h = hoursBetween(r.inp.value, r.outp.value);
        r.sum.textContent = h ? String(h) : '';
        t += h;
      });
      totalEl.textContent = String(Math.round(t * 10) / 10);
    }

    var tbody = U.el('tbody', null, monthDays(month).map(function (d) {
      var e = work.days[d.iso] || (work.days[d.iso] = {});
      var inp = U.el('input', { type: 'time', value: e.in || '' });
      var outp = U.el('input', { type: 'time', value: e.out || '' });
      var note = U.el('input', { value: e.note || '', placeholder: '' });
      var sum = U.el('td', { class: 'mil-sum' });
      [inp, outp].forEach(function (x) { x.addEventListener('change', recalc); });
      var cls = '';
      if (d.dow === 5 || d.dow === 6) cls = 'mil-rest';
      if (/מילואים/.test(e.note || '')) cls = 'mil-duty';
      rows.push({ iso: d.iso, inp: inp, outp: outp, note: note, sum: sum });
      return U.el('tr', { class: cls }, [
        U.el('td', { class: 'mil-day', text: DAY_LETTERS[d.dow] }),
        U.el('td', { class: 'mil-date', text: U.gregLabel(d.iso) }),
        U.el('td', null, inp),
        U.el('td', null, outp),
        sum,
        U.el('td', null, note)
      ]);
    }));

    var tbl = U.el('table', { class: 'mil-tbl' }, [
      U.el('thead', null, U.el('tr', null, ['יום', 'תאריך', 'כניסה', 'יציאה', 'סה"כ', 'הערות']
        .map(function (h) { return U.el('th', { text: h }); }))),
      tbody
    ]);
    var body = U.el('div', null, [
      U.el('div', { class: 'muted', style: 'font-size:13px;margin-bottom:8px;' },
        'ימי מילואים מדוח ההיעדרויות מסומנים בכחול · שישי ושבת באפור · שעות העבודה הקבועות מולאו מהלוח השבועי בכרטיס העובד.'),
      U.el('div', { style: 'max-height:56vh;overflow:auto;' }, tbl),
      U.el('div', { class: 'mil-foot' }, [U.el('span', { text: 'סה"כ שעות:' }), totalEl])
    ]);
    recalc();

    Modal.open('דוח שעות של ' + (rec.name || '') + ' — ' + U.monthLabel(month), body, [
      { label: 'ביטול', class: 'secondary' },
      { label: 'שמירה', onClick: function (close) {
        rows.forEach(function (r) {
          var e = { in: r.inp.value, out: r.outp.value, note: r.note.value.trim() };
          if (!e.in && !e.out && !e.note) delete work.days[r.iso];
          else work.days[r.iso] = e;
        });
        work.autoFilled = true;
        var tot = reportTotal(work);
        work.hours = tot ? String(tot) : work.hours;
        var range = reportRange(work, month);
        if (range) work.dates = range;
        Store.upsertRecord('abs', month, work);
        close();
        U.toast('דוח השעות נשמר — סה"כ ' + tot + ' שעות');
        App.render();
      } }
    ], { wide: true });
  }

  function render(view) {
    var month = App.currentMonth();
    view.appendChild(App.monthHeader('היעדרויות וגמולים'));

    KINDS.forEach(function (def) {
      var recs = Store.records('abs', month, function (r) { return r.kind === def.kind; });
      var card = U.el('div', { class: 'card', style: 'margin-bottom:14px;' });
      card.appendChild(U.el('div', { class: 'page-head', style: 'margin-bottom:8px;' }, [
        U.el('h3', { text: def.title + (recs.length ? ' (' + recs.length + ')' : '') }),
        U.el('span', { class: 'spacer' }),
        U.el('button', { class: 'btn secondary', html: U.ICO.plus + ' הוספה', onclick: function () { openModal(month, def.kind, null); } })
      ]));
      if (!recs.length) {
        card.appendChild(U.el('div', { class: 'muted', style: 'padding:6px 2px;' }, 'אין רשומות החודש'));
      } else {
        var tbl = U.el('table', { class: 'grid' }, [
          U.el('thead', null, U.el('tr', null, def.cols.concat(['']).map(function (h) { return U.el('th', { text: h }); }))),
          U.el('tbody', null, recs.map(function (r) {
            return U.el('tr', null, rowCells(r).concat([
              U.el('td', { style: 'white-space:nowrap;' }, [
                def.kind === 'work' ? U.el('button', {
                  class: 'btn secondary', html: U.ICO.table, title: 'דוח שעות חודשי — יום-יום',
                  onclick: function () { openReport(month, r); }
                }) : null,
                def.kind === 'work' ? ' ' : null,
                U.el('button', { class: 'btn secondary', html: U.ICO.edit, title: 'עריכה', onclick: function () { openModal(month, def.kind, JSON.parse(JSON.stringify(r))); } }),
                ' ',
                U.el('button', { class: 'btn secondary', html: U.ICO.trash, title: 'מחיקה', onclick: function () {
                  Modal.confirm({ title: 'מחיקה', text: 'למחוק את הרשומה של ' + r.name + '?', okLabel: 'מחיקה', danger: true }, function () {
                    Store.deleteRecord('abs', month, r.id);
                    App.render();
                  });
                } })
              ].filter(Boolean))
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
