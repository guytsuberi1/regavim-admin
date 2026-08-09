// Supabase Edge Function: manage-users
// ניהול חשבונות התחברות לאנשי צוות: רשימה / יצירה / איפוס סיסמה / מחיקה.
// משתמש ב-SERVICE_ROLE_KEY (הרשאות-על) ולכן מאמת שהקורא הוא אדמין מורשה.
// Secrets אופציונליים: ADMIN_EMAILS (מיילים מופרדים בפסיקים). אם לא מוגדר — נופלים לרשימה הקשיחה.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// כתובות מורשות — לפי תבנית ולא לפי רשימה, כדי שהקמת מוסד חדש לא תדרוש נגיעה כאן.
// הדומיין chaklaut.co.il כולו שלנו, ולכן כל תת-דומיין שלו הוא מוסד שלנו.
// הביטויים נעולים בשני הקצוות (^...$) — "chaklaut.co.il.evil.com" ו-"evil-chaklaut.co.il"
// לא תואמים. אין להחליף ב-includes/startsWith: כך בדיוק נפרצות בדיקות מקור.
const ORIGIN_PATTERNS = [
  /^https:\/\/[a-z0-9-]+\.chaklaut\.co\.il$/,               // מוסד: rgvb.chaklaut.co.il וכו'
  /^https:\/\/([a-z0-9-]+\.)?chaklaut\.pages\.dev$/,         // Cloudflare: ייצור + תצוגות מקדימות
  /^https:\/\/guytsuberi1\.github\.io$/,                     // אפליקציית התפעול (GitHub Pages)
];
const DEFAULT_ORIGIN = "https://rgvb.chaklaut.co.il";

function corsFor(req: Request) {
  // הדפדפן שולח origin באותיות קטנות, אבל לא סומכים על זה
  const o = (req.headers.get("origin") ?? "").toLowerCase();
  const ok = ORIGIN_PATTERNS.some((re) => re.test(o));
  return {
    // מחזירים את המקור רק אם הוא תואם; אחרת ערך שלא תואם — והדפדפן יחסום
    "Access-Control-Allow-Origin": ok ? o : DEFAULT_ORIGIN,
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

// אפשר לעקוף עם Secret בשם ADMIN_EMAILS (מיילים מופרדים בפסיקים)
const FALLBACK_ADMINS = [
  "guy@rgvb.org.il", "misrad@rgvb.org.il", "shlomohass34@gmail.com",
  "guytsuberi1@gmail.com",
];

function reply(req: Request, obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsFor(req), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsFor(req) });
  if (req.method !== "POST") return reply(req, { error: "method not allowed" }, 405);

  const URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (!SERVICE) return reply(req, { error: "missing service role key" }, 500);

  // --- אימות: הקורא חייב להיות אדמין מורשה ---
  let callerEmail = "";
  try {
    const asCaller = createClient(URL, ANON, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await asCaller.auth.getUser();
    callerEmail = (user?.email ?? "").toLowerCase();
  } catch {
    return reply(req, { error: "unauthorized" }, 401);
  }
  if (!callerEmail) return reply(req, { error: "unauthorized" }, 401);

  const envAdmins = (Deno.env.get("ADMIN_EMAILS") ?? "")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const admins = envAdmins.length ? envAdmins : FALLBACK_ADMINS;
  if (!admins.includes(callerEmail)) return reply(req, { error: "forbidden — admins only" }, 403);

  // --- לקוח הרשאות-על ---
  const admin = createClient(URL, SERVICE, {
    auth: { autoRefreshToken: false, persistSession: false },
  }).auth.admin;

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const action = String(body.action ?? "");
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  async function findByEmail(em: string) {
    // listUsers ממופה לפי עמודים; מחפשים את המייל לאורך העמודים.
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await admin.listUsers({ page, perPage: 200 });
      if (error) throw error;
      const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === em);
      if (hit) return hit;
      if (data.users.length < 200) break;
    }
    return null;
  }

  try {
    if (action === "list") {
      const all: { id: string; email: string | undefined }[] = [];
      for (let page = 1; page <= 20; page++) {
        const { data, error } = await admin.listUsers({ page, perPage: 200 });
        if (error) throw error;
        data.users.forEach((u) => all.push({ id: u.id, email: u.email }));
        if (data.users.length < 200) break;
      }
      return reply(req, { users: all });
    }

    if (action === "create") {
      if (!email) return reply(req, { error: "חסר אימייל" }, 400);
      if (password.length < 6) return reply(req, { error: "סיסמה חייבת לפחות 6 תווים" }, 400);
      const { data, error } = await admin.createUser({ email, password, email_confirm: true });
      if (error) return reply(req, { error: error.message }, 400);
      return reply(req, { ok: true, user: { id: data.user?.id, email: data.user?.email } });
    }

    if (action === "resetPassword") {
      if (!email) return reply(req, { error: "חסר אימייל" }, 400);
      if (password.length < 6) return reply(req, { error: "סיסמה חייבת לפחות 6 תווים" }, 400);
      const u = await findByEmail(email);
      if (!u) return reply(req, { error: "לא נמצא חשבון עם אימייל זה" }, 404);
      const { error } = await admin.updateUserById(u.id, { password });
      if (error) return reply(req, { error: error.message }, 400);
      return reply(req, { ok: true });
    }

    if (action === "delete") {
      if (!email) return reply(req, { error: "חסר אימייל" }, 400);
      const u = await findByEmail(email);
      if (!u) return reply(req, { error: "לא נמצא חשבון עם אימייל זה" }, 404);
      const { error } = await admin.deleteUser(u.id);
      if (error) return reply(req, { error: error.message }, 400);
      return reply(req, { ok: true });
    }

    return reply(req, { error: "unknown action" }, 400);
  } catch (e) {
    return reply(req, { error: String((e as Error)?.message ?? e) }, 500);
  }
});
