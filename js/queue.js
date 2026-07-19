/* queue.js — תור אישורים: דיווחי עובדים מהפורטל → אישור/דחייה → רשומה בדוח החודשי */
(function (global) {
  'use strict';
  var U = global.U;

  var TYPE = {
    absence: { icon: '🪖', label: 'דיווח היעדרות' },
    travel: { icon: '🚗', label: 'דיווח נסיעות' },
    trip: { icon: '🏕️', label: 'דיווח טיול' }
  };

  var showHandled = false;

  function payloadSummary(s) {
    var p = s.payload || {};
    if (s.type === 'absence') {
      return [p.dates, p.reason, p.hours ? p.hours + ' שעות' : null, p.note].filter(Boolean).join(' · ');
    }
    if (s.type === 'travel') {
      return [p.date, p.route, p.km ? p.km + ' ק"מ' : null, p.note].filter(Boolean).join(' · ');
    }
    return [p.purpose, p.depart ? 'יציאה: ' + p.depart.replace('T', ' ') : null,
            p.ret ? 'חזרה: ' + p.ret.replace('T', ' ') : null,
            p.nights ? p.nights + ' לילות' : null, p.note].filter(Boolean).join(' · ');
  }

  // דיווח מאושר → רשומה בשורת abs של החודש הנבחר
  function toRecord(s) {
    var p = s.payload || {};
    if (s.type === 'absence') {
      return { kind: 'absence', name: s.employee_name,
               fromDate: p.from || '', toDate: p.to || '', dates: p.dates || '', hours: p.hours || '',
               reason: p.reason || '', approval: s.file_path ? 'received' : 'missing',
               deduction: 'none', note: p.note || '', filePath: s.file_path || '', fromPortal: true };
    }
    if (s.type === 'travel') {
      return { kind: 'travel', name: s.employee_name, date: p.date || '', route: p.route || '',
               km: U.num(p.km), note: p.note || '', fromPortal: true };
    }
    return { kind: 'trip', name: s.employee_name, purpose: p.purpose || '', depart: p.depart || '',
             ret: p.ret || '', nights: U.num(p.nights), klass: p.klass || '', meals: p.meals || '',
             note: p.note || '', fromPortal: true };
  }

  function approve(s) {
    var monthSel = U.el('input', { type: 'month', value: App.currentMonth() });
    Modal.open('✅ אישור דיווח', U.el('div', null, [
      U.el('p', { style: 'margin-top:0;' }, [
        U.el('strong', { text: s.employee_name }), ' · ' + (TYPE[s.type] || {}).label
      ]),
      U.el('p', { class: 'muted', text: payloadSummary(s) }),
      U.el('div', { class: 'field' }, [U.el('label', { text: 'לאיזה דוח חודשי לשייך?' }), monthSel])
    ]), [
      { label: 'ביטול', class: 'secondary' },
      { label: 'אישור והוספה לדוח', onClick: function (close) {
        var month = monthSel.value || App.currentMonth();
        Store.upsertRecord('abs', month, toRecord(s));
        Store.updateSubmission(s.id, { status: 'approved' }).then(function () {
          close();
          U.toast('הדיווח אושר ונוסף לדוח ' + U.monthLabel(month));
          App.render();
        }).catch(function (e) {
          close();
          U.toast('הרשומה נוצרה אך עדכון הסטטוס נכשל: ' + e.message, 'error');
          App.render();
        });
      } }
    ]);
  }

  function reject(s) {
    Modal.confirm({
      title: 'דחיית דיווח',
      text: 'לדחות את הדיווח של ' + s.employee_name + '?\nהדיווח יסומן כנדחה ולא ייכנס לדוח.',
      okLabel: 'דחייה', danger: true
    }, function () {
      Store.updateSubmission(s.id, { status: 'rejected' }).then(function () {
        U.toast('הדיווח נדחה');
        App.render();
      }).catch(function (e) { U.toast('שגיאה: ' + e.message, 'error'); });
    });
  }

  function fileBtn(s) {
    if (!s.file_path) return null;
    var btn = U.el('button', { class: 'btn secondary', text: '📎 צפייה באישור' });
    btn.addEventListener('click', function () {
      btn.disabled = true;
      Store.approvalFileUrl(s.file_path).then(function (url) {
        btn.disabled = false;
        if (url) window.open(url, '_blank');
        else U.toast('לא הצלחתי לפתוח את הקובץ', 'error');
      });
    });
    return btn;
  }

  function card(s) {
    var t = TYPE[s.type] || { icon: '📄', label: s.type };
    var when = new Date(s.created_at);
    var statusTag = s.status === 'pending' ? null
      : U.el('span', { class: 'tag', text: s.status === 'approved' ? '✓ אושר' : '✕ נדחה',
          style: s.status === 'approved' ? 'background:#dcfce7;color:#166534;' : 'background:#fee2e2;color:#991b1b;' });
    return U.el('div', { class: 'card', style: 'margin-bottom:10px;' }, [
      U.el('div', { style: 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;' }, [
        U.el('span', { style: 'font-size:22px;', text: t.icon }),
        U.el('div', { style: 'flex:1;min-width:200px;' }, [
          U.el('div', null, [
            U.el('strong', { text: s.employee_name }),
            ' — ' + t.label + ' ',
            statusTag
          ]),
          U.el('div', { class: 'muted', style: 'font-size:13px;', text: payloadSummary(s) || 'ללא פירוט' }),
          U.el('div', { class: 'muted', style: 'font-size:11px;', text: 'נשלח: ' + when.toLocaleString('he-IL') + (s.handled_by ? ' · טופל ע"י ' + s.handled_by : '') })
        ]),
        fileBtn(s),
        s.status === 'pending' ? U.el('button', { class: 'btn', text: '✅ אישור', onclick: function () { approve(s); } }) : null,
        s.status === 'pending' ? U.el('button', { class: 'btn secondary', text: '✕ דחייה', onclick: function () { reject(s); } }) : null
      ].filter(Boolean))
    ]);
  }

  function render(view) {
    view.appendChild(U.el('div', { class: 'page-head' }, [
      U.el('h2', { text: '📥 תור אישורים' }),
      U.el('span', { class: 'spacer' }),
      U.el('button', { class: 'btn secondary', text: '🔄 רענון', onclick: function () {
        Store.loadSubmissions().then(function () { App.render(); });
      } })
    ]));

    var subs = Store.submissions();
    if (subs == null) {
      view.appendChild(U.el('div', { class: 'empty' }, 'טוען דיווחים…'));
      Store.loadSubmissions().then(function () { App.render(); });
      return;
    }

    var pending = subs.filter(function (s) { return s.status === 'pending'; });
    var handled = subs.filter(function (s) { return s.status !== 'pending'; });

    if (!pending.length) {
      view.appendChild(U.el('div', { class: 'empty' }, '✨ אין דיווחים שממתינים לאישור'));
    } else {
      pending.forEach(function (s) { view.appendChild(card(s)); });
    }

    if (handled.length) {
      var toggle = U.el('button', {
        class: 'btn secondary', style: 'margin-top:8px;',
        text: (showHandled ? 'הסתרת' : 'הצגת') + ' דיווחים שטופלו (' + handled.length + ')',
        onclick: function () { showHandled = !showHandled; App.render(); }
      });
      view.appendChild(toggle);
      if (showHandled) handled.slice(0, 50).forEach(function (s) { view.appendChild(card(s)); });
    }
  }

  global.QueueView = { render: render };
})(window);
