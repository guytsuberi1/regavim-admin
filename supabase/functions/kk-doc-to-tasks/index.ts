// kk-doc-to-tasks — Edge Function (Deno) לאפליקציית התפעול (regavim-admin)
//
// מקבל את המסמך הרשמי של קול קורא (PDF / Word / תמונה) שנשמר ב-Supabase Storage,
// שולח אותו ל-Google Gemini, ומחזיר שתי רשימות משימות מובנות — להגשה ולדיווח —
// כשלכל משימה טקסט עזרה ושם הטופס הנדרש. התוצאה היא טיוטה שגיא מאשר בדפדפן.
//
// פריסה (חד-פעמי):
//   supabase functions deploy kk-doc-to-tasks
// הסוד GEMINI_KEY_ADMIN כבר מוגדר בפרויקט (משותף עם meeting-to-events ו-event-flyer).
//
// אבטחה: Supabase מאמת JWT אוטומטית, כך שרק משתמש מחובר יכול לקרוא.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GEMINI_KEY = Deno.env.get("GEMINI_KEY_ADMIN") || "";
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-2.0-flash";
// מוזרקים אוטומטית ע"י Supabase — לשליפת המסמך מ-Storage בצד השרת
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supa = createClient(SUPABASE_URL, SERVICE_KEY);

// אתר התפעול ואתר החקלאות — כל מקור אחר נחסם ע"י הדפדפן עם הודעה מטעה
// ("Failed to send a request to the Edge Function"), ולכן הרשימה כאן חשובה.
const ORIGIN_PATTERNS = [
  /^https:\/\/guytsuberi1\.github\.io$/,
  /^https:\/\/([a-z0-9-]+\.)?regavim-tiful\.pages\.dev$/,
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
];
function corsFor(origin: string) {
  const ok = ORIGIN_PATTERNS.some((re) => re.test(origin || ""));
  return {
    "Access-Control-Allow-Origin": ok ? origin : "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

// סכמה שמכריחה את Gemini להחזיר בדיוק את המבנה שלנו
const TASK_ITEM = {
  type: "object",
  properties: {
    title: { type: "string", description: "המשימה בשורה אחת, בלשון פעולה" },
    help: { type: "string", description: "הסבר קצר: מה בדיוק צריך לעשות, מאיפה מביאים, מי חותם" },
    form: { type: "string", description: "שם הטופס/המסמך שצריך לצרף, אם המסמך נוקב בו. אחרת ריק" },
    link: { type: "string", description: "כתובת URL מלאה שמופיעה במסמך ורלוונטית למשימה. אחרת ריק" },
  },
  required: ["title"],
};
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", description: "משפט-שניים: על מה הקול הקורא ומי מפרסם" },
    funder: { type: "string", description: "הגוף המממן, אם מופיע במסמך" },
    deadline: { type: "string", description: "מועד ההגשה האחרון בפורמט YYYY-MM-DD, אם מופיע" },
    reportDeadline: { type: "string", description: "מועד הדיווח האחרון בפורמט YYYY-MM-DD, אם מופיע" },
    submit: { type: "array", items: TASK_ITEM, description: "כל מה שצריך לעשות כדי להגיש" },
    report: { type: "array", items: TASK_ITEM, description: "כל מה שצריך לעשות כדי לדווח בסוף" },
  },
  required: ["submit", "report"],
};

