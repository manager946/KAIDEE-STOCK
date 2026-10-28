'use strict';
/**
 * Isolated backend integration web app: Public-role regression tests.
 *
 * The deployed Apps Script source is evaluated with a mocked Google identity.
 * No Google account, Google Apps Script deployment, Drive, Sheets, or PDF is used.
 * This is a SYNTHETIC test and must never be reported as real-account Public PASS.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const src = fs.readFileSync('security/backend-integration/Code.gs', 'utf8');

function probe(activeEmail, effectiveEmail = activeEmail, staffProperty = 'staff.qa@gmail.com') {
  const noGoogleResources = () => { throw Error('UNEXPECTED_GOOGLE_RESOURCE_ACCESS'); };
  const ctx = {
    Session: {
      getActiveUser: () => ({ getEmail: () => activeEmail }),
      getEffectiveUser: () => ({ getEmail: () => effectiveEmail })
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: name => name === 'KAIDEE_BACKEND_TEST_STAFF_EMAIL'
          ? staffProperty : null
      })
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: body => ({
        body,
        setMimeType(type) {
          assert.equal(type, 'application/json');
          return this;
        }
      })
    },
    SpreadsheetApp: { openById: noGoogleResources, getActive: noGoogleResources },
    DriveApp: { getFileById: noGoogleResources, createFile: noGoogleResources },
    ScriptApp: { newTrigger: noGoogleResources },
    GmailApp: { sendEmail: noGoogleResources },
    UrlFetchApp: { fetch: noGoogleResources }
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { timeout: 3000 });
  return action => JSON.parse(ctx.doGet({ parameter: { action } }).body);
}

function commonAssertions(result, role, action) {
  assert.equal(result.test, 'KAIDEE_BACKEND_REAL_ACCOUNT_INTEGRATION');
  assert.equal(result.action, action);
  assert.equal(result.role, role);
  assert.equal(result.dataSource, 'SYNTHETIC_MEMORY_ONLY');
  assert.equal(result.writesPerformed, false);
}

test('unknown signed-in Gmail resolves as public, confirmed identity', () => {
  const run = probe('unlisted.qa@gmail.com');
  const r = run('identity');
  commonAssertions(r, 'public', 'identity');
  assert.equal(r.status, 'IDENTITY_CONFIRMED');
  assert.equal(r.activeEmailVisible, true);
  assert.equal(r.effectiveUserMatchesActive, true);
});

test('public can request only the synthetic catalog', () => {
  const r = probe('unlisted.qa@gmail.com')('catalog');
  commonAssertions(r, 'public', 'catalog');
  assert.equal(r.status, 'ALLOWED');
  assert.equal(r.fixture.sku, 'QA-LED-MODULE-DEMO');
});

test('public cannot read staff data, ship, or request staff PDF authorization', () => {
  const run = probe('unlisted.qa@gmail.com');
  for (const action of ['staff_read', 'staff_ship', 'staff_pdf']) {
    const r = run(action);
    commonAssertions(r, 'public', action);
    assert.equal(r.status, 'DENIED', action);
    assert.equal(r.reason, 'STAFF_REQUIRED', action);
    assert.equal(r.activeEmailVisible, true);
    assert.equal(r.effectiveUserMatchesActive, true);
  }
});

test('public cannot run admin-only backend action', () => {
  const r = probe('unlisted.qa@gmail.com')('admin_only');
  commonAssertions(r, 'public', 'admin_only');
  assert.equal(r.status, 'DENIED');
  assert.equal(r.reason, 'ADMIN_REQUIRED');
});

test('blank or mismatched Google identities fail closed for staff operations', () => {
  for (const [active, effective] of [['', ''], ['unlisted.qa@gmail.com', 'manager@metangprint.org']]) {
    const run = probe(active, effective);
    for (const action of ['staff_read', 'staff_ship', 'staff_pdf', 'admin_only']) {
      const r = run(action);
      commonAssertions(r, 'public', action);
      assert.equal(r.status, 'DENIED');
      assert.equal(r.reason, 'IDENTITY_UNVERIFIED');
    }
  }
});

test('URL query role spoofing cannot grant staff/admin authorization', () => {
  const ctx = {
    Session: {
      getActiveUser: () => ({ getEmail: () => 'unlisted.qa@gmail.com' }),
      getEffectiveUser: () => ({ getEmail: () => 'unlisted.qa@gmail.com' })
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'staff.qa@gmail.com' }) },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: body => ({ body, setMimeType() { return this; } })
    }
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { timeout: 3000 });
  for (const action of ['staff_read', 'admin_only']) {
    const r = JSON.parse(ctx.doGet({
      parameter: { action, role: 'admin', email: 'manager@metangprint.org' }
    }).body);
    commonAssertions(r, 'public', action);
    assert.equal(r.status, 'DENIED');
  }
  const r = JSON.parse(ctx.doGet({ parameter: { action: 'delete_all' } }).body);
  commonAssertions(r, 'public', 'delete_all');
  assert.equal(r.status, 'DENIED');
  assert.equal(r.reason, 'UNKNOWN_ACTION');
});

test('Staff and Admin allowlist baseline remains unchanged', () => {
  const staff = probe('staff.qa@gmail.com');
  assert.equal(staff('identity').role, 'staff');
  assert.equal(staff('staff_pdf').status, 'ALLOWED');
  assert.equal(staff('admin_only').status, 'DENIED');
  const admin = probe('manager@metangprint.org');
  assert.equal(admin('identity').role, 'admin');
  assert.equal(admin('admin_only').status, 'ALLOWED');
});
