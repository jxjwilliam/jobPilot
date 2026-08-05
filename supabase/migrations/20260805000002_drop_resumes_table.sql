-- Remove the unused multi-resume table and its wiring.
--
-- The app stores the raw resume path on jp_profiles.resume_raw_url and the
-- parsed JSON on jp_profiles.resume_parsed, uploading to the `jp_resumes`
-- STORAGE bucket. The `jp_resumes` DATABASE table (from the multi-resume
-- migration) and `jp_profiles.active_resume_id` are never read or written by
-- any code — drop them to keep the schema clean.
--
-- Drop the column first so its FK to jp_resumes(id) is removed before the
-- table (and its composite type, RLS policies, and index) go away.

alter table public.jp_profiles drop column if exists active_resume_id;

drop table if exists public.jp_resumes;
