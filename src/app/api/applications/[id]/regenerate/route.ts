import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { streamTailorApplication } from "@/lib/tailoring/tailor";
import { createSseStream } from "@/lib/stream/sse";

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
 * Streams SSE: resume_start → resume_done → cover_start → cover_done → done.
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

  const admin = createAdminClient();
  const sse = createSseStream();
  (async () => {
    try {
      for await (const event of streamTailorApplication(admin, user.id, id, {
        instruction,
        countAgainstQuota: false,
      })) {
        sse.send(event);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sse.error(message);
    } finally {
      sse.close();
    }
  })().catch((err) => {
    sse.error(err instanceof Error ? err.message : String(err));
  });

  return new Response(sse.stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