function buildPrompt(ctx: any): string {
  return [
    "אתה עוזר של מנהלן ישיבת רגבים בנימין (מוסד חינוכי בישראל).",
    "לפניך המסמך הרשמי של קול קורא. המשימה: להפוך אותו לשתי רשימות פעולה מעשיות —",
    "אחת לשלב ההגשה ואחת לשלב הדיווח בסוף — בדיוק לפי מה שכתוב במסמך.",
    "",
    ctx?.name ? "שם הקול הקורא אצלנו: " + ctx.name : "",
    ctx?.funder ? "הגוף המממן לפי הרישום אצלנו: " + ctx.funder : "",
    ctx?.today ? "היום הוא " + ctx.today + "." : "",
    "",
    "כללים:",
    "- כל משימה היא פעולה אחת שאפשר לסמן כבוצעה. לא כותרת כללית ולא ציטוט מהמסמך.",
    "- סדר את המשימות בסדר שבו באמת מבצעים אותן.",
    "- כל אישור/טופס/נספח שהמסמך דורש = משימה נפרדת, ושמו המדויק בשדה form.",
    "- כתובת אינטרנט שמופיעה במסמך ורלוונטית למשימה — לשדה link, בדיוק כפי שהיא.",
    "- ב-help לכתוב את הפרט המעשי שבמסמך (איפה מגישים, לכמה זמן תקף האישור, מי חותם).",
    "- מועדים, אחוזי מימון ותנאי סף — לשלב בתוך ה-help של המשימה הרלוונטית.",
    "- אם המסמך לא מפרט את שלב הדיווח, בנה רשימת דיווח סבירה למוסד חינוכי",
    "  (איסוף חשבוניות, התאמה לסעיפי התקציב, טופס דיווח, אישור רו\"ח, תיעוד) וציין זאת ב-summary.",
    "- מה שלא כתוב במסמך ולא ברור — לא להמציא. עדיף רשימה קצרה ונכונה.",
    "- הכל בעברית.",
  ].filter(Boolean).join("\n");
}

// סוג MIME לפי סיומת — הדפדפן מזהה לא נכון חלק מהסוגים, ו-Gemini דוחה מה שלא מוכר
function mimeForDoc(path: string, fallback: string): string {
  const ext = (String(path || "").split(".").pop() || "").toLowerCase();
  const map: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
    txt: "text/plain", csv: "text/csv",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
  return map[ext] || fallback || "application/pdf";
}

async function downloadFromStorage(bucket: string, path: string): Promise<Uint8Array> {
  const { data, error } = await supa.storage.from(bucket).download(path);
  if (error || !data) throw new Error("הורדת המסמך מ-Storage נכשלה: " + (error?.message || "לא נמצא"));
  return new Uint8Array(await data.arrayBuffer());
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;                        // פירוק למנות — String.fromCharCode קורס על מערך ענק
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any);
  }
  return btoa(bin);
}

async function callGemini(parts: any[]): Promise<any> {
  const url = "https://generativelanguage.googleapis.com/v1beta/models/" +
    GEMINI_MODEL + ":generateContent?key=" + GEMINI_KEY;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: parts }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0.2,
      },
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error("Gemini error " + res.status + ": " + JSON.stringify(json));
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini לא החזיר תוכן");
  return JSON.parse(text);
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") || "";
  const CORS = corsFor(origin);
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

  if (req.method !== "POST") return reply({ error: "POST only" }, 405);
  if (!GEMINI_KEY) return reply({ error: "GEMINI_KEY_ADMIN לא מוגדר בשרת" }, 500);

  let payload: any;
  try { payload = await req.json(); } catch { return reply({ error: "גוף הבקשה אינו JSON" }, 400); }
  if (!payload.bucket || !payload.path) return reply({ error: "חסר bucket/path של המסמך" }, 400);

  const parts: any[] = [{ text: buildPrompt(payload.context || {}) }];
  try {
    const bytes = await downloadFromStorage(payload.bucket, payload.path);
    if (bytes.byteLength > 18 * 1024 * 1024) {
      return reply({ error: "המסמך גדול מדי (מעל 18MB). נסו לשמור אותו מחדש כ-PDF קטן יותר." }, 400);
    }
    const mime = mimeForDoc(payload.fileName || payload.path, payload.mimeType || "");
    parts.push({ inline_data: { mime_type: mime, data: toBase64(bytes) } });
  } catch (e) {
    return reply({ error: String((e as Error).message || e) }, 502);
  }
  parts.push({ text: "קרא את המסמך ובנה את שתי הרשימות לפי ההנחיות." });

  try {
    const out = await callGemini(parts);
    return reply({
      summary: out.summary || "",
      funder: out.funder || "",
      deadline: out.deadline || "",
      reportDeadline: out.reportDeadline || "",
      submit: Array.isArray(out.submit) ? out.submit : [],
      report: Array.isArray(out.report) ? out.report : [],
    });
  } catch (e) {
    return reply({ error: String((e as Error).message || e) }, 502);
  }
});
