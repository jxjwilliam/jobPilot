/**
 * Mark match rows as applied and optionally filter applied ones out.
 * Pure and unit-testable; used by the matches feed API.
 */
export function markAndFilterApplied<T extends { posting_id: string }>(
  rows: T[],
  appliedPostingIds: Iterable<string>,
  includeApplied: boolean
): (T & { applied: boolean })[] {
  const set = new Set(appliedPostingIds);
  return rows
    .map((r) => ({ ...r, applied: set.has(r.posting_id) }))
    .filter((r) => includeApplied || !r.applied);
}
