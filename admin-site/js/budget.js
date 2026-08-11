/* budget.js — גיליון "ניהול תקציב": קורא ישירות את נתוני אפליקציית התקציב (אותה שורת app_state).
   שלושה מסכים: גיליון ניהול · תקציב מול ביצוע · חיפוש חכם (חשבוניות/ספקים/עובדים במקום אחד).
   ההזנה נשארת אצל המזכירה — כאן מנהלים תקציב וצופים. */
(function (global) {
  'use strict';
  var U = global.U;

  var subTab = 'sheet';                 // 'sheet' | 'dash' | 'search'
  // שנת הכספים המוצגת מנוהלת מרכזית ב-app.js (App.currentFy/App.setFy),
  // כדי שגיליון הניהול וקולות קוראים יחלקו את אותו בורר.
  var openRows = {};                    // פיזור חודשי פתוח לפי מזהה קטגוריה
  var mainFilter = '';
  var q = '', qMain = '', qFrom = '', qTo = '', qKind = '';
  var subscribed = false;

  function ils(n) {
    return new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(Math.round(n || 0)) + ' ₪';
  }
  function pct(n) { return (n * 100).toFixed(1) + '%'; }
  function monthLabel(ym) {
    var p = String(ym).split('-');
    return ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יונ', 'יול', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'][parseInt(p[1], 10) - 1] + ' ' + p[0].slice(2);
  }

  // ---------- שנת הכספים המוצגת ----------
  // "נוצל" נספר רק מתנועות שבתוך השנה — אחרת ב-1/9 כל הקטגוריות נשארות בחריגה
  // כי הן ממשיכות לספור את החשבוניות של השנה שעברה.
  function fy() {
    var years = Store.budgetFyYears ? Store.budgetFyYears() : [];
    var key = App.currentFy && App.currentFy();
    if (key) {
      var hit = years.filter(function (y) { return String(y.year) === String(key); })[0];
      if (hit) return hit;
    }
    return Store.budgetCurrentFy ? Store.budgetCurrentFy() : { start: '', end: '', label: '' };
  }
  function inFy(dateISO) {
    var f = fy(), d = String(dateISO || '');
    if (!f.start || !d) return true;
    return d >= f.start && d <= f.end;
  }
  function fyTransactions() {
    return Store.budgetTransactions().filter(function (t) { return inFy(t.date); });
  }
  function fyMonths() {
    var f = fy();
    if (!f.start) return [];
    var out = [], y = parseInt(f.start.slice(0, 4), 10);
    for (var i = 0; i < 12; i++) {
      var mm = 9 + i, yy = y;
      if (mm > 12) { mm -= 12; yy = y + 1; }
      out.push(yy + '-' + String(mm).padStart(2, '0'));
    }
    return out;
  }
  // כמה מהשנה המוצגת חלף: שנה שהסתיימה = 1, שנה עתידית = 0
  function fyFraction() {
    var f = fy();
    if (!f.start) return 0;
    var s0 = new Date(f.start), e0 = new Date(f.end), now = new Date();
    if (now <= s0) return 0;
    if (now >= e0) return 1;
    return (now - s0) / (e0 - s0);
  }

  // ---------- חישובים (מסוננים לשנת הכספים המוצגת) ----------
  function actualBySub() {
    var m = {};
    fyTransactions().forEach(function (t) {
      var k = t.main + '||' + t.sub;
      m[k] = (m[k] || 0) + t.amount;
    });
    return m;
  }
  function actualByMonthSub() {
    var m = {};
    fyTransactions().forEach(function (t) {
      var k = t.main + '||' + t.sub, ym = String(t.date).slice(0, 7);
      if (!m[k]) m[k] = {};
      m[k][ym] = (m[k][ym] || 0) + t.amount;
    });
    return m;
  }
  // הקטגוריות של השנה המוצגת בלבד — לכל שנת תקציב יש רשימה משלה
  function fyCats() {
    return Store.budgetCategoriesFor ? Store.budgetCategoriesFor(fy().year) : Store.budgetCategories();
  }
  function editable() {
    return Store.budgetIsActiveFy ? Store.budgetIsActiveFy(fy().year) : true;
  }
  function mainOrder() {
    var seen = [];
    fyCats().forEach(function (c) { if (seen.indexOf(c.main) === -1) seen.push(c.main); });
    return seen;
  }
  function monthlyPlanOf(c, n) {
    if (Array.isArray(c.monthlyPlan) && c.monthlyPlan.length === n) {
      return c.monthlyPlan.map(function (x) { return U.num(x, 0); });
    }
    var even = (U.num(c.annualBudget, 0)) / (n || 1);
    var out = [];
    for (var i = 0; i < n; i++) out.push(even);
    return out;
  }
  function relPct(annual, actual, frac) {
    var rel = annual * frac;
    return rel > 0 ? actual / rel : (actual > 0 ? 2 : 0);
  }
  function paceClass(annual, actual, frac) {
    if (annual > 0 && actual > annual) return 'pb-red';
    var r = relPct(annual, actual, frac);
    return r > 1 ? 'pb-red' : (r >= 0.85 ? 'pb-orange' : 'pb-green');
  }

  // פס התקדמות עם סמן "איפה היינו אמורים להיות" לפי חלק השנה שחלף
  function progressBar(actual, annual, frac) {
    var ratio = annual > 0 ? actual / annual : (actual > 0 ? 1 : 0);
    var fill = Math.min(100, ratio * 100);
    var marker = Math.min(100, frac * 100);
    return U.el('div', { class: 'bpb ' + paceClass(annual, actual, frac),
      title: 'הסמן מציין את חלק השנה שחלף (' + pct(frac) + ')' }, [
      U.el('div', { class: 'bpb-fill', style: 'width:' + fill.toFixed(1) + '%;' }),
      U.el('div', { class: 'bpb-marker', style: 'inset-inline-start:' + marker.toFixed(1) + '%;' }),
      U.el('span', { class: 'bpb-label', text: annual > 0 ? pct(actual / annual) : (actual > 0 ? '∞' : '—') })
    ]);
  }
  // תחזית לסוף השנה: הקצב עד היום מוכפל בשנה מלאה
  function forecastCell(actual, annual, frac) {
    if (!frac) return U.el('td', { class: 'muted', text: '—' });
    var proj = actual / frac, diff = proj - annual;
    if (annual > 0 && diff > annual * 0.005) {
      return U.el('td', null, [
        U.el('div', { style: 'color:#b91c1c;font-weight:700;', text: ils(proj) }),
        U.el('div', { style: 'font-size:11px;color:#b91c1c;', text: 'חריגה צפויה ' + ils(diff) })
      ]);
    }
    if (annual === 0 && proj > 0) {
      return U.el('td', null, [
        U.el('div', { style: 'color:#b91c1c;font-weight:700;', text: ils(proj) }),
        U.el('div', { style: 'font-size:11px;color:#b91c1c;', text: 'ללא תקציב' })
      ]);
    }
    return U.el('td', { text: ils(proj) });
  }


  // ---------- עריכה ----------
  // כל שינוי נכתב דרך Store.budgetPatch: קריאה טרייה → שינוי נקודתי → כתיבה.
  // כך שינוי כאן לא דורס חשבונית שהמזכירה הזינה שנייה קודם.
  // תור שמירות: כל עריכה ממתינה לקודמתה במקום להיזרק.
  // budgetPatch עושה קריאה-שינוי-כתיבה, ולכן חייבים לסדר אותן בטור —
  // אבל *לזרוק* עריכה זה איבוד נתון בשקט (קרה: הקלדת סכום ומעבר מיד לשדה הבא
  // שמר רק את הראשון, והמסך החזיר את הערך הישן).
  var saveQueue = Promise.resolve(), pendingSaves = 0;
  // רינדור מחדש באמצע הקלדה גונב את הפוקוס — ממתינים שהמשתמש יסיים
  function renderWhenIdle() {
    var el = document.activeElement;
    if (el && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) {
      el.addEventListener('blur', function once() {
        el.removeEventListener('blur', once);
        setTimeout(function () { if (!pendingSaves) App.render(); }, 0);
      });
      return;
    }
    App.render();
  }
  function patchCat(catId, apply, okMsg) {
    pendingSaves++;
    saveQueue = saveQueue.then(function () {
      return Store.budgetPatch(function (st) {
        var c = (st.categories || []).filter(function (x) { return x.id === catId; })[0];
        if (!c) throw new Error('הקטגוריה לא נמצאה בנתוני התקציב');
        apply(c, st);
      }).then(function () {
        U.toast(okMsg || 'נשמר');
      }).catch(function (e) {
        U.toast('השמירה נכשלה: ' + (e && e.message ? e.message : ''), 'error');
      });
    }).then(function () {
      pendingSaves--;
      if (!pendingSaves) renderWhenIdle();
    });
  }
  function bare(el) {
    el.style.border = '1px solid transparent';
    el.style.background = 'transparent';
    el.style.padding = '4px 6px';
    el.addEventListener('focus', function () { el.style.background = 'var(--card)'; el.style.borderColor = 'var(--border)'; });
    el.addEventListener('blur', function () { el.style.background = 'transparent'; el.style.borderColor = 'transparent'; });
    return el;
  }
  function moneyCell(c) {
    if (!editable()) return U.el('span', { style: 'font-weight:600;', text: ils(U.num(c.annualBudget, 0)) });
    var i = bare(U.moneyInput({
      value: U.num(c.annualBudget, 0) || '', placeholder: '0',
      style: 'width:110px;text-align:right;font-weight:600;',
      onSave: function (v) {
        v = v === '' ? 0 : v;
        if (v === U.num(c.annualBudget, 0)) return;
        patchCat(c.id, function (cat) { cat.annualBudget = v; }, 'התקציב עודכן');
      }
    }));
    return i;
  }
  function textCell(c, field, ph, width) {
    if (!editable()) return U.el('span', { text: c[field] || '—' });
    var i = bare(U.el('input', { value: c[field] || '', placeholder: ph || '', autocomplete: 'off',
      style: 'width:' + (width || 110) + 'px;' }));
    i.addEventListener('change', function () {
      var v = i.value.trim();
      if (v === (c[field] || '')) return;
      patchCat(c.id, function (cat) { cat[field] = v; }, 'נשמר');
    });
    return i;
  }
  function monthCell(c, idx, n) {
    var plan = monthlyPlanOf(c, n);
    if (!editable()) return U.el('div', { style: 'font-weight:600;text-align:center;', text: U.fmtNum(Math.round(plan[idx])) });
    return bare(U.moneyInput({
      value: Math.round(plan[idx]) || '',
      style: 'width:100%;text-align:center;font-weight:600;',
      onSave: function (v) {
        v = v === '' ? 0 : v;
        patchCat(c.id, function (cat) {
          var arr = monthlyPlanOf(cat, n);
          arr[idx] = v;
          cat.monthlyPlan = arr;
        }, 'הפיזור החודשי עודכן');
      }
    }));
  }
  function spreadEven(c, n) {
    patchCat(c.id, function (cat) {
      var even = U.num(cat.annualBudget, 0) / (n || 1), arr = [];
      for (var i = 0; i < n; i++) arr.push(even);
      cat.monthlyPlan = arr;
    }, 'התקציב פוזר שווה בשווה');
  }
  // הוספת תת-קטגוריה לקטגוריה ראשית קיימת
  function addSub(main) {
    Modal.confirm({ title: 'תת-קטגוריה חדשה', text: 'להוסיף תת-קטגוריה תחת "' + main + '"?', okLabel: 'הוספה' }, function () {
      Store.budgetPatch(function (st) {
        if (!st.categories) st.categories = [];
        st.categories.push({ id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          main: main, sub: 'תת-קטגוריה חדשה', annualBudget: 0, owner: '', note: '' });
      }).then(function () { U.toast('נוספה תת-קטגוריה — ערכו את השם'); App.render(); })
        .catch(function (e) { U.toast('ההוספה נכשלה: ' + (e && e.message ? e.message : ''), 'error'); });
    });
  }


  // ---------- קביעת שנת התקציב הפעילה ----------
  // השנה הפעילה נשמרת בנתוני התקציב (state.fiscalYear) ומשפיעה על שתי האפליקציות.
  function fyStartYear(dateISO) {
    var d = String(dateISO || '');
    if (d.length < 7) return null;
    var y = parseInt(d.slice(0, 4), 10), m = parseInt(d.slice(5, 7), 10);
    return (m >= 9) ? y : y - 1;
  }
  function openFyModal() {
    var f = Store.budgetFiscalYear();
    var curStart = f.start || '', curEnd = f.end || '';
    var nextY = curStart ? parseInt(curStart.slice(0, 4), 10) + 1 : new Date().getFullYear();
    var nextStart = nextY + '-09-01', nextEnd = (nextY + 1) + '-09-01';

    var startInp = U.el('input', { type: 'date', value: curStart });
    var endInp = U.el('input', { type: 'date', value: curEnd });
    var zeroCb = U.el('input', { type: 'checkbox' });
    var err = U.el('div', { class: 'field-err' });
    function fld(l, n, hint) {
      return U.el('div', { class: 'field' }, [U.el('label', { text: l }), n,
        hint ? U.el('div', { class: 'muted', style: 'font-size:12px;margin-top:2px;', text: hint }) : null].filter(Boolean));
    }

    var body = U.el('div', null, [
      U.el('div', { class: 'muted', style: 'font-size:13px;line-height:1.7;margin-bottom:10px;' },
        'השנה הפעילה קובעת אילו חשבוניות נספרות בעמודת "נוצל" — בגיליון הזה וגם באפליקציית ' +
        'ניהול התקציב של המזכירה. לכל שנת תקציב יש רשימת קטגוריות ותקציבים משלה: ' +
        'במעבר לשנה חדשה הרשימה הנוכחית נשמרת כמו שהיא לשנה שיוצאת, והשנה החדשה מקבלת עותק ' +
        'שאפשר לערוך בלי להשפיע על מה שהיה. שום נתון לא נמחק — תמיד אפשר לחזור ולצפות בשנה קודמת דרך בורר השנה.'),
      U.el('div', { class: 'card m-card', style: 'margin-bottom:12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;' }, [
        U.el('div', null, [
          U.el('div', { style: 'font-weight:600;', text: 'מעבר לשנת ' + nextY + '/' + String(nextY + 1).slice(2) }),
          U.el('div', { class: 'muted', style: 'font-size:12px;', text: '1 בספטמבר ' + nextY + ' עד 31 באוגוסט ' + (nextY + 1) })
        ]),
        U.el('span', { class: 'spacer' }),
        U.el('button', { class: 'btn', text: 'מעבר לשנה הבאה', onclick: function () {
          startInp.value = nextStart; endInp.value = nextEnd;
          err.style.color = 'var(--muted)';
          err.textContent = 'התאריכים מולאו — לחצו "שמירה" כדי להחיל.';
        } })
      ]),
      U.el('div', { class: 'row' }, [
        fld('תחילת שנת התקציב', startInp, 'בדרך כלל 1 בספטמבר'),
        fld('סוף שנת התקציב', endInp, 'בדרך כלל 1 בספטמבר של השנה שאחריה')
      ]),
      U.el('label', { style: 'display:flex;align-items:center;gap:8px;font-size:13px;margin-top:6px;cursor:pointer;' }, [
        zeroCb, U.el('span', { text: 'לאפס את סכומי התקציב השנתי בשנה החדשה (הקטגוריות נשמרות)' })
      ]),
      err
    ]);

    Modal.open('שנת התקציב הפעילה', body, [
      { label: 'ביטול', class: 'secondary' },
      { label: 'שמירה', onClick: function (close) {
        var s0 = startInp.value, e0 = endInp.value;
        if (!s0 || !e0) { err.style.color = ''; err.textContent = 'נדרשים שני תאריכים'; return; }
        if (e0 <= s0) { err.style.color = ''; err.textContent = 'תאריך הסיום חייב להיות אחרי ההתחלה'; return; }
        var zero = zeroCb.checked;
        Store.budgetPatch(function (st) {
          if (!st.fiscalYear) st.fiscalYear = {};
          var oldY = fyStartYear(st.fiscalYear.start), newY = fyStartYear(s0);
          // כל שנה מחזיקה את הקטגוריות שלה: הישנה נשמרת ב-fyCats, החדשה מקבלת עותק עצמאי
          if (oldY && newY && String(oldY) !== String(newY)) {
            if (!st.fyCats) st.fyCats = {};
            st.fyCats[oldY] = JSON.parse(JSON.stringify(st.categories || []));
            var next = st.fyCats[newY];
            st.categories = next
              ? JSON.parse(JSON.stringify(next))
              : (st.categories || []).map(function (c) {
                  var n = JSON.parse(JSON.stringify(c));
                  if (zero) { n.annualBudget = 0; delete n.monthlyPlan; }
                  return n;
                });
            delete st.fyCats[newY];        // השנה הפעילה חיה ב-categories, לא בצילום
          }
          st.fiscalYear.start = s0;
          st.fiscalYear.end = e0;
        }).then(function () {
          App.setFy(null);                    // חוזרים לצפייה בשנה הפעילה החדשה
          close();
          U.toast('שנת התקציב עודכנה');
          App.render();
        }).catch(function (e) {
          err.style.color = '';
          err.textContent = 'השמירה נכשלה: ' + (e && e.message ? e.message : '');
        });
      } }
    ]);
  }

  // קטגוריות ראשיות שמנוהלות בתת-גיליון ייעודי — כאן מוצגת רק שורת הסיכום שלהן
  var OWN_SHEET = {
    'קולות קוראים': { view: 'kk' },
    'גפן': { view: 'gefen' },
    'גפ"ן': { view: 'gefen' }
  };
  function ownSheetLink(own) {
    if (own.view === 'kk') {
      return U.el('button', { class: 'b-link', style: 'font-size:12px;color:var(--brand);font-weight:600;',
        title: 'הפירוט נמצא בתת-הגיליון "קולות קוראים"', text: 'לתת-הגיליון ›',
        onclick: function () { App.setView('kk'); } });
    }
    return U.el('span', { class: 'muted', style: 'font-size:12px;', text: '· תת-גיליון ייעודי' });
  }

  // ---------- גיליון ניהול ----------
  function sheetView(view) {
    var cats = fyCats();
    if (!cats.length) { view.appendChild(U.el('div', { class: 'empty' }, 'לא נטענו קטגוריות מאפליקציית התקציב.')); return; }
    var frac = fyFraction(), actual = actualBySub(), months = fyMonths();
    var amSub = actualByMonthSub();
    var mains = mainOrder().filter(function (m) { return !mainFilter || m === mainFilter; });

    var body = [];
    var gB = 0, gA = 0;
    mains.forEach(function (main) {
      var subs = cats.filter(function (c) { return c.main === main; });
      var mB = 0, mA = 0;
      subs.forEach(function (c) {
        mB += U.num(c.annualBudget, 0);
        mA += actual[c.main + '||' + c.sub] || 0;
      });
      gB += mB; gA += mA;
      var own = OWN_SHEET[main];
      body.push(U.el('tr', { class: 'b-main' }, [
        U.el('td', null, own
          ? U.el('div', { style: 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;' },
              [U.el('span', { text: main }), ownSheetLink(own)])
          : U.el('span', { text: main })),
        U.el('td', { text: ils(mB) }),
        U.el('td'),
        U.el('td'),
        U.el('td', { text: ils(mA) }),
        U.el('td', { style: mB - mA < 0 ? 'color:#b91c1c;' : '', text: ils(mB - mA) }),
        U.el('td', null, progressBar(mA, mB, frac)),
        forecastCell(mA, mB, frac)
      ]));
      // קולות קוראים וגפ"ן מנוהלים בתת-גיליון משלהם — כאן רק שורת הסיכום
      if (own) return;

      subs.forEach(function (c) {
        var a = actual[c.main + '||' + c.sub] || 0;
        var annual = U.num(c.annualBudget, 0);
        var open = !!openRows[c.id];
        var nameCell = U.el('td', { style: 'padding-inline-start:12px;' },
          U.el('div', { style: 'display:flex;align-items:center;gap:2px;' }, [
            U.el('button', { class: 'b-chevbtn', title: 'פיזור חודשי',
              onclick: function () { openRows[c.id] = !open; App.render(); } },
              U.el('span', { class: 'b-chev', text: open ? '▾' : '▸' })),
            textCell(c, 'sub', 'שם תת-קטגוריה', 150)
          ]));
        body.push(U.el('tr', null, [
          nameCell,
          U.el('td', null, moneyCell(c)),
          U.el('td', null, textCell(c, 'owner', 'אחראי', 100)),
          U.el('td', null, textCell(c, 'note', 'הערה', 140)),
          U.el('td', { text: a ? ils(a) : '—' }),
          U.el('td', { style: annual - a < 0 ? 'color:#b91c1c;font-weight:600;' : '', text: ils(annual - a) }),
          U.el('td', null, progressBar(a, annual, frac)),
          forecastCell(a, annual, frac)
        ]));
        if (open) {
          var plan = monthlyPlanOf(c, months.length);
          var am = amSub[c.main + '||' + c.sub] || {};
          var grid = U.el('div', { class: 'b-months' }, months.map(function (ym, i) {
            var act = am[ym] || 0;
            return U.el('div', { class: 'b-month' + (act > plan[i] && plan[i] > 0 ? ' over' : '') }, [
              U.el('div', { class: 'b-month-lbl', text: monthLabel(ym) }),
              monthCell(c, i, months.length),
              U.el('div', { class: 'b-month-act', text: 'בפועל ' + ils(act) })
            ]);
          }));
          body.push(U.el('tr', null, U.el('td', { colspan: '8' }, [
            U.el('div', { style: 'display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;' }, [
              U.el('span', { class: 'muted', style: 'font-size:12px;', text: 'פיזור חודשי — ' + c.sub + ' · המספר בכל חודש הוא התכנון, מתחתיו הביצוע בפועל' }),
              U.el('span', { class: 'spacer' }),
              editable() ? U.el('button', { class: 'btn secondary small', text: 'פזר שווה',
                title: 'חלוקת התקציב השנתי שווה בשווה בין החודשים',
                onclick: function () { spreadEven(c, months.length); } }) : null
            ].filter(Boolean)),
            grid
          ])));
        }
      });
      if (editable()) {
        body.push(U.el('tr', { class: 'b-add' }, U.el('td', { colspan: '8' },
          U.el('button', { class: 'b-link', style: 'font-size:13px;color:var(--brand);padding-inline-start:12px;',
            html: U.ICO.plus + ' תת-קטגוריה ל"' + main + '"',
            onclick: function () { addSub(main); } }))));
      }
    });
    body.push(U.el('tr', { class: 'b-grand' }, [
      U.el('td', { text: 'סה"כ כללי' }),
      U.el('td', { text: ils(gB) }),
      U.el('td'),
      U.el('td'),
      U.el('td', { text: ils(gA) }),
      U.el('td', { style: gB - gA < 0 ? 'color:#b91c1c;' : '', text: ils(gB - gA) }),
      U.el('td', null, progressBar(gA, gB, frac)),
      forecastCell(gA, gB, frac)
    ]));

    view.appendChild(U.el('div', { class: 'tbl-scroll' }, [U.el('table', { class: 'grid b-sheet' }, [
      U.el('thead', null, U.el('tr', null, ['קטגוריה', 'תקציב שנתי', 'אחראי', 'הערות', 'נוצל', 'יתרה', 'ניצול מול קצב השנה', 'תחזית לסוף השנה']
        .map(function (h) { return U.el('th', { text: h }); }))),
      U.el('tbody', null, body)
    ])]));
    view.appendChild(U.el('div', { class: 'muted', style: 'font-size:12px;margin-top:6px;',
      text: (editable()
        ? 'אפשר לערוך כאן שם, תקציב שנתי, אחראי, הערה ופיזור חודשי — השינוי נשמר ישירות בנתוני התקציב ומופיע גם אצל המזכירה. '
        : 'שנה קודמת — לצפייה בלבד. העריכה פתוחה רק בשנת התקציב הפעילה. ') +
        'הסמן בפס מציין כמה מהשנה חלף (' + pct(frac) + ') — פס שעבר אותו הוא קצב חריג.' }));

    // תוכנן מול בפועל לפי חודש
    var planned = months.map(function () { return 0; });
    var actualM = months.map(function () { return 0; });
    cats.filter(function (c) { return !mainFilter || c.main === mainFilter; }).forEach(function (c) {
      var plan = monthlyPlanOf(c, months.length);
      plan.forEach(function (v, i) { planned[i] += v; });
      var am = amSub[c.main + '||' + c.sub] || {};
      months.forEach(function (ym, i) { actualM[i] += (am[ym] || 0); });
    });
    var maxV = Math.max.apply(null, [1].concat(planned).concat(actualM));
    view.appendChild(U.el('div', { class: 'card m-card', style: 'margin-top:16px;' }, [
      U.el('h3', { style: 'margin:0 0 10px;font-size:16px;', text: 'תוכנן מול בפועל — לפי חודש' }),
      U.el('div', { class: 'b-chart' }, months.map(function (ym, i) {
        return U.el('div', { class: 'b-bar-col', title: monthLabel(ym) + ': תוכנן ' + ils(planned[i]) + ' · בפועל ' + ils(actualM[i]) }, [
          U.el('div', { class: 'b-bars' }, [
            U.el('div', { class: 'b-bar plan', style: 'height:' + (planned[i] / maxV * 100).toFixed(1) + '%;' }),
            U.el('div', { class: 'b-bar act' + (actualM[i] > planned[i] ? ' over' : ''), style: 'height:' + (actualM[i] / maxV * 100).toFixed(1) + '%;' })
          ]),
          U.el('div', { class: 'b-bar-lbl', text: monthLabel(ym) })
        ]);
      })),
      U.el('div', { class: 'muted', style: 'font-size:12px;margin-top:8px;' }, [
        U.el('span', { class: 'b-key plan' }), ' תוכנן   ',
        U.el('span', { class: 'b-key act' }), ' בפועל'
      ])
    ]));

  }

  // ---------- תקציב מול ביצוע (הורד מהניווט לבקשת גיא — נשמר למקרה שנחזיר) ----------
  function dashView(view) {
    var cats = fyCats();
    var frac = fyFraction(), actual = actualBySub(), months = fyMonths();
    var amSub = actualByMonthSub();

    var rows = mainOrder().map(function (main) {
      var subs = cats.filter(function (c) { return c.main === main; });
      var b = 0, a = 0;
      subs.forEach(function (c) { b += U.num(c.annualBudget, 0); a += actual[c.main + '||' + c.sub] || 0; });
      return { main: main, budget: b, actual: a };
    }).sort(function (x, y) { return y.actual - x.actual; });

    view.appendChild(U.el('div', { class: 'card m-card', style: 'margin-bottom:14px;' }, [
      U.el('h3', { style: 'margin:0 0 10px;font-size:16px;', text: 'תקציב מול ביצוע לפי קטגוריה ראשית' })
    ].concat(rows.map(function (r) {
      return U.el('div', { style: 'margin-bottom:10px;' }, [
        U.el('div', { style: 'display:flex;gap:8px;align-items:baseline;font-size:13px;margin-bottom:3px;' }, [
          U.el('strong', { style: 'flex:1;min-width:0;', text: r.main }),
          U.el('span', { class: 'muted', text: ils(r.actual) + ' מתוך ' + ils(r.budget) }),
          U.el('span', { style: r.budget - r.actual < 0 ? 'color:#b91c1c;font-weight:600;' : 'color:var(--muted);',
            text: 'יתרה ' + ils(r.budget - r.actual) })
        ]),
        progressBar(r.actual, r.budget, frac)
      ]);
    }))));

    // תוכנן מול בפועל לפי חודש
    var planned = months.map(function () { return 0; });
    var actualM = months.map(function () { return 0; });
    cats.forEach(function (c) {
      var plan = monthlyPlanOf(c, months.length);
      plan.forEach(function (v, i) { planned[i] += v; });
      var am = amSub[c.main + '||' + c.sub] || {};
      months.forEach(function (ym, i) { actualM[i] += (am[ym] || 0); });
    });
    var max = Math.max.apply(null, [1].concat(planned).concat(actualM));
    view.appendChild(U.el('div', { class: 'card m-card' }, [
      U.el('h3', { style: 'margin:0 0 10px;font-size:16px;', text: 'תוכנן מול בפועל — לפי חודש' }),
      U.el('div', { class: 'b-chart' }, months.map(function (ym, i) {
        return U.el('div', { class: 'b-bar-col', title: monthLabel(ym) + ': תוכנן ' + ils(planned[i]) + ' · בפועל ' + ils(actualM[i]) }, [
          U.el('div', { class: 'b-bars' }, [
            U.el('div', { class: 'b-bar plan', style: 'height:' + (planned[i] / max * 100).toFixed(1) + '%;' }),
            U.el('div', { class: 'b-bar act' + (actualM[i] > planned[i] ? ' over' : ''), style: 'height:' + (actualM[i] / max * 100).toFixed(1) + '%;' })
          ]),
          U.el('div', { class: 'b-bar-lbl', text: monthLabel(ym) })
        ]);
      })),
      U.el('div', { class: 'muted', style: 'font-size:12px;margin-top:8px;' }, [
        U.el('span', { class: 'b-key plan' }), ' תוכנן   ',
        U.el('span', { class: 'b-key act' }), ' בפועל'
      ])
    ]));
  }

  // ---------- חיפוש חכם: חשבוניות · ספקים · עובדים במקום אחד ----------
  function searchView(view) {
    var all = fyTransactions();
    var mains = mainOrder();

    var qi = U.el('input', { value: q, placeholder: 'חיפוש חופשי — ספק, עובד, מס׳ חשבונית, תיאור…', style: 'flex:2;min-width:200px;' });
    var mainSel = U.el('select', { style: 'max-width:190px;' },
      [U.el('option', { value: '', text: 'כל הקטגוריות' })].concat(mains.map(function (m) { return U.el('option', { value: m, text: m }); })));
    mainSel.value = qMain;
    var kindSel = U.el('select', { style: 'max-width:150px;' }, [
      U.el('option', { value: '', text: 'הכול' }),
      U.el('option', { value: 'invoice', text: 'חשבוניות ספקים' }),
      U.el('option', { value: 'reimburse', text: 'החזרים לעובדים' })
    ]);
    kindSel.value = qKind;
    var from = U.el('input', { type: 'date', value: qFrom, style: 'max-width:150px;' });
    var to = U.el('input', { type: 'date', value: qTo, style: 'max-width:150px;' });

    function apply() {
      q = qi.value.trim(); qMain = mainSel.value; qKind = kindSel.value;
      qFrom = from.value; qTo = to.value;
      App.render();
    }
    qi.addEventListener('change', apply);
    [mainSel, kindSel, from, to].forEach(function (el) { el.addEventListener('change', apply); });

    view.appendChild(U.el('div', { class: 'card', style: 'padding:10px;margin-bottom:12px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;' },
      [qi, mainSel, kindSel, from, to,
       U.el('button', { class: 'btn secondary', text: 'ניקוי', onclick: function () {
         q = qMain = qKind = qFrom = qTo = ''; App.render();
       } })]));

    var needle = q.toLowerCase();
    var list = all.filter(function (t) {
      if (qMain && t.main !== qMain) return false;
      if (qKind && t.kind !== qKind) return false;
      if (qFrom && String(t.date) < qFrom) return false;
      if (qTo && String(t.date) > qTo) return false;
      if (!needle) return true;
      return (t.payee + ' ' + t.sub + ' ' + t.main + ' ' + t.invoiceNo + ' ' + t.description).toLowerCase().indexOf(needle) !== -1;
    }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });

    var total = 0;
    list.forEach(function (t) { total += t.amount; });

    // סיכום לפי מקבל התשלום — זה "סיכום ספקים" ו"סיכום עובדים" באותו מקום
    var byPayee = {};
    list.forEach(function (t) {
      var k = t.payee || '(ללא שם)';
      if (!byPayee[k]) byPayee[k] = { name: k, kind: t.kind, total: 0, count: 0 };
      byPayee[k].total += t.amount;
      byPayee[k].count++;
    });
    var payees = Object.keys(byPayee).map(function (k) { return byPayee[k]; })
      .sort(function (a, b) { return b.total - a.total; });

    view.appendChild(U.el('div', { class: 'kpi-grid' }, [
      kpi(String(list.length), 'תנועות', 'kpi-neutral'),
      kpi(ils(total), 'סה"כ', 'kpi-info'),
      kpi(String(payees.length), 'ספקים / עובדים', 'kpi-neutral')
    ]));

    if (!list.length) {
      view.appendChild(U.el('div', { class: 'empty' }, 'אין תנועות שתואמות לחיפוש.'));
      return;
    }

    view.appendChild(U.el('h3', { style: 'font-size:15px;margin:14px 0 6px;', text: 'לפי ספק / עובד' }));
    view.appendChild(U.el('div', { class: 'tbl-scroll' }, [U.el('table', { class: 'grid' }, [
      U.el('thead', null, U.el('tr', null, ['שם', 'סוג', 'תנועות', 'סה"כ'].map(function (h) { return U.el('th', { text: h }); }))),
      U.el('tbody', null, payees.slice(0, 40).map(function (p) {
        return U.el('tr', { style: 'cursor:pointer;', title: 'סינון לפי ' + p.name, onclick: function () { q = p.name; App.render(); } }, [
          U.el('td', null, U.el('strong', { text: p.name })),
          U.el('td', { class: 'muted', text: p.kind === 'reimburse' ? 'החזר לעובד' : 'ספק' }),
          U.el('td', { text: String(p.count) }),
          U.el('td', { style: 'font-weight:600;', text: ils(p.total) })
        ]);
      }))
    ])]));

    view.appendChild(U.el('h3', { style: 'font-size:15px;margin:16px 0 6px;', text: 'התנועות (' + list.length + ')' }));
    view.appendChild(U.el('div', { class: 'tbl-scroll' }, [U.el('table', { class: 'grid' }, [
      U.el('thead', null, U.el('tr', null, ['תאריך', 'קטגוריה', 'תת-קטגוריה', 'ספק / עובד', 'מס׳ חשבונית', 'תיאור', 'סכום']
        .map(function (h) { return U.el('th', { text: h }); }))),
      U.el('tbody', null, list.slice(0, 300).map(function (t) {
        return U.el('tr', null, [
          U.el('td', { style: 'white-space:nowrap;', text: t.date ? U.gregLabel(t.date) + '/' + String(t.date).slice(2, 4) : '' }),
          U.el('td', { text: t.main }),
          U.el('td', { text: t.sub }),
          U.el('td', null, U.el('strong', { text: t.payee })),
          U.el('td', { class: 'muted', text: t.invoiceNo }),
          U.el('td', { class: 'muted', text: t.description }),
          U.el('td', { style: 'font-weight:600;white-space:nowrap;', text: ils(t.amount) })
        ]);
      }))
    ])]));
    if (list.length > 300) {
      view.appendChild(U.el('div', { class: 'muted', style: 'font-size:12px;margin-top:6px;',
        text: 'מוצגות 300 התנועות האחרונות מתוך ' + list.length + ' — צמצמו את החיפוש כדי לראות את השאר.' }));
    }
  }

  function kpi(val, label, cls) {
    return U.el('div', { class: 'kpi ' + (cls || 'kpi-neutral') }, [
      U.el('div', { class: 'kpi-ic' }),
      U.el('div', { class: 'kpi-body' }, [
        U.el('div', { class: 'kpi-row' }, U.el('div', { class: 'kpi-val', text: val })),
        U.el('div', { class: 'kpi-lbl', text: label })
      ])
    ]);
  }

  // ---------- רינדור ----------
  function render(view) {
    if (!subscribed && Store.budgetSubscribe) {
      subscribed = true;
      Store.budgetSubscribe(function () { App.render(); });   // המזכירה מזינה — המסך מתעדכן
    }

    var st = Store.budgetState();
    var TITLES = { sheet: 'ניהול תקציב', dash: 'תקציב מול ביצוע', search: 'חיפוש חכם' };
    var years = Store.budgetFyYears ? Store.budgetFyYears() : [];
    var cur = fy();
    var ySel = U.el('select', { style: 'max-width:150px;', title: 'שנת כספים (1/9–31/8)' },
      years.map(function (y) { return U.el('option', { value: String(y.year), text: 'שנת ' + y.label }); }));
    ySel.value = String(cur.year);
    ySel.addEventListener('change', function () { App.setFy(ySel.value); });
    view.appendChild(U.el('div', { class: 'page-head' }, [
      U.el('h2', { text: TITLES[subTab] || 'ניהול תקציב' }),
      years.length ? ySel : null,
      U.el('button', { class: 'btn secondary small', html: U.NAV_ICO.settings, title: 'שינוי שנת התקציב הפעילה',
        onclick: openFyModal }),
      (String(cur.year) !== String((Store.budgetCurrentFy ? Store.budgetCurrentFy() : {}).year))
        ? U.el('span', { class: 'tag', style: 'background:#fef3c7;color:#92400e;', text: 'שנה קודמת — לצפייה' }) : null,
      U.el('span', { class: 'spacer' }),
      U.el('button', { class: 'btn secondary', html: U.ICO.refresh + ' רענון', onclick: function () {
        Store.budgetLoad(true).then(function () { U.toast('הנתונים רועננו'); App.render(); });
      } })
    ].filter(Boolean)));

    if (!st) {
      view.appendChild(U.el('div', { class: 'card', style: 'border-inline-start:4px solid #d97706;' }, [
        U.el('div', { style: 'font-weight:600;', text: 'נתוני התקציב לא נטענו' }),
        U.el('div', { class: 'muted', style: 'font-size:13px;margin-top:4px;',
          text: Store.budgetLoadError() ? ('הסיבה מהשרת: ' + Store.budgetLoadError()) : 'ייתכן שהנתונים עדיין נטענים — נסו "רענון".' })
      ]));
      return;
    }

    if (subTab === 'sheet') {
      // בורר אחד במקום שורת צ'יפים — יש עשרות קטגוריות ראשיות
      var mains = mainOrder();
      var sel = U.el('select', { style: 'max-width:260px;' },
        [U.el('option', { value: '', text: 'כל הקטגוריות (' + mains.length + ')' })]
          .concat(mains.map(function (m) { return U.el('option', { value: m, text: m }); })));
      sel.value = mainFilter;
      sel.addEventListener('change', function () { mainFilter = sel.value; App.render(); });
      view.appendChild(U.el('div', { style: 'display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap;' }, [
        U.el('span', { class: 'muted', style: 'font-size:13px;', text: 'קטגוריה:' }), sel,
        mainFilter ? U.el('button', { class: 'btn secondary small', text: 'ניקוי',
          onclick: function () { mainFilter = ''; App.render(); } }) : null
      ].filter(Boolean)));
      sheetView(view);
    } else if (subTab === 'dash') dashView(view);
    else searchView(view);

    view.appendChild(U.el('div', { class: 'muted', style: 'font-size:12px;margin-top:14px;padding-top:8px;border-top:1px solid var(--border);',
      text: 'הנתונים מגיעים בזמן אמת מאפליקציית ניהול התקציב. הזנת חשבוניות נעשית שם, על ידי המזכירות.' }));
  }

  // שלושה מסכים = שלושה תת-טאבים של הגיליון (הניווט מנוהל ב-app.js)
  function viewFor(mode) {
    return { render: function (view) { subTab = mode; render(view); } };
  }
  global.BudgetView = viewFor('sheet');
  global.BudgetDashView = viewFor('dash');   // לא בניווט כרגע
  global.BudgetSearchView = viewFor('search');
})(window);
