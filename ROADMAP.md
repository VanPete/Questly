# Questly Roadmap

Status: August 24, 2025

## Short-term / Next Up

- Configure and test Stripe in deployment
  - Set `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_SITE_URL`
  - Verify webhook events update `user_subscriptions` in production and staging
- Premium UX polish
  - Emphasize 6 premium tiles on `/daily`; show Upgrade CTA for free users
  - Gate lifetime leaderboard view with a clear Upgrade prompt for non-premium users
- Leaderboard names
  - Replace `user_id` prefixes with display names from `profiles` (mind RLS/privacy)
- Security tightening
  - Restrict RLS for `question_cache` and `leaderboard_daily` writes; use a service role or cron-only path for writes
- CI / Quality
  - Add CI (GitHub Actions) to lint, typecheck, build, and run tests on PRs
  - Add a tiny smoke check for key routes (`/api/topics`, `/api/progress`, `/api/quiz`) as part of CI

## Later

- Retry/backoff and circuit breaker around OpenAI generation; add cache TTL and eviction policy
- Plan/quiz history UI and richer summaries
- Achievements, streak insurance details, and referrals
- Mobile polish and minor performance passes

## Recommendations (actionable)

- Add a focused Accessibility pass
  - Ensure `focus-visible` outlines for keyboard users, proper ARIA labels, and keyboard navigation for quiz flows
  - Respect `prefers-reduced-motion` for tile transitions and animations
  - Add automated accessibility checks to CI (axe or similar)
- Add CI/CD and smoke checks
  - GitHub Actions that run: install, lint, typecheck, build, tests, and a small HTTP smoke test against a deployed preview
  - Fail PRs early on lint/build regressions
- Improve testing coverage
  - Add unit tests for small helpers (topic selection, scoring, points math)
  - Add integration tests for API routes using a Supabase test instance or mocking layer
  - Add a lightweight e2e or smoke workflow that verifies the core happy path (GET /api/topics -> /daily render)
- Harden RLS and cron/write paths
  - Ensure `question_cache` writes and `leaderboard_daily` snapshot writes use a service role or are executed only by a cron endpoint with a secret
  - Add tests for RLS policies where possible
- Observability & Ops
  - Add error reporting (Sentry) and basic uptime checks for cron endpoints
  - Add logging for OpenAI errors and question generation failures
- Dev environment note (Windows / OneDrive)
  - Local builds on Windows inside OneDrive can show `.next` readlink/EINVAL errors. Recommend moving the repo outside OneDrive, using WSL, or using a Linux CI/staging environment for build validation.
- Stripe & staging
  - Add a staging environment to validate Stripe webhooks and cron runs before prod
- Documentation
  - Update README with required env vars, local dev tips (WSL/on-boarding), and how to run tests locally

## Crons

- Rotate daily topics: 00:00 UTC → `/api/admin/rotate-daily`
- Snapshot leaderboard: 23:59 UTC → `/api/admin/snapshot-leaderboard`
