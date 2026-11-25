// Checks the live database's security rules by signing in as real users and trying to
// read what they shouldn't. Usage: npm run test:db  (needs Supabase keys in .env.local)
import "../evals/env";
import assert from "node:assert/strict";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SupabaseRepo } from "../src/lib/agent/repo-supabase";
import { executeTool } from "../src/lib/agent/tools";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

async function signInAs(email: string): Promise<SupabaseClient> {
  const { data, error } = await service.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  const client = createClient(url, anon, { auth: { persistSession: false } });
  const { error: e2 } = await client.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: data.properties.verification_type as "signup" | "magiclink",
  });
  if (e2) throw e2;
  return client;
}

let n = 0;
const t = async (name: string, fn: () => Promise<void>) => {
  await fn();
  n++;
  console.log(`ok  ${name}`);
};

const northwind = await signInAs("ar@northwindpkg.com");
const impostor = await signInAs("northwind.billing@gmail.com");
const anonClient = createClient(url, anon, { auth: { persistSession: false } });

await t("signed-in supplier sees only its own invoices", async () => {
  const { data } = await northwind.from("invoices").select("number, company_id");
  assert.ok(data && data.length === 3, `expected 3 Northwind invoices, got ${data?.length}`);
  assert.ok(data.every((r) => r.company_id === "SUP-1001"));
});
await t("asking directly for another supplier's invoice returns nothing", async () => {
  const { data } = await northwind.from("invoices").select("*").eq("number", "INV-BL-7710");
  assert.equal(data?.length, 0);
});
await t("supplier sees only its own company row", async () => {
  const { data } = await northwind.from("companies").select("id");
  assert.deepEqual(data?.map((r) => r.id), ["SUP-1001"]);
});
await t("private tables are unreadable to a signed-in supplier", async () => {
  for (const table of ["company_private", "invoice_private", "cases"]) {
    const { data } = await northwind.from(table).select("*");
    assert.equal(data?.length ?? 0, 0, `${table} leaked rows`);
  }
});
await t("supplier cannot write to invoices", async () => {
  await northwind.from("invoices").update({ status: "paid" }).eq("number", "INV-NW-2302");
  const { data } = await service.from("invoices").select("status").eq("number", "INV-NW-2302").single();
  assert.equal(data?.status, "on_hold");
});
await t("signed-in but unregistered user sees nothing", async () => {
  for (const table of ["invoices", "companies", "payments", "purchase_orders", "company_users"]) {
    const { data } = await impostor.from(table).select("*");
    assert.equal(data?.length ?? 0, 0, `${table} leaked rows to impostor`);
  }
});
await t("anonymous visitor sees nothing", async () => {
  const { data } = await anonClient.from("invoices").select("*");
  assert.equal(data?.length ?? 0, 0);
});

const repo = (client: SupabaseClient) => new SupabaseRepo(client, service, true);
await t("agent tools on live data: verified supplier finds its invoice", async () => {
  const ctx = { senderEmail: "ar@northwindpkg.com", enforceGuards: true, actions: [], repo: repo(northwind) };
  const who = (await executeTool("identify_requester", {}, ctx)) as { verified: boolean; supplier_id: string };
  assert.equal(who.verified, true);
  assert.equal(who.supplier_id, "SUP-1001");
  const r = (await executeTool("search_invoices", { invoice_number: "INV-NW-2291", po_number: "" }, ctx)) as {
    invoices: { amount: number; scheduled_payment_date: string }[];
  };
  assert.equal(r.invoices[0].amount, 12480);
  assert.equal(r.invoices[0].scheduled_payment_date, "2026-11-28");
});
await t("agent tools on live data: impostor is not verified", async () => {
  const ctx = { senderEmail: "northwind.billing@gmail.com", enforceGuards: true, actions: [], repo: repo(impostor) };
  const r = (await executeTool("search_invoices", { invoice_number: "INV-NW-2291", po_number: "" }, ctx)) as { error: string };
  assert.equal(r.error, "requester_not_verified");
});
await t("agent tools on live data: profile masks the bank account", async () => {
  const ctx = { senderEmail: "ar@northwindpkg.com", enforceGuards: true, actions: [], repo: repo(northwind) };
  const r = (await executeTool("get_supplier_profile", {}, ctx)) as Record<string, unknown>;
  assert.equal(r.bank_account, "****4821");
  assert.equal(r.internal_notes, undefined);
});

console.log(`\n${n} database security checks passed`);
