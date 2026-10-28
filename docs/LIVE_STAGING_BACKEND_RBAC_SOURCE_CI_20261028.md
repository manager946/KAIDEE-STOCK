# STAGING Backend RBAC test — 2026-10-28

## Tests performed (automated against real source, no Google resource calls)
Source: `apps-script/Code.gs` and `apps-script/SalesStaging.gs`.
Test: `tests/staging-backend-rbac-source.test.js`.
CI: https://github.com/manager946/KAIDEE-STOCK/actions/runs/40641560786 — success on commit `1e39d02edc7d4e818f11b82b184e547973dc91a7`.

Scenarios include:
- Unlisted external Gmail => Public; deny staff-only PDF and inventory/order operations.
- Empty active email => Public; deny PDF creation and shipment.
- Exact configured Gmail => Staff; denied admin-only fixFormulas, checkSetup, admin allowlist diagnostic.
- Staff PDF entrypoint passes role gate, rejects invalid PDF before Drive side effects.
- Staff shipment passes role gate, mock Google service intentionally aborts before reading/writing data.
- Explicit Admin has admin/staff gates.
- No Gmail wildcard or unlisted Gmail grants Staff.
- Public getData calls public-only projection.
- Existing older PDF role mock test was aligned to updated explicit Admin allowlist and PropertiesService.

## Scope limitation
This verifies the app's **source-level role gates under simulated identity** and CI green; it does NOT prove the live STAGING web app correctly identifies real Staff/Public accounts, or that Staff has the necessary scoped resource permissions. Those remain **PENDING**. Do not label the end-to-end real-account RBAC acceptance as PASS.

## Next safe real-account integration gate
Use a new isolated test-only Apps Script environment with synthetic-only spreadsheet/Drive resources, no access to original STAGING or Production files. Review deployment configuration before any staff/public browser testing; avoid `Execute as me` identity confusion. Execute as accessing user may require test account to be granted limited explicit permissions on synthetic-only resources. Do NOT grant script editor, original STAGING spreadsheet, or admin PDF access to Staff. Validate actual backend `role_()`, `requireStaff_()`, `requireAdmin_()`, and safe side-effect-free negative endpoint tests using real accounts before considering deployment into main STAGING; never deploy Production.

Known danger: `fixFormulas()` modifies native inventory formulas, can break previously repaired dedup reconciliation. Never run it in current STAGING.
