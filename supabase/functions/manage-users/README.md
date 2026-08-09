# manage-users — פונקציית ניהול חשבונות ההתחברות

הפונקציה משותפת לאפליקציית **התפעול** (regavim-admin) ולאפליקציית **החקלאות** —
אותו פרויקט Supabase, אותם אנשים. מקור האמת לקוד הוא הקובץ שכאן; עותק זהה קיים גם
ב-`regavim-agriculture/supabase/functions/manage-users`.

## מה היא עושה
מסך "נתוני בסיס → הרשאות" קורא לה דרך `Store.manageUsers({ action, email, password })`:

| action | פעולה |
|---|---|
| `list` | רשימת כל חשבונות ההתחברות הקיימים (כדי לסמן "יש חשבון" / "אין חשבון") |
| `create` | פתיחת חשבון חדש לעובד עם סיסמה ראשונית |
| `resetPassword` | סיסמה חדשה לחשבון קיים |
| `delete` | מחיקת חשבון ההתחברות (רשומת העובד עצמה נשארת) |

הפונקציה משתמשת ב-SERVICE_ROLE_KEY (הרשאות-על), ולכן היא **מאמתת שהקורא הוא אדמין מורשה**
לפני כל פעולה. מי שאינו ברשימה מקבל 403.

## פריסה
```bash
supabase login
supabase link --project-ref dcnndzrdimkogfjsvcku
supabase functions deploy manage-users
```
או דרך הדשבורד: Edge Functions → Deploy a new function → שם `manage-users` → להדביק את
תוכן `index.ts` → Deploy.

## Secrets
שלושת המפתחות שהפונקציה צריכה הם **Default secrets** של Supabase ("Reserved secrets available
in every project") ומוזרקים אוטומטית לכל פונקציה — **אין מה להגדיר ידנית**:

| Secret | מצב | הערה |
|---|---|---|
| `SUPABASE_URL` | מוזרק אוטומטית | — |
| `SUPABASE_ANON_KEY` | מוזרק אוטומטית | מסומן `DEPRECATED` אצל Supabase אך פעיל |
| `SUPABASE_SERVICE_ROLE_KEY` | מוזרק אוטומטית | מסומן `DEPRECATED` אצל Supabase אך פעיל |
| `ADMIN_EMAILS` | רשות | מיילים מופרדים בפסיקים. אם לא מוגדר — נופלים ל-`FALLBACK_ADMINS` שבקוד |

**מי שאינו ברשימת האדמינים מקבל `forbidden — admins only`** — סימן שהפונקציה תקינה לגמרי
ורק המייל חסר. עדיף להוסיף דרך ה-Secret `ADMIN_EMAILS` מאשר לגעת בקוד.

## CORS — הכשל הנפוץ ביותר כאן
`ORIGIN_PATTERNS` הוא רשימת **ביטויים רגולריים נעולים בשני הקצוות** (`^...$`). מקור שאינו תואם
מקבל כותרת CORS של מקור אחר, הדפדפן חוסם את התשובה, ו-supabase-js מדווח
`Failed to send a request to the Edge Function` — **בדיוק אותה הודעה כמו פונקציה שלא פרוסה**.

כרגע ברשימה: `*.chaklaut.co.il` · `[*.]chaklaut.pages.dev` · `guytsuberi1.github.io` (התפעול).

- **אתר חדש = שורה חדשה נעולה ב-`^...$`.** אין להחליף ב-`includes`/`startsWith` —
  כך נפרצות בדיקות מקור (`guytsuberi1.github.io.evil.com` היה עובר).
- (קרה: המעבר מרשימה קשיחה לתבניות השמיט את כתובת התפעול, וניהול ההרשאות שם נשבר
  בזמן שבחקלאות הכול עבד. בזבזנו כמה סבבים על תיאוריות לפני שראינו את הקוד הפרוס.)

## אבחון תקלות
| מה רואים במסך ההרשאות | המשמעות |
|---|---|
| `Failed to send a request to the Edge Function` | הפונקציה לא פרוסה בכלל, או ה-Origin נחסם ב-CORS |
| `missing service role key` | נדיר — המפתח מוזרק אוטומטית; אם קרה, להוסיף אותו ידנית כ-Secret |
| `forbidden — admins only` | הפונקציה עובדת; המייל המחובר אינו ברשימת האדמינים |

קביעת ההרשאות בטבלה **אינה** תלויה בפונקציה וממשיכה לעבוד גם כשהיא לא זמינה —
רק פתיחת חשבון, איפוס סיסמה ומחיקה חסומים.
