# PR #5 — Requisition prepare/commit recovery QA

Scope: source, offline tests and docs only, on `codex/stock-formula-safety-20261028`. No new PR, merge, deployment or Google service mutation.

## Protocol

`setReqStatus(issue)` retains the formula audit gate for both initial issue and retries. `writeIssue_` persists an immutable v1 intent in Script Properties (`REQ_ISSUE_V1_<RequestID>`) before ledger writes. It includes document, ordered line identities, deterministic REQ IDs, quantities, SKU, snapshotted prices, actor and timestamp. Unknown legacy postings cannot be adopted. Oversized plans block before ledger changes; quota failures propagate.

Prepare appends rows only. B remains blank; identifying metadata and formulas are prepared and flushed before K (MovementID) is assigned last. A failed write before K may leave an inert orphan, which is retained and never reused. Every identified row is checked for exact stock payload and duplicate IDs before commit. All lines must be prepared before any B is activated.

Commit activates only rows whose B is blank, then validates the complete set. A retry discovers active lines and checks stock only for the remainder; it cannot deduct those active lines again. Header payer/time are written before paid status, allowing retries after header failure. Completed paid retries validate the plan/ledger without further writes. Existing lock wrapper serializes cooperating script calls. Edit and cancel are blocked once intent exists.

## Evidence

- Before fix (19a0bd6), initial eight new recovery tests: **1 PASS / 7 FAIL / 0 SKIPPED**, exit 1. Original source was restored with a finally block after the negative control.
- Final full suite: **84 PASS / 0 FAIL / 0 SKIPPED**, `npm test`, Node v24.19.0.
- Crash matrix: 36 write/flush boundaries, before and after each = **72 injected crash/recovery scenarios** inside two tests. Covers property intent, every prepared column including DocumentNo and MovementID, formulas, flush, both active-type writes, payer/date and paid status. Mock setValues mutates individual cells, so partial range writes are exercised.
- Every crash retry ends at opening 100 minus 2 minus 3 = 95, exactly two distinct active REQ IDs. Active rows always have identity, document, SKU and quantity. Orphans remain inert.
- Other cases: multiple SKUs, same-SKU aggregation, duplicate clicks, paid retry without writes, reordered/changed payload, duplicate/conflicting IDs, unknown legacy stock effects, cancellation guard, shortage before commit and after partial commit, and recovery once stock is restored.
- Formula audit regressions, hybrid/unknown formula blocking, disabled fixFormulas, SALE posting/reversal regression and role/PDF safety tests remain passing.
- `git diff --check`: PASS.

## Limits and BLOCKED cases

This is resumable per-line commit, not an atomic multi-line transaction. Readers can observe partial stock while recovery is pending; pending prepared rows do not reserve inventory. Stock shortage after a crash blocks remaining lines until reviewed/resolved; posted lines are never rolled back automatically. Inert orphans and retained property intents require separately reviewed retention/cleanup, not automatic deletion. Script Property per-value/total quotas and orphan row growth may block further work safely.

Recovery assumes durable read-after-flush behavior and that cooperating mutations honor the same script lock. It cannot protect against manual edits, other scripts or malicious property edits. Mismatched payload, duplicate IDs, missing metadata on active outgoing rows for affected SKUs, and legacy ambiguous postings stay BLOCKED for manual review. Historical corrupt ledger reconciliation remains outside scope. Formula shape does not certify historical ledger uniqueness. The current hybrid remains unsafe for requisition issue; no H formulas are changed.

No real Google service was contacted for QA. VM fixtures mock SpreadsheetApp and Script Properties entirely in memory; actual cloud locks, Apps Script quotas and Sheets consistency were not integration-tested. No production-readiness claim.

GitHub API still returns Forbidden, preventing confirmation of Actions results, Draft state and updating PR description through API. Push to the existing branch updates PR #5 source diff; CI URL and latest remote review state remain BLOCKED/unverified. Do not equate local PASS with CI PASS.
