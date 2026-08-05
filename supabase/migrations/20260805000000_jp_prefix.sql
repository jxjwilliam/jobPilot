-- Prefix all application-owned tables and the storage bucket with `jp_`.
-- Applies to an existing database: renames in place, preserves data.

-- Drop policies first: their definitions embed the pre-rename table names.
drop policy if exists users_self on public.users;
drop policy if exists profiles_self on public.profiles;
drop policy if exists scores_self on public.scores;
drop policy if exists applications_self on public.applications;
drop policy if exists usage_self on public.usage_counters;
drop policy if exists postings_read on public.postings;
drop policy if exists companies_read on public.companies;
drop policy if exists "Users can view own interview_sessions" on interview_sessions;
drop policy if exists "Users can insert own interview_sessions" on interview_sessions;
drop policy if exists "Users can update own interview_sessions" on interview_sessions;
drop policy if exists "Users can delete own interview_sessions" on interview_sessions;
drop policy if exists "Users can view own resumes" on resumes;
drop policy if exists "Users can insert own resumes" on resumes;
drop policy if exists "Users can update own resumes" on resumes;
drop policy if exists "Users can delete own resumes" on resumes;
drop policy if exists resumes_select_own on storage.objects;
drop policy if exists resumes_insert_own on storage.objects;
drop policy if exists resumes_update_own on storage.objects;
drop policy if exists resumes_delete_own on storage.objects;

-- Rename tables.
alter table public.users rename to jp_users;
alter table public.profiles rename to jp_profiles;
alter table public.companies rename to jp_companies;
alter table public.postings rename to jp_postings;
alter table public.scores rename to jp_scores;
alter table public.applications rename to jp_applications;
alter table public.usage_counters rename to jp_usage_counters;
alter table public.interview_sessions rename to jp_interview_sessions;
alter table public.resumes rename to jp_resumes;

-- Recreate the signup trigger function against the renamed tables.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.jp_users (id, email) values (new.id, new.email);
  insert into public.jp_profiles (user_id) values (new.id);
  insert into public.jp_usage_counters (user_id, period_start, tailoring_count, reset_at)
  values (new.id, date_trunc('month', now())::date, 0, (date_trunc('month', now()) + interval '1 month'));
  return new;
end;
$$;

-- Recreate RLS policies on the renamed tables.
create policy users_self on public.jp_users for all
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_self on public.jp_profiles for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy scores_self on public.jp_scores for select
  using (profile_id in (select id from public.jp_profiles where user_id = auth.uid()));
create policy applications_self on public.jp_applications for all
  using (profile_id in (select id from public.jp_profiles where user_id = auth.uid()))
  with check (profile_id in (select id from public.jp_profiles where user_id = auth.uid()));
create policy usage_self on public.jp_usage_counters for select
  using (user_id = auth.uid());
create policy postings_read on public.jp_postings for select to authenticated using (true);
create policy companies_read on public.jp_companies for select to authenticated using (true);

create policy "Users can view own interview_sessions" on public.jp_interview_sessions for select
  using (profile_id in (select id from public.jp_profiles where user_id = auth.uid()));
create policy "Users can insert own interview_sessions" on public.jp_interview_sessions for insert
  with check (profile_id in (select id from public.jp_profiles where user_id = auth.uid()));
create policy "Users can update own interview_sessions" on public.jp_interview_sessions for update
  using (profile_id in (select id from public.jp_profiles where user_id = auth.uid()));
create policy "Users can delete own interview_sessions" on public.jp_interview_sessions for delete
  using (profile_id in (select id from public.jp_profiles where user_id = auth.uid()));

create policy "Users can view own resumes" on public.jp_resumes for select
  using (profile_id in (select id from public.jp_profiles where user_id = auth.uid()));
create policy "Users can insert own resumes" on public.jp_resumes for insert
  with check (profile_id in (select id from public.jp_profiles where user_id = auth.uid()));
create policy "Users can update own resumes" on public.jp_resumes for update
  using (profile_id in (select id from public.jp_profiles where user_id = auth.uid()));
create policy "Users can delete own resumes" on public.jp_resumes for delete
  using (profile_id in (select id from public.jp_profiles where user_id = auth.uid()));

-- Rename the private storage bucket: resumes -> jp_resumes.
-- Supabase blocks direct DELETE from storage tables, so the legacy `resumes`
-- bucket row is left behind (empty after the move). Remove it via the Storage
-- API / dashboard if you want zero leftover buckets.
insert into storage.buckets (id, name, public) values ('jp_resumes', 'jp_resumes', false)
on conflict (id) do nothing;

update storage.objects set bucket_id = 'jp_resumes' where bucket_id = 'resumes';

drop policy if exists resumes_select_own on storage.objects;
create policy resumes_select_own on storage.objects for select to authenticated
  using (bucket_id = 'jp_resumes' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists resumes_insert_own on storage.objects;
create policy resumes_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'jp_resumes' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists resumes_update_own on storage.objects;
create policy resumes_update_own on storage.objects for update to authenticated
  using (bucket_id = 'jp_resumes' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'jp_resumes' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists resumes_delete_own on storage.objects;
create policy resumes_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'jp_resumes' and (storage.foldername(name))[1] = auth.uid()::text);
