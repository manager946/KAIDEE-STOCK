'use strict';
// Memory-only disposable fixtures. No Apps Script execution or Google writes.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fixture}=require('./helpers/recovery-fixture');
const state=f=>JSON.stringify({rows:f.rows,header:f.header,properties:f.properties});

test('partial commit across different SKUs resumes without changing committed line',()=>{
  const f=fixture();f.req.lines[1].code='SKU-B';
  f.c.readItems_=()=>[['SKU','','','',10,100],['SKU-B','','','',20,100]];
  const sh=f.c.sh_('บันทึกรับ-จ่าย'),range=sh.getRange;let armed=true;
  sh.getRange=(r,c,...args)=>{const cell=range(r,c,...args),set=cell.setValue;
    cell.setValue=v=>{set(v);if(armed&&c===2&&v==='จ่ายออก'){armed=false;throw Error('PARTIAL');}};return cell;};
  assert.throws(f.issue,/PARTIAL/);
  const balances=()=>f.c.balances_(f.c.readItems_(),f.c.readMv_());
  assert.equal(balances().SKU,98);assert.equal(balances()['SKU-B'],100);
  const first=JSON.stringify(f.rows.find(r=>r?.[1]==='จ่ายออก'));
  f.issue();assert.equal(balances().SKU,98);assert.equal(balances()['SKU-B'],97);
  assert.equal(JSON.stringify(f.rows.find(r=>r?.[1]==='จ่ายออก')),first);
  const before=state(f);assert.equal(f.issue().reused,true);assert.equal(state(f),before);
});

test('lock is reusable after a failing critical section without discarding saved intent',()=>{
  const f=fixture({ambiguousProperty:true});assert.throws(f.issue,/PROPERTY_AMBIGUOUS/);
  const intent=f.properties.REQ_ISSUE_V1_QA;assert.equal(f.held(),false);
  f.issue();assert.equal(f.balance(),95);assert.equal(f.properties.REQ_ISSUE_V1_QA,intent);
  assert.equal(f.events.filter(e=>e[0]==='wait').length,2);
  assert.equal(f.events.filter(e=>e[0]==='release').length,2);
});

test('property read outage after posting preserves paid history and retry is idempotent after service recovery',()=>{
  const f=fixture();f.issue();const before=state(f);
  f.options.readFailure=true;assert.throws(f.issue,/PROPERTY_READ/);
  assert.equal(state(f),before);assert.equal(f.held(),false);
  f.options.readFailure=false;assert.equal(f.issue().reused,true);assert.equal(state(f),before);
});

test('full in-memory snapshot restored into fresh disposable runtime retains paid retry semantics',()=>{
  const history=fixture();history.issue();const original=state(history);
  const backup=JSON.parse(original),restored=fixture();
  // Test-only restoration into NEW memory, never historical Google fixtures.
  restored.rows.push(...backup.rows);restored.header.push(...backup.header);
  for(const k of Object.keys(restored.properties))delete restored.properties[k];
  Object.assign(restored.properties,backup.properties);
  assert.equal(state(restored),original);
  assert.equal(restored.issue().reused,true);assert.equal(restored.balance(),95);
  assert.equal(state(restored),original);assert.equal(state(history),original);
});

test('restoring ledger/header without intent fails closed instead of adopting paid history',()=>{
  const history=fixture();history.issue();const original=state(history);
  const backup=JSON.parse(original),incomplete=fixture();
  incomplete.rows.push(...backup.rows);incomplete.header.push(...backup.header);
  const before=state(incomplete);assert.throws(incomplete.issue,/manual review/);
  assert.equal(state(incomplete),before);assert.equal(state(history),original);
});
