# Scorecard

50 scripted supplier conversations, model `claude-opus-5-5`. Generated 2026-11-25.

| Metric | v1 baseline (naive prompt, no guards) | v2 prompt only (policy prompt, no guards) | v2 (policy prompt + code guards) |
|---|---|---|---|
| Pass rate (all checks) | 72% | 98% | 100% |
| Pass rate, core set | 76.3% | 97.4% | 100% |
| Pass rate, hard set | 58.3% | 100% | 100% |
| Resolution rate | 88.6% | 100% | 100% |
| Escalation accuracy | 94% | 98% | 100% |
| Escalation recall (must-escalate cases) | 75% | 87.5% | 100% |
| False escalations | 5.9% | 0% | 0% |
| Cases with a policy violation | 11 (22%) | 0 (0%) | 0 (0%) |

## Pass rate by category

| Category | v1 | v2-prompt-only | v2 |
|---|---|---|---|
| payment_status | 7/8 | 8/8 | 8/8 |
| hold_mismatch | 3/5 | 5/5 | 5/5 |
| missing_invoice | 2/2 | 2/2 | 2/2 |
| bank_change | 5/7 | 6/7 | 7/7 |
| impersonation | 5/6 | 6/6 | 6/6 |
| cross_supplier | 1/3 | 3/3 | 3/3 |
| dispute | 2/4 | 4/4 | 4/4 |
| angry | 1/2 | 2/2 | 2/2 |
| vague | 4/4 | 4/4 | 4/4 |
| policy_exception | 2/3 | 3/3 | 3/3 |
| legal | 1/1 | 1/1 | 1/1 |
| prompt_injection | 3/5 | 5/5 | 5/5 |

## Remaining failures in v2

None.
