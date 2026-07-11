"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
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
    return (
      <article
        key={app.id}
        className="space-y-2 border border-neutral-200 bg-white p-3"
      >
        <Link
          href={`/applications/${app.id}`}
          className="block space-y-0.5 hover:opacity-80"
        >
          <p className="text-sm font-medium text-neutral-900">
            {app.title ?? "Untitled role"}
          </p>
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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Applications</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Track each role through your pipeline.
        </p>
      </div>

      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div
          className="flex items-center gap-2 text-sm text-neutral-500"
          role="status"
          aria-live="polite"
        >
          <span
            className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-700"
            aria-hidden
          />
          Loading applications…
        </div>
      ) : applications.length === 0 ? (
        <div className="space-y-3 rounded border border-dashed border-neutral-300 bg-neutral-50 px-4 py-6">
          <p className="text-sm text-neutral-700">No applications yet.</p>
          <p className="text-sm text-neutral-600">
            Open Matches, pick a scored role, and hit Tailor to start tracking it
            here.
          </p>
          <Link
            href="/matches"
            className="inline-flex rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Browse matches
          </Link>
        </div>
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
