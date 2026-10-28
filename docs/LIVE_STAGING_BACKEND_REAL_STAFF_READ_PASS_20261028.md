# Isolated Backend Integration — Real Staff read PASS (2026-10-28)

User-provided execution result:
```json
{
  "test": "KAIDEE_BACKEND_REAL_ACCOUNT_INTEGRATION",
  "action": "staff_read",
  "role": "staff",
  "activeEmailVisible": true,
  "effectiveUserMatchesActive": true,
  "status": "ALLOWED",
  "dataSource": "SYNTHETIC_MEMORY_ONLY",
  "writesPerformed": false,
  "fixture": {
    "sku": "QA-LED-MODULE-DEMO",
    "opening": 10
  }
}
```

Status: **PASS for real Gmail Staff identity + simulated read authorization** in the standalone synthetic-only test deployment. This is not permission evidence for the actual STAGING Google Sheets.

Next: Use the same staff-only Chrome profile and same known-good deployment URL with `?action=staff_ship`. Expected `role:staff`, `status:ALLOWED`, `simulation:SHIP_AUTHORIZATION_ONLY`, `writesPerformed:false`, `dataSource:SYNTHETIC_MEMORY_ONLY`. The simulation never ships goods. On mismatch stop. Later test `staff_pdf`, `admin_only`, and Public identity/denial using separate accounts.

No Production or original STAGING changes; PR #4 remains Draft.
