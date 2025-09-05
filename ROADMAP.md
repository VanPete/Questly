# Questly Roadmap

Status: September 4, 2025

## Completed

- Premium plan entitlements and routing
  - Upgrade CTAs route to Stripe Payment Link when `NEXT_PUBLIC_STRIPE_PAYMENT_LINK` is set; fallback to `/upgrade` Checkout page
  - Premium users see 6 daily tiles (2 per difficulty); free users see 3
  - Chat limits enforced server-side: free = 3/day, premium = 10/day
  - Lifetime leaderboard gated for non-premium users with an upgrade prompt
- Daily topics rotation & timezone
  - Rotation job gated to America/New_York midnight; APIs use the same timezone for “today”
  - Premium extras selected 1 per difficulty to reach 6 total tiles
- Data model, RLS, and indices
  - `user_chat_usage` table + RPC to track daily chat usage
  - `question_cache` and `leaderboard_daily` are public-read; writes via cron/server only
- Onboarding polish
  - New users without a display name are routed to profile setup; profile page includes a Return to Quests button
- CI
  - Basic CI to build and run tests on PRs

## Short-term / Next Up

- Stripe in deployment (staging + prod)
  - Set `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_SITE_URL`, and optionally `NEXT_PUBLIC_STRIPE_PAYMENT_LINK`
  - Verify webhooks in staging: `checkout.session.completed`, `customer.subscription.updated` update `user_subscriptions`
  - Confirm success/cancel redirects: success → `/daily?upgraded=1`, cancel → `/upgrade`
- Leaderboard names
  - Replace `user_id` prefixes with `profiles.display_name` (privacy/RLS-safe)
- CI / Quality
  - Add an HTTP smoke check for key routes (`/api/topics`, `/api/progress`, `/api/quiz`) in CI
  - Consider a tiny end-to-end happy path on a preview deployment
- Observability & Ops
  - Add error reporting (Sentry) and basic uptime checks for cron endpoints
- Documentation
  - Update README with Stripe envs, staging tips, and local dev notes (Windows/OneDrive guidance)

## Later

- Retry/backoff and circuit breaker around OpenAI generation; add cache TTL and eviction policy
- Plan/quiz history UI and richer summaries
- Achievements, streak insurance details, and referrals
- Mobile polish and minor performance passes

## Recommendations (actionable)

- Accessibility pass
  - Ensure `focus-visible` outlines, proper ARIA labels, and keyboard navigation for quiz flows
  - Respect `prefers-reduced-motion` for tile transitions and animations
  - Add automated accessibility checks to CI (axe or similar)
- CI/CD and smoke checks
  - GitHub Actions that run: install, lint, typecheck, build, tests, and an HTTP smoke test for preview deployments
  - Fail PRs early on lint/build regressions
- Testing coverage
  - Add unit tests for helpers (topic selection, scoring, points math)
  - Add integration tests for API routes using a Supabase test instance or mocks
  - Add a lightweight e2e or smoke workflow verifying the core happy path (GET /api/topics → /daily render)
- Harden RLS and cron/write paths
  - Ensure `question_cache` and `leaderboard_daily` writes use a service role or cron-only endpoints with a secret
  - Add tests for RLS policies where possible
- Dev environment (Windows / OneDrive)
  - Windows + OneDrive can cause `.next` readlink/EINVAL errors; prefer WSL or repo outside OneDrive, and use Linux CI/staging for builds

## Crons

- Import topics (optional): daily via `vercel.json` → `/api/admin/import-topics`
- Rotate daily topics: hourly trigger; route writes only at America/New_York midnight → `/api/admin/rotate-daily`
- Snapshot leaderboard: every hour at minute 5 → `/api/admin/snapshot-leaderboard`
