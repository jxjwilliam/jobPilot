"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
import { createClient } from "@/lib/supabase/client";

export default function ProfilePage() {
  const router = useRouter();
  const [resume, setResume] = useState<ParsedResume>(emptyParsedResume());
  const [preferences, setPreferences] =
    useState<Preferences>(emptyPreferences());
  const [resumeUrl, setResumeUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

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

  async function applyAutofill(result: {
    resume_parsed: ParsedResume;
    preferences: Preferences;
    resume_raw_url: string | null;
  }) {
    setResume(result.resume_parsed);
    setPreferences(result.preferences);
    setResumeUrl(result.resume_raw_url);
    setStatus(
      `Auto-filled ${result.resume_parsed.skills.length} skills, ${result.resume_parsed.experience.length} roles from your resume.`
    );
  }

  async function handleUpload(file: File | null) {
    if (!file) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const result = await uploadResume(file);
      await applyAutofill(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleReparse() {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const result = await reparseResume();
      await applyAutofill(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Re-extract failed");
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

  async function handleDeleteAccount() {
    const confirmed = window.confirm(
      "Delete your account permanently? This removes your profile, resume files, and cannot be undone."
    );
    if (!confirmed) return;

    setDeleting(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/account/delete", { method: "DELETE" });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Could not delete account");
      }
      const supabase = createClient();
      await supabase.auth.signOut();
      router.replace("/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
      setDeleting(false);
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

  return (
    <div className="mx-auto max-w-2xl space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Upload a resume and AI fills the fields below. Edit only if something
          looks wrong.
        </p>
      </div>

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      {status ? (
        <p
          className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
          role="status"
        >
          {status}
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
        {resumeUrl ? (
          <button
            type="button"
            disabled={busy || deleting}
            onClick={() => void handleReparse()}
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium disabled:opacity-60"
          >
            {busy ? "Extracting…" : "Re-extract fields with AI"}
          </button>
        ) : null}
        {busy ? (
          <p className="text-sm text-neutral-600">
            Running AI extraction — fields will fill automatically…
          </p>
        ) : null}
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
        disabled={busy || deleting}
        onClick={handleSave}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {busy ? "Saving…" : "Save profile"}
      </button>

      <section className="space-y-3 border-t border-red-200 pt-8">
        <h2 className="text-lg font-medium text-red-800">Danger zone</h2>
        <p className="text-sm text-neutral-600">
          Permanently delete your account, resume files, and all related data.
          This cannot be undone.
        </p>
        <button
          type="button"
          disabled={busy || deleting}
          onClick={() => void handleDeleteAccount()}
          className="rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
        >
          {deleting ? "Deleting…" : "Delete account"}
        </button>
      </section>
    </div>
  );
}
