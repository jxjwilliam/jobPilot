-- Canada-first company list, verified live against each public ATS API on 2026-09-10.
-- Applied rules: board must exist, and must post Canada-based or Canada-eligible remote roles.
-- Boards with zero Canada/remote-eligible roles were deactivated rather than watched.

-- 1. Deactivate existing boards that do not hire in Canada.
update public.jp_companies
set is_active = false
where (ats_source, board_slug) in (
  ('greenhouse','figma'),        -- 158 postings, 0 Canada/remote
  ('lever','palantir'),          -- 310 postings, 0 Canada/remote
  ('lever','activecampaign'),    --  12 postings, 0 Canada/remote
  ('lever','outreach'),          --  30 postings, 0 Canada/remote
  ('lever','brightmachines'),    --  13 postings, 0 Canada/remote
  ('lever','coupa')              --  33 postings, 0 Canada/remote
);

-- 2. Add newly verified Canada-friendly boards.
insert into public.jp_companies (ats_source, board_slug, company_name, is_active)
values
  -- Greenhouse
  ('greenhouse','stackadapt','StackAdapt',true),      -- 45 Canada-tagged of 76
  ('greenhouse','hootsuite','Hootsuite',true),        -- 10 of 19
  ('greenhouse','later','Later',true),                -- 34 of 37
  ('greenhouse','faire','Faire',true),                -- 21 of 61
  -- Lever
  ('lever','fullscript','Fullscript',true),           -- 20 of 25 (Canadian health-tech)
  ('lever','wealthfront','Wealthfront',true),         -- 12 of 24
  ('lever','aledade','Aledade',true),                 -- 26 of 37
  ('lever','achievers','Achievers',true),             -- 13 of 16 (Toronto)
  ('lever','acceldata','Acceldata',true),             --  8 of 46
  ('lever','anomali','Anomali',true),                 --  4 of 9
  ('lever','unlimit','Unlimit',true),                 --  1 of 50
  ('lever','hermeus','Hermeus',true),                 --  1 of 90
  -- Ashby (AI-native boards; these are why the enum had to be widened)
  ('ashby','livekit','LiveKit',true),                 -- 16 of 31, remote NAMER
  ('ashby','close','Close',true),                     --  7 of 7
  ('ashby','openai','OpenAI',true),                   -- 37 of 784
  ('ashby','cohere','Cohere',true),                   -- 40 of 142 (Toronto)
  ('ashby','elevenlabs','ElevenLabs',true),           --  8 of 248
  ('ashby','deepgram','Deepgram',true),               -- 69 of 91
  ('ashby','pinecone','Pinecone',true),               --  2 of 6
  ('ashby','langchain','LangChain',true),             --  4 of 108
  ('ashby','sierra','Sierra',true),                   -- 32 of 209
  ('ashby','harvey','Harvey',true),                   -- 21 of 334
  ('ashby','jane','Jane App',true),                   -- 23 of 28 (Vancouver)
  ('ashby','ramp','Ramp',true),                       -- 19 of 145
  ('ashby','n8n','n8n',true)                          --  6 of 41
on conflict (ats_source, board_slug) do update
set company_name = excluded.company_name,
    is_active = true,
    consecutive_failures = 0;

