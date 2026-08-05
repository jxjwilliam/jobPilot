import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getPipelineState,
  isLockLive,
  isPipelineStale,
} from "@/lib/pipeline/state";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  // Defensive: table may not exist before the migration is applied.
  const state = await getPipelineState(admin).catch(() => null);

  return NextResponse.json({
    last_poll_at: state?.last_poll_at ?? null,
    stale: isPipelineStale(state?.last_poll_at ?? null),
    running: isLockLive(state?.running ?? false, state?.running_at ?? null),
  });
}
