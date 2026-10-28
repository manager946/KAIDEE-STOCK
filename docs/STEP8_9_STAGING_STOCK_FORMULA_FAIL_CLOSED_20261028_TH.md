# Step 8.9 — Stock formula fail-closed hotfix (2026-10-28)

## Scope and safety
This change is **only on GitHub branch** `test/isolated-staging-integration-2026-10-27`, Draft PR #4. It has **not** been copied to any running Apps Script project or deployed. It has **not** written Google Sheets cells, created or shared a PDF, altered account permissions, or touched Production.

## Grounded root cause
The approved STAGING inventory formula `คลังสินค้า!H8` includes an outgoing movement SUMIFS and fallback sums from `รายการใบเบิก` (paid requisitions) and `รายการขาย` (confirmed shipped sale lines). The sale-line fallback subtracts matching `SALE-` ledger entries, but the paid-requisition fallback does **not** subtract the corresponding `REQ-` ledger entries. A newly issued requisition is posted to `บันทึกรับ-จ่าย` and then marked `จ่ายแล้ว`, which may cause the same issue to be counted in both paths. Therefore changing `needFix_()` to simply regard the hybrid formula as safe would be dangerous.

## Code changes
1. `apps-script/Code.gs`: replace brittle `needFix_()` with read-only `stockFormulaAudit_()`, checking the H-column formula on *every nonblank SKU* against a canonical movement-ledger-only formula, plus old bounded D4 movement formula check. Unknown/blank/hybrid formulas yield `REVIEW_REQUIRED` and `safeForNewRequisitionIssue:false`.
2. `needFix_()` now returns whether the read-only audit is NOT safe. New `qaStockFormulaAuditReadOnly()` requires Admin and logs a summary (no SKUs, full formulas, or properties), without changing Sheets.
3. Legacy `fixFormulas()` permanently disabled in this STAGING branch: Admin-gated and throws before any write. **Do not run the legacy original on STAGING**. The current historical reconciliation is not proven migratable by this step.
4. Requisition `setReqStatus(...,'issue')` still fails closed whenever the audit blocks. Its error explicitly forbids auto-repair.
5. `apps-script/Index.html` banner no longer instructs a destructive repair; explains review is required.
6. `tests/staging-formula-safety-step8-9.test.js`: synthetic source-level regression checks for safe movement-only formula, hybrid paid requisition duplicate risk, old/missing/unknown patterns, mixed SKU rows, destructive repair blocked, issue gate and safe UI copy.

## Acceptance criteria
- GitHub CI: `npm test` all green; no failing formula regression.
- Source change does not claim that the *current hybrid H8* is safe for issuing a requisition. The expected outcome for the current sheet remains **REVIEW_REQUIRED**; no new requisition issue transaction should be performed until explicit design, reconciliation and regression testing are completed.
- The Admin `stagingPreflight()` previously passed 7/7 with private PDF config and correct target STAGING Sheet. This is independent of Step 8.9 formula risk and does not waive stock safety or Staff RBAC requirements.
- The temporary Admin-owned STAGING Apps Script project still contains the previous manually pasted code; this GitHub patch is **NOT active** until explicitly installed and reviewed. **Do not deploy**.

## Next
After CI green, perform review of real paid-requisition data and explicit migration options, preferably on an additional synthetic copy, without writing the existing STAGING Sheet. Decide whether to (A) migrate/normalize the movement-only formula and reconcile all historical transactions, or (B) adapt the hybrid formula to subtract matching REQ-* movements with proven tests; never silently make a hybrid formula pass the gate. Once design is proven, install approved source to the isolated Admin-owned script, run only read-only `stagingPreflight()` and `qaStockFormulaAuditReadOnly()` before considering any issue/shipment tests. PR stays Draft; Production prohibited.
