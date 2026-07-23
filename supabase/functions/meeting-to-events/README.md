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
supabase secrets set GEMINI_KEY_ADMIN=AIza...המפתח-שלך
# אופציונלי — לשנות דגם בלי לגעת בקוד:
# supabase secrets set GEMINI_MODEL=gemini-2.0-flash
```

### 4. ליצור את ה-bucket להקלטות (חד-פעמי)
להריץ מחדש את `supabase/schema.sql` ב-Supabase Dashboard → SQL Editor (idempotent, בטוח).
הוא יוצר את bucket `meeting-audio` עם ההרשאות המתאימות. אם הריצו את הסכמה אחרי העדכון הזה — אין צורך שוב.

### 5. לפרוס את הפונקציה
```bash
supabase functions deploy meeting-to-events
```

זהו. מרגע זה, הכפתור **🎙️ מפגישה (AI)** בגיליון האירועים עובד — גם עם הקלטות ארוכות.

## איך זה עובד (הקלטות ארוכות)
- **טקסט:** נשלח ישירות ל-Gemini.
- **אודיו:** הדפדפן מעלה את הקובץ ל-Supabase Storage (`meeting-audio`); ה-Edge Function מושך אותו
  ומעלה ל-**Gemini Files API** (תומך באודיו של שעות) — כך אין מגבלת 20MB.

## הערות
- **פרטיות (פיילוט חינמי):** בשכבה החינמית של Gemini, Google עשויה להשתמש בתוכן לשיפור
  המודלים. לנתונים רגישים — לשקול מעבר לשכבה בתשלום (הקוד לא משתנה, רק המפתח/החיוב).
- **עלות:** נשאר חינמי בשכבת Gemini החינמית; הקלטה ארוכה צורכת יותר מהמכסה היומית,
  אך פגישה שבועית בודדת נמצאת הרבה מתחת לתקרה. Storage כלול בחינם (עד 1GB) — כדאי למחוק
  קבצים ישנים מדי פעם.
- **אבטחה:** הפונקציה מאמתת JWT אוטומטית (רק משתמש מחובר יכול להריץ).
- הפרונט כבר מחובר דרך `Store.uploadMeetingAudio` + `Store.meetingToEvents`.
