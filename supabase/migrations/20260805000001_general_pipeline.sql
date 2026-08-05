-- General-purpose job-site pipeline: resume fingerprints + singleton pipeline state.
-- Name uses ...0001 so it sorts AFTER ...0000_jp_prefix.sql (g < j lexicographically).

-- Resume fingerprint: hash of the resume version that was last scored.
-- Written only by rescoreChangedProfiles AFTER re-scoring, so a change is
-- detected when the hash differs from the previously-scored resume.
alter table public.jp_profiles add column if not exists resume_fingerprint text;

-- Singleton pipeline state. RLS enabled with NO policies:
-- the service role bypasses RLS; authenticated/anon see zero rows.
create table if not exists public.jp_pipeline_state (
  id smallint primary key check (id = 1),
  last_poll_at timestamptz,
  last_sweep_at timestamptz,
  last_score_at timestamptz,
  running boolean not null default false,
  running_at timestamptz
);

insert into public.jp_pipeline_state (id)
values (1)
on conflict (id) do nothing;

alter table public.jp_pipeline_state enable row level security;

-- Support the stale-sweep (is_active = true AND last_seen_at < cutoff).
create index if not exists idx_jp_postings_active_last_seen
  on public.jp_postings (is_active, last_seen_at);
