/* app.js — אתחול וניתוב בין טאבים */
(function (global) {
  'use strict';
  var U = global.U;

  var TABS = {
    queue: global.QueueView,
    status: global.StatusView,
    lc: global.LcView,
    sub: global.SubView,
    abs: global.AbsView,
    pdf: global.PdfView,
    base: global.BaseView,
    settings: global.SettingsView
  };

  var current = 'status';

  // הרשאות → אילו טאבים גלויים
  // admin=גיא (הכל) · secretary=מזכירות (מרכז למידה בלבד)
  var ROLE_TABS = {
    admin: ['queue', 'status', 'lc', 'sub', 'abs', 'pdf', 'base', 'settings'],
    secretary: ['lc']
  };
  function roleKey() { return Store.currentRole(); }
  function applyRole() {
    var role = roleKey();
    var allowed = ROLE_TABS[role] || ROLE_TABS.secretary;
    U.$all('#tabs button').forEach(function (b) {
      var t = b.getAttribute('data-tab');
      b.style.display = allowed.indexOf(t) !== -1 ? '' : 'none';
    });
    U.$all('#tabs .nav-sec').forEach(function (d) {
      var anyVisible = false, n = d.nextElementSibling;
      while (n && !n.classList.contains('nav-sec')) {
        if (n.tagName === 'BUTTON' && n.style.display !== 'none') { anyVisible = true; break; }
        n = n.nextElementSibling;
      }
      d.style.display = anyVisible ? '' : 'none';
    });
    if (allowed.indexOf(current) === -1) current = allowed[0];
  }

  // מונה "ממתינים לאישור" על טאב תור האישורים
  function updateQueueBadge() {
    var btn = U.$('#tabs button[data-tab="queue"]');
    if (!btn) return;
    var n = Store.pendingCount();
    var badge = btn.querySelector('.tab-badge');
    if (n > 0) {
      if (!badge) {
        badge = U.el('span', { class: 'tab-badge' });
        btn.appendChild(badge);
      }
      badge.textContent = n;
    } else if (badge) {
      badge.parentNode.removeChild(badge);
    }
  }

  function render() {
    applyRole();
    updateQueueBadge();
    var view = U.$('#view');
    U.clear(view);
    var mod = TABS[current];
    if (mod && mod.render) {
      mod.render(view);
    } else {
      view.appendChild(U.el('div', { class: 'empty' }, 'המסך בבנייה...'));
    }
    Array.prototype.forEach.call(view.querySelectorAll('table.grid'), function (t) {
      var p = t.parentNode;
      if (!p || (p.classList && p.classList.contains('tbl-scroll'))) return;
      var wrap = U.el('div', { class: 'tbl-scroll' });
      p.insertBefore(wrap, t);
      wrap.appendChild(t);
    });
  }

  function setTab(tab) {
    var allowed = ROLE_TABS[roleKey()] || ROLE_TABS.secretary;
    if (allowed.indexOf(tab) === -1) tab = allowed[0];
    current = tab;
    U.$all('#tabs button').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === tab);
    });
    render();
  }

  // ---------- בורר חודש משותף לכל הגיליונות ----------
  var month = (function () {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  })();
  function currentMonth() { return month; }
  function setMonth(m) { month = m; render(); }
  // כותרת גיליון + בורר חודש אחיד
  function monthHeader(title, extraNodes) {
    var input = U.el('input', { type: 'month', value: month, style: 'position:absolute;opacity:0;pointer-events:none;width:0;height:0;' });
    input.addEventListener('change', function () { if (input.value) setMonth(input.value); });
    var chip = U.dateChip(U.monthLabel(month), input, { title: 'לחצו לבחירת חודש' });
    var head = U.el('div', { class: 'page-head' }, [
      U.el('h2', { text: title }),
      chip
    ].concat(extraNodes || []));
    return head;
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
    U.$all('#tabs button').forEach(function (b) {
      b.addEventListener('click', function () { setTab(b.getAttribute('data-tab')); });
    });
    Store.initPersistence(function () {
      applyRole();
      var role = roleKey();
      current = role === 'admin' ? 'status' : (ROLE_TABS[role] || ROLE_TABS.secretary)[0];
      U.$all('#tabs button').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-tab') === current); });
      render();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }

  global.App = { setTab: setTab, render: render, currentMonth: currentMonth, setMonth: setMonth, monthHeader: monthHeader };
})(window);
