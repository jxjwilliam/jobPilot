"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ParsedResume } from "@/lib/llm/schemas";
import {
  emptyParsedResume,
  emptyPreferences,
  type Preferences,
} from "@/lib/profile/types";
import {
  fetchProfile,
  reparseResume,
  saveProfile,
  uploadResume,
} from "@/components/profile/api";
import { PreferencesEditor } from "@/components/profile/PreferencesEditor";
import { ResumeFieldsEditor } from "@/components/profile/ResumeFieldsEditor";

type Step = "upload" | "resume" | "preferences" | "done";

const steps: Step[] = ["upload", "resume", "preferences", "done"];

function autofillSummary(resume: ParsedResume, preferences: Preferences) {
  const parts = [
    resume.skills.length ? `${resume.skills.length} skills` : null,
    resume.experience.length ? `${resume.experience.length} roles` : null,
    resume.education.length ? `${resume.education.length} education` : null,
    preferences.roles.length
      ? `${preferences.roles.length} target titles`
      : null,
  ].filter(Boolean);
  return parts.length
    ? `Auto-filled from your resume: ${parts.join(", ")}. Review and continue.`
    : "Resume extracted. Review and continue.";
}

export default function OnboardingPage() {
  const [step, setStep] = useState<Step>("upload");
  const [resume, setResume] = useState<ParsedResume>(emptyParsedResume());
  const [preferences, setPreferences] =
    useState<Preferences>(emptyPreferences());
  const [hasFile, setHasFile] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autofillNote, setAutofillNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const profile = await fetchProfile();
        if (cancelled) return;
        setResume(profile.resume_parsed);
        setPreferences(profile.preferences);
        setHasFile(Boolean(profile.resume_raw_url));
        if (profile.resume_raw_url) {
          const populated =
            profile.resume_parsed.skills.length > 0 ||
            profile.resume_parsed.experience.length > 0 ||
            Boolean(profile.resume_parsed.summary?.trim());
          setStep(populated ? "resume" : "upload");
          if (populated) {
            setAutofillNote(
              autofillSummary(profile.resume_parsed, profile.preferences)
            );
          }
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
  }, []);

  async function handleUpload(file: File | null) {
    if (!file) return;
    setBusy(true);
    setError(null);
    setAutofillNote(null);
    try {
      const result = await uploadResume(file);
      setResume(result.resume_parsed);
      setPreferences(result.preferences);
      setHasFile(true);
      setAutofillNote(
        autofillSummary(result.resume_parsed, result.preferences)
      );
      setStep("resume");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Upload or AI extraction failed — try again"
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleReparse() {
    setBusy(true);
    setError(null);
    try {
      const result = await reparseResume();
      setResume(result.resume_parsed);
      setPreferences(result.preferences);
      setAutofillNote(
        autofillSummary(result.resume_parsed, result.preferences)
      );
      setStep("resume");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Re-extract failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveResume() {
    setBusy(true);
    setError(null);
    try {
      await saveProfile({ resume_parsed: resume, preferences });
      setStep("preferences");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleSavePreferences() {
    setBusy(true);
    setError(null);
    try {
      await saveProfile({ preferences });
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div
        className="flex items-center gap-2 text-sm text-neutral-600"
        role="status"
        aria-live="polite"
      >
        <span
          className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-700"
          aria-hidden
        />
        Loading profile…
      </div>
    );
  }

  const stepIndex = steps.indexOf(step);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Onboarding</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Upload your resume once — AI fills summary, skills, experience,
        education, and suggested target roles. You only review and confirm.
      </p>

      <ol className="mt-6 flex flex-wrap gap-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
        {["Upload", "Review", "Preferences", "Done"].map((label, i) => (
          <li
            key={label}
            className={
              i <= stepIndex ? "text-neutral-900" : "text-neutral-400"
            }
          >
            {i + 1}. {label}
            {i < 3 ? <span className="mx-2 text-neutral-300">/</span> : null}
          </li>
        ))}
      </ol>

      {error ? (
        <p className="mt-4 text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      {autofillNote ? (
        <p
          className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
          role="status"
        >
          {autofillNote}
        </p>
      ) : null}

      {step === "upload" ? (
        <div className="mt-8 space-y-4">
          <label className="block text-sm font-medium">
            Resume file (PDF or DOCX)
            <input
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              disabled={busy}
              className="mt-2 block w-full text-sm"
              onChange={(e) => handleUpload(e.target.files?.[0] ?? null)}
            />
          </label>
          {busy ? (
            <p className="text-sm text-neutral-600">
              Uploading and extracting fields with AI…
            </p>
          ) : null}
          {hasFile ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleReparse()}
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium disabled:opacity-60"
            >
              {busy ? "Extracting…" : "Re-extract from uploaded resume"}
            </button>
          ) : null}
        </div>
      ) : null}

      {step === "resume" ? (
        <div className="mt-8 space-y-6">
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleReparse()}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium disabled:opacity-60"
            >
              {busy ? "Re-extracting…" : "Re-extract with AI"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setStep("upload")}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium disabled:opacity-60"
            >
              Upload a different file
            </button>
          </div>
          <ResumeFieldsEditor value={resume} onChange={setResume} />
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={handleSaveResume}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {busy ? "Saving…" : "Looks good — continue"}
            </button>
          </div>
        </div>
      ) : null}

      {step === "preferences" ? (
        <div className="mt-8 space-y-6">
          <p className="text-sm text-neutral-600">
            Target roles were suggested from your resume. Adjust if needed.
          </p>
          <PreferencesEditor value={preferences} onChange={setPreferences} />
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => setStep("resume")}
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium disabled:opacity-60"
            >
              Back
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleSavePreferences}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {busy ? "Saving…" : "Finish"}
            </button>
          </div>
        </div>
      ) : null}

      {step === "done" ? (
        <div className="mt-8 space-y-4">
          <p className="text-sm text-neutral-700">
            You&apos;re set. Head to Matches to see roles scored against your
            profile.
          </p>
          <Link
            href="/matches"
            className="inline-flex rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
          >
            Go to Matches
          </Link>
        </div>
      ) : null}
    </div>
  );
}
