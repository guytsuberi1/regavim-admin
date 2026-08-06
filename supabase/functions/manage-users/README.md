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

## CORS
`ALLOWED_ORIGINS` בקוד חייב להכיל את כתובת האתר שקורא לפונקציה. כרגע:
`https://chaklaut.rgvb.org.il` (חקלאות) ו-`https://guytsuberi1.github.io` (תפעול).
אתר חדש = להוסיף שורה ולפרוס מחדש.

## אבחון תקלות
| מה רואים במסך ההרשאות | המשמעות |
|---|---|
| `Failed to send a request to the Edge Function` | הפונקציה לא פרוסה בכלל, או ה-Origin נחסם ב-CORS |
| `missing service role key` | נדיר — המפתח מוזרק אוטומטית; אם קרה, להוסיף אותו ידנית כ-Secret |
| `forbidden — admins only` | הפונקציה עובדת; המייל המחובר אינו ברשימת האדמינים |

קביעת ההרשאות בטבלה **אינה** תלויה בפונקציה וממשיכה לעבוד גם כשהיא לא זמינה —
רק פתיחת חשבון, איפוס סיסמה ומחיקה חסומים.
