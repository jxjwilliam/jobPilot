"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Sparkles, FileText, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { PipelineStats } from "@/components/PipelineStats";

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
  if (score >= 80) return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (score >= 65) return "bg-sky-100 text-sky-800 border-sky-200";
  if (score >= 50) return "bg-amber-100 text-amber-800 border-amber-200";
  return "bg-neutral-100 text-neutral-700 border-neutral-200";
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
  const [totalPostings, setTotalPostings] = useState<number | null>(null);
  const [totalScores, setTotalScores] = useState<number | null>(null);
  const [scoringProgress, setScoringProgress] = useState<{
    index: number;
    total: number;
    scored: number;
    errors: number;
    currentCompany?: string;
    currentTitle?: string;
  } | null>(null);

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
      const [res, allRes, statsRes] = await Promise.all([
        fetch(`/api/postings?${queryString}`),
        fetch(`/api/postings?min_score=0`),
        fetch("/api/stats"),
      ]);
      const data = (await res.json()) as {
        postings?: MatchedPosting[];
        error?: string;
        count?: number;
      };
      const allData = (await allRes.json()) as { postings?: MatchedPosting[] };
      const statsData = (await statsRes.json()) as {
        total_postings?: number;
        scored_count?: number;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to load matches");
      }
      const list = data.postings ?? [];
      setPostings(list);
      const all = allData.postings ?? [];
      setBelowMinCount(
        Math.max(0, all.length - all.filter((p) => p.score >= minScore).length)
      );
      setTotalPostings(statsData.total_postings ?? null);
      setTotalScores(statsData.scored_count ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [queryString, minScore]);

  useEffect(() => {
    void loadMatches();
  }, [loadMatches]);

  // Auto-score: if postings exist but nothing is scored yet, kick off scoring
  const [autoScored, setAutoScored] = useState(false);
  useEffect(() => {
    if (
      !loading &&
      !scoring &&
      !autoScored &&
      totalPostings != null &&
      totalPostings > 0 &&
      totalScores === 0
    ) {
      setAutoScored(true);
      void handleScoreNow();
    }
  }, [loading, scoring, autoScored, totalPostings, totalScores]);

  async function handleScoreNow() {
    setScoring(true);
    setError(null);
    setStatus(null);
    setScoringProgress(null);

    try {
      const res = await fetch("/api/score/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 20, stream: true }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error ?? `Scoring failed (${res.status})`);
      }

      // Read SSE stream
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6)) as {
              type: string;
              index?: number;
              total?: number;
              scored?: number;
              errors?: number;
              company?: string;
              title?: string;
              attempted?: number;
              totals?: { scores?: number; scores_gte_50?: number };
              message?: string;
            };

            if (event.type === "progress") {
              setScoringProgress({
                index: event.index ?? 0,
                total: event.total ?? 0,
                scored: event.scored ?? 0,
                errors: event.errors ?? 0,
                currentCompany: event.company,
                currentTitle: event.title,
              });
            } else if (event.type === "done") {
              setStatus(
                `Scored ${event.scored ?? 0} of ${event.attempted ?? 0} role-matched jobs` +
                  (event.errors ? ` (${event.errors} errors)` : "") +
                  (event.totals?.scores_gte_50 != null
                    ? `. ${event.totals.scores_gte_50} total at score ≥ 50.`
                    : ".")
              );
              setScoringProgress(null);
            } else if (event.type === "error") {
              setError(event.message ?? "Scoring stream error");
              setScoringProgress(null);
            }
          } catch {
            // skip malformed events
          }
        }
      }
      await loadMatches();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scoring failed");
      setScoringProgress(null);
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
      <PipelineStats />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Matches</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Jobs scored against your resume.{" "}
            <strong>Customize application</strong> drafts a tailored resume +
            cover letter for that role (you still apply on the company site).
          </p>
        </div>
        <Button
          disabled={scoring || loading}
          onClick={() => void handleScoreNow()}
          size="sm"
        >
          <Sparkles className="mr-1.5 h-4 w-4" />
          {scoring ? "Scoring…" : "Score more matches"}
        </Button>
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

      {scoringProgress ? (
        <div className="space-y-2 rounded-lg border bg-card p-4" role="status">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-foreground">
              Scoring matches…
            </span>
            <span className="tabular-nums text-muted-foreground">
              {scoringProgress.index} / {scoringProgress.total}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{
                width: `${scoringProgress.total > 0 ? Math.round((scoringProgress.index / scoringProgress.total) * 100) : 0}%`,
              }}
            />
          </div>
          {scoringProgress.currentCompany && scoringProgress.currentTitle ? (
            <p className="text-xs text-muted-foreground">
              {scoringProgress.currentTitle} at {scoringProgress.currentCompany}
            </p>
          ) : null}
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>
              <strong className="text-foreground">{scoringProgress.scored}</strong>{" "}
              scored
            </span>
            {scoringProgress.errors > 0 ? (
              <span className="text-destructive">
                <strong>{scoringProgress.errors}</strong> errors
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

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
        <div className="space-y-4" role="status" aria-live="polite">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span
              className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-primary"
              aria-hidden
            />
            Loading matches…
          </div>
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2 rounded-lg border p-4">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-96" />
              </div>
            ))}
          </div>
        </div>
      ) : postings.length === 0 ? (
        <div className="space-y-4">
          {totalScores === 0 && totalPostings != null && totalPostings > 0 ? (
            /* Postings exist but none scored — prompt to score */
            <EmptyState
              icon={Sparkles}
              title="Ready to discover your matches"
              description={`We've collected ${totalPostings.toLocaleString()} active job postings from Greenhouse and Lever. Score them against your profile to find your best fits.`}
              hint="Scoring uses AI to compare your resume with each job description."
              actions={[
                {
                  label: scoring ? "Scoring…" : "Score matches now",
                  onClick: () => void handleScoreNow(),
                  variant: "default",
                },
                {
                  label: "Edit your profile",
                  href: "/profile",
                  variant: "outline",
                },
              ]}
            />
          ) : totalPostings === 0 ? (
            /* No postings at all — need to run ATS poller */
            <EmptyState
              icon={Search}
              title="No job postings yet"
              description="Job postings haven't been pulled from company career sites yet. This is done automatically, or you can trigger a manual refresh."
              hint="Postings are pulled from Greenhouse and Lever public APIs."
              actions={[
                {
                  label: "Check your profile",
                  href: "/profile",
                  variant: "default",
                },
              ]}
            />
          ) : (
            /* Scored but below threshold */
            <div className="space-y-4">
              <EmptyState
                icon={Filter}
                title="No matches for current filters"
                description={
                  belowMinCount > 0
                    ? `You have ${belowMinCount} scored job${belowMinCount === 1 ? "" : "s"} below the minimum score of ${minScore}. Try lowering the threshold or clearing other filters.`
                    : "Try lowering the minimum score, widening the date range, or clearing location filters."
                }
                actions={[
                  {
                    label: "Lower to score 0+",
                    onClick: () => setMinScore(0),
                    variant: "default",
                  },
                  {
                    label: "Reset all filters",
                    onClick: () => {
                      setMinScore(0);
                      setMaxAgeDays("");
                      setLocation("Canada");
                      setDraftLocation("Canada");
                      setRemoteOnly(false);
                      setQuery("");
                      setDraftQuery("");
                    },
                    variant: "outline",
                  },
                  {
                    label: scoring ? "Scoring…" : "Score more",
                    onClick: () => void handleScoreNow(),
                    variant: "secondary",
                  },
                ]}
              />
            </div>
          )}
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
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums ${scoreTone(posting.score)}`}
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
                        <Badge
                          key={skill}
                          variant="secondary"
                          className="text-xs font-normal"
                        >
                          {skill}
                        </Badge>
                      ))}
                      {posting.matched_skills.length > 6 ? (
                        <Badge variant="outline" className="text-xs font-normal">
                          +{posting.matched_skills.length - 6} more
                        </Badge>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="flex shrink-0 flex-col gap-2 sm:items-stretch">
                  <Button
                    size="sm"
                    disabled={tailoringId === posting.posting_id}
                    onClick={() => handleTailor(posting.posting_id)}
                    title="Generate a tailored resume and cover letter for this job"
                  >
                    <FileText className="mr-1.5 h-4 w-4" />
                    {tailoringId === posting.posting_id
                      ? "Opening…"
                      : "Customize application"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      router.push(`/interview/${posting.posting_id}`)
                    }
                    title="Practice with AI-generated interview questions"
                  >
                    <Sparkles className="mr-1.5 h-4 w-4" />
                    Mock interview
                  </Button>
                  {posting.apply_url ? (
                    <a
                      href={posting.apply_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center rounded-lg border border-input bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
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
