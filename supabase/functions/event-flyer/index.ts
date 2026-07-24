// event-flyer — Edge Function (Deno) לאפליקציית התפעול (regavim-admin)
//
// מקבל נתוני אירוע ומחזיר תמונת פלייר מעוצבת שנוצרה ע"י Google Gemini
// "Nano Banana" (Gemini 2.5 Flash Image). "המוח" של כפתור הפלייר.
//
// פריסה (חד-פעמי, ראו README.md בתיקייה הזו):
//   supabase secrets set GEMINI_KEY_ADMIN=...        # אותו מפתח של meeting-to-events
//   supabase functions deploy event-flyer
//
// אבטחה: Supabase מאמת JWT אוטומטית (verify_jwt), כך שרק משתמש מחובר יכול לקרוא.

// מפתח ייעודי לאפליקציה הזו (משותף עם meeting-to-events)
const GEMINI_KEY = Deno.env.get("GEMINI_KEY_ADMIN") || "";
// דגם התמונות — "Nano Banana". אם מוגדר GEMINI_IMAGE_MODEL — משתמשים רק בו;
// אחרת מנסים כמה שמות ידועים עד שאחד עובד (עמיד לשינויי שמות).
//   supabase secrets set GEMINI_IMAGE_MODEL=gemini-2.5-flash-image
const MODEL_OVERRIDE = Deno.env.get("GEMINI_IMAGE_MODEL") || "";
const MODEL_CANDIDATES = MODEL_OVERRIDE
  ? [MODEL_OVERRIDE]
  : ["gemini-2.5-flash-image", "gemini-2.5-flash-image-preview", "gemini-2.0-flash-preview-image-generation"];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// רקע/אווירה מומלצים לפי סוג האירוע
function themeFor(typeLabel: string): string {
  const t = String(typeLabel || "");
  if (t.indexOf("הישרדות") !== -1) return "a dramatic desert wilderness landscape at golden hour";
  if (t.indexOf("זהות") !== -1) return "ancient Judean heritage sites and Jerusalem stone landscapes";
  if (t.indexOf("טיול") !== -1) return "a beautiful green Israeli nature landscape with hills and trees";
  if (t.indexOf("שבת") !== -1) return "a warm, softly lit Shabbat atmosphere";
  if (t.indexOf("יום עיון") !== -1 || t.indexOf("הרצאה") !== -1 || t.indexOf("שיחה") !== -1) return "an elegant beit midrash / study hall atmosphere";
  return "the old city of Jerusalem with warm stone walls";
}

function buildFlyerPrompt(ev: any, org: string): string {
  const title = ev?.title || "אירוע";
  const typeLabel = ev?.typeLabel || "";
  const dateLine = ev?.dateLabel || ev?.date || "";
  const times = (ev?.startTime || "") + (ev?.endTime ? "–" + ev.endTime : "");
  const location = ev?.location || "";
  const group = ev?.group || "";
  const notes = ev?.notes || "";
  const schedule = Array.isArray(ev?.schedule) ? ev.schedule : [];
  const scheduleLines = schedule
    .map((s: any) => (s?.time ? s.time + " — " : "• ") + (s?.activity || "") + (s?.note ? " (" + s.note + ")" : ""))
    .filter(Boolean)
    .join("\n");

  const lines: string[] = [
    "Create a professional, print-quality event INVITATION FLYER (poster), PORTRAIT / vertical A4 orientation.",
    "All text must be in HEBREW, right-to-left, spelled EXACTLY as given below, crisp, elegant and fully legible.",
    "",
    "Brand: a religious agricultural yeshiva named 'רגבים בנימין' (" + (org || "רגבים בנימין") + ").",
    "Design language: warm and elegant; color palette of olive GREEN, GOLD and CREAM/beige; decorative olive branches in the corners; subtle soft shadows; rounded panels.",
    "Top-right small text: בס\"ד",
    "Header (top center): the yeshiva name 'רגבים בנימין' in large green Hebrew letters, with a small green emblem of a farmer holding a pitchfork beside a tree, and the subtitles 'ישיבה חינוכית חקלאית' and 'מבית רוח הגולן'.",
    "",
    "MAIN TITLE (very large, bold Hebrew): " + title,
    typeLabel ? ("Subtitle band under the title (white text on a green ribbon): " + typeLabel) : "",
    dateLine ? ("A rounded DATE CHIP with a calendar icon showing: " + dateLine) : "",
    times ? ("Show the hours: " + times) : "",
    group ? ("Audience/group: " + group) : "",
    location ? ("Location: " + location) : "",
    notes ? ("A short intro paragraph (elegant, warm): " + notes) : "",
  ];

  if (scheduleLines) {
    lines.push(
      "",
      "A TIMELINE (לו\"ז) section: a vertical line with, for each item, a round GREEN time badge showing the time and a small themed icon (house / walking person / fork-and-knife / bus etc.), next to the Hebrew activity text. The items, in order:",
      scheduleLines,
    );
  }

  lines.push(
    "",
    "Footer: a gold script blessing 'מצפים לראות את כולם!' and 'ברוכים הבאים!'.",
    "Background: " + themeFor(typeLabel) + ", softly blended behind the content so all text stays readable.",
    "High resolution, balanced composition, real design-agency quality. Do NOT add any English text or watermarks.",
  );

  return lines.filter(Boolean).join("\n");
}

