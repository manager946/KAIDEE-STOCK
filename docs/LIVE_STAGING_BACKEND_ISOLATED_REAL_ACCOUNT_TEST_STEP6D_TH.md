# KAIDEE BACKEND RBAC — Real-account isolated Integration Test

Created 2026-10-28. This bundle is **not** the main KAIDEE-STOCK backend. It is an isolated Apps Script test app with only synthetic in-memory fixtures; it evaluates Google caller identity and the same server-side role checks as STAGING without Sheets/Drive API calls.

## Install
1. Create a **new standalone** project: KAIDEE-BACKEND-RBAC-INTEGRATION-ISOLATED. Do not paste into STAGING/Production or the previous identity probe; do not grant Staff script edit rights.
2. From `security/backend-integration/Code.gs`, paste all source into the **new** project Code.gs only.
3. Show manifest in Project Settings and replace it with `security/backend-integration/appsscript.json`. Scope is email identity only; no Sheets/Drive.
4. Under Script Properties set `KAIDEE_BACKEND_TEST_STAFF_EMAIL` to the single verified Gmail employee (do not place the email in GitHub/chat).
5. Deploy > New deployment > Web app: Execute as **User accessing the web app**, Who has access **Anyone with Google account**, sign-in required. If options unavailable, STOP. This deploy applies only to the new sandbox.
6. Test via **/exec**, NOT /dev (editor-only). Open in separate Chrome profiles for Admin, Staff Gmail and an unlisted Google account (Public). A fully anonymous user may see Google sign-in instead of JSON because deployment requires login.

## Actions/expected

| ?action= | Admin | Staff | Public (signed-in unallowlisted Google account) |
|---|---|---|---|
| identity | IDENTITY_CONFIRMED; admin | IDENTITY_CONFIRMED; staff | IDENTITY_CONFIRMED; public |
| catalog | ALLOWED | ALLOWED | ALLOWED |
| staff_read | ALLOWED | ALLOWED | DENIED / STAFF_REQUIRED |
| staff_ship | ALLOWED | ALLOWED | DENIED / STAFF_REQUIRED |
| staff_pdf | ALLOWED | ALLOWED | DENIED / STAFF_REQUIRED |
| admin_only | ALLOWED | DENIED / ADMIN_REQUIRED | DENIED / ADMIN_REQUIRED |

Every response must state `dataSource:SYNTHETIC_MEMORY_ONLY` and `writesPerformed:false`. In every signed-in session verify `activeEmailVisible:true` and `effectiveUserMatchesActive:true`. If missing/mismatch, test blocked. The exact user email is never echoed.

`staff_ship` and `staff_pdf` only check server authorization; they never do a shipment or create a PDF. The test app does not use real STAGING data or code deployments and does not prove authorization of the actual KAIDEE-STOCK backend yet.

## Automated verification
The independent local Node test suite (7/7 passed when generated) evaluates the access matrix, forged role query, execute-as-owner mismatch fail-closed, blank identity, unknown action, unlisted Gmail and absence of Google data APIs/extra scopes.

No Production deploy, PR merge, original STAGING Sheets access, original PDF access or original script edit rights to Staff.
