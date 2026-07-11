import Link from "next/link";
import { JobPilotLogo } from "@/components/brand/JobPilotLogo";

const links = [
  { href: "/matches", label: "Matches" },
  { href: "/applications", label: "Applications" },
  { href: "/profile", label: "Profile" },
  { href: "/usage", label: "Usage" },
] as const;

export function AppNav() {
  return (
    <header className="border-b border-neutral-200">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-6 px-4 py-3">
        <Link href="/matches" className="hover:opacity-90">
          <JobPilotLogo />
        </Link>
        <nav className="flex flex-wrap items-center gap-4 text-sm text-neutral-600">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="hover:text-neutral-900"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
