'use strict';
// Tests evaluate the actual Apps Script source in a VM. No Google connections,
// Google Sheets, Drive files, or real PDFs are ever touched.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

const src = [
  fs.readFileSync('apps-script/Code.gs', 'utf8'),
  fs.readFileSync('apps-script/SalesStaging.gs', 'utf8')
].join('\n\n');
const staffEmail = 'staff.qa@gmail.com';
const adminEmail = 'manager@metangprint.org';

function runtime(email, allowedGmail = staffEmail) {
  const forbidden = () => {
    throw Error('UNEXPECTED_GOOGLE_RESOURCE_ACCESS');
  };
  const obj = {
    Session: {
      getActiveUser: () => ({ getEmail: () => email }),
      getEffectiveUser: () => ({ getEmail: () => adminEmail })
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: name => name === 'KAIDEE_STAGING_STAFF_EMAILS'
          ? allowedGmail : null
      })
    },
    SpreadsheetApp: {
      getActive: forbidden,
      openById: forbidden,
      flush: forbidden
    },
    DriveApp: {
      getFoldersByName: forbidden,
      getFileById: forbidden
    },
    LockService: {
      getScriptLock: forbidden
    },
    Utilities: {
      base64Decode: () => [],
      formatDate: forbidden
    }
  };
  vm.createContext(obj);
  vm.runInContext(src, obj, { timeout: 3000 });
  return obj;
}

const publicDenied = [
  ['savePdf', x => x.savePdf('QA-PUBLIC', 'none', '', 'stock')],
  ['addMovement', x => x.addMovement({})],
  ['updateMovement', x => x.updateMovement('SYNTHETIC', {})],
  ['deleteMovement', x => x.deleteMovement('SYNTHETIC')],
  ['setOpening', x => x.setOpening('SYNTHETIC', 10)],
  ['setCompany', x => x.setCompany({})],
  ['setupSpecs', x => x.setupSpecs()],
  ['saveSpecs', x => x.saveSpecs([], [])],
  ['saveReq', x => x.saveReq({})],
  ['setReqStatus', x => x.setReqStatus('SYNTHETIC', 'confirm')],
  ['deleteReqs', x => x.deleteReqs(['SYNTHETIC'])],
  ['saveQuote', x => x.saveQuote({})],
  ['confirmQuote', x => x.confirmQuote('SYNTHETIC')],
  ['deleteQuote', x => x.deleteQuote('SYNTHETIC')],
  ['stagingCreateOrder', x => x.stagingCreateOrder({})],
  ['stagingListOrders', x => x.stagingListOrders()],
  ['stagingConvertOrder', x => x.stagingConvertOrder('SYNTHETIC')],
  ['stagingShipOrder', x => x.stagingShipOrder('SYNTHETIC')],
  ['stagingReverseOrder', x => x.stagingReverseOrder('SYNTHETIC', 'TEST ONLY')],
  ['stagingRecoverOperation', x => x.stagingRecoverOperation('SYNTHETIC')]
];

test('unknown Gmail is public; cannot call 20 staff-only backend functions', () => {
  const ctx = runtime('unknown.qa@gmail.com');
  assert.equal(ctx.role_(), 'public');
  for (const [name, call] of publicDenied) {
    assert.throws(
      () => call(ctx),
      /ส่วนนี้สำหรับพนักงานหลังบ้านเท่านั้น/,
      'Public must be denied by backend for ' + name
    );
  }
});
test('blank caller identity is public; staff-only PDF and shipment denied', () => {
  const ctx = runtime('');
  assert.equal(ctx.role_(), 'public');
  assert.throws(() => ctx.savePdf('QA', 'none', '', 'stock'), /พนักงานหลังบ้าน/);
  assert.throws(() => ctx.stagingShipOrder('QA'), /พนักงานหลังบ้าน/);
});
test('staff Gmail is staff, cannot call admin functions', () => {
  const ctx = runtime(staffEmail);
  assert.equal(ctx.role_(), 'staff');
  assert.equal(ctx.isAdmin_(), false);
  for (const [name, call] of [
    ['fixFormulas', x => x.fixFormulas()],
    ['checkSetup', x => x.checkSetup()],
    ['qaStagingStaffGmailConfigReadOnly', x => x.qaStagingStaffGmailConfigReadOnly()]
  ]) {
    assert.throws(() => call(ctx), /เฉพาะผู้ดูแลระบบเท่านั้น/, name);
  }
});
test('staff Gmail reaches PDF input validation without Drive access', () => {
  const ctx = runtime(staffEmail);
  assert.doesNotThrow(() => ctx.requireStaff_());
  assert.throws(
    () => ctx.savePdf('QA-PDF-INVALID', 'none', '', 'stock'),
    /ไฟล์ PDF ไม่ถูกต้อง/,
    'Expected PDF validation (not permission denied) and no Drive calls'
  );
});
test('staff Gmail can pass shipment role gate but cannot reach Google services in test', () => {
  const ctx = runtime(staffEmail);
  assert.throws(
    () => ctx.stagingShipOrder('NO-REAL-ORDER'),
    /UNEXPECTED_GOOGLE_RESOURCE_ACCESS/
  );
});
test('explicit Admin identity is permitted for both role gates', () => {
  const ctx = runtime(adminEmail);
  assert.equal(ctx.role_(), 'admin');
  assert.doesNotThrow(() => ctx.requireAdmin_());
  assert.doesNotThrow(() => ctx.requireStaff_());
});
test('Gmail wildcard and unallowlisted addresses never obtain Staff role', () => {
  assert.equal(runtime('other@gmail.com', '@gmail.com').role_(), 'public');
  assert.equal(runtime('other@gmail.com', staffEmail).role_(), 'public');
});
test('public getData delegates to public-only projection', () => {
  const ctx = runtime('unknown.qa@gmail.com');
  vm.runInContext("publicData_ = function () { return { role:'public', items:[] }; }",ctx);
  const result = ctx.getData();
  assert.equal(result.role,'public');
  assert.equal(result.items.length,0);
});
