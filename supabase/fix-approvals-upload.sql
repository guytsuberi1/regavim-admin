-- תיקון: העלאת מסמך אישור מתוך האפליקציה (משתמש מחובר) נחסמה ב-RLS.
-- לדלי admin-approvals הייתה הרשאת העלאה ל-anon בלבד (פורטל העובדים),
-- ומדיניות "to anon" לא חלה על משתמש מחובר.
-- להריץ פעם אחת ב-Supabase → SQL Editor.

drop policy if exists "approvals auth insert" on storage.objects;
create policy "approvals auth insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'admin-approvals');
