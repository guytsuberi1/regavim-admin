/* events.js — תכנון אירועים וטיולים: כרטיס לכל אירוע עם לו"ז (ציר זמן) וצ'ק-ליסט משימות
   מחולק לבעלי תפקידים, פלטים (לו"ז לוואטסאפ/הדפסה, אישור הורים, יומן Google) ותפוצת משימות. */
(function (global) {
  'use strict';
  var U = global.U;

  // אייקון וואטסאפ בצבע הירוק הרשמי (ה-SVG משתמש ב-currentColor)
  var WA_GREEN = '<span style="color:#25D366">' + (U.WA_SVG || '') + '</span>';

  var ESTATUS = [{ key: 'בתכנון', color: '#d97706' }, { key: 'מוכן', color: '#2563eb' }, { key: 'בוצע', color: '#16a34a' }];
  var TSTATUS = [{ key: 'פתוח', color: '#64748b' }, { key: 'בתהליך', color: '#2563eb' }, { key: 'בוצע', color: '#16a34a' }];
  function stColor(list, s) { var x = list.filter(function (q) { return q.key === s; })[0]; return x ? x.color : '#64748b'; }

  var focusNew = false;
  var showArchive = false;
  var collapsedMap = (function () { try { return JSON.parse(localStorage.getItem('admin_event_collapsed') || '{}'); } catch (e) { return {}; } })();
  function saveCollapsed() { try { localStorage.setItem('admin_event_collapsed', JSON.stringify(collapsedMap)); } catch (e) {} }

  // ---------- עוזרי הגדרות ----------
  function eventTypes() { return Store.settings().eventTypes || []; }
  function taskCatalog() { return Store.settings().taskCatalog || []; }
  function eventRoles() { return Store.settings().eventRoles || []; }
  function typeById(id) { return eventTypes().filter(function (t) { return t.id === id; })[0] || null; }
  function typeLabel(id) { var t = typeById(id); return t ? t.label : (id || ''); }
  function catById(id) { return taskCatalog().filter(function (c) { return c.id === id; })[0] || null; }
  function roleEmpId(role) { var r = eventRoles().filter(function (x) { return x.name === role; })[0]; return r ? (r.empId || '') : ''; }

  // ---------- עריכה ישירה (שמירה שקטה) ----------
  function saveEv(ev) { Store.upsertEvent(ev); }
  function transp(el) {
    el.style.border = '1px solid transparent'; el.style.background = 'transparent'; el.style.padding = '4px 6px';
    el.addEventListener('focus', function () { el.style.background = 'var(--card,#fff)'; el.style.borderColor = 'var(--border,#d6dce1)'; });
    el.addEventListener('blur', function () { el.style.background = 'transparent'; el.style.borderColor = 'transparent'; });
    return el;
  }
  function eText(ev, obj, field, ph, style) {
    var i = transp(U.el('input', { value: obj[field] || '', placeholder: ph || '', style: style || '', autocomplete: 'off' }));
    i.addEventListener('change', function () { obj[field] = i.value.trim(); saveEv(ev); });
    return i;
  }
  function eTime(ev, obj, field) {
    var i = transp(U.el('input', { type: 'time', value: obj[field] || '', style: 'max-width:110px;' }));
    i.addEventListener('change', function () { obj[field] = i.value; saveEv(ev); });
    return i;
  }
  function eSelect(obj, field, opts, onSave) {
    var sel = U.el('select', { style: 'padding:4px 6px;border-color:' + stColor(opts, obj[field]) + ';' },
      opts.map(function (o) { return U.el('option', { value: o.key, text: o.key }); }));
    sel.value = obj[field] || opts[0].key;
    sel.addEventListener('change', function () { obj[field] = sel.value; sel.style.borderColor = stColor(opts, sel.value); onSave(); });
    return sel;
  }
  // ---------- לו"ז (ציר זמן, גרירה לסידור) ----------
  var dragSchedId = null;
  function reorderSched(ev, targetId) {
    if (!dragSchedId || dragSchedId === targetId) return;
    var arr = ev.schedule || [];
    var from = arr.map(function (x) { return x.id; }).indexOf(dragSchedId);
    if (from < 0) return;
    var moved = arr.splice(from, 1)[0];
    var to = targetId ? arr.map(function (x) { return x.id; }).indexOf(targetId) : arr.length;
    if (to < 0) to = arr.length;
    arr.splice(to, 0, moved);
    saveEv(ev); App.render();
  }
  function scheduleTable(ev) {
    var tbody = U.el('tbody', null, (ev.schedule || []).map(function (row) {
      var grip = U.el('td', { style: 'width:24px;text-align:center;color:#94a3b8;cursor:grab;user-select:none;', title: 'גרור לשינוי סדר', text: '⠿' });
      var tr = U.el('tr', null, [
        grip,
        U.el('td', { style: 'width:120px;' }, eTime(ev, row, 'time')),
        U.el('td', { style: 'min-width:180px;' }, eText(ev, row, 'activity', 'פעילות', 'width:100%;')),
        U.el('td', { style: 'min-width:140px;' }, eText(ev, row, 'note', 'הערה', 'width:100%;')),
        U.el('td', null, U.el('button', { class: 'btn secondary', text: '🗑', title: 'מחיקת שורה', onclick: function () {
          ev.schedule = ev.schedule.filter(function (x) { return x.id !== row.id; }); saveEv(ev); App.render();
        } }))
      ]);
      grip.addEventListener('mousedown', function () { tr.draggable = true; });
      tr.addEventListener('dragstart', function (e) { dragSchedId = row.id; tr.style.opacity = '.4'; e.dataTransfer.effectAllowed = 'move'; });
      tr.addEventListener('dragend', function () { tr.draggable = false; tr.style.opacity = ''; dragSchedId = null; });
      tr.addEventListener('dragover', function (e) { e.preventDefault(); tr.style.boxShadow = 'inset 0 2px 0 var(--primary,#2e7d32)'; });
      tr.addEventListener('dragleave', function () { tr.style.boxShadow = ''; });
      tr.addEventListener('drop', function (e) { e.preventDefault(); tr.style.boxShadow = ''; reorderSched(ev, row.id); });
      return tr;
    }));
    var tbl = U.el('table', { class: 'grid', style: 'margin-top:4px;' }, [
      U.el('thead', null, U.el('tr', null, ['', 'שעה', 'פעילות', 'הערה', ''].map(function (h) { return U.el('th', { text: h }); }))),
      tbody
    ]);
    var addTime = U.el('input', { type: 'time', style: 'max-width:110px;' });
    var addAct = U.el('input', { placeholder: '➕ פעילות ולחץ Enter', style: 'flex:2;min-width:160px;' });
    function addRow() {
      if (!addAct.value.trim()) { addAct.focus(); return; }
      if (!ev.schedule) ev.schedule = [];
      ev.schedule.push({ id: Store.uid(), time: addTime.value, activity: addAct.value.trim(), note: '' });
      saveEv(ev); App.render();
    }
    addAct.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addRow(); } });
    var addBar = U.el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:8px;' },
      [addTime, addAct, U.el('button', { class: 'btn secondary', text: 'הוסף שורה', onclick: addRow })]);
    return U.el('div', null, [U.el('div', { class: 'tbl-scroll' }, [tbl]), addBar]);
  }

  // הודעת וואטסאפ אישית למשימה בודדת (לאחראי המשויך)
  function taskWaMsg(ev, t) {
    return 'שלום ' + Store.empName(t.empId) + ',\nמשימה' + (ev.title ? ' עבור "' + ev.title + '"' : '') + ':\n• ' + (t.title || '');
  }

  // ---------- משימות (צ'ק-ליסט) ----------
  function tasksTable(ev) {
    var roleNames = eventRoles().map(function (r) { return r.name; });
    var tbody = U.el('tbody', null, (ev.tasks || []).map(function (t) {
      var roleW = U.dataListInput(t.role || '', roleNames, 'אחראי');
      transp(roleW._input); roleW._input.style.minWidth = '130px';
      roleW._input.addEventListener('change', function () {
        t.role = roleW.get();
        // האחראי (עובד לצורך שליחה בוואטסאפ) נגזר אוטומטית מהמיפוי תפקיד→עובד שבהגדרות
        t.empId = roleEmpId(t.role);
        saveEv(ev); App.render();
      });
      var owner = t.empId ? Store.empById(t.empId) : null;
      var waIcon = (owner && owner.phone)
        ? U.el('a', { href: 'https://wa.me/' + U.waNumber(owner.phone) + '?text=' + encodeURIComponent(taskWaMsg(ev, t)),
            target: '_blank', rel: 'noopener', title: 'שליחת המשימה בוואטסאפ ל' + Store.empName(t.empId),
            style: 'color:#25D366;flex:0 0 auto;', html: U.WA_SVG })
        : null;
      var roleCell = U.el('td', null, [U.el('div', { style: 'display:flex;align-items:center;gap:6px;' }, [roleW, waIcon].filter(Boolean))]);
      return U.el('tr', null, [
        U.el('td', { style: 'min-width:170px;' }, eText(ev, t, 'title', 'משימה', 'width:100%;')),
        roleCell,
        U.el('td', { style: 'min-width:130px;' }, eText(ev, t, 'note', 'הערה', 'width:100%;')),
        U.el('td', null, eSelect(t, 'status', TSTATUS, function () { saveEv(ev); App.render(); })),
        U.el('td', null, U.el('button', { class: 'btn secondary', text: '🗑', title: 'מחיקה', onclick: function () {
          ev.tasks = ev.tasks.filter(function (x) { return x.id !== t.id; }); saveEv(ev); App.render();
        } }))
      ]);
    }));
    var tbl = U.el('table', { class: 'grid', style: 'margin-top:4px;' }, [
      U.el('thead', null, U.el('tr', null, ['משימה', 'אחראי', 'הערה', 'סטטוס', ''].map(function (h) { return U.el('th', { text: h }); }))),
      tbody
    ]);
    // הוספה: מהקטלוג או משימה חופשית
    var addTitle = U.el('input', { placeholder: '➕ משימה חופשית ולחץ Enter', style: 'flex:2;min-width:160px;' });
    function addFree() {
      if (!addTitle.value.trim()) { addTitle.focus(); return; }
      if (!ev.tasks) ev.tasks = [];
      ev.tasks.push({ id: Store.uid(), title: addTitle.value.trim(), role: '', empId: '', status: 'פתוח', note: '' });
      saveEv(ev); App.render();
    }
    addTitle.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addFree(); } });
    var fromCatBtn = U.el('button', { class: 'btn secondary', text: '📋 הוסף מהקטלוג', onclick: function () {
      var have = (ev.tasks || []).map(function (t) { return t.title; });
      openTaskPicker([], have, function (ids) {
        ids.forEach(function (id) { var c = catById(id); if (c) ev.tasks.push(taskFromCatalog(c)); });
        saveEv(ev); App.render();
      });
    } });
    var addBar = U.el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:8px;' },
      [addTitle, U.el('button', { class: 'btn secondary', text: 'הוסף', onclick: addFree }), fromCatBtn]);
    return U.el('div', null, [U.el('div', { class: 'tbl-scroll' }, [tbl]), addBar]);
  }

  function taskFromCatalog(cat) {
    return { id: Store.uid(), title: cat.title, role: cat.defaultRole || '', empId: roleEmpId(cat.defaultRole), status: 'פתוח', note: '' };
  }

  // חלון בחירת משימות מהקטלוג (preIds=מסומנות מראש; excludeTitles=כבר קיימות שלא להציע שוב)
  function openTaskPicker(preIds, excludeTitles, onConfirm) {
    var cat = taskCatalog().filter(function (c) { return (excludeTitles || []).indexOf(c.title) === -1; });
    var checks = {};
    var rows = cat.map(function (c) {
      var cb = U.el('input', { type: 'checkbox', checked: (preIds || []).indexOf(c.id) !== -1 });
      checks[c.id] = cb;
      return U.el('label', { style: 'display:flex;align-items:center;gap:8px;padding:7px 8px;border:1px solid var(--border,#d6dce1);border-radius:8px;cursor:pointer;margin-bottom:6px;' }, [
        cb,
        U.el('span', { style: 'flex:1;', text: c.title }),
        U.el('span', { class: 'tag', style: 'font-size:12px;', text: c.defaultRole || '—' })
      ]);
    });
    var body = U.el('div', null, [
      U.el('div', { class: 'muted', style: 'font-size:13px;margin-bottom:10px;', text: 'סמנו את המשימות הרלוונטיות לאירוע. לכל משימה משויך אחראי אוטומטית לפי התפקיד.' }),
      U.el('button', { class: 'btn secondary', style: 'margin-bottom:10px;', text: '🤖 בחר משימות אוטומטית', onclick: function () {
        // כרגע: בחירה חכמה לפי סימון-המראש; חיבור ל-AI מלא יגיע בשלב ההקלטה
        cat.forEach(function (c) { checks[c.id].checked = (preIds || []).indexOf(c.id) !== -1; });
        U.toast('נבחרו המשימות המומלצות (בחירת AI מלאה תתחבר בשלב ההקלטה)', 'info');
      } })
    ].concat(rows));
    Modal.open('📋 בחירת משימות לאירוע', body, [
      { label: 'ביטול', class: 'secondary' },
      { label: 'אישור', onClick: function (close) {
        var ids = cat.filter(function (c) { return checks[c.id].checked; }).map(function (c) { return c.id; });
        close(); onConfirm(ids);
      } }
    ]);
  }

  // ---------- פלטים ----------
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function fmtDateLine(iso) {
    if (!iso) return 'ללא תאריך';
    return 'יום ' + U.weekdayName(iso) + ', ' + U.gregLabel(iso) + ' (' + U.hebrewDate(iso) + ')';
  }
  function copyText(text, okMsg) {
    function done() { U.toast(okMsg || 'הועתק ללוח'); }
    function fallback() {
      var ta = U.el('textarea', { style: 'position:fixed;opacity:0;' }); ta.value = text;
      document.body.appendChild(ta); ta.focus(); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { U.toast('לא ניתן להעתיק אוטומטית', 'error'); }
      document.body.removeChild(ta);
    }
    if (global.navigator && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else fallback();
  }

  function buildLozText(ev) {
    var lines = ['🗓️ *' + (ev.title || 'אירוע') + '*', fmtDateLine(ev.date)];
    if (ev.startTime) lines.push('🕗 ' + ev.startTime + (ev.endTime ? '–' + ev.endTime : ''));
    if (ev.location) lines.push('📍 ' + ev.location);
    if (ev.group) lines.push('👥 ' + ev.group);
    var sch = (ev.schedule || []);
    if (sch.length) {
      lines.push('', 'לו"ז:');
      sch.forEach(function (s) {
        lines.push((s.time ? s.time + ' — ' : '• ') + (s.activity || '') + (s.note ? ' (' + s.note + ')' : ''));
      });
    }
    return lines.join('\n');
  }

  // תאריכי יומן Google (מקומי, בלי אזור זמן)
  function gcalDates(ev) {
    if (!ev.date) return '';
    var d = ev.date.replace(/-/g, '');
    if (ev.startTime) {
      var st = ev.startTime.replace(':', '') + '00';
      var et = (ev.endTime || ev.startTime).replace(':', '') + '00';
      return d + 'T' + st + '/' + d + 'T' + et;
    }
    var next = U.addDays(ev.date, 1).replace(/-/g, '');
    return d + '/' + next; // כל-היום
  }
  function gcalUrl(ev) {
    var p = 'action=TEMPLATE&text=' + encodeURIComponent(ev.title || 'אירוע');
    var dt = gcalDates(ev); if (dt) p += '&dates=' + dt;
    if (ev.location) p += '&location=' + encodeURIComponent(ev.location);
    p += '&details=' + encodeURIComponent(buildLozText(ev));
    return 'https://calendar.google.com/calendar/render?' + p;
  }

  var DOC_CSS = 'body{font-family:"Rubik","Segoe UI",Arial,sans-serif;margin:0;padding:0;color:#111;background:#f1f5f9;}'
    + '.bar{position:sticky;top:0;background:#1b5e20;color:#fff;padding:10px 16px;display:flex;gap:10px;align-items:center;}'
    + '.bar button{background:#2e7d32;color:#fff;border:none;border-radius:8px;padding:8px 18px;font-size:15px;font-family:inherit;cursor:pointer;}'
    + 'section.page{background:#fff;max-width:800px;margin:16px auto;padding:28px 32px;box-shadow:0 1px 4px rgba(0,0,0,.15);}'
    + 'h1{margin:0 0 4px;font-size:26px;} h2{font-size:19px;border-bottom:2px solid #1b5e20;padding-bottom:6px;margin:18px 0 8px;}'
    + '.meta{color:#444;font-size:14px;margin:2px 0;} table{width:100%;border-collapse:collapse;font-size:14px;margin:6px 0;}'
    + 'th,td{border:1px solid #cbd5e1;padding:6px 9px;text-align:right;vertical-align:top;} th{background:#e8f5e9;font-weight:600;}'
    + '.sign{margin-top:34px;display:flex;justify-content:space-between;font-size:14px;} .line{border-top:1px solid #333;padding-top:4px;min-width:200px;text-align:center;}'
    + '.fill{border-bottom:1px dotted #666;min-height:22px;} .muted{color:#666;font-size:12px;}'
    + '@media print{body{background:#fff;} .bar{display:none;} section.page{box-shadow:none;margin:0;max-width:none;padding:12mm 12mm;}}';
  function openDoc(title, bodyHtml) {
    var w = global.open('', '_blank');
    if (!w) { U.toast('הדפדפן חסם את החלון — אפשרו חלונות קופצים', 'error'); return; }
    w.document.write('<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>' + esc(title) + '</title><style>' + DOC_CSS + '</style></head><body>'
      + '<div class="bar"><button onclick="window.print()">🖨️ הדפסה / שמירה כ-PDF</button></div>'
      + bodyHtml + '</body></html>');
    w.document.close();
  }
  function metaLine(label, val) { return val ? '<div class="meta"><b>' + esc(label) + ':</b> ' + esc(val) + '</div>' : ''; }
  function schedRowsHtml(ev) {
    if (!(ev.schedule || []).length) return '';
    var rows = ev.schedule.map(function (s) {
      return '<tr><td style="width:110px;">' + esc(s.time || '') + '</td><td>' + esc(s.activity || '') + '</td><td>' + esc(s.note || '') + '</td></tr>';
    }).join('');
    return '<h2>לו"ז</h2><table><thead><tr><th>שעה</th><th>פעילות</th><th>הערה</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }
  function printLoz(ev) {
    var body = '<section class="page"><h1>' + esc(ev.title || 'אירוע') + '</h1>'
      + '<div class="meta">' + esc(Store.settings().orgName || '') + ' · ' + esc(typeLabel(ev.type)) + '</div>'
      + metaLine('תאריך', ev.date ? fmtDateLine(ev.date) : '')
      + metaLine('שעות', ev.startTime ? (ev.startTime + (ev.endTime ? '–' + ev.endTime : '')) : '')
      + metaLine('קבוצה', ev.group) + metaLine('יעד', ev.location)
      + schedRowsHtml(ev)
      + (ev.notes ? '<h2>הערות</h2><div>' + esc(ev.notes) + '</div>' : '')
      + '</section>';
    openDoc('לו"ז — ' + (ev.title || 'אירוע'), body);
  }
  function printParents(ev) {
    var body = '<section class="page"><h1>אישור הורים ליציאה לפעילות</h1>'
      + '<div class="meta">' + esc(Store.settings().orgName || 'ישיבת רגבים בנימין') + '</div>'
      + '<h2>פרטי הפעילות</h2>'
      + metaLine('שם הפעילות', ev.title) + metaLine('סוג', typeLabel(ev.type))
      + metaLine('תאריך', ev.date ? fmtDateLine(ev.date) : '')
      + metaLine('שעות', ev.startTime ? (ev.startTime + (ev.endTime ? '–' + ev.endTime : '')) : '')
      + metaLine('יעד', ev.location) + metaLine('קבוצה', ev.group)
      + schedRowsHtml(ev)
      + '<h2>הצהרת ההורים</h2>'
      + '<p style="font-size:14px;line-height:1.9;">אני מאשר/ת לבני/בתי להשתתף בפעילות המפורטת לעיל, על אחריותי, '
      + 'ומצהיר/ה כי אין מניעה בריאותית להשתתפותו/ה.</p>'
      + '<table style="margin-top:12px;"><tbody>'
      + '<tr><td style="width:140px;">שם התלמיד/ה</td><td class="fill"></td><td style="width:90px;">כיתה</td><td class="fill"></td></tr>'
      + '<tr><td>שם ההורה</td><td class="fill"></td><td>ת"ז</td><td class="fill"></td></tr>'
      + '<tr><td>טלפון</td><td class="fill"></td><td>תאריך</td><td class="fill"></td></tr>'
      + '</tbody></table>'
      + '<div class="sign"><div class="line">חתימת ההורה</div><div class="line">חתימת המחנך</div></div>'
      + '</section>';
    openDoc('אישור הורים — ' + (ev.title || 'אירוע'), body);
  }

  // ---------- אישורי הורים (חתימה דיגיטלית) ----------
  function norm(s) { return String(s == null ? '' : s).trim(); }
  function matchClassName(group, classes) {
    group = norm(group); if (!group) return '';
    var exact = classes.filter(function (c) { return c.name === group; })[0];
    if (exact) return exact.name;
    var part = classes.filter(function (c) { return c.name && group.indexOf(c.name) !== -1; })[0];
    return part ? part.name : '';
  }
  function buildConsentForm(ev) {
    var classes = Store.classesAll().map(function (c) {
      return { name: c.name, students: (c.students || []).map(function (s) { return s.name; }) };
    });
    return {
      eventId: ev.id, title: ev.title || 'אירוע',
      date: ev.date || '', dateLabel: ev.date ? fmtDateLine(ev.date) : '',
      startTime: ev.startTime || '', endTime: ev.endTime || '',
      location: ev.location || '', group: ev.group || '',
      permission: Store.settings().consentText || '',
      classes: classes,
      defaultClass: matchClassName(ev.group, Store.classesAll()),
      open: true, updatedAt: (new Date()).toISOString()
    };
  }
  function consentUrl(ev) {
    var dir = location.pathname.replace(/[^/]*$/, '');
    return location.origin + dir + 'consent.html?ev=' + encodeURIComponent(ev.id);
  }
  function publishAndSend(ev) {
    var w = global.open('', '_blank'); // נפתח בתוך מחוות הלחיצה כדי לעקוף חוסם חלונות
    if (w) { try { w.document.write('טוען…'); } catch (e) {} }
    U.toast('מפרסם טופס…', 'info');
    Store.publishConsentForm(buildConsentForm(ev)).then(function () {
      var link = consentUrl(ev);
      var msg = 'הורים יקרים, לאישור השתתפות ' + (ev.title || 'האירוע')
        + (ev.date ? ' (' + fmtDateLine(ev.date) + ')' : '') + ' נא למלא ולחתום כאן:\n' + link;
      var wa = 'https://wa.me/?text=' + encodeURIComponent(msg);
      if (w) w.location = wa; else global.open(wa, '_blank', 'noopener');
    }).catch(function (e) { if (w) w.close(); U.toast('פרסום נכשל: ' + e.message, 'error'); });
  }
  function printConsents(ev, rows, missing, clsName) {
    var signedRows = rows.map(function (r) {
      var t = r.created_at ? new Date(r.created_at).toLocaleString('he-IL') : '';
      return '<tr><td>' + esc(r.student_name || '') + '</td><td>' + esc(r.student_class || '') + '</td><td>'
        + esc(r.parent_name || '') + '</td><td>' + esc(r.parent_phone || '') + '</td><td>' + esc(r.parent_id || '')
        + '</td><td>' + esc(t) + '</td></tr>';
    }).join('');
    var missHtml = (missing && missing.length)
      ? '<h2>טרם חתמו' + (clsName ? ' — כיתה ' + esc(clsName) : '') + ' (' + missing.length + ')</h2><table><tbody>'
        + missing.map(function (n) { return '<tr><td>' + esc(n) + '</td></tr>'; }).join('') + '</tbody></table>'
      : '';
    var body = '<section class="page"><h1>אישורי הורים — ' + esc(ev.title || 'אירוע') + '</h1>'
      + '<div class="meta">' + esc(Store.settings().orgName || '') + '</div>'
      + metaLine('תאריך', ev.date ? fmtDateLine(ev.date) : '') + metaLine('יעד', ev.location)
      + '<h2>חתמו (' + rows.length + ')</h2>'
      + '<table><thead><tr><th>תלמיד/ה</th><th>כיתה</th><th>הורה</th><th>טלפון</th><th>ת"ז</th><th>מועד חתימה</th></tr></thead><tbody>'
      + (signedRows || '<tr><td colspan="6">אין</td></tr>') + '</tbody></table>'
      + missHtml + '</section>';
    openDoc('אישורי הורים — ' + (ev.title || 'אירוע'), body);
  }
  function printOneConsent(r) {
    var snap = r.event_snapshot || {};
    var t = r.created_at ? new Date(r.created_at).toLocaleString('he-IL') : '';
    var body = '<section class="page"><h1>אישור הורים</h1>'
      + '<div class="meta">' + esc(Store.settings().orgName || 'ישיבת רגבים בנימין') + '</div>'
      + '<h2>' + esc(snap.title || r.event_title || '') + '</h2>'
      + metaLine('תאריך', snap.dateLabel) + metaLine('שעות', (snap.startTime || '') + (snap.endTime ? '–' + snap.endTime : ''))
      + metaLine('יעד', snap.location) + metaLine('קבוצה', snap.group)
      + '<h2>הצהרה</h2><p style="font-size:14px;line-height:1.8;">' + esc(snap.permission || '') + '</p>'
      + '<table><tbody>'
      + '<tr><td style="width:140px;">שם התלמיד/ה</td><td>' + esc(r.student_name || '') + '</td><td style="width:70px;">כיתה</td><td>' + esc(r.student_class || '') + '</td></tr>'
      + '<tr><td>שם ההורה</td><td>' + esc(r.parent_name || '') + '</td><td>ת"ז</td><td>' + esc(r.parent_id || '') + '</td></tr>'
      + '<tr><td>טלפון</td><td>' + esc(r.parent_phone || '') + '</td><td>מועד חתימה</td><td>' + esc(t) + '</td></tr>'
      + '</tbody></table>'
      + '<h2>חתימת ההורה</h2>'
      + (r.signature ? '<img src="' + r.signature + '" alt="חתימה" style="max-width:320px;border:1px solid #ccc;border-radius:8px;"/>' : '<div class="muted">אין חתימה</div>')
      + '<p class="muted" style="margin-top:10px;">אישור זה נחתם דיגיטלית דרך פורטל ההורים של הישיבה, כולל חותמת זמן.</p>'
      + '</section>';
    openDoc('אישור — ' + (r.student_name || ''), body);
  }
  function consentControls(ev) {
    return U.el('div', { class: 'no-print', style: 'display:flex;gap:6px;flex-wrap:wrap;' }, [
      U.el('button', { class: 'btn', html: U.WA_SVG + ' שלח אישור הורים בוואטסאפ', onclick: function () { publishAndSend(ev); } }),
      U.el('button', { class: 'btn secondary', text: '🔗 העתק קישור', onclick: function () {
        Store.publishConsentForm(buildConsentForm(ev)).then(function () { copyText(consentUrl(ev), 'הקישור לחתימה הועתק'); })
          .catch(function (e) { U.toast('פרסום נכשל: ' + e.message, 'error'); });
      } }),
      U.el('button', { class: 'btn secondary', text: '📄 טופס נייר', onclick: function () { printParents(ev); } })
    ]);
  }
  function renderTracking(ev, box, rows) {
    U.clear(box);
    var classes = Store.classesAll();
    var clsSel = U.el('select', { style: 'font-size:13px;min-width:130px;' },
      [U.el('option', { value: '', text: '— כיתה למעקב חוסרים —' })].concat(classes.map(function (c) { return U.el('option', { value: c.name, text: c.name }); })));
    var chosen = ev.consentClass || matchClassName(ev.group, classes) || '';
    clsSel.value = chosen;
    clsSel.addEventListener('change', function () { ev.consentClass = clsSel.value; saveEv(ev); App.render(); });

    var signedSet = {};
    rows.forEach(function (r) { signedSet[norm(r.student_name)] = true; });
    var missing = [];
    if (chosen) {
      var c = classes.filter(function (x) { return x.name === chosen; })[0];
      ((c && c.students) || []).forEach(function (s) { if (!signedSet[norm(s.name)]) missing.push(s.name); });
    }

    box.appendChild(U.el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px;' }, [
      U.el('span', { class: 'tag', text: '✔ חתמו: ' + rows.length }),
      chosen ? U.el('span', { class: 'tag', style: 'background:#fff3e0;border-color:#f9a825;color:#8a5a00;', text: '⏳ חסרים: ' + missing.length }) : null,
      U.el('span', { class: 'spacer' }),
      clsSel,
      U.el('button', { class: 'btn secondary small', text: '🖨️ הדפס/ייצא', onclick: function () { printConsents(ev, rows, missing, chosen); } })
    ].filter(Boolean)));

    if (rows.length) {
      var tb = U.el('tbody', null, rows.map(function (r) {
        var t = r.created_at ? new Date(r.created_at).toLocaleDateString('he-IL') : '';
        return U.el('tr', null, [
          U.el('td', { text: r.student_name || '' }),
          U.el('td', { text: r.student_class || '' }),
          U.el('td', { text: r.parent_name || '' }),
          U.el('td', { text: t }),
          U.el('td', null, [U.el('button', { class: 'btn secondary small', text: '📄', title: 'הצג/הדפס אישור', onclick: function () { printOneConsent(r); } })])
        ]);
      }));
      box.appendChild(U.el('div', { class: 'tbl-scroll' }, [U.el('table', { class: 'grid' }, [
        U.el('thead', null, U.el('tr', null, ['תלמיד/ה', 'כיתה', 'הורה', 'תאריך', ''].map(function (h) { return U.el('th', { text: h }); }))),
        tb
      ])]));
    } else {
      box.appendChild(U.el('div', { class: 'muted', style: 'font-size:12px;', text: 'עדיין אין אישורים. שלחו את הקישור בוואטסאפ.' }));
    }

    if (chosen && missing.length) {
      box.appendChild(U.el('div', { style: 'margin-top:8px;font-size:13px;' }, [
        U.el('span', { class: 'muted', text: 'טרם חתמו (' + chosen + '): ' }),
        U.el('span', { text: missing.join(', ') })
      ]));
    }
  }
  function consentBody(ev) {
    var wrap = U.el('div', { class: 'no-print', style: 'margin-top:4px;' });
    wrap.appendChild(consentControls(ev));
    var trackBox = U.el('div', { style: 'margin-top:8px;' }, [U.el('div', { class: 'muted', style: 'font-size:12px;', text: 'טוען אישורים…' })]);
    wrap.appendChild(trackBox);
    Store.fetchConsents(ev.id).then(function (rows) { renderTracking(ev, trackBox, rows); })
      .catch(function () { U.clear(trackBox); trackBox.appendChild(U.el('div', { class: 'muted', style: 'font-size:12px;', text: 'לא ניתן לטעון אישורים (נדרש חיבור לענן).' })); });
    return wrap;
  }

  // ---------- תפוצת משימות ----------
  function collectTasks(events, openOnly) {
    var out = [];
    events.forEach(function (ev) {
      (ev.tasks || []).forEach(function (t) {
        if (openOnly && t.status === 'בוצע') return;
        out.push({ ev: ev, task: t });
      });
    });
    return out;
  }
  function summaryByOwnerText(events, title, openOnly) {
    var groups = {}, order = [];
    collectTasks(events, openOnly).forEach(function (p) {
      var key = p.task.empId ? ('e:' + p.task.empId) : ('r:' + (p.task.role || 'ללא'));
      var name = p.task.empId ? Store.empName(p.task.empId) : (p.task.role || 'ללא אחראי');
      if (!groups[key]) { groups[key] = { name: name, items: [] }; order.push(key); }
      groups[key].items.push(p);
    });
    var multi = events.length > 1;
    var lines = ['📋 *חלוקת משימות' + (title ? ' — ' + title : '') + '*'];
    order.forEach(function (key) {
      var g = groups[key];
      lines.push('', '👤 *' + g.name + '*');
      g.items.forEach(function (p) {
        var suffix = multi && p.ev.title ? '  [' + p.ev.title + (p.ev.date ? ' ' + U.gregLabel(p.ev.date) : '') + ']' : '';
        lines.push('• ' + p.task.title + suffix + (p.task.status === 'בוצע' ? ' ✓' : ''));
      });
    });
    if (!order.length) lines.push('', '(אין משימות)');
    return lines.join('\n');
  }
  function personalLinks(events, openOnly) {
    var byEmp = {}, order = [];
    collectTasks(events, openOnly).forEach(function (p) {
      if (!p.task.empId) return;
      if (!byEmp[p.task.empId]) { byEmp[p.task.empId] = []; order.push(p.task.empId); }
      byEmp[p.task.empId].push(p);
    });
    var multi = events.length > 1;
    return order.map(function (id) {
      var emp = Store.empById(id), items = byEmp[id];
      var txt = 'שלום ' + Store.empName(id) + ',\nהמשימות שלך' + (multi ? ' לשבוע הקרוב' : (items[0] && items[0].ev.title ? ' עבור "' + items[0].ev.title + '"' : '')) + ':\n'
        + items.map(function (p) { return '• ' + p.task.title + (multi && p.ev.title ? '  [' + p.ev.title + ']' : ''); }).join('\n');
      var wa = emp && emp.phone ? U.waNumber(emp.phone) : null;
      return { id: id, name: Store.empName(id), phone: emp && emp.phone, count: items.length,
        url: wa ? 'https://wa.me/' + wa + '?text=' + encodeURIComponent(txt) : null };
    });
  }
  function openDispatch(events, title, openOnly) {
    var people = personalLinks(events, openOnly);
    var body;
    if (!people.length) {
      body = U.el('div', { class: 'empty' }, 'אין משימות עם אחראי משויך לשליחה.');
    } else {
      body = U.el('div', null, [
        U.el('div', { class: 'muted', style: 'font-size:13px;margin-bottom:10px;', text: 'לחיצה על "שלח" פותחת צ\'אט וואטסאפ פרטי עם האחראי, כשרשימת המשימות שלו כבר ממולאת.' })
      ].concat(people.map(function (pp) {
        var right = U.el('div', null, [
          U.el('div', { style: 'font-weight:600;', text: pp.name }),
          U.el('div', { class: 'muted', style: 'font-size:12px;', text: pp.count + ' משימות' + (pp.phone ? '' : ' · אין טלפון במצבת') })
        ]);
        var action = pp.url
          ? U.el('a', { class: 'btn', href: pp.url, target: '_blank', rel: 'noopener', html: U.WA_SVG + ' שלח' })
          : U.el('span', { class: 'muted', style: 'font-size:12px;', text: '—' });
        return U.el('div', { style: 'display:flex;align-items:center;gap:10px;padding:8px;border:1px solid var(--border,#d6dce1);border-radius:8px;margin-bottom:6px;' },
          [right, U.el('span', { class: 'spacer' }), action]);
      })));
    }
    Modal.open('📤 שליחה אישית' + (title ? ' — ' + title : ''), body, [{ label: 'סגירה', class: 'secondary' }]);
  }

  // ---------- כרטיס אירוע ----------
  function eventCard(ev) {
    var cardCollapsed = !!collapsedMap['card:' + ev.id];
    var card = U.el('div', { class: 'card', style: 'margin-bottom:16px;border-top:4px solid ' + stColor(ESTATUS, ev.status) + ';' });

    // כפתור כיווץ/פתיחה של כל האירוע (לכל אירוע בנפרד)
    var chevron = U.el('button', { class: 'btn secondary ico', title: cardCollapsed ? 'פתיחת האירוע' : 'כיווץ האירוע',
      onclick: function () { collapsedMap['card:' + ev.id] = !cardCollapsed; saveCollapsed(); App.render(); } }, cardCollapsed ? '▸' : '▾');

    var numPill = U.el('span', { style: 'font-size:11px;font-weight:700;color:var(--muted,#6b7884);background:var(--bg,#f1f5f9);border-radius:6px;padding:2px 8px;white-space:nowrap;', text: ev.num || '' });
    var nameInp = transp(U.el('input', { value: ev.title || '', placeholder: 'שם האירוע', style: 'font-size:19px;font-weight:700;min-width:160px;flex:1;' }));
    nameInp.addEventListener('change', function () { ev.title = nameInp.value.trim(); saveEv(ev); });
    var statusSel = eSelect(ev, 'status', ESTATUS, function () { saveEv(ev); App.render(); });
    statusSel.style.cssText += 'border-radius:16px;font-weight:600;';
    var actionBtns = [];
    if (ev.archived) {
      actionBtns.push(U.el('button', { class: 'btn secondary ico', text: '↩️', title: 'שחזור מהארכיון', onclick: function () { ev.archived = false; saveEv(ev); App.render(); } }));
      actionBtns.push(U.el('button', { class: 'btn secondary ico', text: '🗑', title: 'מחיקה לצמיתות', onclick: function () {
        Modal.confirm({ title: 'מחיקה לצמיתות', text: 'למחוק לצמיתות את "' + (ev.title || '') + '"? לא ניתן לשחזר.', okLabel: 'מחיקה', danger: true }, function () { Store.deleteEvent(ev.id); App.render(); });
      } }));
    } else {
      actionBtns.push(U.el('button', { class: 'btn secondary ico', text: '📦', title: 'העברה לארכיון', onclick: function () { ev.archived = true; saveEv(ev); App.render(); } }));
    }
    card.appendChild(U.el('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;' },
      [chevron, numPill, U.el('span', { class: 'tag', text: typeLabel(ev.type) }), nameInp, U.el('span', { class: 'spacer' }), statusSel].concat(actionBtns)));

    // כשמכווץ — תקציר בשורה אחת בלבד
    if (cardCollapsed) {
      var doneC = (ev.tasks || []).filter(function (t) { return t.status === 'בוצע'; }).length;
      card.appendChild(U.el('div', { style: 'display:flex;gap:14px;flex-wrap:wrap;margin-top:8px;color:var(--muted,#6b7884);font-size:13px;' }, [
        U.el('span', { text: '📅 ' + (ev.date ? fmtDateLine(ev.date) : '—') }),
        ev.group ? U.el('span', { text: '👥 ' + ev.group }) : null,
        ev.location ? U.el('span', { text: '📍 ' + ev.location }) : null,
        U.el('span', { text: '✅ ' + doneC + '/' + ((ev.tasks || []).length) })
      ].filter(Boolean)));
      return card;
    }

    // מטא: תאריך, שעות, קבוצה, יעד
    var dateInp = U.el('input', { type: 'date', value: ev.date || '', class: 'chip-date-input' });
    dateInp.addEventListener('change', function () { ev.date = dateInp.value; saveEv(ev); App.render(); });
    var dateChip = U.dateChip(ev.date ? fmtDateLine(ev.date) : 'בחר תאריך', dateInp, { title: 'תאריך האירוע' });
    function metaChip(icon, kids) {
      return U.el('span', { class: 'range-chip' }, [U.el('span', { class: 'rc-ic', text: icon })].concat(kids));
    }
    var meta = U.el('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px;' }, [
      dateChip,
      metaChip('🕗', [eTime(ev, ev, 'startTime'), U.el('span', { style: 'opacity:.6;', text: '–' }), eTime(ev, ev, 'endTime')]),
      metaChip('👥', [eText(ev, ev, 'group', 'קבוצה/כיתה', 'min-width:90px;')]),
      metaChip('📍', [eText(ev, ev, 'location', 'יעד/מקום', 'min-width:110px;')])
    ]);
    card.appendChild(meta);

    // סעיפים מתקפלים — לו"ז / משימות / אישורי הורים — כולם באותה שורה כשסגורים
    var cLoz = collapsedMap['loz:' + ev.id];
    var cTasks = collapsedMap['tasks:' + ev.id];
    var cConsent = !!collapsedMap['consentOpen:' + ev.id];
    var doneN = (ev.tasks || []).filter(function (t) { return t.status === 'בוצע'; }).length;
    card.appendChild(U.el('div', { class: 'no-print', style: 'display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:10px 0 2px;' }, [
      U.el('button', { class: 'btn secondary', onclick: function () { collapsedMap['loz:' + ev.id] = !cLoz; saveCollapsed(); App.render(); } },
        (cLoz ? '▸' : '▾') + ' 🗒️ לו"ז (' + (ev.schedule || []).length + ')'),
      U.el('button', { class: 'btn secondary', onclick: function () { collapsedMap['tasks:' + ev.id] = !cTasks; saveCollapsed(); App.render(); } },
        (cTasks ? '▸' : '▾') + ' ✅ משימות (' + doneN + '/' + (ev.tasks || []).length + ')'),
      U.el('button', { class: 'btn secondary', onclick: function () { collapsedMap['consentOpen:' + ev.id] = !cConsent; saveCollapsed(); App.render(); } },
        (cConsent ? '▾' : '▸') + ' 🖊️ אישורי הורים')
    ]));
    if (!cLoz) card.appendChild(scheduleTable(ev));
    if (!cTasks) card.appendChild(tasksTable(ev));
    if (cConsent) card.appendChild(consentBody(ev));

    // הערות
    var notes = eText(ev, ev, 'notes', '📝 הערות לאירוע…', 'width:100%;font-size:13px;color:var(--muted,#6b7884);margin-top:10px;');
    card.appendChild(U.el('div', { style: 'margin:8px 0;' }, [notes]));

    // פלטים
    var outputs = U.el('div', { class: 'no-print', style: 'display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;padding-top:10px;border-top:1px dashed var(--border,#d6dce1);' }, [
      U.el('a', { class: 'btn secondary', href: 'https://wa.me/?text=' + encodeURIComponent(buildLozText(ev)), target: '_blank', rel: 'noopener', html: WA_GREEN + ' שלח לו"ז' }),
      U.el('button', { class: 'btn secondary', text: '🖨️ הדפס לו"ז', onclick: function () { printLoz(ev); } }),
      U.el('a', { class: 'btn secondary', href: gcalUrl(ev), target: '_blank', rel: 'noopener', text: '📅 הוסף ליומן Google' }),
      U.el('a', { class: 'btn secondary', href: 'https://wa.me/?text=' + encodeURIComponent(summaryByOwnerText([ev], ev.title, false)), target: '_blank', rel: 'noopener', html: WA_GREEN + ' סיכום משימות' })
    ]);
    card.appendChild(outputs);
    return card;
  }

  // ---------- חלון אירוע חדש ----------
  function openNewEvent() {
    var types = eventTypes();
    var typeSel = U.el('select', null, types.map(function (t) { return U.el('option', { value: t.id, text: t.label }); }));
    var title = U.el('input', { placeholder: 'שם האירוע (למשל: טיול כיתה ת\')' });
    var date = U.el('input', { type: 'date', value: U.todayISO() });
    var group = U.el('input', { placeholder: 'קבוצה/כיתה' });
    var location = U.el('input', { placeholder: 'יעד/מקום' });
    var st = U.el('input', { type: 'time' });
    var et = U.el('input', { type: 'time' });
    var err = U.el('div', { class: 'field-err' });
    function fld(label, node) { return U.el('div', { class: 'field' }, [U.el('label', { text: label }), node]); }
    var body = U.el('div', null, [
      fld('סוג אירוע', typeSel),
      fld('שם האירוע', title),
      U.el('div', { class: 'row' }, [fld('תאריך', date), fld('קבוצה/כיתה', group)]),
      U.el('div', { class: 'row' }, [fld('שעת התחלה', st), fld('שעת סיום', et)]),
      fld('יעד/מקום', location),
      err
    ]);
    Modal.open('➕ אירוע חדש', body, [
      { label: 'ביטול', class: 'secondary' },
      { label: 'המשך לבחירת משימות ›', onClick: function (close) {
        if (!title.value.trim()) { err.textContent = 'נדרש שם אירוע'; title.focus(); return; }
        var type = typeById(typeSel.value);
        var ev = {
          type: typeSel.value, title: title.value.trim(), date: date.value, group: group.value.trim(),
          location: location.value.trim(), startTime: st.value, endTime: et.value, status: 'בתכנון',
          schedule: (type && type.scheduleTemplate ? type.scheduleTemplate : []).map(function (s) { return { id: Store.uid(), time: s.time || '', activity: s.activity || '', note: '' }; }),
          tasks: [], notes: ''
        };
        close();
        openTaskPicker(type ? (type.defaultTaskIds || []) : [], [], function (ids) {
          ids.forEach(function (id) { var c = catById(id); if (c) ev.tasks.push(taskFromCatalog(c)); });
          // למידה: הפריסט של סוג האירוע מתעדכן למה שנבחר בפועל
          if (type) { type.defaultTaskIds = ids.slice(); Store.saveSettings(); }
          Store.upsertEvent(ev);
          focusNew = true; App.render();
        });
      } }
    ]);
  }

  // ---------- מסלול AI: יצירת אירועים מפגישה ----------
  function draftToEvent(d) {
    var t = eventTypes().filter(function (x) { return x.label === d.typeLabel; })[0];
    var typeId = t ? t.id : ((eventTypes()[0] && eventTypes()[0].id) || '');
    var tasks = (d.tasks || []).map(function (tk) {
      return { id: Store.uid(), title: tk.title || '', role: tk.role || '', empId: roleEmpId(tk.role || ''), status: 'פתוח', note: '' };
    });
    var schedule = (d.schedule || []).map(function (s) {
      return { id: Store.uid(), time: s.time || '', activity: s.activity || '', note: s.note || '' };
    });
    return { type: typeId, title: d.title || 'אירוע', group: d.group || '', date: d.date || '', startTime: d.startTime || '', endTime: d.endTime || '', location: d.location || '', status: 'בתכנון', schedule: schedule, tasks: tasks, notes: '' };
  }
  function meetingContext() {
    return {
      eventTypes: eventTypes().map(function (t) { return t.label; }),
      roles: eventRoles().map(function (r) { return r.name; }),
      taskCatalog: taskCatalog().map(function (c) { return c.title; }),
      today: U.todayISO()
    };
  }
  function openDraftReview(drafts) {
    var rows = drafts.map(function (d) {
      var cb = U.el('input', { type: 'checkbox', checked: true });
      var meta = [d.typeLabel, d.date || 'ללא תאריך', d.group].filter(Boolean).join(' · ');
      var node = U.el('label', { style: 'display:flex;gap:8px;align-items:flex-start;padding:8px;border:1px solid var(--border,#d6dce1);border-radius:8px;margin-bottom:8px;cursor:pointer;' }, [
        cb,
        U.el('div', null, [
          U.el('div', { style: 'font-weight:600;', text: d.title || 'אירוע' }),
          U.el('div', { class: 'muted', style: 'font-size:12px;', text: meta }),
          U.el('div', { class: 'muted', style: 'font-size:12px;', text: '🗒️ ' + (d.schedule || []).length + ' שורות לו"ז · ✅ ' + (d.tasks || []).length + ' משימות' })
        ])
      ]);
      return { cb: cb, d: d, node: node };
    });
    var body = U.el('div', null, [
      U.el('div', { class: 'muted', style: 'font-size:13px;margin-bottom:10px;', text: 'סמנו אילו אירועים ליצור. אפשר לערוך כל אחד אחרי היצירה בכרטיס.' })
    ].concat(rows.map(function (r) { return r.node; })));
    Modal.open('📋 טיוטת אירועים (' + drafts.length + ')', body, [
      { label: 'ביטול', class: 'secondary' },
      { label: 'צור נבחרים', onClick: function (close) {
        var chosen = rows.filter(function (r) { return r.cb.checked; });
        if (!chosen.length) { U.toast('לא נבחרו אירועים', 'error'); return; }
        chosen.forEach(function (r) { Store.upsertEvent(draftToEvent(r.d)); });
        close(); focusNew = true; App.render();
        U.toast(chosen.length + ' אירועים נוצרו כטיוטה — עברו ואשרו', 'success');
      } }
    ]);
  }
  // חיווי "חשיבה" קבוע בזמן שה-AI מעבד (במקום הודעה חולפת) — מחזיר פונקציית סגירה
  function openThinking(messages) {
    var spinner = U.el('div', { style: 'width:46px;height:46px;border:4px solid var(--primary-light,#e8f5e9);border-top-color:var(--primary,#2e7d32);border-radius:50%;animation:spin .8s linear infinite;' });
    var line = U.el('div', { style: 'font-size:15px;font-weight:600;color:var(--primary-dark,#1b5e20);text-align:center;min-height:20px;', text: messages[0] });
    var sub = U.el('div', { class: 'muted', style: 'font-size:12px;text-align:center;', text: 'זה עשוי לקחת עד כדקה — אפשר להשאיר את החלון פתוח.' });
    var body = U.el('div', { style: 'display:flex;flex-direction:column;align-items:center;gap:14px;padding:22px 8px;' }, [spinner, line, sub]);
    var close = Modal.open('🤖 ה-AI חושב…', body, []);
    var i = 0;
    var iv = setInterval(function () { if (i < messages.length - 1) { i++; line.textContent = messages[i]; } }, 5500);
    return function () { clearInterval(iv); close(); };
  }
  function openMeetingAI() {
    var mode = 'text';
    var textArea = U.el('textarea', { rows: 8, placeholder: 'הדביקו כאן את סיכום/תמלול הפגישה…', style: 'width:100%;' });
    // ללא accept — קובצי אודיו של וואטסאפ (.mpeg) מסוננים בטעות ע"י מסנן האודיו של הדפדפן
    var fileInp = U.el('input', { type: 'file' });
    var textWrap = U.el('div', null, [textArea]);
    var audioWrap = U.el('div', { style: 'display:none;' }, [
      U.el('div', { class: 'muted', style: 'font-size:12px;margin-bottom:6px;', text: 'העלו קובץ הקלטה — גם ארוך (חצי שעה ומעלה). עברית נתמכת.' }),
      fileInp
    ]);
    var btnText = U.el('button', { class: 'active', text: '📝 הדבקת טקסט' });
    var btnAudio = U.el('button', { text: '🎙️ הקלטה' });
    btnText.addEventListener('click', function () { mode = 'text'; textWrap.style.display = ''; audioWrap.style.display = 'none'; btnText.classList.add('active'); btnAudio.classList.remove('active'); });
    btnAudio.addEventListener('click', function () { mode = 'audio'; textWrap.style.display = 'none'; audioWrap.style.display = ''; btnAudio.classList.add('active'); btnText.classList.remove('active'); });
    var err = U.el('div', { class: 'field-err' });
    var body = U.el('div', null, [
      U.el('div', { class: 'muted', style: 'font-size:12px;margin-bottom:8px;', text: 'ה-AI יבנה טיוטת אירועים (לו"ז + משימות) שתעברו ותאשרו לפני יצירה. פיילוט על Gemini.' }),
      U.el('div', { class: 'subtabs', style: 'margin-bottom:10px;' }, [btnText, btnAudio]),
      textWrap, audioWrap, err
    ]);
    Modal.open('🎙️ יצירת אירועים מפגישה (AI)', body, [
      { label: 'ביטול', class: 'secondary' },
      { label: 'נתח ובנה טיוטה', onClick: function (close) {
        err.textContent = '';
        function finish(stop, events) { stop(); if (!events.length) { U.toast('ה-AI לא זיהה אירועים', 'error'); return; } openDraftReview(events); }
        if (mode === 'text') {
          if (!textArea.value.trim()) { err.textContent = 'הדביקו טקסט'; return; }
          close();
          var stopT = openThinking(['קורא את תוכן הפגישה…', 'מזהה אירועים ובונה לו"ז ומשימות…', 'כמעט מוכן…']);
          Store.meetingToEvents({ mode: 'text', text: textArea.value.trim(), context: meetingContext() })
            .then(function (events) { finish(stopT, events); })
            .catch(function (e) { stopT(); U.toast('שגיאה: ' + e.message, 'error'); });
        } else {
          if (!fileInp.files[0]) { err.textContent = 'בחרו קובץ הקלטה'; return; }
          var f = fileInp.files[0];
          close();
          var stopA = openThinking(['מעלה את ההקלטה…', 'מתמלל את ההקלטה…', 'מזהה אירועים ובונה לו"ז ומשימות…', 'כמעט מוכן…']);
          Store.uploadMeetingAudio(f).then(function (path) {
            return Store.meetingToEvents({ mode: 'audio', bucket: 'meeting-audio', path: path, mimeType: f.type || 'audio/mpeg', context: meetingContext() });
          }).then(function (events) { finish(stopA, events); })
            .catch(function (e) { stopA(); U.toast('שגיאה: ' + e.message, 'error'); });
        }
      } }
    ]);
  }

  // ---------- רינדור ----------
  function upcomingEvents() {
    var today = U.todayISO();
    return Store.eventsAll().filter(function (e) { return !e.archived && (!e.date || e.date >= today); });
  }
  // ארכוב אוטומטי: אירוע שהתאריך שלו עבר ולא נגעו בו ידנית — עובר לארכיון
  function autoArchivePast() {
    var today = U.todayISO();
    Store.eventsAll().forEach(function (e) {
      if (e.archived === undefined && e.date && e.date < today) { e.archived = true; Store.upsertEvent(e); }
    });
  }
  function render(view) {
    autoArchivePast();
    var all = Store.eventsAll().slice().sort(function (a, b) {
      if (!a.date) return 1; if (!b.date) return -1;
      return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0);
    });
    var active = all.filter(function (e) { return !e.archived; });
    var archived = all.filter(function (e) { return !!e.archived; });
    var list = showArchive ? archived : active;

    var menuItems = [{ icon: '🎙️', label: 'יצירה מפגישה (AI)', onClick: openMeetingAI }];
    if (active.length) {
      menuItems.push({ icon: '📋', label: 'סיכום שבועי לפי אחראי', onClick: function () { copyText(summaryByOwnerText(upcomingEvents(), 'השבוע', true), 'הסיכום השבועי הועתק — הדביקו בקבוצה'); } });
      menuItems.push({ icon: '📤', label: 'שליחה שבועית אישית', onClick: function () { openDispatch(upcomingEvents(), 'השבוע', true); } });
    }
    var headKids = [U.el('h2', { text: '🗓️ תכנון אירועים וטיולים' }), U.el('span', { class: 'spacer' })];
    if (!showArchive) headKids.push(U.el('button', { class: 'btn', text: '➕ אירוע חדש', onclick: openNewEvent }));
    headKids.push(U.actionMenu(menuItems));
    view.appendChild(U.el('div', { class: 'page-head' }, headKids));

    // תת-טאבים: אירועים פעילים / ארכיון
    view.appendChild(U.el('div', { class: 'subtabs', style: 'margin-bottom:12px;' }, [
      U.el('button', { class: showArchive ? '' : 'active', onclick: function () { showArchive = false; App.render(); } }, '🗓️ אירועים (' + active.length + ')'),
      U.el('button', { class: showArchive ? 'active' : '', onclick: function () { showArchive = true; App.render(); } }, '🗄️ ארכיון (' + archived.length + ')')
    ]));

    if (!showArchive && active.length) {
      var openTasks = 0, upcoming = 0, today = U.todayISO();
      active.forEach(function (e) {
        (e.tasks || []).forEach(function (t) { if (t.status !== 'בוצע') openTasks++; });
        if (e.date && e.date >= today && e.status !== 'בוצע') upcoming++;
      });
      view.appendChild(U.el('div', { class: 'kpi-row', style: 'margin-bottom:16px;' }, [
        kpi('🗓️', active.length, 'אירועים', 'kpi-neutral'),
        kpi('📅', upcoming, 'קרובים', 'kpi-info'),
        kpi('✅', openTasks, 'משימות פתוחות', openTasks ? 'kpi-warn' : 'kpi-neutral')
      ]));
    }

    if (!list.length) {
      view.appendChild(U.el('div', { class: 'empty' }, showArchive ? 'אין אירועים בארכיון.' : 'אין עדיין אירועים — הוסיפו אירוע חדש למעלה.'));
      return;
    }
    list.forEach(function (ev) { view.appendChild(eventCard(ev)); });
    if (focusNew) { focusNew = false; setTimeout(function () { global.scrollTo(0, 0); }, 0); }
  }

  function kpi(icon, val, label, cls) {
    return U.el('div', { class: 'kpi ' + (cls || 'kpi-neutral') }, [
      U.el('span', { class: 'kpi-ic', text: icon }),
      U.el('div', { class: 'kpi-body' }, [
        U.el('div', { class: 'kpi-val', text: String(val) }),
        U.el('div', { class: 'kpi-lbl', text: label })
      ])
    ]);
  }

  global.EventsView = { render: render };
})(window);
