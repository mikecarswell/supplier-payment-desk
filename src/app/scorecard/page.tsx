import Link from "next/link";
import data from "@/data/scorecard.json";
import type { CaseResult, Scorecard } from "../../../evals/grade";

interface Run {
  name: string;
  label: string;
  scorecard: Scorecard;
  results: CaseResult[];
}

const METRICS: [string, (s: Scorecard) => string][] = [
  ["Pass rate (all checks)", (s) => `${s.passRate}%`],
  ["Pass rate, core set", (s) => `${s.corePassRate}%`],
  ["Pass rate, hard set", (s) => `${s.hardPassRate}%`],
  ["Resolution rate", (s) => `${s.resolutionRate}%`],
  ["Escalation accuracy", (s) => `${s.escalationAccuracy}%`],
  ["Escalation recall", (s) => `${s.escalationRecall}%`],
  ["False escalations", (s) => `${s.falseEscalationRate}%`],
  ["Cases with a policy violation", (s) => `${s.casesWithViolations} (${s.violationRate}%)`],
];

export default function ScorecardPage() {
  const runs = (data as unknown as { runs: Run[] }).runs;
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 text-slate-900">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Eval scorecard</h1>
          <p className="text-sm text-slate-600">
            Scripted supplier conversations covering payment status, holds, missing invoices, bank changes,
            impersonation, disputes, angry and vague suppliers, and prompt injection.
          </p>
        </div>
        <Link href="/" className="text-sm font-medium text-indigo-700 underline">
          Back to the agent
        </Link>
      </header>

      {runs.length === 0 ? (
        <p className="rounded border border-slate-200 bg-white p-4 text-sm">
          No eval results yet. Run <code>npm run eval -- --config v1</code>, <code>npm run eval -- --config v2</code>,
          then <code>npm run scorecard</code>.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="p-3">Metric</th>
                  {runs.map((r) => (
                    <th key={r.name} className="p-3">{r.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {METRICS.map(([label, f]) => (
                  <tr key={label} className="border-t border-slate-100">
                    <td className="p-3">{label}</td>
                    {runs.map((r) => (
                      <td key={r.name} className="p-3 font-medium tabular-nums">{f(r.scorecard)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Case results ({runs[runs.length - 1].label})</h2>
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="p-3">Case</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Result</th>
                    <th className="p-3">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {runs[runs.length - 1].results.map((r) => (
                    <tr key={r.id} className="border-t border-slate-100 align-top">
                      <td className="p-3">
                        <div className="font-medium">{r.id}</div>
                        <div className="text-slate-500">{r.description}</div>
                      </td>
                      <td className="p-3">{r.category}</td>
                      <td className={`p-3 font-medium ${r.pass ? "text-emerald-700" : "text-red-700"}`}>
                        {r.pass ? "Pass" : "Fail"}
                      </td>
                      <td className="p-3 text-slate-600">
                        {r.error ?? ([...r.violations, r.judge?.reasoning].filter(Boolean).join(" · ") || "")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
