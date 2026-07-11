export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
};

export type SendEmailResult = {
  mocked?: true;
  id?: string;
};

/**
 * Email adapter. Mock by default; live Resend when EMAIL_MODE=live and
 * RESEND_API_KEY is set. Resend is optional — no SDK dependency.
 */
export async function sendEmail(
  input: SendEmailInput
): Promise<SendEmailResult> {
  const live =
    process.env.EMAIL_MODE === "live" && Boolean(process.env.RESEND_API_KEY);

  if (!live) {
    console.log("[email:mock]", {
      to: input.to,
      subject: input.subject,
      htmlLength: input.html.length,
    });
    return { mocked: true };
  }

  const from = process.env.EMAIL_FROM ?? "noreply@jobpilot.local";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error ${res.status}: ${body}`);
  }

  const data = (await res.json()) as { id?: string };
  return { id: data.id };
}
