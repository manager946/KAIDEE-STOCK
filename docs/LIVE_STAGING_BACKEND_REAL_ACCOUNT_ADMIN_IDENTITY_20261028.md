# KAIDEE-STOCK isolated Backend integration — Admin identity PASS

User-provided live execution response from the **separate synthetic-only** web app (2026-10-28):

```json
{
  "test": "KAIDEE_BACKEND_REAL_ACCOUNT_INTEGRATION",
  "action": "identity",
  "role": "admin",
  "activeEmailVisible": true,
  "effectiveUserMatchesActive": true,
  "status": "IDENTITY_CONFIRMED",
  "dataSource": "SYNTHETIC_MEMORY_ONLY",
  "writesPerformed": false
}
```

**Interpretation:** isolated web app resolved the actual invoking Google account as admin. This is a live real-account identity PASS, **not** yet evidence of Admin privileged action authorization. Staff Gmail and Public actual backend calls remain PENDING.

## Next real-account tests
1. With a fresh Chrome profile containing **only** the separately allowlisted staff Gmail, open the same **isolated probe** `/exec?action=identity`. Expect role staff, visible and matching active/effective identities, IDENTITY_CONFIRMED.
2. If correct, use the same staff profile on `?action=staff_read`, `?action=staff_ship`, `?action=staff_pdf` — expect ALLOWED / SYNTHETIC_MEMORY_ONLY / writesPerformed:false, and `?action=admin_only` — expect DENIED / ADMIN_REQUIRED.
3. Use a distinct unlisted Google account for Public backend tests: catalog ALLOWED; staff_read, staff_ship, staff_pdf, admin_only DENIED. Public with no login may be blocked by Google before reaching script.
4. These probes do not actually ship goods or produce PDFs, nor do they authorize access to the original STAGING spreadsheet or Drive PDFs.

Do not deploy or modify Production; do not grant Staff editor access or original STAGING data permissions; leave PR #4 Draft.

## 2026-10-28: Staff Gmail browser test BLOCKED (routing error, not RBAC denial)

User-provided screenshot of the synthetic-only Backend Integration web app shows Google Drive generic error `ขออภัย ไม่สามารถเปิดไฟล์ได้ในเวลานี้` instead of expected JSON response. Address is `script.google.com/macros/u/1/s/[DEPLOYMENT_ID]/exec?action=identity`, with the **account-indexed `/u/1/` segment**. `/exec` is present; earlier explanation that `/exec` was missing has been superseded. This is **not** evidence of `DENIED` from the backend. Staff live test remains **BLOCKED/UNVERIFIED**.

Next: Admin check exact deployed Web app URL and access/execution setting; Staff open canonical `https://script.google.com/macros/s/[DEPLOYMENT_ID]/exec?action=identity` in a fresh Chrome Guest/profile with exactly one signed-in Gmail and no Admin account; do not grant script edit. Verify if Google auto-rewrites to `/u/1/`; inspect project's Executions log for matching doGet invocation. If no execution, routing/auth or deployment issue should be investigated before any RBAC conclusion. No STAGING/Production change.

References: Google Apps Script troubleshooting (multi-account not supported) https://developers.google.com/apps-script/guides/support/troubleshooting and official issue tracker https://issuetracker.google.com/issues/574076813 (Oct 2026; account-specific web-app 404 before authorization).

## 2026-10-28 — Canonical /exec link responds, but role is still Admin

Following correction of the URL to `https://script.google.com/macros/s/[deployment-id]/exec?action=identity`, user reports JSON:
```json
{"test":"KAIDEE_BACKEND_REAL_ACCOUNT_INTEGRATION","action":"identity","role":"admin","activeEmailVisible":true,"effectiveUserMatchesActive":true,"status":"IDENTITY_CONFIRMED","dataSource":"SYNTHETIC_MEMORY_ONLY","writesPerformed":false}
```
This confirms the **canonical route returns JSON**, resolving the prior generic Drive error, but is **NOT Staff identity acceptance**. Explicit Admin role means the server identified an Admin session under its current deployment; investigate multi-account browser sessions or Execute-as setting, and possible stale deployment if a fresh isolated Staff-only profile still returns Admin. Do not change role configuration or grant broader permissions as a workaround. Staff and Public real-account Backend integration remain pending. Do not run simulated ship/PDF action checks under the misidentified session.

## 2026-10-28 — Real Staff Gmail session reached isolated Web App but identity was unavailable

User-provided JSON from `?action=identity`:
```json
{
  "test": "KAIDEE_BACKEND_REAL_ACCOUNT_INTEGRATION",
  "action": "identity",
  "role": "public",
  "activeEmailVisible": false,
  "effectiveUserMatchesActive": false,
  "status": "IDENTITY_UNVERIFIED",
  "dataSource": "SYNTHETIC_MEMORY_ONLY",
  "writesPerformed": false
}
```

**Interpretation:** the standalone synthetic-only Backend probe was reachable, but it could not read the Gmail identity, and its fail-closed role policy classified caller as Public. Do not treat this as a real-account public-role acceptance PASS or a successful Staff role test. Real Staff integration **BLOCKED**; no stock/PDF data changed.

Possible deployment mismatch: Apps Script Session.getActiveUser().getEmail() can be blank when a Web App runs as owner (Execute as me), especially for users outside the developer's Workspace domain. Verify the exact tested deployment in Deploy > Manage deployments: Web app / execute as `User accessing the web app`, and access for signed-in Google users. If setting wrong, fix ONLY isolated test project's deployment by edit + new version; never alter original STAGING/Production. If setting correct, inspect OAuth userinfo.email scope, employee consent, deployment version, and script Executions for the invocation, without granting additional permissions. Do not change backend to trust email or role from URL/query parameters.

Official references: https://developers.google.com/apps-script/reference/base/session ; https://developers.google.com/apps-script/guides/web .

## 2026-10-28 — after creating execute-as-user test deployment, Staff URL still redirects to /u/1/ and Drive error

User screenshot after new isolated Backend Integration deploy shows `script.google.com/macros/u/1/s/[same previously seen ID]/exec?action=identity`, with Google Drive `ขออภัย ไม่สามารถเปิดไฟล์ได้ในเวลานี้`, not JSON. Staff status remains BLOCKED/UNVERIFIED; no evidence that `doGet` ran. User had previously shown an isolated test deploy using "User accessing the web app" and "Anyone with Google account", but screenshot may still use old deployment URL. Next diagnostic: copy Web app URL directly from the **newly created deployment** in Manage deployments (not the prior Stock deploy), then test in a dedicated Chrome Guest profile with only Staff Gmail signed in. Compare deployment ID, test canonical /macros/s/{ID}/exec first, inspect Executions for corresponding request. If no `doGet`, this is Google routing/auth/deployment-layer, not RBAC logic. Official troubleshooting: https://developers.google.com/apps-script/guides/support/troubleshooting ; related Apps Script issue: https://issuetracker.google.com/issues/574946511 . No Production or original STAGING mutation.
