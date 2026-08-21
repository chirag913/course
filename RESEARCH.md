# Research

Findings from inspecting the environment before writing any code.

## Starting state

- `C:\Users\pc\Desktop\Chirag Sharma COURSE PLATFORM` was an **empty directory** — no existing app, no git history, nothing to preserve or migrate. This is a from-scratch build.
- The sibling working directory `C:\Users\pc\Jorunal` contains unrelated projects (`decoory`, `trading-journal`, `graphics`) that share nothing with this build and were left untouched.
- Toolchain available: Node v24.11.1, npm 11.6.2, git 2.52.0. No Supabase CLI, no Vercel CLI installed locally — both are optional for local development (the app talks to a hosted Supabase project over its REST/Auth/Storage APIs; the CLI is only needed if you want local Postgres or CLI-driven migrations, see SETUP.md).

## Decisions this implied

- No legacy code, so no compatibility constraints — the stack and structure follow the spec directly (Next.js App Router, TypeScript, Tailwind, Supabase, Razorpay).
- Because there's no live Supabase or Razorpay project yet, the app is built against real SDKs and real RLS-secured queries throughout (nothing is mocked), but it cannot be exercised end-to-end until the operator provisions those two services and fills in `.env.local` — see SETUP.md for the exact steps.
- `next.config.ts` was initially used but Next 14.2 (the latest 14.x, chosen for stability over the 15 beta line) does not support a TypeScript config file — it was replaced with `next.config.mjs`.

## Verification performed

- `tsc --noEmit` — passes with zero errors under `strict` + `noUncheckedIndexedAccess`.
- `next build` — completes successfully (with placeholder env vars, since dynamic routes that call `cookies()` are never statically prerendered against a real database).
