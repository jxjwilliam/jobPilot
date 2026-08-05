import { NextResponse } from "next/server";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPipelineState, isLockLive } from "@/lib/pipeline/state";
import { runPipeline } from "@/lib/pipeline/pipeline";

type RunBody = {
  force_score?: boolean;
  poll?: boolean;
  sweep?: boolean;
  score?: boolean;
  rescore?: boolean;
};

/**
 * Manual pipeline trigger ("Refresh now"). Starts the pipeline in the
 * background after the response; returns 409 if a run is already live so the
 * client can reflect it. The pipeline itself re-checks the lock, so a race
 * between two triggers is still safe.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: RunBody = {};
  try {
    body = (await request.json().catch(() => ({}))) as RunBody;
  } catch {
    // empty body is fine
  }

  const admin = createAdminClient();
  const state = await getPipelineState(admin).catch(() => null);
  if (isLockLive(state?.running ?? false, state?.running_at ?? null)) {
    return NextResponse.json({ error: "Pipeline already running" }, { status: 409 });
  }

  const opts = {
    forceScore: Boolean(body.force_score),
    poll: body.poll,
    sweep: body.sweep,
    score: body.score,
    rescore: body.rescore,
  };

  after(() =>
    runPipeline(createAdminClient(), opts).catch((err) =>
      console.error("[pipeline] manual run failed", err)
    )
  );

  return NextResponse.json({ started: true });
}
