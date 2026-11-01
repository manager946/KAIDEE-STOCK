'use strict';
const {test}=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
function fixture(crashAt=0, after=false) {
 const rows=[], header=[], properties={}; let writes=0, armed=true;
 const req={id:'QA',no:'RQ-QA',row:2,status:'อนุมัติ',lines:[{id:'L1',code:'SKU',qty:2},{id:'L2',code:'SKU',qty:3}]};
 const mutate=fn=>{writes++; if(armed&&writes===crashAt&&!after){armed=false;throw Error('CRASH');} fn(); if(armed&&writes===crashAt&&after){armed=false;throw Error('CRASH');}};
 const sheet=(data)=>({getLastRow:()=>data.length,getMaxRows:()=>1000,
 getRange:(r,c,n=1,m=1)=>({getValues:()=>Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>data[r+i-1]?.[c+j-1]??'')),
 getFormula:()=>String(data[r-1]?.[c-1]||'').startsWith('=')?data[r-1][c-1]:'',
 setValue:v=>mutate(()=>{(data[r-1]??=[])[c-1]=v;}),
 setFormula:v=>mutate(()=>{(data[r-1]??=[])[c-1]=v;}),
 setValues:values=>values.forEach((line,i)=>line.forEach((v,j)=>mutate(()=>{(data[r+i-1]??=[])[c+j-1]=v;})))})});
 const ledger=sheet(rows),headers=sheet(header);
 const c={PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties[k]??null,setProperty:(k,v)=>mutate(()=>{properties[k]=v;})})},SpreadsheetApp:{flush:()=>mutate(()=>{})},Session:{getActiveUser:()=>({getEmail:()=>'qa@example.invalid'})},};
 vm.createContext(c);vm.runInContext(fs.readFileSync('apps-script/Code.gs','utf8'),c);
 c.sh_=name=>name==='บันทึกรับ-จ่าย'?ledger:headers;
 c.stagingDb_=()=>({getSheetByName:c.sh_});c.requireStaff_=()=>{};c.withLock_=fn=>fn();c.me_=()=> 'qa@example.invalid';c.needFix_=()=>false;
 c.readReqs_=()=>[{...req,status:header[1]?.[6]||req.status}];
 c.readItems_=()=>[['SKU','','','',10,100]];
 return {c,rows,header,properties,req,writes:()=>writes,issue:()=>c.setReqStatus('QA','issue'),
 balance:()=>c.balances_(c.readItems_(),c.readMv_()).SKU};
}
test('multi-line issue, same SKU aggregation, duplicate click and paid retry',()=>{
 const f=fixture();f.issue();assert.equal(f.balance(),95);
 const before=f.writes();assert.equal(f.issue().reused,true);assert.equal(f.writes(),before);
 assert.equal(f.rows.filter(r=>r?.[1]==='จ่ายออก').length,2);
 assert.deepEqual(f.rows.filter(r=>r?.[10]).map(r=>r[10]),['REQ-QA-1','REQ-QA-2']);
});
const normal=fixture();normal.issue();const count=normal.writes();
for(const after of [false,true]) test('recover crash '+(after?'after':'before')+' every persisted cell/property ('+count+' positions)',()=>{
 for(let pos=1;pos<=count;pos++) {
   const f=fixture(pos,after);assert.throws(()=>f.issue(),/CRASH/,'position '+pos);
   // No active row may lack ID, document, SKU or quantity, even after ambiguous success.
   for(const r of f.rows.filter(r=>r?.[1]==='จ่ายออก')) {
     assert.ok(r[10]&&r[13]&&r[2]&&r[4]>0,'position '+pos);
   }
   f.issue();assert.equal(f.balance(),95,'recovered position '+pos);
   const active=f.rows.filter(r=>r?.[1]==='จ่ายออก');assert.equal(active.length,2);
   assert.equal(new Set(active.map(r=>r[10])).size,2);
   assert.equal(f.header[1][6],'จ่ายแล้ว');
   f.issue();assert.equal(f.balance(),95);
 }
});
test('prepared intent blocks cancellation and changed payload recovery',()=>{
 const f=fixture(2);assert.throws(()=>f.issue(),/CRASH/);
 assert.throws(()=>f.c.setReqStatus('QA','cancel'),/cancellation blocked/);
 f.req.lines[0].qty=9;assert.throws(()=>f.issue(),/payload mismatch/);assert.equal(f.balance(),100);
});
test('duplicate and conflicting identified rows fail closed without repair',()=>{
 for(const kind of ['duplicate','quantity','document','type']) {
   const f=fixture();f.issue();f.req.status='อนุมัติ';f.header[1][6]='อนุมัติ';
   if(kind==='duplicate')f.rows.push([...f.rows[3]]);
   if(kind==='quantity')f.rows[3][4]=9;
   if(kind==='document')f.rows[3][13]='WRONG';
   if(kind==='type')f.rows[3][1]='รับเข้า';
   const before=JSON.stringify(f.rows);assert.throws(()=>f.issue(),/manual review/);assert.equal(JSON.stringify(f.rows),before);
 }
});
test('insufficient balance, legacy posting, formula gate and fixer remain blocked',()=>{
 const f=fixture();f.c.needFix_=()=>true;assert.throws(()=>f.issue(),/สูตรจ่ายออก/);assert.equal(f.writes(),0);
 const g=fixture();g.c.readItems_=()=>[['SKU','','','',10,4]];assert.throws(()=>g.issue(),/สินค้าไม่พอ/);assert.equal(g.rows.length,0);
 const h=fixture();h.rows[3]=[null,'จ่ายออก','SKU',null,2,null,5,null,'qa',null,'OLD',null,null,'RQ-QA'];
 assert.throws(()=>h.issue(),/จ่ายสินค้าไปแล้ว/);
 f.c.requireAdmin_=()=>{};assert.throws(()=>f.c.fixFormulas(),/fixFormulas ถูกปิด/);
});

