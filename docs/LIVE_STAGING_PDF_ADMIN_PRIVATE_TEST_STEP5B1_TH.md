# KAIDEE-STOCK STAGING — PDF ACL live test, phase B1 (Admin only)

Context: The user executed \`qaPdfSecurityPrecheckReadOnly()\` successfully:
\`READY_FOR_PDF_ROLE_TESTS\`, role admin, private defaults true, dedicated folder true, staff gate true, \`folderMatches: []\`, \`realAdminStaffPublicTested: false\`.

## Goal

Create exactly one **synthetic, non-sensitive, private QA PDF** using the actual \`savePdf()\` path on the existing standalone STAGING Apps Script project, verify owner-access and initial folder/file privacy, and then stop. This is not a real Staff/Public access test.

**Do not deploy. Do not edit Production. Do not grant Anyone with the link. Do not use a real invoice or customer data.**

Only paste the JavaScript function from the fenced block into \`StagingDiagnostics.gs\`, without Markdown fences. If a function with the same name already exists, never paste a duplicate. This function CREATES one test PDF + private folder; it does not modify the spreadsheet.

\`\`\`javascript
function qaCreatePrivatePdfAdminOnly() {
  requireAdmin_();
  const expectedSheet = '149kQunDS0c5xxXbcOcNQNsjLWPUINnlSebkG5o-1qys';
  const ss = stagingDb_();
  if (ss.getId() !== expectedSheet ||
      stagingPreflight().status !== 'READY_FOR_LIVE_STAGING_TEST')
    throw new Error('STAGING guard failed');

  const folderName = 'KAIDEE-STOCK STAGING PDF';
  if (PDF_SHARE_ANYONE !== false || PDF_FOLDER !== folderName)
    throw new Error('PDF sharing configuration unsafe');

  // Guard against duplicate creation/re-run; precheck reported zero folders.
  const existing = DriveApp.getFoldersByName(folderName);
  if (existing.hasNext())
    throw new Error('STAGING PDF folder already exists; stop to avoid duplicate files');

  const line = 'BT /F1 14 Tf 50 740 Td (KAIDEE STAGING QA ONLY NO CUSTOMER DATA) Tj ET\n';
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Length ' + line.length + ' >>\nstream\n' + line + 'endstream'
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objs.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += (i + 1) + ' 0 obj\n' + o + '\nendobj\n';
  });
  const startXref = pdf.length;
  pdf += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
  offsets.slice(1).forEach(n => {
    pdf += String(n).padStart(10, '0') + ' 00000 n \n';
  });
  pdf += 'trailer\n<< /Size ' + (objs.length + 1) +
         ' /Root 1 0 R >>\nstartxref\n' + startXref + '\n%%EOF\n';

  const base64 = Utilities.base64Encode(
    Utilities.newBlob(pdf, 'application/pdf', 'qa.pdf').getBytes()
  );
  // Actual app PDF entry point; stock docType allows a harmless test ID.
  const saved = savePdf('QA-PDF-ACL-20261028', 'none', base64, 'stock');
  const match = String(saved.download || '').match(/[?&]id=([\w-]+)/);
  if (!match)
    throw new Error('PDF created but unable to inspect its file ID; stop');

  const file = DriveApp.getFileById(match[1]);
  const parents = file.getParents();
  const parent = parents.hasNext() ? parents.next() : null;

  const filePrivate = file.getSharingAccess() === DriveApp.Access.PRIVATE;
  const folderPrivate = !!parent &&
    parent.getName() === folderName &&
    parent.getSharingAccess() === DriveApp.Access.PRIVATE;
  const result = {
    test: 'STAGING_PDF_ADMIN_PRIVATE_FILE',
    status: filePrivate && folderPrivate && saved.shared === false
      ? 'PASS' : 'BLOCKED',
    currentRole: role_(),
    fileName: saved.name,
    pdfFileId: file.getId(),
    filePrivate: filePrivate,
    folderPrivate: folderPrivate,
    anyoneWithLink: saved.shared,
    realStaffPublicTested: false
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}
\`\`\`

## Acceptance and safety
- Expect one harmless test PDF in a new folder named \`KAIDEE-STOCK STAGING PDF\` and result \`PASS\`, \`filePrivate: true\`, \`folderPrivate: true\`, \`anyoneWithLink: false\`.
- A \`PASS\` is **only Admin/creation/privacy-by-link**, not actual staff/public access.
- STOP on error. No blind retries: the file or folder may already have been created.
- Role/Drive checks require real distinct Google sessions and Drive sharing ACL inspection; do not simulate changing role_() or assume a link is accessible without explicit permission.
- Do not share any test file or folder publicly, and do not alter Production.
