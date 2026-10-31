'use strict';
// Offline service doubles; executes unchanged apps-script/Code.gs. No Google access.
const fs=require('node:fs'),vm=require('node:vm');
function fixture(options={}) {
 const {crashAt=0, after=false}=options;
 const rows=[], header=[], properties={UNRELATED:'preserve'}; let writes=0, armed=true;
 const events=[]; let held=false;
 const lock={waitLock:ms=>{events.push(['wait',ms]);if(options.lockBusy||held)throw Error('LOCK_TIMEOUT');held=true;},
 releaseLock:()=>{events.push(['release']);held=false;}};
 const req={id:'QA',no:'RQ-QA',row:2,status:'อนุมัติ',lines:[{id:'L1',code:'SKU',qty:2},{id:'L2',code:'SKU',qty:3}]};
 const mutate=fn=>{writes++; if(armed&&writes===crashAt&&!after){armed=false;throw Error('CRASH');} fn(); if(armed&&writes===crashAt&&after){armed=false;throw Error('CRASH');}};
 const sheet=(data)=>({getLastRow:()=>data.length,getMaxRows:()=>1000,
 getRange:(r,c,n=1,m=1)=>({getValues:()=>Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>data[r+i-1]?.[c+j-1]??'')),
 getFormula:()=>String(data[r-1]?.[c-1]||'').startsWith('=')?data[r-1][c-1]:'',
 setValue:v=>mutate(()=>{(data[r-1]??=[])[c-1]=v;}),
 setFormula:v=>mutate(()=>{(data[r-1]??=[])[c-1]=v;}),
 setValues:values=>values.forEach((line,i)=>line.forEach((v,j)=>mutate(()=>{(data[r+i-1]??=[])[c+j-1]=v;})))})});
 const ledger=sheet(rows),headers=sheet(header);
 const c={PropertiesService:{getScriptProperties:()=>({getProperty:k=>{if(options.readFailure)throw Error('PROPERTY_READ');return properties[k]??null;},setProperty:(k,v)=>{if(options.quotaFailure)throw Error('PROPERTY_QUOTA');mutate(()=>{properties[k]=v;});if(options.ambiguousProperty){options.ambiguousProperty=false;throw Error('PROPERTY_AMBIGUOUS');}}})},LockService:{getScriptLock:()=>lock},SpreadsheetApp:{flush:()=>{events.push(['flush']);if(options.flushFailure)throw Error('FLUSH_FAILURE');mutate(()=>{});}},Session:{getActiveUser:()=>({getEmail:()=>'qa@example.invalid'})},};
 vm.createContext(c);vm.runInContext(fs.readFileSync('apps-script/Code.gs','utf8'),c);
 c.sh_=name=>name==='บันทึกรับ-จ่าย'?ledger:headers;
 c.stagingDb_=()=>({getSheetByName:c.sh_});c.requireStaff_=()=>{};c.me_=()=> 'qa@example.invalid';c.needFix_=()=>false;
 c.readReqs_=()=>[{...req,status:header[1]?.[6]||req.status}];
 c.readItems_=()=>[['SKU','','','',10,100]];
 return {c,rows,header,properties,req,events,options,held:()=>held,writes:()=>writes,issue:()=>c.setReqStatus('QA','issue'),
 balance:()=>c.balances_(c.readItems_(),c.readMv_()).SKU};
}
module.exports={fixture};
