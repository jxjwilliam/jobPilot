"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type MatchedPosting = {
  id: string;
  posting_id: string;
  company_name: string;
  title: string;
  location: string | null;
  employment_type: string | null;
  apply_url: string | null;
  score: number;
  rationale: string;
  matched_skills: string[];
  gaps: string[];
  scored_at: string;
};

function rationaleSnippet(text: string, max = 160): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trimEnd()}…`;
}

export default function MatchesPage() {
  const router = useRouter();
  const [postings, setPostings] = useState<MatchedPosting[]>([]);
  const [minScore, setMinScore] = useState(40);
  const [loading, setLoading] = useState(true);
  const [scoring, setScoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [tailoringId, setTailoringId] = useState<string | null>(null);
  const [belowMinCount, setBelowMinCount] = useState(0);

  const loadMatches = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, allRes] = await Promise.all([
        fetch(`/api/postings?min_score=${minScore}`),
        fetch(`/api/postings?min_score=0`),
      ]);
      const data = (await res.json()) as {
        postings?: MatchedPosting[];
        error?: string;
      };
      const allData = (await allRes.json()) as { postings?: MatchedPosting[] };
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to load matches");
      }
      const list = data.postings ?? [];
      setPostings(list);
      const all = allData.postings ?? [];
      setBelowMinCount(Math.max(0, all.length - list.length));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [minScore]);

  useEffect(() => {
    void loadMatches();
  }, [loadMatches]);

  async function handleScoreNow() {
    setScoring(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/score/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 20 }),
      });
      const data = (await res.json()) as {
        scored?: number;
        attempted?: number;
        errors?: number;
        remaining_unscored_estimate?: number;
        error?: string;
        error_samples?: string[];
        totals?: { scores?: number; scores_gte_50?: number };
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Scoring failed");
      }
      setStatus(
        `Scored ${data.scored ?? 0} of ${data.attempted ?? 0} role-matched jobs` +
          (data.errors ? ` (${data.errors} errors)` : "") +
          (data.totals?.scores_gte_50 != null
            ? `. ${data.totals.scores_gte_50} total at score ≥ 50.`
            : ".") +
          (data.remaining_unscored_estimate
            ? ` ~${data.remaining_unscored_estimate} still unscored — run again to continue.`
            : "")
      );
      if (data.error_samples?.length) {
        setError(data.error_samples.join(" · "));
      }
      await loadMatches();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scoring failed");
    } finally {
      setScoring(false);
    }
  }

  async function handleTailor(postingId: string) {
    setTailoringId(postingId);
    setError(null);
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ posting_id: postingId }),
      });
      const data = (await res.json()) as {
        application?: { id: string };
        error?: string;
      };
      if (!res.ok || !data.application?.id) {
        throw new Error(data.error ?? "Could not start application");
      }
      router.push(`/applications/${data.application.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tailor failed");
      setTailoringId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Matches</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Jobs scored against your resume. Run scoring to populate this list.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            Min score
            <select
              className="rounded border border-neutral-300 px-2 py-1"
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
            >
              {[40, 50, 60, 70, 80, 90].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={scoring || loading}
            onClick={() => void handleScoreNow()}
            className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
          >
            {scoring ? "Scoring…" : "Score matches now"}
          </button>
        </div>
      </div>

      {status ? (
        <p
          className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
          role="status"
        >
          {status}
        </p>
      ) : null}

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
          Loading matches…
        </div>
      ) : postings.length === 0 ? (
        <div className="space-y-3 rounded border border-dashed border-neutral-300 bg-neutral-50 px-4 py-6">
          <p className="text-sm text-neutral-700">
            No matches at score ≥ {minScore} yet.
          </p>
          {belowMinCount > 0 ? (
            <p className="text-sm text-neutral-600">
              You have {belowMinCount} scored job{belowMinCount === 1 ? "" : "s"}{" "}
              below this threshold (often unrelated newest postings). Lower min
              score, or click <strong>Score matches now</strong> to score
              role-matched software jobs next.
            </p>
          ) : (
            <p className="text-sm text-neutral-600">
              Click <strong>Score matches now</strong> — scoring prioritizes
              titles matching your profile (software / full-stack / ML), not
              just the newest boards.
            </p>
          )}
          <div className="flex flex-wrap gap-3 pt-1">
            <button
              type="button"
              disabled={scoring}
              onClick={() => void handleScoreNow()}
              className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
            >
              {scoring ? "Scoring…" : "Score matches now"}
            </button>
            <button
              type="button"
              onClick={() => setMinScore(0)}
              className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
            >
              Show all scored (min 0)
            </button>
            <Link
              href="/profile"
              className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
            >
              Check profile
            </Link>
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-neutral-200 border-t border-neutral-200">
          {postings.map((posting) => (
            <li
              key={posting.posting_id}
              className="flex flex-col gap-3 py-5 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h2 className="text-lg font-medium text-neutral-900">
                    {posting.title}
                  </h2>
                  <span className="text-sm font-semibold tabular-nums text-neutral-800">
                    {Math.round(posting.score)}
                  </span>
                </div>
                <p className="text-sm text-neutral-700">
                  {posting.company_name}
                  {posting.location ? ` · ${posting.location}` : ""}
                </p>
                <p className="text-sm text-neutral-600">
                  {rationaleSnippet(posting.rationale)}
                </p>
              </div>
              <button
                type="button"
                disabled={tailoringId === posting.posting_id}
                onClick={() => handleTailor(posting.posting_id)}
                className="shrink-0 rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
              >
                {tailoringId === posting.posting_id
                  ? "Starting…"
                  : "Tailor"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
