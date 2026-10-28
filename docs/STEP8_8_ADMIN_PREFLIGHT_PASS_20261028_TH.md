# KAIDEE-STOCK STAGING Admin — Step 8.8 Preflight PASS (28 Oct 2026)

Evidence received from user at 2026-10-28 16:45:23 local time. The user ran the read-only `stagingPreflight()` in the **new standalone Admin-owned STAGING test Apps Script project** and logged the returned JSON with `qaStage8PreflightReport()`:

- `status: READY_FOR_LIVE_STAGING_TEST`
- `spreadsheetTitle: KAIDEE-STOCK STAGING — ทดสอบเท่านั้น — 2026-10-27`
- `userRole: admin`
- `targetPropertyConfigured: true`
- `pdfPrivateByDefault: true`
- `pdfStagingFolderIsolated: true`
- `checks`: all seven entries PASS (inventory, movements, requisitions, requisition lines, users, orders/sales, sale lines), no mismatches.
- `generatedAt: 2026-10-28 16:45:23`.
- The function notes that this is READ ONLY and does not prove stock posting, reversal, permissions, or deployment.

## Accurate interpretation
**PASS** for an Admin read-only connection, expected worksheet structure and private PDF flags in the new, independent STAGING script project. **NOT** a pass for end-to-end shipment, reversal, actual Staff authorization, front-end page rendering, or PDF Drive ACL on any newly generated file.

## Step 8.9 formula risk — reviewed but NOT altered
Read-only review of current STAGING Google Sheet:
- Inventory `H8` uses movement-outgoing SUMIFS, paid requisition fallback, confirmed shipped sales fallback and an anti-double-count `SALE-` movement journal subtraction. It is a **specialized reconciliation formula**, which must **not** be replaced by `fixFormulas()`.
- Inventory `I8` is `=F8+G8-H8`; displayed opening 3000, received 1, issued 1, balance 3000.
- Movement `D4` is empty.
- On current GitHub branch, `Code.gs` `needFix_()` treats *any* H8 formula referencing `รายการใบเบิก` as requiring repair, although the current specialized formula intentionally references that tab. This yields an unreliable "repair required" signal and may also block requisition issue processing. Correct dedup semantics for paid requisitions must be separately verified before relaxing the safety gate. This source logic is unchanged; no formulas or Google Sheet cells changed.
- **DO NOT RUN `fixFormulas()`**, and do not take stock-issuing actions on this newly set up project until a validated formula + regression test solution is approved.

## Additional release blockers
- In the screenshot of the new script project, HTML file label showed `Index.html.html`; check the actual Apps Script HTML file name expected by `HtmlService.createHtmlOutputFromFile('Index')` before UI testing. Do not presume that passing preflight verifies HTML loading.
- A new deployment for this Admin-owned STAGING script has NOT been evidenced by the preflight test. Before any deployment, explicitly verify project identity, execution mode, audience, Staff email identification architecture and no production-targeting properties.
- Real Staff access to the new STAGING backend and public real-account checks are pending.
- Draft PR #4 remains Draft; do not merge, do not deploy/modify Production, do not share internal PDFs publicly.

## Suggested controlled next move
Implement a regression-tested `needFix_` and inventory reconciliation review **in the GitHub test branch only**, without editing the deployed Google Sheet; verify Node CI. Then have Admin copy only the approved change to the new STAGING script, rerun read-only preflight and separate read-only formula safety checks. No web deployment until these pass.
