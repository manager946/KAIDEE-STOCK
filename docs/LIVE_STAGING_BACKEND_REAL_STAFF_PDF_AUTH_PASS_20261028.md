# KAIDEE-STOCK isolated Backend Integration — real Staff PDF authorization PASS (2026-10-28)

User reported response from the isolated synthetic-only Apps Script test deployment:
```json
{
  "test": "KAIDEE_BACKEND_REAL_ACCOUNT_INTEGRATION",
  "action": "staff_pdf",
  "role": "staff",
  "activeEmailVisible": true,
  "effectiveUserMatchesActive": true,
  "status": "ALLOWED",
  "dataSource": "SYNTHETIC_MEMORY_ONLY",
  "writesPerformed": false,
  "simulation": "PDF_AUTHORIZATION_ONLY",
  "fixture": {"document": "QA-SYNTHETIC-NO-FILE"}
}
```

## Result
**PASS** — authenticated real Staff Gmail reached the server-side `staff_pdf` authorization simulation, was allowed, identity was visible and matched the effective user. No PDF was created, no Google Drive permission changed and no STAGING stock data modified.

Previous live Staff results in the same isolated test: `identity` PASS, `staff_read` PASS, `staff_ship` PASS.

## Still pending
- Staff attempting `?action=admin_only`: expected `status:DENIED`, `reason:ADMIN_REQUIRED`, `role:staff`, `writesPerformed:false`. Use the same known-good Staff-only Chrome profile and exact sandbox /exec deployment URL; change only the action parameter. If ALLOWED, stop and investigate immediately.
- Public signed-in unlisted Google account denied `staff_read`, `staff_ship`, `staff_pdf`, `admin_only`, with public `catalog` allowed.
- Actual production-like STAGING Backend end-to-end roles and Google Drive file access are not proven by this synthetic authorization test.

Keep Draft PR #4 Draft; no Production deployment; do not share PDF or grant any role to original STAGING source data.
