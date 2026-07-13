// ─── screenshot.config.js ────────────────────────────────────────────────────
// Config for screenshot.js (screenshot-ui skill)
// Copy this file into your project's scripts/ directory and edit as needed.
// ─────────────────────────────────────────────────────────────────────────────

export default {
  // ── Targets ──────────────────────────────────────────────────────────────
  // Define one or more base URLs to screenshot.
  targets: {
    localhost: "http://localhost:3000",       // Next.js default
    // localhost: "http://localhost:5173",    // Vite/React default
    // localhost: "http://localhost:8000",    // FastAPI SPA default
    // vercel: "https://your-app.vercel.app", // deployed version
  },

  // Which target(s) to run by default: "localhost" | "vercel" | "both"
  run: "localhost",

  // ── Output ───────────────────────────────────────────────────────────────
  // Where to save screenshots (relative to project root)
  outputDir: "screenshots",

  // ── Viewport ─────────────────────────────────────────────────────────────
  viewport: { width: 1440, height: 900 },

  // ── Timing ───────────────────────────────────────────────────────────────
  // Extra wait after each page load (ms) — increase for slow apps or heavy JS
  extraDelayMs: 1200,

  // Set > 0 to open a browser window for manual login before screenshots begin
  loginDelaySeconds: 0,

  // ── Route discovery ───────────────────────────────────────────────────────
  // CSS selectors used to find nav links via DOM crawl.
  // Usually you don't need to change this.
  navSelectors: [
    "nav a",
    "header a",
    '[role="navigation"] a',
    ".navbar a",
    ".nav-links a",
    ".nav-menu a",
    ".sidebar a",
    ".menu a",
    '[class*="nav"] a',
    '[class*="menu"] a',
    '[class*="sidebar"] a',
    '[class*="tab"] a',
  ],

  // ── Manual routes (fallback) ──────────────────────────────────────────────
  // Used when DOM discovery finds < 2 routes.
  manualRoutes: [
    { path: "/",          name: "Home" },
    { path: "/login",     name: "Login" },
    { path: "/onboarding", name: "Onboarding" },
    { path: "/matches",   name: "Matches" },
    { path: "/applications", name: "Applications" },
    { path: "/profile",   name: "Profile" },
    { path: "/usage",     name: "Usage" },
  ],
};
