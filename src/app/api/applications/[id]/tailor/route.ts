import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  QuotaExceededError,
  tailorApplication,
} from "@/lib/tailoring/tailor";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null as null };
  return { supabase, user };
}

/** Trigger first-time (or re-run) tailoring; counts against monthly quota. */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { user } = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const admin = createAdminClient();
    const application = await tailorApplication(admin, user.id, id, {
      countAgainstQuota: true,
    });
    return NextResponse.json({ application });
  } catch (err) {
    if (err instanceof QuotaExceededError) {
      return NextResponse.json({ error: err.message }, { status: 402 });
    }
    const message = err instanceof Error ? err.message : String(err);
    const status =
      message === "Application not found" || message === "Profile not found"
        ? 404
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
