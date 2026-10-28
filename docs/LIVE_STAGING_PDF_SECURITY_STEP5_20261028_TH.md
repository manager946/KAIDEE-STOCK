# KAIDEE-STOCK STAGING — Step 5: PDF permissions / read-only precheck
Date: 2026-10-28

## Grounded baseline
- Live order-create/retry PASS; conversion PASS; recovery+single shipment PASS; reversal+retry PASS, independently checked from STAGING Google Sheets.
- STAGING target spreadsheet ID: `149kQunDS0c5xxXbcOcNQNsjLWPUINnlSebkG5o-1qys`.
- Existing standalone staging script ID: `1FkShpFVzV_xDURPN-7HLPk6ASdmLJo3trjXB5Xd6LAILHfxYU6BOeyWa`.
- `Code.gs` has `PDF_SHARE_ANYONE=false`, `PDF_FOLDER='KAIDEE-STOCK STAGING PDF'`, `savePdf()` calls `requireStaff_()` and `setSharing(PRIVATE, VIEW)`.
- **These are static checks, not proof of real-world Admin/Staff/Public access control.** Explicit Drive file grants and parent-folder inheritance must be checked separately.

## Step 5A: read-only precheck

Paste **only the JavaScript function body** below at the end of `StagingDiagnostics.gs` in the **existing STAGING** project. If a function with this name already exists, do not paste a duplicate. Save, choose `qaPdfSecurityPrecheckReadOnly`, and run once. It does **not** create files, change sharing or edit Sheets.

```javascript
function qaPdfSecurityPrecheckReadOnly() {
  requireAdmin_();

  const expectedSheetId =
    '149kQunDS0c5xxXbcOcNQNsjLWPUINnlSebkG5o-1qys';
  const ss = stagingDb_();
  if (ss.getId() !== expectedSheetId) {
    throw new Error('ไม่ได้เชื่อมต่อฐานข้อมูล STAGING ที่กำหนด');
  }

  const preflight = stagingPreflight();
  if (preflight.status !== 'READY_FOR_LIVE_STAGING_TEST') {
    throw new Error('STAGING preflight ไม่ผ่าน');
  }

  const folderName = 'KAIDEE-STOCK STAGING PDF';
  const privateBySetting = PDF_SHARE_ANYONE === false;
  const dedicatedFolderName = PDF_FOLDER === folderName;

  // Source checks are diagnostic indicators only. They cannot prove
  // actual user identity and cannot replace real access tests.
  const pdfSource = String(savePdf);
  const hasStaffGate = pdfSource.includes('requireStaff_()');
  const setsFilePrivate =
    pdfSource.includes('DriveApp.Access.PRIVATE');

  const iterator = DriveApp.getFoldersByName(folderName);
  const matches = [];
  while (iterator.hasNext() && matches.length < 3) {
    const folder = iterator.next();
    const access = folder.getSharingAccess();
    matches.push({
      folderId: folder.getId(),
      privateLinkAccess: access === DriveApp.Access.PRIVATE
    });
  }

  const folderSafe = matches.length <= 1 &&
    matches.every(x => x.privateLinkAccess);
  const ready = privateBySetting && dedicatedFolderName &&
    hasStaffGate && setsFilePrivate && folderSafe;

  const result = {
    test: 'STAGING_PDF_SECURITY_PRECHECK_READ_ONLY',
    status: ready ? 'READY_FOR_PDF_ROLE_TESTS' : 'BLOCKED',
    currentAccountRole: role_(),
    pdfPrivateBySetting: privateBySetting,
    pdfFolderNameIsolated: dedicatedFolderName,
    savePdfHasStaffGate: hasStaffGate,
    savePdfSetsPrivate: setsFilePrivate,
    folderMatches: matches,
    realAdminStaffPublicTested: false,
    note: 'READ ONLY; no file created, no sharing changed.'
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}
```

### Expected
- `status: READY_FOR_PDF_ROLE_TESTS`
- `currentAccountRole: admin`
- `pdfPrivateBySetting: true`
- `pdfFolderNameIsolated: true`
- `savePdfHasStaffGate: true`
- `savePdfSetsPrivate: true`
- `realAdminStaffPublicTested: false`

If `folderMatches` lists more than one folder or any folder has `privateLinkAccess: false`, **BLOCK** and review. Zero matches means a test folder is not yet present (do not create it during precheck); a safe admin-only dummy PDF test can create one in a separate step with explicit safeguards.

## Step 5B (separate later step; do not start yet)
1. Create a **non-sensitive dummy PDF** in a uniquely identified, private STAGING-only folder as authorized Admin, then inspect Drive file metadata/permissions for `anyone`, `domain`, inherited or direct grants. Do not confuse `setSharing(PRIVATE)` with guaranteed removal of all direct/inherited grants.
2. Verify Staff with a *different real account* can call the intended backend endpoint and only open the PDF if explicitly authorized.
3. Verify Public with another *real identity/session* is denied backend PDF generation and Drive file access. Do not treat mocked roles or switching the client UI as a real identity test.
4. Record PASS/FAIL and explicit evidence in Draft PR #4. Do not grant anyone-with-link access. No Production deployment.
5. After real role tests, proceed to independently isolated fault injection + crash recovery tests, then production review.

**Security caveat:** Apps Script deployed as "execute as me" may report the owner's identity to server code, so distinct actual sessions/permissions and deployment configuration must be checked before interpreting role-test results. Never expose production via any staging tests.
