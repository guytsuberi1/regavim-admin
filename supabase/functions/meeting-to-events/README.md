# meeting-to-events — מסלול ה-AI ("יצירת אירועים מפגישה")

ה-Edge Function הזה מקבל טקסט או הקלטה של הפגישה השבועית, שולח ל-**Google Gemini**,
ומחזיר טיוטת אירועים (לו"ז + משימות) שנפתחת לאישור בגיליון "תכנון אירועים וטיולים".

## מה גיא צריך לעשות (חד-פעמי)

### 1. לפתוח מפתח Gemini חינמי
- להיכנס ל-https://aistudio.google.com/apikey (Google AI Studio) עם חשבון Google.
- "Create API key" → להעתיק את המפתח (מתחיל ב-`AIza...`).

### 2. להתקין Supabase CLI (אם עדיין לא)
- הוראות: https://supabase.com/docs/guides/cli
- להתחבר: `supabase login`
- לקשר לפרויקט: `supabase link --project-ref dcnndzrdimkogfjsvcku`

### 3. להגדיר את המפתח כסוד בשרת (לא נכנס לקוד!)
```bash
supabase secrets set GEMINI_API_KEY=AIza...המפתח-שלך
# אופציונלי — לשנות דגם בלי לגעת בקוד:
# supabase secrets set GEMINI_MODEL=gemini-2.0-flash
```

### 4. לפרוס את הפונקציה
```bash
supabase functions deploy meeting-to-events
```

זהו. מרגע זה, הכפתור **🎙️ מפגישה (AI)** בגיליון האירועים עובד.

## הערות
- **פרטיות (פיילוט חינמי):** בשכבה החינמית של Gemini, Google עשויה להשתמש בתוכן לשיפור
  המודלים. לנתונים רגישים — לשקול מעבר לשכבה בתשלום (הקוד לא משתנה, רק המפתח/החיוב).
- **גודל הקלטה:** אודיו נשלח inline, מוגבל ל-~20MB. לפגישה שבועית זה בד"כ מספיק;
  אם צריך קבצים גדולים — נעבור בעתיד ל-Files API של Gemini.
- **אבטחה:** הפונקציה מאמתת JWT אוטומטית (רק משתמש מחובר יכול להריץ).
- אין צורך בקוד frontend נוסף — הכל כבר מחובר דרך `Store.meetingToEvents` ו-`sb.functions.invoke`.
