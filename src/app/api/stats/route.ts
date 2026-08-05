import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { maybeTriggerPipeline } from "@/lib/pipeline/pipeline";
import {
  getPipelineState,
  isLockLive,
} from "@/lib/pipeline/state";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("jp_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  // Fetch counts in parallel
  const [
    { count: totalPostings },
    { count: scoredCount },
    { data: lastPoll },
    { data: lastScore },
    { count: applicationCount },
  ] = await Promise.all([
    supabase
      .from("jp_postings")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true),
    supabase
      .from("jp_scores")
      .select("*", { count: "exact", head: true })
      .eq("profile_id", profile.id),
    supabase
      .from("jp_companies")
      .select("last_polled_at")
      .order("last_polled_at", { ascending: false })
      .limit(1),
    supabase
      .from("jp_scores")
      .select("scored_at")
      .eq("profile_id", profile.id)
      .order("scored_at", { ascending: false })
      .limit(1),
    supabase
      .from("jp_applications")
      .select("*", { count: "exact", head: true })
      .eq("profile_id", profile.id),
  ]);

  // Check if profile has a resume
  const { data: profileData } = await supabase
    .from("jp_profiles")
    .select("resume_parsed")
    .eq("id", profile.id)
    .single();

  const hasResume = Boolean(profileData?.resume_parsed);

  // Lazy background refresh: if the pipeline is stale, kick it off after the response.
  const admin = createAdminClient();
  const pipelineState = await getPipelineState(admin).catch(() => null);
  const pipelineRunning = isLockLive(
    pipelineState?.running ?? false,
    pipelineState?.running_at ?? null
  );
  await maybeTriggerPipeline(admin);

  return NextResponse.json({
    total_postings: totalPostings ?? 0,
    scored_count: scoredCount ?? 0,
    application_count: applicationCount ?? 0,
    has_resume: hasResume,
    last_poll_at: lastPoll?.[0]?.last_polled_at ?? null,
    last_score_at: lastScore?.[0]?.scored_at ?? null,
    pipeline_running: pipelineRunning,
  });
}
