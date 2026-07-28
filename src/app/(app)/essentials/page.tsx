"use client";

import { useEffect, useState } from "react";
import type { Preferences } from "@/lib/profile/types";
import { emptyPreferences } from "@/lib/profile/types";
import { fetchProfile, saveProfile } from "@/components/profile/api";

const FIELD_LABELS: Record<keyof Pick<Preferences, "full_name" | "photo_url" | "selfie_url" | "linkedin_url" | "github_url" | "portfolio_url" | "email" | "phone" | "postcode">, string> = {
  full_name: "Full name",
  photo_url: "Photo URL",
  selfie_url: "Selfie URL",
  linkedin_url: "LinkedIn URL",
  github_url: "GitHub URL",
  portfolio_url: "Portfolio URL",
  email: "Email",
  phone: "Phone",
  postcode: "Postcode / ZIP",
};

const ESSENTIAL_FIELDS = Object.keys(FIELD_LABELS) as (keyof typeof FIELD_LABELS)[];

export default function EssentialsPage() {
  const [fullPrefs, setFullPrefs] = useState<Preferences>(emptyPreferences());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const profile = await fetchProfile();
        if (cancelled) return;
        setFullPrefs(profile.preferences);
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

  /** Convenience getter: read an essential field from fullPrefs. */
  function getEssential(key: string): string {
    const v = (fullPrefs as Record<string, unknown>)[key];
    return typeof v === "string" ? v : "";
  }

  /** Update one essential field in fullPrefs. */
  function setEssential(key: string, value: string) {
    setFullPrefs((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      await saveProfile({ preferences: fullPrefs });
      setStatus("Essentials saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function copyValue(key: string) {
    const val = getEssential(key);
    if (!val) return;
    try {
      await navigator.clipboard.writeText(val);
      setCopiedField(key);
      setTimeout(() => setCopiedField(null), 1500);
    } catch {
      // fallback: select the input text
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-neutral-600" role="status" aria-live="polite">
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-700" aria-hidden />
        Loading essentials…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Essentials</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Your personal reference info. Saved to your profile — click the copy
          button to copy any value to clipboard.
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

      <div className="space-y-4">
        {ESSENTIAL_FIELDS.map((key) => {
          const val = getEssential(key);
          return (
          <div key={key}>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              {FIELD_LABELS[key]}
            </label>
            <div className="flex gap-2">
              {key === "photo_url" || key === "selfie_url" ? (
                <div className="flex flex-1 items-center gap-3">
                  <input
                    type="text"
                    value={val}
                    onChange={(e) => setEssential(key, e.target.value)}
                    placeholder="https://…"
                    className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
                  />
                  {val ? (
                    <div className="shrink-0 h-10 w-10 rounded-full overflow-hidden border border-neutral-200 bg-neutral-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={val}
                        alt={FIELD_LABELS[key]}
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    </div>
                  ) : null}
                </div>
              ) : (
                <input
                  type={key === "email" ? "email" : "text"}
                  value={val}
                  onChange={(e) => setEssential(key, e.target.value)}
                  placeholder={`Enter ${FIELD_LABELS[key].toLowerCase()}…`}
                  className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
                />
              )}
              <button
                type="button"
                onClick={() => void copyValue(key)}
                disabled={!val}
                className="shrink-0 rounded-md border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed"
                title="Copy to clipboard"
              >
                {copiedField === key ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
          );
        })}
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          disabled={saving}
          onClick={() => void handleSave()}
          className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save essentials"}
        </button>
      </div>
    </div>
  );
}
