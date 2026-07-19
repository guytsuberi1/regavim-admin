/* status.js — לוח שכר חודשי: סטטוס (פתוח/בתהליך/נסגר), משימות חודשיות (רב-בחירה), הערות */
(function (global) {
  'use strict';
  var U = global.U;

  var STATUSES = [
    { key: 'פתוח', color: '#64748b' },
    { key: 'בתהליך', color: '#2563eb' },
    { key: 'נסגר', color: '#16a34a' }
  ];
  // סוגי המשימות החודשיות (סימון ידני פר עובד) — תווית מלאה + קצרה לצ'יפ
  var TASK_TYPES = [
    { key: 'מרכז למידה', short: 'מ.למידה' },
    { key: 'אישור מילואים/מחלה', short: 'מיל׳/מחלה' },
    { key: 'עבודה בזמן מילואים', short: 'עבודה מיל׳' },
    { key: 'מילוי מקום', short: 'מ.מקום' },
    { key: 'טיולים', short: 'טיולים' },
    { key: 'נסיעות', short: 'נסיעות' }
  ];
  function stColor(s) { var x = STATUSES.filter(function (q) { return q.key === s; })[0]; return x ? x.color : '#64748b'; }

  var filterMode = 'open'; // 'open' (לא נסגר) | 'all'

  function render(view) {
    var month = App.currentMonth();
    var emps = Store.employees().slice().sort(function (a, b) {
      return Store.empName(a).localeCompare(Store.empName(b), 'he');
    });

    var closedCount = 0;
    emps.forEach(function (e) { var en = Store.pstatEntry(month, e.id); if (en && en.status === 'נסגר') closedCount++; });

    view.appendChild(App.monthHeader('📋 לוח שכר — מעקב חודשי'));

    if (!emps.length) {
      view.appendChild(U.el('div', { class: 'empty' }, [
        'אין עובדים במצבת.',
        U.el('div', { class: 'muted', style: 'margin-top:6px;' }, 'עברו ל"נתוני בסיס" וייבאו את מצבת העובדים מאקסל.')
      ]));
      return;
    }

    var pct = emps.length ? Math.round(closedCount / emps.length * 100) : 0;
    var pending = Store.pendingCount();
    view.appendChild(U.el('div', { class: 'kpi-row' }, [
      U.el('div', { class: 'kpi ' + (pct === 100 ? 'kpi-good' : 'kpi-info') }, [
        U.el('span', { class: 'kpi-ic', text: pct === 100 ? '🎉' : '📊' }),
        U.el('div', { class: 'kpi-body' }, [
          U.el('div', { class: 'kpi-val', text: closedCount + ' / ' + emps.length }),
          U.el('div', { class: 'kpi-lbl', text: 'עובדים שנסגרו (' + pct + '%)' })
        ])
      ]),
      pending > 0 ? U.el('div', { class: 'kpi kpi-warn', style: 'cursor:pointer;', onclick: function () { App.setView('queue'); } }, [
        U.el('span', { class: 'kpi-ic', text: '📥' }),
        U.el('div', { class: 'kpi-body' }, [
          U.el('div', { class: 'kpi-val', text: String(pending) }),
          U.el('div', { class: 'kpi-lbl', text: 'דיווחי עובדים ממתינים לאישור' })
        ])
      ]) : null
    ].filter(Boolean)));

    var seg = U.el('div', { class: 'subtabs', style: 'margin-bottom:10px;' }, [
      U.el('button', { class: filterMode === 'open' ? 'active' : '', text: 'פעילים (' + (emps.length - closedCount) + ')', onclick: function () { filterMode = 'open'; App.render(); } }),
      U.el('button', { class: filterMode === 'all' ? 'active' : '', text: 'כולם (' + emps.length + ')', onclick: function () { filterMode = 'all'; App.render(); } })
    ]);
    view.appendChild(seg);

    var shown = emps.filter(function (e) {
      if (filterMode === 'all') return true;
      var en = Store.pstatEntry(month, e.id);
      return !(en && en.status === 'נסגר');
    });

    if (!shown.length) {
      view.appendChild(U.el('div', { class: 'empty' }, '🎉 כל העובדים נסגרו החודש!'));
      return;
    }

    var tbl = U.el('table', { class: 'grid' }, [
      U.el('thead', null, U.el('tr', null, ['עובד', 'סטטוס', 'משימות החודש', 'הערות'].map(function (h) { return U.el('th', { text: h }); }))),
      U.el('tbody', null, shown.map(function (e) {
        var entry = Store.pstatEntry(month, e.id) || {};
        var selected = entry.tasks || [];

        var sel = U.el('select', { style: 'min-width:120px;border-color:' + stColor(entry.status) + ';' },
          [U.el('option', { value: '', text: '—' })].concat(STATUSES.map(function (s) {
            return U.el('option', { value: s.key, text: s.key });
          })));
        sel.value = entry.status || '';
        sel.addEventListener('change', function () { Store.setPstat(month, e.id, { status: sel.value }); App.render(); });

        // צ'יפים לסימון סוגי המשימות
        var pills = U.el('div', { style: 'display:flex;flex-wrap:wrap;gap:4px;' }, TASK_TYPES.map(function (t) {
          var on = selected.indexOf(t.key) !== -1;
          return U.el('button', {
            class: 'tag', title: t.key,
            style: 'cursor:pointer;font-size:12px;border:1px solid;' + (on
              ? 'background:var(--brand-light,#e8f1ff);border-color:var(--brand,#2563eb);color:var(--brand-dark,#1e40af);font-weight:600;'
              : 'background:transparent;border-color:var(--border,#d6dce1);color:var(--muted,#6b7884);opacity:.75;'),
            onclick: function () {
              var cur = (Store.pstatEntry(month, e.id) || {}).tasks || [];
              var next = cur.indexOf(t.key) !== -1 ? cur.filter(function (x) { return x !== t.key; }) : cur.concat([t.key]);
              Store.setPstat(month, e.id, { tasks: next });
              App.render();
            }
          }, on ? '✓ ' + t.short : t.short);
        }));

        var note = U.el('input', { value: entry.note || '', placeholder: 'הערות…', style: 'width:100%;min-width:140px;' });
        note.addEventListener('change', function () { Store.setPstat(month, e.id, { note: note.value.trim() }); });

        return U.el('tr', null, [
          U.el('td', null, [
            U.el('strong', { text: Store.empName(e) }),
            entry.at ? U.el('div', { class: 'muted', style: 'font-size:11px;', text: 'עודכן: ' + new Date(entry.at).toLocaleDateString('he-IL') }) : null
          ]),
          U.el('td', null, sel),
          U.el('td', null, pills),
          U.el('td', null, note)
        ]);
      }))
    ]);
    view.appendChild(U.el('div', { class: 'tbl-scroll' }, [tbl]));
  }

  global.StatusView = { render: render };
})(window);
