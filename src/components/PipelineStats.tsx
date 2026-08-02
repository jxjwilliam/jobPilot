"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

type PipelineStatsData = {
  total_postings: number;
  scored_count: number;
  application_count: number;
  has_resume: boolean;
  last_poll_at: string | null;
  last_score_at: string | null;
};

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

export function PipelineStats() {
  const [stats, setStats] = useState<PipelineStatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const res = await fetch("/api/stats");
        if (!res.ok) return;
        const data = (await res.json()) as PipelineStatsData;
        if (!ignore) setStats(data);
      } catch {
        // silent — stats are non-critical
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    void load();
    return () => {
      ignore = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex flex-wrap gap-4 rounded-lg border bg-card px-4 py-3 text-sm">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-10" />
          </div>
        ))}
      </div>
    );
  }

  if (!stats) return null;

  const statItems = [
    {
      label: "Jobs available",
      value: stats.total_postings.toLocaleString(),
    },
    {
      label: "Scored for you",
      value: stats.scored_count.toLocaleString(),
    },
    {
      label: "Applications",
      value: stats.application_count.toLocaleString(),
    },
    {
      label: "Last poll",
      value: timeAgo(stats.last_poll_at),
    },
  ];

  return (
    <div
      className="flex flex-wrap gap-x-6 gap-y-1 rounded-lg border bg-card px-4 py-3 text-sm"
      role="status"
      aria-label="Pipeline statistics"
    >
      {statItems.map((item) => (
        <div key={item.label} className="flex items-baseline gap-1.5">
          <span className="text-muted-foreground">{item.label}</span>
          <span
            className={cn(
              "font-semibold tabular-nums",
              item.label === "Scored for you" &&
                stats.scored_count === 0 &&
                "text-amber-600"
            )}
          >
            {item.value}
          </span>
        </div>
      ))}
      {!stats.has_resume ? (
        <div className="flex items-center gap-1.5 text-amber-600">
          <span className="font-medium">⚠ Resume needed</span>
        </div>
      ) : null}
    </div>
  );
}
