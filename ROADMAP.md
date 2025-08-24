# Questly Roadmap

Status: August 24, 2025

## ✅ Completed

- Nightly topic rotation cron (00:00 UTC) via `vercel.json` and `/api/admin/rotate-daily` (cron/secret protected)
- Question generation caching: in-memory + persistent Supabase `question_cache` table with read-through/write-through in `/api/questions/generate`
- Daily leaderboard API and server page (`/api/leaderboard/daily`, `/leaderboard`)
- Daily leaderboard snapshot endpoint + cron (23:59 UTC) writing to `leaderboard_daily`
- Landing page with CTAs (`/`)
- Subscription endpoint for gating (`/api/subscription`)
- Lifetime leaderboard API (premium) and UI section
- Chat gating for free users (limit 5 user messages), Upgrade pathway
- Stripe: checkout (`/api/stripe/checkout`) and webhook (`/api/stripe/webhook`) syncing `user_subscriptions`
- Upgrade page (`/upgrade`) with 401 auto-redirect to `/login?next=/upgrade`

## 🎯 Next Up (Short term)

- Configure and test Stripe in deployment
  - Set `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_SITE_URL`
  - Verify webhook events update `user_subscriptions`
- Premium UX polish
  - Emphasize 6 premium tiles on `/daily`; show Upgrade CTA for free users
  - Optional: gate lifetime leaderboard view with a clearer Upgrade prompt state
- Leaderboard names
  - Replace `user_id` prefixes with display names from `profiles` (mind RLS/privacy)
- Security tightening
  - Restrict RLS for `question_cache` and `leaderboard_daily` writes; consider service role for cron writes
- CI / Quality
  - Add CI to lint and build on PRs; add a tiny smoke check for key routes

## 🔭 Later

- Retry/backoff and circuit breaker around OpenAI generation; optional cache TTL
- Plan/quiz history UI and richer summaries
- Achievements, streak insurance details, and referrals
- Mobile polish and minor performance passes

## Crons

- Rotate daily topics: 00:00 UTC → `/api/admin/rotate-daily`
- Snapshot leaderboard: 23:59 UTC → `/api/admin/snapshot-leaderboard`
