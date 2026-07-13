# Screenshot UI + Demo Video Pipeline

Two AI agent skills that turn a live web app into a polished demo video.

## Skills overview

### `/screenshot-ui` — Auto-capture every route

Tell your agent "screenshot my app" and it:

1. Discovers all routes from the live DOM (nav links, tabs, etc.)
2. Logs in via cookie injection (auth-protected apps)
3. Captures every page at 1440×900
4. Injects a clean markdown table into your README

Supports Next.js, React SPAs, FastAPI+React, tab-based UIs. Two implementations (JS + Python), both using Playwright.

### `/demo-video` — From screenshots to product walkthrough

Turns screenshots into a 1920×1080 MP4 with:

- HTML scene files (dark mode, Inter font, spring animations)
- Narration scripts ready for edge-tts voiceover
- ffmpeg compositing with crossfade transitions
- One `bash build.sh` command for the full pipeline

Scene design system: color language (trust blue, success green, problem red), typography (48-72px titles), pacing guide (3-8s per scene).

---

## How they work together (the pipeline)

```
Live app → /screenshot-ui → real screenshots → README
                              ↓
                         /demo-video → HTML scenes → ffmpeg → MP4
```

**Applied to JobPilot** (Next.js + Supabase, auth-protected):

1. **`/screenshot-ui`** → `scripts/screenshot-with-auth.mjs` logs in via Supabase admin API → cookie injection → captures 7 routes (home, login, matches, applications, profile, onboarding, usage) → injects into README
2. **`/demo-video`** → 8 HTML scene files, each with a screenshot as hero + gradient overlay + tagline → Playwright screenshots each scene at 1920×1080 → ffmpeg composites with crossfade → `output.mp4`
3. **Result**: 35-second product walkthrough, 1920×1080, H.264+AAC, 1.5MB

---

## Key design decisions

| Decision | Why |
|---|---|
| Screenshots as hero, not thumbnail | Real UI fills the frame — looks like a product demo, not a slideshow |
| 1440×900 screenshots in 1920×1080 frame | App-window-in-dark-room look; no stretching artifacts |
| Dark background + glow effects | Makes screenshots pop; forgiving of design inconsistencies |
| Gradient overlay at bottom | Text readable over any screenshot content |
| Spring curve animation | `cubic-bezier(0.16, 1, 0.3, 1)` — snappy, not floaty |
| Narration as separate `.txt` files | Can generate with edge-tts, record manually, or skip (silent fallback) |

---

## LinkedIn post (draft)

> **Two AI agent skills that turned my SaaS demo from "meh" to "wow"**
>
> If you're building with AI coding assistants (Claude Code, Cursor, etc.), these two skills are worth knowing:
>
> 📸 **`/screenshot-ui`** — Tell your agent "screenshot my app." It auto-discovers every route from the live DOM, logs in via cookie injection, captures all pages at 1440×900, and injects them into a clean markdown table in your README. No manual ⌘+Shift+4 around the nav bar.
>
> 🎬 **`/demo-video`** — Turns those screenshots into a 1920×1080 product walkthrough video. HTML scene files + ffmpeg crossfade + narration scripts (edge-tts ready). 8 scenes composited into a 35s MP4 with one build command.
>
> **The pipeline that clicked for me:**
> 1. Agent discovers your app's routes → real login → screenshots → README
> 2. Same screenshots become the hero of each video scene
> 3. `bash build.sh` → 35s demo video ready to ship
>
> For a Next.js + Supabase app with auth, cookie-based auth, and Kanban UI — went from zero to a polished demo video in about an hour. Most of that was me iterating on the script timing.
>
> No green screen. No video editor. Just an agent, Playwright, ffmpeg, and good scene design.

### Short version

> Two agent skills, one app, 35 seconds:
>
> `/screenshot-ui` → auto-captures every route of your live app, injects into README
> `/demo-video` → turns those screenshots into a 1920×1080 product walkthrough
>
> 8 scenes. Crossfade. Narration-ready. One build command.
>
> No video editor needed.

---

## References

- [`04-playwright-screenshots.md`](./04-playwright-screenshots.md) — Manual Playwright + auth setup
- [`../scripts/screenshot-with-auth.mjs`](../scripts/screenshot-with-auth.mjs) — Cookie-injection screenshot pipeline
- [`../demo-output/`](../demo-output/) — Generated video artifacts
- [`../demo-output/build.sh`](../demo-output/build.sh) — Video build pipeline
