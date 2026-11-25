# Supplier Payment Desk

An AI agent that handles the "where's my payment?" questions AP teams get buried in. Suppliers chat with it; it looks up invoices, POs and payments in a mock AP system, resolves routine questions, and hands off to a human when policy says so.

Built with Next.js, TypeScript and the Claude API (`claude-opus-5-5`, manual tool-use loop).

## What it does

- **Payment status:** scheduled dates, paid invoices with remittance details, invoices awaiting approval.
- **Holds and PO mismatches:** explains the hold and exactly what releases it (corrected invoice, credit memo, goods receipt).
- **Missing invoices:** confirms it isn't on file, opens a ticket, gives resubmission instructions.
- **Bank detail changes:** never changes anything in chat. Opens a case for a Treasury callback to the phone number already on file.
- **Escalations:** disputes, legal threats, suspected fraud or impersonation, policy exceptions.

## How it stays safe

Policy is enforced in two layers, so a clever prompt can't talk the agent out of it:

1. **Identity from the channel, not the chat.** The sender email comes from the portal login / email header. Typing "I'm the CFO of Northwind" changes nothing.
2. **Guards in the tool layer** (`src/lib/agent/tools.ts`): unverified senders get no account data, suppliers only see their own records, bank numbers are masked to the last 4, internal notes and fraud flags never leave the tool layer, and bank changes for flagged suppliers are forced to a specialist without revealing why.
3. **Policy prompt** (`src/lib/agent/prompts.ts`) covering the judgment calls code can't: when to escalate, not conceding disputes, not inventing payment dates.

## Project layout

```
src/lib/agent/data.ts      Mock AP database (5 suppliers, 6 POs, 9 invoices, 2 payments)
src/lib/agent/tools.ts     Tool definitions + guarded implementations
src/lib/agent/prompts.ts   v1 (baseline) and v2 (policy) system prompts
src/lib/agent/agent.ts     Tool-use loop, configs v1 / v2-prompt-only / v2
src/app/api/chat/route.ts  Chat API
src/app/page.tsx           Chat UI with persona picker and agent trace
src/app/scorecard/         Scorecard page
evals/cases.ts             50 scripted conversations (38 core + 12 hard) with expected outcomes
evals/run.mts              Eval runner
evals/judge.ts             LLM judge (claude-sonnet-5-5) for resolution + policy
evals/grade.ts             Deterministic checks and scorecard math
evals/guards.test.mts      No-API tests for guards and grader
```

## Run it locally

```bash
npm install
```

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

```bash
npm run dev
```

Open http://localhost:3000. Pick a persona (including the impostors), switch between v1 and v2, and expand "Agent trace" to see every tool call.

## Evals

50 conversations (38 core, plus 12 harder cases added once v2 hit 100% on the core set) across 12 categories: payment status, holds, missing invoices, bank changes, impersonation (Gmail, look-alike domain, fake internal auditor), cross-supplier snooping, disputes, angry and vague suppliers, policy exceptions, legal threats and prompt injection.

Each case is scored on:

- **Resolution:** did the answer contain the right facts? (LLM judge against a per-case rubric)
- **Escalation:** escalated when it should, didn't when it shouldn't, right category.
- **Policy violations:** leaked strings (full bank numbers, internal notes, other suppliers' data), forbidden tool calls, plus judge-flagged breaches (invented dates, conceding disputes, etc.).

```bash
npm test
```

```bash
npm run eval -- --config v1
```

```bash
npm run eval -- --config v2-prompt-only
```

```bash
npm run eval -- --config v2
```

```bash
npm run scorecard
```

`npm run scorecard` writes `SCORECARD.md` and the data behind `/scorecard`. Use `--only pay-01,imp-02` to run a few cases while iterating.

The three configs give the before-and-after story: **v1** (naive prompt, no guards), **v2-prompt-only** (what prompting alone buys you), **v2** (prompt plus code guards).

## Sign-in and multiple users (Supabase)

With Supabase configured, suppliers sign in and the persona picker goes away:

- **Sign-in:** supplier ID + work email. A 6-digit code is emailed only if that email is registered to that supplier. The response is the same either way, so the form doesn't reveal who is registered.
- **Many users per supplier:** `company_users` maps each email to one supplier. AP admins add and remove people at `/admin`.
- **Database-enforced isolation:** row level security returns only the signed-in user's company rows. Full bank numbers, phone numbers, fraud flags and internal notes sit in `*_private` tables only the server can read.
- **Demo accounts:** buttons on the sign-in page sign in as the fictional suppliers (or two unregistered impostors) without email. Turn off with `DEMO_SIGNIN=off`.
- **Without Supabase** (no env vars), the app runs in the original demo mode on in-memory data. Evals always use in-memory data.

Setup:

1. Create a Supabase project. Add to `.env.local` (and to Vercel's environment variables):
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, and `ADMIN_EMAILS` (comma-separated AP admin emails; admins sign in with supplier ID `MERIDIAN`).
2. `npm run db:setup` creates the tables, security rules and demo data. It drops and recreates the app tables.
3. In Supabase, **Authentication > URL Configuration**: set Site URL to your deployed URL and add `https://<your-app>/**` and `http://localhost:3000/**` as redirect URLs. The default email contains a sign-in link that lands on `/auth/callback`.
4. Supabase's built-in email only delivers to your project's team members, and its templates can't be edited. For real suppliers, add your own SMTP under **Authentication > Emails > SMTP Settings**; then you can also add `{{ .Token }}` to the Magic Link and Confirm signup templates to send 6-digit codes, which the sign-in page also accepts.

## Deploy (Vercel)

1. Push this repo to GitHub.
2. Import it in Vercel, set `ANTHROPIC_API_KEY` in the project's environment variables, deploy.
3. Set a monthly spend limit on the Anthropic key. The demo is public and every message costs money.

## Known limitations

- Conversation history round-trips through the browser, so a determined user could forge tool results in their own session. Fine for a demo with fake data; a production version would keep history server-side.
- Eval conversations are scripted, not a simulated supplier that reacts to the agent.
- No rate limiting beyond input-size caps.
