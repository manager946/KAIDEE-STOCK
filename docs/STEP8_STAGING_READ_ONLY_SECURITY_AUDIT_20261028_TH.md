# ขั้นที่ 8 — STAGING Read-only Security & Data Audit
Date: 2026-10-28. **Evidence-based, no operations or deployment executed.**

## Scope and controls
- Read-only inspections of source on branch `test/isolated-staging-integration-2026-10-27`, Google Drive file metadata (permission API), and bounded cell/header/formula ranges in the **separate STAGING spreadsheet only**.
- No spreadsheets changed. No Apps Script project / Script Property / deployment changed. No new order, stock movement, reversal, PDF, sharing change, permission change, Production action, or PR merge.
- Source inspection does not prove that the deployed standalone STAGING script contains exactly the same source/version.

## Drive metadata — read-only, independently checked

| Target | Observed | Result |
|---|---|---|
| STAGING Google Sheet | ID `149kQunDS0c5xxXbcOcNQNsjLWPUINnlSebkG5o-1qys`; name `KAIDEE-STOCK STAGING — ทดสอบเท่านั้น — 2026-10-27`; Google Sheet MIME; owner-only user permission, `shared:false`; 11 tabs | PASS for existence/isolation metadata and absence of public sharing |
| Private test PDF | ID `1-fArMDp8e5GHUEoxpM4WMSzkfdckMNLX`; `สรุปสต๊อก_QA-PDF-ACL-20261028.pdf`; owner-only, `shared:false` | PASS for no public sharing on this file |
| Dedicated PDF folder | ID `1GRuYfLNf8bQzarqYmstcI-B2tx4dK-wW`; `KAIDEE-STOCK STAGING PDF`; owner-only, `shared:false` | PASS for no public sharing on this folder |

The available Drive metadata does not reveal any `anyone` or domain-wide permission on these three objects. This does NOT verify every future PDF or Google execution authorization.

## Sheet state (bounded reads)
- Visible tabs (11): `ชีต1`, `KAIDEE_OperationJournal`, `คลังสินค้า`, `บันทึกรับ-จ่าย`, `สรุปยอดขายรายเดือน`, `ใบเบิกสินค้า`, `รายการใบเบิก`, `ผู้ใช้งาน`, `ออร์เดอร์และใบขาย`, `รายการขาย`, `QA_StockFlow_20261027`.
- `คลังสินค้า!A8:L8`: `K2-3000K`, opening 3000, received 1, issued 1, **balance 3000**, minimum 200.
- `QA_StockFlow_20261027!A2:H8`: 7 case rows show PASS, including duplicate-issue no-op and duplicate-reversal no-op.
- `KAIDEE_OperationJournal!A2:H4`: QA create, ship, reversal entries marked DONE; operations explicitly synthetic/staging only.
- `คลังสินค้า!H8` is a **dedup-aware** formula accounting for shipment movement IDs and legacy sales/withdrawal records; do not overwrite it.

## GitHub source review
- `apps-script/Code.gs` line 84: `ss_ = () => stagingDb_()`, so legacy stock functions use STAGING database guard.
- `apps-script/SalesStaging.gs` lines 23-29: `stagingDb_()` reads `KAIDEE_STAGING_SPREADSHEET_ID`, opens by that ID, checks title begins `KAIDEE-STOCK STAGING` before business operations.
- Exact Gmail Staff allowlist is held in Script Property `KAIDEE_STAGING_STAFF_EMAILS`; missing caller email fails to Public; Admin allowlist is explicit. `getData()` directs Public to reduced `publicData_()`.
- `stagingCreateOrder`, `stagingListOrders`, `stagingConvertOrder`, `stagingShipOrder`, `stagingReverseOrder`, `stagingRecoverOperation`, and `savePdf` call `requireStaff_()`; Admin-only methods use `requireAdmin_()`.
- PDF source: dedicated `PDF_FOLDER`, `PDF_SHARE_ANYONE=false`, `file.setSharing(PRIVATE,VIEW)`.
- GitHub Actions [Stock safety tests #40652403808](https://github.com/manager946/KAIDEE-STOCK/actions/runs/40652403808) passed **58 tests, 0 failures**, including Public synthetic controls. These source-level tests are not live STAGING authorization verification.

## Findings and blockers

### P1 — `needFix_()` false positive with current deduplicated stock formula
In `apps-script/Code.gs` lines 141-145, the predicate flags any `H8` formula containing `รายการใบเบิก`. The inspected **correct/current** `คลังสินค้า!H8` intentionally contains `รายการใบเบิก` *plus dedup/anti-double-counting logic*. Therefore when this GitHub predicate runs against the current sheet, `needFix_()` will report true even though the H8 formula may be correct. A false "fix formulas" UI prompt or `checkSetup()` advice can induce a destructive action. **DO NOT run `fixFormulas()`**: source lines 732 onward replace those reconciliation formulas and may break stock counting. Recommendation: fix detection logic with an explicit expected formula signature/version and a regression test in the isolated branch before deploying; never auto-run formula repair on the current sheet.

### P1 — Staff execution identity vs owner-only STAGING Sheet permissions
The sheet is currently `shared:false`, owner only. Official Apps Script docs say `Execute as user accessing the web app` runs Google service calls under that user; the externally allowlisted Staff Gmail therefore must have file-level access to open the STAGING Sheet. Otherwise `SpreadsheetApp.openById` can fail for Staff. Conversely `Execute as me` runs as owner and **may not provide external Gmail identity** via `Session.getActiveUser().getEmail()`, as already seen during isolated probe QA.
- Source: https://developers.google.com/apps-script/guides/web
- Source: https://developers.google.com/apps-script/reference/base/session
This is an **architecture/permission compatibility risk**, not a tested failed live STAGING action. Do not solve by making sheet public, automatically sharing to Staff, bypassing Gmail identity, broadening Apps Script scopes, or switching Production deployment.
**Decision needed before live Staff STAGING transaction tests:** least-privilege access plan for the separate STAGING copy, or more isolated trusted identity/backend design that preserves data privacy.

### P2 — Deployment/source/property parity not verified
Drive and GitHub do not expose the actual deployment version, execution mode, Apps Script source bytes in the standalone STAGING project, or current Script Property values. Historical `stagingPreflight` passed, but should not be used as a claim of current parity without a fresh explicit snapshot/check. Admin should manually verify in the **exact STAGING standalone project**, without modifying any fields. Do not run `fixFormulas()`.

### P2 — Public real-account test unavailable
User has only Admin and Staff accounts. Public is covered by source simulation CI, but no independent Public Gmail live acceptance test. Remains PENDING, not a live PASS.

## Stage 8 checkpoint
**READ-ONLY AUDIT: COMPLETED WITH BLOCKERS**. Do not certify full STAGING real-account RBAC or release Production.

## Recommended continuation
1. In GitHub isolated test branch only, remediate `needFix_()` and add regression test; verify CI. Do not deploy.
2. Confirm in STAGING Apps Script project (not Production) the project ID, version/source parity, `KAIDEE_STAGING_SPREADSHEET_ID` exact STAGING target, Staff allowlist count, and **execute-as mode**. Do not share files or change configuration just to test.
3. Decide and document least-privilege strategy for Staff access (owner-only STAGING Sheet vs user-executed Apps Script), then perform read-only real-Staff backend check before controlled synthetic order/ship/reverse/PDF tests.
4. Recheck PDF ACL and stock reconciliation post-test; do not run `fixFormulas()`.
5. Keep PR #4 Draft and Production closed until all required tests pass.
