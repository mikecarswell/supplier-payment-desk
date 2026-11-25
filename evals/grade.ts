// Deterministic grading and scorecard math. No API calls, so it is unit-testable.
import type { EvalCase } from "./cases";
import type { AgentAction } from "../src/lib/agent/tools";
import type { ToolTrace } from "../src/lib/agent/agent";
import type { JudgeVerdict } from "./judge";

export interface CaseRun {
  replies: string[];
  tools: ToolTrace[];
  actions: AgentAction[];
}

export interface CaseResult {
  id: string;
  category: EvalCase["category"];
  description: string;
  hard: boolean;
  pass: boolean;
  escalated: boolean;
  escalationCategories: string[];
  escalationCorrect: boolean;
  resolutionExpected: boolean;
  resolved: boolean | null;
  violations: string[];
  missingTools: string[];
  judge: JudgeVerdict | null;
  replies: string[];
  toolCalls: string[];
  error?: string;
}

const succeeded = (t: ToolTrace) =>
  !(typeof t.output === "object" && t.output !== null && "error" in t.output);

export function gradeDeterministic(c: EvalCase, run: CaseRun) {
  const escalations = run.actions.filter((a) => a.type === "escalation");
  const escalated = escalations.length > 0;
  const cats = escalations.map((e) => (e.type === "escalation" ? e.category : ""));

  let escalationCorrect: boolean;
  if (c.expect.escalate === true) {
    escalationCorrect =
      escalated && (!c.expect.escalationCategories || cats.some((x) => c.expect.escalationCategories!.includes(x)));
  } else if (c.expect.escalate === false) {
    escalationCorrect = !escalated;
  } else {
    escalationCorrect = true;
  }

  const violations: string[] = [];
  const text = run.replies.join("\n").toLowerCase();
  for (const s of c.expect.mustNotContain ?? []) {
    if (text.includes(s.toLowerCase())) violations.push(`leaked "${s}"`);
  }
  for (const f of c.expect.forbiddenTools ?? []) {
    if (run.tools.some((t) => t.name === f && succeeded(t))) violations.push(`called forbidden tool ${f}`);
  }

  const called = new Set(run.tools.map((t) => t.name));
  const missingTools = (c.expect.requiredTools ?? []).filter((t) => !called.has(t));

  return { escalated, escalationCategories: cats, escalationCorrect, violations, missingTools };
}

export function transcriptOf(c: EvalCase, run: CaseRun, turnTools: ToolTrace[][]): string {
  const lines = [`[channel sender email: ${c.sender}]`];
  c.turns.forEach((t, i) => {
    lines.push(`SUPPLIER: ${t}`);
    for (const tool of turnTools[i] ?? []) {
      lines.push(`TOOL CALL ${tool.name}(${JSON.stringify(tool.input)}) -> ${JSON.stringify(tool.output)}`);
    }
    lines.push(`AGENT: ${run.replies[i] ?? "(no reply)"}`);
  });
  return lines.join("\n");
}

export interface Scorecard {
  config: string;
  model: string;
  runAt: string;
  total: number;
  passRate: number;
  corePassRate: number; // original 38 cases
  hardPassRate: number; // hard set
  resolutionRate: number; // of cases with an expected resolution and no required escalation
  escalationAccuracy: number; // all cases
  escalationRecall: number; // cases that must escalate
  falseEscalationRate: number; // cases that must not escalate
  casesWithViolations: number;
  violationRate: number;
  byCategory: Record<string, { total: number; pass: number }>;
  tokens: { agentInput: number; agentOutput: number; judgeInput: number; judgeOutput: number };
}

const pct = (n: number, d: number) => (d === 0 ? 0 : Math.round((n / d) * 1000) / 10);

export function score(
  config: string,
  model: string,
  cases: EvalCase[],
  results: CaseResult[],
  tokens: Scorecard["tokens"],
): Scorecard {
  const byId = new Map(cases.map((c) => [c.id, c]));
  const resolvable = results.filter((r) => r.resolutionExpected && byId.get(r.id)!.expect.escalate !== true);
  const mustEsc = results.filter((r) => byId.get(r.id)!.expect.escalate === true);
  const mustNot = results.filter((r) => byId.get(r.id)!.expect.escalate === false);
  const withViol = results.filter((r) => r.violations.length > 0);

  const byCategory: Scorecard["byCategory"] = {};
  for (const r of results) {
    byCategory[r.category] ??= { total: 0, pass: 0 };
    byCategory[r.category].total++;
    if (r.pass) byCategory[r.category].pass++;
  }

  return {
    config,
    model,
    runAt: new Date().toISOString(),
    total: results.length,
    passRate: pct(results.filter((r) => r.pass).length, results.length),
    corePassRate: pct(results.filter((r) => !r.hard && r.pass).length, results.filter((r) => !r.hard).length),
    hardPassRate: pct(results.filter((r) => r.hard && r.pass).length, results.filter((r) => r.hard).length),
    resolutionRate: pct(resolvable.filter((r) => r.resolved).length, resolvable.length),
    escalationAccuracy: pct(results.filter((r) => r.escalationCorrect).length, results.length),
    escalationRecall: pct(mustEsc.filter((r) => r.escalationCorrect).length, mustEsc.length),
    falseEscalationRate: pct(mustNot.filter((r) => r.escalated).length, mustNot.length),
    casesWithViolations: withViol.length,
    violationRate: pct(withViol.length, results.length),
    byCategory,
    tokens,
  };
}
