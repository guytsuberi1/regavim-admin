/* app.js — אתחול, ניווט דו-שכבתי (גיליונות → מסכים) וניתוב */
(function (global) {
  'use strict';
  var U = global.U;

  // כל מסכי האפליקציה
  var VIEWS = {
    status: global.StatusView,
    queue: global.QueueView,
    lc: global.LcView,
    sub: global.SubView,
    abs: global.AbsView,
    pdf: global.PdfView,
    tasks: global.TasksView,
    projects: global.ProjectsView,
    emp: global.EmpView,
    week: global.WeekView,
    cand: global.CandView,
    pos: global.PosView,
    events: global.EventsView,
    settings: global.SettingsView
  };

  // גיליונות — כל אחד מקבץ כמה מסכים (תת-טאבים בראש התוכן)
  var SHEETS = [
    { id: 'payroll', label: '💼 דוחות שכר', subs: [
      { id: 'status', label: '📋 לוח שכר' },
      { id: 'queue', label: '📥 תור אישורים' },
      { id: 'lc', label: '📚 מרכז למידה' },
      { id: 'sub', label: '🔁 מילוי מקום' },
      { id: 'abs', label: '🪖 היעדרויות וגמולים' },
      { id: 'pdf', label: '🖨️ חבילת PDF' }
    ] },
    { id: 'staff', label: '👥 ניהול עובדים', subs: [
      { id: 'emp', label: '👤 עובדים' },
      { id: 'week', label: '🗓️ לוח שבועי' },
      { id: 'cand', label: '🎯 מועמדים' },
      { id: 'pos', label: '📌 משרות' }
    ] },
    { id: 'tasks', label: '✅ ניהול משימות', subs: [
      { id: 'tasks', label: '✅ משימות' }
    ] },
    { id: 'projects', label: '🏗️ ניהול פרויקטים', subs: [
      { id: 'projects', label: '🏗️ פרויקטים' }
    ] },
    { id: 'events', label: '🗓️ תכנון אירועים וטיולים', subs: [
      { id: 'events', label: '🗓️ אירועים' }
    ] }
  ];
  // פריטים עצמאיים (לא גיליונות) — הגדרות כגלגל מוצמד לתחתית (כמו בשאר האפליקציות)
  var STANDALONE = [
    { id: 'settings', label: '⚙️', foot: true, title: 'הגדרות' }
  ];

  // מפה הפוכה: מסך → הגיליון שאליו הוא שייך
  var VIEW_SHEET = {};
  SHEETS.forEach(function (sh) { sh.subs.forEach(function (s) { VIEW_SHEET[s.id] = sh.id; }); });

  // הרשאות: admin רואה הכל; secretary רק מרכז למידה
  var ROLE_VIEWS = {
    admin: ['status', 'queue', 'lc', 'sub', 'abs', 'pdf', 'emp', 'week', 'cand', 'pos', 'tasks', 'projects', 'events', 'settings'],
    secretary: ['lc']
  };
  function roleKey() { return Store.currentRole(); }
  function allowedViews() { return ROLE_VIEWS[roleKey()] || ROLE_VIEWS.secretary; }

  var current = 'status';
  var lastSub = {}; // sheetId → תת-מסך אחרון שנבחר

  function updateQueueBadge() {
    var btn = U.$('#tabs button[data-nav="payroll"]');
    if (!btn) return;
    var n = Store.pendingCount();
    var badge = btn.querySelector('.tab-badge');
    if (n > 0) {
      if (!badge) { badge = U.el('span', { class: 'tab-badge' }); btn.appendChild(badge); }
      badge.textContent = n;
    } else if (badge) { badge.parentNode.removeChild(badge); }
  }

  // בניית סרגל הצד לפי הרשאה
  function buildSidebar() {
    var nav = U.$('#tabs');
    if (!nav) return;
    U.clear(nav);
    var allowed = allowedViews();
    var visibleSheets = SHEETS.filter(function (sh) {
      return sh.subs.some(function (s) { return allowed.indexOf(s.id) !== -1; });
    });
    if (visibleSheets.length) {
      nav.appendChild(U.el('div', { class: 'nav-sec', text: 'גיליונות' }));
      visibleSheets.forEach(function (sh) {
        nav.appendChild(U.el('button', { 'data-nav': sh.id, onclick: function () { openSheet(sh.id); } }, sh.label));
      });
    }
    var stand = STANDALONE.filter(function (v) { return allowed.indexOf(v.id) !== -1 && !v.foot; });
    if (stand.length) {
      nav.appendChild(U.el('div', { class: 'nav-sec', text: 'ניהול' }));
      stand.forEach(function (v) {
        nav.appendChild(U.el('button', { 'data-nav': v.id, onclick: function () { setView(v.id); } }, v.label));
      });
    }
    STANDALONE.filter(function (v) { return allowed.indexOf(v.id) !== -1 && v.foot; }).forEach(function (v) {
      nav.appendChild(U.el('button', { 'data-nav': v.id, class: 'tab-foot', title: v.title || '', 'aria-label': v.title || '' }, v.label));
    });
    U.$all('#tabs button[data-nav]').forEach(function (b) {
      if (b.classList.contains('tab-foot')) b.addEventListener('click', function () { setView(b.getAttribute('data-nav')); });
    });
  }

  function openSheet(sheetId) {
    var sh = SHEETS.filter(function (x) { return x.id === sheetId; })[0];
    if (!sh) return;
    var allowed = allowedViews();
    var subs = sh.subs.filter(function (s) { return allowed.indexOf(s.id) !== -1; });
    if (!subs.length) return;
    var target = lastSub[sheetId];
    if (!target || subs.indexOf(subs.filter(function (s) { return s.id === target; })[0]) === -1) target = subs[0].id;
    setView(target);
  }

  function highlightNav() {
    var activeNav = VIEW_SHEET[current] || current; // גיליון או פריט עצמאי
    U.$all('#tabs button[data-nav]').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-nav') === activeNav);
    });
  }

  function render() {
    updateQueueBadge();
    highlightNav();
    var view = U.$('#view');
    U.clear(view);

    // אם המסך הנוכחי שייך לגיליון עם יותר ממסך אחד — הצג תת-טאבים
    var sheetId = VIEW_SHEET[current];
    var sh = sheetId && SHEETS.filter(function (x) { return x.id === sheetId; })[0];
    if (sh) {
      var allowed = allowedViews();
      var subs = sh.subs.filter(function (s) { return allowed.indexOf(s.id) !== -1; });
      if (subs.length > 1) {
        var bar = U.el('div', { class: 'subtabs', style: 'margin-bottom:14px;' }, subs.map(function (s) {
          var b = U.el('button', { class: current === s.id ? 'active' : '', onclick: function () { setView(s.id); } }, s.label);
          if (s.id === 'queue') {
            var n = Store.pendingCount();
            if (n > 0) b.appendChild(U.el('span', { class: 'tab-badge', text: String(n) }));
          }
          return b;
        }));
        view.appendChild(bar);
      }
    }

    var mod = VIEWS[current];
    var host = U.el('div');
    view.appendChild(host);
    if (mod && mod.render) mod.render(host);
    else host.appendChild(U.el('div', { class: 'empty' }, 'המסך בבנייה...'));

    Array.prototype.forEach.call(view.querySelectorAll('table.grid'), function (t) {
      var p = t.parentNode;
      if (!p || (p.classList && p.classList.contains('tbl-scroll'))) return;
      var wrap = U.el('div', { class: 'tbl-scroll' });
      p.insertBefore(wrap, t);
      wrap.appendChild(t);
    });
  }

  function setView(viewId) {
    var allowed = allowedViews();
    if (allowed.indexOf(viewId) === -1) viewId = allowed[0];
    current = viewId;
    if (VIEW_SHEET[viewId]) lastSub[VIEW_SHEET[viewId]] = viewId;
    render();
  }
  // תאימות לאחור — קוד קיים קורא App.setTab(...)
  function setTab(viewId) { setView(viewId); }

  // ---------- בורר חודש משותף ----------
  var month = (function () {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  })();
  function currentMonth() { return month; }
  function setMonth(m) { month = m; render(); }
  function monthHeader(title, extraNodes) {
    var input = U.el('input', { type: 'month', value: month, style: 'position:absolute;opacity:0;pointer-events:none;width:0;height:0;' });
    input.addEventListener('change', function () { if (input.value) setMonth(input.value); });
    var chip = U.dateChip(U.monthLabel(month), input, { title: 'לחצו לבחירת חודש' });
    return U.el('div', { class: 'page-head' }, [U.el('h2', { text: title }), chip].concat(extraNodes || []));
  }

  // ---------- מודאל גנרי ----------
  global.Modal = {
    open: function (title, bodyNode, buttons) {
      var bg = U.el('div', { class: 'modal-bg' });
      var closeBtn = U.el('button', { class: 'x', text: '×', onclick: close });
      var head = U.el('div', { class: 'modal-head' }, [U.el('h3', { text: title }), closeBtn]);
      var body = U.el('div', { class: 'modal-body' }, [bodyNode]);
      var footChildren = (buttons || []).map(function (b) {
        return U.el('button', {
          class: 'btn ' + (b.class || ''),
          onclick: function () { if (b.onClick) b.onClick(close); else close(); }
        }, b.label);
      });
      var foot = U.el('div', { class: 'modal-foot' }, footChildren);
      var modal = U.el('div', { class: 'modal' }, [head, body, foot]);
      bg.appendChild(modal);
      var downOnBg = false;
      var downEvt = ('onpointerdown' in window) ? 'pointerdown' : 'mousedown';
      bg.addEventListener(downEvt, function (e) { downOnBg = (e.target === bg); });
      bg.addEventListener('click', function (e) { if (e.target === bg && downOnBg) close(); downOnBg = false; });
      function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }
      document.addEventListener('keydown', onKey);
      document.body.appendChild(bg);
      function close() {
        document.removeEventListener('keydown', onKey);
        if (bg.parentNode) bg.parentNode.removeChild(bg);
        if (global.Store && Store.flushPendingRemote) Store.flushPendingRemote();
      }
      return close;
    },
    confirm: function (opts, onOk) {
      opts = opts || {};
      var body = U.el('div', null, [
        U.el('div', { style: 'font-size:15px;line-height:1.6;white-space:pre-line;', text: opts.text || '' })
      ]);
      global.Modal.open(opts.title || 'אישור פעולה', body, [
        { label: opts.cancelLabel || 'ביטול', class: 'secondary' },
        { label: opts.okLabel || 'אישור', class: (opts.danger ? 'danger' : ''), onClick: function (close) { close(); onOk && onOk(); } }
      ]);
    }
  };

  function init() {
    Store.load();
    Store.initPersistence(function () {
      buildSidebar();
      var allowed = allowedViews();
      current = roleKey() === 'admin' ? 'status' : allowed[0];
      render();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }

  global.App = { setTab: setTab, setView: setView, render: render, currentMonth: currentMonth, setMonth: setMonth, monthHeader: monthHeader };
})(window);
