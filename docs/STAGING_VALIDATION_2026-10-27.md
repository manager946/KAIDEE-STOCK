# KAIDEE-STOCK Staging test report — 2026-10-27

## Verified live Google Sheets COPY (not production)
- A private copy of **สต๊อกสินค้า LED** was created and verified to have the 9 original tabs, including **ออร์เดอร์และใบขาย** and **รายการขาย**.
- A dedicated QA sheet `QA_StockFlow_20261027` contains only dummy `QA-SKU` and formulas. 7/7 calculation rows displayed PASS on readback: posting, duplicate key, reversal, duplicate reversal, and subsequent posting.
- **This is Sheets formula verification only, NOT a live Apps Script integration test.** No production inventory was changed.
- Do not put the staging spreadsheet ID into GitHub or any publicly accessible code. Configure `KAIDEE_STAGING_SPREADSHEET_ID` in the test Apps Script project *Script Properties*.
- The original Google Sheets still requires independent verification that it is the bound spreadsheet of the deployed production Apps Script.

## GitHub files
- `apps-script/SalesStaging.gs`: staging-only order/sales workflow using existing 23-column sales header, 9-column lines, and 16-column movement log. Reuses immutable IDs.
- `apps-script/Index.html`: adds **ออร์เดอร์/ใบขาย** menu for staff/admin when the test build is deployed.
- `apps-script/Code.gs`: new PDFs default private, retain previous versions, validate PDF signature and size.
- `tests/staging-sales.test.js`: mock/static safety tests.

## Safety mechanism
1. Every entry point checks role. `stagingDb_()` fails closed unless the target spreadsheet starts with `KAIDEE-STOCK STAGING`.
2. New orders require a stable clientMutationId; the order ID and display number are derived from that identifier.
3. `KAIDEE_OperationJournal` stores `OperationKey`, payload, and `PENDING/ERROR/DONE` to detect repeated requests and allow retries.
4. Each stock movement has stable `MovementID = SALE-<SaleLineID>` or `SALE-REV-<SaleLineID>`. Prepared rows use inactive types `เตรียมจ่าย` and `เตรียมรับคืน`, not included in stock totals. Recovery retries use existing rows, posting missing movements only.
5. `LockService` serializes Apps Script calls for one deployment; `stagingShipOrder` and `stagingRecoverOperation` can continue incomplete operations.
6. Do not mix old order editing with new operations after first posting. Journal payload validation is mandatory.

## Remaining risks / limits
- Google Sheets is not a transactional database. If an Apps Script execution fails mid-write, a later retry is required. Manual spreadsheet editing can break idempotency.
- `stagingConvertOrder` is a separate operation; direct edits can bypass state machine checks.
- The front-end currently supports one product line at creation, while backend accepts up to 30.
- A full test must be run from a **separate test Apps Script project** with `Code.gs`, `Index.html`, and `SalesStaging.gs` copied in, deployment limited to admin testers, and Script Property configured.
- Apps Script code supplied by user uses `SpreadsheetApp.getActive()` for legacy functions; these must not be exercised from standalone staging project before changing to a deliberately bound staging spreadsheet. SalesStaging APIs use `openById` with a strict staging name gate.
- Existing PDF files already shared with “Anyone with the link” are **not** automatically made private by the code change. A prior real document was found with Anyone/Viewer permissions. Review and change sharing individually in Drive as authorized.
- The PDF blob is generated in browser; server currently verifies file signature, size and document existence, not full PDF contents or ownership per-document.
- The full integrated Apps Script workflow, permission test as external user, and printing on iOS/Android remain **UNTESTED**.
- **Do not merge/deploy to production.**

## Staging rollout checklist
1. Use a separate test Apps Script editor/project. Copy these files; keep Apps Script deployment access restricted.
2. Set Script Property `KAIDEE_STAGING_SPREADSHEET_ID` to the **copied private staging** spreadsheet ID.
3. Confirm the connected account is a recognized admin/staff under the test deployment.
4. Call `stagingCreateOrder({clientMutationId:'QA-UNIQUE-1234',customer:'Test only', lines:[{code:'<valid test SKU>',qty:1,price:1}]})`.
5. Call `stagingConvertOrder(id)`, `stagingShipOrder(id)` twice; verify exactly one movement per line and one stock change.
6. Call `stagingReverseOrder(id,'QA test')` twice; verify exactly one reversal per line.
7. Inject a controlled test failure between movement postings, rerun `stagingRecoverOperation('SHIP:'+id)`, and verify no duplicate posting.
8. Test PDF saved as private and ensure the PDF is inaccessible to an unauthorized browser session.
9. Confirm data in original production spreadsheet is unchanged.
