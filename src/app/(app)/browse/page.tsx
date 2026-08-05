"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Sparkles, MapPin, Clock, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";

type BrowsePosting = {
  id: string;
  company_name: string;
  title: string;
  location: string | null;
  employment_type: string | null;
  apply_url: string | null;
  posted_at: string | null;
  description_raw: string;
};

function relativeAge(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const days = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function snippet(text: string, max = 200): string {
  const cleaned = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max).trimEnd()}…`;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function BrowsePage() {
  const router = useRouter();
  const [postings, setPostings] = useState<BrowsePosting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [draftQ, setDraftQ] = useState("");
  const [location, setLocation] = useState("");
  const [draftLocation, setDraftLocation] = useState("");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [scoringId, setScoringId] = useState<string | null>(null);
  const [lastPollAt, setLastPollAt] = useState<string | null>(null);
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (location.trim()) params.set("location", location.trim());
      if (remoteOnly) params.set("remote", "1");
      params.set("page", String(page));
      params.set("per_page", "20");

      const res = await fetch(`/api/postings/browse?${params.toString()}`);
      const data = (await res.json()) as {
        postings?: BrowsePosting[];
        total?: number;
        total_pages?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to load");
      setPostings(data.postings ?? []);
      setTotal(data.total ?? 0);
      setTotalPages(data.total_pages ?? 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [q, location, remoteOnly, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let ignore = false;
    async function loadPipelineStatus() {
      try {
        const res = await fetch("/api/pipeline/status");
        if (!res.ok) return;
        const data = (await res.json()) as {
          last_poll_at: string | null;
          running: boolean;
        };
        if (!ignore) {
          setLastPollAt(data.last_poll_at);
          setPipelineRunning(data.running);
        }
      } catch {
        // non-critical — stats are best-effort
      }
    }
    void loadPipelineStatus();
    return () => {
      ignore = true;
    };
  }, []);

  async function refreshJobs() {
    setRefreshing(true);
    try {
      await fetch("/api/pipeline/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      // Wait for the background run to finish, then reload the list.
      const deadline = Date.now() + 120_000;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const res = await fetch("/api/pipeline/status");
        if (!res.ok) break;
        const data = (await res.json()) as {
          last_poll_at: string | null;
          running: boolean;
        };
        if (data.last_poll_at) setLastPollAt(data.last_poll_at);
        if (!data.running) break;
      }
      setPipelineRunning(false);
      await load();
    } catch {
      // non-critical
    } finally {
      setRefreshing(false);
    }
  }

  async function scoreOne(postingId: string) {
    setScoringId(postingId);
    try {
      // We need a single-job scoring endpoint. For now, navigate to matches.
      const res = await fetch("/api/score/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 1 }),
      });
      if (res.ok) {
        router.push("/matches");
      }
    } catch {
      // navigate anyway
      router.push("/matches");
    } finally {
      setScoringId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Browse Jobs</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Explore all active job postings across {total.toLocaleString()} roles.
            {lastPollAt ? (
              <span className="ml-2 text-xs text-muted-foreground/80">
                · Last updated {timeAgo(lastPollAt)}
              </span>
            ) : null}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={refreshing || pipelineRunning}
          onClick={() => void refreshJobs()}
        >
          <Sparkles className="mr-1.5 h-4 w-4" />
          {refreshing || pipelineRunning ? "Refreshing…" : "Refresh now"}
        </Button>
      </div>

      {/* Search bar */}
      <div className="flex flex-wrap gap-3">
        <div className="flex flex-1 gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={draftQ}
              onChange={(e) => setDraftQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setQ(draftQ.trim());
                  setPage(1);
                }
              }}
              onBlur={() => {
                if (draftQ.trim() !== q) {
                  setQ(draftQ.trim());
                  setPage(1);
                }
              }}
              placeholder="Search title or company…"
              className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="relative w-48">
            <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={draftLocation}
              onChange={(e) => setDraftLocation(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setLocation(draftLocation.trim());
                  setPage(1);
                }
              }}
              onBlur={() => {
                if (draftLocation.trim() !== location) {
                  setLocation(draftLocation.trim());
                  setPage(1);
                }
              }}
              placeholder="Location…"
              className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={remoteOnly}
            onChange={(e) => {
              setRemoteOnly(e.target.checked);
              setPage(1);
            }}
            className="rounded border-input"
          />
          Remote only
        </label>
      </div>

      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-3 w-full" />
                <Skeleton className="mt-1 h-3 w-3/4" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : postings.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No jobs found"
          description={
            q || location
              ? "Try adjusting your search filters."
              : "No job postings have been pulled yet. This is done automatically via the ATS pipeline."
          }
          actions={[
            ...(q || location
              ? [
                  {
                    label: "Clear filters",
                    onClick: () => {
                      setQ("");
                      setDraftQ("");
                      setLocation("");
                      setDraftLocation("");
                      setRemoteOnly(false);
                      setPage(1);
                    },
                    variant: "outline" as const,
                  },
                ]
              : []),
            { label: "Go to matches", href: "/matches", variant: "default" as const },
          ]}
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {postings.map((p) => (
              <Card key={p.id} className="group transition-shadow hover:shadow-sm">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="text-base leading-snug">
                        {p.title}
                      </CardTitle>
                      <CardDescription className="mt-0.5">
                        {p.company_name}
                      </CardDescription>
                    </div>
                    <div className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {relativeAge(p.posted_at)}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {p.location ? (
                      <Badge variant="outline" className="text-xs font-normal">
                        {p.location}
                      </Badge>
                    ) : null}
                    {p.employment_type ? (
                      <Badge variant="outline" className="text-xs font-normal">
                        {p.employment_type}
                      </Badge>
                    ) : null}
                  </div>
                  {p.description_raw ? (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {snippet(p.description_raw)}
                    </p>
                  ) : null}
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={scoringId === p.id}
                      onClick={() => scoreOne(p.id)}
                    >
                      <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                      {scoringId === p.id ? "Scoring…" : "Score it"}
                    </Button>
                    {p.apply_url ? (
                      <a
                        href={p.apply_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center rounded-lg border border-input bg-background px-3 py-1.5 text-sm font-medium shadow-sm transition-colors hover:bg-muted"
                      >
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                        View
                      </a>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 ? (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
