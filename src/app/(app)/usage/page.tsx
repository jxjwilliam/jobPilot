"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type UsagePayload = {
  tier: string;
  tailoring_count: number;
  limit: number | null;
  reset_at: string;
};

function UsagePageInner() {
  const searchParams = useSearchParams();
  const mockUpgrade = searchParams.get("mockUpgrade") === "1";

  const [usage, setUsage] = useState<UsagePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [upgrading, setUpgrading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/usage");
      const body = (await res.json()) as UsagePayload & { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Failed to load usage");
      setUsage(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load usage");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleUpgrade() {
    setUpgrading(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/portal");
      const body = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !body.url) {
        throw new Error(body.error ?? "Failed to open billing portal");
      }
      window.location.href = body.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upgrade failed");
      setUpgrading(false);
    }
  }

  const limitLabel =
    usage?.limit == null ? "Unlimited" : String(usage.limit);
  const resetLabel = usage?.reset_at
    ? new Date(usage.reset_at).toLocaleDateString()
    : "—";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Usage</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Tailoring quota for the current billing period.
        </p>
      </div>

      {mockUpgrade ? (
        <div
          className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          role="status"
        >
          Mock upgrade complete. Billing is in mock mode — no charge was made.
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-zinc-500">Loading usage…</p>
      ) : usage ? (
        <div className="space-y-4">
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500">
                Plan
              </dt>
              <dd className="mt-1 text-lg font-medium capitalize">
                {usage.tier}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500">
                Tailoring this period
              </dt>
              <dd className="mt-1 text-lg font-medium">
                {usage.tailoring_count} / {limitLabel}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500">
                Resets
              </dt>
              <dd className="mt-1 text-lg font-medium">{resetLabel}</dd>
            </div>
          </dl>

          {usage.tier === "free" ? (
            <button
              type="button"
              onClick={() => void handleUpgrade()}
              disabled={upgrading}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {upgrading ? "Opening…" : "Upgrade"}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function UsagePage() {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Loading usage…</p>}>
      <UsagePageInner />
    </Suspense>
  );
}
