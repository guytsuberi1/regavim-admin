/* safety.js — בטיחות, רישוי וביטוחים: מרשם אישורים עם תוקף + צ'ק-ליסט מסמכי רישוי מוסד.
   התפוגה מחושבת מתאריך ההנפקה לפי התדירות; התראה מתחילה 60 יום מראש. */
(function (global) {
  'use strict';
  var U = global.U;

  var WARN_DAYS = 60;          // מתי מתחילים להתריע לפני תפוגה
  var LICENSE_GROUP = 'רישוי מוסד';

  var subTab = 'certs';        // 'certs' (אישורים עם תוקף) | 'license' (רישוי מוסד)

  function daysTo(iso) {
    if (!iso) return null;
    var d = U.fromISO(iso); d.setHours(0, 0, 0, 0);
    var t = U.fromISO(U.todayISO()); t.setHours(0, 0, 0, 0);
    return Math.round((d - t) / 86400000);
  }
  function dateLabel(iso) { return iso ? U.gregLabel(iso) + '/' + iso.slice(2, 4) : ''; }

  // מצב הרשומה — נגזר, לא נשמר
  var STATE = {
    missing: { key: 'missing', label: 'חסר', color: '#64748b', bg: '#f1f5f9' },
    expired: { key: 'expired', label: 'פג תוקף', color: '#b91c1c', bg: '#fee2e2' },
    soon:    { key: 'soon',    label: 'עומד לפוג', color: '#b45309', bg: '#fef3c7' },
    valid:   { key: 'valid',   label: 'בתוקף', color: '#15803d', bg: '#dcfce7' },
    na:      { key: 'na',      label: 'לא רלוונטי', color: '#94a3b8', bg: '#f8fafc' }
  };
  function stateOf(rec) {
    if (rec.na) return STATE.na;
    var exp = Store.safetyExpiry(rec);
    if (rec.group === LICENSE_GROUP) {
      // מסמכי רישוי: מספיק שהמסמך קיים (קובץ או תאריך עדכון)
      if (!rec.docPath && !rec.issuedAt) return STATE.missing;
      if (!exp) return STATE.valid;
    }
    if (!exp) return rec.issuedAt ? STATE.valid : STATE.missing;
    var n = daysTo(exp);
    if (n < 0) return STATE.expired;
    if (n <= WARN_DAYS) return STATE.soon;
    return STATE.valid;
  }
  // סדר דחיפות: פג → עומד לפוג → חסר → בתוקף → לא רלוונטי
  var URGENCY = { expired: 0, soon: 1, missing: 2, valid: 3, na: 4 };
  function sortByUrgency(list) {
    return list.slice().sort(function (a, b) {
      var ua = URGENCY[stateOf(a).key], ub = URGENCY[stateOf(b).key];
      if (ua !== ub) return ua - ub;
      var ea = Store.safetyExpiry(a) || '9999', eb = Store.safetyExpiry(b) || '9999';
      return String(ea).localeCompare(String(eb)) ||
        String(a.name || '').localeCompare(String(b.name || ''), 'he');
    });
  }

  function statePill(rec) {
    var st = stateOf(rec);
    var exp = Store.safetyExpiry(rec);
    var txt = st.label;
    if (st.key === 'expired' && exp) txt += ' · ' + Math.abs(daysTo(exp)) + ' י׳';
    if (st.key === 'soon' && exp) txt += ' · עוד ' + daysTo(exp) + ' י׳';
    return U.el('span', { class: 'tag',
      style: 'background:' + st.bg + ';border-color:' + st.color + '55;color:' + st.color + ';font-weight:600;',
      text: txt });
  }

  // ---------- טופס ----------
  function openModal(rec) {
    var isNew = !rec;
    rec = rec ? JSON.parse(JSON.stringify(rec)) : { group: 'שנתי' };
    var err = U.el('div', { class: 'field-err' });
    function fld(l, n, hint) {
      return U.el('div', { class: 'field' }, [U.el('label', { text: l }), n,
        hint ? U.el('div', { class: 'muted', style: 'font-size:12px;margin-top:2px;', text: hint }) : null].filter(Boolean));
    }

    var name = U.el('input', { value: rec.name || '', placeholder: 'שם האישור / המסמך' });
    var group = U.el('select', null, Store.safetyGroups().map(function (g) { return U.el('option', { value: g, text: g }); }));
    group.value = rec.group || 'שנתי';
    var issuedAt = U.el('input', { type: 'date', value: rec.issuedAt || '' });
    var expiresAt = U.el('input', { type: 'date', value: Store.safetyExpiry(rec) || '' });
    var issuer = U.el('input', { value: rec.issuer || '', placeholder: 'מי הנפיק (מהנדס, חברת כיבוי…)' });
    var owner = U.el('input', { value: rec.owner || '', placeholder: 'אחראי' });
    var note = U.el('textarea', { rows: 2, placeholder: 'הערות' }, rec.note || '');
    var na = U.el('input', { type: 'checkbox', checked: !!rec.na });

    // תפוגה מתעדכנת לבד כשמשנים הנפקה/תדירות — אלא אם נגעת בה ידנית
    var manual = !!rec.expiryManual;
    function recalc() {
      if (manual) return;
      var tmp = { group: group.value, issuedAt: issuedAt.value };
      expiresAt.value = Store.safetyExpiry(tmp) || '';
    }
    issuedAt.addEventListener('change', recalc);
    group.addEventListener('change', recalc);
    expiresAt.addEventListener('change', function () { manual = true; });

    Modal.open(isNew ? 'אישור חדש' : 'עריכת אישור', U.el('div', null, [
      fld('שם האישור / המסמך', name),
      U.el('div', { class: 'row' }, [fld('תדירות חידוש', group), fld('אחראי', owner)]),
      U.el('div', { class: 'row' }, [
        fld('תאריך הנפקה', issuedAt),
        fld('תאריך תפוגה', expiresAt, 'מחושב אוטומטית מההנפקה — אפשר לעקוף')
      ]),
      fld('גורם מנפיק', issuer),
      fld('הערות', note),
      U.el('label', { style: 'display:flex;align-items:center;gap:6px;cursor:pointer;' }, [na, 'לא רלוונטי אצלנו']),
      err
    ]), [
      { label: 'ביטול', class: 'secondary' },
      { label: 'שמירה', onClick: function (close) {
        if (!name.value.trim()) { err.textContent = 'נדרש שם'; name.focus(); return; }
        rec.name = name.value.trim();
        rec.group = group.value;
        rec.issuedAt = issuedAt.value;
        rec.expiresAt = expiresAt.value;
        rec.expiryManual = manual;
        rec.issuer = issuer.value.trim();
        rec.owner = owner.value.trim();
        rec.note = note.value.trim();
        rec.na = na.checked;
        Store.upsertSafety(rec);
        close();
        App.render();
      } }
    ]);
  }

  // ---------- קובץ מצורף ----------
  function docCell(rec) {
    var wrap = U.el('div', { style: 'display:flex;gap:6px;align-items:center;' });
    var input = U.el('input', { type: 'file', accept: 'image/*,.pdf', style: 'display:none;' });
    var up = U.el('button', { class: 'btn secondary small', title: rec.docPath ? 'החלפת הקובץ' : 'העלאת קובץ',
      html: U.ICO.upload });
    up.addEventListener('click', function () { input.click(); });
    input.addEventListener('change', function () {
      var f = input.files[0];
      if (!f) return;
      up.disabled = true;
      Store.uploadApproval(f).then(function (path) {
        rec.docPath = path;
        rec.docName = f.name;
        // קובץ שהועלה בלי תאריך הנפקה — מניחים שהונפק היום
        if (!rec.issuedAt) rec.issuedAt = U.todayISO();
        Store.upsertSafety(rec);
        U.toast('הקובץ צורף');
        App.render();
      }).catch(function (e) {
        up.disabled = false;
        U.toast('העלאת הקובץ נכשלה: ' + (e && e.message ? e.message : ''), 'error');
      });
      input.value = '';
    });

    if (rec.docPath) {
      var view = U.el('button', { class: 'btn secondary small', title: rec.docName || 'צפייה במסמך', html: U.ICO.clip });
      view.addEventListener('click', function () {
        view.disabled = true;
        Store.approvalFileUrl(rec.docPath).then(function (url) {
          view.disabled = false;
          if (url) window.open(url, '_blank');
          else U.toast('לא הצלחתי לפתוח את הקובץ', 'error');
        });
      });
      wrap.appendChild(view);
    }
    wrap.appendChild(up);
    wrap.appendChild(input);
    return wrap;
  }

  // ---------- טבלה ----------
  function table(list, isLicense) {
    if (!list.length) {
      return U.el('div', { class: 'empty' }, 'אין רשומות בקטגוריה זו');
    }
    var cols = isLicense
      ? ['מסמך', 'סטטוס', 'עודכן', 'אחראי', 'מסמך מצורף', 'הערות', '']
      : ['אישור', 'תדירות', 'סטטוס', 'הונפק', 'פג תוקף', 'גורם מנפיק', 'אחראי', 'מסמך', ''];

    var rows = sortByUrgency(list).map(function (rec) {
      var st = stateOf(rec);
      var exp = Store.safetyExpiry(rec);
      var tds = isLicense
        ? [
            U.el('td', null, U.el('strong', { text: rec.name || '' })),
            U.el('td', null, statePill(rec)),
            U.el('td', { text: dateLabel(rec.issuedAt) || '—' }),
            U.el('td', { text: rec.owner || '' }),
            U.el('td', null, docCell(rec)),
            U.el('td', { class: 'muted', text: rec.note || '' })
          ]
        : [
            U.el('td', null, U.el('strong', { text: rec.name || '' })),
            U.el('td', null, U.el('span', { class: 'tag', text: rec.group || '' })),
            U.el('td', null, statePill(rec)),
            U.el('td', { text: dateLabel(rec.issuedAt) || '—' }),
            U.el('td', { style: st.key === 'expired' || st.key === 'soon' ? 'color:' + st.color + ';font-weight:600;' : '',
                         text: dateLabel(exp) || '—' }),
            U.el('td', { text: rec.issuer || '' }),
            U.el('td', { text: rec.owner || '' }),
            U.el('td', null, docCell(rec))
          ];
      tds.push(U.el('td', null, [
        U.el('button', { class: 'btn secondary small', html: U.ICO.edit, title: 'עריכה',
          onclick: function () { openModal(rec); } }),
        ' ',
        U.el('button', { class: 'btn secondary small', html: U.ICO.trash, title: 'מחיקה', onclick: function () {
          Modal.confirm({ title: 'מחיקה', text: 'למחוק את "' + rec.name + '"?', okLabel: 'מחיקה', danger: true },
            function () { Store.deleteSafety(rec.id); App.render(); });
        } })
      ]));
      // רקע עדין לפי מצב — כדי שהעין תתפוס מיד מה בוער
      var rowStyle = '';
      if (st.key === 'expired') rowStyle = 'background:#fef2f2;';
      else if (st.key === 'soon') rowStyle = 'background:#fffbeb;';
      else if (st.key === 'na') rowStyle = 'opacity:.55;';
      return U.el('tr', { style: rowStyle }, tds);
    });

    return U.el('div', { class: 'tbl-scroll' }, [U.el('table', { class: 'grid' }, [
      U.el('thead', null, U.el('tr', null, cols.map(function (h) { return U.el('th', { text: h }); }))),
      U.el('tbody', null, rows)
    ])]);
  }

  // ---------- רינדור ----------
  function render(view) {
    var all = Store.safetyAll();
    var certs = all.filter(function (r) { return r.group !== LICENSE_GROUP; });
    var license = all.filter(function (r) { return r.group === LICENSE_GROUP; });

    var expired = all.filter(function (r) { return stateOf(r).key === 'expired'; });
    var soon = all.filter(function (r) { return stateOf(r).key === 'soon'; });
    var missing = all.filter(function (r) { return stateOf(r).key === 'missing'; });
    var valid = all.filter(function (r) { return stateOf(r).key === 'valid'; });

    view.appendChild(U.el('div', { class: 'page-head' }, [
      U.el('h2', { text: 'בטיחות, רישוי וביטוחים' }),
      U.el('span', { class: 'spacer' }),
      !all.length ? U.el('button', { class: 'btn secondary', text: 'טעינת רשימת ברירת מחדל', onclick: function () {
        var n = Store.seedSafety(true);
        U.toast(n + ' אישורים נוספו — השלימו תאריכים וקבצים');
        App.render();
      } }) : null,
      U.el('button', { class: 'btn', html: U.ICO.plus + ' אישור חדש', onclick: function () { openModal(null); } })
    ].filter(Boolean)));

    function kpi(val, label, cls) {
      return U.el('div', { class: 'kpi ' + (cls || 'kpi-neutral') }, [
        U.el('div', { class: 'kpi-ic' }),
        U.el('div', { class: 'kpi-body' }, [
          U.el('div', { class: 'kpi-row' }, U.el('div', { class: 'kpi-val', text: String(val) })),
          U.el('div', { class: 'kpi-lbl', text: label })
        ])
      ]);
    }
    view.appendChild(U.el('div', { class: 'kpi-row kpi-grid' }, [
      kpi(expired.length, 'פג תוקף', 'kpi-bad'),
      kpi(soon.length, 'פג תוך ' + WARN_DAYS + ' יום', 'kpi-warn'),
      kpi(missing.length, 'חסר מסמך', 'kpi-neutral'),
      kpi(valid.length, 'בתוקף', 'kpi-good')
    ]));

    view.appendChild(U.el('div', { class: 'subtabs' }, [
      U.el('button', { class: subTab === 'certs' ? 'active' : '',
        html: 'אישורים ובדיקות (' + certs.length + ')' +
          ((expired.filter(function (r) { return r.group !== LICENSE_GROUP; }).length)
            ? ' <span class="tab-badge">' + expired.filter(function (r) { return r.group !== LICENSE_GROUP; }).length + '</span>' : ''),
        onclick: function () { subTab = 'certs'; App.render(); } }),
      U.el('button', { class: subTab === 'license' ? 'active' : '',
        text: 'רישוי מוסד (' + license.length + ')',
        onclick: function () { subTab = 'license'; App.render(); } })
    ]));

    if (!all.length) {
      view.appendChild(U.el('div', { class: 'empty' },
        'הגיליון ריק — לחצו "טעינת רשימת ברירת מחדל" כדי להתחיל מהרשימה של מנהל הרישוי.'));
      return;
    }

    if (subTab === 'license') {
      view.appendChild(U.el('div', { class: 'card', style: 'margin-bottom:12px;' }, [
        U.el('div', { class: 'muted', style: 'font-size:13px;' },
          'המסמכים שנדרשים לחידוש רישיון המוסד. צרפו את הקובץ העדכני לכל שורה — ' +
          'תאריך העדכון נרשם אוטומטית, כך שרואים מה כבר מוכן ומה עוד חסר.')
      ]));
      view.appendChild(table(license, true));
    } else {
      view.appendChild(table(certs, false));
      view.appendChild(U.el('div', { class: 'muted', style: 'font-size:12px;margin-top:6px;',
        text: 'תאריך התפוגה מחושב אוטומטית: שנתי = הנפקה + 12 חודשים · 5 שנים = הנפקה + 60 חודשים. ' +
              'התראה מתחילה ' + WARN_DAYS + ' יום לפני.' }));
    }
  }

  global.SafetyView = { render: render };
})(window);
