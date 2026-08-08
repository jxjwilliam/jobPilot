"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { demoSignIn } from "@/lib/demo-login";
import { JobPilotLogo } from "@/components/brand/JobPilotLogo";

const demoEnabled = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">(
    "idle"
  );
  const [verifying, setVerifying] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "";

  const inIframe = typeof window !== "undefined" && window.self !== window.top;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setErrorMessage(null);

    const supabase = createClient();
    const origin = window.location.origin;
    const redirectTo = `${origin}/auth/callback${
      next ? `?next=${encodeURIComponent(next)}` : ""
    }`;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo,
      },
    });

    if (error) {
      setStatus("error");
      setErrorMessage(error.message);
      return;
    }

    setStatus("sent");
  }

  async function handleVerifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setVerifying(true);
    setErrorMessage(null);

    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: "magiclink",
    });

    if (error) {
      setErrorMessage(error.message);
      setVerifying(false);
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
          Enter your email and we&apos;ll send a magic link.
        </p>

        {status === "sent" ? (
          <div className="mt-8 space-y-4">
            <p className="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm">
              Check your email for a magic link or 6-digit code to continue.
            </p>
            {inIframe ? (
              <p className="text-sm text-neutral-600">
                The link in the email opens in a new tab and can&apos;t reach this
                embedded window — enter the 6-digit code from the email below to
                finish signing in here.
              </p>
            ) : null}
            <form onSubmit={handleVerifyCode} className="space-y-4">
              <label className="block text-sm font-medium" htmlFor="code">
                {inIframe ? "Verification code from email" : "Code from email"}
                <input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-base outline-none focus:border-neutral-900"
                  placeholder="123456"
                />
              </label>
              {errorMessage ? (
                <p className="text-sm text-red-600" role="alert">
                  {errorMessage}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={verifying}
                className="w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {verifying ? "Verifying…" : "Verify code"}
              </button>
            </form>
            <button
              type="button"
              onClick={() => setStatus("idle")}
              className="w-full text-center text-sm text-neutral-600 underline-offset-2 hover:underline"
            >
              Try a different email
            </button>
          </div>
        ) : (
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
              <button
                type="submit"
                disabled={status === "loading"}
                className="w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {status === "loading" ? "Sending…" : "Send magic link"}
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
        )}
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
