# KAIDEE-STOCK — isolated backend real Admin authorization PASS (2026-10-28)

## User-provided evidence

The user supplied this live JSON response from the standalone **KAIDEE-BACKEND-RBAC-INTEGRATION-ISOLATED** Apps Script Web App:

```json
{
  "test": "KAIDEE_BACKEND_REAL_ACCOUNT_INTEGRATION",
  "action": "admin_only",
  "role": "admin",
  "activeEmailVisible": true,
  "effectiveUserMatchesActive": true,
  "status": "ALLOWED",
  "dataSource": "SYNTHETIC_MEMORY_ONLY",
  "writesPerformed": false,
  "simulation": "ADMIN_BACKEND_GATE_ONLY"
}
```

Result: **PASS** — a signed-in real Admin account was recognized as Admin and allowed through the isolated app's admin-only server authorization gate, without writing data.

## Full isolated-backend QA evidence

- Admin `identity`: PASS, real account.
- Admin `admin_only`: **PASS**, real account.
- Staff `identity`: PASS, real account.
- Staff `staff_read`: PASS, simulated data only.
- Staff `staff_ship`: PASS, authorization-only simulation; no shipment.
- Staff `staff_pdf`: PASS, authorization-only simulation; no PDF creation.
- Staff `admin_only`: PASS because denied with `ADMIN_REQUIRED`.
- Public synthetic source test: PASS in GitHub Actions workflow run [40652403808](https://github.com/manager946/KAIDEE-STOCK/actions/runs/40652403808), 58 tests passed, 0 failed (covers public catalog allowed, staff/admin denies, URL spoofing etc).
- Public third-account live test: **PENDING**; user has only Admin and Staff Google accounts. Do not make the user create a third account or remove Staff allowlist to fabricate a Public pass.

## Restrictions and next stage
The isolated probe uses `SYNTHETIC_MEMORY_ONLY`, `writesPerformed:false` and intentionally does not touch Google Sheets, Drive or business operations. It **does not prove** security of actual production-like STAGING functions or real shared PDF Drive access.

Recommended next stage: perform a nonmutating review of STAGING source gates and sandbox configurations and design a tightly scoped QA plan for Admin and Staff in the separately isolated STAGING. Only after verifying that exact target project and sheet IDs and using synthetic orders/PDFs should anyone perform controlled end-to-end tests; never touch Production. Also check role-gated business functions, shipment repeat/idempotence, recovery and private PDF access using the existing test evidence.

Keep PR #4 in Draft. Never merge or deploy Production automatically.
