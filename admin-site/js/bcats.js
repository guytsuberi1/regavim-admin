/* bcats.js — "קטגוריות תקציב" (תת-גיליון של נתוני בסיס).
   כאן מתכננים את מבנה הקטגוריות של שנת תקציב **עתידית** — לפני שהיא מתחילה.

   כלל היסוד (החלטת גיא, מפורשת): **אסור לשנות בדיעבד.**
   השנה הפעילה וכל שנה שכבר התחילה — קריאה בלבד, מאף סיבה. עורכים רק 26/27 והלאה.
   כך שינוי שם קטגוריה לא יכול לנתק חשבונית שכבר הוזנה.

   הנתונים נשמרים ב-state.fyCats[<שנה>] שבנתוני אפליקציית התקציב, דרך Store.budgetPatch.
   כשהשנה הופכת לפעילה (גלגל השיניים בגיליון ניהול התקציב) הצילום עובר ל-state.categories.
   טופס הזנת החשבוניות אצל המזכירה כבר נגזר מתאריך החשבונית, ולכן הוא מסונכרן אוטומטית. */
(function (global) {
  'use strict';
  var U = global.U;

  var year = null;                 // השנה הנערכת (null = הראשונה ברשימה)
  var saveQueue = Promise.resolve(), pending = 0;

  function activeYear() {
    var f = Store.budgetCurrentFy ? Store.budgetCurrentFy() : null;
    return f ? f.year : new Date().getFullYear();
  }
  function label(y) { return y + '/' + String(y + 1).slice(2); }
  // רק שנים שטרם התחילו — שנתיים קדימה מספיקות בפועל
  function planYears() {
    var a = activeYear();
    return [a + 1, a + 2];
  }
  function curYear() {
    var ys = planYears();
    return (year && ys.indexOf(year) > -1) ? year : ys[0];
  }
  function catsOf(y) {
    var st = Store.budgetState();
    if (!st || !st.fyCats) return [];
    return (st.fyCats[y] || []).slice();
  }
  function uid() { return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  // ---------- שמירה ----------
  // תור, לא חסימה: עריכה בזמן ששמירה קודמת רצה חייבת להישמר ולא להיזרק.
  function renderWhenIdle() {
    var el = document.activeElement;
    if (el && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) {
      el.addEventListener('blur', function once() {
        el.removeEventListener('blur', once);
        setTimeout(function () { if (!pending) App.render(); }, 0);
      });
      return;
    }
    App.render();
  }
  // apply מקבל את מערך הקטגוריות של השנה ומחזיר מערך חדש
  function patchYear(apply, okMsg) {
    var y = curYear();
    if (y <= activeYear()) { U.toast('שנה שכבר התחילה — לא ניתנת לעריכה', 'error'); return; }
    pending++;
    saveQueue = saveQueue.then(function () {
      return Store.budgetPatch(function (st) {
        if (!st.fyCats) st.fyCats = {};
        st.fyCats[y] = apply((st.fyCats[y] || []).slice());
      }).then(function () { U.toast(okMsg || 'נשמר'); })
        .catch(function (e) { U.toast('השמירה נכשלה: ' + (e && e.message ? e.message : ''), 'error'); });
    }).then(function () {
      pending--;
      if (!pending) renderWhenIdle();
    });
  }

  // ---------- פעולות ----------
  function startPlanning(copyFrom, zero) {
    var src = copyFrom ? (Store.budgetCategoriesFor(activeYear()) || []) : [];
    patchYear(function () {
      return src.map(function (c) {
        return { id: uid(), main: c.main, sub: c.sub, owner: c.owner || '', note: c.note || '',
          annualBudget: zero ? 0 : U.num(c.annualBudget, 0) };
      });
    }, copyFrom ? 'המבנה הועתק — אפשר לערוך' : 'התכנון נפתח');
  }
  function renameMain(oldName) {
    var inp = U.el('input', { value: oldName, style: 'width:100%;' });
    var err = U.el('div', { class: 'field-err' });
    Modal.open('שינוי שם קטגוריה ראשית', U.el('div', null, [
      U.el('div', { class: 'muted', style: 'font-size:13px;margin-bottom:8px;',
        text: 'השם החדש יחול על כל תתי-הקטגוריות שמתחת ל"' + oldName + '" בשנת ' + label(curYear()) + '.' }),
      U.el('div', { class: 'field' }, [U.el('label', { text: 'שם הקטגוריה' }), inp]), err
    ]), [
      { label: 'ביטול', class: 'secondary' },
      { label: 'שמירה', onClick: function (close) {
        var v = inp.value.trim();
        if (!v) { err.textContent = 'נדרש שם'; return; }
        if (v === oldName) { close(); return; }
        patchYear(function (list) {
          list.forEach(function (c) { if (c.main === oldName) c.main = v; });
          return list;
        }, 'שם הקטגוריה עודכן');
        close();
      } }
    ]);
  }
  function addMain() {
    var inp = U.el('input', { placeholder: 'שם הקטגוריה הראשית', style: 'width:100%;' });
    var err = U.el('div', { class: 'field-err' });
    Modal.open('קטגוריה ראשית חדשה', U.el('div', null, [
      U.el('div', { class: 'field' }, [U.el('label', { text: 'שם' }), inp]), err
    ]), [
      { label: 'ביטול', class: 'secondary' },
      { label: 'הוספה', onClick: function (close) {
        var v = inp.value.trim();
        if (!v) { err.textContent = 'נדרש שם'; return; }
        if (catsOf(curYear()).some(function (c) { return c.main === v; })) { err.textContent = 'קטגוריה בשם הזה כבר קיימת'; return; }
        patchYear(function (list) {
          list.push({ id: uid(), main: v, sub: 'תת-קטגוריה חדשה', annualBudget: 0, owner: '', note: '' });
          return list;
        }, 'הקטגוריה נוספה');
        close();
      } }
    ]);
  }
  function delMain(name, count) {
    Modal.confirm({
      title: 'מחיקת קטגוריה ראשית',
      text: 'למחוק את "' + name + '" ואת ' + count + ' תתי-הקטגוריות שמתחתיה, בשנת ' + label(curYear()) + '?\n' +
            'השנים האחרות והחשבוניות הקיימות אינן מושפעות.',
      okLabel: 'מחיקה', danger: true
    }, function () {
      patchYear(function (list) {
        return list.filter(function (c) { return c.main !== name; });
      }, 'הקטגוריה נמחקה');
    });
  }
  function addSub(main) {
    patchYear(function (list) {
      list.push({ id: uid(), main: main, sub: 'תת-קטגוריה חדשה', annualBudget: 0, owner: '', note: '' });
      return list;
    }, 'נוספה תת-קטגוריה — ערכו את השם');
  }
  function delSub(cat) {
    Modal.confirm({
      title: 'מחיקת תת-קטגוריה',
      text: 'למחוק את "' + cat.sub + '" מתוך "' + cat.main + '" בשנת ' + label(curYear()) + '?',
      okLabel: 'מחיקה', danger: true
    }, function () {
      patchYear(function (list) {
        return list.filter(function (c) { return c.id !== cat.id; });
      }, 'תת-הקטגוריה נמחקה');
    });
  }

  // ---------- תאים ----------
  function bare(el) {
    el.style.border = '1px solid transparent';
    el.style.background = 'transparent';
    el.style.padding = '4px 6px';
    el.addEventListener('focus', function () { el.style.background = 'var(--card)'; el.style.borderColor = 'var(--border)'; });
    el.addEventListener('blur', function () { el.style.background = 'transparent'; el.style.borderColor = 'transparent'; });
    return el;
  }
  function subCell(cat) {
    var i = bare(U.el('input', { value: cat.sub || '', placeholder: 'שם תת-קטגוריה', autocomplete: 'off', style: 'width:100%;' }));
    i.addEventListener('change', function () {
      var v = i.value.trim();
      if (!v || v === cat.sub) { i.value = cat.sub || ''; return; }
      patchYear(function (list) {
        var c = list.filter(function (x) { return x.id === cat.id; })[0];
        if (c) c.sub = v;
        return list;
      }, 'השם עודכן');
    });
    return i;
  }
  function moneyCell(cat) {
    return bare(U.moneyInput({
      value: U.num(cat.annualBudget, 0) || '', placeholder: '0',
      style: 'width:120px;text-align:right;font-weight:600;',
      onSave: function (v) {
        v = v === '' ? 0 : v;
        if (v === U.num(cat.annualBudget, 0)) return;
        patchYear(function (list) {
          var c = list.filter(function (x) { return x.id === cat.id; })[0];
          if (c) c.annualBudget = v;
          return list;
        }, 'התקציב עודכן');
      }
    }));
  }
  function ownerCell(cat) {
    var i = bare(U.el('input', { value: cat.owner || '', placeholder: 'אחראי', autocomplete: 'off', style: 'width:110px;' }));
    i.addEventListener('change', function () {
      var v = i.value.trim();
      if (v === (cat.owner || '')) return;
      patchYear(function (list) {
        var c = list.filter(function (x) { return x.id === cat.id; })[0];
        if (c) c.owner = v;
        return list;
      }, 'נשמר');
    });
    return i;
  }

  // ---------- מסך ----------
  function ils(n) {
    return new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(Math.round(n || 0)) + ' ₪';
  }
  function kpi(val, lbl, cls) {
    return U.el('div', { class: 'kpi ' + (cls || 'kpi-neutral') }, [
      U.el('div', { class: 'kpi-ic' }),
      U.el('div', { class: 'kpi-body' }, [
        U.el('div', { class: 'kpi-row' }, U.el('div', { class: 'kpi-val', text: String(val) })),
        U.el('div', { class: 'kpi-lbl', text: lbl })
      ])
    ]);
  }

  function table(list) {
    var mains = [];
    list.forEach(function (c) { if (mains.indexOf(c.main) === -1) mains.push(c.main); });
    var body = [];
    var grand = 0;
    mains.forEach(function (m) {
      var subs = list.filter(function (c) { return c.main === m; });
      var tot = 0;
      subs.forEach(function (c) { tot += U.num(c.annualBudget, 0); });
      grand += tot;
      body.push(U.el('tr', { class: 'b-main' }, [
        U.el('td', null, U.el('div', { style: 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;' }, [
          U.el('strong', { text: m }),
          U.el('button', { class: 'btn secondary small', html: U.ICO.edit || '✎', title: 'שינוי שם הקטגוריה הראשית',
            onclick: function () { renameMain(m); } }),
          U.el('button', { class: 'btn secondary small', html: U.ICO.trash, title: 'מחיקת הקטגוריה הראשית',
            onclick: function () { delMain(m, subs.length); } })
        ])),
        U.el('td', { style: 'font-weight:700;', text: ils(tot) }),
        U.el('td'), U.el('td')
      ]));
      subs.forEach(function (c) {
        body.push(U.el('tr', null, [
          U.el('td', { style: 'padding-inline-start:18px;' }, subCell(c)),
          U.el('td', null, moneyCell(c)),
          U.el('td', null, ownerCell(c)),
          U.el('td', null, U.el('button', { class: 'btn secondary small', html: U.ICO.trash,
            title: 'מחיקת תת-קטגוריה', onclick: function () { delSub(c); } }))
        ]));
      });
      body.push(U.el('tr', { class: 'b-add' }, U.el('td', { colspan: '4' },
        U.el('button', { class: 'b-link', style: 'font-size:13px;color:var(--brand);padding-inline-start:18px;',
          html: U.ICO.plus + ' תת-קטגוריה ל"' + m + '"', onclick: function () { addSub(m); } }))));
    });
    body.push(U.el('tr', { class: 'b-grand' }, [
      U.el('td', { text: 'סה"כ מתוכנן' }),
      U.el('td', { text: ils(grand) }),
      U.el('td'), U.el('td')
    ]));

    return U.el('div', { class: 'tbl-scroll' }, [U.el('table', { class: 'grid b-sheet' }, [
      U.el('thead', null, U.el('tr', null, ['קטגוריה', 'תקציב שנתי', 'אחראי', '']
        .map(function (h) { return U.el('th', { text: h }); }))),
      U.el('tbody', null, body)
    ])]);
  }

  function render(view) {
    if (!(Store.isAdmin && Store.isAdmin())) {
      view.appendChild(U.el('div', { class: 'empty' }, 'למסך הזה יש גישה למנהל בלבד.'));
      return;
    }
    var y = curYear(), act = activeYear();

    var ySel = U.el('select', { style: 'max-width:170px;', title: 'שנת התקציב שמתכננים' },
      planYears().map(function (p) { return U.el('option', { value: String(p), text: 'תכנון שנת ' + label(p) }); }));
    ySel.value = String(y);
    ySel.addEventListener('change', function () { year = parseInt(ySel.value, 10); App.render(); });

    view.appendChild(U.el('div', { class: 'page-head' }, [
      U.el('h2', { text: 'קטגוריות תקציב' }), ySel,
      U.el('span', { class: 'spacer' }),
      U.el('button', { class: 'btn secondary', html: U.ICO.refresh + ' רענון',
        onclick: function () { Store.budgetLoad(true).then(function () { App.render(); }); } })
    ]));

    view.appendChild(U.el('div', { class: 'card m-card', style: 'margin-bottom:14px;' }, [
      U.el('div', { class: 'muted', style: 'font-size:13px;line-height:1.8;' }, [
        U.el('div', null, 'כאן מתכננים את מבנה הקטגוריות של שנה שעוד לא התחילה.'),
        U.el('div', null, '· שנת ' + label(act) + ' (הפעילה) ושנים שעברו אינן ניתנות לעריכה — אסור לשנות סיווג בדיעבד.'),
        U.el('div', null, '· ב-1 בספטמבר, כשתעביר את השנה הפעילה בגיליון ניהול התקציב, התכנון הזה ייכנס לתוקף.'),
        U.el('div', null, '· טופס הזנת החשבוניות אצל המזכירה נגזר מתאריך החשבונית, ולכן הוא מסונכרן לבד.')
      ])
    ]));

    if (!Store.budgetState()) {
      view.appendChild(U.el('div', { class: 'card', style: 'border-inline-start:4px solid #d97706;' }, [
        U.el('div', { style: 'font-weight:600;', text: 'נתוני התקציב לא נטענו' }),
        U.el('div', { class: 'muted', style: 'font-size:13px;margin-top:4px;', text: 'נסו "רענון".' })
      ]));
      return;
    }

    var list = catsOf(y);
    if (!list.length) {
      view.appendChild(U.el('div', { class: 'card m-card' }, [
        U.el('div', { style: 'font-weight:600;margin-bottom:6px;', text: 'עדיין אין תכנון לשנת ' + label(y) }),
        U.el('div', { class: 'muted', style: 'font-size:13px;margin-bottom:12px;',
          text: 'אפשר להתחיל מהמבנה של השנה הפעילה (' + label(act) + ') ולערוך אותו, או להתחיל מדף ריק.' }),
        U.el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;' }, [
          U.el('button', { class: 'btn', text: 'העתקה מ-' + label(act) + ' עם הסכומים',
            onclick: function () { startPlanning(true, false); } }),
          U.el('button', { class: 'btn secondary', text: 'העתקה בלי סכומים',
            onclick: function () { startPlanning(true, true); } }),
          U.el('button', { class: 'btn secondary', text: 'להתחיל מדף ריק',
            onclick: function () { startPlanning(false, false); } })
        ])
      ]));
      return;
    }

    var mains = [];
    list.forEach(function (c) { if (mains.indexOf(c.main) === -1) mains.push(c.main); });
    view.appendChild(U.el('div', { class: 'kpi-grid' }, [
      kpi(mains.length, 'קטגוריות ראשיות'),
      kpi(list.length, 'תתי-קטגוריות', 'kpi-info')
    ]));

    view.appendChild(U.el('div', { style: 'display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;' }, [
      U.el('button', { class: 'btn', html: U.ICO.plus + ' קטגוריה ראשית', onclick: addMain })
    ]));

    view.appendChild(table(list));
    view.appendChild(U.el('div', { class: 'muted', style: 'font-size:12px;margin-top:8px;',
      text: 'השינויים נשמרים בנתוני התקציב ונכנסים לתוקף כשתעבירו את השנה הפעילה ל-' + label(y) + '.' }));
  }

  global.BudgetCatsView = { render: render };
})(window);
