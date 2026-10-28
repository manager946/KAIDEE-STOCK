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

## CI verified on 2026-10-28 — simulated Public authorization PASS

Workflow: **Stock safety tests**, GitHub Actions run [40652403808](https://github.com/manager946/KAIDEE-STOCK/actions/runs/40652403808), run after commit `450f490e09828450c5be2a7902d86699882a9cf6`.

The workflow job completed **success**, running `npm test` → `node --test tests/*.test.js`. Verified job log shows **58 tests, 58 pass, 0 fail**. In particular, the newly added isolated Public simulation subtests appear in CI as PASS:
- unlisted Google identity classified as Public (test #7);
- Public catalog ALLOWED (test #8);
- Public staff_read/ship/pdf authorization DENIED (test #9);
- Public admin_only authorization DENIED (test #10);
- URL role/email spoofing denied (test #12);
- separate STAGING-source Public function gate tests still PASS.

Change to result: `SOURCE_SIMULATED_PUBLIC: PASS (CI 58/58)`. `REAL_ACCOUNT_PUBLIC: PENDING (no third Google account)` remains unchanged. `REAL_ACCOUNT_STAFF: PASS (isolated probe only)` remains unchanged.

Recommended next nonmutating real-account probe: with **existing Admin account** only, open the same **isolated** deployment's `?action=admin_only` and expect `role:admin`, `status:ALLOWED`, `simulation:ADMIN_BACKEND_GATE_ONLY`, `writesPerformed:false`. This will verify the other side of the matrix before planning real STAGING role coverage. This does not remove the Public-account testing gap.

Never publish CI as proof that the original STAGING backend has been tested end-to-end; PR remains Draft and Production remains gated.
