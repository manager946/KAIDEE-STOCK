'use strict';
/* Step 8.9: test current Apps Script source with read-only mocked spreadsheets. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const src=fs.readFileSync('apps-script/Code.gs','utf8');
const html=fs.readFileSync('apps-script/Index.html','utf8');
const canonical=r=>`=SUMIFS('บันทึกรับ-จ่าย'!$E:$E,'บันทึกรับ-จ่าย'!$C:$C,A${r},'บันทึกรับ-จ่าย'!$B:$B,"จ่ายออก")`;
function context(formulas,ids=['K2-3000K'],movement='') {
 let reads=0;
 const cell=(v,key)=>({getFormula:()=>{reads++;return v;},getDisplayValues:()=>{reads++;return key;}});
 const obj={
  Session:{getActiveUser:()=>({getEmail:()=> 'manager@metangprint.org'})},
  PropertiesService:{getScriptProperties:()=>({getProperty:()=>null})},
  SpreadsheetApp:{openById:()=>{throw Error('WRITES_OR_EXTERNAL_SHEETS_FORBIDDEN');},flush:()=>{throw Error('WRITES_FORBIDDEN');}},
  DriveApp:{createFile:()=>{throw Error('WRITES_FORBIDDEN');}},
  Logger:{log:()=>{}}
 };
 vm.createContext(obj);vm.runInContext(src,obj,{timeout:3000});
 obj.sh_=name => ({
   getLastRow:()=>ids.length+7,
   getRange:(row,col,n,m)=>{
    if(name===obj.SH?.inv || name==='คลังสินค้า'){
      if(col===1) return cell('',ids.map(v=>[v]));
      if(col===8) return {getFormulas:()=>formulas.map(v=>[v])};
    }
    if(name==='บันทึกรับ-จ่าย'&&col===4) return cell(movement);
    throw Error('UNEXPECTED_RANGE '+name+' '+row+','+col);
   }
 });
 // Code.gs has a lexical sh_ helper that delegates to stagingDb_().
 // Stub that dependency to route reads into the deterministic mocked sheets.
 obj.stagingDb_ = () => ({ getSheetByName: name => obj.sh_(name) });
 return obj;
}
test('known movement-only formulas for every SKU permit gate',()=>{
 const c=context([canonical(8),canonical(9)],['A','B']);
 assert.equal(c.stockFormulaAudit_().safeForNewRequisitionIssue,true);
 assert.equal(c.needFix_(),false);
});
test('actual staging hybrid formula with paid requisition fallback is blocked',()=>{
 const c=context([canonical(8)+"+IFERROR(SUM(FILTER('รายการใบเบิก'!$D$2:$D)),0)"]);
 const r=c.stockFormulaAudit_();
 assert.equal(r.safeForNewRequisitionIssue,false);
 assert.equal(r.issues[0].reason,'REQUISITION_FALLBACK_DOUBLE_COUNT_RISK');
 assert.equal(c.needFix_(),true);
});
test('legacy, missing and unknown formulas are fail-closed',()=>{
 for(const f of ['', '=SUM(A1:A3)', canonical(8)+"+123", canonical(8).replace('A8','A9')]){
   assert.equal(context([f]).needFix_(),true);
 }
 assert.equal(context([canonical(8)],['A'],"=SUM('บันทึกรับ-จ่าย'!$D$4:$D$59)").needFix_(),true);
});
test('blank inventories and partial invalid SKU formulas are blocked',()=>{
 assert.equal(context([],[]).needFix_(),true);
 assert.equal(context([canonical(8),'bad'],['A','B']).needFix_(),true);
});
test('destructive fixer throws before requesting any Google Sheets write',()=>{
 const c=context([canonical(8)]);
 assert.throws(()=>c.fixFormulas(),/fixFormulas ถูกปิด/);
});
test('UI no longer encourages users to run destructive repair',()=>{
 assert.ok(html.includes('ห้ามเรียก fixFormulas'));
 assert.ok(!html.includes('แล้วรัน <b>fixFormulas</b>'));
});
test('real issue path still checks formula gate and remains blocked on risky formula',()=>{
 assert.match(src,/if \(needFix_\(\)\) throw new Error\('STAGING: สูตรจ่ายออกยังไม่ผ่าน/);
});

test('quoted whitespace changes stock semantics and must not pass normalization',()=>{
 for(const f of [canonical(8).replace('จ่ายออก','จ่าย ออก'),
   canonical(8).replaceAll('บันทึกรับ-จ่าย','บันทึก รับ-จ่าย')])
   assert.equal(context([f]).stockFormulaAudit_().safeForNewRequisitionIssue,false);
 assert.equal(context([canonical(8).replace('SUMIFS(', 'sumifs( ')]).needFix_(),false);
});

function issueContext(formula, movements=[]) {
 const c=context([formula]);
 c.requireStaff_=()=>{};c.withLock_=fn=>fn();c.me_=()=> 'qa@example.invalid';
 c.readReqs_=()=>[{id:'QA',no:'RQ-QA',row:2,status:'อนุมัติ',lines:[{code:'SKU',qty:2}]}];
 c.readItems_=()=>[['SKU','','','',1,10]];
 c.readMv_=()=>movements;
 c.writeIssue_=()=>{throw Error('UNEXPECTED_POST');};
 return c;
}
test('real requisition issue blocks unknown and hybrid formulas before any posting',()=>{
 for(const f of ['', '=CUSTOM_STOCK(A8)', canonical(8)+"+SUM('รายการใบเบิก'!D2:D)"])
   assert.throws(()=>issueContext(f).setReqStatus('QA','issue'),/สูตรจ่ายออกยังไม่ผ่าน/);
});
test('REQ MovementID blocks duplicate posting even with missing or changed DocumentNo',()=>{
 for(const doc of ['', 'EDITED', 'RQ-QA']) {
   const c=issueContext(canonical(8),[{id:'REQ-QA-1',doc,code:'SKU',qty:2,type:'จ่ายออก'}]);
   assert.throws(()=>c.setReqStatus('QA','issue'),/จ่ายสินค้าไปแล้ว/);
 }
});
test('legacy DocumentNo still blocks duplicate requisition posting',()=>{
 assert.throws(()=>issueContext(canonical(8),[{id:'ROW-4',doc:'RQ-QA'}])
   .setReqStatus('QA','issue'),/จ่ายสินค้าไปแล้ว/);
});
test('hybrid requisition counterexample doubles issued quantity; SALE reversal nets to zero in real balances_',()=>{
 const c=context([canonical(8)]),items=[['SKU','','','',1,10]];
 const req={id:'REQ-QA-1',code:'SKU',qty:2,type:'จ่ายออก'};
 assert.equal(c.balances_(items,[req]).SKU,8);
 // Arithmetic counterexample only, not a Google Sheets formula evaluator:
 // ledger issue 2 + paid-requisition fallback 2 => H=4, I=6 rather than 8.
 const hybridIssued=req.qty+2;
 assert.equal(10-hybridIssued,6);
 assert.notEqual(10-hybridIssued,c.balances_(items,[req]).SKU);
 const sale={id:'SALE-QA-L1',code:'SKU',qty:3,type:'จ่ายออก'};
 const reversal={id:'SALE-REV-QA-L1',code:'SKU',qty:3,type:'รับเข้า'};
 assert.equal(c.balances_(items,[sale]).SKU,7);
 assert.equal(c.balances_(items,[sale,reversal]).SKU,10);
 // SUMIFS/balances_ do not deduplicate ledger IDs. Formula shape cannot certify history.
 assert.equal(c.balances_(items,[sale,sale]).SKU,4);
 assert.equal(c.balances_(items,[sale,reversal,reversal]).SKU,13);
});
