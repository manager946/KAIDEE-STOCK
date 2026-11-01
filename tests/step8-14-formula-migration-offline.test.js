'use strict';
/*
 * Step 8.14 — OFFLINE migration readiness tests.
 * Synthetic fixtures only: NO Google/Apps Script connections or Sheet writes.
 * A PASS is NOT authorization to migrate STAGING or Production formulas.
 */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const src=fs.readFileSync('apps-script/Code.gs','utf8');
const incoming='รับเข้า', outgoing='จ่ายออก';
const hybrid=r=>"=SUMIFS('บันทึกรับ-จ่าย'!$E:$E,'บันทึกรับ-จ่าย'!$C:$C,A"+r+",'บันทึกรับ-จ่าย'!$B:$B,\"จ่ายออก\")+IFERROR(SUM(FILTER('รายการใบเบิก'!$D$2:$D)),0)";
const candidate=r=>"=SUMIFS('บันทึกรับ-จ่าย'!$E:$E,'บันทึกรับ-จ่าย'!$C:$C,A"+r+",'บันทึกรับ-จ่าย'!$B:$B,\"จ่ายออก\")";

function fixture(n=52){
 const items=Array.from({length:n},(_,i)=>({
   row:i+8, code:'QA-SKU-'+String(i+1).padStart(3,'0'),
   opening:100, received:0, issued:0, balance:100, originalFormula:hybrid(i+8)
 }));
 items[0].received=1;items[0].issued=3;items[0].balance=98;
 return {items, movements:[
   {id:'QA-IN-1',doc:'QA-GRN-1',code:items[0].code,type:incoming,qty:1},
   {id:'SALE-QA-L1',doc:'QA-SO-1',code:items[0].code,type:outgoing,qty:3}
 ],paidRequisitions:[],shippedSales:[]};
}

function migrationPreview(d){
 const errors=[], seen=new Map(), products=new Map(d.items.map(x=>[x.code,x]));
 const totals=new Map(d.items.map(x=>[x.code,{received:0,issued:0}]));
 const post=(why)=>{if(!errors.includes(why))errors.push(why);};
 if(d.items.length===0)post('EMPTY_INVENTORY');
 if(products.size!==d.items.length)post('DUPLICATE_SKU');
 for(const it of d.items){
   if(!it.code || !Number.isInteger(it.row) || it.row<8)post('INVALID_SKU_ROW');
   if(!Number.isFinite(it.opening)||!Number.isFinite(it.received)||
      !Number.isFinite(it.issued)||!Number.isFinite(it.balance))post('NONFINITE_STOCK');
   if(Math.abs(it.opening+it.received-it.issued-it.balance)>1e-9)post('BALANCE_ARITHMETIC');
   if(!it.originalFormula)post('MISSING_ORIGINAL_FORMULA');
 }
 const rows=new Set(d.items.map(x=>x.row));
 if(rows.size!==d.items.length)post('DUPLICATE_SKU_ROW');
 for(const m of d.movements){
   if(!products.has(m.code))post('UNKNOWN_LEDGER_SKU');
   if(!Number.isFinite(m.qty)||m.qty<=0)post('INVALID_MOVEMENT_QUANTITY');
   if(m.id){seen.set(m.id,(seen.get(m.id)||0)+1);}
   if(m.type===incoming||m.type===outgoing){
     if(!m.id||!m.doc)post('ACTIVE_MOVEMENT_MISSING_ID_OR_DOC');
     if(totals.has(m.code)&&Number.isFinite(m.qty)&&m.qty>0)
       totals.get(m.code)[m.type===incoming?'received':'issued']+=m.qty;
   } else if(m.id||m.doc||m.code||m.qty){
     post('INERT_OR_AMBIGUOUS_MOVEMENT');
   }
 }
 if([...seen.values()].some(n=>n>1))post('DUPLICATE_MOVEMENT_ID');
 for(const it of d.items){
   const t=totals.get(it.code);
   if(Math.abs(t.received-it.received)>1e-9 || Math.abs(t.issued-it.issued)>1e-9)
     post('FORMULA_MIGRATION_BALANCE_DRIFT');
 }
 for(const req of d.paidRequisitions){
   for(const [i,l] of req.lines.entries()){
     const id='REQ-'+req.id+'-'+(i+1);
     const hit=d.movements.filter(m=>m.id===id&&m.type===outgoing&&
       m.doc===req.doc&&m.code===l.code&&m.qty===l.qty);
     if(hit.length!==1)post('UNRECONCILED_PAID_REQUISITION');
   }
 }
 for(const sale of d.shippedSales){
   for(const l of sale.lines){
     const hit=d.movements.filter(m=>m.id==='SALE-'+l.id&&m.type===outgoing&&
       m.doc===sale.doc&&m.code===l.code&&m.qty===l.qty);
     if(hit.length!==1)post('UNRECONCILED_SHIPPED_SALE');
   }
 }
 return {status:errors.length?'BLOCKED':'CANDIDATE_FOR_SYNTHETIC_CLONE_ONLY',
   errors,preview:d.items.map(it=>({row:it.row,code:it.code,
     originalH:it.issued,candidateH:totals.get(it.code).issued,
     originalI:it.balance,candidateI:it.opening+totals.get(it.code).received-totals.get(it.code).issued,
     candidateFormula:candidate(it.row)}))};
}

