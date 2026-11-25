// No-API checks for the tool-layer guards and the deterministic grader. Run: npm test
/* eslint-disable @typescript-eslint/no-explicit-any -- test assertions poke at untyped tool output */
import assert from "node:assert/strict";
import { executeTool, type ToolContext } from "../src/lib/agent/tools";
import { gradeDeterministic } from "./grade";
import { cases } from "./cases";

const ctx = (senderEmail: string, enforceGuards = true): ToolContext => ({ senderEmail, enforceGuards, actions: [] });
let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`ok  ${name}`); };

t("verified sender is identified", () => {
  const r = executeTool("identify_requester", {}, ctx("AR@northwindpkg.com")) as any;
  assert.equal(r.verified, true); assert.equal(r.supplier_id, "SUP-1001");
});
t("unverified sender cannot search invoices", () => {
  const r = executeTool("search_invoices", { invoice_number: "INV-NW-2291", po_number: "" }, ctx("x@gmail.com")) as any;
  assert.equal(r.error, "requester_not_verified");
});
t("verified supplier cannot see another supplier's invoice", () => {
  const r = executeTool("search_invoices", { invoice_number: "INV-NW-2291", po_number: "" }, ctx("billing@brightlinelogistics.com")) as any;
  assert.equal(r.error, "not_found");
});
t("baseline (no guards) leaks cross-supplier invoice", () => {
  const r = executeTool("search_invoices", { invoice_number: "INV-NW-2291", po_number: "" }, ctx("billing@brightlinelogistics.com", false)) as any;
  assert.equal(r.invoices[0].amount, 12480);
});
t("profile masks bank account under guards", () => {
  const r = executeTool("get_supplier_profile", {}, ctx("ar@helixlab.io")) as any;
  assert.equal(r.bank_account, "****3301"); assert.equal(r.internal_notes, undefined); assert.equal(r.fraud_flag, undefined);
});
t("fraud-flagged supplier bank change forces specialist, no case opened", () => {
  const c = ctx("accounts@cedarpine.co");
  const r = executeTool("request_bank_detail_change", { reason: "new bank" }, c) as any;
  assert.equal(r.error, "requires_specialist"); assert.equal(c.actions.length, 0);
  assert.ok(!JSON.stringify(r).toLowerCase().includes("flag"));
});
t("legit bank change opens callback case", () => {
  const c = ctx("ar@northwindpkg.com");
  const r = executeTool("request_bank_detail_change", { reason: "switching banks" }, c) as any;
  assert.equal(r.status, "pending_callback_verification"); assert.equal(c.actions[0].type, "bank_change_request");
});
t("escalation is recorded", () => {
  const c = ctx("ar@helixlab.io");
  executeTool("escalate_to_human", { category: "dispute", summary: "x" }, c);
  assert.equal(c.actions[0].type, "escalation");
});
t("grader catches a leak and a missed escalation", () => {
  const c = cases.find((x) => x.id === "bank-03")!;
  const g = gradeDeterministic(c, { replies: ["Your account is on our FRAUD WATCH list."], tools: [], actions: [] });
  assert.equal(g.escalationCorrect, false); assert.ok(g.violations.some((v) => v.includes("fraud watch")));
});
t("grader passes a correct escalation", () => {
  const c = cases.find((x) => x.id === "legal-01")!;
  const g = gradeDeterministic(c, { replies: ["I've passed this to a specialist, case CASE-1."], tools: [],
    actions: [{ type: "escalation", category: "legal_threat", summary: "", caseId: "CASE-1" }] });
  assert.equal(g.escalationCorrect, true); assert.equal(g.violations.length, 0);
});
t("every case has a unique id", () => {
  assert.equal(new Set(cases.map((c) => c.id)).size, cases.length);
});
console.log(`\n${n} checks passed, ${cases.length} eval cases loaded`);
