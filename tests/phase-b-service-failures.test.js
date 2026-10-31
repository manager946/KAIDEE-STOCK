'use strict';
// These tests validate application decisions under simulated service failures.
// They do not certify Google's concurrency, quotas or transaction durability.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fixture}=require('./helpers/recovery-fixture');
const snapshot=f=>JSON.stringify({rows:f.rows,header:f.header,properties:f.properties});

test('LockService timeout prevents all writes and does not release an unowned lock',()=>{
  const f=fixture({lockBusy:true}),before=snapshot(f);
  assert.throws(f.issue,/LOCK_TIMEOUT/);
  assert.equal(snapshot(f),before);
  assert.deepEqual(f.events,[['wait',20000]]);
});

test('real withLock wrapper rejects overlapping entry then permits paid retry',()=>{
  const f=fixture(); let nested=false;
  const read=f.c.readReqs_;
  f.c.readReqs_=()=>{
    if(!nested){nested=true;assert.throws(f.issue,/LOCK_TIMEOUT/);}
    return read();
  };
  f.issue(); assert.equal(f.balance(),95); assert.equal(f.held(),false);
  const before=snapshot(f);assert.equal(f.issue().reused,true);
  assert.equal(snapshot(f),before);
  assert.equal(f.events.filter(e=>e[0]==='release').length,2);
});

for(const option of ['readFailure','quotaFailure']) test('Script Properties '+option+' fails before ledger/header mutations',()=>{
  const f=fixture({[option]:true}),before=snapshot(f);
  assert.throws(f.issue,/PROPERTY_/);assert.equal(snapshot(f),before);
  assert.equal(f.held(),false);
  f.options[option]=false;f.issue();assert.equal(f.balance(),95);
  assert.equal(f.properties.UNRELATED,'preserve');
});

test('ambiguous property write retains durable intent and resumes with original identity',()=>{
  const f=fixture({ambiguousProperty:true});
  assert.throws(f.issue,/PROPERTY_AMBIGUOUS/);
  assert.equal(f.rows.length,0);assert.equal(f.header.length,0);
  const intent=f.properties.REQ_ISSUE_V1_QA;assert.ok(intent);
  f.c.me_=()=> 'second-user@example.invalid';f.issue();
  assert.equal(f.properties.REQ_ISSUE_V1_QA,intent);
  assert.equal(f.header[1][8],JSON.parse(intent).who);
  assert.equal(f.balance(),95);assert.equal(f.held(),false);
});

test('oversize plan is blocked without attempting a property or ledger write',()=>{
  const f=fixture();f.req.lines[0].id='x'.repeat(2100);
  const before=snapshot(f);assert.throws(f.issue,/safe property size/);
  assert.equal(snapshot(f),before);assert.equal(f.held(),false);
});

test('malformed saved intent is preserved and cancellation stays blocked',()=>{
  const f=fixture();f.properties.REQ_ISSUE_V1_QA='{broken';
  const before=snapshot(f);assert.throws(f.issue,/JSON|Unexpected|Expected/);
  assert.throws(()=>f.c.setReqStatus('QA','cancel'),/cancellation blocked/);
  assert.equal(snapshot(f),before);assert.equal(f.held(),false);
});

test('partial commit is durable, not automatically rolled back; recovery posts only pending line',()=>{
  const f=fixture(),sheet=f.c.sh_('บันทึกรับ-จ่าย');
  const range=sheet.getRange;let fail=true;
  sheet.getRange=(r,c,...args)=>{
    const cell=range(r,c,...args),set=cell.setValue;
    cell.setValue=v=>{set(v);if(fail&&c===2&&v==='จ่ายออก'){fail=false;throw Error('PARTIAL_COMMIT');}};
    return cell;
  };
  assert.throws(f.issue,/PARTIAL_COMMIT/);
  assert.equal(f.balance(),98);assert.equal(f.header[1]?.[6],undefined);
  assert.equal(f.rows.filter(r=>r?.[1]==='จ่ายออก').length,1);
  assert.equal(f.held(),false);
  const committed=JSON.stringify(f.rows.find(r=>r?.[1]==='จ่ายออก'));
  const intent=f.properties.REQ_ISSUE_V1_QA;
  f.issue();assert.equal(f.balance(),95);assert.equal(f.header[1][6],'จ่ายแล้ว');
  assert.equal(JSON.stringify(f.rows.find(r=>r?.[1]==='จ่ายออก')),committed);
  assert.equal(f.properties.REQ_ISSUE_V1_QA,intent);
  const before=snapshot(f);assert.equal(f.issue().reused,true);assert.equal(snapshot(f),before);
});

test('flush failure releases lock while preserving inert preparation for reviewed recovery',()=>{
  const f=fixture({flushFailure:true});assert.throws(f.issue,/FLUSH_FAILURE/);
  assert.equal(f.held(),false);assert.equal(f.balance(),100);
  assert.equal(f.rows.filter(r=>r?.[1]==='จ่ายออก').length,0);
  assert.ok(f.properties.REQ_ISSUE_V1_QA);
  f.options.flushFailure=false;f.issue();assert.equal(f.balance(),95);
  assert.equal(f.rows.filter(r=>r?.[1]==='จ่ายออก').length,2);
});

test('ledger-only cleanup leaves durable intent and cannot reset an issued fixture',()=>{
  const f=fixture();f.issue();const intent=f.properties.REQ_ISSUE_V1_QA;
  // Model an unsafe ledger-only restore in memory. The header/intent still exist.
  f.rows.splice(0);const before=snapshot(f);
  assert.throws(f.issue,/Paid requisition has incomplete ledger/);
  assert.throws(()=>f.c.setReqStatus('QA','cancel'),/cancellation blocked/);
  assert.equal(snapshot(f),before);assert.equal(f.properties.REQ_ISSUE_V1_QA,intent);
  assert.equal(f.header[1][6],'จ่ายแล้ว');assert.equal(f.held(),false);
});
