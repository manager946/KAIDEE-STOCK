'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const code = fs.readFileSync(path.join(__dirname, '../apps-script/SalesStaging.gs'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, '../apps-script/Code.gs'), 'utf8');
function context() {
  const sandbox = {
    PropertiesService:{getScriptProperties:()=>({getProperty:()=>''})},
    SpreadsheetApp:{openById:()=>{throw new Error('database called')}},
    Session:{getScriptTimeZone:()=> 'Asia/Bangkok'},
    requireStaff_:()=>{},
    withLock_:fn=>fn()
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox;
}
test('rejects production spreadsheet without staging configuration',()=>{
  assert.throws(()=>context().stagingDb_(),/staging spreadsheet ID/);
});
test('order mutation id cannot be omitted',()=>{
  assert.throws(()=>context().stagingRequireId_(''),/รหัสคำขอ/);
});
test('rejects invalid and non-finite stock quantities',()=>{
  const c=context();
  [0,-1,Infinity,-Infinity,NaN,'Infinity',''].forEach(x=>
    assert.throws(()=>c.stagingPositive_(x,'QA',false),/จำนวน/));
});
test('rejects unexpected order ID shape',()=>{
  assert.throws(()=>context().stagingRequireId_('evil/path'),/รหัสคำขอ/);
});
test('staging module cannot silently reference a live spreadsheet ID',()=>{
  assert.equal(code.includes('1TczO3aH4TEFcub6CxLg1eDIIQCH54IhzuBBDV2MY8N4'),false);
});
test('sales postings use deterministic IDs and inert prepared rows',()=>{
  assert.match(code,/SALE-REV-/);
  assert.match(code,/SALE-/);
  assert.match(code,/เตรียมจ่าย/);
  assert.match(code,/เตรียมรับคืน/);
});
test('future uploaded PDFs are private by default',()=>{
  assert.match(server,/const PDF_SHARE_ANYONE = false/);
  assert.match(server,/DriveApp\.Access\.PRIVATE/);
});
test('old PDF versions are not automatically trashed on save',()=>{
  const save = server.slice(server.indexOf('function savePdf('),server.indexOf('// ==REQDOC START=='));
  assert.doesNotMatch(save,/setTrashed\(true\)/);
});
