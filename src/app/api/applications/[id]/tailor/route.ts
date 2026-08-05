import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  QuotaExceededError,
  assertTailorQuota,
  streamTailorApplication,
} from "@/lib/tailoring/tailor";
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
 * Trigger first-time (or re-run) tailoring; counts against monthly quota.
 * Streams SSE: resume_start → resume_done → cover_start → cover_done → done.
 * Quota is checked BEFORE the stream opens so an exhausted quota returns a
 * clean 402 JSON instead of a streamed error.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { user } = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const admin = createAdminClient();

  try {
    await assertTailorQuota(admin, user.id);
  } catch (err) {
    if (err instanceof QuotaExceededError) {
      return NextResponse.json({ error: err.message }, { status: 402 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const sse = createSseStream();
  (async () => {
    try {
      for await (const event of streamTailorApplication(admin, user.id, id, {
        countAgainstQuota: true,
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
