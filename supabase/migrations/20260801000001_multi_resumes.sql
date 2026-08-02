-- Multi-resume support: users can have multiple resume versions for different target roles

-- Resume versions table
CREATE TABLE IF NOT EXISTS resumes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  file_url text NOT NULL,
  resume_parsed jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Track which resume is active for scoring/tailoring
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS active_resume_id uuid REFERENCES resumes(id) ON DELETE SET NULL;

-- RLS
ALTER TABLE resumes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own resumes"
  ON resumes FOR SELECT
  USING (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own resumes"
  ON resumes FOR INSERT
  WITH CHECK (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own resumes"
  ON resumes FOR UPDATE
  USING (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete own resumes"
  ON resumes FOR DELETE
  USING (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

-- Index for listing
CREATE INDEX IF NOT EXISTS idx_resumes_profile
  ON resumes(profile_id, created_at DESC);
