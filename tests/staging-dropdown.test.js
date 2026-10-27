'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const code=fs.readFileSync('apps-script/SalesStaging.gs','utf8');
test('sales create conforms to strict Google Sheets dropdown values',()=>{
 assert.match(code,/'ใบออร์เดอร์'/);
 assert.match(code,/'รอจัดส่ง'/);
 assert.doesNotMatch(code,/'ยืนยันแล้ว'/);
 assert.doesNotMatch(code,/'ยังไม่ส่ง'/);
});
test('partial order persistence completes same order ID and row',()=>{
 assert.match(code,/if \(!h\) \{/);
 assert.match(code,/sh\.getRange\(h\.row,1,1,KDS\.orderCols\)\.setValues/);
 assert.match(code,/ข้อมูลออร์เดอร์เดิมไม่ตรงกับคำขอ/);
});
test('reversal avoids invalid คืนสินค้า document delivery status',()=>{
 assert.doesNotMatch(code,/getRange\(h\.row,11\)\.setValue\('คืนสินค้า'\)/);
 assert.match(code,/getRange\(h\.row,11\)\.setNote/);
});

test('pending movement type is blank to satisfy strict native dropdown',()=>{
 assert.match(code,/sh\.getRange\(row,11\)\.setValue\(m\.id\)/);
 assert.doesNotMatch(code,/sh\.getRange\(row,1,1,16\)\.setValues/);
 assert.match(code,/!\['',kind==='SALE'/);
});
