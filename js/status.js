/* status.js — לוח שכר חודשי: סטטוס, משימה והערות פר עובד + מונה התקדמות */
(function (global) {
  'use strict';
  var U = global.U;

  var filterMode = 'open'; // 'open' | 'all'

  function statusDef(id) {
    return (Store.settings().statuses || []).filter(function (s) { return s.id === id; })[0] || null;
  }

  function isDone(entry) {
    if (!entry || !entry.statusId) return false;
    var def = statusDef(entry.statusId);
    return !!def && (def.id === 'done' || def.label === 'בוצע');
  }

  function render(view) {
    var month = App.currentMonth();
    var emps = Store.employees().slice().sort(function (a, b) {
      return Store.empName(a).localeCompare(Store.empName(b), 'he');
    });

    var doneCount = 0;
    emps.forEach(function (e) { if (isDone(Store.pstatEntry(month, e.id))) doneCount++; });

    view.appendChild(App.monthHeader('📋 לוח שכר — מעקב חודשי'));

    if (!emps.length) {
      view.appendChild(U.el('div', { class: 'empty' }, [
        'אין עובדים במצבת.',
        U.el('div', { class: 'muted', style: 'margin-top:6px;' }, 'עברו ל"נתוני בסיס" וייבאו את מצבת העובדים מאקסל.')
      ]));
      return;
    }

    // KPI התקדמות
    var pct = emps.length ? Math.round(doneCount / emps.length * 100) : 0;
    var pending = Store.pendingCount();
    view.appendChild(U.el('div', { class: 'kpi-row' }, [
      U.el('div', { class: 'kpi ' + (pct === 100 ? 'kpi-good' : 'kpi-info') }, [
        U.el('span', { class: 'kpi-ic', text: pct === 100 ? '🎉' : '📊' }),
        U.el('div', { class: 'kpi-body' }, [
          U.el('div', { class: 'kpi-val', text: doneCount + ' / ' + emps.length }),
          U.el('div', { class: 'kpi-lbl', text: 'עובדים שטופלו (' + pct + '%)' })
        ])
      ]),
      pending > 0 ? U.el('div', { class: 'kpi kpi-warn', style: 'cursor:pointer;', onclick: function () { App.setTab('queue'); } }, [
        U.el('span', { class: 'kpi-ic', text: '📥' }),
        U.el('div', { class: 'kpi-body' }, [
          U.el('div', { class: 'kpi-val', text: String(pending) }),
          U.el('div', { class: 'kpi-lbl', text: 'דיווחי עובדים ממתינים לאישור' })
        ])
      ]) : null
    ].filter(Boolean)));

    // סינון
    var seg = U.el('div', { class: 'subtabs', style: 'margin-bottom:10px;' }, [
      U.el('button', { class: filterMode === 'open' ? 'active' : '', text: 'ממתינים לטיפול (' + (emps.length - doneCount) + ')', onclick: function () { filterMode = 'open'; App.render(); } }),
      U.el('button', { class: filterMode === 'all' ? 'active' : '', text: 'כולם (' + emps.length + ')', onclick: function () { filterMode = 'all'; App.render(); } })
    ]);
    view.appendChild(seg);

    var statuses = Store.settings().statuses || [];
    var shown = emps.filter(function (e) {
      if (filterMode === 'all') return true;
      return !isDone(Store.pstatEntry(month, e.id));
    });

    if (!shown.length) {
      view.appendChild(U.el('div', { class: 'empty' }, '🎉 כל העובדים טופלו החודש!'));
      return;
    }

    var tbl = U.el('table', { class: 'grid' }, [
      U.el('thead', null, U.el('tr', null, ['עובד', 'סטטוס', 'משימה חודשית', 'הערות', ''].map(function (h) { return U.el('th', { text: h }); }))),
      U.el('tbody', null, shown.map(function (e) {
        var entry = Store.pstatEntry(month, e.id) || {};

        var sel = U.el('select', { style: 'min-width:140px;' },
          [U.el('option', { value: '', text: '—' })].concat(statuses.map(function (s) {
            return U.el('option', { value: s.id, text: s.label });
          })));
        sel.value = entry.statusId || '';
        var def = statusDef(entry.statusId);
        if (def && def.color) sel.style.borderColor = def.color;
        sel.addEventListener('change', function () {
          Store.setPstat(month, e.id, { statusId: sel.value });
          App.render();
        });

        var task = U.el('input', { value: entry.task || '', placeholder: 'מה נדרש מהעובד החודש…', style: 'width:100%;min-width:160px;' });
        task.addEventListener('change', function () { Store.setPstat(month, e.id, { task: task.value.trim() }); });

        var note = U.el('input', { value: entry.note || '', placeholder: 'הערות…', style: 'width:100%;min-width:140px;' });
        note.addEventListener('change', function () { Store.setPstat(month, e.id, { note: note.value.trim() }); });

        var doneBtn = U.el('button', {
          class: 'btn ' + (isDone(entry) ? '' : 'secondary'),
          text: isDone(entry) ? '↩️' : '✓',
          title: isDone(entry) ? 'החזרה לטיפול' : 'סימון בוצע',
          onclick: function () {
            Store.setPstat(month, e.id, { statusId: isDone(entry) ? '' : 'done' });
            App.render();
          }
        });

        return U.el('tr', null, [
          U.el('td', null, [
            U.el('strong', { text: Store.empName(e) }),
            entry.by && entry.at ? U.el('div', { class: 'muted', style: 'font-size:11px;', text: 'עודכן: ' + new Date(entry.at).toLocaleDateString('he-IL') }) : null
          ]),
          U.el('td', null, sel),
          U.el('td', null, task),
          U.el('td', null, note),
          U.el('td', null, doneBtn)
        ]);
      }))
    ]);
    view.appendChild(U.el('div', { class: 'tbl-scroll' }, [tbl]));
  }

  global.StatusView = { render: render };
})(window);
