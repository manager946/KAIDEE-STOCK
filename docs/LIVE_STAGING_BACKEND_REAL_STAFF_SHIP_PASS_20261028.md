# KAIDEE-STOCK — Real Staff synthetic backend ship authorization PASS (2026-10-28)

User-submitted JSON from the separate, isolated Apps Script backend test deployment:

```json
{
  "test": "KAIDEE_BACKEND_REAL_ACCOUNT_INTEGRATION",
  "action": "staff_ship",
  "role": "staff",
  "activeEmailVisible": true,
  "effectiveUserMatchesActive": true,
  "status": "ALLOWED",
  "dataSource": "SYNTHETIC_MEMORY_ONLY",
  "writesPerformed": false,
  "simulation": "SHIP_AUTHORIZATION_ONLY",
  "fixture": {
    "sku": "QA-LED-MODULE-DEMO",
    "qty": 1
  }
}
```

**PASS:** separate Staff Gmail was authenticated; backend role gate allowed shipment authorization simulation, no data written.

**Not proven:** actual staging shipment flow permissions with a real Staff account or PDF access; this exercise calls **only** the mock authorization gate, not original stock backend. Production remains untouched. Keep PR #4 draft.

Next same Staff Gmail session: `?action=staff_pdf` should return `status:ALLOWED`, `simulation:PDF_AUTHORIZATION_ONLY`, `role:staff`, `writesPerformed:false`; then `?action=admin_only` should return `status:DENIED`, `reason:ADMIN_REQUIRED`. Use the identical successful /exec URL with only the action parameter changed. Do not create PDFs or share files.
