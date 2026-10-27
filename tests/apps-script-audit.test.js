// Node 18+; tests on a fake spreadsheet, not live Google Sheets.
'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../apps-script/Code.gs'),'utf8');
function setup(email='guest@example.net') {
  const env={
    Session:{getActiveUser:()=>({getEmail:()=>email}),getEffectiveUser:()=>({getEmail:()=> 'owner@metangprint.org'}),getScriptTimeZone:()=> 'Asia/Bangkok'},
    SpreadsheetApp:{getActive:()=>{throw Error('unexpected sheet access')},flush:()=>{}},
    PropertiesService:{getScriptProperties:()=>({getProperty:()=>null})},
    Utilities:{formatDate:()=> '2026-10-27 12:00:00'},
    LockService:{getScriptLock:()=>({waitLock:()=>{},releaseLock:()=>{}})}
  };
  vm.createContext(env);vm.runInContext(src,env);return env;
}
test('outsider cannot call fixFormulas()',()=>assert.throws(()=>setup().fixFormulas(),/ผู้ดูแลระบบ/));
test('outsider cannot call checkSetup()',()=>assert.throws(()=>setup().checkSetup(),/ผู้ดูแลระบบ/));
test('non-finite quantities fail validation',()=>{
 const x=setup();for(const q of [Infinity,-Infinity,NaN,0,-5,'Infinity']){
  assert.throws(()=>x.checkMove_({type:'จ่ายออก',code:'K2',qty:q},[['K2']]),/จำนวน/);
 }
});
test('requisitions reject Infinity before sheet mutation',()=>{
 const x=setup();
 vm.runInContext("readItems_=()=>[['K2','LED','','pcs',10,100,0]];readReqs_=()=>[];",x);
 assert.throws(()=>x.saveReqCore_({date:'2026-10-27',requester:'DEMO',lines:[{code:'K2',qty:Infinity}]}),/จำนวน/);
});
test('quotations reject Infinity before sheet mutation',()=>{
 const x=setup('worker@metangprint.org');
 vm.runInContext("readItems_=()=>[['K2','LED','','pcs',10,100,0]];readQuotes_=()=>[];",x);
 assert.throws(()=>x.saveQuote({date:'2026-10-27',customer:{name:'DEMO'},lines:[{code:'K2',qty:Infinity,price:10}]}),/จำนวน/);
});
test('deleted stock movement keeps audit type and original content',()=>{
 const x=setup('staff@metangprint.org'),types={4:'รับเข้า'},notes={};
 x.SpreadsheetApp.getActive=()=>({getSheetByName:()=>({getRange:r=>({getValue:()=>types[r],setValue:v=>types[r]=v,getNote:()=>notes[r]||'',setNote:v=>notes[r]=v})})});
 x.readItems_=()=>[['K2','LED','','pcs',10,100,0]];
 x.readMv_=()=>types[4]==='รับเข้า'?[{id:'M1',row:4,doc:'',type:'รับเข้า',code:'K2',qty:2}]:[];
 assert.equal(x.deleteMovementCore_('M1').ok,true);
 assert.equal(types[4],'ยกเลิก-รับเข้า');assert.match(notes[4],/ยกเลิก/);
 assert.throws(()=>x.deleteMovementCore_('M1'),/ไม่พบรายการ/);
});
