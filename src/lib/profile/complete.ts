type ResumeParsed = {
  skills?: unknown;
};

export type ProfileCompletenessRow = {
  resume_raw_url: string | null;
  resume_parsed: ResumeParsed | null;
};

/** Profile needs onboarding when there is no resume URL and no parsed skills. */
export function isProfileIncomplete(profile: ProfileCompletenessRow | null): boolean {
  if (!profile) return true;
  const skills = profile.resume_parsed?.skills;
  const hasSkills = Array.isArray(skills) && skills.length > 0;
  const hasResume = Boolean(profile.resume_raw_url);
  return !hasSkills && !hasResume;
}
