-- Seed known public Greenhouse + Lever boards (verified via public ATS APIs).
-- Idempotent: unique (ats_source, board_slug).

insert into public.jp_companies (ats_source, board_slug, company_name, is_active)
values
  -- Greenhouse — Canadian-friendly boards (verified: have Canada-based and/or Remote jobs)
  ('greenhouse', 'gitlab', 'GitLab', true),       -- 36 Canada, 168 remote
  ('greenhouse', 'geotab', 'Geotab', true),       -- 38 Canada, 14 remote
  ('greenhouse', 'd2l', 'D2L', true),             -- 7 Canada, 9 remote
  ('greenhouse', 'mercury', 'Mercury', true),     -- 44 Canada, 55 remote
  ('greenhouse', 'dropbox', 'Dropbox', true),     -- 10 Canada, 28 remote
  ('greenhouse', 'brex', 'Brex', true),           -- 41 Canada, 0 remote
  ('greenhouse', 'databricks', 'Databricks', true),-- 24 Canada, 60 remote
  ('greenhouse', 'coinbase', 'Coinbase', true),   -- 9 Canada, 137 remote
  ('greenhouse', 'stripe', 'Stripe', true),       -- 30 Canada, 97 remote
  ('greenhouse', 'fieldwire', 'Fieldwire', true),  -- 1 Canada, 9 remote
  ('greenhouse', 'discord', 'Discord', true),     -- 5 remote, 0 Canada
  -- Greenhouse — other US tech
  ('greenhouse', 'airbnb', 'Airbnb', true),
  ('greenhouse', 'anthropic', 'Anthropic', true),
  ('greenhouse', 'cloudflare', 'Cloudflare', true),
  ('greenhouse', 'datadog', 'Datadog', true),
  ('greenhouse', 'figma', 'Figma', true),
  ('greenhouse', 'block', 'Block', true),
  ('greenhouse', 'lyft', 'Lyft', true),
  ('greenhouse', 'pinterest', 'Pinterest', true),
  ('greenhouse', 'reddit', 'Reddit', true),
  ('greenhouse', 'twilio', 'Twilio', true),
  ('greenhouse', 'robinhood', 'Robinhood', true),
  ('greenhouse', 'asana', 'Asana', true),
  ('greenhouse', 'vercel', 'Vercel', true),
  ('greenhouse', 'hubspot', 'HubSpot', true),
  ('greenhouse', 'okta', 'Okta', true),
  ('greenhouse', 'mongodb', 'MongoDB', true),
  ('greenhouse', 'elastic', 'Elastic', true),
  ('greenhouse', 'duolingo', 'Duolingo', true),
  ('greenhouse', 'affirm', 'Affirm', true),
  ('greenhouse', 'chime', 'Chime', true),
  ('greenhouse', 'gusto', 'Gusto', true),
  ('greenhouse', 'lattice', 'Lattice', true),
  ('greenhouse', 'mixpanel', 'Mixpanel', true),
  ('greenhouse', 'amplitude', 'Amplitude', true),
  ('greenhouse', 'braze', 'Braze', true),
  ('greenhouse', 'cockroachlabs', 'Cockroach Labs', true),
  ('greenhouse', 'netlify', 'Netlify', true),
  ('greenhouse', 'webflow', 'Webflow', true),
  ('greenhouse', 'airtable', 'Airtable', true),
  ('greenhouse', 'postman', 'Postman', true),
  ('greenhouse', 'intercom', 'Intercom', true),
  -- Lever
  ('lever', 'spotify', 'Spotify', true),
  ('lever', 'palantir', 'Palantir', true),
  ('lever', 'activecampaign', 'ActiveCampaign', true),
  ('lever', 'wealthfront', 'Wealthfront', true),
  ('lever', 'outreach', 'Outreach', true),
  ('lever', 'unlimit', 'Unlimit', true),
  ('lever', 'aledade', 'Aledade', true),
  ('lever', 'achievers', 'Achievers', true),
  ('lever', 'acceldata', 'Acceldata', true),
  ('lever', 'anomali', 'Anomali', true),
  ('lever', 'brightmachines', 'Bright Machines', true),
  ('lever', 'coupa', 'Coupa', true),
  ('lever', 'hermeus', 'Hermeus', true)
on conflict (ats_source, board_slug) do update
set
  company_name = excluded.company_name,
  is_active = true,
  consecutive_failures = 0;
