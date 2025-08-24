# Project Requirements

This document describes the prerequisites and local environment requirements for developing and running Questly.

## Prerequisites

- Node.js 20.x LTS or newer (tested with 20+)
- npm 10+
- Git
- Optional:
  - GitHub CLI (for repo automation)
  - Vercel CLI (for deployment/analytics)

## Environment variables

Copy `.env.example` to `.env.local` and fill in values:

- OpenAI (optional): `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `MODEL_NAME`, `TEMPERATURE_EXPLORE`, `TEMPERATURE_QUIZ`, `MAX_TOKENS_CHAT`, `MAX_TOKENS_SESSION`
- Supabase (optional): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Analytics (optional): `NEXT_PUBLIC_VERCEL_ANALYTICS_ID`

## Install and run

```powershell
npm install
npm run dev
```

Visit <http://localhost:3000>

## Lint and build

```powershell
npm run lint
npm run build
```

## Notes

- Tailwind CSS v4 is configured via `@tailwindcss/postcss` and `@import "tailwindcss"` in `app/globals.css`.
- `next.config.ts` pins `turbopack.root` to silence workspace-root warnings.
- Demo API routes return sample data; wire real services before production.
