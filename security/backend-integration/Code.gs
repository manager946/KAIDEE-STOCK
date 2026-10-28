/**
 * KAIDEE-STOCK RBAC — isolated live backend integration probe.
 * STANDALONE PROJECT ONLY: do NOT paste into KAIDEE-STOCK STAGING/Production.
 * All business data below is synthetic; this project never touches Sheets/Drive.
 * Deployment: Execute as "User accessing the web app"; access: signed-in Google users.
 */
const KAIDEE_PROBE_STAFF_PROPERTY = 'KAIDEE_BACKEND_TEST_STAFF_EMAIL';
const ADMINS = ['manager@metangprint.org'];
const STAFF = [];
const STAFF_DOMAIN = 'metangprint.org';
const QA_FIXTURE = Object.freeze({
  sku: 'QA-LED-MODULE-DEMO', product: 'LED MODULE — DEMO ONLY',
  opening: 10, saleQty: 1
});

// The six role functions match the STAGING server-side role design.
const me_ = () => Session.getActiveUser().getEmail() || 'web';
function admins_() {
  return ADMINS.map(x => String(x).trim().toLowerCase()).filter(Boolean);
}
function isAdmin_() { return admins_().indexOf(String(me_()).toLowerCase()) !== -1; }
function stagingStaffGmailEmails_() {
  const prop = PropertiesService.getScriptProperties()
    .getProperty(KAIDEE_PROBE_STAFF_PROPERTY);
  return String(prop || '').split(',')
    .map(x => x.trim().toLowerCase())
    .filter(x => /^[a-z0-9._%+-]+@gmail\.com$/.test(x));
}
function role_() {
  if (isAdmin_()) return 'admin';
  const m = String(me_()).trim().toLowerCase();
  if (!m || m === 'web') return 'public';
  if (STAFF.map(x => String(x).trim().toLowerCase()).indexOf(m) !== -1) return 'staff';
  if (stagingStaffGmailEmails_().indexOf(m) !== -1) return 'staff';
  if (STAFF_DOMAIN && m.slice(-(STAFF_DOMAIN.length + 1)) === '@' + STAFF_DOMAIN.toLowerCase()) return 'staff';
  return 'public';
}
function requireStaff_() {
  if (role_() === 'public') throw new Error('ส่วนนี้สำหรับพนักงานหลังบ้านเท่านั้น');
}
function requireAdmin_() {
  if (!isAdmin_()) throw new Error('เฉพาะผู้ดูแลระบบเท่านั้น');
}

function qaIdentity_() {
  const active = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  const effective = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();
  return {
    activeVisible: active !== '',
    effectiveMatchesActive: active !== '' && active === effective
  };
}
function qaReply_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj, null, 2))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Five controlled read-only routes; no arbitrary function dispatch.
 * /exec?action=identity | catalog | staff_read | staff_ship | staff_pdf | admin_only
 * NOT a replica of the full sales/inventory transaction implementation.
 */
function doGet(e) {
  const action = String(e && e.parameter && e.parameter.action || 'identity');
  const known = ['identity', 'catalog', 'staff_read', 'staff_ship', 'staff_pdf', 'admin_only'];
  const id = qaIdentity_();
  const trustedSession = id.activeVisible && id.effectiveMatchesActive;
  // Never accept claimed identity/role from URL parameters; identity is Google-owned.
  const role = trustedSession ? role_() : 'public';
  const response = {
    test: 'KAIDEE_BACKEND_REAL_ACCOUNT_INTEGRATION',
    action: action,
    role: role,
    activeEmailVisible: id.activeVisible,
    effectiveUserMatchesActive: id.effectiveMatchesActive,
    status: 'DENIED',
    dataSource: 'SYNTHETIC_MEMORY_ONLY',
    writesPerformed: false
  };
  if (known.indexOf(action) < 0) {
    response.reason = 'UNKNOWN_ACTION';
    return qaReply_(response);
  }
  if (action === 'identity') {
    response.status = trustedSession ? 'IDENTITY_CONFIRMED' : 'IDENTITY_UNVERIFIED';
    return qaReply_(response);
  }
  if (action === 'catalog') {
    response.status = 'ALLOWED';
    response.fixture = {sku: QA_FIXTURE.sku, product: QA_FIXTURE.product, available: true};
    return qaReply_(response);
  }
  if (!trustedSession) {
    response.reason = 'IDENTITY_UNVERIFIED';
    return qaReply_(response);
  }
  try {
    if (action === 'admin_only') {
      requireAdmin_();
      response.status = 'ALLOWED';
      response.simulation = 'ADMIN_BACKEND_GATE_ONLY';
    } else {
      requireStaff_();
      response.status = 'ALLOWED';
      if (action === 'staff_read') {
        response.fixture = {sku: QA_FIXTURE.sku, opening: QA_FIXTURE.opening};
      } else if (action === 'staff_ship') {
        response.simulation = 'SHIP_AUTHORIZATION_ONLY';
        response.fixture = {sku: QA_FIXTURE.sku, qty: QA_FIXTURE.saleQty};
      } else if (action === 'staff_pdf') {
        response.simulation = 'PDF_AUTHORIZATION_ONLY';
        response.fixture = {document: 'QA-SYNTHETIC-NO-FILE'};
      }
    }
  } catch (err) {
    response.status = 'DENIED';
    response.reason = action === 'admin_only' ? 'ADMIN_REQUIRED' : 'STAFF_REQUIRED';
  }
  return qaReply_(response);
}
