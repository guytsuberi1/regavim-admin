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

const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") || "";
// ניתן לשנות דגם בלי לגעת בקוד: supabase secrets set GEMINI_MODEL=gemini-2.0-flash
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-2.0-flash";

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

  if (req.method !== "POST") return reply({ error: "POST only" }, 405);
  if (!GEMINI_KEY) return reply({ error: "GEMINI_API_KEY לא מוגדר בשרת" }, 500);

  let payload: any;
  try { payload = await req.json(); } catch { return reply({ error: "גוף הבקשה אינו JSON" }, 400); }

  const prompt = buildPrompt(payload.context || {});
  const parts: any[] = [{ text: prompt }];

  if (payload.mode === "audio" && payload.audioBase64) {
    parts.push({ inline_data: { mime_type: payload.mimeType || "audio/mpeg", data: payload.audioBase64 } });
    parts.push({ text: "תמלל את ההקלטה ובנה את האירועים לפי ההנחיות." });
  } else if (payload.mode === "text" && payload.text) {
    parts.push({ text: "תוכן הפגישה:\n" + String(payload.text) });
  } else {
    return reply({ error: "חסר text או audioBase64" }, 400);
  }

  try {
    const out = await callGemini(parts);
    return reply({ events: Array.isArray(out.events) ? out.events : [] });
  } catch (e) {
    return reply({ error: String((e as Error).message || e) }, 502);
  }
});
