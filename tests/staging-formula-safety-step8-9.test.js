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