async function tryModel(model: string, prompt: string): Promise<{ ok: boolean; img?: { data: string; mimeType: string }; retry?: boolean; err?: string }> {
  // דגמי image-generation של דור 2.0 דורשים גם TEXT וגם IMAGE; 2.5 מסתפק ב-IMAGE
  const modalities = model.indexOf("2.0") !== -1 ? ["TEXT", "IMAGE"] : ["IMAGE"];
  const url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + GEMINI_KEY;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: modalities } }),
  });
  const json = await res.json();
  if (!res.ok) {
    const msg = "Gemini error " + res.status + " (" + model + "): " + JSON.stringify(json).slice(0, 400);
    // 404 = שם דגם לא זמין → אפשר לנסות דגם אחר; שאר השגיאות (מכסה וכו') — לעצור
    return { ok: false, retry: res.status === 404, err: msg };
  }
  const parts = json?.candidates?.[0]?.content?.parts || [];
  for (const p of parts) {
    const inline = p?.inlineData || p?.inline_data;
    if (inline && inline.data) return { ok: true, img: { data: inline.data, mimeType: inline.mimeType || inline.mime_type || "image/png" } };
  }
  const reason = json?.candidates?.[0]?.finishReason || JSON.stringify(json).slice(0, 300);
  return { ok: false, retry: true, err: "לא התקבלה תמונה מ-" + model + " (" + reason + ")" };
}

async function generateImage(prompt: string): Promise<{ data: string; mimeType: string }> {
  let lastErr = "לא נמצא דגם תמונות זמין";
  for (const model of MODEL_CANDIDATES) {
    const r = await tryModel(model, prompt);
    if (r.ok && r.img) return r.img;
    lastErr = r.err || lastErr;
    if (!r.retry) break; // שגיאה שאינה "דגם לא נמצא" — לעצור ולהציג
  }
  throw new Error(lastErr);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

  if (req.method !== "POST") return reply({ error: "POST only" }, 405);
  if (!GEMINI_KEY) return reply({ error: "GEMINI_KEY_ADMIN לא מוגדר בשרת" }, 500);

  let payload: any;
  try { payload = await req.json(); } catch { return reply({ error: "גוף הבקשה אינו JSON" }, 400); }
  if (!payload || !payload.event) return reply({ error: "חסרים נתוני אירוע" }, 400);

  try {
    const prompt = buildFlyerPrompt(payload.event, payload.org || "");
    const img = await generateImage(prompt);
    return reply({ image: "data:" + img.mimeType + ";base64," + img.data });
  } catch (e) {
    return reply({ error: String((e as Error).message || e) }, 502);
  }
});
