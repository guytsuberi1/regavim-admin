// meeting-to-events — Edge Function (Deno) לאפליקציית התפעול (regavim-admin)
//
// מקבל טקסט של פגישה או הקלטת אודיו, שולח ל-Google Gemini, ומחזיר טיוטת אירועים
// מובנית (לוז + משימות) לאישור המשתמש. "המוח" של מסלול ה-AI.
//
// פריסה (חד-פעמי, ראו README.md בתיקייה הזו):
//   supabase secrets set GEMINI_API_KEY=...        # המפתח החינמי מ-Google AI Studio
//   supabase functions deploy meeting-to-events
//
// אבטחה: Supabase מאמת JWT אוטומטית (verify_jwt), כך שרק משתמש מחובר יכול לקרוא.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// מפתח ייעודי לאפליקציה הזו (נפרד מסודות של אפליקציות אחרות באותו פרויקט)
const GEMINI_KEY = Deno.env.get("GEMINI_KEY_ADMIN") || "";
// ניתן לשנות דגם בלי לגעת בקוד: supabase secrets set GEMINI_MODEL=gemini-2.0-flash
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-2.0-flash";
// מוזרקים אוטומטית ע"י Supabase — לשליפת ההקלטה מ-Storage בצד השרת
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supa = createClient(SUPABASE_URL, SERVICE_KEY);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// סכמת הפלט שמכריחה את Gemini להחזיר בדיוק את המבנה שלנו
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    events: {
      type: "array",
      items: {
        type: "object",
        properties: {
          typeLabel: { type: "string", description: "סוג האירוע (טיול כיתתי / יום עיון / שבת ישיבה וכו')" },
          title: { type: "string", description: "שם קצר לאירוע" },
          group: { type: "string", description: "כיתה או קבוצה, אם הוזכרה" },
          date: { type: "string", description: "תאריך בפורמט YYYY-MM-DD אם ניתן להסיק, אחרת ריק" },
          startTime: { type: "string", description: "שעת התחלה HH:MM אם הוזכרה, אחרת ריק" },
          endTime: { type: "string", description: "שעת סיום HH:MM אם הוזכרה, אחרת ריק" },
          location: { type: "string", description: "יעד/מקום, אם הוזכר" },
          schedule: {
            type: "array",
            items: {
              type: "object",
              properties: {
                time: { type: "string", description: "שעה HH:MM או ריק" },
                activity: { type: "string" },
                note: { type: "string" },
              },
              required: ["activity"],
            },
          },
          tasks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string", description: "המשימה" },
                role: { type: "string", description: "תפקיד אחראי מהרשימה שסופקה, או ריק" },
              },
              required: ["title"],
            },
          },
        },
        required: ["typeLabel", "title", "tasks"],
      },
    },
  },
  required: ["events"],
};

function buildPrompt(ctx: any): string {
  const types = (ctx?.eventTypes || []).join(" · ");
  const roles = (ctx?.roles || []).join(" · ");
  const catalog = (ctx?.taskCatalog || []).join(" · ");
  const today = ctx?.today || "";
  return [
    "אתה עוזר תפעול של ישיבת רגבים בנימין. לפניך תוכן פגישת תכנון שבועית (טקסט או הקלטה) בעברית.",
    "המשימה: לזהות כל אירוע/טיול שהוזכר, ולבנות עבור כל אחד: לוז (ציר זמן) וחלוקת משימות לבעלי תפקידים.",
    "החזר אך ורק JSON לפי הסכמה, בעברית.",
    "",
    "סוגי אירועים אפשריים (בחר typeLabel הקרוב ביותר): " + types,
    "תפקידים אפשריים לשיוך משימות (שדה role): " + roles,
    "משימות נפוצות מהמחסן (העדף אותן כשמתאים): " + catalog,
    today ? ("היום הוא " + today + ". אם נאמר 'יום שני הבא' וכו' — חשב את התאריך המדויק בפורמט YYYY-MM-DD.") : "",
    "",
    "כללים:",
    "- אם פרט לא הוזכר — השאר ריק, אל תמציא.",
    "- לכל טיול הוסף את המשימות המתבקשות מההקשר (בניית לוז, הסעות, אוכל, אישור הורים, תפוצה) גם אם לא נאמרו במפורש.",
    "- שייך לכל משימה role מהרשימה כשברור מי אחראי; אחרת השאר role ריק.",
  ].filter(Boolean).join("\n");
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
  if (!res.ok) {
    throw new Error("Gemini error " + res.status + ": " + JSON.stringify(json));
  }
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini לא החזיר תוכן");
  return JSON.parse(text);
}

