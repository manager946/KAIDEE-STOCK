# Step 8.15 Phase B — Apps Script recovery integration gate (PREPARATION ONLY)
Date: 2026-10-29. **NOT AUTHORIZED / NOT EXECUTED.** Existing Draft PR #5.

## Established isolation and preflight
- The approved Phase A synthetic-only Google Sheet exists independently and is restored to baseline: 52 synthetic inventory rows, zero active ledger rows, original G/H/I formulas. Phase A does not authorize Phase B writes.
- Actual `stagingDb_()` in `apps-script/SalesStaging.gs` uses property `KAIDEE_STAGING_SPREADSHEET_ID` and enforces title prefix `KAIDEE-STOCK STAGING`. Existing synthetic workbook title `KAIDEE-STOCK-SYNTHETIC-QA-STEP8-15` does **not** satisfy that prefix. This is a deliberate safety protection; DO NOT change existing STAGING or Production guard.
- The prefix check alone is insufficient to distinguish a particular approved test target. Any future Phase B runner must additionally enforce **exact approved synthetic Spreadsheet ID** and **exact approved title** in an isolated, nonproduction test-only wrapper. Never place live IDs or secrets in public source. Do not reuse original STAGING Script Properties, deployments, folders or account permissions.
- The Phase A workbook currently contains only `คลังสินค้า` and `บันทึกรับ-จ่าย`; required requisition tabs `ใบเบิกสินค้า`, `รายการใบเบิก` are absent. Therefore real `setReqStatus('issue')` integration is not runnable yet.
- Offline regression suite `tests/step8-15b-isolation-preflight.test.js` executes the real STAGING source guard with in-memory fakes. It must reject the Phase A title, unrelated/Production titles and invalid property values. It also explicitly demonstrates that a title prefix is not proof of exact-ID isolation.
- `stockFormulaAudit_()` must remain fail-closed for existing STAGING H8:H59; in a future isolated synthetic-only runner, H formulas must be canonical Movement-only with matching ledger. Do not migrate original STAGING formulas.
- `REQ_ISSUE_V1_` intent persistence is per-Apps-Script Script Properties; Phase B must use a **separate Apps Script project** with no Production Script Properties, no web app deployment and no PDF generation or permission changes.

## Phased execution plan — requires NEW explicit user authorization
1. Identify exact newly approved synthetic test spreadsheet and isolated test Apps Script project. Authorize **new synthetic Sheet writes, new Apps Script test-project creation and isolated test-only script execution** explicitly. No STAGING original or Production permissions implicit.
2. Create synthetic-only requisition header and line tabs, verify exact headers/column positions and 52 fake SKUs. Record baseline snapshot, scripts' authorized sheet ID/title, test user and time. Never copy source customer/order data.
3. Build an isolated test-only adapter to map to the **exact** synthetic file; fail if ID/title mismatch, missing tab, any reference to STAGING original or Production, or intent to change ACL/deploy.
4. Admin read-only preflight: compare 52/52 stock G/H/I with ledger; verify movement-only H formula for every nonblank SKU; verify no duplicate/ambiguous MovementID; call `qaStockFormulaAuditReadOnly()` in the isolated context. Abort if unsafe.
5. Controlled, synthetic-only requisition (two lines 2+3 same SKU, and two distinct SKUs): before / after active postings verify deterministic REQ IDs, H increases once, balance decreases once, document paid only when complete.
6. Duplicate action/retry with durable `REQ_ISSUE_V1_` intent: result reused with no extra active movement or stock change.
7. Fault injection before/after intent, preparation fields and the first/second active-type commit: verify inert orphans not counted, safe retry, no active movement lacking ID/doc/sku/quantity and manual-review blocks for ambiguities; use only test runner hooks in isolated project, not Production source modifications.
8. Exercise `PropertiesService` quota/size fail-closed behavior, `SpreadsheetApp.flush()` and `LockService` cooperation, inspect partial visibility and lock conflicts; protect against uncontrolled scripts/manual editing.
9. Verify final exact 52/52 reconciliation and capture reproducible evidence. Restore **both** synthetic ledger and formulas plus test-only Script Properties; removal/cleanup only within explicit approved synthetic resources. Halt and report BLOCKED on any mismatch or incomplete rollback.
10. Return PASS/FAIL/BLOCKED with raw evidence (redacted IDs and synthetic-only values). No permission changes, Deployment, merge or Production release.

## Acceptance gates
| Gate | Expected | Status |
| --- | --- | --- |
| B01 | Exact-ID & exact-title isolated target verified | BLOCKED — integration not authorized |
| B02 | Required requisition tabs/schema safely initialized on synthetic-only Sheet | BLOCKED |
| B03 | Actual Apps Script read-only formula audit PASS on isolated movement-only formulas | BLOCKED |
| B04 | Real two-line issue, exact once, durable intent, no doubled stock decrement | BLOCKED |
| B05 | Real retry and deliberate fault injection safely recover | BLOCKED |
| B06 | Ambiguous legacy, duplicate IDs, data mismatches fail-closed | BLOCKED |
| B07 | Lock/flush/property quota behavior validated against Apps Script service | BLOCKED |
| B08 | Synthetic rollback of formulas, ledger and property intent with 52/52 equality | BLOCKED |
| B09 | No Production, STAGING original, ACL, PDF, Deployment or merge touched | PASS during planning only |

## Important non-blocking observation for later investigation
Phase A negative test A11 reported criterion `"จ่าย ออก"` returning 4 under a synthetic `"จ่ายออก"` ledger input, unexpectedly. Preserve exact-criteria source guard and investigate Sheets text matching with bounded read-only probes or separate new synthetic-only authorization. Do not weaken audit based on one observed result.

**Release decision: BLOCKED.** This document and offline tests do not grant permission to create an Apps Script project or write to any Google Sheet. Keep Draft PR #5 Draft.
