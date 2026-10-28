# KAIDEE-STOCK — STAGING staff Gmail identity PROBE PASS (2026-10-28)

## User supplied real test result

```json
{
  "test": "KAIDEE_GMAIL_IDENTITY_PROBE",
  "activeEmailVisible": true,
  "effectiveUserMatchesActive": true,
  "staffAllowlistMatched": true,
  "status": "STAFF_IDENTITY_CONFIRMED",
  "note": "Identity-only sandbox. No private data read or changed."
}
```

### Acceptance
- **PASS**: Independent Apps Script identity-only project, executed by real allowed Gmail Staff.
- **NOT YET PASS**: Authorization on STAGING stock backend (e.g., `requireStaff_()` and `requireAdmin_()` under real Gmail user).
- **NOT YET PASS**: PDF read vs denied for separate Gmail/anonymous sessions.
- **NOT YET PASS**: Staff can generate PDF in STAGING, and Public is blocked from the backend.
- Existing Admin-only QA PDF file ID `1-fArMDp8e5GHUEoxpM4WMSzkfdckMNLX`; previous independent Drive metadata confirmed direct owner-only access and no domain/anyone grants.
- Distinct identity test confirms the Gmail `Session.getActiveUser()` can be read in an execute-as-accessing-user isolated web app. It DOES NOT prove the same for an execute-as-owner STAGING deployment.

## Next one-minute test: Staff denied opening owner-only PDF

1. In a *separate Chrome profile* signed in only as the allowlisted Staff Gmail, open the EXISTING PDF URL: https://drive.google.com/file/d/1-fArMDp8e5GHUEoxpM4WMSzkfdckMNLX/view
2. Expect `You need access` / access denied because the file and its parent folder have owner-only ACL. Do NOT click Request access, share the file, change permissions, or switch to Admin in that window.
3. Record observed result `STAFF_PDF_OWNER_ONLY_VIEW_DENIED` PASS if truly denied; FAIL and halt if file contents open. An Admin profile opening it is not valid Staff evidence.
4. This negative ACL test is separate from legitimate future Staff entitlement. If the business wants Staff PDF access, implement explicit per-document sharing (or controlled delivery) after a reviewed authorization model; never turn on Anyone with the link.
5. After denial check, implement/review secure Staff-role backend auth under a deployment and least privilege strategy without granting Staff Editor on the STAGING Apps Script or read/write access to all stock Sheets. Production remains untouched.
6. Real Public access test is still pending.
7. Keep Draft PR #4 unmerged; no Production deployment and no more PDF created.
