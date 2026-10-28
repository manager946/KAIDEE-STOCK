/**
 * KAIDEE-STOCK identity-only probe (ISOLATED PROJECT ONLY).
 * Never paste this doGet() into KAIDEE-STOCK or its STAGING project.
 * No Sheets, Drive, PDFs, production data, or admin functions are accessed.
 */
function doGet() {
  var active = String(Session.getActiveUser().getEmail() || '')
    .trim().toLowerCase();
  var effective = String(Session.getEffectiveUser().getEmail() || '')
    .trim().toLowerCase();

  var allowed = String(
    PropertiesService.getScriptProperties()
      .getProperty('KAIDEE_IDENTITY_PROBE_STAFF_EMAIL') || ''
  ).trim().toLowerCase();

  // Only an exact Gmail identity can pass; do not accept client-sent emails.
  var exactGmail = /^[a-z0-9._%+-]+@gmail\.com$/.test(allowed);
  var matched = exactGmail && active !== '' && active === allowed;
  var sameExecutor = active !== '' && effective === active;

  var result = {
    test: 'KAIDEE_GMAIL_IDENTITY_PROBE',
    activeEmailVisible: active !== '',
    effectiveUserMatchesActive: sameExecutor,
    staffAllowlistMatched: matched,
    status: matched && sameExecutor
      ? 'STAFF_IDENTITY_CONFIRMED'
      : 'DENIED_OR_UNVERIFIED',
    note: 'Identity-only sandbox. No private data read or changed.'
  };

  return ContentService.createTextOutput(
    JSON.stringify(result, null, 2)
  ).setMimeType(ContentService.MimeType.JSON);
}
