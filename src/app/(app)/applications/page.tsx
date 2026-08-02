"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { PipelineStats } from "@/components/PipelineStats";
import {
  KANBAN_COLUMNS,
  nextStatuses,
} from "@/lib/applications/status";

type ApplicationCard = {
  id: string;
  status: string;
  posting_id: string;
  profile_id: string;
  applied_at: string | null;
  notes: string | null;
  title: string | null;
  company_name: string | null;
};

function staleDays(appliedAt: string | null, status: string): number {
  if (!appliedAt || !["applied", "screening"].includes(status)) return 0;
  return Math.floor(
    (Date.now() - new Date(appliedAt).getTime()) / (1000 * 60 * 60 * 24)
  );
}

const COLUMN_LABELS: Record<string, string> = {
  discovered: "Discovered",
  reviewing: "Reviewing",
  applied: "Applied",
  screening: "Screening",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
  archived: "Archived",
};

function labelFor(status: string): string {
  return COLUMN_LABELS[status] ?? status;
}

export default function ApplicationsPage() {
  const [applications, setApplications] = useState<ApplicationCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [archivedOpen, setArchivedOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/applications");
      const data = (await res.json()) as {
        applications?: ApplicationCard[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to load applications");
      }
      setApplications(data.applications ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function moveTo(id: string, status: string) {
    setMovingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/applications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = (await res.json()) as {
        application?: { id: string; status: string };
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Could not update status");
      }
      setApplications((prev) =>
        prev.map((app) =>
          app.id === id && data.application
            ? { ...app, status: data.application.status }
            : app
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setMovingId(null);
    }
  }

  const byStatus = (status: string) =>
    applications.filter((a) => a.status === status);

  const archived = byStatus("archived");

  function renderCard(app: ApplicationCard) {
    const moves = nextStatuses(app.status);
    const days = staleDays(app.applied_at, app.status);
    const isStale = days >= 21;
    return (
      <article
        key={app.id}
        className="space-y-2 border border-neutral-200 bg-white p-3"
      >
        <Link
          href={`/applications/${app.id}`}
          className="block space-y-0.5 hover:opacity-80"
        >
          <div className="flex items-start gap-1.5">
            <p className="text-sm font-medium text-neutral-900 flex-1 min-w-0">
              {app.title ?? "Untitled role"}
            </p>
            {isStale ? (
              <span
                className="shrink-0 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700"
                title={`Applied ${days} days ago — consider following up`}
              >
                {days}d
              </span>
            ) : null}
          </div>
          <p className="text-xs text-neutral-600">
            {app.company_name ?? "Unknown company"}
          </p>
        </Link>
        {moves.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {moves.map((to) => (
              <button
                key={to}
                type="button"
                disabled={movingId === app.id}
                onClick={() => void moveTo(app.id, to)}
                className="rounded border border-neutral-300 px-1.5 py-0.5 text-[11px] text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
              >
                → {labelFor(to)}
              </button>
            ))}
          </div>
        ) : null}
      </article>
    );
  }

  return (
    <div className="space-y-6">
      <PipelineStats />

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Applications</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Track each role through your pipeline.
        </p>
      </div>

      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="space-y-4" role="status" aria-live="polite">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span
              className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-primary"
              aria-hidden
            />
            Loading applications…
          </div>
          <div className="flex gap-3 overflow-x-auto">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="w-56 shrink-0 space-y-2">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ))}
          </div>
        </div>
      ) : applications.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No applications yet"
          description="Browse your scored matches, pick a role you like, and use Customize application to generate a tailored resume and cover letter. It'll appear here for tracking."
          actions={[
            {
              label: "Browse matches",
              href: "/matches",
              variant: "default",
            },
            {
              label: "Edit your profile",
              href: "/profile",
              variant: "outline",
            },
          ]}
        />
      ) : (
        <>
          <div className="-mx-4 overflow-x-auto px-4 pb-2">
            <div className="flex min-w-max gap-3">
              {KANBAN_COLUMNS.map((status) => {
                const cards = byStatus(status);
                return (
                  <section
                    key={status}
                    className="flex w-56 shrink-0 flex-col gap-2"
                  >
                    <header className="flex items-baseline justify-between gap-2 border-b border-neutral-200 pb-2">
                      <h2 className="text-sm font-semibold text-neutral-800">
                        {labelFor(status)}
                      </h2>
                      <span className="text-xs text-neutral-500">
                        {cards.length}
                      </span>
                    </header>
                    <div className="flex flex-col gap-2">
                      {cards.length === 0 ? (
                        <p className="text-xs text-neutral-400">Empty</p>
                      ) : (
                        cards.map(renderCard)
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>

          <section className="border-t border-neutral-200 pt-4">
            <button
              type="button"
              onClick={() => setArchivedOpen((o) => !o)}
              className="flex items-center gap-2 text-sm font-medium text-neutral-700 hover:text-neutral-900"
            >
              <span aria-hidden>{archivedOpen ? "▾" : "▸"}</span>
              Archived
              <span className="font-normal text-neutral-500">
                ({archived.length})
              </span>
            </button>
            {archivedOpen ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {archived.length === 0 ? (
                  <p className="text-xs text-neutral-400">No archived items</p>
                ) : (
                  archived.map(renderCard)
                )}
              </div>
            ) : null}
          </section>
        </>
      )}
    </div>
  );
}
