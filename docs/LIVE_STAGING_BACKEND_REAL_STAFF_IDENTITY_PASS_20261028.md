# KAIDEE BACKEND — Real Staff identity PASS (2026-10-28)

User submitted a live JSON response from the **isolated synthetic-only Apps Script Backend Integration project**:

```json
{
  "test": "KAIDEE_BACKEND_REAL_ACCOUNT_INTEGRATION",
  "action": "identity",
  "role": "staff",
  "activeEmailVisible": true,
  "effectiveUserMatchesActive": true,
  "status": "IDENTITY_CONFIRMED",
  "dataSource": "SYNTHETIC_MEMORY_ONLY",
  "writesPerformed": false
}
```

## Acceptance boundary
- **PASS:** Staff Gmail identity is recognized as staff by isolated integration Web App, caller and effective executor identity match, no data written.
- **PENDING:** Staff authorized/denied action matrix; Public real-account denial; real original STAGING backend authorization and Google Drive PDF access remain separate tests.
- Prior results for this deployment returned admin or public/unverified; this verified staff response supersedes them only as proof that current Staff login can be correctly recognized.
- Do not modify original STAGING/Production or share original PDF.

## Next same-session tests
Using precisely the **same successful /exec deployment URL** and Chrome profile, replace only `?action=`:
1. `staff_read`: expect role staff + status ALLOWED + writesPerformed false
2. `staff_ship`: expect role staff + status ALLOWED + simulation SHIP_AUTHORIZATION_ONLY + writesPerformed false
3. `staff_pdf`: expect role staff + status ALLOWED + simulation PDF_AUTHORIZATION_ONLY + writesPerformed false
4. `admin_only`: expect role staff + status DENIED + reason ADMIN_REQUIRED + writesPerformed false

All responses must have dataSource SYNTHETIC_MEMORY_ONLY. On any mismatch stop. Then with an **unlisted different signed-in Google account** test Public getData/catalog and staff/admin denies. No public account may be granted editor rights.

PR #4 remains Draft, Production gated.
