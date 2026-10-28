# Step 8.11 — Read-only real-sheet reconciliation and proposed formula migration (2026-10-28)

## Status
**READ-ONLY RECONCILIATION PASS (52/52 SKU)**, but **ISSUING REQUISITIONS REMAINS BLOCKED**.
No edits to Google Sheets, permissions, PDFs, Apps Script projects, deployments, or Production.

## Evidence
The Admin ran `qaStockFormulaAuditReadOnly()` and returned:
- `status: REVIEW_REQUIRED`
- `safeForNewRequisitionIssue: false`
- `checkedSkuCount: 52`
- `issues[0..11]: REQUISITION_FALLBACK_DOUBLE_COUNT_RISK`. Note: 12 rows are the **limited issue samples**, not the total number affected. All 52 H formulas in current data contain the paid-requisition fallback without REQ movement anti-duplicate protection.

A fresh *read-only* inspection of approved existing STAGING Sheet on 2026-10-28 shows:
- The `คลังสินค้า` tab contains **52 nonblank SKUs on consecutive rows 8–59**.
- Each of the 52 inventory `G` (received) and `H` (issued) displayed values matches the sums of actual movement ledger types `รับเข้า` and `จ่ายออก` respectively (**52/52**, zero mismatches).
- Each row's `I = F+G-H` arithmetic matches displayed balance (**52/52**, zero mismatches).
- The requisition header table has **zero requisitions**, hence zero currently paid requisitions.
- Current ledger contains two actual movement transactions: one `SALE-` outbound, one `SALE-REV-` return, both for a synthetic test item; they net to zero.
- Three existing sales documents are cancelled; zero confirmed shipped sales contribute any *current* legacy fallback.
- Sample `K2-3000K` has opening 3,000, received 1, issued 1 and ending 3,000.
- All 52 H formulas currently contain the paid-requisition fallback and the sale fallback; the sale fallback has a `SALE-` anti-duplicate subtraction while the requisition fallback has **no** matching `REQ-` subtraction.
- The original hybrid formula is a **future double-counting risk for new paid requisitions**, although today's rows currently agree with movements.
- A "matching 52/52" historical snapshot does not by itself prove end-to-end shipping, reversal, RBAC or PDF permissions.

## Safe candidate — movement-only issued quantity
For an isolated **scratch copy**, candidate formula at `คลังสินค้า!H8`:
```gs
=SUMIFS('บันทึกรับ-จ่าย'!$E:$E,'บันทึกรับ-จ่าย'!$C:$C,A8,'บันทึกรับ-จ่าย'!$B:$B,"จ่ายออก")
```
Fill **H8:H59** with relative row references. It uses the movement ledger as the sole source of issued quantity. It exactly matches the current H8:H59 values under the read-only snapshots, and corresponds to the audited gate's canonical formula. It also harmonizes stock computations with `balances_()`, which considers movements rather than paid-requisition/sale fallbacks.

**Never blindly apply this to Production, and do not apply it to the existing STAGING Sheet yet.**
A separate isolated copy must first be generated with verified distinct spreadsheet ID and only synthetic test data. Capture existing H formulas, before/after G/H/I values, and a valid rollback plan.

## Mandatory QA on isolated clone before any STAGING migration
1. Verify pre-change 52/52 matching balances + immutable source snapshot; no duplicate MovementID or DocumentNo effects.
2. Copy candidate H8 to all 52 SKU rows; compare all G/H/I values exactly against prechange snapshot.
3. Create an approved requisition with lines, issue it once, then verify one outbound ledger movement per line; H increases **once**, not twice; I decreases once.
4. Retry issue on the same document: no second movement; journal remains consistent.
5. Create/convert/ship sales, verify one movement per sale line and exactly one unit decrement; reverse/return once, verify inbound ledger and balance restoration; retest retries after injected failure.
6. Test row expansion beyond row 59, unknown SKU, incomplete movement, cancellation and independent Admin/Staff/Public role paths; ensure PDF is private.
7. Re-run `stagingPreflight()` and `qaStockFormulaAuditReadOnly()` on clone, capture expected PASS shape. Review all results and approve a deliberate migration to existing STAGING Sheet **only after** these conditions pass, with rollback evidence.

## Gate
Until then current live STAGING `needFix_()` must continue to return **true**. Do not issue requisitions, run legacy `fixFormulas()`, deploy or modify Production, broaden Sheet permissions, or create public PDF links. Draft PR #4 stays Draft.