// שליפת ההקלטה מ-Supabase Storage (בצד השרת, עם לקוח service role — עוקף RLS)
async function downloadFromStorage(bucket: string, path: string): Promise<Uint8Array> {
  const { data, error } = await supa.storage.from(bucket).download(path);
  if (error || !data) throw new Error("הורדת ההקלטה מ-Storage נכשלה: " + (error?.message || "לא נמצא"));
  return new Uint8Array(await data.arrayBuffer());
}

// העלאת האודיו ל-Gemini Files API (תומך בקבצים גדולים/ארוכים) והמתנה לעיבוד
async function uploadToGemini(bytes: Uint8Array, mimeType: string): Promise<{ uri: string; mimeType: string }> {
  const numBytes = bytes.byteLength;
  const startRes = await fetch(
    "https://generativelanguage.googleapis.com/upload/v1beta/files?key=" + GEMINI_KEY,
    {
      method: "POST",
      headers: {
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(numBytes),
        "X-Goog-Upload-Header-Content-Type": mimeType,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ file: { display_name: "meeting" } }),
    },
  );
  const uploadUrl = startRes.headers.get("X-Goog-Upload-URL");
  if (!uploadUrl) throw new Error("לא התקבל URL להעלאה מ-Gemini");

  const upRes = await fetch(uploadUrl, {
    method: "POST",
    headers: { "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize" },
    body: bytes,
  });
  const upJson = await upRes.json();
  const file = upJson?.file;
  if (!file?.uri || !file?.name) throw new Error("העלאת האודיו ל-Gemini נכשלה");

  // אודיו עובר עיבוד — ממתינים עד ACTIVE (עד ~60 שניות)
  let state = file.state;
  for (let i = 0; i < 30 && state !== "ACTIVE"; i++) {
    if (state === "FAILED") throw new Error("עיבוד האודיו ב-Gemini נכשל");
    await new Promise((r) => setTimeout(r, 2000));
    const st = await fetch("https://generativelanguage.googleapis.com/v1beta/" + file.name + "?key=" + GEMINI_KEY);
    state = (await st.json())?.state;
  }
  if (state !== "ACTIVE") throw new Error("האודיו עדיין בעיבוד — נסו שוב בעוד רגע");
  return { uri: file.uri, mimeType: file.mimeType || mimeType };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

  if (req.method !== "POST") return reply({ error: "POST only" }, 405);
  if (!GEMINI_KEY) return reply({ error: "GEMINI_KEY_ADMIN לא מוגדר בשרת" }, 500);

  let payload: any;
  try { payload = await req.json(); } catch { return reply({ error: "גוף הבקשה אינו JSON" }, 400); }

  const prompt = buildPrompt(payload.context || {});
  const parts: any[] = [{ text: prompt }];

  if (payload.mode === "audio") {
    try {
      if (payload.bucket && payload.path) {
        // מסלול מומלץ להקלטות ארוכות: הורדה מ-Storage → Files API
        const bytes = await downloadFromStorage(payload.bucket, payload.path);
        const up = await uploadToGemini(bytes, payload.mimeType || "audio/mpeg");
        parts.push({ file_data: { mime_type: up.mimeType, file_uri: up.uri } });
      } else if (payload.audioBase64) {
        // מסלול inline לקבצים קטנים (≤20MB)
        parts.push({ inline_data: { mime_type: payload.mimeType || "audio/mpeg", data: payload.audioBase64 } });
      } else {
        return reply({ error: "חסר bucket/path או audioBase64" }, 400);
      }
    } catch (e) {
      return reply({ error: String((e as Error).message || e) }, 502);
    }
    parts.push({ text: "תמלל את ההקלטה ובנה את האירועים לפי ההנחיות." });
  } else if (payload.mode === "text" && payload.text) {
    parts.push({ text: "תוכן הפגישה:\n" + String(payload.text) });
  } else {
    return reply({ error: "חסר text או הקלטה" }, 400);
  }

  try {
    const out = await callGemini(parts);
    return reply({ events: Array.isArray(out.events) ? out.events : [] });
  } catch (e) {
    return reply({ error: String((e as Error).message || e) }, 502);
  }
});
