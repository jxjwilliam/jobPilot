-- Interview sessions for mock interview feature
CREATE TABLE IF NOT EXISTS interview_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  posting_id uuid NOT NULL REFERENCES postings(id) ON DELETE CASCADE,
  questions jsonb NOT NULL DEFAULT '[]',
  answers jsonb NOT NULL DEFAULT '[]',
  feedback jsonb,
  status text NOT NULL DEFAULT 'in_progress',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: users can only access their own interview sessions
ALTER TABLE interview_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own interview sessions"
  ON interview_sessions FOR SELECT
  USING (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own interview sessions"
  ON interview_sessions FOR INSERT
  WITH CHECK (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own interview sessions"
  ON interview_sessions FOR UPDATE
  USING (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete own interview sessions"
  ON interview_sessions FOR DELETE
  USING (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

-- Index for listing sessions by profile
CREATE INDEX IF NOT EXISTS idx_interview_sessions_profile
  ON interview_sessions(profile_id, created_at DESC);
