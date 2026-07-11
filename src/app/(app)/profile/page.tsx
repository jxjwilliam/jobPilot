"use client";

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

export default function ProfilePage() {
  const [resume, setResume] = useState<ParsedResume>(emptyParsedResume());
  const [preferences, setPreferences] =
    useState<Preferences>(emptyPreferences());
  const [resumeUrl, setResumeUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [parseWarning, setParseWarning] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const profile = await fetchProfile();
        if (cancelled) return;
        setResume(profile.resume_parsed);
        setPreferences(profile.preferences);
        setResumeUrl(profile.resume_raw_url);
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
    setStatus(null);
    setParseWarning(null);
    try {
      const result = await uploadResume(file);
      setResume(result.resume_parsed);
      setResumeUrl(result.resume_raw_url);
      if (result.preferences) setPreferences(result.preferences as Preferences);
      if (result.parse_error) setParseWarning(result.parse_error);
      setStatus("Resume uploaded.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleSave() {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      await saveProfile({ resume_parsed: resume, preferences });
      setStatus("Profile saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-neutral-600">Loading profile…</p>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Update your resume data and job search preferences.
        </p>
      </div>

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      {status ? (
        <p className="text-sm text-neutral-700" role="status">
          {status}
        </p>
      ) : null}
      {parseWarning ? (
        <p className="text-sm text-amber-700" role="status">
          Parse note: {parseWarning}. Edit fields below as needed.
        </p>
      ) : null}

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Resume file</h2>
        {resumeUrl ? (
          <p className="text-sm text-neutral-600">
            Current file: <span className="font-mono text-xs">{resumeUrl}</span>
          </p>
        ) : (
          <p className="text-sm text-neutral-500">No resume uploaded yet.</p>
        )}
        <input
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          disabled={busy}
          className="block w-full text-sm"
          onChange={(e) => handleUpload(e.target.files?.[0] ?? null)}
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Parsed resume</h2>
        <ResumeFieldsEditor value={resume} onChange={setResume} />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Preferences</h2>
        <PreferencesEditor value={preferences} onChange={setPreferences} />
      </section>

      <button
        type="button"
        disabled={busy}
        onClick={handleSave}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {busy ? "Saving…" : "Save profile"}
      </button>
    </div>
  );
}
