# KAIDEE-STOCK STAGING — PDF access anomaly / verification gate (2026-10-28)

**STATUS: BLOCKED — unexpected Staff access report, not yet verified in identity-pinned browser session.**

## Real-test evidence from user
- `KAIDEE_GMAIL_IDENTITY_PROBE` from isolated execute-as-user identity-only app: `STAFF_IDENTITY_CONFIRMED`, `activeEmailVisible=true`, `effectiveUserMatchesActive=true`, `staffAllowlistMatched=true`. This confirms identity for the identity-only app; it does NOT prove the same browser/account opened the PDF.
- PDF ACL test (user-observed): Staff Gmail = OPENED; Public not signed in = DENIED. Staff result is contrary to planned owner-only policy; Staff/PDF acceptance must remain unverified/blocked.
- Earlier real Admin PDF test `STAGING_PDF_ADMIN_PRIVATE_FILE` PASS.

## Independent read-only Drive metadata recheck
- PDF `1-fArMDp8e5GHUEoxpM4WMSzkfdckMNLX`, `shared:false`, permissions only `user:owner manager@metangprint.org`.
- Parent `KAIDEE-STOCK STAGING PDF`, folder `1GRuYfLNf8bQzarqYmstcI-B2tx4dK-wW`, `shared:false`, owner-only.
- Root parent `ไดรฟ์ของฉัน`, `0AMYFOo03D9tOUk9PVA`, owner-only; not a shared drive, no cross-domain grants in returned metadata.
- Hence no visible explicit or inherited Gmail staff grant from these resources. **Do not assume this explains the staff opening.** Potential multi-account Chrome session or another account context, wrong PDF, cache or alternative grant remains to investigate.

## Next required no-write verification (DO THIS BEFORE ANY PERMISSION OR DEPLOY CHANGE)
1. Close test PDF tabs. Open a newly created clean Chrome profile or Guest session without signing into `manager@metangprint.org` (do not sign out of or alter Admin session).
2. Sign in to only the test Staff Gmail account in this new profile.
3. In that same profile, open the already used `KAIDEE_GMAIL_IDENTITY_PROBE` /exec URL. Verify the identity check still returns STAFF_IDENTITY_CONFIRMED.
4. In the **same profile**, open exact test PDF URL `https://drive.google.com/file/d/1-fArMDp8e5GHUEoxpM4WMSzkfdckMNLX/view`. Verify PDF file ID and Google account avatar / Google Account menu (it must be the Staff Gmail, not Admin). Report OPENED vs ACCESS DENIED, without sending Gmail address.
5. If OPENED under Staff Gmail only, treat as real access-control incident. Keep staging-only PDF in its owner-only folder and preserve evidence; do not share it, run `savePdf` again, change access, merge PR or deploy Production. Review Drive access activity and security configuration before any Staff access test.
6. If DENIED, label the earlier Staff OPENED result as account/session-mixup probable and record the retest evidence. Then proceed to separate actual backend authorization checks in a tightly isolated read-only deployment after security review. Do not infer backend Staff permissions from this PDF check.

## References
- Official Google Drive: Restricted files can be opened only by accounts that have access, and with multiple Google accounts users should ensure they are signed into the account that has permission: https://support.google.com/drive/answer/16722399
- Google Drive folder inheritance: https://support.google.com/drive/answer/7166529

No Production changes. Draft PR #4 remains Draft. The document captures user-observed discrepancy but not proof of a data breach.

## Update: isolated Staff Chrome profile — PDF access DENIED (2026-10-28)

User uploaded a screenshot of Google Drive's Thai **"ต้องมีสิทธิ์เข้าถึง"** (You need access) request-access page for the same private STAGING QA PDF. The page indicates a logged-in external Gmail account. The Staff test was performed using the requested separate Chrome profile.

Revised assessment:
- **PASS** for the specific requirement *Staff Gmail cannot open the existing Admin-owned private PDF*. This is a browser-observed negative-access test, not a broader backend Staff authorization proof.
- **PASS** for unauthenticated public unable to open this PDF (user-reported prior test).
- **PASS** for Admin creation/private ACL/owner access as previously documented.
- The earlier Staff OPENED report is superseded by this isolated-profile retest. A multi-Google-account context mix-up is plausible but not definitively proven.
- Screenshot shows a request-access UI including an **Editor** option. The user was instructed **not to request Editor access or grant/share permissions**. Do not change any Drive ACL based on this test.
- Real `savePdf()` authorization for Staff/Public at the STAGING backend is **still PENDING**. Google Drive access is separate from Apps Script endpoint authorization.
- Do not merge Draft PR #4 or deploy Production; continue with non-mutating role-gate checks and architecture review.
