"use client";

import type { Preferences } from "@/lib/profile/types";
import { csvToList, listToCsv } from "@/components/profile/api";

type Props = {
  value: Preferences;
  onChange: (next: Preferences) => void;
};

export function PreferencesEditor({ value, onChange }: Props) {
  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium">
        Target roles (comma-separated)
        <input
          className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          value={listToCsv(value.roles)}
          onChange={(e) =>
            onChange({ ...value, roles: csvToList(e.target.value) })
          }
          placeholder="Software Engineer, Backend Engineer"
        />
      </label>

      <label className="block text-sm font-medium">
        Locations (comma-separated)
        <input
          className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          value={listToCsv(value.locations)}
          onChange={(e) =>
            onChange({ ...value, locations: csvToList(e.target.value) })
          }
          placeholder="San Francisco, Remote"
        />
      </label>

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

      <label className="block text-sm font-medium">
        Excluded industries (comma-separated)
        <input
          className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          value={listToCsv(value.excluded_industries)}
          onChange={(e) =>
            onChange({
              ...value,
              excluded_industries: csvToList(e.target.value),
            })
          }
          placeholder="Gambling, Tobacco"
        />
      </label>
    </div>
  );
}
