"use client";

import type { ParsedResume } from "@/lib/llm/schemas";
import type { Preferences } from "@/lib/profile/types";

export type ProfilePayload = {
  resume_parsed: ParsedResume;
  preferences: Preferences;
  resume_raw_url: string | null;
};

export async function fetchProfile(): Promise<ProfilePayload> {
  const res = await fetch("/api/profile");
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Failed to load profile");
  }
  return res.json() as Promise<ProfilePayload>;
}

export async function saveProfile(payload: {
  resume_parsed?: ParsedResume;
  preferences?: Preferences;
}): Promise<ProfilePayload> {
  // Commit any focused CSV draft inputs before reading React state.
  if (typeof document !== "undefined") {
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
    await new Promise((r) => setTimeout(r, 0));
  }

  const res = await fetch("/api/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    details?: unknown;
  } & Partial<ProfilePayload>;
  if (!res.ok) {
    const detail =
      body.details && typeof body.details === "object"
        ? ` (${JSON.stringify(body.details).slice(0, 200)})`
        : "";
    throw new Error((body.error ?? "Failed to save profile") + detail);
  }
  return body as ProfilePayload;
}

export async function uploadResume(file: File): Promise<
  ProfilePayload & { parse_error?: string | null; autofilled?: boolean }
> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/profile/resume", {
    method: "POST",
    body: form,
  });
  const body = (await res.json().catch(() => ({}))) as ProfilePayload & {
    error?: string;
    parse_error?: string | null;
    autofilled?: boolean;
  };
  if (!res.ok) {
    throw new Error(body.error ?? "Upload failed");
  }
  return body;
}

export async function reparseResume(): Promise<
  ProfilePayload & { parse_error?: string | null; autofilled?: boolean }
> {
  const res = await fetch("/api/profile/resume/reparse", { method: "POST" });
  const body = (await res.json().catch(() => ({}))) as ProfilePayload & {
    error?: string;
    parse_error?: string | null;
    autofilled?: boolean;
  };
  if (!res.ok) {
    throw new Error(body.error ?? "Re-extract failed");
  }
  return body;
}

export function csvToList(value: string): string[] {
  return value
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function listToCsv(value: string[]): string {
  return value.join(", ");
}
