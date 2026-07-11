import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { tailorApplication } from "@/lib/tailoring/tailor";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null as null };
  return { supabase, user };
}

/**
 * Regenerate tailored materials with a free-text instruction.
 * MVP: regenerate does NOT increment quota again (free after first tailor).
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { user } = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const instruction =
    typeof body === "object" &&
    body !== null &&
    "instruction" in body &&
    typeof (body as { instruction: unknown }).instruction === "string"
      ? (body as { instruction: string }).instruction.trim()
      : "";

  if (!instruction) {
    return NextResponse.json(
      { error: "instruction is required" },
      { status: 400 }
    );
  }

  try {
    const admin = createAdminClient();
    // MVP: regenerate does NOT increment quota again (free after first tailor).
    const application = await tailorApplication(admin, user.id, id, {
      instruction,
      countAgainstQuota: false,
    });
    return NextResponse.json({ application });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status =
      message === "Application not found" || message === "Profile not found"
        ? 404
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
