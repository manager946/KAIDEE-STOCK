'use strict';
// Step 8.15 Phase B preflight — in-memory ONLY; do NOT open any Google services.
// Captures incompatibility between the existing STAGING-only code and the
// separately owned Phase A SYNTHETIC workbook. No real Spreadsheet IDs appear.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const source=fs.readFileSync('apps-script/SalesStaging.gs','utf8');
const fakeId='qa-synthetic-12345678901234567890';
function harness(title, property=fakeId) {
  const seen=[];
  const ctx={
    PropertiesService:{getScriptProperties:()=>({
      getProperty:k=>k==='KAIDEE_STAGING_SPREADSHEET_ID'?property:null
    })},
    SpreadsheetApp:{openById:requested=>{
      seen.push(requested);
      return {getName:()=>title};
    }}
  };
  vm.createContext(ctx);
  vm.runInContext(source,ctx,{timeout:3000});
  return {open:()=>ctx.stagingDb_(),seen};
}
test('original guard rejects Phase A synthetic title, no bypass in production source',()=>{
  const h=harness('KAIDEE-STOCK-SYNTHETIC-QA-STEP8-15');
  assert.throws(h.open,/ไม่ใช่ KAIDEE-STOCK STAGING/);
  assert.deepEqual(h.seen,[fakeId]);
});
test('original guard rejects unrelated or production-titled workbook',()=>{
  for(const name of ['KAIDEE-STOCK Production','คลังสินค้า จริง','QA OTHER']){
    const h=harness(name);
    assert.throws(h.open,/ไม่ใช่ KAIDEE-STOCK STAGING/);
  }
});
test('original guard requires STAGING property and a valid-length identifier',()=>{
  for(const value of [null,'','short-id']){
    const h=harness('KAIDEE-STOCK STAGING SYNTHETIC TEST',value);
    assert.throws(h.open,/ยังไม่ได้ตั้งค่า staging spreadsheet ID/);
    assert.equal(h.seen.length,0);
  }
});
test('STAGING prefix alone is not authorization for Phase B or an exact-ID guard',()=>{
  const h=harness('KAIDEE-STOCK STAGING SYNTHETIC TEST');
  assert.equal(h.open().getName(),'KAIDEE-STOCK STAGING SYNTHETIC TEST');
  assert.deepEqual(h.seen,[fakeId]);
  // Risk surfaced intentionally: existing app's prefix check does NOT
  // independently pin an approved synthetic test spreadsheet ID.
  // A separate, exact-ID + exact-title TEST-ONLY adapter is mandatory
  // if Phase B is later authorized. NEVER alter production source to bypass.
});
