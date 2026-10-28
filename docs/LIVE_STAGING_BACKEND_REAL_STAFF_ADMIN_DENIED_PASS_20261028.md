# KAIDEE-STOCK — isolated real-account Staff Admin denial PASS (2026-10-28)

User-provided live JSON from the separate, synthetic-only Backend Integration Apps Script web app:
```json
{
  "test": "KAIDEE_BACKEND_REAL_ACCOUNT_INTEGRATION",
  "action": "admin_only",
  "role": "staff",
  "activeEmailVisible": true,
  "effectiveUserMatchesActive": true,
  "status": "DENIED",
  "dataSource": "SYNTHETIC_MEMORY_ONLY",
  "writesPerformed": false,
  "reason": "ADMIN_REQUIRED"
}
```

## Conclusion
**PASS** for Staff denied admin-only backend authorization using actual Gmail employee identity. Caller identified as Staff, active/effective user match, and no writes.

Staff real-account test matrix (isolated synthetic-only web app):
- identity: PASS (IDENTITY_CONFIRMED)
- staff_read: PASS (ALLOWED)
- staff_ship: PASS (ALLOWED, authorization only; no shipment)
- staff_pdf: PASS (ALLOWED, authorization only; no PDF)
- admin_only: PASS (DENIED, ADMIN_REQUIRED)

**Do not confuse** this with a live end-to-end test of the real KAIDEE-STOCK STAGING backend. The mock app has no access to Sheets or Drive and contains no business data.

## Next step: Public account
In a *third isolated browser profile* logged into a **different** Google account not in any Admin or Staff allowlist, use the same isolated test deployment `/exec` URL. The deployment requires sign-in; "Public" here means *a signed-in, unallowlisted external account*. Anonymous users may be blocked at Google sign-in before script invocation.
- `?action=identity`: expect role public + status IDENTITY_CONFIRMED + both identity booleans true
- `?action=catalog`: ALLOWED; synthetic-only fixture
- `?action=staff_read`, `staff_ship`, `staff_pdf`: DENIED / STAFF_REQUIRED
- `?action=admin_only`: DENIED / ADMIN_REQUIRED
- All results: dataSource SYNTHETIC_MEMORY_ONLY; writesPerformed:false

If identity is invisible or effective mismatches active, stop: not proof of Public role. No data sharing, editor access, PR merge, production deployment, or modification to original STAGING.
