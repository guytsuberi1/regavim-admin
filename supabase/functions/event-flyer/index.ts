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
// דגם התמונות. אם מוגדר GEMINI_IMAGE_MODEL — משתמשים רק בו; אחרת בוחרים
// אוטומטית את דגם התמונות הטוב ביותר הזמין למפתח (מעדיפים Gemini 3 Pro Image,
// "Nano Banana Pro", שמרנדר עברית מדויקת), עם נפילה חזרה ל-2.5 flash image.
//   supabase secrets set GEMINI_IMAGE_MODEL=gemini-3-pro-image-preview
const MODEL_OVERRIDE = Deno.env.get("GEMINI_IMAGE_MODEL") || "";

// ניקוד העדפה לדגם תמונות (גבוה יותר = עדיף)
function modelScore(name: string): number {
  const n = name.toLowerCase();
  if (n.indexOf("image") === -1) return -1;          // לא דגם תמונות
  if (n.indexOf("3-pro-image") !== -1) return 100;   // Nano Banana Pro (העברית הכי טובה)
  if (n.indexOf("pro-image") !== -1) return 90;
  if (n.indexOf("3") !== -1) return 80;
  if (n.indexOf("2.5-flash-image") !== -1) return 50;
  if (n.indexOf("2.0") !== -1) return 20;
  return 10;
}

// בחירת דגם התמונות הטוב ביותר הזמין למפתח (דרך ListModels)
async function pickImageModel(): Promise<string> {
  if (MODEL_OVERRIDE) return MODEL_OVERRIDE;
  try {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&key=" + GEMINI_KEY);
    const json = await res.json();
    const names: string[] = (json?.models || [])
      .filter((m: any) => (m?.supportedGenerationMethods || []).indexOf("generateContent") !== -1)
      .map((m: any) => String(m?.name || "").replace(/^models\//, ""))
      .filter((n: string) => modelScore(n) >= 0);
    names.sort((a, b) => modelScore(b) - modelScore(a));
    if (names.length) return names[0];
  } catch (_e) { /* אם ListModels נכשל — נשתמש בברירת מחדל */ }
  return "gemini-2.5-flash-image";
}

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

function buildFlyerPrompt(ev: any, org: string, hasLogo: boolean): string {
  const title = ev?.title || "אירוע";
  const typeLabel = ev?.typeLabel || "";
  const dateLine = ev?.dateLabel || ev?.date || "";
  const times = (ev?.startTime || "") + (ev?.endTime ? "–" + ev.endTime : "");
  const location = ev?.location || "";
  const group = ev?.group || "";
  const notes = ev?.notes || "";
  const schedule = Array.isArray(ev?.schedule) ? ev.schedule : [];
  const scheduleLines = schedule
    .map((s: any) => (s?.time || "—") + " = " + (s?.activity || "") + (s?.note ? " (" + s.note + ")" : ""))
    .filter(Boolean)
    .join("\n");

  const lines: string[] = [
    "Create a professional, print-quality event INVITATION FLYER (poster), PORTRAIT / vertical A4 orientation.",
    "All text must be in HEBREW, right-to-left, spelled EXACTLY as given below, crisp, elegant and fully legible.",
    "",
    "Brand: a religious agricultural yeshiva named 'רגבים בנימין' (" + (org || "רגבים בנימין") + ").",
    "Design language: warm and elegant; color palette of olive GREEN, GOLD and CREAM/beige; decorative olive branches in the corners; subtle soft shadows; rounded panels.",
    "Top-right small text: בס\"ד",
    hasLogo
      ? "Header (top center): place the PROVIDED logo image EXACTLY as-is, prominently, at the top center. It already contains the emblem and the yeshiva name — do NOT redraw, recreate, or alter the logo or its text."
      : "Header (top center): the yeshiva name 'רגבים בנימין' in large green Hebrew letters, with a small green emblem of a farmer holding a pitchfork beside a tree, and the subtitles 'ישיבה חינוכית חקלאית' and 'מבית רוח הגולן'.",
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
      "A TIMELINE (לו\"ז) section: a vertical line. For each item show a round GREEN badge containing ONLY the time, plus a small themed icon (prayer shawl / bowl / bus / sandwich / hiking boot etc.), and next to them the Hebrew activity text. IMPORTANT: the time must appear ONLY inside the round badge — do NOT repeat the time again in the text line. Each item is given as 'TIME = ACTIVITY' (put TIME in the badge, ACTIVITY as the text):",
      scheduleLines,
    );
  }

  lines.push(
    "",
    "Footer: an elegant gold blessing that stays clearly legible (do not over-stylize the letters): 'מצפים לראות את כולם!' and 'ברוכים הבאים!'. Spell every Hebrew word exactly.",
    "Background: " + themeFor(typeLabel) + ", softly blended behind the content so all text stays readable.",
    "High resolution, balanced composition, real design-agency quality. Do NOT add any English text or watermarks.",
  );

  return lines.filter(Boolean).join("\n");
}

// חילוץ mime+base64 מ-data URL של הלוגו
function parseDataUrl(dataUrl: string): { mime: string; data: string } | null {
  const m = /^data:([^;]+);base64,(.*)$/.exec(String(dataUrl || ""));
  return m ? { mime: m[1], data: m[2] } : null;
}

async function generateImage(model: string, prompt: string, logo: string): Promise<{ data: string; mimeType: string }> {
  // 2.5-flash-image מסתפק ב-IMAGE; דגמים אחרים (2.0 / 3-pro) — TEXT+IMAGE
  const modalities = model.indexOf("2.5-flash-image") !== -1 ? ["IMAGE"] : ["TEXT", "IMAGE"];
  const parts: any[] = [];
  const lg = parseDataUrl(logo);
  if (lg) parts.push({ inline_data: { mime_type: lg.mime, data: lg.data } });
  parts.push({ text: prompt });
  const url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + GEMINI_KEY;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: parts }], generationConfig: { responseModalities: modalities } }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error("Gemini error " + res.status + " (" + model + "): " + JSON.stringify(json).slice(0, 500));
  const parts = json?.candidates?.[0]?.content?.parts || [];
  for (const p of parts) {
    const inline = p?.inlineData || p?.inline_data;
    if (inline && inline.data) return { data: inline.data, mimeType: inline.mimeType || inline.mime_type || "image/png" };
  }
  const reason = json?.candidates?.[0]?.finishReason || JSON.stringify(json).slice(0, 300);
  throw new Error("לא התקבלה תמונה מ-" + model + " (" + reason + ")");
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
    const model = await pickImageModel();
    const logo = String(payload.logo || "");
    const prompt = buildFlyerPrompt(payload.event, payload.org || "", !!parseDataUrl(logo));
    const img = await generateImage(model, prompt, logo);
    return reply({ image: "data:" + img.mimeType + ";base64," + img.data, model: model });
  } catch (e) {
    return reply({ error: String((e as Error).message || e) }, 502);
  }
});
