"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type MatchedPosting = {
  id: string;
  posting_id: string;
  company_name: string;
  title: string;
  location: string | null;
  employment_type: string | null;
  apply_url: string | null;
  posted_at: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  score: number;
  rationale: string;
  matched_skills: string[];
  gaps: string[];
  scored_at: string;
};

function rationaleSnippet(text: string, max = 180): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trimEnd()}…`;
}

function formatPostedDate(iso: string | null | undefined): string {
  if (!iso) return "Date unknown";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Date unknown";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function relativeAge(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const days = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  if (days < 60) return "about 1 month ago";
  return `${Math.floor(days / 30)} months ago`;
}

function scoreTone(score: number): string {
  if (score >= 80) return "bg-emerald-100 text-emerald-900";
  if (score >= 65) return "bg-sky-100 text-sky-900";
  if (score >= 50) return "bg-amber-100 text-amber-900";
  return "bg-neutral-100 text-neutral-700";
}

export default function MatchesPage() {
  const router = useRouter();
  const [postings, setPostings] = useState<MatchedPosting[]>([]);
  const [minScore, setMinScore] = useState(50);
  const [query, setQuery] = useState("");
  const [draftQuery, setDraftQuery] = useState("");
  const [location, setLocation] = useState("Canada");
  const [draftLocation, setDraftLocation] = useState("Canada");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [maxAgeDays, setMaxAgeDays] = useState<number | "">("");
  const [sort, setSort] = useState<"score" | "date">("score");
  const [loading, setLoading] = useState(true);
  const [scoring, setScoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [tailoringId, setTailoringId] = useState<string | null>(null);
  const [belowMinCount, setBelowMinCount] = useState(0);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("min_score", String(minScore));
    if (query.trim()) params.set("q", query.trim());
    if (location.trim()) params.set("location", location.trim());
    if (remoteOnly) params.set("remote", "1");
    if (maxAgeDays !== "") params.set("max_age_days", String(maxAgeDays));
    params.set("sort", sort);
    return params.toString();
  }, [minScore, query, location, remoteOnly, maxAgeDays, sort]);

  const loadMatches = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, allRes] = await Promise.all([
        fetch(`/api/postings?${queryString}`),
        fetch(`/api/postings?min_score=0`),
      ]);
      const data = (await res.json()) as {
        postings?: MatchedPosting[];
        error?: string;
        count?: number;
      };
      const allData = (await allRes.json()) as { postings?: MatchedPosting[] };
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to load matches");
      }
      const list = data.postings ?? [];
      setPostings(list);
      const all = allData.postings ?? [];
      setBelowMinCount(
        Math.max(0, all.length - all.filter((p) => p.score >= minScore).length)
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [queryString, minScore]);

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
          <p className="mt-1 max-w-2xl text-sm text-neutral-600">
            Jobs scored against your resume.{" "}
            <strong>Customize application</strong> drafts a tailored resume +
            cover letter for that role (you still apply on the company site).
          </p>
        </div>
        <button
          type="button"
          disabled={scoring || loading}
          onClick={() => void handleScoreNow()}
          className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
        >
          {scoring ? "Scoring…" : "Score more matches"}
        </button>
      </div>

      <div className="grid gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4 sm:grid-cols-2 lg:grid-cols-6">
        <label className="text-xs font-medium uppercase tracking-wide text-neutral-500 sm:col-span-2">
          Search
          <input
            value={draftQuery}
            onChange={(e) => setDraftQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setQuery(draftQuery.trim());
            }}
            onBlur={() => setQuery(draftQuery.trim())}
            placeholder="Company, title, keyword…"
            className="mt-1 w-full rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm font-normal normal-case tracking-normal text-neutral-900"
          />
        </label>

        <label className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          Location
          <input
            value={draftLocation}
            onChange={(e) => setDraftLocation(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setLocation(draftLocation.trim());
            }}
            onBlur={() => setLocation(draftLocation.trim())}
            placeholder="Canada, Remote…"
            className="mt-1 w-full rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm font-normal normal-case tracking-normal text-neutral-900"
          />
        </label>

        <label className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          Min score
          <select
            className="mt-1 w-full rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm font-normal normal-case tracking-normal text-neutral-900"
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
          >
            {[0, 40, 50, 60, 70, 80, 90].map((n) => (
              <option key={n} value={n}>
                {n}+
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          Posted within
          <select
            className="mt-1 w-full rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm font-normal normal-case tracking-normal text-neutral-900"
            value={maxAgeDays === "" ? "" : String(maxAgeDays)}
            onChange={(e) =>
              setMaxAgeDays(e.target.value === "" ? "" : Number(e.target.value))
            }
          >
            <option value="">Any time</option>
            <option value="7">7 days</option>
            <option value="14">14 days</option>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
          </select>
        </label>

        <label className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          Sort
          <select
            className="mt-1 w-full rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm font-normal normal-case tracking-normal text-neutral-900"
            value={sort}
            onChange={(e) => setSort(e.target.value as "score" | "date")}
          >
            <option value="score">Best fit</option>
            <option value="date">Newest posted</option>
          </select>
        </label>

        <label className="flex items-end gap-2 pb-1 text-sm text-neutral-700">
          <input
            type="checkbox"
            checked={remoteOnly}
            onChange={(e) => setRemoteOnly(e.target.checked)}
            className="rounded border-neutral-300"
          />
          Remote only
        </label>
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

      {!loading && postings.length > 0 ? (
        <p className="text-sm text-neutral-600">
          Showing <strong>{postings.length}</strong> match
          {postings.length === 1 ? "" : "es"}
          {belowMinCount > 0
            ? ` · ${belowMinCount} more scored below min ${minScore}`
            : ""}
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
            No matches for the current filters.
          </p>
          <p className="text-sm text-neutral-600">
            Try lowering min score, widening &ldquo;Posted within&rdquo;, clearing the
            Location or Remote-only filters, or scoring more matches.
          </p>
          <div className="flex flex-wrap gap-3 pt-1">
            <button
              type="button"
              disabled={scoring}
              onClick={() => void handleScoreNow()}
              className="rounded bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
            >
              {scoring ? "Scoring…" : "Score more matches"}
            </button>
            <button
              type="button"
              onClick={() => {
                setMinScore(0);
                setMaxAgeDays("");
                setLocation("Canada");
                setDraftLocation("Canada");
                setRemoteOnly(false);
                setQuery("");
                setDraftQuery("");
              }}
              className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
            >
              Reset filters
            </button>
            <Link
              href="/profile"
              className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
            >
              Edit preferences
            </Link>
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-neutral-200 border-t border-neutral-200">
          {postings.map((posting) => {
            const posted = posting.posted_at ?? posting.first_seen_at;
            const age = relativeAge(posted);
            return (
              <li
                key={posting.posting_id}
                className="flex flex-col gap-4 py-5 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-medium text-neutral-900">
                      {posting.title}
                    </h2>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${scoreTone(posting.score)}`}
                      title="Fit score vs your resume (0–100)"
                    >
                      Fit {Math.round(posting.score)}
                    </span>
                  </div>

                  <p className="text-sm text-neutral-700">
                    <span className="font-medium">{posting.company_name}</span>
                    {posting.location ? ` · ${posting.location}` : ""}
                    {posting.employment_type
                      ? ` · ${posting.employment_type}`
                      : ""}
                  </p>

                  <p className="text-xs text-neutral-500">
                    Posted {formatPostedDate(posted)}
                    {age ? ` (${age})` : ""}
                    {posting.last_seen_at
                      ? ` · Still open as of ${formatPostedDate(posting.last_seen_at)}`
                      : ""}
                  </p>

                  <p className="text-sm text-neutral-600">
                    {rationaleSnippet(posting.rationale)}
                  </p>

                  {posting.matched_skills.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {posting.matched_skills.slice(0, 6).map((skill) => (
                        <span
                          key={skill}
                          className="rounded bg-neutral-100 px-2 py-0.5 text-xs text-neutral-700"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="flex shrink-0 flex-col gap-2 sm:items-stretch">
                  <button
                    type="button"
                    disabled={tailoringId === posting.posting_id}
                    onClick={() => handleTailor(posting.posting_id)}
                    className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
                    title="Generate a tailored resume and cover letter for this job"
                  >
                    {tailoringId === posting.posting_id
                      ? "Opening…"
                      : "Customize application"}
                  </button>
                  {posting.apply_url ? (
                    <a
                      href={posting.apply_url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded border border-neutral-300 bg-white px-4 py-2 text-center text-sm font-medium text-neutral-800 hover:bg-neutral-50"
                    >
                      View job posting
                    </a>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
