# Continue existing Apps Script staging project (no duplicate project)

Target project: **KAIDEE-STOCK-STAGING-TEST-20261027**

Project URL: https://script.google.com/home/projects/1FkShpFVzV_xDURPN-7HLPk6ASdmLJo3trjXB5Xd6LAILHfxYU6BOeyWa/edit

This is a **manual, gated** procedure only. Our connector cannot read or edit Apps Script project files directly.

## Current verified status
- `Code.gs` and `SalesStaging.gs` were entered in the editor, but saves and integrity **are unverified**.
- `Index.html`, `StagingDiagnostics.gs`, and Script Property still need checking/completion.
- Local/mock tests were 30 PASS / 0 FAIL as of Oct 27, 2026, but **live Google tests are BLOCKED**.
- No production deployment, inventory posting, PDF sharing change, or original-sheet edits.

## Safer CLI alternative to browser paste
Use a computer with Node.js and Google clasp installed and authenticated to the **correct Google account**. Google authentication and any CAPTCHA must be completed by the human account owner. Never give token files or OAuth credentials to ChatGPT.

1. Check out the GitHub branch `test/isolated-staging-integration-2026-10-27` on your computer.
2. Verify the existing project ID at https://script.google.com/home/projects/1FkShpFVzV_xDURPN-7HLPk6ASdmLJo3trjXB5Xd6LAILHfxYU6BOeyWa/edit. It must match exactly.
3. Before changing a partially populated Apps Script project, **back it up**: in a clean empty folder create `.clasp.json` with the project ID and run `clasp pull`; inspect the pulled files and preserve this folder separately. Do not run `clasp push` from this backup folder.
4. From the repository root run:
   `node scripts/prepare-staging.mjs 1FkShpFVzV_xDURPN-7HLPk6ASdmLJo3trjXB5Xd6LAILHfxYU6BOeyWa`
   This prepares `build/staging-upload` only; it makes no Google calls.
5. Inspect generated `build/staging-upload/.clasp.json`, four source files, and `appsscript.json`. Confirm there are **no unexpected files**, and that `clasp show-file-status` reports only intended staging files.
6. Only after confirming backup and identity: from `build/staging-upload` run `clasp push`. Follow any local CLI instructions; never authorize other script IDs. Verify resulting files and manifest in the target editor and/or pull into a second verification folder.

## Caveat: Thai default script filename
Apps Script initially created a file named `รหัส.gs` and the browser pasted the Code.gs content there. A clasp push may replace remote files with the local file set: preserve a backup first; ensure the delivered files have `Code.gs` exactly once and no duplicate function names.

## Script Property (only in the existing staging project)
Project Settings → Script properties:
- Key: `KAIDEE_STAGING_SPREADSHEET_ID`
- Value: `149kQunDS0c5xxXbcOcNQNsjLWPUINnlSebkG5o-1qys`

Do not store this value in project source, or any OAuth secret in the repository. The code checks the target spreadsheet name starts with **KAIDEE-STOCK STAGING**.

## Preflight and staged acceptance
1. Confirm saved files; add and save `StagingDiagnostics.gs`.
2. Run read-only `stagingPreflight` as admin; check detailed result. Do not continue if it does not report READY_FOR_LIVE_STAGING_TEST.
3. Test create/retry/sale/shipment duplicate/return/partial-write recovery with test-only SKU in the copied spreadsheet.
4. Test Admin/Staff/Public access to generated PDF with real separate accounts. Private Drive PDFs aren't automatically visible to all Staff: sharing policy may require redesign.
5. Record exact invocation timestamps, log outputs, document keys, movement IDs, before/after balances, and permission evidence in PR #4.

**KEEP BLOCKED:** Until real Apps Script integration tests and document access checks pass, leave PR #4 Draft, do not deploy production, and do not touch original Google Sheets.
