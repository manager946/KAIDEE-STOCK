# Public real-account testing deferred — only two Google accounts available (2026-10-28)

The user confirmed there is **no third Google account** beyond Admin and Staff. Do not ask them to create an account and do not mutate either account's roles/allowlists just to force public results.

## Verified live evidence
Isolated Apps Script synthetic backend real Staff identity, staff_read, staff_ship, staff_pdf and Staff denied admin_only: all PASS (five tests). These tests are documented in separate 2026-10-28 QA markdown files.

## Public coverage without third Google account
Added `tests/isolated-backend-public-source.test.js` to evaluate the **actual isolated backend Code.gs source** with mocked Google Session identities, not a live Google account. Its checks cover:
- external unlisted Gmail -> public and identity confirmed
- catalog ALLOWED for simulated public
- staff_read/staff_ship/staff_pdf DENIED / STAFF_REQUIRED
- admin_only DENIED / ADMIN_REQUIRED
- blank or mismatched Session identity fail closed
- spoofed email/role query parameters have no effect
- original Staff/Admin role behavior remains intact

This is source-level **synthetic** verification, not a live external-account pass. Existing `tests/staging-backend-rbac-source.test.js` additionally covers original STAGING source public role defenses and staff-only business functions, also with mocked Google accounts.

## Test status
- REAL_ACCOUNT_STAFF: PASS (isolated only)
- SOURCE_SIMULATED_PUBLIC: test added; results subject to CI or local runner
- REAL_ACCOUNT_PUBLIC: **PENDING (NO THIRD ACCOUNT)** 
- STAGING_BACKEND_FULL_REAL_ACCOUNT_RBAC: PENDING; the isolated probe has no Sheets or Drive scope and cannot prove the production-like backend authorization itself.

## Safety
No original STAGING or Production modifications. No changes to Google account allowlists or Drive PDF permissions. Draft PR #4 must remain Draft; do not merge or deploy Production on the basis of simulated Public testing.
