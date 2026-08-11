/* store.js — מודל הנתונים והסנכרון לענן (Supabase) של אפליקציית התפעול.
   הנתונים מפוצלים לשורות לפי תחום בטבלת admin_state — כדי שגיא והמזכירה
   יעבדו במקביל בלי לדרוס זה את זה:
     core          — מצבת עובדים, תעריפים, הגדרות (כתיבה נדירה, החלפה מלאה)
     portal        — שמות פעילים לפורטל הדיווח הפתוח (נגזר מ-core, קריאה אנונימית)
     lc:YYYY-MM    — מרכז למידה (רשומות + נסיעות פר מתגבר)
     sub:YYYY-MM   — מילוי מקום
     abs:YYYY-MM   — היעדרויות / עבודה במילואים / נסיעות / גמול טיול (kind פר רשומה)
     pstat:YYYY-MM — לוח סטטוס שכר חודשי (רשומה פר עובד)
   דיווחי עובדים מהפורטל נשמרים בטבלה נפרדת admin_submissions (ממתין→אושר/נדחה). */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'regavim_admin_v1';

  function newMeta() { return { version: 1, lastModified: '1970-01-01T00:00:00.000Z' }; }

  function defaultStatuses() {
    return [
      { id: 'todo',    label: 'ממתין לטיפול', color: '#64748b' },
      { id: 'sign',    label: 'נדרש לחתום',   color: '#d97706' },
      { id: 'verify',  label: 'לוודא שעות',   color: '#7c3aed' },
      { id: 'miluim',  label: 'מילואים',      color: '#2563eb' },
      { id: 'lc',      label: 'דוח מרכז למידה', color: '#0d9488' },
      { id: 'done',    label: 'בוצע',          color: '#16a34a' }
    ];
  }

  // ערכי ברירת מחדל לגיליון המשימות (מתוך קובץ "ניהול משימות" של גיא)
  function defaultTaskDomains() {
    return ['תחזוקה', 'מטבח', 'משכורות', 'תשלום הורים', 'תקציב', 'פנימיה', 'חקלאות',
            'כללי', 'עליית הנוער', 'ביטחון ורישוי', 'קולות קוראים', 'גפן', 'רכבים', 'רכש'];
  }
  function defaultTaskOwners() {
    return ['גיא צוברי', 'יצחק קליין', 'אבישי מעודה', 'רז גרולמן', 'אליהו לבנה',
            'שלמה הס', 'יגל פלורסהיים', 'גינת סבח', 'אביטל עמאר', 'אחר'];
  }
  // קבלנים/ספקים לפרויקטים (רשימה נפרדת מהצוות; נפתחת עם ערכים מהקובץ, ניתנת לעריכה)
  function defaultContractors() {
    return ['שלום גיאת', 'ראובן פז', 'אלי איטח', 'מגן אש', 'אוראל ברזל', 'י.צ שירותי',
            'נחשון טכנולוגיה', 'עמיאל דהן', 'עדי תקשורת', 'ש.א.ג', 'מישה רואה'];
  }

  // מרשם הספקים בנתוני בסיס — נזרע משמות הקבלנים, ומכאן נערך כטבלה מלאה
  function defaultSuppliers() {
    return defaultContractors().map(function (n) {
      return { id: uid(), name: n, field: '', phone: '', email: '', taxId: '', note: '' };
    });
  }

  // ---------- ברירות מחדל: תכנון אירועים וטיולים ----------
  // תפקידים קבועים בתפעול אירוע — ממופים לעובד מהמצבת (בהגדרות). empId ריק עד שממפים.
  function defaultEventRoles() {
    return ['מנהל תיכון', 'ראש ישיבה', 'סגן ראש הישיבה', 'מנהל פנימייה', 'מנהלן',
            'אם בית', 'רכז חברתי', 'רכז הסעות', 'רכז חקלאות', 'מנהל מדבך', 'מחנך', 'מזכירות']
      .map(function (n) { return { name: n, empId: '' }; });
  }
  // מחסן המשימות: כל סוגי המשימות האפשריים, לכל אחד תפקיד-אחראי ברירת מחדל
  function defaultTaskCatalog() {
    return [
      { id: 'loz',        title: 'בניית לוז',                  defaultRole: 'רכז הסעות' },
      { id: 'transport',  title: 'תיאום הסעות הלוך וחזור',      defaultRole: 'רכז הסעות' },
      { id: 'breakfast',  title: 'ארוחת בוקר לפי הלוז',         defaultRole: 'מנהל מדבך' },
      { id: 'lunch',      title: 'ארוחת צהריים לפי הלוז',       defaultRole: 'מנהל מדבך' },
      { id: 'parents',    title: 'אישור הורים',                defaultRole: 'מזכירות' },
      { id: 'permit',     title: 'הוצאת אישור טיולים',          defaultRole: 'מזכירות' },
      { id: 'distribute', title: 'תפוצת לוז לתלמידים ומחנכים',  defaultRole: 'מחנך' },
      { id: 'firstaid',   title: 'חובש / ערכת עזרה ראשונה',     defaultRole: 'רכז הסעות' },
      { id: 'gear',       title: 'ציוד ולוגיסטיקה',            defaultRole: 'מנהלן' },
      { id: 'program',    title: 'תוכן ותכנית',                defaultRole: 'רכז חברתי' },
      { id: 'budget',     title: 'תקציב ותשלום',               defaultRole: 'מנהלן' }
    ];
  }
  // סוגי אירועים — כל אחד עם משימות מסומנות-מראש מהמחסן (defaultTaskIds) ותבנית לוז אופציונלית
  function defaultEventTypes() {
    var FULL = ['loz', 'transport', 'breakfast', 'lunch', 'parents', 'permit', 'distribute', 'firstaid', 'gear', 'program', 'budget'];
    function trip(id, label) { return { id: id, label: label, defaultTaskIds: FULL.slice(), scheduleTemplate: [] }; }
    return [
      trip('trip_class', 'טיול כיתתי'),
      trip('trip_yeshiva', 'טיול ישיבתי'),
      trip('survival', 'מסע הישרדות'),
      trip('identity', 'מסע זהות'),
      { id: 'study_day',     label: 'יום עיון',       defaultTaskIds: ['loz', 'program', 'distribute', 'breakfast'], scheduleTemplate: [] },
      { id: 'shabbat',       label: 'שבת ישיבה',      defaultTaskIds: ['loz', 'program', 'distribute'],             scheduleTemplate: [] },
      { id: 'event',         label: 'אירוע ישיבתי',   defaultTaskIds: ['loz', 'program', 'distribute', 'gear', 'budget'], scheduleTemplate: [] },
      { id: 'lecture',       label: 'שיחה / הרצאה',    defaultTaskIds: ['program', 'distribute'],                    scheduleTemplate: [] },
      { id: 'mechanech_eve', label: 'ערב אצל המחנך',  defaultTaskIds: ['program', 'distribute'],                    scheduleTemplate: [] },
      { id: 'madrich_eve',   label: 'ערב מדריך',      defaultTaskIds: ['program', 'distribute'],                    scheduleTemplate: [] }
    ];
  }

  // נוסח ברירת מחדל לאישור הורים (ניתן לעריכה בהגדרות)
  function defaultConsentText() {
    return 'אני, ההורה/אפוטרופוס החתום/ה מטה, מאשר/ת את השתתפות בני/בתי בפעילות שבנדון מטעם ישיבת רגבים בנימין. '
      + 'ידועים לי פרטי הפעילות (מועד, יעד ומסגרת שעות) כמפורט לעיל, ואני נותן/ת את הסכמתי המלאה להשתתפותו/ה, '
      + 'לרבות הנסיעה אליה וממנה. אני מתחייב/ת ליידע את צוות הישיבה בכל מידע רפואי או רגישות רלוונטיים.';
  }

  function defaultCore() {
    return {
      meta: newMeta(),
      settings: {
        orgName: 'ישיבת רגבים בנימין',
        appName: 'תפעול',
        managerName: 'גיא צוברי',
        hourlyRate: 80,    // תעריף שעת תגבור (מרכז למידה)
        kmRate: 0.9,       // תעריף נסיעות לק"מ
        statuses: defaultStatuses(),
        taskDomains: defaultTaskDomains(),
        taskOwners: defaultTaskOwners(),
        contractors: defaultContractors(),
        suppliers: defaultSuppliers(),   // מרשם הספקים המלא (נתוני בסיס)
        eventRoles: defaultEventRoles(),
        taskCatalog: defaultTaskCatalog(),
        eventTypes: defaultEventTypes(),
        classes: [],               // רשימות כיתה: [{ id, name, students:[{id,name}] }] — למעקב אישורי הורים
        consentText: defaultConsentText(),
        taskColumns: []            // עמודות מותאמות בגיליון המשימות: [{ id, name, type, options:[{value,color}] }]
      },
      // { id, firstName, lastName, phone, email, tz, role:''|'admin'|'secretary',
      //   tags:['מתגבר','מורה',...], active, notes }
      employees: []
    };
  }

  function defaultData() {
    return {
      core: defaultCore(),
      lc: {},    // 'YYYY-MM' → { month, records:[], travel:{empId:{km,days,at}}, meta }
      sub: {},   // 'YYYY-MM' → { month, records:[], meta }
      abs: {},   // 'YYYY-MM' → { month, records:[], meta }  (רשומה: kind:'absence'|'work'|'travel'|'trip')
      pstat: {}, // 'YYYY-MM' → { month, entries:{empId:{statusId,task,note,by,at}}, meta }
      // רשימת משימות מתמשכת (לא לפי חודש).
      // רשומה: { id, num, domain, desc, owner, priority:'גבוה'|'בינוני'|'נמוך',
      //          status:'פתוח'|'בתהליך'|'הושלם', due (ISO|''), notes,
      //          kind:'חד פעמי'|'קבוע', freq:'weekly'|'monthly'|'quarterly'|'yearly'|'',
      //          lastDoneAt, createdAt, updatedAt, deleted }
      // קולות קוראים. רשומה: { id, num:'KK-001', name, funder, category, budgetSub (תת-קטגוריה
      //   באפליקציית התקציב — מפתח החיבור), status, year, publishedAt, deadline, submittedAt,
      //   approvedAt, amountFunder, amountSelf, spendDeadline, reportDate, reportStatus, owner,
      //   planned:[{id,desc,supplier,amount,date,note}], docs:[{name,path,at}], note, createdAt, updatedAt, deleted }
      // invoices — הכרעות על חשבוניות שהגיעו מאפליקציית התקציב:
      //   { txId: { status:'approved'|'rejected', kkId, at, note } }
      kk: { records: [], seq: 0, invoices: {}, meta: newMeta() },
      // בטיחות, רישוי וביטוחים. רשומה:
      // { id, num:'S-001', name, group:'שנתי'|'5 שנים'|'לפי צורך'|'רישוי מוסד',
      //   issuedAt, expiresAt (מחושב מהנפקה+תדירות אלא אם expiryManual), issuer, owner,
      //   docPath, docName, status:'' (נגזר), na (לא רלוונטי), note, createdAt, updatedAt, deleted }
      safety: { records: [], seq: 0, seeded: false, meta: newMeta() },
      tasks: { records: [], seq: 0, meta: newMeta() },
      // פרויקטים. רשומה: { id, num, name, domain, owner, status:'תכנון'|'בביצוע'|'הושלם',
      //   budget (number), notes, items:[{ id, desc, contractor, cost (number|''),
      //   invoice, status:'תכנון'|'בביצוע'|'בוצע' }], createdAt, updatedAt, deleted }
      projects: { records: [], seq: 0, meta: newMeta() },
      // גיוס: מועמדים ומשרות פנויות.
      // מועמד: { id, name, city, phone, target (טקסט "מיועד ל-"), status:'התעניין'|'הגיע לראיון'|'התקבל'|'לא רלוונטי',
      //          interviewer, hasCv, hasGrapho, impression, familyStatus, notes, year,
      //          convertedEmpId, createdAt, updatedAt, deleted }
      // משרה: { id, title, scope (אחוז משרה), filledBy, flyer:'בוצע'|'לא בוצע'|'לא צריך'|'', notes,
      //         createdAt, updatedAt, deleted }
      recruit: { candidates: [], positions: [], meta: newMeta() },
      // תכנון אירועים וטיולים. רשומה: { id, num, type, title, group, date (ISO), startTime, endTime,
      //   location, status:'בתכנון'|'מוכן'|'בוצע', schedule:[{id,time,activity,note}],
      //   tasks:[{id,title,role,empId,status:'פתוח'|'בתהליך'|'בוצע',note}], notes, createdAt, updatedAt, deleted }
      events: { records: [], seq: 0, meta: newMeta() }
    };
  }

  var data = null;

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function nowISO() { return new Date().toISOString(); }

  // ---------- טעינה/שמירה מקומית ----------
  function ensureCoreFields(core) {
    var def = defaultCore();
    for (var k in def) { if (!(k in core)) core[k] = def[k]; }
    var ds = def.settings;
    for (var s in ds) { if (!(s in core.settings)) core.settings[s] = ds[s]; }
    if (!core.settings.statuses || !core.settings.statuses.length) core.settings.statuses = defaultStatuses();
    if (!core.settings.taskDomains || !core.settings.taskDomains.length) core.settings.taskDomains = defaultTaskDomains();
    if (!core.settings.taskOwners || !core.settings.taskOwners.length) core.settings.taskOwners = defaultTaskOwners();
    if (!core.settings.contractors || !core.settings.contractors.length) core.settings.contractors = defaultContractors();
    if (!core.settings.eventRoles || !core.settings.eventRoles.length) core.settings.eventRoles = defaultEventRoles();
    if (!core.settings.taskCatalog || !core.settings.taskCatalog.length) core.settings.taskCatalog = defaultTaskCatalog();
    if (!core.settings.eventTypes || !core.settings.eventTypes.length) core.settings.eventTypes = defaultEventTypes();
    if (!Array.isArray(core.settings.classes)) core.settings.classes = [];
    // ספקים — מרשם מלא בנתוני בסיס; נזרע פעם אחת משמות הקבלנים הקיימים כדי לא להתחיל מריק
    if (!Array.isArray(core.settings.suppliers)) {
      core.settings.suppliers = (core.settings.contractors || []).map(function (n) {
        return { id: uid(), name: n, field: '', phone: '', email: '', taxId: '', note: '' };
      });
    }
    if (!core.settings.consentText) core.settings.consentText = defaultConsentText();
    if (!Array.isArray(core.settings.taskColumns)) core.settings.taskColumns = [];
    return core;
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        data = JSON.parse(raw);
        var def = defaultData();
        for (var k in def) { if (!(k in data)) data[k] = def[k]; }
        ensureCoreFields(data.core);
      } else {
        data = defaultData();
      }
    } catch (e) { console.error('load failed', e); data = defaultData(); }
    return data;
  }

  function persistLocal() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
    catch (e) { console.error('save failed', e); if (global.U) U.toast('שגיאה בשמירה מקומית: ' + e.message, 'error'); }
  }

  // ---------- גישה לשורות (rowId → אובייקט בזיכרון) ----------
  var MONTH_KINDS = { lc: 1, sub: 1, abs: 1, pstat: 1 };

  function rowGet(rowId) {
    if (rowId === 'core') return data.core;
    if (rowId === 'tasks') return data.tasks;
    if (rowId === 'projects') return data.projects;
    if (rowId === 'recruit') return data.recruit;
    if (rowId === 'events') return data.events;
    if (rowId === 'kk') return data.kk;
    if (rowId === 'safety') return data.safety;
    var p = rowId.split(':');
    if (MONTH_KINDS[p[0]] && p[1]) return data[p[0]][p[1]] || null;
    return null;
  }
  function rowSet(rowId, obj) {
    if (rowId === 'core') { data.core = ensureCoreFields(obj); return; }
    if (rowId === 'tasks') { data.tasks = obj; return; }
    if (rowId === 'projects') { data.projects = obj; return; }
    if (rowId === 'recruit') { data.recruit = obj; return; }
    if (rowId === 'events') { data.events = obj; return; }
    if (rowId === 'kk') { data.kk = obj; return; }
    if (rowId === 'safety') { data.safety = obj; return; }
    var p = rowId.split(':');
    if (MONTH_KINDS[p[0]] && p[1]) data[p[0]][p[1]] = obj;
  }
  function allRowIds() {
    var ids = ['core', 'tasks', 'projects', 'recruit', 'events', 'kk', 'safety'];
    Object.keys(MONTH_KINDS).forEach(function (kind) {
      Object.keys(data[kind] || {}).forEach(function (m) { ids.push(kind + ':' + m); });
    });
    return ids;
  }

  // ---------- מצב ענן (Supabase) — אותו פרויקט כמו שאר אפליקציות רגבים ----------
  var SB_URL = 'https://dcnndzrdimkogfjsvcku.supabase.co';
  var SB_KEY = 'sb_publishable_LoALeRJVUqiyBwWhCF_0qQ_RpLwS4ew';
  var TABLE = 'admin_state';
  var SUB_TABLE = 'admin_submissions';
  var CONSENT_TABLE = 'event_consents';
  var BUCKET = 'admin-approvals';
  // ?local=1 — מצב פיתוח מקומי בלבד (בלי ענן, הרשאת מנהל מלאה)
  var LOCAL_DEV = /[?&]local=1/.test(String(location.search));
  var sb = (!LOCAL_DEV && global.supabase && global.supabase.createClient) ? global.supabase.createClient(SB_URL, SB_KEY) : null;
  var cloudMode = !!sb;

  var pendingRecovery = false;
  try { if (/type=recovery/.test(String(location.hash))) pendingRecovery = true; } catch (e) {}
  if (sb && sb.auth && sb.auth.onAuthStateChange) {
    sb.auth.onAuthStateChange(function (ev) { if (ev === 'PASSWORD_RECOVERY') pendingRecovery = true; });
  }
  var applyingRemote = false;
  var pendingRemote = {}; // rowId → עדכון מהענן שממתין כל עוד מודאל פתוח

  // ---------- תפקידים ----------
  // מנהלי-על (bootstrap): מקבלים הרשאת מנהל גם כשהמצבת עדיין ריקה
  var ADMIN_EMAILS = ['guy@rgvb.org.il', 'guytsuberi1@gmail.com'];
  var sessionUser = null;
  function setSessionUser(u) { sessionUser = u || null; }
  function currentEmail() { return sessionUser && sessionUser.email ? String(sessionUser.email).toLowerCase() : null; }

  function empByEmail(email) {
    email = String(email || '').toLowerCase();
    if (!email || !data) return null;
    return (data.core.employees || []).filter(function (s) {
      return (s.email || '').toLowerCase() === email && s.active !== false;
    })[0] || null;
  }
  // שלוש רמות: admin (גיא — הכול) · manager (הנהלה — כל הגיליונות למעט הגדרות ונתוני בסיס) ·
  // secretary (מזכירות — מרכז למידה בלבד). ברירת מחדל לעובד לא מוכר: secretary.
  var ROLES = ['admin', 'manager', 'secretary'];
  function roleOf(email) {
    email = String(email || '').toLowerCase();
    if (!email) return 'secretary';
    // הרשאה שנקבעה במסך ניהול ההרשאות גוברת על כל השאר
    var map = (data && data.core && data.core.settings && data.core.settings.userRoles) || {};
    if (ROLES.indexOf(map[email]) !== -1) return map[email];
    if (ADMIN_EMAILS.indexOf(email) !== -1) return 'admin';
    var s = empByEmail(email);
    if (s && ROLES.indexOf(s.role) !== -1) return s.role;
    return 'secretary';
  }
  function setUserRole(email, role) {
    email = String(email || '').toLowerCase();
    if (!email || ROLES.indexOf(role) === -1) return;
    var st = settings();
    if (!st.userRoles) st.userRoles = {};
    st.userRoles[email] = role;
    // מסונכרן גם לרשומת העובד, כדי ששני המקורות לא יסתרו
    var emp = empByEmail(email);
    if (emp) { emp.role = role; }
    saveSettings();
  }
  // ניהול חשבונות ההתחברות — דרך פונקציית השרת המשותפת manage-users
  function manageUsers(payload) {
    if (!sb) return Promise.reject(new Error('נדרשת התחברות לענן'));
    return sb.functions.invoke('manage-users', { body: payload }).then(function (res) {
      if (res.error) throw new Error((res.error && res.error.message) || 'הפעולה נכשלה');
      if (res.data && res.data.error) throw new Error(res.data.error);
      return res.data || {};
    });
  }
  // אבחון: supabase-js מחזיר "Failed to send a request" גם כשהפונקציה לא קיימת,
  // גם כשהיא נפלה בהפעלה וגם כשה-CORS חסם — שלושה דברים שונים לגמרי.
  // קריאה ישירה מחזירה את קוד ה-HTTP האמיתי ומאפשרת להגיד מה באמת קרה.
  function manageUsersDiagnose() {
    var url = SB_URL + '/functions/v1/manage-users';
    return Promise.resolve(sb ? sb.auth.getSession() : null).then(function (s) {
      var token = (s && s.data && s.data.session && s.data.session.access_token) || SB_KEY;
      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SB_KEY, Authorization: 'Bearer ' + token },
        body: JSON.stringify({ action: 'ping' })
      });
    }).then(function (r) {
      return r.text().then(function (body) {
        if (r.status === 404) return { kind: 'missing', status: 404, hint: 'הפונקציה אינה קיימת בפרויקט בשם manage-users.' };
        if (r.status === 503 || r.status === 500) return { kind: 'boot', status: r.status, hint: 'הפונקציה קיימת אך נפלה בהפעלה. הסיבה נמצאת בלשונית Logs שלה.', body: body.slice(0, 200) };
        if (r.status === 401) return { kind: 'auth', status: 401, hint: 'הפונקציה עונה, אך לא זיהתה את המשתמש המחובר. נסו להתנתק ולהתחבר מחדש.' };
        return { kind: 'reachable', status: r.status, hint: 'הפונקציה עונה (' + r.status + ').', body: body.slice(0, 200) };
      });
    }).catch(function () {
      return { kind: 'blocked', status: 0,
        hint: 'הבקשה לא הגיעה לשרת בכלל — הפונקציה אינה פרוסה, או שכתובת האתר חסומה ב-CORS שלה.' };
    });
  }
  function currentRole() {
    if (!cloudMode) return 'admin'; // מצב מקומי (פיתוח בלבד)
    return sessionUser ? roleOf(currentEmail()) : 'secretary';
  }
  function isAdmin() { return currentRole() === 'admin'; }
  function roleLabel(r) { return { admin: 'מנהל', manager: 'הנהלה', secretary: 'מזכירות' }[r] || r; }
  function myName() {
    var s = empByEmail(currentEmail());
    if (s) return (s.firstName + ' ' + (s.lastName || '')).trim();
    var em = currentEmail();
    return em ? em.split('@')[0] : 'משתמש';
  }

  // ---------- שמירה: debounce נפרד לכל שורה ----------
  var saveTimers = {};
  var CLIENT_ID = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  function save(rowId) {
    if (!data) return;
    rowId = rowId || 'core';
    var row = rowGet(rowId);
    if (!row) return;
    if (!row.meta) row.meta = newMeta();
    row.meta.lastModified = nowISO();
    row.meta.savedBy = CLIENT_ID;
    persistLocal();
    if (cloudMode && !applyingRemote) {
      setStatus('שומר…');
      scheduleCloudSave(rowId);
    }
    if (rowId === 'core') schedulePortalPublish();
  }
  function scheduleCloudSave(rowId) {
    if (!cloudMode) return;
    if (saveTimers[rowId]) clearTimeout(saveTimers[rowId]);
    saveTimers[rowId] = setTimeout(function () { cloudSave(rowId); }, 500);
  }
  function cloudSave(rowId) {
    var row = rowGet(rowId);
    if (!sb || !row) return;
    row.meta = row.meta || newMeta();
    row.meta.savedBy = CLIENT_ID;
    sb.from(TABLE).upsert({ id: rowId, data: row, updated_at: nowISO() })
      .then(function (res) {
        if (res.error) { console.error('cloudSave', rowId, res.error); setStatus('שגיאת שמירה לענן'); }
        else setStatus('נשמר בענן ' + new Date().toLocaleTimeString('he-IL'));
      });
  }

  // שורת portal — נגזרת מהמצבת: שמות פעילים בלבד, לבחירה בפורטל הפתוח
  var portalTimer = null;
  function schedulePortalPublish() {
    if (!cloudMode) return;
    if (portalTimer) clearTimeout(portalTimer);
    portalTimer = setTimeout(publishPortal, 800);
  }
  function publishPortal() {
    if (!sb) return;
    var names = (data.core.employees || [])
      .filter(function (e) { return e.active !== false; })
      .map(function (e) { return (e.firstName + ' ' + (e.lastName || '')).trim(); })
      .sort(function (a, b) { return a.localeCompare(b, 'he'); });
    sb.from(TABLE).upsert({ id: 'portal', data: { names: names, updatedAt: nowISO() }, updated_at: nowISO() })
      .then(function (res) { if (res.error) console.error('publishPortal', res.error); });
  }

  // ---------- מיזוג ----------
  function ts(x) { return x ? (Date.parse(x) || 0) : 0; }
  function metaTs(row) { return row && row.meta ? ts(row.meta.lastModified) : 0; }
  function jsonEq(a, b) { try { return JSON.stringify(a) === JSON.stringify(b); } catch (e) { return false; } }

  // איחוד אוספי רשומות לפי id — updatedAt חדש מנצח (כולל מחיקות-tombstone)
  function mergeRecords(localArr, incomingArr) {
    var byId = {};
    (incomingArr || []).forEach(function (r) { if (r && r.id) byId[r.id] = r; });
    (localArr || []).forEach(function (r) {
      if (!r || !r.id) return;
      var other = byId[r.id];
      if (!other || ts(r.updatedAt) > ts(other.updatedAt)) byId[r.id] = r;
    });
    return Object.keys(byId).map(function (k) { return byId[k]; })
      .sort(function (a, b) { return String(a.date || '').localeCompare(String(b.date || '')); });
  }

  // איחוד מפות לפי מפתח — הרשומה עם at חדש יותר מנצחת
  function mergeKeyed(localMap, incomingMap) {
    var out = {}, keys = {};
    Object.keys(localMap || {}).forEach(function (k) { keys[k] = 1; });
    Object.keys(incomingMap || {}).forEach(function (k) { keys[k] = 1; });
    Object.keys(keys).forEach(function (k) {
      var a = (localMap || {})[k], b = (incomingMap || {})[k];
      if (!a) { out[k] = b; return; }
      if (!b) { out[k] = a; return; }
      out[k] = ts(a.at) >= ts(b.at) ? a : b;
    });
    return out;
  }

  function mergeIncoming(rowId, incoming, initial) {
    if (!incoming) return false;
    if (rowId === 'portal') return false; // שורה נגזרת — לא חלק מהמצב המקומי
    var local = rowGet(rowId);
    var p = rowId.split(':');

    if (rowId === 'tasks' || rowId === 'projects' || rowId === 'events' || rowId === 'kk' || rowId === 'safety') {
      var mt = {
        records: mergeRecords(local && local.records, incoming.records),
        seq: Math.max((local && local.seq) || 0, incoming.seq || 0),
        meta: metaTs(local) >= metaTs(incoming) ? (local && local.meta) || incoming.meta : incoming.meta
      };
      if (rowId === 'kk') mt.invoices = mergeKeyed(local && local.invoices, incoming.invoices);
      if (jsonEq(mt, local)) return false;
      rowSet(rowId, mt);
      if (!jsonEq(mt, incoming)) scheduleCloudSave(rowId);
      return true;
    }

    if (rowId === 'recruit') {
      var mr = {
        candidates: mergeRecords(local && local.candidates, incoming.candidates),
        positions: mergeRecords(local && local.positions, incoming.positions),
        meta: metaTs(local) >= metaTs(incoming) ? (local && local.meta) || incoming.meta : incoming.meta
      };
      if (jsonEq(mr, local)) return false;
      rowSet(rowId, mr);
      if (!jsonEq(mr, incoming)) scheduleCloudSave(rowId);
      return true;
    }

    if (MONTH_KINDS[p[0]]) {
      var merged = { month: (local && local.month) || incoming.month };
      merged.meta = metaTs(local) >= metaTs(incoming) ? (local && local.meta) || incoming.meta : incoming.meta;
      if (p[0] === 'pstat') {
        merged.entries = mergeKeyed(local && local.entries, incoming.entries);
      } else {
        merged.records = mergeRecords(local && local.records, incoming.records);
        if (p[0] === 'lc') merged.travel = mergeKeyed(local && local.travel, incoming.travel);
      }
      if (jsonEq(merged, local)) return false;
      rowSet(rowId, merged);
      if (!jsonEq(merged, incoming)) scheduleCloudSave(rowId);
      return true;
    }

    // core — החלפה מלאה, החדש מנצח. הגנה: לא דורסים מצבת מלאה במצבת ריקה.
    if (coreHasContent(local) && !coreHasContent(incoming)) {
      if (initial) scheduleCloudSave(rowId);
      return false;
    }
    if (local && metaTs(local) > metaTs(incoming)) {
      if (initial) scheduleCloudSave(rowId);
      return false;
    }
    if (jsonEq(local, incoming)) return false;
    rowSet(rowId, incoming);
    return true;
  }

  function coreHasContent(c) { return !!(c && c.employees && c.employees.length); }

  // ---------- ענן: טעינה ורילטיים ----------
  function cloudLoadAll() {
    return sb.from(TABLE).select('id, data')
      .then(function (res) {
        if (res.error) { console.error('cloudLoadAll', res.error); return null; }
        return res.data || [];
      }).catch(function (e) { console.error(e); return null; });
  }

  function subscribeRealtime() {
    if (!sb) return;
    sb.channel('admin_state_rt').on('postgres_changes',
      { event: '*', schema: 'public', table: TABLE },
      function (payload) {
        var rowId = payload.new && payload.new.id;
        var incoming = payload.new && payload.new.data;
        if (!rowId || !incoming) return;
        if (incoming.meta && incoming.meta.savedBy === CLIENT_ID) return;
        if (typeof document !== 'undefined' && document.querySelector('.modal-bg')) {
          pendingRemote[rowId] = incoming;
          return;
        }
        applyRemote(rowId, incoming);
      }).subscribe();
    // דיווחי פורטל חדשים — רענון תור האישורים בזמן אמת
    sb.channel('admin_sub_rt').on('postgres_changes',
      { event: '*', schema: 'public', table: SUB_TABLE },
      function () {
        submissionsCache = null;
        if (subsListeners.length) loadSubmissions();
        else if (global.App && App.render) App.render();
      }).subscribe();
  }

  function applyRemote(rowId, incoming) {
    applyingRemote = true;
    var changed = mergeIncoming(rowId, incoming, false);
    if (changed) {
      persistLocal();
      var _sy = (global.scrollY || 0);
      if (global.App && App.render) App.render();
      global.scrollTo(0, _sy);
      setStatus('עודכן בזמן אמת ' + new Date().toLocaleTimeString('he-IL'));
    }
    applyingRemote = false;
  }

  function flushPendingRemote() {
    if (typeof document !== 'undefined' && document.querySelector('.modal-bg')) return;
    var ids = Object.keys(pendingRemote);
    if (!ids.length) return;
    ids.forEach(function (rowId) {
      var inc = pendingRemote[rowId];
      delete pendingRemote[rowId];
      applyRemote(rowId, inc);
    });
  }

  // ---------- עובדים והגדרות ----------
  function core() { return data.core; }
  function settings() { return data.core.settings; }
  function employees(includeInactive) {
    var arr = data.core.employees || [];
    return includeInactive ? arr.slice() : arr.filter(function (e) { return e.active !== false; });
  }
  function empById(id) {
    return (data.core.employees || []).filter(function (e) { return e.id === id; })[0] || null;
  }
  function empName(idOrEmp) {
    var e = typeof idOrEmp === 'string' ? empById(idOrEmp) : idOrEmp;
    return e ? (e.firstName + ' ' + (e.lastName || '')).trim() : '—';
  }
  function upsertEmployee(emp) {
    if (!data.core.employees) data.core.employees = [];
    if (!emp.id) { emp.id = uid(); data.core.employees.push(emp); }
    else {
      var arr = data.core.employees, found = false;
      for (var i = 0; i < arr.length; i++) if (arr[i].id === emp.id) { arr[i] = emp; found = true; break; }
      if (!found) arr.push(emp);
    }
    save('core');
    return emp;
  }
  function saveSettings() { save('core'); }

  // ---------- שורות חודש ----------
  function monthRow(kind, month, create) {
    var m = data[kind][month];
    if (!m && create) {
      m = { month: month, meta: newMeta() };
      if (kind === 'pstat') m.entries = {};
      else { m.records = []; if (kind === 'lc') m.travel = {}; }
      data[kind][month] = m;
    }
    return m || null;
  }
  function saveMonth(kind, month) { save(kind + ':' + month); }

  // רשומות (lc/sub/abs): הוספה/עדכון/מחיקה רכה
  function upsertRecord(kind, month, rec) {
    var row = monthRow(kind, month, true);
    if (!rec.id) rec.id = uid();
    rec.updatedAt = nowISO();
    rec.by = myName();
    var arr = row.records, found = false;
    for (var i = 0; i < arr.length; i++) if (arr[i].id === rec.id) { arr[i] = rec; found = true; break; }
    if (!found) arr.push(rec);
    saveMonth(kind, month);
    return rec;
  }
  function deleteRecord(kind, month, id) {
    var row = monthRow(kind, month, false);
    if (!row) return;
    for (var i = 0; i < row.records.length; i++) {
      if (row.records[i].id === id) {
        row.records[i] = { id: id, deleted: true, updatedAt: nowISO(), by: myName() };
        break;
      }
    }
    saveMonth(kind, month);
  }
  function records(kind, month, filter) {
    var row = monthRow(kind, month, false);
    var arr = row ? (row.records || []) : [];
    arr = arr.filter(function (r) { return !r.deleted; });
    if (filter) arr = arr.filter(filter);
    // סדר כרונולוגי — התאריך המוקדם ראשון. בלי זה השורות מוצגות לפי סדר ההזנה,
    // ורשומה שנוספה מקומית קופצת לסוף גם אם התאריך שלה מוקדם.
    // (המיון יציב, כך שרשומות בלי תאריך שומרות על סדרן.)
    return arr.slice().sort(function (a, b) {
      return String(a.date || a.fromDate || '').localeCompare(String(b.date || b.fromDate || ''));
    });
  }

  // ---------- משימות (רשימה מתמשכת) ----------
  function tasksAll(includeDone) {
    var arr = (data.tasks.records || []).filter(function (r) { return !r.deleted; });
    if (includeDone === false) arr = arr.filter(function (r) { return r.status !== 'הושלם'; });
    return arr;
  }
  function taskById(id) {
    return (data.tasks.records || []).filter(function (r) { return r.id === id; })[0] || null;
  }
  function nextTaskNum() {
    data.tasks.seq = (data.tasks.seq || 0) + 1;
    return 'T-' + String(data.tasks.seq).padStart(3, '0');
  }
  // מקדם תאריך לפי תדירות עד שהוא בעתיד (מונע פתיחה-מחדש של משימה שכבר באיחור)
  function advanceDue(iso, freq) {
    var base = iso ? new Date(iso + 'T00:00:00') : new Date();
    var today = new Date(); today.setHours(0, 0, 0, 0);
    if (isNaN(base)) base = new Date();
    function step(d) {
      if (freq === 'weekly') d.setDate(d.getDate() + 7);
      else if (freq === 'monthly') d.setMonth(d.getMonth() + 1);
      else if (freq === 'quarterly') d.setMonth(d.getMonth() + 3);
      else if (freq === 'yearly') d.setFullYear(d.getFullYear() + 1);
      else d.setMonth(d.getMonth() + 1);
    }
    do { step(base); } while (base <= today);
    var y = base.getFullYear(), m = String(base.getMonth() + 1).padStart(2, '0'), day = String(base.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }
  function upsertTask(rec) {
    if (!rec.id) { rec.id = uid(); rec.num = rec.num || nextTaskNum(); rec.createdAt = nowISO(); }
    rec.updatedAt = nowISO();
    // משימה קבועה שהושלמה — מתחדשת: חוזרת ל"פתוח" עם תאריך יעד מקודם לפי התדירות
    if (rec.kind === 'קבוע' && rec.status === 'הושלם') {
      rec.lastDoneAt = nowISO();
      rec.due = advanceDue(rec.due, rec.freq);
      rec.status = 'פתוח';
      rec._renewed = true;
    } else { rec._renewed = false; }
    var arr = data.tasks.records, found = false;
    for (var i = 0; i < arr.length; i++) if (arr[i].id === rec.id) { arr[i] = rec; found = true; break; }
    if (!found) arr.push(rec);
    save('tasks');
    return rec;
  }
  // ייבוא בכמות (מאקסל) — מוסיף רשומות ישירות בלי טריגר התחדשות; שומר על מספור מהקובץ
  function addTasksBulk(list) {
    var arr = data.tasks.records;
    var maxNum = data.tasks.seq || 0;
    (list || []).forEach(function (rec) {
      if (!rec.id) rec.id = uid();
      if (rec.num) {
        var n = parseInt(String(rec.num).replace(/\D/g, ''), 10);
        if (!isNaN(n) && n > maxNum) maxNum = n;
      } else { rec.num = 'T-' + String(++maxNum).padStart(3, '0'); }
      rec.createdAt = nowISO();
      rec.updatedAt = nowISO();
      arr.push(rec);
    });
    data.tasks.seq = maxNum;
    save('tasks');
  }
  function setTaskStatus(id, status) {
    var t = taskById(id);
    if (!t) return null;
    var copy = JSON.parse(JSON.stringify(t));
    copy.status = status;
    return upsertTask(copy);
  }
  function deleteTask(id) {
    var arr = data.tasks.records;
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].id === id) { arr[i] = { id: id, deleted: true, updatedAt: nowISO() }; break; }
    }
    save('tasks');
  }
  // ---------- פרויקטים ----------
  // ---------- גיוס: מועמדים ומשרות ----------
  function recruitList(key) {
    return (data.recruit[key] || []).filter(function (r) { return !r.deleted; });
  }
  function recruitUpsert(key, rec) {
    if (!rec.id) { rec.id = uid(); rec.createdAt = nowISO(); }
    rec.updatedAt = nowISO();
    rec.by = myName();
    var arr = data.recruit[key], found = false;
    for (var i = 0; i < arr.length; i++) if (arr[i].id === rec.id) { arr[i] = rec; found = true; break; }
    if (!found) arr.push(rec);
    save('recruit');
    return rec;
  }
  function recruitDelete(key, id) {
    var arr = data.recruit[key];
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id) {
      arr[i].deleted = true;
      arr[i].updatedAt = nowISO();
      break;
    }
    save('recruit');
  }
  function candidates() { return recruitList('candidates'); }
  function candidateById(id) {
    return (data.recruit.candidates || []).filter(function (r) { return r.id === id; })[0] || null;
  }
  function upsertCandidate(rec) { return recruitUpsert('candidates', rec); }
  function deleteCandidate(id) { recruitDelete('candidates', id); }
  function positions() { return recruitList('positions'); }
  function positionById(id) {
    return (data.recruit.positions || []).filter(function (r) { return r.id === id; })[0] || null;
  }
  function upsertPosition(rec) { return recruitUpsert('positions', rec); }
  function deletePosition(id) { recruitDelete('positions', id); }
  // סידור ידני של המשרות — הסדר הוא סדר המערך עצמו
  function reorderPositions(orderedIds) {
    var arr = data.recruit.positions || [];
    var byId = {};
    arr.forEach(function (r) { byId[r.id] = r; });
    var out = [];
    orderedIds.forEach(function (id) { if (byId[id]) { out.push(byId[id]); delete byId[id]; } });
    arr.forEach(function (r) { if (byId[r.id]) out.push(r); });   // מחוקים/חדשים שלא נכללו
    data.recruit.positions = out;
    save('recruit');
  }

  function projectsAll() {
    return (data.projects.records || []).filter(function (r) { return !r.deleted; });
  }
  function projectById(id) {
    return (data.projects.records || []).filter(function (r) { return r.id === id; })[0] || null;
  }
  function nextProjectNum() {
    data.projects.seq = (data.projects.seq || 0) + 1;
    return 'P-' + String(data.projects.seq).padStart(3, '0');
  }
  function upsertProject(proj) {
    if (!proj.id) { proj.id = uid(); proj.num = proj.num || nextProjectNum(); proj.createdAt = nowISO(); }
    if (!proj.items) proj.items = [];
    proj.updatedAt = nowISO();
    var arr = data.projects.records, found = false;
    for (var i = 0; i < arr.length; i++) if (arr[i].id === proj.id) { arr[i] = proj; found = true; break; }
    if (!found) arr.push(proj);
    save('projects');
    return proj;
  }
  function deleteProject(id) {
    var arr = data.projects.records;
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id) { arr[i] = { id: id, deleted: true, updatedAt: nowISO() }; break; }
    save('projects');
  }
  // ---------- בטיחות, רישוי וביטוחים ----------
  // הרשימה שהתקבלה ממנהל הרישוי — נזרעת פעם אחת, וניתנת לעריכה/מחיקה אחר כך
  var LICENSE_MAIN_NAME = 'רישיון מוסד';   // השורה הראשית — כל שאר האישורים משרתים אותה
  var SAFETY_SEED = [
    { group: 'שנתי', name: LICENSE_MAIN_NAME, main: true },
    { group: 'שנתי', name: 'תשתית לייעודה (בטיחות בית ספר)' },
    { group: 'שנתי', name: 'טופס דיווח (בטיחות פנימייה)' },
    { group: 'שנתי', name: 'כבאות' },
    { group: 'שנתי', name: 'חשמלאי מוסמך' },
    { group: '5 שנים', name: 'חשמלאי בודק' },
    { group: '5 שנים', name: 'מהנדס — יציבות מבנים' },
    { group: '5 שנים', name: 'מהנדס — תקרות תלויות' },
    { group: '5 שנים', name: 'מהנדס — מזגנים תלויים' },
    { group: '5 שנים', name: 'מהנדס — מבנים יבילים' },
    { group: 'לפי צורך', name: 'תברואן' },
    { group: 'לפי צורך', name: 'סקר עצים' },
    { group: 'לפי צורך', name: 'אישורי גז' },
    { group: 'לפי צורך', name: 'אישור מתקני ספורט' },
    { group: 'רישוי מוסד', name: 'רשימת תלמידים' },
    { group: 'רישוי מוסד', name: 'רשימת עובדי חינוך' },
    { group: 'רישוי מוסד', name: 'רשימת עובדי שירות' },
    { group: 'רישוי מוסד', name: 'אישור שימוש במבנה' },
    { group: 'רישוי מוסד', name: 'מערכת שעות ותוכנית לימודים' },
    { group: 'רישוי מוסד', name: 'תעודת הסמכה מנהל בית הספר' },
    { group: 'רישוי מוסד', name: 'תשריט המתחם' },
    { group: 'רישוי מוסד', name: 'היתר בנייה' }
  ];
  var SAFETY_MONTHS = { 'שנתי': 12, '5 שנים': 60 };   // 'לפי צורך' ו'רישוי מוסד' — תפוגה ידנית/ללא

  function safetyAll() {
    return (data.safety.records || []).filter(function (r) { return !r.deleted; });
  }
  function safetyById(id) {
    return (data.safety.records || []).filter(function (r) { return r.id === id; })[0] || null;
  }
  function nextSafetyNum() {
    data.safety.seq = (data.safety.seq || 0) + 1;
    return 'S-' + String(data.safety.seq).padStart(3, '0');
  }
  // תפוגה מחושבת: הנפקה + תדירות. חוזר '' כשאין תדירות או אין תאריך הנפקה.
  function safetyExpiry(rec) {
    if (rec.expiryManual && rec.expiresAt) return rec.expiresAt;
    var months = SAFETY_MONTHS[rec.group];
    if (!months || !rec.issuedAt) return rec.expiresAt || '';
    var p = String(rec.issuedAt).split('-');
    var d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1 + months, parseInt(p[2], 10));
    var mm = String(d.getMonth() + 1), dd = String(d.getDate());
    return d.getFullYear() + '-' + (mm.length < 2 ? '0' + mm : mm) + '-' + (dd.length < 2 ? '0' + dd : dd);
  }
  function upsertSafety(rec) {
    if (!rec.id) { rec.id = uid(); rec.num = rec.num || nextSafetyNum(); rec.createdAt = nowISO(); }
    rec.updatedAt = nowISO();
    var arr = data.safety.records, found = false;
    for (var i = 0; i < arr.length; i++) if (arr[i].id === rec.id) { arr[i] = rec; found = true; break; }
    if (!found) arr.push(rec);
    save('safety');
    return rec;
  }
  function deleteSafety(id) {
    var arr = data.safety.records;
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id) { arr[i] = { id: id, deleted: true, updatedAt: nowISO() }; break; }
    save('safety');
  }
  // זריעה חד-פעמית של הרשימה מהמנהל
  function seedSafety(force) {
    if (data.safety.seeded && !force) return 0;
    var have = {};
    safetyAll().forEach(function (r) { have[r.name] = true; });
    var added = 0;
    SAFETY_SEED.forEach(function (x) {
      if (have[x.name]) return;
      upsertSafety({ name: x.name, group: x.group, main: !!x.main,
        issuedAt: '', expiresAt: '', issuer: '', owner: '', note: '' });
      added++;
    });
    data.safety.seeded = true;
    save('safety');
    return added;
  }
  // שורת "רישיון מוסד" נוספה אחרי הזריעה הראשונה — משלימים אותה למי שכבר טען את הרשימה.
  function ensureLicenseRow() {
    var recs = safetyAll();
    if (!recs.length) return null;                        // גיליון ריק — הזריעה הרגילה תטפל
    var found = null;
    recs.forEach(function (r) { if (r.main || r.name === LICENSE_MAIN_NAME) found = r; });
    if (found) {
      if (!found.main) { found.main = true; upsertSafety(found); }
      return found;
    }
    var rec = { name: LICENSE_MAIN_NAME, group: 'שנתי', main: true,
      issuedAt: '', expiresAt: '', issuer: 'משרד החינוך', owner: '', note: '' };
    upsertSafety(rec);
    return rec;
  }
  function safetyGroups() { return ['שנתי', '5 שנים', 'לפי צורך', 'רישוי מוסד']; }

  // ---------- קולות קוראים ----------
  function knum(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
  function kkAll() {
    return (data.kk.records || []).filter(function (r) { return !r.deleted; });
  }
  function kkById(id) {
    return (data.kk.records || []).filter(function (r) { return r.id === id; })[0] || null;
  }
  function nextKkNum() {
    data.kk.seq = (data.kk.seq || 0) + 1;
    return 'KK-' + String(data.kk.seq).padStart(3, '0');
  }
  function upsertKk(rec) {
    if (!rec.id) { rec.id = uid(); rec.num = rec.num || nextKkNum(); rec.createdAt = nowISO(); }
    if (!rec.planned) rec.planned = [];
    if (!rec.docs) rec.docs = [];
    rec.updatedAt = nowISO();
    var arr = data.kk.records, found = false;
    for (var i = 0; i < arr.length; i++) if (arr[i].id === rec.id) { arr[i] = rec; found = true; break; }
    if (!found) arr.push(rec);
    save('kk');
    return rec;
  }
  function deleteKk(id) {
    var arr = data.kk.records;
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id) {
      // budgetSub נשמר גם במחיקה — אחרת הסנכרון מהתקציב היה יוצר את הרשומה מחדש
      arr[i] = { id: id, budgetSub: arr[i].budgetSub || '', deleted: true, updatedAt: nowISO() };
      break;
    }
    save('kk');
  }
  // הכרעות על חשבוניות שהגיעו מאפליקציית התקציב
  function kkInvoiceDecisions() { return data.kk.invoices || (data.kk.invoices = {}); }
  function setKkInvoiceDecision(txId, patch) {
    var map = kkInvoiceDecisions();
    map[txId] = Object.assign({}, map[txId] || {}, patch, { at: nowISO() });
    save('kk');
    return map[txId];
  }

  // סנכרון אוטומטי: כל קטגוריית "קולות קוראים" בתקציב מקבלת רשומה כאן.
  // אידמפוטנטי — מזוהה לפי budgetSub, כך שריצה חוזרת לא יוצרת כפילויות.
  function syncKkFromBudget() {
    var subs = budgetKkSubs();
    if (!subs.length) return 0;
    var bySub = {};
    // כולל רשומות שנמחקו — מחיקה מכוונת לא צריכה לחזור בסנכרון הבא
    (data.kk.records || []).forEach(function (r) { if (r && r.budgetSub) bySub[r.budgetSub] = r; });
    var added = 0;
    subs.forEach(function (c) {
      var existing = bySub[c.sub];
      if (existing) {
        if (existing.deleted) return;
        var changed = false;
        // הסכום מוזרם מהתקציב — אלא אם הוזן כאן ידנית (amountManual)
        if (!existing.amountManual && c.annualBudget && knum(existing.amountFunder) !== knum(c.annualBudget)) {
          existing.amountFunder = c.annualBudget;
          changed = true;
        }
        // הגיע סכום → הק"ק כבר לא רק "פורסם"
        if (knum(existing.amountFunder) > 0 && existing.status === 'published') {
          existing.status = 'approved';
          changed = true;
        }
        if (changed) upsertKk(existing);
        return;
      }
      upsertKk({
        name: c.sub, budgetSub: c.sub,
        amountFunder: c.annualBudget || '', amountSelf: '',
        status: c.annualBudget ? 'approved' : 'published',
        planned: [], docs: [], fromBudget: true
      });
      added++;
    });
    return added;
  }

  // ---------- גשר לאפליקציית ניהול התקציב (אותו פרויקט Supabase, טבלת app_state) ----------
  var BUDGET_TABLE = 'app_state';
  var KK_MAIN = 'קולות קוראים';   // הקטגוריה הראשית באפליקציית התקציב
  var budgetCache = null;         // { at, state }
  var budgetError = '';

  function budgetLoad(force) {
    if (!sb) return Promise.resolve(null);
    if (!force && budgetCache && (Date.now() - budgetCache.at) < 60000) return Promise.resolve(budgetCache.state);
    return sb.from(BUDGET_TABLE).select('data').eq('id', 'main').maybeSingle().then(function (res) {
      if (res.error) { budgetError = res.error.message; return null; }
      budgetError = '';
      var st = res.data && res.data.data;
      budgetCache = { at: Date.now(), state: st || null };
      return budgetCache.state;
    }, function (e) { budgetError = (e && e.message) || 'שגיאת רשת'; return null; });
  }
  function budgetLoadError() { return budgetError; }
  function budgetState() { return budgetCache && budgetCache.state; }
  // תתי-הקטגוריות תחת "קולות קוראים" — מפתח החיבור בין שתי האפליקציות
  function budgetKkSubs() {
    var st = budgetState();
    if (!st || !st.categories) return [];
    return st.categories.filter(function (c) { return c.main === KK_MAIN; })
      .map(function (c) { return { sub: c.sub, annualBudget: knum(c.annualBudget) }; });
  }
  // כל החשבוניות שסווגו לקול קורא כלשהו
  function budgetKkInvoices() {
    var st = budgetState();
    if (!st || !st.transactions) return [];
    return st.transactions.filter(function (t) { return t && t.main === KK_MAIN; })
      .map(function (t) {
        return {
          id: t.id, date: t.date || '', sub: t.sub || '', amount: knum(t.amount),
          supplier: t.supplier || t.employee || '', invoiceNo: t.invoiceNo || '',
          description: t.description || t.purpose || '', kind: t.kind || 'invoice'
        };
      })
      .sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
  }
  // שנת הכספים של הישיבה (1/9–31/8) כפי שמוגדרת באפליקציית התקציב
  function budgetFiscalYear() {
    var st = budgetState();
    return (st && st.fiscalYear) || { start: '', end: '' };
  }

  // ---------- ניהול תקציב: קריאה מלאה מאפליקציית התקציב ----------
  // אותה שורת app_state; כאן היא נקראת כמקור אמת מלא ולא רק לקולות קוראים.
  function budgetCategories() {
    var st = budgetState();
    return (st && st.categories) ? st.categories.slice() : [];
  }
  function budgetTransactions() {
    var st = budgetState();
    if (!st || !st.transactions) return [];
    return st.transactions.map(function (t) {
      return {
        id: t.id, kind: t.kind || 'invoice', date: t.date || '',
        main: t.main || '', sub: t.sub || '', amount: knum(t.amount),
        supplier: t.supplier || '', employee: t.employee || '',
        payee: (t.kind === 'reimburse') ? (t.employee || '') : (t.supplier || ''),
        invoiceNo: t.invoiceNo || '', description: t.description || t.purpose || '',
        docType: t.docType || '', method: t.method || ''
      };
    });
  }
  // חודשי שנת הכספים (1/9–31/8) לפי ההגדרה באפליקציית התקציב
  function budgetFyMonths() {
    var fy = budgetFiscalYear();
    if (!fy.start || !fy.end) return [];
    var s = new Date(fy.start), e = new Date(fy.end), out = [];
    var d = new Date(s.getFullYear(), s.getMonth(), 1);
    var end = new Date(e.getFullYear(), e.getMonth(), 1);
    for (var g = 0; d < end && g < 60; g++) {
      out.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
      d.setMonth(d.getMonth() + 1);
    }
    return out;
  }
  // איזה חלק משנת הכספים כבר חלף (0..1) — לחישוב קצב ותחזית
  function budgetFyFraction() {
    var fy = budgetFiscalYear();
    if (!fy.start || !fy.end) return 0;
    var s = new Date(fy.start), e = new Date(fy.end), now = new Date();
    if (now <= s) return 0;
    if (now >= e) return 1;
    return (now - s) / (e - s);
  }
  // קטגוריות של שנת כספים מסוימת.
  // המודל: state.categories = הקטגוריות של השנה הפעילה (מה שאפליקציית התקציב עובדת איתו),
  // ו-state.fyCats[<שנה>] = צילום הקטגוריות של כל שנה אחרת. שינוי בשנה אחת לא נוגע באחרת.
  function budgetCategoriesFor(year) {
    var st = budgetState();
    if (!st) return [];
    var active = budgetCurrentFy().year;
    if (String(year) === String(active)) return (st.categories || []).slice();
    var map = st.fyCats || {};
    return (map[year] || []).slice();
  }
  function budgetIsActiveFy(year) {
    return String(year) === String(budgetCurrentFy().year);
  }

  // רשימת שנות הכספים שיש להן נתונים — נגזרת מתאריכי התנועות (שנה מתחילה ב-1/9)
  function budgetFyOf(dateISO) {
    var d = String(dateISO || '');
    if (d.length < 7) return null;
    var y = parseInt(d.slice(0, 4), 10), m = parseInt(d.slice(5, 7), 10);
    return (m >= 9) ? y : y - 1;
  }
  function budgetFyYears() {
    var set = {};
    budgetTransactions().forEach(function (t) {
      var y = budgetFyOf(t.date);
      if (y) set[y] = 1;
    });
    var st = budgetState();
    if (st && st.fyCats) Object.keys(st.fyCats).forEach(function (y) { if (y) set[y] = 1; });
    var cur = budgetFyOf(budgetFiscalYear().start) || budgetFyOf(new Date().toISOString().slice(0, 10));
    if (cur) set[cur] = 1;
    return Object.keys(set).map(Number).sort(function (a, b) { return b - a; })
      .map(function (y) {
        return { year: y, label: y + '/' + String(y + 1).slice(2),
          start: y + '-09-01', end: (y + 1) + '-08-31' };
      });
  }
  // שנת הכספים הפעילה כרגע (לפי ההגדרה באפליקציית התקציב)
  // **שנת התקציב נקבעת לפי התאריך בלבד** — 1/9 עד 31/8. היא עובדה של הלוח,
  // לא הגדרה שמישהו בוחר: 1/9/25–31/8/26 היא 25/26, ורק ב-1/9/26 היא הופכת ל-26/27.
  // (בורר השנה במסכים הוא בורר *תצוגה* בלבד, לצורך צפייה ותכנון.)
  function budgetCurrentFy() {
    var y = budgetFyOf(new Date().toISOString().slice(0, 10));
    return { year: y, label: y + '/' + String(y + 1).slice(2), start: y + '-09-01', end: (y + 1) + '-08-31' };
  }

  // עדכון בזמן אמת — המזכירה מזינה חשבונית והמסך כאן מתעדכן
  var budgetChannel = null;
  function budgetSubscribe(onChange) {
    if (!sb || budgetChannel) return;
    budgetChannel = sb.channel('admin_budget_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: BUDGET_TABLE, filter: 'id=eq.main' },
        function (payload) {
          var incoming = payload && payload.new && payload.new.data;
          if (!incoming) return;
          budgetCache = { at: Date.now(), state: incoming };
          if (onChange) onChange();
        })
      .subscribe();
  }
  // כתיבה בטוחה: קוראים את המצב העדכני, משנים רק את מה שצריך, וכותבים בחזרה.
  // בלי זה כתיבה מכאן עלולה לדרוס חשבונית שהמזכירה הזינה שנייה קודם.
  function budgetPatch(mutate) {
    if (!sb) return Promise.reject(new Error('נדרשת התחברות לענן'));
    return sb.from(BUDGET_TABLE).select('data').eq('id', 'main').maybeSingle().then(function (res) {
      if (res.error) throw new Error(res.error.message);
      var st = (res.data && res.data.data) || null;
      if (!st) throw new Error('לא נמצאו נתוני תקציב');
      var changed = mutate(st);
      if (changed === false) return st;
      return sb.from(BUDGET_TABLE).upsert({ id: 'main', data: st, updated_at: new Date().toISOString() })
        .then(function (r2) {
          if (r2.error) throw new Error(r2.error.message);
          budgetCache = { at: Date.now(), state: st };
          return st;
        });
    });
  }

  // חשבוניות ששויכו לקול קורא מסוים — לפי ההכרעה שלי, ואם אין — לפי הסיווג של המזכירה
  function kkInvoicesFor(rec) {
    var dec = kkInvoiceDecisions();
    return budgetKkInvoices().filter(function (inv) {
      var d = dec[inv.id];
      if (d) return d.status === 'approved' && d.kkId === rec.id;
      return false;   // ללא אישור מפורש — לא נספר כ"נוצל"
    });
  }
  // חשבוניות שממתינות להכרעה שלי
  function kkPendingInvoices() {
    var dec = kkInvoiceDecisions();
    return budgetKkInvoices().filter(function (inv) { return !dec[inv.id]; });
  }
  // תמונת הכסף של קול קורא: אושר · נוצל (מאושר) · מתוכנן · נותר ללא תכנון
  function kkMoney(rec) {
    var funder = knum(rec.amountFunder), self = knum(rec.amountSelf);
    var approved = funder + self;
    var used = 0;
    kkInvoicesFor(rec).forEach(function (inv) { used += inv.amount; });
    var planned = 0;
    (rec.planned || []).forEach(function (p) { planned += knum(p.amount); });
    var unplanned = approved - used - planned;
    return {
      funder: funder, self: self, approved: approved,
      used: used, planned: planned,
      unplanned: unplanned,                     // הכסף שאושר ואף אחד עוד לא חשב עליו
      usedPct: approved ? Math.min(100, used / approved * 100) : 0,
      plannedPct: approved ? Math.min(100, planned / approved * 100) : 0,
      over: used + planned > approved           // חריגה
    };
  }

  // תקציב מול ניצול: נוצל = סכום עלויות תת-המשימות; מאזן = תקציב − נוצל
  function projectBudget(proj) {
    var budget = parseFloat(proj.budget) || 0;
    var used = 0;
    (proj.items || []).forEach(function (it) { used += parseFloat(it.cost) || 0; });
    return { budget: budget, used: used, balance: budget - used, over: used > budget && budget > 0 };
  }

  // ---------- אירועים וטיולים ----------
  function eventsAll() {
    return (data.events.records || []).filter(function (r) { return !r.deleted; });
  }
  function eventById(id) {
    return (data.events.records || []).filter(function (r) { return r.id === id; })[0] || null;
  }
  function nextEventNum() {
    data.events.seq = (data.events.seq || 0) + 1;
    return 'E-' + String(data.events.seq).padStart(3, '0');
  }
  function upsertEvent(ev) {
    if (!ev.id) { ev.id = uid(); ev.num = ev.num || nextEventNum(); ev.createdAt = nowISO(); }
    if (!ev.schedule) ev.schedule = [];
    if (!ev.tasks) ev.tasks = [];
    ev.updatedAt = nowISO();
    var arr = data.events.records, found = false;
    for (var i = 0; i < arr.length; i++) if (arr[i].id === ev.id) { arr[i] = ev; found = true; break; }
    if (!found) arr.push(ev);
    save('events');
    return ev;
  }
  function deleteEvent(id) {
    var arr = data.events.records;
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id) { arr[i] = { id: id, deleted: true, updatedAt: nowISO() }; break; }
    save('events');
  }
  // מזהה העובד של המשתמש המחובר (לפי אימייל) — לשילוב "המשימות שלי" בגיליון המשימות
  function currentEmpId() {
    var e = empByEmail(currentEmail());
    return e ? e.id : null;
  }
  // מעלה הקלטת פגישה ל-Storage (bucket 'meeting-audio') ומחזיר את הנתיב
  function uploadMeetingAudio(file) {
    if (!sb) return Promise.reject(new Error('נדרשת התחברות לענן'));
    var ext = (String(file.name || '').split('.').pop() || 'dat').toLowerCase();
    var path = uid() + '.' + ext;
    return sb.storage.from('meeting-audio').upload(path, file, { contentType: file.type || 'audio/mpeg', upsert: false })
      .then(function (res) { if (res.error) throw new Error(res.error.message || 'העלאת ההקלטה נכשלה'); return path; });
  }
  // קבצים מצורפים לעמודת "קובץ" בגיליון המשימות (bucket task-files)
  function uploadTaskFile(file) {
    if (!sb) return Promise.reject(new Error('נדרשת התחברות לענן'));
    var ext = (String(file.name || '').split('.').pop() || 'dat').toLowerCase().replace(/[^a-z0-9]/g, '');
    var path = uid() + '.' + ext;
    return sb.storage.from('task-files').upload(path, file, { upsert: false })
      .then(function (res) { if (res.error) throw new Error(res.error.message || 'ההעלאה נכשלה'); return { path: path, name: file.name }; });
  }
  function taskFileUrl(path) {
    if (!sb || !path) return Promise.resolve(null);
    return sb.storage.from('task-files').createSignedUrl(path, 3600).then(function (res) {
      if (res.error) { console.error('taskFileUrl', res.error); return null; }
      return res.data && res.data.signedUrl;
    });
  }
  function deleteTaskFile(path) {
    if (!sb || !path) return Promise.resolve();
    return sb.storage.from('task-files').remove([path]).then(function () {});
  }
  // מסלול AI: שולח טקסט/הקלטה של פגישה ל-Edge Function (Gemini) ומחזיר טיוטת אירועים
  function meetingToEvents(payload) {
    if (!sb) return Promise.reject(new Error('נדרשת התחברות לענן'));
    return sb.functions.invoke('meeting-to-events', { body: payload }).then(function (res) {
      if (res.error) {
        // Supabase מחזיר הודעה כללית ב-non-2xx; שולפים את הסיבה האמיתית מגוף התגובה
        var ctx = res.error.context;
        if (ctx && typeof ctx.json === 'function') {
          return ctx.json().then(function (b) { throw new Error((b && b.error) || res.error.message); },
            function () { throw new Error(res.error.message || 'שגיאה מהשרת'); });
        }
        throw new Error(res.error.message || 'שגיאה מהשרת');
      }
      if (res.data && res.data.error) throw new Error(res.data.error);
      return (res.data && res.data.events) || [];
    });
  }

  // יצירת פלייר תמונה לאירוע (Nano Banana) — מחזיר data URL של התמונה
  function generateFlyer(payload) {
    if (!sb) return Promise.reject(new Error('נדרשת התחברות לענן'));
    return sb.functions.invoke('event-flyer', { body: payload }).then(function (res) {
      if (res.error) {
        var ctx = res.error.context;
        if (ctx && typeof ctx.json === 'function') {
          return ctx.json().then(function (b) { throw new Error((b && b.error) || res.error.message); },
            function () { throw new Error(res.error.message || 'שגיאה מהשרת'); });
        }
        throw new Error(res.error.message || 'שגיאה מהשרת');
      }
      if (res.data && res.data.error) throw new Error(res.data.error);
      if (!res.data || !res.data.image) throw new Error('לא התקבלה תמונה');
      return res.data;
    });
  }

  // ימים עד תאריך היעד (שלילי = באיחור); null אם אין תאריך
  function daysToDue(iso) {
    if (!iso) return null;
    var d = new Date(iso + 'T00:00:00');
    if (isNaN(d)) return null;
    var today = new Date(); today.setHours(0, 0, 0, 0);
    return Math.round((d - today) / 86400000);
  }

  // נסיעות מרכז למידה — אוטומטי: ק"מ מכרטיס העובד × מספר ימים שונים (תאריכים ייחודיים) × תעריף
  function lcAutoTravel(month, empId) {
    var emp = empById(empId);
    var km = emp ? (parseFloat(emp.travelKm) || 0) : 0;
    var dates = {};
    records('lc', month, function (r) { return r.empId === empId; }).forEach(function (r) {
      if (r.date) dates[r.date] = 1;
    });
    var days = Object.keys(dates).length;
    var rate = data.core.settings.kmRate || 0;
    return { km: km, days: days, rate: rate, pay: km * days * rate };
  }

  // נסיעות מרכז למידה (פר מתגבר) — נשמר לתאימות לאחור; כבר לא בשימוש (נסיעות אוטומטיות)
  function lcTravel(month, empId) {
    var row = monthRow('lc', month, false);
    return (row && row.travel && row.travel[empId]) || null;
  }
  function setLcTravel(month, empId, km, days) {
    var row = monthRow('lc', month, true);
    if (!row.travel) row.travel = {};
    row.travel[empId] = { km: km, days: days, at: nowISO(), by: myName() };
    saveMonth('lc', month);
  }

  // לוח סטטוס חודשי
  function pstatEntry(month, empId) {
    var row = monthRow('pstat', month, false);
    return (row && row.entries && row.entries[empId]) || null;
  }
  function setPstat(month, empId, patch) {
    var row = monthRow('pstat', month, true);
    var cur = row.entries[empId] || {};
    for (var k in patch) cur[k] = patch[k];
    cur.at = nowISO();
    cur.by = myName();
    row.entries[empId] = cur;
    saveMonth('pstat', month);
    return cur;
  }

  // חודשים שקיימים בנתונים (מכל הסוגים) — לבורר החודשים
  function knownMonths() {
    var set = {};
    Object.keys(MONTH_KINDS).forEach(function (kind) {
      Object.keys(data[kind] || {}).forEach(function (m) { set[m] = 1; });
    });
    var now = new Date();
    set[now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0')] = 1;
    return Object.keys(set).sort().reverse();
  }

  // ---------- דיווחי פורטל (admin_submissions) ----------
  var submissionsCache = null;
  var subsListeners = [];
  function onSubmissions(fn) { if (subsListeners.indexOf(fn) === -1) subsListeners.push(fn); }
  function offSubmissions(fn) { subsListeners = subsListeners.filter(function (f) { return f !== fn; }); }
  function loadSubmissions() {
    if (!sb) return Promise.resolve([]);
    return sb.from(SUB_TABLE).select('*').order('created_at', { ascending: false })
      .then(function (res) {
        if (res.error) { console.error('loadSubmissions', res.error); return submissionsCache || []; }
        submissionsCache = res.data || [];
        subsListeners.forEach(function (fn) { try { fn(submissionsCache); } catch (e) { console.error(e); } });
        return submissionsCache;
      });
  }
  function submissions() { return submissionsCache; }
  function pendingCount() {
    return (submissionsCache || []).filter(function (s) { return s.status === 'pending'; }).length;
  }
  function updateSubmission(id, patch) {
    if (!sb) return Promise.reject(new Error('אין חיבור לענן'));
    patch.handled_by = myName();
    patch.handled_at = nowISO();
    return sb.from(SUB_TABLE).update(patch).eq('id', id).then(function (res) {
      if (res.error) throw res.error;
      submissionsCache = null;
      return loadSubmissions();
    });
  }
  // שם קובץ ל-Storage: אותיות לטיניות/ספרות בלבד.
  // Supabase דוחה מפתח עם תווים בעברית ("Invalid key") — לכן שם עברי הופך ל-'file'.
  function storageName(orig, forceJpeg) {
    var name = String(orig || 'file');
    var ext = forceJpeg ? '.jpg' : ((name.match(/\.[A-Za-z0-9]{1,8}$/) || [''])[0].toLowerCase() || '');
    var base = name.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-_.]+|[-_.]+$/g, '').slice(0, 40);
    return (base || 'file') + ext;
  }

  // העלאת קובץ אישור מתוך האפליקציה (כשהמסמך הגיע אחרי הדיווח) — מחזיר את הנתיב שנשמר
  function uploadApproval(file) {
    if (!sb) return Promise.reject(new Error('אין חיבור לענן'));
    if (!file) return Promise.reject(new Error('לא נבחר קובץ'));
    return U.shrinkImage(file).then(function (blob) {
      var isJpeg = blob !== file;
      var path = nowISO().slice(0, 7) + '/' + Date.now().toString(36) + '_' + storageName(file.name, isJpeg);
      var opt = isJpeg ? { contentType: 'image/jpeg' } : (file.type ? { contentType: file.type } : undefined);
      return sb.storage.from(BUCKET).upload(path, blob, opt).then(function (res) {
        if (res && res.error) throw new Error(res.error.message);
        return path;
      });
    });
  }
  function approvalFileUrl(path) {
    if (!sb || !path) return Promise.resolve(null);
    return sb.storage.from(BUCKET).createSignedUrl(path, 3600).then(function (res) {
      if (res.error) { console.error('signedUrl', res.error); return null; }
      return res.data && res.data.signedUrl;
    });
  }

  // ---------- רשימות כיתה (למעקב אישורי הורים) ----------
  function classesAll() { return (data.core.settings.classes || []).slice(); }
  function classByName(name) {
    return (data.core.settings.classes || []).filter(function (c) { return c.name === name; })[0] || null;
  }
  function saveClasses() { save('core'); }

  // ---------- אישורי הורים (פורטל ציבורי) ----------
  // publishConsentForm — כותב לשורת 'consent_forms' (אנונימית-לקריאה) את פרטי הטופס הפתוח
  function publishConsentForm(form) {
    if (!sb) return Promise.reject(new Error('נדרשת התחברות לענן'));
    return sb.from(TABLE).select('data').eq('id', 'consent_forms').maybeSingle().then(function (res) {
      var cur = (res.data && res.data.data && res.data.data.forms) || {};
      cur[form.eventId] = form;
      return sb.from(TABLE).upsert({ id: 'consent_forms', data: { forms: cur, updatedAt: nowISO() }, updated_at: nowISO() });
    }).then(function (res) { if (res && res.error) throw res.error; return true; });
  }
  function closeConsentForm(eventId) {
    if (!sb) return Promise.reject(new Error('נדרשת התחברות לענן'));
    return sb.from(TABLE).select('data').eq('id', 'consent_forms').maybeSingle().then(function (res) {
      var cur = (res.data && res.data.data && res.data.data.forms) || {};
      if (cur[eventId]) cur[eventId].open = false;
      return sb.from(TABLE).upsert({ id: 'consent_forms', data: { forms: cur, updatedAt: nowISO() }, updated_at: nowISO() });
    }).then(function (res) { if (res && res.error) throw res.error; return true; });
  }
  // fetchConsents — כל אישורי ההורים (מחוברים בלבד); ניתן לסנן לפי אירוע
  function fetchConsents(eventId) {
    if (!sb) return Promise.resolve([]);
    var q = sb.from(CONSENT_TABLE).select('*').order('created_at', { ascending: true });
    if (eventId) q = q.eq('event_id', eventId);
    return q.then(function (res) {
      if (res.error) { console.error('fetchConsents', res.error); return []; }
      return res.data || [];
    });
  }
  function deleteConsent(id) {
    if (!sb) return Promise.reject(new Error('אין חיבור לענן'));
    return sb.from(CONSENT_TABLE).delete().eq('id', id).then(function (res) {
      if (res.error) throw res.error; return true;
    });
  }

  // ---------- גיבוי/שחזור ----------
  function exportJSON() {
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'גיבוי-תפעול-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function replaceAll(obj) {
    data = obj;
    var def = defaultData();
    for (var k in def) { if (!(k in data)) data[k] = def[k]; }
    ensureCoreFields(data.core);
    persistLocal();
  }
  function importJSONFile(file, cb) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        replaceAll(JSON.parse(reader.result));
        saveAllRows();
        cb && cb(null);
      } catch (e) { cb && cb(e); }
    };
    reader.onerror = function () { cb && cb(reader.error); };
    reader.readAsText(file);
  }
  function saveAllRows() { allRowIds().forEach(function (id) { save(id); }); }

  var statusEl = null;
  function setStatus(msg) {
    if (!statusEl) statusEl = document.getElementById('saveStatus');
    if (!statusEl) return;
    statusEl.innerHTML = '';
    var span = document.createElement('span');
    span.className = 'flash';
    span.textContent = msg;
    statusEl.appendChild(span);
  }

  // ---------- ענן: התחברות ואתחול ----------
  function cloudStart(cb) {
    var overlay = document.getElementById('loginOverlay');
    if (overlay) overlay.style.display = 'none';
    cloudLoadAll().then(function (rows) {
      if (rows) {
        var seen = {};
        rows.forEach(function (r) { seen[r.id] = true; mergeIncoming(r.id, r.data, true); });
        allRowIds().forEach(function (id) { if (!seen[id]) scheduleCloudSave(id); });
        if (!seen.core) scheduleCloudSave('core');
        persistLocal();
      }
      subscribeRealtime();
      loadSubmissions();
      updateUserBar();
      setStatus('מחובר לענן');
      cb && cb(true);
      if (pendingRecovery) { pendingRecovery = false; setTimeout(openNewPasswordDialog, 400); }
    });
  }

  function openNewPasswordDialog() {
    var U = global.U, Modal = global.Modal;
    if (!U || !Modal) return;
    var p1 = U.el('input', { type: 'password', placeholder: 'סיסמה חדשה (6 תווים לפחות)', autocomplete: 'new-password', style: 'width:100%;' });
    var p2 = U.el('input', { type: 'password', placeholder: 'אימות הסיסמה', autocomplete: 'new-password', style: 'width:100%;' });
    var err = U.el('div', { class: 'login-err', style: 'min-height:18px;' });
    Modal.open('בחירת סיסמה חדשה', U.el('div', null, [
      U.el('p', { class: 'muted', style: 'margin-top:0;', text: 'נכנסתם דרך קישור איפוס הסיסמה. בחרו סיסמה חדשה לחשבון.' }),
      U.el('div', { class: 'field' }, [p1]),
      U.el('div', { class: 'field' }, [p2]),
      err
    ]), [
      { label: 'ביטול', class: 'secondary' },
      { label: 'שמירת סיסמה', onClick: function (close) {
        var v1 = p1.value || '', v2 = p2.value || '';
        if (v1.length < 6) { err.textContent = 'הסיסמה חייבת להכיל לפחות 6 תווים'; p1.focus(); return; }
        if (v1 !== v2) { err.textContent = 'הסיסמאות אינן זהות'; p2.focus(); return; }
        err.textContent = '';
        sb.auth.updateUser({ password: v1 }).then(function (res) {
          if (res.error) { err.textContent = 'שמירת הסיסמה נכשלה — נסו שוב'; return; }
          close();
          global.U.toast('הסיסמה עודכנה בהצלחה');
        });
      } }
    ]);
  }

  function showLogin(cb) {
    var overlay = document.getElementById('loginOverlay');
    if (overlay) overlay.style.display = 'flex';
    var btn = document.getElementById('loginBtn');
    var emailEl = document.getElementById('loginEmail');
    var passEl = document.getElementById('loginPass');
    var errEl = document.getElementById('loginErr');
    function doLogin() {
      var email = (emailEl.value || '').trim(), pass = passEl.value || '';
      if (!email || !pass) { if (errEl) errEl.textContent = 'נא למלא אימייל וסיסמה'; return; }
      if (errEl) errEl.textContent = '';
      if (btn) { btn.disabled = true; btn.innerHTML = '<span class="btn-spin"></span>מתחבר…'; }
      sb.auth.signInWithPassword({ email: email, password: pass }).then(function (res) {
        if (btn) { btn.disabled = false; btn.textContent = 'כניסה'; }
        if (res.error) { if (errEl) errEl.textContent = 'אימייל או סיסמה שגויים — נסו שוב'; if (passEl) { passEl.value = ''; passEl.focus(); } return; }
        setSessionUser(res.data && res.data.user);
        cloudStart(cb);
      });
    }
    if (btn) btn.onclick = doLogin;
    var forgot = document.getElementById('forgotBtn');
    if (forgot) forgot.onclick = function () {
      var email = (emailEl.value || '').trim();
      if (!email) {
        if (errEl) { errEl.classList.remove('ok'); errEl.textContent = 'מלאו את האימייל למעלה ואז לחצו שוב על "שכחתי סיסמה"'; }
        emailEl.focus(); return;
      }
      forgot.disabled = true; forgot.textContent = 'שולח…';
      sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }).then(function (res) {
        forgot.disabled = false; forgot.textContent = 'שכחתי סיסמה';
        if (!errEl) return;
        if (res.error) { errEl.classList.remove('ok'); errEl.textContent = 'שליחת המייל נכשלה — נסו שוב בעוד רגע'; return; }
        errEl.classList.add('ok');
        errEl.textContent = 'נשלח מייל עם קישור לאיפוס — בדקו את תיבת הדואר (גם בספאם)';
      });
    };
    if (passEl) passEl.onkeydown = function (e) { if (e.key === 'Enter') doLogin(); };
    if (emailEl) emailEl.onkeydown = function (e) { if (e.key === 'Enter') { passEl && passEl.focus(); } };
    var eye = document.getElementById('passEye');
    if (eye && passEl) eye.onclick = function () {
      var show = passEl.type === 'password';
      passEl.type = show ? 'text' : 'password';
      eye.textContent = show ? '🙈' : '👁️';
      passEl.focus();
    };
  }

  function escHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function updateUserBar() {
    if (!sb) return;
    sb.auth.getUser().then(function (r) {
      var u = r.data && r.data.user;
      var el = document.getElementById('headerSync');
      if (!el || !u) return;
      var email = u.email || '';
      var name = myName();
      var first = name.split(/\s+/)[0] || '?';
      var dark = document.body.classList.contains('dark');
      var ini = (name || '?').split(/\s+/).slice(0, 2).map(function (w) { return w.charAt(0); }).join('');
      el.innerHTML = '<button class="btn secondary ico" id="darkToggle" role="switch" aria-checked="' + dark + '"'
          + ' aria-label="מצב לילה" title="' + (dark ? 'מעבר למצב יום' : 'מעבר למצב לילה') + '">'
          + (dark ? U.ICO.sun : U.ICO.moon) + '</button>'
        + '<div class="usermenu">'
        + '<button class="user-chip" id="avatarBtn" aria-label="תפריט משתמש" title="' + escHtml(name) + ' · ' + escHtml(email) + '">'
          + '<span class="user-ini">' + escHtml(ini) + '</span>'
          + '<span class="user-nm">' + escHtml(first) + '</span>'
        + '</button>'
        + '<div class="usermenu-pop" id="userPop">'
          + '<div class="um-name">' + escHtml(name) + '</div>'
          + '<div class="um-email">' + escHtml(email) + '</div>'
          + '<div class="um-role">הרשאה: ' + escHtml(roleLabel(currentRole())) + '</div>'
          + '<button class="um-item um-logout" id="umLogout">' + U.ICO.logout + ' התנתקות</button>'
        + '</div></div>';
      var ab = document.getElementById('avatarBtn'), pop = document.getElementById('userPop');
      if (ab && pop) {
        ab.onclick = function (e) { e.stopPropagation(); pop.classList.toggle('open'); };
        document.addEventListener('click', function () { pop.classList.remove('open'); });
      }
      var lo = document.getElementById('umLogout'); if (lo) lo.onclick = doLogout;
      var dt = document.getElementById('darkToggle');
      if (dt) dt.onclick = function () {
        var on = document.body.classList.toggle('dark');
        try { localStorage.setItem('admin_dark', on ? '1' : '0'); } catch (e) {}
        dt.innerHTML = on ? U.ICO.sun : U.ICO.moon;
        dt.setAttribute('aria-checked', on ? 'true' : 'false');
        dt.title = on ? 'מעבר למצב יום' : 'מעבר למצב לילה';
      };
    }).catch(function () {});
  }
  function doLogout() { if (sb) sb.auth.signOut().then(function () { location.reload(); }); }

  function initPersistence(cb) {
    if (cloudMode) {
      sb.auth.getSession().then(function (r) {
        if (r.data && r.data.session) { setSessionUser(r.data.session.user); cloudStart(cb); }
        else showLogin(cb);
      }).catch(function () { showLogin(cb); });
      return;
    }
    cb && cb(false);
  }

  // ---------- חשיפה גלובלית ----------
  global.Store = {
    uid: uid,
    load: load,
    save: save,
    core: core,
    settings: settings,
    saveSettings: saveSettings,
    employees: employees,
    empById: empById,
    empName: empName,
    upsertEmployee: upsertEmployee,
    // שורות חודש
    monthRow: monthRow,
    saveMonth: saveMonth,
    upsertRecord: upsertRecord,
    deleteRecord: deleteRecord,
    records: records,
    lcTravel: lcTravel,
    setLcTravel: setLcTravel,
    lcAutoTravel: lcAutoTravel,
    pstatEntry: pstatEntry,
    setPstat: setPstat,
    knownMonths: knownMonths,
    // משימות
    tasksAll: tasksAll,
    taskById: taskById,
    upsertTask: upsertTask,
    addTasksBulk: addTasksBulk,
    setTaskStatus: setTaskStatus,
    deleteTask: deleteTask,
    daysToDue: daysToDue,
    // פרויקטים
    projectsAll: projectsAll,
    projectById: projectById,
    upsertProject: upsertProject,
    deleteProject: deleteProject,
    projectBudget: projectBudget,

    candidates: candidates,
    candidateById: candidateById,
    upsertCandidate: upsertCandidate,
    deleteCandidate: deleteCandidate,
    positions: positions,
    positionById: positionById,
    upsertPosition: upsertPosition,
    deletePosition: deletePosition,
    reorderPositions: reorderPositions,
    // אירועים וטיולים
    eventsAll: eventsAll,
    eventById: eventById,
    nextEventNum: nextEventNum,
    upsertEvent: upsertEvent,
    deleteEvent: deleteEvent,
    currentEmpId: currentEmpId,
    uploadMeetingAudio: uploadMeetingAudio,
    meetingToEvents: meetingToEvents,
    generateFlyer: generateFlyer,
    uploadTaskFile: uploadTaskFile,
    taskFileUrl: taskFileUrl,
    deleteTaskFile: deleteTaskFile,
    // רשימות כיתה ואישורי הורים
    classesAll: classesAll,
    classByName: classByName,
    saveClasses: saveClasses,
    publishConsentForm: publishConsentForm,
    closeConsentForm: closeConsentForm,
    fetchConsents: fetchConsents,
    deleteConsent: deleteConsent,
    // דיווחי פורטל
    loadSubmissions: loadSubmissions,
    submissions: submissions,
    pendingCount: pendingCount,
    updateSubmission: updateSubmission,
    // קולות קוראים
    // בטיחות ורישוי
    safetyAll: safetyAll,
    safetyById: safetyById,
    upsertSafety: upsertSafety,
    deleteSafety: deleteSafety,
    safetyExpiry: safetyExpiry,
    seedSafety: seedSafety,
    safetyGroups: safetyGroups,
    ensureLicenseRow: ensureLicenseRow,
    LICENSE_MAIN_NAME: LICENSE_MAIN_NAME,
    kkAll: kkAll,
    syncKkFromBudget: syncKkFromBudget,
    kkById: kkById,
    upsertKk: upsertKk,
    deleteKk: deleteKk,
    kkMoney: kkMoney,
    kkInvoicesFor: kkInvoicesFor,
    kkPendingInvoices: kkPendingInvoices,
    kkInvoiceDecisions: kkInvoiceDecisions,
    setKkInvoiceDecision: setKkInvoiceDecision,
    // גשר לאפליקציית התקציב
    budgetLoad: budgetLoad,
    budgetState: budgetState,
    budgetKkSubs: budgetKkSubs,
    budgetKkInvoices: budgetKkInvoices,
    budgetFiscalYear: budgetFiscalYear,
    budgetCategories: budgetCategories,
    budgetTransactions: budgetTransactions,
    budgetFyMonths: budgetFyMonths,
    budgetFyFraction: budgetFyFraction,
    budgetFyYears: budgetFyYears,
    budgetCategoriesFor: budgetCategoriesFor,
    budgetIsActiveFy: budgetIsActiveFy,
    budgetCurrentFy: budgetCurrentFy,
    budgetSubscribe: budgetSubscribe,
    budgetPatch: budgetPatch,
    budgetLoadError: budgetLoadError,
    approvalFileUrl: approvalFileUrl,
    uploadApproval: uploadApproval,
    onSubmissions: onSubmissions,
    offSubmissions: offSubmissions,
    // גיבוי
    exportJSON: exportJSON,
    importJSONFile: importJSONFile,
    replaceAll: replaceAll,
    saveAllRows: saveAllRows,
    defaultData: defaultData,
    // ענן והרשאות
    initPersistence: initPersistence,
    setStatus: setStatus,
    isAdmin: isAdmin,
    currentRole: currentRole,
    roleLabel: roleLabel,
    myName: myName,
    currentEmail: currentEmail,
    flushPendingRemote: flushPendingRemote,
    publishPortal: publishPortal,
    roleOf: roleOf,
    setUserRole: setUserRole,
    manageUsers: manageUsers,
    manageUsersDiagnose: manageUsersDiagnose,
    ROLES: ROLES,
    ADMIN_EMAILS: ADMIN_EMAILS
  };
})(window);
