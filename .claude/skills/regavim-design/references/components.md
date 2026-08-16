# רכיבים — ה-HTML שמייצר כל אחד

הקובץ הזה עונה על "איך רכיב X אמור להיראות ומאיזה markup הוא נבנה".
ה-CSS עצמו יושב ב-`assets/base.css` (הליבה) וב-`assets/components.css` (רכיבי Monday המתקדמים).
**להעתיק מהם, לא לכתוב מחדש** — הם הועתקו מהאפליקציה החיה ולכן הם מה שבאמת רץ.

## תוכן

1. [מבנה מסך](#מבנה-מסך)
2. [כפתורים](#כפתורים)
3. [שדות טופס](#שדות-טופס)
4. [טבלאות](#טבלאות)
5. [כרטיסים](#כרטיסים)
6. [כרטיסי מדד](#כרטיסי-מדד)
7. [רכיבי טבלה מתקדמים](#רכיבי-טבלה-מתקדמים)
8. [סרגל כלים וסינון](#סרגל-כלים-וסינון)
9. [תגים וחיווי מצב](#תגים-וחיווי-מצב)
10. [מודאל](#מודאל)
11. [טוסטים](#טוסטים)
12. [הדפסה](#הדפסה)
13. [צ'קליסט לפני שמסיימים רכיב](#צקליסט-לפני-שמסיימים-רכיב)

---

## מבנה מסך

הפריסה היא **סרגל צד קבוע + תוכן**, לא סרגל עליון עם טאבים. הסרגל העליון דק ומכיל
רק סטטוס וזהות משתמש — הניווט כולו בצד.

```html
<div class="layout">
  <aside class="sidebar no-print" id="sidebar">
    <div class="brand">
      <span class="brand-logo">💼</span>
      <span class="brand-txt">תפעול<small>ישיבת רגבים בנימין</small></span>
      <button class="sb-close no-print" aria-label="סגירת סרגל הצד">«</button>
    </div>
    <nav class="tabs">
      <div class="nav-sec">ניהול</div>
      <button class="active"><span class="nav-ico">…</span>דשבורד</button>
      <button><span class="nav-ico">…</span>ניהול משימות</button>
    </nav>
  </aside>
  <div class="content">
    <header class="topbar no-print">
      <button class="sb-toggle" aria-label="תפריט">☰</button>
      <span class="spacer"></span>
      <div class="status"><span>נשמר</span></div>
    </header>
    <main><!-- כאן המסך --></main>
  </div>
</div>
```

בתוך המסך, כל עמוד נפתח בכותרת עם כפתורי הפעולה **באותה שורה**:

```html
<div class="page-head">
  <h2>ניהול משימות</h2>
  <span class="spacer"></span>
  <button class="btn secondary">ייצוא</button>
  <button class="btn">➕ משימה</button>
</div>
```

ותת-הטאבים מתחתיה — טקסט עם קו תחתון לפעיל, לא גלולות:

```html
<div class="subtabs">
  <button class="active">גיליון ניהול</button>
  <button>חיפוש חכם</button>
</div>
```

`.subtabs button` הוא `inline-flex` בכוונה, כדי שאייקון SVG (שהוא `display:block`) ישב
באותה שורה עם הכיתוב.

## כפתורים

```html
<button class="btn">שמירה</button>                  <!-- ראשי -->
<button class="btn secondary">ביטול</button>        <!-- משני: שקוף + מסגרת -->
<button class="btn accent">ייצוא</button>           <!-- פעולה משנית בולטת -->
<button class="btn danger">מחיקה</button>           <!-- אדום — רק לפעולה הרסנית -->
<button class="btn small">➕</button>                <!-- בתוך שורת טבלה -->
<button class="btn" disabled>שמור</button>
```

בשורת כפתורים אחת: **כפתור ראשי אחד** והשאר `secondary`. שני כפתורים מלאים זה לצד זה
גורמים למשתמש לא לדעת מה הפעולה העיקרית.

## שדות טופס

התווית קטנה ואפורה **מעל** השדה, לא לצידו:

```html
<div class="row">
  <div class="field">
    <label>שם הספק</label>
    <input type="text" placeholder="שם מלא" />
  </div>
  <div class="field">
    <label>תחום</label>
    <select><option>חשמל</option></select>
  </div>
</div>
```

`.row` פורש את השדות זה לצד זה עם `flex-wrap`; כל `.field` בתוכו כבר מקבל
`flex: 1 1 160px; min-width: 0`. ה-`min-width: 0` הוא לא קישוט — בלעדיו שדה עם
placeholder ארוך לא מתכווץ וגולש מהמסגרת בנייד.

**עריכה במקום** (התבנית המועדפת בגיליונות): שדה שקוף עד שנוגעים בו, כך שהטבלה נראית
כמו טבלה ולא כמו טופס.

```html
<input class="transp" value="ערך קיים" />
```

**שדה כסף** עובר תמיד דרך `U.moneyInput` (מציג `2,202,709` במנוחה, מספר נקי בפוקוס).
לא לבנות `input` של סכום ידנית — מספרים ארוכים בלי פסיקים בלתי קריאים.

**שדה שגוי**: `class="invalid"` + `<div class="field-err">הסבר קצר</div>`.

## טבלאות

```html
<div class="tbl-scroll">
  <table class="grid">
    <thead>
      <tr>
        <th class="sortable">שם</th>
        <th>סכום</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>ספק א'</td>
        <td>12,400</td>
        <td class="actions">…</td>
      </tr>
    </tbody>
  </table>
</div>
```

- `.tbl-scroll` היא העטיפה שמאפשרת גלילה אופקית בנייד — טבלה בלעדיה שוברת את העמוד.
- `td` מקבל `height: var(--row-h)` (48px) ו-`tabular-nums`, כדי שהמספרים יתיישרו בעמודה.
- הכותרת דביקה (`position: sticky`) — לא צריך לעשות כלום כדי לקבל את זה.
- `td.actions` מיישר שמאלה ומונע שבירת שורה בכפתורי הפעולה.
- מצב ריק: `<div class="empty">אין רשומות</div>`, לא טבלה ריקה.

## כרטיסים

```html
<div class="card m-card">
  <div style="display:flex;align-items:center;gap:8px">
    <span class="m-cdot" style="background:#16a34a"></span>
    <h3>שיפוץ פנימייה</h3>
  </div>
  …
</div>
```

הסטטוס מסומן ב**נקודת צבע** ליד הכותרת. `border-top: 4px solid` על כרטיס היא התבנית
הישנה — אם רואים אותה בקוד קיים, זה סימן שהמסך עוד לא הומר.

`.card` בלי `.m-card` היא הגרסה הישנה (צל + radius 12) ונשמרה לתאימות בלבד.

## כרטיסי מדד

```html
<div class="kpi-grid">
  <div class="kpi kpi-bad">
    <div class="kpi-ic"></div>
    <div class="kpi-body">
      <div class="kpi-row"><div class="kpi-val">3</div></div>
      <div class="kpi-lbl">אישורי בטיחות שפגו</div>
      <div class="kpi-sub">הכי דחוף: כבאות</div>
    </div>
  </div>
</div>
```

- **המכולה היא `.kpi-grid`, לא `.kpi-row`.** `.kpi-row` היא השורה הפנימית שמחזיקה את
  המספר ויש לה `align-items: baseline`; שימוש בה כעטיפה נותן גובה שונה לכל ריבוע.
  זו טעות שחזרה בשלושה מסכים שונים.
- מודיפייר הצבע (`kpi-good` / `kpi-bad` / `kpi-warn` / `kpi-info` / `kpi-purple` /
  `kpi-neutral`) צובע רק את הנקודה. הרקע נשאר לבן.
- `.kpi-badge.up/.down/.flat` — שינוי מול תקופה קודמת, בתוך `.kpi-row`.

## רכיבי טבלה מתקדמים

הרכיבים האלה מגיעים מ-`assets/components.css`.

**סטטוס כתא צבוע** — התא כולו נצבע, טקסט לבן מודגש. זה החיווי הכי בולט בטבלה,
ולכן שמור לעמודת הסטטוס בלבד:

```html
<select class="m-status" style="background:#16a34a">
  <option>הושלם</option>
</select>
```

`m-status-auto` = גרסה שרוחבה לפי התוכן, לשימוש בשורת כותרת (אחרת הסטטוס דוחף
כפתורים לשורה חדשה).

**אחראי** — אווטאר עגול עם ראשי תיבות + שם:

```html
<span class="m-owner">
  <span class="m-avatar" style="background:#7c3aed">א״מ</span>
  <span class="m-oname">אבישי מעודה</span>
</span>
<span class="m-owner empty">ללא אחראי</span>
```

**פעולות שורה** — מוסתרות עד ריחוף, כדי שהטבלה תישאר נקייה (במכשירי מגע הן תמיד גלויות):

```html
<td class="actions">
  <span class="m-actions">
    <button class="m-iconbtn" title="עריכה">✏️</button>
    <button class="m-iconbtn" title="מחיקה">🗑️</button>
  </span>
</td>
```

**קבוצה מתקפלת**:

```html
<button class="m-group">
  <span style="color:var(--muted);font-size:12px">▾</span>
  <span class="m-gbar" style="background:#1d4e89"></span>
  <span class="m-gname" style="color:#1d4e89">בתהליך</span>
  <span class="m-gcount">7 משימות · 3 פתוחות</span>
</button>
```

**שורת הוספה מהירה** בתחתית כל קבוצה — זו התבנית המועדפת להזנה (כתוב + Enter),
עדיפה על מודאל:

```html
<div class="m-addrow">
  <input class="m-addinput" placeholder="＋ הוסף משימה — כתוב ולחץ Enter" />
</div>
```

השורה יורשת אוטומטית את ערך הקבוצה שממנה הוסיפו, והפוקוס נשאר בה אחרי ההוספה.

**תת-משימות** — חץ בעמודה הראשונה, ופס התקדמות מקופל בשורת האב:

```html
<button class="m-chev has open">▾</button>
<span class="m-rollup">3/5 <span class="m-rbar"><span style="width:60%;background:#16a34a"></span></span></span>
<tr class="m-subrow"><td colspan="6">
  <div class="m-subwrap"><table class="grid m-subgrid">…</table></div>
</td></tr>
```

## סרגל כלים וסינון

במקום שורה של אחד-עשר כפתורי סינון — חיפוש + כמה כפתורי פופאובר:

```html
<div class="m-toolbar">
  <input class="m-search" placeholder="חיפוש…" />
  <div class="m-pop">
    <button class="btn secondary m-popbtn on">סינון <span class="m-badge">2</span></button>
    <div class="amenu-pop m-poppanel open">
      <div class="m-popsec"><label>סטטוס</label><select>…</select></div>
      <button class="m-popitem on">רק שלי</button>
    </div>
  </div>
</div>
<div class="m-chiprow">
  <span class="m-fchip">סטטוס: פתוח ✕</span>
</div>
```

`.m-popbtn.on` = יש סינון פעיל (מסגרת מותג + `m-badge` עם המונה). צ'יפי הסינון הפעילים
מוצגים מתחת, כך שאף פעם לא רואים רשימה מסוננת בלי לדעת למה.

**תפריט פעולות ⋮** לכותרות — במקום לפזר חמישה כפתורים:

```html
<div class="amenu">
  <button class="btn secondary small amenu-btn">⋮</button>
  <div class="amenu-pop open">
    <button class="amenu-item"><span class="amenu-ic">📤</span>ייצוא לאקסל</button>
  </div>
</div>
```

## תגים וחיווי מצב

```html
<span class="tag">מורה</span>                       <!-- תג ניטרלי בצבע המותג -->
<span class="tl tl-green">בתוקף</span>              <!-- חיווי מצב -->
<span class="tl tl-orange">עומד לפוג</span>
<span class="tl tl-red">פג</span>
<span class="tl tl-none">חסר</span>
```

מפת הצבעים קבועה ומשמעותית: ירוק תקין · כתום דורש תשומת לב · אדום פג/חורג · אפור חסר.
**אין להשתמש בהם לקישוט.** תג של קטגוריה או תפקיד = `.tag` או צבע ייעודי קבוע לאותה
קטגוריה (כמו `U.tagChip` שמחזיק צבע קבוע לכל תגית עובד) — לא צבע רנדומלי לכל ערך.

## מודאל

```html
<div class="modal-bg">
  <div class="modal">
    <div class="modal-head"><h3>עריכת ספק</h3><button class="x">✕</button></div>
    <div class="modal-body">…</div>
    <div class="modal-foot">
      <button class="btn">שמירה</button>
      <button class="btn secondary">ביטול</button>
    </div>
  </div>
</div>
```

רוחב `min(560px, 92vw)` וגובה מקסימלי `88vh` — כדי שגם מודאל ארוך יישאר על המסך בנייד.
המודאל נועד לפעולה שדורשת החלטה; להזנה שוטפת עדיפה שורת ההוספה המהירה בטבלה.

## טוסטים

חיווי הצלחה/שגיאה מופיע למטה-שמאל ונעלם מעצמו:

```html
<div class="toast-wrap">
  <div class="toast toast-success show"><span class="toast-ic">✓</span>נשמר</div>
</div>
```

הודעת שגיאה מכילה את **הסיבה האמיתית** ומה לעשות עכשיו — לא "אירעה שגיאה".

## הדפסה

`@media print` כבר מסתיר `.no-print`, את הסרגל העליון, את תת-הטאבים ואת כפתורי
כותרת העמוד, ומחליף את הטבלאות למסגרות `1px solid #999`. מה שצריך:

- לסמן `no-print` על כל דבר אינטראקטיבי שנוסף (סרגלי כלים, כפתורי שורה).
- `.print-only` לתוכן שקיים רק בהדפסה (כותרת מסמך, שורת חתימה).
- מסמך שנפתח בחלון נפרד (חבילת PDF, אישור הורים) נבנה כמסמך עצמאי עם
  `<html dir="rtl">` ו-`<style>` משלו — לא יורש את ה-CSS של האפליקציה.

## צ'קליסט לפני שמסיימים רכיב

- [ ] כל צבע הוא `var(--…)`, אין אף hex קשיח בקוד הרכיב
- [ ] נבדק ב-`body.dark` — רקעים וטקסטים קריאים
- [ ] נבדק ברוחב 640px — הטבלה גוללת ולא נשברת, השדות לא גולשים
- [ ] טבלה עטופה ב-`.tbl-scroll`, מונים עטופים ב-`.kpi-grid`
- [ ] אין `border-top: 4px` על כרטיס ואין גלולות בתת-טאבים (תבניות ישנות)
- [ ] מצב ריק מטופל (`.empty`), לא טבלה ריקה
