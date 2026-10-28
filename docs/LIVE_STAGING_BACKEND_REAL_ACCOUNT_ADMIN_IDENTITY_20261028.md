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
