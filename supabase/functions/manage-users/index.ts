// Supabase Edge Function: manage-users
// ניהול חשבונות התחברות לאנשי צוות: רשימה / יצירה / איפוס סיסמה / מחיקה.
// משתמש ב-SERVICE_ROLE_KEY (הרשאות-על) ולכן מאמת שהקורא הוא אדמין מורשה.
//
// ---- בלי אף ייבוא חיצוני ----
// גרסאות קודמות ייבאו את supabase-js מ-esm.sh או מ-npm:. כל ייבוא כזה נמשך
// בהפעלה קרה של הפונקציה, וכשהוא נכשל הפונקציה לא עולה בכלל ומחזירה שגיאה
// בלי כותרות CORS — שנראית בדפדפן בדיוק כמו "הפונקציה לא פרוסה".
// כאן פונים ישירות ל-Auth REST API עם fetch, שמובנה ב-Deno. אין מה שיכול
// להיכשל בהפעלה, והפונקציה עולה תמיד.

const ALLOWED_ORIGINS = [
  "https://chaklaut.rgvb.org.il",
  "https://guytsuberi1.github.io",
];
function corsFor(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  return {
    // מקור לא מוכר מקבל בכל זאת כותרת CORS תקינה, כדי שהדפדפן יוכל להציג
    // את הודעת השגיאה האמיתית במקום "failed to fetch" סתום.
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : "*",
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

const FALLBACK_ADMINS = [
  "guy@rgvb.org.il", "misrad@rgvb.org.il", "shlomohass34@gmail.com",
  "guytsuberi1@gmail.com",
];

Deno.serve(async (req: Request) => {
  const cors = corsFor(req);
  const reply = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const BASE = Deno.env.get("SUPABASE_URL") ?? "";
  const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  // בדיקת חיים — פתיחת הכתובת בדפדפן מראה מיד אם הפונקציה פרוסה ומה חסר לה
  if (req.method === "GET") {
    return reply({
      ok: true, fn: "manage-users",
      env: { url: !!BASE, anon: !!ANON, service: !!SERVICE },
      hint: "הפונקציה פרוסה ורצה. פעולות אמיתיות נעשות ב-POST מתוך האפליקציה.",
    });
  }
  if (req.method !== "POST") return reply({ error: "method not allowed" }, 405);
  if (!BASE || !SERVICE) return reply({ error: "missing service role key" }, 500);

  const adminHeaders = {
    apikey: SERVICE,
    Authorization: `Bearer ${SERVICE}`,
    "Content-Type": "application/json",
  };

  // --- אימות: הקורא חייב להיות אדמין מורשה ---
  let callerEmail = "";
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const who = await fetch(`${BASE}/auth/v1/user`, { headers: { apikey: ANON, Authorization: auth } });
    if (who.ok) {
      const u = await who.json();
      callerEmail = String(u?.email ?? "").toLowerCase();
    }
  } catch { /* נטפל למטה */ }
  if (!callerEmail) return reply({ error: "unauthorized" }, 401);

  const envAdmins = (Deno.env.get("ADMIN_EMAILS") ?? "")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const admins = envAdmins.length ? envAdmins : FALLBACK_ADMINS;
  if (!admins.includes(callerEmail)) return reply({ error: "forbidden — admins only" }, 403);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const action = String(body.action ?? "");
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  // Auth REST מחזיר עמודים; אוספים עד שהעמוד חלקי
  async function listAll() {
    const all: { id: string; email: string | undefined }[] = [];
    for (let page = 1; page <= 20; page++) {
      const r = await fetch(`${BASE}/auth/v1/admin/users?page=${page}&per_page=200`, { headers: adminHeaders });
      if (!r.ok) throw new Error(`list failed (${r.status}): ${await r.text()}`);
      const j = await r.json();
      const users = j?.users ?? [];
      users.forEach((u: { id: string; email?: string }) => all.push({ id: u.id, email: u.email }));
      if (users.length < 200) break;
    }
    return all;
  }
  async function findByEmail(em: string) {
    return (await listAll()).find((u) => (u.email ?? "").toLowerCase() === em) ?? null;
  }

  try {
    if (action === "list") return reply({ users: await listAll() });

    if (action === "create") {
      if (!email) return reply({ error: "חסר אימייל" }, 400);
      if (password.length < 6) return reply({ error: "סיסמה חייבת לפחות 6 תווים" }, 400);
      const r = await fetch(`${BASE}/auth/v1/admin/users`, {
        method: "POST", headers: adminHeaders,
        body: JSON.stringify({ email, password, email_confirm: true }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return reply({ error: j?.msg ?? j?.message ?? `יצירת החשבון נכשלה (${r.status})` }, 400);
      return reply({ ok: true, user: { id: j?.id, email: j?.email } });
    }

    if (action === "resetPassword") {
      if (!email) return reply({ error: "חסר אימייל" }, 400);
      if (password.length < 6) return reply({ error: "סיסמה חייבת לפחות 6 תווים" }, 400);
      const u = await findByEmail(email);
      if (!u) return reply({ error: "לא נמצא חשבון עם אימייל זה" }, 404);
      const r = await fetch(`${BASE}/auth/v1/admin/users/${u.id}`, {
        method: "PUT", headers: adminHeaders, body: JSON.stringify({ password }),
      });
      if (!r.ok) return reply({ error: `איפוס הסיסמה נכשל (${r.status}): ${await r.text()}` }, 400);
      return reply({ ok: true });
    }

    if (action === "delete") {
      if (!email) return reply({ error: "חסר אימייל" }, 400);
      const u = await findByEmail(email);
      if (!u) return reply({ error: "לא נמצא חשבון עם אימייל זה" }, 404);
      const r = await fetch(`${BASE}/auth/v1/admin/users/${u.id}`, { method: "DELETE", headers: adminHeaders });
      if (!r.ok) return reply({ error: `מחיקת החשבון נכשלה (${r.status}): ${await r.text()}` }, 400);
      return reply({ ok: true });
    }

    if (action === "ping") return reply({ ok: true, caller: callerEmail });

    return reply({ error: "unknown action" }, 400);
  } catch (e) {
    return reply({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
