# Sessions log

Chronological record of work sessions on this project. Newest first. Each entry is a structured summary written at the end of a session to help future sessions resume cold without replaying transcripts.

---

## 2026-11-24: Build, eval, deploy and harden the supplier payment inquiry agent

**Outcome:** Shipped live at https://supplier-payment-desk.vercel.app with Supabase sign-in. Mid-task: company/supplier policies are built and tested but **not yet committed or deployed**; a full 58-case eval run was in progress when this was logged.

**Key decisions**
- Next.js + TypeScript on Vercel, Claude Opus 5.5 via a hand-written Messages API tool loop (not Managed Agents): owning the loop is the interview story, and the eval runner calls the same code in-process.
- Three-layer safety: prompt for judgment, guards in `tools.ts` for rules, Supabase row level security for isolation. Evals proved the prompt alone isn't enough: prompt-only v2 opened a bank change for the fraud-flagged supplier in every run.
- Identity comes only from the signed-in session, never chat text. Cross-supplier lookups return "not found" (absence, not refusal).
- Evals: code checks + Sonnet 5.5 judge. Added 12 hard cases once v2 hit 100% on the core 38. Fixed two grader false positives after reading transcripts (a date-string leak check, and the judge penalising "write from your registered email").
- Sign-in is email-link only (no supplier ID field, no passwords) per Michael. Uses Supabase **implicit flow** (`/auth/confirm` reads tokens from the URL fragment, `/api/auth/session` verifies with `getUser`), because the PKCE flow broke when links were opened in another browser or after a second request.
- v1/v2 agent toggle stays public (Michael removed it, then asked to keep it). v1 deliberately reads everything with the service key to demo leaks.
- Policies: 8 general Meridian AP policies (AP-01 to AP-08) + one agreement per supplier (SA-1001 to SA-1005), some sections `internal`. `lookup_policy` returns general + own agreement only; keyword search with stop words and an own-agreement boost.

**Files touched**
- `src/lib/agent/{data,tools,prompts,agent,repo,repo-supabase,policies}.ts`: mock AP data, 9 guarded tools, v1/v2 prompts, loop, data layer (memory + Supabase), policy library.
- `src/app/{page,login/page,admin/page,scorecard/page}.tsx`, `src/app/auth/{callback,confirm}`, `src/app/api/{chat,me,auth/*,admin/users}`: UI, sign-in, admin user management.
- `src/proxy.ts`, `src/lib/supabase/server.ts`: session refresh, Supabase clients, `ADMIN_EMAILS`.
- `supabase/schema.sql`, `scripts/db-setup.mts`, `scripts/db-security.test.mts`: schema + RLS, seed, 13 live security checks.
- `evals/{cases,run,judge,grade,guards.test,scorecard}`: 58 cases, runner with cost estimate, judge, 15 offline tests.
- `README.md`, `SCORECARD.md`, project summary Claude doc (https://claude.ai/artifact/92cyhwAZjaWUkucvmjqnyV, now with a Production readiness table).

**Open questions / next steps**
- Me: when the background eval finishes, run `npm run scorecard`, commit the policy work, push, verify `lookup_policy` on the live site.
- Michael: decide on the read-only lockdown (replace service-key use in the v2 agent with two narrow DB functions; recommended keeping the one "log a case" write).
- Michael: rotate secrets that were pasted in chat (Anthropic key, Supabase secret key, DB password); update Vercel env + `.env.local`, redeploy.
- Michael: test email sign-in (Supabase built-in email = 2/hour; last sends ~02:38 UTC). Optional: Gmail SMTP to lift the limit and allow template edits.
- Last committed scorecard (50 cases): v1 72%, v2-prompt-only 98%, v2 100%; 0 violations for v2. Scores vary a few points between runs.

**Resume context**
- `.env.local` holds `ANTHROPIC_API_KEY`, Supabase URL/publishable/secret keys, `DATABASE_URL` (session pooler), `ADMIN_EMAILS`. `evals/env.ts` loads it with override because the shell has an old, credit-less `ANTHROPIC_API_KEY`; `.claude/launch.json` runs dev with that var unset for the same reason.
- `npm run db:setup` **drops and reseeds** all app tables (cases and admin-added users are lost). Already reseeded with policies.
- Vercel: `NEXT_PUBLIC_*` vars must be "Config" type (Secret type rejects them); env changes need a redeploy. Supabase Site URL and redirect URLs are set to the live domain and `localhost:3000/**`.
- Supabase built-in email can't use edited templates without custom SMTP, so emails carry links, not codes.
- Next 16: middleware is `proxy.ts`; `export const dynamic` is rejected (cacheComponents), use `await connection()`.
- Claude in Chrome tabs open in a separate tab group Michael may not see; he can't find forms filled there.
- Commits so far are on `main`, pushed to github.com/mikecarswell/supplier-payment-desk (public); Vercel auto-deploys on push.
