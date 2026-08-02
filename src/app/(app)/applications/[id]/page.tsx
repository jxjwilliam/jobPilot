"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Mail, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ParsedResume } from "@/lib/llm/schemas";

type ApplicationDetail = {
  id: string;
  status: string;
  tailored_resume: ParsedResume | null;
  tailored_cover_letter: string | null;
  applied_at: string | null;
  notes: string | null;
};

type PostingSummary = {
  id: string;
  company_name: string;
  title: string;
  location: string | null;
  apply_url: string | null;
};

function emptyResume(): ParsedResume {
  return { summary: "", skills: [], experience: [], education: [] };
}

function ResumeSectionView({
  label,
  resume,
}: {
  label: string;
  resume: ParsedResume;
}) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
        {label}
      </h3>

      <section>
        <h4 className="text-sm font-medium text-neutral-800">Summary</h4>
        <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-700">
          {resume.summary.trim() || "—"}
        </p>
      </section>

      <section>
        <h4 className="text-sm font-medium text-neutral-800">Skills</h4>
        <p className="mt-1 text-sm text-neutral-700">
          {resume.skills.length > 0 ? resume.skills.join(", ") : "—"}
        </p>
      </section>

      <section className="space-y-3">
        <h4 className="text-sm font-medium text-neutral-800">Experience</h4>
        {resume.experience.length === 0 ? (
          <p className="text-sm text-neutral-500">—</p>
        ) : (
          resume.experience.map((exp, i) => (
            <div key={i} className="space-y-1">
              <p className="text-sm font-medium text-neutral-900">
                {exp.title}
                {exp.company ? ` · ${exp.company}` : ""}
              </p>
              {(exp.start || exp.end) && (
                <p className="text-xs text-neutral-500">
                  {[exp.start, exp.end].filter(Boolean).join(" – ")}
                </p>
              )}
              {exp.bullets.length > 0 ? (
                <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-700">
                  {exp.bullets.map((b, j) => (
                    <li key={j}>{b}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))
        )}
      </section>

      <section className="space-y-2">
        <h4 className="text-sm font-medium text-neutral-800">Education</h4>
        {resume.education.length === 0 ? (
          <p className="text-sm text-neutral-500">—</p>
        ) : (
          resume.education.map((ed, i) => (
            <p key={i} className="text-sm text-neutral-700">
              {ed.school}
              {ed.degree ? ` · ${ed.degree}` : ""}
              {ed.year ? ` (${ed.year})` : ""}
            </p>
          ))
        )}
      </section>
    </div>
  );
}

export default function ApplicationDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [application, setApplication] = useState<ApplicationDetail | null>(
    null
  );
  const [posting, setPosting] = useState<PostingSummary | null>(null);
  const [originalResume, setOriginalResume] = useState<ParsedResume>(
    emptyResume()
  );
  const [coverLetter, setCoverLetter] = useState("");
  const [instruction, setInstruction] = useState("");
  const [coverDirty, setCoverDirty] = useState(false);
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [followUpResult, setFollowUpResult] = useState<{
    subject: string;
    body: string;
    stale_days: number;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/applications/${id}`);
      const data = (await res.json()) as {
        application?: ApplicationDetail;
        posting?: PostingSummary;
        profile?: { resume_parsed: ParsedResume };
        error?: string;
      };
      if (!res.ok || !data.application || !data.posting) {
        throw new Error(data.error ?? "Failed to load application");
      }
      setApplication(data.application);
      setPosting(data.posting);
      setOriginalResume(data.profile?.resume_parsed ?? emptyResume());
      setCoverLetter(data.application.tailored_cover_letter ?? "");
      setCoverDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleTailor() {
    setBusy("tailor");
    setError(null);
    try {
      const res = await fetch(`/api/applications/${id}/tailor`, {
        method: "POST",
      });
      const data = (await res.json()) as {
        application?: ApplicationDetail;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Tailoring failed");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tailoring failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleRegenerate() {
    if (!instruction.trim()) {
      setError("Enter an instruction before regenerating");
      return;
    }
    setBusy("regenerate");
    setError(null);
    try {
      const res = await fetch(`/api/applications/${id}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: instruction.trim() }),
      });
      const data = (await res.json()) as {
        application?: ApplicationDetail;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Regenerate failed");
      }
      setInstruction("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Regenerate failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleSaveCover() {
    setBusy("save");
    setError(null);
    try {
      const res = await fetch(`/api/applications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tailored_cover_letter: coverLetter }),
      });
      const data = (await res.json()) as {
        application?: ApplicationDetail;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Save failed");
      }
      if (data.application) {
        setApplication(data.application);
        setCoverLetter(data.application.tailored_cover_letter ?? "");
      }
      setCoverDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleFollowUp() {
    setFollowUpLoading(true);
    setError(null);
    setFollowUpResult(null);
    try {
      const res = await fetch(`/api/applications/${id}/follow-up`, {
        method: "POST",
      });
      const data = (await res.json()) as {
        subject?: string;
        body?: string;
        stale_days?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Follow-up generation failed");
      setFollowUpResult({
        subject: data.subject ?? "",
        body: data.body ?? "",
        stale_days: data.stale_days ?? 0,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Follow-up failed");
    } finally {
      setFollowUpLoading(false);
    }
  }

  async function handleMarkApplied() {
    setBusy("applied");
    setError(null);
    try {
      const payload: Record<string, string> = { status: "applied" };
      if (coverDirty) {
        payload.tailored_cover_letter = coverLetter;
      }
      const res = await fetch(`/api/applications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as {
        application?: ApplicationDetail;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Could not mark applied");
      }
      if (data.application) {
        setApplication(data.application);
        setCoverLetter(data.application.tailored_cover_letter ?? coverLetter);
        setCoverDirty(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not mark applied");
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return <p className="text-sm text-neutral-500">Loading application…</p>;
  }

  if (!application || !posting) {
    return (
      <p className="text-sm text-red-700">
        {error ?? "Application not found"}
      </p>
    );
  }

  const hasTailored = Boolean(application.tailored_resume);
  const tailored = application.tailored_resume ?? emptyResume();
  const isApplied = application.status === "applied";

  // Stale application detection: 21+ days in "applied" or "screening"
  const staleDays =
    application.applied_at &&
    ["applied", "screening"].includes(application.status)
      ? Math.floor(
          (Date.now() - new Date(application.applied_at).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : 0;
  const isStale = staleDays >= 21;

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-muted-foreground">
            Status:{" "}
            <span className="font-medium text-foreground">
              {application.status}
            </span>
            {application.applied_at ? (
              <span>
                {" "}
                · applied{" "}
                {new Date(application.applied_at).toLocaleDateString()}
              </span>
            ) : null}
          </p>
          {isStale ? (
            <Badge
              variant="destructive"
              className="text-xs"
              title="This application may need a follow-up"
            >
              <Clock className="mr-1 h-3 w-3" />
              {staleDays}d stale
            </Badge>
          ) : null}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
          {posting.title}
        </h1>
        <p className="text-sm text-neutral-700">
          {posting.company_name}
          {posting.location ? ` · ${posting.location}` : ""}
        </p>
        {posting.apply_url ? (
          <a
            href={posting.apply_url}
            target="_blank"
            rel="noreferrer"
            className="inline-block text-sm text-neutral-600 underline hover:text-neutral-900"
          >
            Open original posting
          </a>
        ) : null}
      </header>

      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {!hasTailored ? (
        <div className="space-y-3 border-t border-neutral-200 pt-6">
          <p className="text-sm text-neutral-600">
            No tailored materials yet. Generate a resume draft and cover letter
            from your profile for this role.
          </p>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void handleTailor()}
            className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
          >
            {busy === "tailor"
              ? "Generating…"
              : "Generate tailored materials"}
          </button>
        </div>
      ) : (
        <>
          <section className="space-y-4 border-t border-neutral-200 pt-6">
            <h2 className="text-lg font-medium text-neutral-900">
              Resume comparison
            </h2>
            <div className="grid gap-8 lg:grid-cols-2">
              <ResumeSectionView label="Original" resume={originalResume} />
              <ResumeSectionView label="Tailored" resume={tailored} />
            </div>
          </section>

          <section className="space-y-3 border-t border-neutral-200 pt-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-medium text-neutral-900">
                Cover letter
              </h2>
              <button
                type="button"
                disabled={busy !== null || !coverDirty}
                onClick={() => void handleSaveCover()}
                className="rounded border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-50"
              >
                {busy === "save" ? "Saving…" : "Save cover letter"}
              </button>
            </div>
            <textarea
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
              rows={12}
              value={coverLetter}
              onChange={(e) => {
                setCoverLetter(e.target.value);
                setCoverDirty(true);
              }}
            />
          </section>

          <section className="space-y-3 border-t border-neutral-200 pt-6">
            <h2 className="text-lg font-medium text-neutral-900">
              Regenerate
            </h2>
            <p className="text-sm text-neutral-600">
              Free after the first tailor — does not use another quota credit.
            </p>
            <textarea
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
              rows={3}
              placeholder="e.g. Emphasize leadership; shorten the cover letter"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
            />
            <button
              type="button"
              disabled={busy !== null || !instruction.trim()}
              onClick={() => void handleRegenerate()}
              className="rounded border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-50"
            >
              {busy === "regenerate" ? "Regenerating…" : "Regenerate"}
            </button>
          </section>

          <section className="flex flex-wrap gap-3 border-t border-neutral-200 pt-6">
            <button
              type="button"
              disabled={busy !== null || isApplied}
              onClick={() => void handleMarkApplied()}
              className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
            >
              {busy === "applied"
                ? "Updating…"
                : isApplied
                  ? "Marked applied"
                  : "Mark Applied"}
            </button>
          </section>

          {/* Stale follow-up section */}
          {(isStale || isApplied) ? (
            <section className="space-y-3 border-t border-neutral-200 pt-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-medium text-foreground">
                    Follow-up
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {isStale
                      ? `It's been ${staleDays} days since you applied. Consider sending a follow-up.`
                      : "Draft a polite follow-up email for this application."}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={followUpLoading}
                  onClick={() => void handleFollowUp()}
                >
                  <Mail className="mr-1.5 h-4 w-4" />
                  {followUpLoading ? "Drafting…" : "Draft follow-up email"}
                </Button>
              </div>

              {followUpResult ? (
                <div className="space-y-2 rounded-lg border bg-card p-4">
                  <p className="text-sm font-medium text-foreground">
                    Subject: {followUpResult.subject}
                  </p>
                  <pre className="whitespace-pre-wrap text-sm text-muted-foreground font-sans">
                    {followUpResult.body}
                  </pre>
                  <p className="text-xs text-muted-foreground">
                    This draft was saved to your application notes. Copy,
                    personalize, and send it to the recruiter.
                  </p>
                </div>
              ) : null}
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
