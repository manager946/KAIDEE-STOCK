# LIVE STAGING acceptance — shipment recovery and return confirmed (2026-10-28)

Project: KAIDEE-STOCK, **STAGING ONLY**. GitHub branch: `test/isolated-staging-integration-2026-10-27`, Draft PR #4. No production edit or deployment.

## User-supplied execution log (Apps Script)
```json
{
  "test": "LIVE_STAGING_RETURN_EXACTLY_ONCE",
  "status": "PASS",
  "orderId": "KS-QA-LIVE-20261027-ORDER001",
  "beforeStock": 2999,
  "nativeBefore": 2999,
  "afterFirst": 3000,
  "afterDuplicate": 3000,
  "nativeAfter": 3000,
  "reverseMovementCount": 1,
  "duplicateReused": true,
  "documentStatus": "ยกเลิก",
  "reverseJournalStatus": "DONE"
}
```

## Independent Google Sheets readback (read-only verification)
Spreadsheet: `149kQunDS0c5xxXbcOcNQNsjLWPUINnlSebkG5o-1qys` (title verified `KAIDEE-STOCK STAGING — ทดสอบเท่านั้น — 2026-10-27`).

- `คลังสินค้า!A8:J8` SKU `K2-3000K`: opening **3000**, receipt **1**, outflow **1**, calculated balance **3000**.
- `ออร์เดอร์และใบขาย!A4:W4`: OrderID matches QA, document type `ใบขายสินค้า`, sale number `SO-KS-QA-LIVE-20261027-ORDER001`, document status `ยกเลิก`, delivery remains `ส่งมอบแล้ว` (historical), no payment.
- `KAIDEE_OperationJournal!A1:H7`: `CREATE:QA-LIVE-20261027-ORDER001`, `SHIP:KS-QA-LIVE-20261027-ORDER001`, `REVERSE:KS-QA-LIVE-20261027-ORDER001` all **DONE**.
- `บันทึกรับ-จ่าย!K4:K200`: exactly two related movement IDs:
  - row 101 `SALE-KS-QA-LIVE-20261027-ORDER001-L01`: `จ่ายออก`, `K2-3000K`, qty **1**, sale number matches.
  - row 102 `SALE-REV-KS-QA-LIVE-20261027-ORDER001-L01`: `รับเข้า`, `K2-3000K`, qty **1**, sale number matches.
- No duplicate outgoing or reverse movement ID observed.

**Result:** LIVE order creation, order→sale conversion, shipping with retry/error recovery, and one-unit return with duplicate attempt: PASS at operation and native-sheet stock balance levels.

## Remaining before Production (NOT PASS)
1. **Fault injection / recovery under different failure points** (there has already been one *real* dropdown-validation failure followed by successful live recovery; separate controlled fault-injection coverage not yet confirmed on live Apps Script).
2. **PDF Admin / Staff / Public real-account tests**. Code.gs includes `requireStaff_()`, `PDF_SHARE_ANYONE=false`, `PDF_FOLDER='KAIDEE-STOCK STAGING PDF'`; these are configuration checks only. No real-user permission evidence yet. Never set Anyone with link.
3. **Formula durability**: manual STAGING-only repair of `คลังสินค้า!H8:H59` excludes completed sale lines already covered by `SALE-<SaleLineID>` MovementID. `Code.gs::fixFormulas()` currently rewrites inventory H formulas to ledger-only `SUMIFS`; running it would overwrite this reconciled formula strategy. Do not invoke `fixFormulas()` or deploy this branch to production without an approved, separately tested reconciliation/migration path.
4. **Cleanup of orphan timestamps from prior failed attempts** (e.g., rows 4 and 5 in movement sheet) has **not** been performed, to preserve evidence. Avoid deleting or rewriting unrelated legacy notes.
5. Final security review: staging deployment identity, no production spreadsheet mutations, no public PDF shares; Draft PR remains **unmerged**.

## Next safe step
Perform **read-only** inspection of PDF identity, file ownership, sharing restrictions, and role gates in the *existing STAGING project*, then plan isolated tests with distinct Google user accounts. Do not use a public-access web-app deployment or alter PDF visibility to simplify testing.

Evidence captured from user execution log and independently verified Google Sheets readback; this document does not assert connector-executed Apps Script functions.
