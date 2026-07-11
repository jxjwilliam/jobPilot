"use client";

import type { Preferences } from "@/lib/profile/types";
import { CsvListInput } from "@/components/profile/CsvListInput";

type Props = {
  value: Preferences;
  onChange: (next: Preferences) => void;
};

export function PreferencesEditor({ value, onChange }: Props) {
  return (
    <div className="space-y-4">
      <CsvListInput
        label="Target roles (comma-separated)"
        value={value.roles}
        onChange={(roles) => onChange({ ...value, roles })}
        placeholder="Software Engineer, Backend Engineer"
      />

      <CsvListInput
        label="Locations (comma-separated)"
        value={value.locations}
        onChange={(locations) => onChange({ ...value, locations })}
        placeholder="San Francisco, Remote"
      />

      <label className="block text-sm font-medium">
        Remote preference
        <select
          className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          value={value.remote_pref}
          onChange={(e) =>
            onChange({ ...value, remote_pref: e.target.value })
          }
        >
          <option value="">Select…</option>
          <option value="remote">Remote only</option>
          <option value="hybrid">Hybrid ok</option>
          <option value="onsite">On-site ok</option>
          <option value="any">Any</option>
        </select>
      </label>

      <label className="block text-sm font-medium">
        Salary floor (USD)
        <input
          type="number"
          min={0}
          className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          value={value.salary_floor ?? ""}
          onChange={(e) => {
            const raw = e.target.value;
            onChange({
              ...value,
              salary_floor: raw === "" ? null : Number(raw),
            });
          }}
          placeholder="150000"
        />
      </label>

      <CsvListInput
        label="Excluded industries (comma-separated)"
        value={value.excluded_industries}
        onChange={(excluded_industries) =>
          onChange({ ...value, excluded_industries })
        }
        placeholder="Gambling, Tobacco"
      />
    </div>
  );
}
