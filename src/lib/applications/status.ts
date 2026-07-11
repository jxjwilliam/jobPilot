export const ALLOWED: Record<string, string[]> = {
  discovered: ["reviewing", "archived"],
  reviewing: ["applied", "archived"],
  applied: ["screening", "rejected", "archived"],
  screening: ["interview", "rejected", "archived"],
  interview: ["offer", "rejected", "archived"],
  offer: ["archived"],
  rejected: ["archived"],
  archived: [],
};

export const KANBAN_COLUMNS = [
  "discovered",
  "reviewing",
  "applied",
  "screening",
  "interview",
  "offer",
  "rejected",
] as const;

export type ApplicationStatus = keyof typeof ALLOWED;

export function canTransition(from: string, to: string): boolean {
  return ALLOWED[from]?.includes(to) ?? false;
}

export function assertTransition(from: string, to: string): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid transition ${from} -> ${to}`);
  }
}

/** Forward / terminal moves shown as buttons on Kanban cards. */
export function nextStatuses(from: string): string[] {
  return ALLOWED[from] ?? [];
}
