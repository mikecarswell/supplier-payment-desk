// No-API checks for the tool-layer guards and the deterministic grader. Run: npm test
/* eslint-disable @typescript-eslint/no-explicit-any -- test assertions poke at untyped tool output */
import assert from "node:assert/strict";
import { executeTool, type ToolContext } from "../src/lib/agent/tools";
import { MemoryRepo } from "../src/lib/agent/repo";
import { gradeDeterministic } from "./grade";
import { cases } from "./cases";

const repo = new MemoryRepo();
const ctx = (senderEmail: string, enforceGuards = true): ToolContext => ({ senderEmail, enforceGuards, actions: [], repo });
let n = 0;
const t = async (name: string, fn: () => Promise<void> | void) => {
  await fn();
  n++;
  console.log(`ok  ${name}`);
};
const run = (name: string, input: Record<string, string>, c: ToolContext) => executeTool(name, input, c) as Promise<any>;

await t("verified sender is identified", async () => {
  const r = await run("identify_requester", {}, ctx("AR@northwindpkg.com"));
  assert.equal(r.verified, true);
  assert.equal(r.supplier_id, "SUP-1001");
});
await t("unverified sender cannot search invoices", async () => {
  const r = await run("search_invoices", { invoice_number: "INV-NW-2291", po_number: "" }, ctx("x@gmail.com"));
  assert.equal(r.error, "requester_not_verified");
});
await t("verified supplier cannot see another supplier's invoice", async () => {
  const r = await run("search_invoices", { invoice_number: "INV-NW-2291", po_number: "" }, ctx("billing@brightlinelogistics.com"));
  assert.equal(r.error, "not_found");
});
await t("baseline (no guards) leaks cross-supplier invoice", async () => {
  const r = await run("search_invoices", { invoice_number: "INV-NW-2291", po_number: "" }, ctx("billing@brightlinelogistics.com", false));
  assert.equal(r.invoices[0].amount, 12480);
});
await t("profile masks bank account under guards", async () => {
  const r = await run("get_supplier_profile", {}, ctx("ar@helixlab.io"));
  assert.equal(r.bank_account, "****3301");
  assert.equal(r.internal_notes, undefined);
  assert.equal(r.fraud_flag, undefined);
});
await t("fraud-flagged supplier bank change forces specialist, no case opened", async () => {
  const c = ctx("accounts@cedarpine.co");
  const r = await run("request_bank_detail_change", { reason: "new bank" }, c);
  assert.equal(r.error, "requires_specialist");
  assert.equal(c.actions.length, 0);
  assert.ok(!JSON.stringify(r).toLowerCase().includes("flag"));
});
await t("legit bank change opens callback case", async () => {
  const c = ctx("ar@northwindpkg.com");
  const r = await run("request_bank_detail_change", { reason: "switching banks" }, c);
  assert.equal(r.status, "pending_callback_verification");
  assert.equal(c.actions[0].type, "bank_change_request");
});
await t("escalation is recorded", async () => {
  const c = ctx("ar@helixlab.io");
  await run("escalate_to_human", { category: "dispute", summary: "x" }, c);
  assert.equal(c.actions[0].type, "escalation");
});
await t("grader catches a leak and a missed escalation", () => {
  const c = cases.find((x) => x.id === "bank-03")!;
  const g = gradeDeterministic(c, { replies: ["Your account is on our FRAUD WATCH list."], tools: [], actions: [] });
  assert.equal(g.escalationCorrect, false);
  assert.ok(g.violations.some((v) => v.includes("fraud watch")));
});
await t("grader passes a correct escalation", () => {
  const c = cases.find((x) => x.id === "legal-01")!;
  const g = gradeDeterministic(c, {
    replies: ["I've passed this to a specialist, case CASE-1."],
    tools: [],
    actions: [{ type: "escalation", category: "legal_threat", summary: "", caseId: "CASE-1" }],
  });
  assert.equal(g.escalationCorrect, true);
  assert.equal(g.violations.length, 0);
});
await t("every case has a unique id", () => {
  assert.equal(new Set(cases.map((c) => c.id)).size, cases.length);
});
console.log(`\n${n} checks passed, ${cases.length} eval cases loaded`);
