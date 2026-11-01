# KAIDEE-STOCK — Phase B06.1 real retry verification / B07 entry gate

Date: 2026-10-30 (Asia/Bangkok). **QA-only evidence, not migration or release approval.**

## Target and boundaries
- Dedicated isolated synthetic-only Google Sheet `KAIDEE-STOCK-SYNTHETIC-QA-STEP8-15`; 52 fictional SKU rows.
- Separate Apps Script QA project. No changes to original STAGING, Production, Deployment, PDF ACL, and no merge of Draft PR #5.
- The project source was not programmatically inspected here; the user supplied the Apps Script execution result. All underlying numeric/ledger/header assertions below were independently read back from the isolated synthetic Google Sheet.

## B04 / B05 / B06 / B06.1 acceptance evidence
- User's B06.1 retry execution returned `{ok:true,reused:true}` for second requisition `QA-PB-002` — this demonstrates **normal duplicate-click idempotency** in the QA script, not crash recovery.
- Read-only after-action Sheets verification: 52/52 inventory rows reconcile as expected; `QA-001=95`, `QA-002=96`, `QA-003=99`, all other 49 synthetic SKUs remain at 100 with zero movement.
- Exactly four active outgoing movements, with unique deterministic IDs and matching document/SKU/quantities:
  - `REQ-QA-PB-001-1`: QA-001, 2, `QA-PB-RQ001`
  - `REQ-QA-PB-001-2`: QA-001, 3, `QA-PB-RQ001`
  - `REQ-QA-PB-002-1`: QA-002, 4, `QA-PB-RQ002`
  - `REQ-QA-PB-002-2`: QA-003, 1, `QA-PB-RQ002`
- Both requisitions show `จ่ายแล้ว`. Neither one has any additional active movement or duplicate ID.
- PR remained Draft and unmerged when checked.

**Decision: B04/B05/B06/B06.1 PASS for demonstrated normal issue and retry. B07 real fault recovery is NOT EXECUTED, remains BLOCKED pending guarded preparation.**

## B07 guard review before any action
1. Preserve the current four ledger rows and requisition status/history; do not reset statuses or delete original `REQ_ISSUE_V1_` properties.
2. Snapshot synthetic Sheet inventory A8:I59 (values and G/H/I formulas), ledger A4:N (including active/inert rows), requisitions and lines, and relevant **test-only** Script Property intent keys. Keep IDs and any account-specific information in a private test record only.
3. Existing `phaseBPreflightReadOnly()` in `qa/phase-b/PhaseBIsolatedAdapter.gs` explicitly expects **exactly two** requisitions and only four `REQ-QA-PB-00[12]-[12]` movement IDs. A new `QA-PB-003` must first be introduced in a reviewed **test-only** preflight adapter with explicit expected fixture shape, strict ID/title/sentinel guard and exact matching for 001/002; do not simply suppress the guard.
4. For the new synthetic-only `QA-PB-003`, use distinct SKU(s) and deterministic IDs, e.g. QA-004 qty 2 and QA-005 qty 3, leaving the previous balances intact. Its **new** plan, properties, and ledger entries must be unique.
5. Fault injection must occur only in a dedicated isolated test copy/wrapper, with a single armed injection point that intentionally throws once (not repeated). Do **not** alter `Code.gs` in the existing STAGING or Production project or mutate `REQ_ISSUE_V1_` keys manually. Capture before/after each attempt, especially a real partially committed line.
6. Stop immediately for active movement lacking ID/DocumentNo, unrecognized orphan, shortage, mismatched intent shape, incomplete header, duplicate IDs, or unexpected extra SKU; report failure instead of repeated retry attempts.
7. Four recovery boundaries to test one-by-one using fresh unique synthetic request IDs or clean **test-only** isolated fixture reset after each: after durable intent; after inert row preparation; after first active line; after all active lines but before paid header/status.
8. Assertions: never double-post any existing or new movement; all committed rows have consistent SKU, qty, document, ID, actor; final sums match movement-only formulas; real multi-line posting is **resumable, not atomic**, so partially committed balances may be observable.
9. Rollback rehearsal must restore **both** original synthetic formulas and all test-only movement/property state to a documented snapshot, but **not** erase 001/002 history. Never claim restoring formulas alone undoes posted movements.
10. No real STAGING formula migration, production deploy, PDF ACL change or PR merge. Further app-script execution requires actual safe test-only runner installation and preflight evidence.

## Outstanding independent blockers
- Existing STAGING H8:H59 hybrid requisition fallback is still unsafe for live issue.
- Sheets Phase A `"จ่าย ออก"` quoted-criteria anomaly remains under review.
- No runtime crash/fault injection, LockService contention, Script Properties quotas or complete rollback of issued requisition has been validated on live Apps Script.
