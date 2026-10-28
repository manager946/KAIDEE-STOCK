'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const code=fs.readFileSync(path.join(__dirname,'../apps-script/Code.gs'),'utf8');
const sales=fs.readFileSync(path.join(__dirname,'../apps-script/SalesStaging.gs'),'utf8');
test('all legacy SpreadsheetApp calls go through stagingDb_',()=>{
 assert.match(code,/const ss_ = \(\) => stagingDb_\(\)/);
 assert.doesNotMatch(code,/SpreadsheetApp\.getActive\(/);
});
test('test PDFs use isolated staging folder and private permissions',()=>{
 assert.match(code,/const PDF_FOLDER = 'KAIDEE-STOCK STAGING PDF'/);
 assert.match(code,/const PDF_SHARE_ANYONE = false/);
});
test('staging sales require verified spreadsheet title prefix',()=>{
 assert.match(sales,/indexOf\(KDS\.titlePrefix\) !== 0/);
});
test('shipment rejects duplicate SaleLineID',()=>{
 assert.match(sales,/SaleLineID ซ้ำในออร์เดอร์/);
});
test('replayed sale lines verify unit price and totals',()=>{
 assert.match(sales,/Number\(v\[6\]\)!==l\.price/);
 assert.match(sales,/Number\(v\[7\]\)!==Math\.round/);
});
test('replayed inventory movements verify document number',()=>{
 assert.match(sales,/v\.doc!==m\.doc/);
});
test('invalid staging title blocked even if ID is configured',()=>{
 const fake={
   PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'some-valid-staging-id-123456789'})},
   SpreadsheetApp:{openById:()=>({getName:()=> 'สต๊อกสินค้า LED'})}
 };
 vm.createContext(fake);vm.runInContext(sales,fake);
 assert.throws(()=>fake.stagingDb_(),/ไม่ใช่ KAIDEE-STOCK STAGING/);
});
