export interface BillingPortal {
  createPortalUrl(userId: string): Promise<string>;
}

function liveStripeBilling(): BillingPortal {
  return {
    async createPortalUrl(userId: string) {
      const secret = process.env.STRIPE_SECRET_KEY;
      if (!secret) {
        throw new Error("Stripe live not fully configured");
      }
      // Minimal stub: full Checkout / Customer Portal comes later.
      void userId;
      throw new Error("Stripe live not fully configured");
    },
  };
}

export function getBilling(): BillingPortal {
  if (process.env.BILLING_MODE === "live") {
    return liveStripeBilling();
  }
  return {
    async createPortalUrl() {
      return "/usage?mockUpgrade=1";
    },
  };
}

export function isBillingLive(): boolean {
  return process.env.BILLING_MODE === "live";
}