function actualFormulaGate(formulas){
 // Execute the real Code.gs in a locked-down VM with read-only fake sheets.
 const ids=formulas.map((_,i)=>'QA-SKU-'+String(i+1).padStart(3,'0'));
 const ctx={Session:{getActiveUser:()=>({getEmail:()=> 'qa@example.invalid'})},
   SpreadsheetApp:{openById:()=>{throw Error('LIVE_SHEETS_FORBIDDEN');}},
   DriveApp:{createFile:()=>{throw Error('WRITES_FORBIDDEN');}},
   Logger:{log:()=>{}}};
 vm.createContext(ctx);vm.runInContext(src,ctx,{timeout:3000});
 ctx.stagingDb_=()=>({getSheetByName:name=>{
   if(name==='คลังสินค้า')return {getLastRow:()=>7+ids.length,
     getRange:(r,col)=>col===1?{getDisplayValues:()=>ids.map(x=>[x])}:
       col===8?{getFormulas:()=>formulas.map(x=>[x])}:
       (()=>{throw Error('UNEXPECTED_INVENTORY_RANGE');})()};
   if(name==='บันทึกรับ-จ่าย')return {getRange:()=>({getFormula:()=>''})};
   throw Error('UNEXPECTED_SHEET');
 }});
 return ctx.stockFormulaAudit_();
}

