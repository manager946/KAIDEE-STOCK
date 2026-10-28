# Live STAGING PDF privacy: Admin PASS, Staff/Public PENDING — 2026-10-28

Real user Apps Script log:
- test STAGING_PDF_ADMIN_PRIVATE_FILE, status PASS, currentRole admin, filePrivate true, folderPrivate true, anyoneWithLink false, realStaffPublicTested false.
- file ID: 1-fArMDp8e5GHUEoxpM4WMSzkfdckMNLX.

Independent Google Drive file and folder metadata:
- PDF: สรุปสต๊อก_QA-PDF-ACL-20261028.pdf
- PDF parent folder ID: 1GRuYfLNf8bQzarqYmstcI-B2tx4dK-wW; name KAIDEE-STOCK STAGING PDF.
- Both shared:false with owner-only permission (user manager@metangprint.org). No anyone/domain permissions in returned ACL.
- This validates PRIVATE default and actual owner-only sharing. Staff and Public cannot be marked PASS without real-account access checks.

Security discovery from source: `ADMINS=[]` used to dynamically treat `Session.getEffectiveUser().getEmail()` as admin. With execute-as-user this risks staff being admin. Fixed STAGING BRANCH `apps-script/Code.gs` to explicitly allow only `manager@metangprint.org`, and fail closed without dynamic fallback. Do not modify Production. Tests added.

Next:
1. Backup then replace **only** `Code.gs` in standalone STAGING Apps Script with the latest branch file; save, no deploy.
2. Admin re-run existing `runStagingPreflight` and verify userRole admin, 7/7 tab checks, PDF defaults.
3. Staff/Public test must use different real Google accounts and actual backend authorization/Drive ACL. A script editor Run by Admin cannot simulate Staff/Public. Execute-as-me web-app mode is unsuitable for identity checks unless actual caller is authenticated and server-side role safely verified; avoid publicly accessible deployment. Do not grant Anyone with link.
4. Test Staff's expected allowlisted capabilities and intended PDF access policy separately: private owner-only PDF currently means Staff cannot open it until they receive explicit file permission. Public must not be able to call savePdf or open the PDF.
5. Record evidence for Admin, Staff, Public and verify Drive ACL again. Production stays blocked. Remaining fault-injection QA also pending.
