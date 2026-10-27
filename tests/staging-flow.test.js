'use strict';
// Executes actual SalesStaging.gs against in-memory Sheets. No Google access.
const {test}=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
function fixture(){
 let fail=false;
 const sheets={};
 function sheet(name){
  const rows=[];
  const sh={rows,getLastRow:()=>rows.length,getMaxRows:()=>100,setFrozenRows:()=>{},
   getRange:(r,c,n=1,m=1)=>({
    getValues:()=>Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>rows[r+i-1]?.[c+j-1]??'')),
    getValue:()=>rows[r-1]?.[c-1]??'',
    setValues:a=>a.forEach((v,i)=>v.forEach((x,j)=>{(rows[r+i-1]??=[])[c+j-1]=x})),
    setValue:v=>{if(fail&&name==='บันทึกรับ-จ่าย'&&c===2&&r===5&&v==='จ่ายออก'){fail=false;throw Error('QA injected failure');}(rows[r-1]??=[])[c-1]=v;}
   })}; sheets[name]=sh;return sh;
 }
 const db={getName:()=> 'KAIDEE-STOCK STAGING mock',getSheetByName:n=>sheets[n],insertSheet:sheet};
 ['คลังสินค้า','บันทึกรับ-จ่าย','ออร์เดอร์และใบขาย','รายการขาย'].forEach(sheet);
 sheets['คลังสินค้า'].getRange(8,1,1,10).setValues([['QA-SKU','','Dummy','pcs',1,100]]);
 const ctx={PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'mock-staging-id-1234567890'})},SpreadsheetApp:{openById:()=>db},requireStaff_:()=>{},withLock_:f=>f(),me_:()=> 'qa@example.invalid',mvFormulas_:()=>['','',''],Utilities:{formatDate:()=> '2026-10-27'},Session:{getScriptTimeZone:()=> 'Asia/Bangkok'}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('apps-script/SalesStaging.gs','utf8'),ctx);
 return {ctx,sheets,inject:()=>{fail=true},balance:()=>ctx.stagingBalance_(ctx.stagingInventory_(db),ctx.stagingAllMovements_(db))['QA-SKU']};
}
for(const crash of [false,true]) test('actual staging lifecycle, duplicate posting/reversal'+(crash?' with partial-post recovery':''),()=>{
 const f=fixture(),x=f.ctx,p={clientMutationId:'QA-FLOW-1234',customer:'Dummy only',lines:[{code:'QA-SKU',qty:2,price:1},{code:'QA-SKU',qty:3,price:1}]};
 const id=x.stagingCreateOrder(p).orderId;
 assert.equal(x.stagingCreateOrder(p).reused,true);
 assert.equal(f.balance(),100);
 x.stagingConvertOrder(id);
 if(crash){f.inject();assert.throws(()=>x.stagingShipOrder(id),/QA injected/);assert.equal(f.balance(),98);assert.equal(f.sheets.KAIDEE_OperationJournal.rows[2][3],'ERROR');x.stagingRecoverOperation('SHIP:'+id);}
 else x.stagingShipOrder(id);
 assert.equal(f.balance(),95);assert.equal(x.stagingShipOrder(id).reused,true);assert.equal(f.balance(),95);
 x.stagingReverseOrder(id,'QA return');assert.equal(f.balance(),100);
 assert.equal(x.stagingReverseOrder(id,'QA return').reused,true);assert.equal(f.balance(),100);
 assert.equal(f.sheets['บันทึกรับ-จ่าย'].rows.filter(r=>r?.[10]).length,4);
});
