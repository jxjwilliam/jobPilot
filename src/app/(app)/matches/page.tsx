"use client";

import { useEffect, useState } from "react";
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
  const [minScore, setMinScore] = useState(70);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tailoringId, setTailoringId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/postings?min_score=${minScore}`);
        const data = (await res.json()) as {
          postings?: MatchedPosting[];
          error?: string;
        };
        if (!res.ok) {
          throw new Error(data.error ?? "Failed to load matches");
        }
        if (!cancelled) {
          setPostings(data.postings ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [minScore]);

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
            Scored postings that fit your profile.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          Min score
          <select
            className="rounded border border-neutral-300 px-2 py-1"
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
          >
            {[50, 60, 70, 80, 90].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-neutral-500">Loading matches…</p>
      ) : postings.length === 0 ? (
        <p className="text-sm text-neutral-600">
          No matches at score ≥ {minScore} yet. Complete your profile and wait
          for scoring to run.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-200 border-t border-neutral-200">
          {postings.map((posting) => (
            <li
              key={posting.id}
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
                disabled={tailoringId === posting.id}
                onClick={() => handleTailor(posting.id)}
                className="shrink-0 rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
              >
                {tailoringId === posting.id ? "Starting…" : "Tailor"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
