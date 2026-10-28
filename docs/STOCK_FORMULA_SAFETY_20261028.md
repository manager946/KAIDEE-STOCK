# Stock formula safety review — 2026-10-28

Base: `test/isolated-staging-integration-2026-10-27` at `f878c2fda7698ec8bb549bfc0238b8acd11d48ec`.
Branch: `codex/stock-formula-safety-20261028`.

## Findings and diff

- Keep `REQUISITION_FALLBACK_DOUBLE_COUNT_RISK` fail-closed. A synthetic opening balance of 10, REQ issue of 2 and paid fallback of 2 produces H=4 / I=6 rather than ledger H=2 / I=8. Matching current balances does not prove future hybrid safety.
- `Code.gs`: normalize only syntax outside quoted strings. Previously `"จ่าย ออก"` incorrectly passed as `"จ่ายออก"`; these criteria select different ledger rows.
- `Code.gs`: reject an existing deterministic `REQ-<request id>-<line index>` even if DocumentNo is blank or edited. Keep the legacy DocumentNo guard. Reject rather than repair or guess how to resume.
- Tests execute actual formula audit, issue gate, balance calculation and SALE lifecycle against offline mocks. New cases cover unknown formulas, quoted criteria/sheet names, REQ duplicate IDs, legacy document duplicates, SALE duplicate IDs, and reversal arithmetic. Existing lifecycle tests verify retry-safe shipment/return and partial-post recovery.
- No formula replacement, migration, auto-repair, Sheets access, clasp push/deploy, or Production operation was performed. H8:H59 is untouched.

## PASS / FAIL evidence

Node v24.19.0. No npm dependencies or installation required.

| Check | Result |
| --- | --- |
| Baseline `npm test` | PASS 65/65 |
| New formula tests against original base Code.gs | Expected FAIL: 10 pass, 2 fail, exit 1 |
| Baseline failure 1 | quoted whitespace: actual safe=true, expected false |
| Baseline failure 2 | REQ duplicate with absent DocumentNo reaches UNEXPECTED_POST instead of rejecting |
| Updated `npm test` | PASS 71/71, 0 failed/skipped |
| `git diff --check` | PASS |

The original Code.gs was temporarily used for the negative control and restored in a finally block. The sandboxed initial test run failed at the child-process prepare-staging test; rerunning with the supported expanded execution permission passed all 65 baseline tests. Final counts above are individual tests, not file counts.

## Remaining risks / unverified behavior

- Hybrid formulas remain blocked; this PR does not make them safe or migrate history. Arithmetic examples are synthetic counterexamples, not a Sheets formula engine or fresh live reconciliation.
- Movement-only formula shape does not certify ledger uniqueness: duplicate SALE issue rows lower balance twice, and duplicate return rows inflate it. Existing corrupt rows require separate read-only reconciliation and an explicitly approved migration.
- REQ writes are still multi-step and not transactionally atomic. A crash before metadata is written can leave active stock without ID/DocumentNo; this patch cannot identify that row. A partial issue with metadata is blocked for manual review, not resumed automatically.
- REQ IDs use line positions. Reordered/changed historical lines need separate reconciliation. `readMv_()` only returns active receipt/issue types; incomplete/inert rows are outside this guard.
- No live Google integration, real formula evaluation, deployment, or Production validation was run. Legacy historical data and corrupted-data scenarios beyond the tested cases still need separate review.

Keep the PR Draft pending review. Do not deploy or unblock real requisitions based only on these offline results.

## PR #5 follow-up: reversal source integrity

Review reproduced an existing defect: opening 100, shipment 2 leaves 98; changing the sale line quantity to 5 allowed a return to inflate stock to 103. The reversal path now compares original SALE movement SKU, quantity and DocumentNo with the return plan before any journal or ledger writes. Mismatch blocks for manual review; nothing is repaired.

- Negative control on commit 06ad4a3: three new tests FAIL (quantity, SKU and document mismatch; missing expected exception), three existing lifecycle tests PASS.
- Updated full `npm test`: PASS 74/74, zero failures/skips. Each mismatch test also verifies all mock sheet rows remain unchanged.
- Normal shipment/reversal, retries and partial shipment recovery continue to pass.
- GitHub review/CI status remains unverified while api.github.com is blocked. Local tests are not CI evidence.

## Requisition crash recovery follow-up

See [REQUISITION_RECOVERY_QA_20261028.md](REQUISITION_RECOVERY_QA_20261028.md) for the new durable intent / inert prepare / resumable commit protocol, 72 injected crash scenarios and final 84/84 local results. This supersedes the earlier REQ non-resumability limitation for newly journaled operations; unidentified legacy partial postings remain blocked. No Google formulas or deployments were changed.
