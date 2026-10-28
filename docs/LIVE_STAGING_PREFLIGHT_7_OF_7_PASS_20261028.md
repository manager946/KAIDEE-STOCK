# STAGING PREFLIGHT — PASS (2026-10-28 12:26:06 Asia/Bangkok)

## User-provided live execution log
- status: READY_FOR_LIVE_STAGING_TEST
- spreadsheetTitle: KAIDEE-STOCK STAGING — ทดสอบเท่านั้น — 2026-10-27
- userRole: admin
- targetPropertyConfigured: true
- pdfPrivateByDefault: true
- pdfStagingFolderIsolated: true
- All seven checks pass: คลังสินค้า; บันทึกรับ-จ่าย; ใบเบิกสินค้า; รายการใบเบิก; ผู้ใช้งาน; ออร์เดอร์และใบขาย; รายการขาย.
- generatedAt: 2026-10-28 12:26:06
- Note: read only; this is NOT evidence of Staff/Public identities, authorization or Drive ACL for those accounts.

## Previously verified
- Real admin dummy PDF creation PASS; PDF ID 1-fArMDp8e5GHUEoxpM4WMSzkfdckMNLX.
- Drive file owner-only permission; parent folder owner-only permission; no anyone/domain grants.
- Source branch pinned explicit Admin address and removed getEffectiveUser fallback in apps-script/Code.gs; **the preflight log alone does not demonstrate runtime role policy from distinct identities**.

## Gate before Staff/Public testing
- Obtain distinct real Staff and external Public accounts. Never share admin credentials, script edit rights, or production data.
- Review the exact STAGING-only deployment execution identity and access setting. Executing webapp as owner can obscure caller identity. Executing as user may require unintended access to STAGING spreadsheets. Avoid deploying an unrestricted test app that surfaces sensitive staging data. A scripted admin-run or simulated role test is insufficient.
- Verify backend authorization separately from Google Drive file ACL (creation ability does not confer file-read ability); any intended Staff sharing must be explicit and approved.
- Do not create another dummy PDF or open Anyone with link. Keep Draft PR #4; do not merge or touch Production.
