import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildDigestForUser,
  gatherDigestData,
  listDigestRecipients,
} from "@/lib/notifications/digest";
import { sendEmail } from "@/lib/notifications/email";

function authorizeCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;

  const headerSecret = req.headers.get("x-cron-secret");
  if (headerSecret === secret) return true;

  return false;
}

export async function POST(req: Request) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const adminClient = createAdminClient();
    const recipients = await listDigestRecipients(adminClient);

    let sent = 0;
    let mocked = 0;
    const errors: { userId: string; email: string; error: string }[] = [];

    for (const recipient of recipients) {
      try {
        const data = await gatherDigestData(
          adminClient,
          recipient.profileId,
          recipient.userId
        );
        const { subject, html } = buildDigestForUser(
          { email: recipient.email },
          data
        );
        const result = await sendEmail({
          to: recipient.email,
          subject,
          html,
        });
        sent += 1;
        if (result.mocked) mocked += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({
          userId: recipient.userId,
          email: recipient.email,
          error: message,
        });
      }
    }

    return NextResponse.json({ sent, mocked, errors });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
