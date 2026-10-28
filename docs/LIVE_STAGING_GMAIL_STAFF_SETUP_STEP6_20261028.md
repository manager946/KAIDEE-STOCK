# STAGING: Gmail Staff allowlist phase 6 — instructions 2026-10-28

- STAGING-only Code.gs supports Script Property `KAIDEE_STAGING_STAFF_EMAILS` (a comma-separated list of exact Gmail addresses; start with exactly one).
- Explicit admin allowlist remains `manager@metangprint.org`. No client-provided email is trusted.
- No real staff identity test has been completed. Never mark Staff/Public PASS based on unit tests or admin-run logs.
- Back up standalone STAGING Code.gs, then replace it from branch `test/isolated-staging-integration-2026-10-27` and save. Do not touch Production Apps Script or deploy.
- In STAGING Project Settings / Script Properties add `KAIDEE_STAGING_STAFF_EMAILS` = one real staff Gmail address. Do not commit or paste it into a chat.
- From administrator account run `qaStagingStaffGmailConfigReadOnly` (defined in Code.gs). Expected `READY_FOR_IDENTITY_TEST`, `staffGmailCount:1`, `currentRole:'admin'`, `identityVerifiedWithRealStaff:false`.
- This is a read-only admin diagnostic, not a verified Gmail login.
- Google documentation: Apps Script `Session.getActiveUser().getEmail()` may be blank for execute-as-owner web apps; `/dev` web-app URL can only be opened by script editors. Do not give Staff editor access merely to run `/dev`, as that defeats access controls. Review separate authenticated test deployment architecture and data isolation before Staff browser test; do not deploy unrestricted publicly.
- The existing owner-only PDF will not be readable by Staff unless specifically shared; avoid doing so before real-account policy is validated. Do not create new PDF or turn on Anyone with link. Keep Draft PR #4 open.
