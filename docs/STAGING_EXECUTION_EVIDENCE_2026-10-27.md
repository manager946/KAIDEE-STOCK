# Execution evidence — 2026-10-27

Base branch: test/isolated-staging-integration-2026-10-27 (source inspected at 783982b428a6b73e20275cca578d9040544ce365).

## Local verification
Command: npm test (Node built-in test runner). Result: 30 tests, 30 PASS, 0 FAIL, 0 skipped.

New tests execute the actual source in a Node VM, with in-memory Sheets/Drive substitutes. These are NOT live Google integration results.

| Check | Local result | Live Google result |
|---|---|---|
| Create order, replay same request, convert to sale | PASS | BLOCKED |
| Two-line shipment, duplicate shipment | PASS | BLOCKED |
| Return and duplicate return | PASS | BLOCKED |
| Partial posting failure and journal recovery | PASS | BLOCKED |
| PDF server gate: Admin/Staff allowed, Public denied | PASS | BLOCKED |
| PDF creation requests PRIVATE sharing only | PASS (mock Drive) | BLOCKED |
| Actual Admin/Staff/Public PDF view/download | NOT TESTED | BLOCKED |

Lifecycle evidence: opening QA-SKU stock 100; order lines 2 + 3; posting gives 95; duplicate remains 95; return gives 100; duplicate remains 100. Four movement rows total (two issues, two returns).

Recovery evidence: injected write failure on second issue activation gives stock 98 and journal ERROR; stagingRecoverOperation('SHIP:'+id) gives 95; replay remains 95; return restores 100.

PDF role tests call actual Code.gs savePdf with dummy stock-report input. They verify authorization and setSharing(PRIVATE, VIEW); they do not establish that Staff can open a file created by the script owner. Per-document PDF permissions and sales PDF generation remain unverified.

## Blocking evidence
Connected Browser returned: "Browser access requires the originating browser context. Open ChatGPT in the browser with the connected extension and try again."
Cloud browser attempt to open Apps Script reached a Google unusual-traffic CAPTCHA. No challenge attempted and no authentication performed.

## Changes and untouched boundaries
Added tests/staging-flow.test.js and tests/staging-pdf-roles.test.js. No runtime source change was needed for the covered mock cases. No Apps Script project was created; no Script Property was set; none of the three files was installed into Google. No Google Sheets were read or modified in this execution. No deployment or sharing changes were made. The provided staging ID is intentionally excluded from GitHub.

## Release gate
BLOCKED / NOT READY FOR PRODUCTION. Keep this PR draft. Requires a working authorized Apps Script editor session, a new standalone STAGING project, Script Property configuration, live execution logs and spreadsheet reconciliation, and actual separate-identity PDF access tests. A mock PASS must never be used as live acceptance evidence.
