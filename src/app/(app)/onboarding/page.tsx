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
  saveProfile,
  uploadResume,
} from "@/components/profile/api";
import { PreferencesEditor } from "@/components/profile/PreferencesEditor";
import { ResumeFieldsEditor } from "@/components/profile/ResumeFieldsEditor";

type Step = "upload" | "resume" | "preferences" | "done";

const steps: Step[] = ["upload", "resume", "preferences", "done"];

export default function OnboardingPage() {
  const [step, setStep] = useState<Step>("upload");
  const [resume, setResume] = useState<ParsedResume>(emptyParsedResume());
  const [preferences, setPreferences] =
    useState<Preferences>(emptyPreferences());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parseWarning, setParseWarning] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const profile = await fetchProfile();
        if (cancelled) return;
        setResume(profile.resume_parsed);
        setPreferences(profile.preferences);
        if (profile.resume_raw_url) {
          setStep("resume");
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
    setParseWarning(null);
    try {
      const result = await uploadResume(file);
      setResume(result.resume_parsed);
      if (result.preferences) setPreferences(result.preferences as Preferences);
      if (result.parse_error) setParseWarning(result.parse_error);
      setStep("resume");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveResume() {
    setBusy(true);
    setError(null);
    try {
      await saveProfile({ resume_parsed: resume });
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
    return <p className="text-sm text-neutral-600">Loading profile…</p>;
  }

  const stepIndex = steps.indexOf(step);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Onboarding</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Upload your resume, confirm what we extracted, then set job preferences.
      </p>

      <ol className="mt-6 flex flex-wrap gap-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
        {["Upload", "Resume", "Preferences", "Done"].map((label, i) => (
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
      {parseWarning ? (
        <p className="mt-4 text-sm text-amber-700" role="status">
          Parse note: {parseWarning}. You can fill in the fields manually.
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
            <p className="text-sm text-neutral-600">Uploading and parsing…</p>
          ) : null}
        </div>
      ) : null}

      {step === "resume" ? (
        <div className="mt-8 space-y-6">
          <ResumeFieldsEditor value={resume} onChange={setResume} />
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => setStep("upload")}
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium disabled:opacity-60"
            >
              Back
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleSaveResume}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {busy ? "Saving…" : "Continue"}
            </button>
          </div>
        </div>
      ) : null}

      {step === "preferences" ? (
        <div className="mt-8 space-y-6">
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
