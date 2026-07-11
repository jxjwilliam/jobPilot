"use client";

import type { ParsedResume } from "@/lib/llm/schemas";
import { CsvListInput } from "@/components/profile/CsvListInput";

type Props = {
  value: ParsedResume;
  onChange: (next: ParsedResume) => void;
};

export function ResumeFieldsEditor({ value, onChange }: Props) {
  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium">
        Summary
        <textarea
          className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          rows={4}
          value={value.summary}
          onChange={(e) => onChange({ ...value, summary: e.target.value })}
        />
      </label>

      <CsvListInput
        label="Skills (comma-separated)"
        value={value.skills}
        onChange={(skills) => onChange({ ...value, skills })}
        placeholder="TypeScript, React, PostgreSQL"
      />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Experience</h3>
          <button
            type="button"
            className="text-sm text-neutral-600 underline hover:text-neutral-900"
            onClick={() =>
              onChange({
                ...value,
                experience: [
                  ...value.experience,
                  { title: "", company: "", bullets: [] },
                ],
              })
            }
          >
            Add role
          </button>
        </div>
        {value.experience.length === 0 ? (
          <p className="text-sm text-neutral-500">No experience entries yet.</p>
        ) : null}
        {value.experience.map((exp, index) => (
          <div
            key={index}
            className="space-y-2 border border-neutral-200 p-3"
          >
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                placeholder="Title"
                className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
                value={exp.title}
                onChange={(e) => {
                  const experience = [...value.experience];
                  experience[index] = { ...exp, title: e.target.value };
                  onChange({ ...value, experience });
                }}
              />
              <input
                placeholder="Company"
                className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
                value={exp.company}
                onChange={(e) => {
                  const experience = [...value.experience];
                  experience[index] = { ...exp, company: e.target.value };
                  onChange({ ...value, experience });
                }}
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                placeholder="Start"
                className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
                value={exp.start ?? ""}
                onChange={(e) => {
                  const experience = [...value.experience];
                  experience[index] = { ...exp, start: e.target.value };
                  onChange({ ...value, experience });
                }}
              />
              <input
                placeholder="End"
                className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
                value={exp.end ?? ""}
                onChange={(e) => {
                  const experience = [...value.experience];
                  experience[index] = { ...exp, end: e.target.value };
                  onChange({ ...value, experience });
                }}
              />
            </div>
            <textarea
              placeholder="Bullets (one per line)"
              rows={3}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
              value={(exp.bullets ?? []).join("\n")}
              onChange={(e) => {
                const experience = [...value.experience];
                experience[index] = {
                  ...exp,
                  bullets: e.target.value.split("\n"),
                };
                onChange({ ...value, experience });
              }}
              onBlur={(e) => {
                const experience = [...value.experience];
                experience[index] = {
                  ...exp,
                  bullets: e.target.value
                    .split("\n")
                    .map((line) => line.trim())
                    .filter(Boolean),
                };
                onChange({ ...value, experience });
              }}
            />
            <button
              type="button"
              className="text-sm text-red-600 hover:underline"
              onClick={() =>
                onChange({
                  ...value,
                  experience: value.experience.filter((_, i) => i !== index),
                })
              }
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Education</h3>
          <button
            type="button"
            className="text-sm text-neutral-600 underline hover:text-neutral-900"
            onClick={() =>
              onChange({
                ...value,
                education: [...value.education, { school: "" }],
              })
            }
          >
            Add school
          </button>
        </div>
        {value.education.map((edu, index) => (
          <div
            key={index}
            className="grid gap-2 border border-neutral-200 p-3 sm:grid-cols-3"
          >
            <input
              placeholder="School"
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
              value={edu.school}
              onChange={(e) => {
                const education = [...value.education];
                education[index] = { ...edu, school: e.target.value };
                onChange({ ...value, education });
              }}
            />
            <input
              placeholder="Degree"
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
              value={edu.degree ?? ""}
              onChange={(e) => {
                const education = [...value.education];
                education[index] = { ...edu, degree: e.target.value };
                onChange({ ...value, education });
              }}
            />
            <input
              placeholder="Year"
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
              value={edu.year ?? ""}
              onChange={(e) => {
                const education = [...value.education];
                education[index] = { ...edu, year: e.target.value };
                onChange({ ...value, education });
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