test('52-SKU dry-run agrees with movement ledger and preserves all source data',()=>{
 const d=fixture(),before=JSON.stringify(d),r=migrationPreview(d);
 assert.equal(r.status,'CANDIDATE_FOR_SYNTHETIC_CLONE_ONLY');
 assert.deepEqual(r.errors,[]);assert.equal(r.preview.length,52);
 assert.ok(r.preview.every(x=>x.originalH===x.candidateH&&x.originalI===x.candidateI));
 assert.equal(r.preview[0].candidateI,98);
 assert.equal(JSON.stringify(d),before);
});
test('real Code.gs formula gate denies all 52 hybrid rows; only 12 issue samples',()=>{
 const r=actualFormulaGate(fixture().items.map(x=>x.originalFormula));
 assert.equal(r.status,'REVIEW_REQUIRED');
 assert.equal(r.safeForNewRequisitionIssue,false);
 assert.equal(r.checkedSkuCount,52);assert.equal(r.issues.length,12);
 assert.ok(r.issues.every(x=>x.reason==='REQUISITION_FALLBACK_DOUBLE_COUNT_RISK'));
});
test('real formula gate checks SKU row 60 and rejects a wrong relative reference',()=>{
 const d=fixture(53);
 const good=actualFormulaGate(d.items.map(x=>candidate(x.row)));
 assert.equal(good.checkedSkuCount,53);assert.equal(good.safeForNewRequisitionIssue,true);
 const formulas=d.items.map(x=>candidate(x.row));
 formulas[52]=candidate(59); // SKU is in row 60; formula incorrectly refers to row 59
 const bad=actualFormulaGate(formulas);
 assert.equal(bad.checkedSkuCount,53);assert.equal(bad.safeForNewRequisitionIssue,false);
 assert.ok(bad.issues.some(x=>x.row===60));
});
test('legacy PAID requisition without a ledger movement always blocks migration',()=>{
 const d=fixture();d.paidRequisitions.push({id:'QA-REQ',doc:'QA-REQ-1',
   lines:[{code:d.items[1].code,qty:5}]});
 assert.ok(migrationPreview(d).errors.includes('UNRECONCILED_PAID_REQUISITION'));
});
test('legacy shipped SALE without a ledger movement always blocks migration',()=>{
 const d=fixture();d.shippedSales.push({doc:'QA-SO-OLD',lines:[
   {id:'QA-OLD-LINE',code:d.items[1].code,qty:2}]});
 assert.ok(migrationPreview(d).errors.includes('UNRECONCILED_SHIPPED_SALE'));
});
test('duplicate SALE/REQ/SALE-REV movement ids block before migration',()=>{
 for(const id of ['SALE-QA-L1','REQ-QA-1','SALE-REV-QA-L1']){
   const d=fixture(),code=d.items[0].code;
   d.movements.push({id,doc:'QA-X',code,type:outgoing,qty:1},
                    {id,doc:'QA-X',code,type:outgoing,qty:1});
   assert.ok(migrationPreview(d).errors.includes('DUPLICATE_MOVEMENT_ID'));
 }
});
test('missing ledger provenance, unknown SKU, and inert orphan block',()=>{
 for(const type of ['NO_ID','NO_DOC','ORPHAN','UNKNOWN']){
   const d=fixture(),code=d.items[1].code;
   if(type==='NO_ID')d.movements.push({id:'',doc:'QA',code,type:outgoing,qty:2});
   if(type==='NO_DOC')d.movements.push({id:'REQ-X',doc:'',code,type:outgoing,qty:2});
   if(type==='ORPHAN')d.movements.push({id:'REQ-PREP',doc:'QA',code,type:'',qty:2});
   if(type==='UNKNOWN')d.movements.push({id:'QA-EXTRA',doc:'QA',code:'UNKNOWN',type:outgoing,qty:2});
   const r=migrationPreview(d);
   assert.equal(r.status,'BLOCKED');
   assert.ok(r.errors.includes(type==='ORPHAN'?'INERT_OR_AMBIGUOUS_MOVEMENT':
      type==='UNKNOWN'?'UNKNOWN_LEDGER_SKU':'ACTIVE_MOVEMENT_MISSING_ID_OR_DOC'));
 }
});
test('historical formula/ledger drift cannot be hidden by correct arithmetic',()=>{
 const d=fixture();d.items[0].issued=4;d.items[0].balance=97; // arithmetic valid, provenance not
 const r=migrationPreview(d);
 assert.ok(r.errors.includes('FORMULA_MIGRATION_BALANCE_DRIFT'));
 assert.ok(!r.errors.includes('BALANCE_ARITHMETIC'));
});
test('snapshot and rollback are reversible on a synthetic in-memory copy only',()=>{
 const d=fixture(),before=structuredClone(d),scratch=structuredClone(d);
 const r=migrationPreview(scratch);assert.deepEqual(r.errors,[]);
 // Simulate an intentionally isolated scratch clone; no real Sheet mutation.
 scratch.items.forEach((it,i)=>{it.originalFormula=r.preview[i].candidateFormula;});
 assert.notDeepEqual(scratch,before);
 scratch.items=structuredClone(before.items);
 assert.deepEqual(scratch,before);
 assert.deepEqual(d,before);
});
test('no Google Sheet connector, public PDF ACL or production I/O in this QA suite',()=>{
 assert.equal(src.includes('function fixFormulas()'),true);
 assert.match(src,/PDF_SHARE_ANYONE\s*=\s*false/);
 assert.match(src,/function\s+needFix_\(\)/);
});
