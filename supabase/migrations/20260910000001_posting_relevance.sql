-- jobPilot's dashboard counted every scraped posting (11,000+), which is meaningless.
-- Tag each posting with the filter verdict so counts and filters happen in SQL.
alter table public.jp_postings
  add column if not exists is_relevant boolean not null default false,
  add column if not exists matched_keywords text[] not null default '{}';

create index if not exists jp_postings_relevant_idx
  on public.jp_postings (is_relevant, is_active, last_seen_at desc);

create index if not exists jp_postings_ats_idx
  on public.jp_postings (ats_source);
