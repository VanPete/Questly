# Questly

Daily curiosity quests. Pick a topic tile, then explore with summaries, plans, quizzes, and examples.

## Tech

- Next.js 15 (App Router, Turbopack)
- React 19
- Tailwind CSS v4
- SWR (data fetching)

## Local dev

```powershell
npm install
npm run dev
```

Open <http://localhost:3000>

## Env (optional)

- `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `MODEL_NAME`
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Stripe (premium): `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_SITE_URL`
- Webhook writes: `SUPABASE_SERVICE_ROLE_KEY` (server-only, used by webhook to upsert `user_subscriptions`)

See ROADMAP.md for current status and next steps.

## License

MIT
