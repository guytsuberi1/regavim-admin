/* pdf.js — חבילת PDF חודשית: עמוד שער מסכם + מקטע לכל דוח, בחלון הדפסה נפרד */
(function (global) {
  'use strict';
  var U = global.U;

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function money(n) { return (Math.round(n * 100) / 100).toLocaleString('he-IL') + ' ₪'; }
  function fmtDT(v) {
    if (!v) return '';
    var d = new Date(v);
    if (isNaN(d)) return esc(v);
    return d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function table(headers, rows) {
    var h = '<table><thead><tr>' + headers.map(function (x) { return '<th>' + esc(x) + '</th>'; }).join('') + '</tr></thead><tbody>';
    rows.forEach(function (r) {
      h += '<tr>' + r.map(function (c) { return '<td>' + (c == null ? '' : c) + '</td>'; }).join('') + '</tr>';
    });
    return h + '</tbody></table>';
  }

  // ---------- מקטעים ----------
  function lcSection(month) {
    var s = Store.settings();
    var recs = Store.records('lc', month);
    if (!recs.length) return '';
    var byEmp = {};
    recs.forEach(function (r) { (byEmp[r.empId] = byEmp[r.empId] || []).push(r); });
    var h = '<section class="page"><h2>📚 דוח מרכז למידה — ' + esc(U.monthLabel(month)) + '</h2>';
    Object.keys(byEmp).forEach(function (empId) {
      var emp = Store.empById(empId);
      var rows = byEmp[empId];
      var hours = 0;
      rows.forEach(function (r) { hours += U.num(r.hours); });
      var t = Store.lcTravel(month, empId);
      var travelPay = t ? U.num(t.km) * U.num(t.days) * s.kmRate : 0;
      h += '<div class="block"><h3>' + esc(Store.empName(emp) || '—') + (emp && emp.phone ? ' · ' + esc(emp.phone) : '') + '</h3>';
      h += table(['תאריך', 'מקצוע תגבור', 'כיתה', 'תלמיד/ים', 'שעות'], rows.map(function (r) {
        return [esc(U.gregLabel(r.date)), esc(r.subject), esc(r.klass), esc(r.students), esc(r.hours)];
      }));
      h += '<div class="tot">';
      h += 'סה"כ שעות: <b>' + hours + '</b> × ' + s.hourlyRate + ' ₪ = <b>' + money(hours * s.hourlyRate) + '</b>';
      if (travelPay) h += ' · נסיעות: ' + t.km + ' ק"מ × ' + t.days + ' ימים × ' + s.kmRate + ' ₪ = <b>' + money(travelPay) + '</b>';
      h += ' · סה"כ לתשלום: <b class="grand">' + money(hours * s.hourlyRate + travelPay) + '</b></div></div>';
    });
    h += '<div class="sign">חתימת המנהל: ' + esc(s.managerName) + ' ____________</div></section>';
    return h;
  }

  function subSection(month) {
    var recs = Store.records('sub', month);
    if (!recs.length) return '';
    var byEmp = {};
    recs.forEach(function (r) { (byEmp[r.empId] = byEmp[r.empId] || []).push(r); });
    var s = Store.settings();
    var h = '<section class="page"><h2>🔁 דוח שעות מילוי מקום — ' + esc(U.monthLabel(month)) + '</h2>';
    Object.keys(byEmp).forEach(function (empId) {
      var rows = byEmp[empId];
      var hours = 0;
      rows.forEach(function (r) { hours += U.num(r.hours); });
      h += '<div class="block"><h3>' + esc(Store.empName(empId)) + '</h3>';
      h += table(['תאריך', 'מורה נעדר', 'סיבת היעדרות', 'שעות', 'ייעוד השעה', 'הערות'], rows.map(function (r) {
        return [esc(U.gregLabel(r.date)), esc(r.absentName), esc(r.reason), esc(r.hours), esc(r.purpose), esc(r.note)];
      }));
      h += '<div class="tot">סה"כ שעות מילוי מקום: <b>' + hours + '</b></div></div>';
    });
    h += '<div class="sign">חתימת המנהל: ' + esc(s.managerName) + ' ____________</div></section>';
    return h;
  }

  function absSection(month) {
    var s = Store.settings();
    var parts = [];
    var abs = Store.records('abs', month, function (r) { return r.kind === 'absence'; });
    if (abs.length) {
      parts.push('<h3>היעדרויות / מילואים</h3>' + table(
        ['שם', 'תאריכים', 'שעות', 'סיבה', 'אישור', 'ניכוי שכר', 'הערות'],
        abs.map(function (r) {
          var ap = { received: 'מצורף', missing: 'חסר', none: '—' }[r.approval] || 'חסר';
          return [esc(r.name), esc(r.dates), esc(r.hours || '-'), esc(r.reason), ap, esc(r.deduction || '-'), esc(r.note)];
        })));
    }
    var work = Store.records('abs', month, function (r) { return r.kind === 'work'; });
    if (work.length) {
      parts.push('<h3>דוח עבודה בזמן מילואים</h3>' + table(
        ['שם', 'תאריכים', 'כמות שעות', 'הערות'],
        work.map(function (r) { return [esc(r.name), esc(r.dates), esc(r.hours), esc(r.note)]; })));
    }
    var travel = Store.records('abs', month, function (r) { return r.kind === 'travel'; });
    if (travel.length) {
      parts.push('<h3>דוח נסיעות</h3>' + table(
        ['שם', 'תאריך', 'נתיב', 'ק"מ', 'תשלום (' + s.kmRate + ' ₪/ק"מ)', 'הערות'],
        travel.map(function (r) {
          return [esc(r.name), r.date ? esc(U.gregLabel(r.date)) : '', esc(r.route), esc(r.km), money(U.num(r.km) * s.kmRate), esc(r.note)];
        })));
    }
    var trips = Store.records('abs', month, function (r) { return r.kind === 'trip'; });
    if (trips.length) {
      parts.push('<h3>גמול טיול</h3>' + table(
        ['שם', 'מטרת הטיול', 'יציאה', 'חזרה', 'לילות', 'כיתה', 'הערות'],
        trips.map(function (r) {
          return [esc(r.name), esc(r.purpose), fmtDT(r.depart), fmtDT(r.ret), esc(r.nights || 0), esc(r.klass), esc(r.note)];
        })));
    }
    if (!parts.length) return '';
    return '<section class="page"><h2>🪖 סיכום היעדרויות וגמולים — ' + esc(U.monthLabel(month)) + '</h2>'
      + parts.join('') + '<div class="sign">חתימת המנהל: ' + esc(s.managerName) + ' ____________</div></section>';
  }

  // עמוד שער: סיכום פר עובד — מה יש עליו בחבילה
  function coverSection(month, included) {
    var s = Store.settings();
    var perEmp = {}; // name → {lc, sub, absence, work, travel, trip, pay}
    function entry(name) { return perEmp[name] = perEmp[name] || { parts: [], pay: 0 }; }

    if (included.lc) {
      var byEmp = {};
      Store.records('lc', month).forEach(function (r) { (byEmp[r.empId] = byEmp[r.empId] || []).push(r); });
      Object.keys(byEmp).forEach(function (empId) {
        var hours = 0;
        byEmp[empId].forEach(function (r) { hours += U.num(r.hours); });
        var t = Store.lcTravel(month, empId);
        var travelPay = t ? U.num(t.km) * U.num(t.days) * s.kmRate : 0;
        var e = entry(Store.empName(empId));
        e.parts.push('מרכז למידה: ' + hours + ' ש׳');
        e.pay += hours * s.hourlyRate + travelPay;
      });
    }
    if (included.sub) {
      var byEmp2 = {};
      Store.records('sub', month).forEach(function (r) { (byEmp2[r.empId] = byEmp2[r.empId] || []).push(r); });
      Object.keys(byEmp2).forEach(function (empId) {
        var hours = 0;
        byEmp2[empId].forEach(function (r) { hours += U.num(r.hours); });
        entry(Store.empName(empId)).parts.push('מילוי מקום: ' + hours + ' ש׳');
      });
    }
    if (included.abs) {
      Store.records('abs', month).forEach(function (r) {
        var e = entry(r.name);
        if (r.kind === 'absence') e.parts.push('היעדרות: ' + (r.dates || '') + ' (' + (r.reason || '') + ')');
        if (r.kind === 'work') e.parts.push('עבודה במילואים: ' + (r.dates || ''));
        if (r.kind === 'travel') { e.parts.push('נסיעות: ' + r.km + ' ק"מ'); e.pay += U.num(r.km) * s.kmRate; }
        if (r.kind === 'trip') e.parts.push('גמול טיול: ' + (r.purpose || ''));
      });
    }

    var names = Object.keys(perEmp).sort(function (a, b) { return a.localeCompare(b, 'he'); });
    var h = '<section class="page cover"><div class="cover-head">'
      + '<h1>חבילת דוחות שכר</h1>'
      + '<div class="cover-sub">' + esc(s.orgName) + ' · ' + esc(U.monthLabel(month)) + '</div>'
      + '<div class="cover-meta">הופק: ' + new Date().toLocaleDateString('he-IL') + ' · מגיש: ' + esc(s.managerName) + '</div>'
      + '</div>';
    if (names.length) {
      h += '<h3>סיכום לפי עובד</h3>' + table(['עובד', 'רכיבים בחבילה', 'תשלום מחושב'], names.map(function (n) {
        var e = perEmp[n];
        return [esc(n), e.parts.map(esc).join('<br>'), e.pay ? money(e.pay) : '—'];
      }));
      h += '<p class="muted">"תשלום מחושב" — רכיבים שהאפליקציה יודעת לחשב (תגבור ' + s.hourlyRate + ' ₪/ש׳, נסיעות ' + s.kmRate + ' ₪/ק"מ). יתר הרכיבים לחישוב חשבת השכר.</p>';
    } else {
      h += '<p>אין נתונים לחודש זה.</p>';
    }
    return h + '</section>';
  }

  function buildHtml(month, included) {
    var body = coverSection(month, included);
    if (included.lc) body += lcSection(month);
    if (included.sub) body += subSection(month);
    if (included.abs) body += absSection(month);
    return '<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8">'
      + '<title>דוחות שכר ' + esc(month) + ' — ' + esc(Store.settings().orgName) + '</title>'
      + '<style>'
      + 'body{font-family:"Rubik","Segoe UI",Arial,sans-serif;margin:0;padding:0;color:#111;background:#f1f5f9;}'
      + '.bar{position:sticky;top:0;background:#0f172a;color:#fff;padding:10px 16px;display:flex;gap:10px;align-items:center;}'
      + '.bar button{background:#2563eb;color:#fff;border:none;border-radius:8px;padding:8px 18px;font-size:15px;font-family:inherit;cursor:pointer;}'
      + '.bar .hint{font-size:13px;opacity:.8;}'
      + 'section.page{background:#fff;max-width:900px;margin:16px auto;padding:28px 32px;box-shadow:0 1px 4px rgba(0,0,0,.15);}'
      + 'h1{margin:0;font-size:30px;} h2{font-size:22px;border-bottom:2px solid #0f172a;padding-bottom:6px;margin-top:0;}'
      + 'h3{font-size:16px;margin:18px 0 6px;} .block{margin-bottom:18px;page-break-inside:avoid;}'
      + '.cover-head{text-align:center;margin-bottom:24px;} .cover-sub{font-size:18px;margin-top:6px;}'
      + '.cover-meta{color:#555;font-size:13px;margin-top:4px;}'
      + 'table{width:100%;border-collapse:collapse;font-size:13px;margin:6px 0;}'
      + 'th,td{border:1px solid #cbd5e1;padding:5px 8px;text-align:right;vertical-align:top;}'
      + 'th{background:#f1f5f9;font-weight:600;} tr:nth-child(even) td{background:#fafafa;}'
      + '.tot{margin:6px 0 2px;font-size:14px;} .grand{font-size:15px;}'
      + '.sign{margin-top:26px;font-size:14px;} .muted{color:#666;font-size:12px;}'
      + '@media print{body{background:#fff;} .bar{display:none;} section.page{box-shadow:none;margin:0;max-width:none;page-break-after:always;padding:12mm 10mm;}}'
      + '</style></head><body>'
      + '<div class="bar"><button onclick="window.print()">🖨️ הדפסה / שמירה כ-PDF</button>'
      + '<span class="hint">בחלון ההדפסה בחרו "שמירה כ-PDF" · יעד: חשבת השכר</span></div>'
      + body + '</body></html>';
  }

  function openPreview(month, included) {
    if (!included.lc && !included.sub && !included.abs) {
      U.toast('בחרו לפחות דוח אחד', 'error');
      return;
    }
    var w = window.open('', '_blank');
    if (!w) { U.toast('הדפדפן חסם את החלון — אפשרו חלונות קופצים', 'error'); return; }
    w.document.write(buildHtml(month, included));
    w.document.close();
  }

  function render(view) {
    var month = App.currentMonth();
    view.appendChild(App.monthHeader('🖨️ חבילת PDF לחשבת'));

    var lcCount = Store.records('lc', month).length;
    var subCount = Store.records('sub', month).length;
    var absCount = Store.records('abs', month).length;

    var cbLc = U.el('input', { type: 'checkbox', checked: lcCount > 0 });
    var cbSub = U.el('input', { type: 'checkbox', checked: subCount > 0 });
    var cbAbs = U.el('input', { type: 'checkbox', checked: absCount > 0 });

    function line(cb, label, count) {
      return U.el('label', { style: 'display:flex;align-items:center;gap:8px;padding:8px 4px;cursor:pointer;font-size:15px;' }, [
        cb, label, U.el('span', { class: 'muted', text: count ? '(' + count + ' רשומות)' : '(אין נתונים החודש)' })
      ]);
    }

    var card = U.el('div', { class: 'card', style: 'max-width:560px;' }, [
      U.el('h3', { text: 'מה לכלול בחבילה של ' + U.monthLabel(month) + '?' }),
      line(cbLc, '📚 דוח מרכז למידה', lcCount),
      line(cbSub, '🔁 דוח מילוי מקום', subCount),
      line(cbAbs, '🪖 סיכום היעדרויות וגמולים', absCount),
      U.el('div', { style: 'margin-top:14px;display:flex;gap:8px;' }, [
        U.el('button', { class: 'btn', text: '🖨️ פתיחת תצוגת הדפסה', onclick: function () {
          openPreview(month, { lc: cbLc.checked, sub: cbSub.checked, abs: cbAbs.checked });
        } })
      ]),
      U.el('p', { class: 'muted', style: 'margin-bottom:0;' },
        'נפתח חלון עם החבילה המלאה: עמוד שער מסכם + מקטע לכל דוח. לחצו שם "הדפסה / שמירה כ-PDF", שמרו את הקובץ ושלחו במייל לחשבת.')
    ]);
    view.appendChild(card);
  }

  global.PdfView = { render: render };
})(window);