test('unidentified legacy stock effects block recovery instead of guessing',()=>{
 for(const missing of [10,13]) {
   const f=fixture();f.rows[3]=[null,'จ่ายออก','SKU',null,2,null,5,null,'qa',null,'OLD',null,null,'OTHER'];
   f.rows[3][missing]='';const before=JSON.stringify(f.rows);
   assert.throws(()=>f.issue(),/Unidentified active stock movement/);
   assert.equal(JSON.stringify(f.rows),before);
 }
});
test('all lines remain inert before commit and recovery rechecks available stock',()=>{
 const f=fixture();
 // Crash immediately before the first active type write.
 let armed=true;const original=f.c.reqIssueRows_;
 f.c.reqIssueRows_=()=>{const result=original();
   if(armed && result.filter(m=>m.v[10]).length===2){armed=false;throw Error('PRECOMMIT');}
   return result;
 };
 assert.throws(()=>f.issue(),/PRECOMMIT/);assert.equal(f.balance(),100);
 assert.equal(f.rows.filter(r=>r?.[10]).length,2);
 f.c.readItems_=()=>[['SKU','','','',10,4]];
 assert.throws(()=>f.issue(),/สินค้าไม่พอ/);assert.equal(f.rows.filter(r=>r?.[1]==='จ่ายออก').length,0);
 f.c.readItems_=()=>[['SKU','','','',10,100]];f.issue();assert.equal(f.balance(),95);
});

test('multiple SKUs commit once and immutable plan blocks reordered lines',()=>{
 const f=fixture();f.req.lines[1].code='SKU-B';
 f.c.readItems_=()=>[['SKU','','','',10,100],['SKU-B','','','',20,20]];
 f.issue();const balances=f.c.balances_(f.c.readItems_(),f.c.readMv_());
 assert.equal(balances.SKU,98);assert.equal(balances['SKU-B'],17);
 f.req.lines.reverse();assert.throws(()=>f.issue(),/payload mismatch/);
});
test('partial commit recovery only deducts remaining quantity and rejects stock shortage',()=>{
 const probe=fixture();let committed=false;
 // Inject after one committed B write via wrapper on in-memory range setter.
 const db=probe.c.stagingDb_(),sheet=db.getSheetByName('บันทึกรับ-จ่าย'),range=sheet.getRange;
 sheet.getRange=(r,c,...args)=>{const cell=range(r,c,...args),set=cell.setValue;
   cell.setValue=v=>{set(v);if(!committed&&c===2&&v==='จ่ายออก'){committed=true;throw Error('PARTIAL');}};return cell;};
 probe.c.stagingDb_=()=>({getSheetByName:n=>n==='บันทึกรับ-จ่าย'?sheet:db.getSheetByName(n)});
 assert.throws(()=>probe.issue(),/PARTIAL/);assert.equal(probe.balance(),98);
 probe.c.readItems_=()=>[['SKU','','','',10,4]];
 assert.throws(()=>probe.issue(),/สินค้าไม่พอ/);assert.equal(probe.rows.filter(r=>r?.[1]==='จ่ายออก').length,1);
 probe.c.readItems_=()=>[['SKU','','','',10,100]];
 probe.issue();assert.equal(probe.balance(),95);assert.equal(probe.rows.filter(r=>r?.[1]==='จ่ายออก').length,2);
});
