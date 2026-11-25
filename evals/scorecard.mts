// Combines the latest result for each config into SCORECARD.md and the data file the /scorecard page reads.
import fs from "node:fs";
import path from "node:path";
import type { CaseResult, Scorecard } from "./grade";

const ORDER = ["v1", "v2-prompt-only", "v2"];
const LABELS: Record<string, string> = {
  v1: "v1 baseline (naive prompt, no guards)",
  "v2-prompt-only": "v2 prompt only (policy prompt, no guards)",
  v2: "v2 (policy prompt + code guards)",
};

const runs = ORDER.flatMap((name) => {
  const f = path.join("evals", "results", `latest-${name}.json`);
  if (!fs.existsSync(f)) return [];
  const { scorecard, results } = JSON.parse(fs.readFileSync(f, "utf8")) as {
    scorecard: Scorecard;
    results: CaseResult[];
  };
  return [{ name, label: LABELS[name], scorecard, results }];
});
if (runs.length === 0) throw new Error("No results yet. Run `npm run eval -- --config v1` and `--config v2` first.");

const rows: [string, (s: Scorecard) => string][] = [
  ["Pass rate (all checks)", (s) => `${s.passRate}%`],
  ["Pass rate, core set", (s) => `${s.corePassRate}%`],
  ["Pass rate, hard set", (s) => `${s.hardPassRate}%`],
  ["Resolution rate", (s) => `${s.resolutionRate}%`],
  ["Escalation accuracy", (s) => `${s.escalationAccuracy}%`],
  ["Escalation recall (must-escalate cases)", (s) => `${s.escalationRecall}%`],
  ["False escalations", (s) => `${s.falseEscalationRate}%`],
  ["Cases with a policy violation", (s) => `${s.casesWithViolations} (${s.violationRate}%)`],
];

let md = `# Scorecard\n\n${runs[0].scorecard.total} scripted supplier conversations, model \`${runs[0].scorecard.model}\`. Generated ${new Date().toISOString().slice(0, 10)}.\n\n`;
md += `| Metric | ${runs.map((r) => r.label).join(" | ")} |\n|---|${runs.map(() => "---").join("|")}|\n`;
for (const [label, f] of rows) md += `| ${label} | ${runs.map((r) => f(r.scorecard)).join(" | ")} |\n`;

md += `\n## Pass rate by category\n\n| Category | ${runs.map((r) => r.name).join(" | ")} |\n|---|${runs.map(() => "---").join("|")}|\n`;
const cats = Object.keys(runs[runs.length - 1].scorecard.byCategory);
for (const c of cats) {
  md += `| ${c} | ${runs.map((r) => {
    const b = r.scorecard.byCategory[c];
    return b ? `${b.pass}/${b.total}` : "-";
  }).join(" | ")} |\n`;
}

const latest = runs[runs.length - 1];
const failures = latest.results.filter((r) => !r.pass);
md += `\n## Remaining failures in ${latest.name}\n\n`;
md += failures.length === 0
  ? "None.\n"
  : failures
      .map((r) => {
        const why = [
          r.error && `error: ${r.error}`,
          ...r.violations,
          !r.escalationCorrect && `escalation wrong (escalated: ${r.escalated}, categories: ${r.escalationCategories.join(",") || "none"})`,
          r.missingTools.length > 0 && `missing tools: ${r.missingTools.join(", ")}`,
          r.resolved === false && `not resolved: ${r.judge?.reasoning ?? ""}`,
        ].filter(Boolean);
        return `- **${r.id}** (${r.description}): ${why.join("; ")}`;
      })
      .join("\n") + "\n";

fs.writeFileSync("SCORECARD.md", md);
fs.writeFileSync(
  path.join("src", "data", "scorecard.json"),
  JSON.stringify({ runs: runs.map(({ name, label, scorecard, results }) => ({ name, label, scorecard, results })) }, null, 2),
);
console.log(md);
