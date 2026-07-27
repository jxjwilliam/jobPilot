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

> **Shipping an MVP? Your README and demo still look empty?**
>
> Two AI agent skills worth trying if you want your product to *look* ready — without spending a weekend in a design tool:
>
> 📸 **`screenshot-ui`** — Ask your AI assistant to screenshot your app. It walks through every screen, captures clean images, and drops them into your README. Visitors (and investors) see what you built instead of a wall of text.
>
> 🎬 **`demo-video`** — Like [Guidde](https://www.guidde.com): turn those screenshots into a short product walkthrough video you can share on LinkedIn, in a pitch, or on your landing page. Story, scenes, narration — ready to ship.
>
> **Use them together:**
> 1. Enrich your README with real UI screenshots
> 2. Reuse the same shots as a 30–60s MVP demo video
>
> I used both on JobPilot. README went from “trust me” to “here’s the product.” Demo went from screen-share chaos to a polished 35-second walkthrough.

### Short version

> Building an MVP? Enrich your README and demo with two AI skills:
>
> `screenshot-ui` → real app screenshots in your README
> `demo-video` → Guidde-style walkthrough video from those same shots
>
> Show the product. Don’t just describe it.

---

## References

- [`04-playwright-screenshots.md`](./04-playwright-screenshots.md) — Manual Playwright + auth setup
- [`../scripts/screenshot-with-auth.mjs`](../scripts/screenshot-with-auth.mjs) — Cookie-injection screenshot pipeline
- [`../demo-output/`](../demo-output/) — Generated video artifacts
- [`../demo-output/build.sh`](../demo-output/build.sh) — Video build pipeline
