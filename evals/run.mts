// Usage: npm run eval -- --config v2 [--only pay-01,imp-02] [--concurrency 4]
import "./env";
import fs from "node:fs";
import path from "node:path";
import { cases, type EvalCase } from "./cases";
import { judge } from "./judge";
import { gradeDeterministic, score, transcriptOf, type CaseResult, type CaseRun } from "./grade";
import { runTurn, CONFIGS, MODEL, type ToolTrace } from "../src/lib/agent/agent";
import type Anthropic from "@anthropic-ai/sdk";

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const configName = (arg("config") ?? "v2") as keyof typeof CONFIGS;
const config = CONFIGS[configName];
if (!config) throw new Error(`Unknown config ${configName}. Use one of: ${Object.keys(CONFIGS).join(", ")}`);
const hardOnly = args.includes("--hard");
const only = hardOnly ? cases.filter((c) => c.hard).map((c) => c.id) : arg("only")?.split(",");
const concurrency = Number(arg("concurrency") ?? 4);
const selected = only ? cases.filter((c) => only.includes(c.id)) : cases;

const tokens = { agentInput: 0, agentOutput: 0, judgeInput: 0, judgeOutput: 0 };
// List prices: Opus 5.5 $4 / $20 per MTok (cache write 1.25x, read 0.1x), Sonnet 5.5 $2 / $10.
const cost = { agent: 0, judge: 0 };

async function runCase(c: EvalCase): Promise<CaseResult> {
  const run: CaseRun = { replies: [], tools: [], actions: [] };
  const turnTools: ToolTrace[][] = [];
  try {
    let history: Anthropic.Beta.BetaMessageParam[] = [];
    for (const turn of c.turns) {
      const r = await runTurn({ history, userMessage: turn, senderEmail: c.sender, config });
      history = r.messages;
      run.replies.push(r.reply);
      run.tools.push(...r.tools);
      run.actions.push(...r.actions);
      turnTools.push(r.tools);
      tokens.agentInput += r.usage.input + r.usage.cacheRead + r.usage.cacheWrite;
      tokens.agentOutput += r.usage.output;
      cost.agent += (r.usage.input + r.usage.cacheWrite * 1.25 + r.usage.cacheRead * 0.1) * 4e-6 + r.usage.output * 20e-6;
    }
    const det = gradeDeterministic(c, run);
    const { verdict, usage } = await judge({
      transcript: transcriptOf(c, run, turnTools),
      expectedResolution: c.expect.resolution,
    });
    tokens.judgeInput += usage.input;
    tokens.judgeOutput += usage.output;
    cost.judge += usage.input * 2e-6 + usage.output * 10e-6;

    const violations = [...det.violations, ...(verdict.policy_violation ? verdict.violated_rules.map((r) => `judge: ${r}`) : [])];
    const resolutionExpected = Boolean(c.expect.resolution);
    const resolved = resolutionExpected ? verdict.resolved : null;
    const pass =
      violations.length === 0 && det.escalationCorrect && det.missingTools.length === 0 && (resolved ?? true);

    return {
      id: c.id,
      category: c.category,
      description: c.description,
      hard: Boolean(c.hard),
      pass,
      escalated: det.escalated,
      escalationCategories: det.escalationCategories,
      escalationCorrect: det.escalationCorrect,
      resolutionExpected,
      resolved,
      violations,
      missingTools: det.missingTools,
      judge: verdict,
      replies: run.replies,
      toolCalls: run.tools.map((t) => t.name),
    };
  } catch (err) {
    return {
      id: c.id,
      category: c.category,
      description: c.description,
      hard: Boolean(c.hard),
      pass: false,
      escalated: false,
      escalationCategories: [],
      escalationCorrect: false,
      resolutionExpected: Boolean(c.expect.resolution),
      resolved: false,
      violations: [],
      missingTools: [],
      judge: null,
      replies: run.replies,
      toolCalls: run.tools.map((t) => t.name),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
        const r = out[i] as unknown as CaseResult;
        console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.id.padEnd(9)} ${r.error ? `ERROR ${r.error}` : r.violations.join("; ")}`);
      }
    }),
  );
  return out;
}

console.log(`Running ${selected.length} cases with config ${configName} on ${MODEL}...\n`);
const results = await pool(selected, concurrency, runCase);
const card = score(configName, MODEL, selected, results, tokens);

const dir = path.join("evals", "results");
fs.mkdirSync(dir, { recursive: true });
const payload = JSON.stringify({ scorecard: card, results }, null, 2);
fs.writeFileSync(path.join(dir, `${configName}-${card.runAt.replaceAll(":", "-")}.json`), payload);
if (!only) fs.writeFileSync(path.join(dir, `latest-${configName}.json`), payload);

const errors = results.filter((r) => r.error).length;
console.log(`
Scorecard (${configName})
  Pass rate             ${card.passRate}%  (${results.filter((r) => r.pass).length}/${card.total})  core ${card.corePassRate}%, hard ${card.hardPassRate}%
  Resolution rate       ${card.resolutionRate}%
  Escalation accuracy   ${card.escalationAccuracy}%  (recall ${card.escalationRecall}%, false escalations ${card.falseEscalationRate}%)
  Policy violations     ${card.casesWithViolations} cases (${card.violationRate}%)
  Errors                ${errors}
  Estimated cost        $${(cost.agent + cost.judge).toFixed(2)} (agent $${cost.agent.toFixed(2)}, judge $${cost.judge.toFixed(2)})
  Tokens                agent ${tokens.agentInput} in / ${tokens.agentOutput} out, judge ${tokens.judgeInput} in / ${tokens.judgeOutput} out
`);
if (!only) console.log(`Saved evals/results/latest-${configName}.json. Run \`npm run scorecard\` to compare versions.`);
