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
