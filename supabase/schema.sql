-- schema.sql — הקמת הטבלאות של אפליקציית התפעול (regavim-admin)
-- מריצים פעם אחת ב-Supabase Dashboard → SQL Editor → New query → Run.
-- בטוח להריץ שוב (idempotent): policies נמחקות ונוצרות מחדש.

-- ============================================================
-- 1. admin_state — מצב האפליקציה (JSONB לפי מפתחות תחום)
--    core        — מצבת עובדים, הגדרות, תעריפים (עריכה: משתמשים מחוברים)
--    portal      — שמות עובדים פעילים בלבד, לפורטל הדיווח הפתוח (קריאה אנונימית)
--    lc:YYYY-MM  — מרכז למידה | sub:YYYY-MM — מילוי מקום
--    abs:YYYY-MM — היעדרויות/מילואים/נסיעות/גמול טיול | pstat:YYYY-MM — לוח סטטוס
-- ============================================================
create table if not exists public.admin_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.admin_state enable row level security;

drop policy if exists "admin_state auth select" on public.admin_state;
create policy "admin_state auth select" on public.admin_state
  for select to authenticated using (true);

drop policy if exists "admin_state auth insert" on public.admin_state;
create policy "admin_state auth insert" on public.admin_state
  for insert to authenticated with check (true);

drop policy if exists "admin_state auth update" on public.admin_state;
create policy "admin_state auth update" on public.admin_state
  for update to authenticated using (true);

drop policy if exists "admin_state auth delete" on public.admin_state;
create policy "admin_state auth delete" on public.admin_state
  for delete to authenticated using (true);

-- הפורטל הפתוח (ללא התחברות) קורא אך ורק את שורת 'portal' — רשימת שמות לבחירה
drop policy if exists "admin_state anon portal" on public.admin_state;
create policy "admin_state anon portal" on public.admin_state
  for select to anon using (id = 'portal');

-- ============================================================
-- 2. admin_submissions — דיווחי עובדים מהפורטל (ממתין לאישור של גיא)
-- ============================================================
create table if not exists public.admin_submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  employee_name text not null,
  type text not null check (type in ('absence', 'travel', 'trip')),
  payload jsonb not null,
  file_path text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  handled_by text,
  handled_at timestamptz
);

alter table public.admin_submissions enable row level security;

-- עובד אנונימי: הוספה בלבד, תמיד במצב 'ממתין'. אין קריאה — עובד לא רואה דיווחים של אחרים.
drop policy if exists "submissions anon insert" on public.admin_submissions;
create policy "submissions anon insert" on public.admin_submissions
  for insert to anon with check (status = 'pending');

drop policy if exists "submissions auth select" on public.admin_submissions;
create policy "submissions auth select" on public.admin_submissions
  for select to authenticated using (true);

drop policy if exists "submissions auth insert" on public.admin_submissions;
create policy "submissions auth insert" on public.admin_submissions
  for insert to authenticated with check (true);

drop policy if exists "submissions auth update" on public.admin_submissions;
create policy "submissions auth update" on public.admin_submissions
  for update to authenticated using (true);

drop policy if exists "submissions auth delete" on public.admin_submissions;
create policy "submissions auth delete" on public.admin_submissions
  for delete to authenticated using (true);

-- ============================================================
-- 3. Storage — קבצי אישורים (מחלה / 3010) שעובדים מעלים מהפורטל
--    העלאה אנונימית מותרת; צפייה רק למשתמשים מחוברים.
-- ============================================================
insert into storage.buckets (id, name, public)
  values ('admin-approvals', 'admin-approvals', false)
  on conflict (id) do nothing;

drop policy if exists "approvals anon upload" on storage.objects;
create policy "approvals anon upload" on storage.objects
  for insert to anon with check (bucket_id = 'admin-approvals');

drop policy if exists "approvals auth read" on storage.objects;
create policy "approvals auth read" on storage.objects
  for select to authenticated using (bucket_id = 'admin-approvals');

drop policy if exists "approvals auth delete" on storage.objects;
create policy "approvals auth delete" on storage.objects
  for delete to authenticated using (bucket_id = 'admin-approvals');

-- ============================================================
-- 4. Realtime — עדכונים חיים בין משתמשים (מריצים בנפרד; אם כבר קיים תתקבל
--    שגיאת "already member of publication" — זה תקין, אפשר להתעלם)
-- ============================================================
alter publication supabase_realtime add table public.admin_state;
alter publication supabase_realtime add table public.admin_submissions;
