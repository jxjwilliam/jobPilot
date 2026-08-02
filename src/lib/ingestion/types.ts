export type AtsSource =
  | "greenhouse"
  | "lever"
  | "ashby"
  | "workable"
  | "recruitee"
  | "personio";

export type NormalizedPosting = {
  external_id: string;
  title: string;
  location: string | null;
  description_raw: string;
  apply_url: string | null;
  posted_at: string | null;
  employment_type?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  company_name: string;
};

export type CompanyRow = {
  id: string;
  ats_source: AtsSource;
  board_slug: string;
  company_name: string;
  is_active: boolean;
  consecutive_failures: number;
  last_polled_at: string | null;
};

export type PollResult = {
  polled: number;
  upserted: number;
  errors: Array<{ company: string; error: string }>;
};

export const ATS_USER_AGENT = "JobPilotBot/0.1 (+https://jobpilot.local)";
export const ATS_TIMEOUT_MS = 15_000;
export const MAX_CONSECUTIVE_FAILURES = 5;
export const POLL_BATCH_SIZE = 25;

export class AtsHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "AtsHttpError";
  }
}
