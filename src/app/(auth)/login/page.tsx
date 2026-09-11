"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { demoSignIn } from "@/lib/demo-login";
import { passwordSignIn } from "@/lib/password-login";
import { JobPilotLogo } from "@/components/brand/JobPilotLogo";

const demoEnabled = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

function LoginForm() {
  // Nothing is prefilled or hinted: the credentials are never rendered, so
  // every visit starts blank and has to be typed.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setErrorMessage(null);

    try {
      await passwordSignIn(email.trim(), password);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Sign in failed");
      setLoading(false);
      return;
    }

    router.replace(next.startsWith("/") ? next : "/matches");
    router.refresh();
  }

  async function handleDemoLogin() {
    setDemoLoading(true);
    setErrorMessage(null);
    try {
      await demoSignIn();
      router.replace(next.startsWith("/") ? next : "/matches");
      router.refresh();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Demo login failed");
      setDemoLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <Link href="/" className="inline-flex">
          <JobPilotLogo />
        </Link>
        <h1 className="mt-8 text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Enter your credentials to continue.
        </p>

        <div className="mt-8 space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block text-sm font-medium" htmlFor="email">
              Email
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-base outline-none focus:border-neutral-900"
                placeholder="you@example.com"
              />
            </label>
            <label className="block text-sm font-medium" htmlFor="password">
              Password
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-base outline-none focus:border-neutral-900"
                placeholder="••••••••"
              />
            </label>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
          {errorMessage ? (
            <p className="text-sm text-red-600" role="alert">
              {errorMessage}
            </p>
          ) : null}
          {demoEnabled ? (
            <>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-neutral-200" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-white px-2 text-neutral-500">or</span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleDemoLogin}
                disabled={demoLoading}
                className="w-full rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 outline-none hover:bg-neutral-50 disabled:opacity-60"
              >
                {demoLoading ? "Starting demo…" : "Try the demo"}
              </button>
            </>
          ) : null}
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen flex-col items-center justify-center p-8">
          <p className="text-sm text-neutral-600">Loading…</p>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
