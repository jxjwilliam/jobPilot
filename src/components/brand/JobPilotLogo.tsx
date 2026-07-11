export function JobPilotMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden
    >
      <rect width="32" height="32" rx="8" fill="#0F172A" />
      <path
        d="M8 22V10h3.2c2.4 0 3.9 1.3 3.9 3.3 0 1.3-.7 2.3-1.8 2.8L16.2 22h-2.5l-2.6-5.2H10.6V22H8zm2.6-7.3h.7c1.1 0 1.7-.5 1.7-1.4s-.6-1.4-1.7-1.4h-.7v2.8z"
        fill="#F8FAFC"
      />
      <path
        d="M18.2 22l3.3-12h2.8l3.3 12h-2.6l-.6-2.3h-3.6L19.8 22h-1.6zm3.2-4.4h2.4l-1.2-4.5-1.2 4.5z"
        fill="#38BDF8"
      />
      <circle cx="25.5" cy="8.5" r="2.2" fill="#38BDF8" />
    </svg>
  );
}

export function JobPilotLogo({
  className = "h-7",
  showWordmark = true,
}: {
  className?: string;
  showWordmark?: boolean;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <JobPilotMark className="h-7 w-7 shrink-0" />
      {showWordmark ? (
        <span className="text-sm font-semibold tracking-tight text-slate-900">
          JobPilot
        </span>
      ) : null}
    </span>
  );
}
