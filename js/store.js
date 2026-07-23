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
        eventRoles: defaultEventRoles(),
        taskCatalog: defaultTaskCatalog(),
        eventTypes: defaultEventTypes()
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
    var p = rowId.split(':');
    if (MONTH_KINDS[p[0]] && p[1]) data[p[0]][p[1]] = obj;
  }
  function allRowIds() {
    var ids = ['core', 'tasks', 'projects', 'recruit', 'events'];
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
  // admin=גיא (הכל) · secretary=מזכירה (מרכז למידה) — ברירת מחדל לעובד לא מוכר: secretary
  function roleOf(email) {
    email = String(email || '').toLowerCase();
    if (!email) return 'secretary';
    if (ADMIN_EMAILS.indexOf(email) !== -1) return 'admin';
    var s = empByEmail(email);
    if (s && (s.role === 'admin' || s.role === 'secretary')) return s.role;
    return 'secretary';
  }
  function currentRole() {
    if (!cloudMode) return 'admin'; // מצב מקומי (פיתוח בלבד)
    return sessionUser ? roleOf(currentEmail()) : 'secretary';
  }
  function isAdmin() { return currentRole() === 'admin'; }
  function roleLabel(r) { return { admin: 'מנהל', secretary: 'מזכירות' }[r] || r; }
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

    if (rowId === 'tasks' || rowId === 'projects' || rowId === 'events') {
      var mt = {
        records: mergeRecords(local && local.records, incoming.records),
        seq: Math.max((local && local.seq) || 0, incoming.seq || 0),
        meta: metaTs(local) >= metaTs(incoming) ? (local && local.meta) || incoming.meta : incoming.meta
      };
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
    return arr;
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
  // מסלול AI: שולח טקסט/הקלטה של פגישה ל-Edge Function (Gemini) ומחזיר טיוטת אירועים
  function meetingToEvents(payload) {
    if (!sb) return Promise.reject(new Error('נדרשת התחברות לענן'));
    return sb.functions.invoke('meeting-to-events', { body: payload }).then(function (res) {
      if (res.error) throw new Error(res.error.message || 'שגיאה מהשרת');
      if (res.data && res.data.error) throw new Error(res.data.error);
      return (res.data && res.data.events) || [];
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
  function approvalFileUrl(path) {
    if (!sb || !path) return Promise.resolve(null);
    return sb.storage.from(BUCKET).createSignedUrl(path, 3600).then(function (res) {
      if (res.error) { console.error('signedUrl', res.error); return null; }
      return res.data && res.data.signedUrl;
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
    Modal.open('🔑 בחירת סיסמה חדשה', U.el('div', null, [
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
        errEl.textContent = '✓ נשלח מייל עם קישור לאיפוס — בדקו את תיבת הדואר (גם בספאם)';
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
      el.innerHTML = '<button class="mode-switch' + (dark ? ' on' : '') + '" id="darkToggle" role="switch" aria-checked="' + dark + '" aria-label="מצב לילה" title="' + (dark ? 'מעבר למצב יום' : 'מעבר למצב לילה') + '">'
          + '<span class="ms-ico ms-sun">☀️</span><span class="ms-ico ms-moon">🌙</span><span class="ms-knob"></span></button>'
        + '<div class="usermenu">'
        + '<button class="avatar" id="avatarBtn" aria-label="תפריט משתמש" title="' + escHtml(name) + ' · ' + escHtml(email) + '">' + escHtml(first) + '</button>'
        + '<div class="usermenu-pop" id="userPop">'
          + '<div class="um-name">' + escHtml(name) + '</div>'
          + '<div class="um-email">' + escHtml(email) + '</div>'
          + '<div class="um-role">הרשאה: ' + escHtml(roleLabel(currentRole())) + '</div>'
          + '<button class="um-item um-logout" id="umLogout">↩️ התנתקות</button>'
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
        dt.classList.toggle('on', on);
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
    // אירועים וטיולים
    eventsAll: eventsAll,
    eventById: eventById,
    nextEventNum: nextEventNum,
    upsertEvent: upsertEvent,
    deleteEvent: deleteEvent,
    currentEmpId: currentEmpId,
    uploadMeetingAudio: uploadMeetingAudio,
    meetingToEvents: meetingToEvents,
    // דיווחי פורטל
    loadSubmissions: loadSubmissions,
    submissions: submissions,
    pendingCount: pendingCount,
    updateSubmission: updateSubmission,
    approvalFileUrl: approvalFileUrl,
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
    ADMIN_EMAILS: ADMIN_EMAILS
  };
})(window);
