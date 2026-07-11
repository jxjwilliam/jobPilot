import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isBillingLive } from "@/lib/billing/stripe";

type StripeLikeEvent = {
  type?: string;
  data?: {
    object?: {
      customer?: string;
      status?: string;
      metadata?: { user_id?: string; supabase_user_id?: string };
    };
  };
};

function tierFromSubscriptionStatus(
  status: string | undefined
): "pro" | "free" {
  if (status === "active" || status === "trialing") return "pro";
  return "free";
}

export async function POST(request: Request) {
  if (!isBillingLive()) {
    return NextResponse.json({ received: true, mode: "mock" });
  }

  let event: StripeLikeEvent;
  try {
    event = (await request.json()) as StripeLikeEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const type = event.type ?? "";
  if (
    type === "customer.subscription.updated" ||
    type === "customer.subscription.created" ||
    type === "customer.subscription.deleted"
  ) {
    const obj = event.data?.object;
    const userId =
      obj?.metadata?.user_id ?? obj?.metadata?.supabase_user_id ?? null;
    const customerId = obj?.customer ?? null;
    const tier =
      type === "customer.subscription.deleted"
        ? "free"
        : tierFromSubscriptionStatus(obj?.status);

    try {
      const admin = createAdminClient();
      if (userId) {
        const { error } = await admin
          .from("users")
          .update({ subscription_tier: tier })
          .eq("id", userId);
        if (error) throw new Error(error.message);
      } else if (customerId) {
        const { error } = await admin
          .from("users")
          .update({ subscription_tier: tier })
          .eq("stripe_customer_id", customerId);
        if (error) throw new Error(error.message);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true, mode: "live" });
}
