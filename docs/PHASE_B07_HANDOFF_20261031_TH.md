# Phase B07 handoff — as of 2026-10-31 (Asia/Bangkok)
Repository: manager946/KAIDEE-STOCK — Draft PR #5.

## VERIFIED READ-ONLY SOURCE STATE
- Dedicated synthetic-only Google Sheet: `KAIDEE-STOCK-SYNTHETIC-QA-STEP8-15`; 52 synthetic SKU rows, movement-only H formulas.
- Existing QA requisitions: `QA-PB-001` and `QA-PB-002` both `จ่ายแล้ว`; `QA-PB-003` `อนุมัติ`, qty 2 QA-004 and qty 3 QA-005, not posted.
- Exactly four active outbound movements, associated with 001/002; 52/52 balances match: QA-001 95, QA-002 96, QA-003 99, QA-004 100, QA-005 100, other synthetic SKUs 100.
- User-supplied READ-ONLY diagnostic in isolated QA project: `hasIntent:true`, `intentValidation:VALID`, `hasArm:false`, `relatedLedgerRows:0`.
- **The script properties are not readable through the current ChatGPT connector.** Do not claim direct verification of properties or actual crash timing.
- Thus: evidence consistent with a one-shot simulated failure after saving a valid intent and before ledger writes. Actual `PHASEB_B07_INTENT_FAULT_INJECTED` log was not captured; the precise interruption cannot be fully proven.

## WORK COMPLETED
- Added `tests/phase-b07-intent-recovery-runner.test.js` with 10 offline tests covering readiness, intent fault, one-time disarm, recovery, existing intent, armed flag, invalid intent, unsafe partial state, missing hook, balance drift.
- HEAD `fe39443ce55ab4761529b7384c2f98b2fe811cf5`: [PR CI](https://github.com/manager946/KAIDEE-STOCK/actions/runs/41166979037) and [Push CI](https://github.com/manager946/KAIDEE-STOCK/actions/runs/41166973656): **108 PASS, 0 FAIL, 0 SKIPPED**, independently confirmed in job logs. This is offline CI, NOT real Apps Script recovery evidence.
- Source-only changes on QA Draft PR; no deployments or original STAGING/Production edits.

## IMMEDIATE NEXT OWNER ACTION — ONE REAL QA RUN
In the **standalone QA-only Apps Script** project, after confirming the above unchanged and test-only Script Properties backup, execute **once** `phaseB07RecoverAfterIntentOnce`. It validates:
1. No armed fault flag
2. Existing `REQ_ISSUE_V1_QA-PB-003` matches line IDs/SKU/qty
3. All 52 SKU formula guard, 4 expected active movements, 003 approved, QA-004 and QA-005 both 100
4. No prepared/orphan rows before attempting to resume
5. Calls the reviewed `setReqStatus('QA-PB-003','issue')`
6. Verifies six total movements, QA-004 98, QA-005 97, 003 paid

**If any error appears, DO NOT RE-RUN, DO NOT DELETE PROPERTIES, DO NOT manually write/undo ledger.** Preserve log; perform independent read-only Ledger/Sheets and intent inspection to find an interrupted partial commit.
Run from editor only; no Web App deployment.

## AFTER SUCCESS: mandatory independent verification
- Read 52 inventory rows against movement-only ledger.
- Verify exactly six distinct nonblank MovementIDs and source identities. New 003 rows:
  - `REQ-QA-PB-003-1` — QA-004 qty 2, document QA-PB-RQ003
  - `REQ-QA-PB-003-2` — QA-005 qty 3, document QA-PB-RQ003
- Check request 003 `จ่ายแล้ว`, issuer/paid timestamp populated, and 001/002 unchanged.
- Retry `QA-PB-003` only after prior evidence confirmed; expect `reused:true`, ledger still six, stock unchanged.
- More fault points and partial-commit simulation require **new** unique synthetic requisitions and a reviewed QA-only runner, not reverting paid 001/002/003.
- LockService contention, PropertiesService quota behavior and actual rollback of Sheets+properties remain unproven.
- Do not delete historical movements or intent keys. Rollback of synthetic *test fixture* requires a documented snapshot and separate controlled cleanup, not simply clearing formulas.

## RELEASE / PERMISSION GATE
**KEEP DRAFT / DO NOT MERGE / DO NOT DEPLOY / DO NOT CHANGE PDF ACL.**
Original STAGING 52 hybrid fallback H formulas remain unsafe for new real requisitions. No migration or Production changes are authorized. Normal synthetic issuing/retry PASS; real crash-recovery still PENDING owner QA execution, not PASS.
