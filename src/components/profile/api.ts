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
  const res = await fetch("/api/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Failed to save profile");
  }
  return res.json() as Promise<ProfilePayload>;
}

export async function uploadResume(file: File): Promise<
  ProfilePayload & { parse_error?: string | null }
> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/profile/resume", {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Upload failed");
  }
  return res.json() as Promise<ProfilePayload & { parse_error?: string | null }>;
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
