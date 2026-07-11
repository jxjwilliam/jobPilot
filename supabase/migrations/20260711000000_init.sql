-- enums
create type subscription_tier as enum ('free', 'pro', 'crunch');
create type ats_source as enum ('greenhouse', 'lever');
create type application_status as enum (
  'discovered', 'reviewing', 'applied', 'screening',
  'interview', 'offer', 'rejected', 'archived'
);

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  subscription_tier subscription_tier not null default 'free',
  stripe_customer_id text,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade unique,
  resume_raw_url text,
  resume_parsed jsonb not null default '{}'::jsonb,
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  ats_source ats_source not null,
  board_slug text not null,
  company_name text not null,
  is_active boolean not null default true,
  consecutive_failures int not null default 0,
  last_polled_at timestamptz,
  unique (ats_source, board_slug)
);

create table public.postings (
  id uuid primary key default gen_random_uuid(),
  ats_source ats_source not null,
  external_id text not null,
  company_name text not null,
  title text not null,
  location text,
  employment_type text,
  description_raw text not null default '',
  salary_min numeric,
  salary_max numeric,
  apply_url text,
  posted_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  is_active boolean not null default true,
  unique (ats_source, external_id)
);

create table public.scores (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  posting_id uuid not null references public.postings(id) on delete cascade,
  score numeric not null check (score >= 0 and score <= 100),
  rationale text not null default '',
  matched_skills jsonb not null default '[]'::jsonb,
  gaps jsonb not null default '[]'::jsonb,
  scored_at timestamptz not null default now(),
  unique (profile_id, posting_id)
);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  posting_id uuid not null references public.postings(id) on delete cascade,
  status application_status not null default 'discovered',
  tailored_resume jsonb,
  tailored_cover_letter text,
  applied_at timestamptz,
  status_history jsonb not null default '[]'::jsonb,
  notes text,
  unique (profile_id, posting_id)
);

create table public.usage_counters (
  user_id uuid primary key references public.users(id) on delete cascade,
  period_start date not null,
  tailoring_count int not null default 0,
  reset_at timestamptz not null
);

-- RLS
alter table public.users enable row level security;
alter table public.profiles enable row level security;
alter table public.scores enable row level security;
alter table public.applications enable row level security;
alter table public.usage_counters enable row level security;
-- companies + postings readable by authenticated users; writes via service role only
alter table public.companies enable row level security;
alter table public.postings enable row level security;

create policy users_self on public.users for all using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_self on public.profiles for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy scores_self on public.scores for select using (
  profile_id in (select id from public.profiles where user_id = auth.uid())
);
create policy applications_self on public.applications for all using (
  profile_id in (select id from public.profiles where user_id = auth.uid())
) with check (
  profile_id in (select id from public.profiles where user_id = auth.uid())
);
create policy usage_self on public.usage_counters for select using (user_id = auth.uid());
create policy postings_read on public.postings for select to authenticated using (true);
create policy companies_read on public.companies for select to authenticated using (true);

-- auto-create public.users row on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email) values (new.id, new.email);
  insert into public.profiles (user_id) values (new.id);
  insert into public.usage_counters (user_id, period_start, tailoring_count, reset_at)
  values (new.id, date_trunc('month', now())::date, 0, (date_trunc('month', now()) + interval '1 month'));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Storage: private resumes bucket; users can manage files under resumes/{user_id}/
insert into storage.buckets (id, name, public) values ('resumes', 'resumes', false)
on conflict (id) do nothing;

create policy resumes_select_own on storage.objects for select to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

create policy resumes_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

create policy resumes_update_own on storage.objects for update to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);

create policy resumes_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);
