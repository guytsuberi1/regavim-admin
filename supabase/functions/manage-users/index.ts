// Supabase Edge Function: manage-users
// ניהול חשבונות התחברות לאנשי צוות: רשימה / יצירה / איפוס סיסמה / מחיקה.
// משתמש ב-SERVICE_ROLE_KEY (הרשאות-על) ולכן מאמת שהקורא הוא אדמין מורשה.
// Secrets אופציונליים: ADMIN_EMAILS (מיילים מופרדים בפסיקים). אם לא מוגדר — נופלים לרשימה הקשיחה.
// ייבוא דרך npm: ולא דרך esm.sh — esm.sh נמשך מהרשת בכל cold start,
// וכשהוא מגמגם הפונקציה נופלת בהפעלה ומחזירה שגיאה בלי כותרות CORS,
// שנראית בדפדפן בדיוק כמו "הפונקציה לא פרוסה".
import { createClient } from "npm:@supabase/supabase-js@2";

// שני האתרים משתמשים באותה פונקציה (אותו פרויקט Supabase, אותם אנשים):
// אפליקציית החקלאות ואפליקציית התפעול (regavim-admin).
const ALLOWED_ORIGINS = [
  "https://chaklaut.rgvb.org.il",
  "https://guytsuberi1.github.io",
];
function corsFor(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

const FALLBACK_ADMINS = [
  "guy@rgvb.org.il", "misrad@rgvb.org.il", "shlomohass34@gmail.com",
  "guytsuberi1@gmail.com",
];

Deno.serve(async (req) => {
  const cors = corsFor(req);
  const reply = (obj: unknown, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "method not allowed" }, 405);

  const URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (!SERVICE) return reply({ error: "missing service role key" }, 500);

  // --- אימות: הקורא חייב להיות אדמין מורשה ---
  let callerEmail = "";
  try {
    const asCaller = createClient(URL, ANON, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await asCaller.auth.getUser();
    callerEmail = (user?.email ?? "").toLowerCase();
  } catch {
    return reply({ error: "unauthorized" }, 401);
  }
  if (!callerEmail) return reply({ error: "unauthorized" }, 401);

  const envAdmins = (Deno.env.get("ADMIN_EMAILS") ?? "")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const admins = envAdmins.length ? envAdmins : FALLBACK_ADMINS;
  if (!admins.includes(callerEmail)) return reply({ error: "forbidden — admins only" }, 403);

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
      return reply({ users: all });
    }

    if (action === "create") {
      if (!email) return reply({ error: "חסר אימייל" }, 400);
      if (password.length < 6) return reply({ error: "סיסמה חייבת לפחות 6 תווים" }, 400);
      const { data, error } = await admin.createUser({ email, password, email_confirm: true });
      if (error) return reply({ error: error.message }, 400);
      return reply({ ok: true, user: { id: data.user?.id, email: data.user?.email } });
    }

    if (action === "resetPassword") {
      if (!email) return reply({ error: "חסר אימייל" }, 400);
      if (password.length < 6) return reply({ error: "סיסמה חייבת לפחות 6 תווים" }, 400);
      const u = await findByEmail(email);
      if (!u) return reply({ error: "לא נמצא חשבון עם אימייל זה" }, 404);
      const { error } = await admin.updateUserById(u.id, { password });
      if (error) return reply({ error: error.message }, 400);
      return reply({ ok: true });
    }

    if (action === "delete") {
      if (!email) return reply({ error: "חסר אימייל" }, 400);
      const u = await findByEmail(email);
      if (!u) return reply({ error: "לא נמצא חשבון עם אימייל זה" }, 404);
      const { error } = await admin.deleteUser(u.id);
      if (error) return reply({ error: error.message }, 400);
      return reply({ ok: true });
    }

    return reply({ error: "unknown action" }, 400);
  } catch (e) {
    return reply({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
