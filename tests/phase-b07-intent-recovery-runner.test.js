'use strict';
// B07 isolated Apps Script test helper — OFFLINE only. No Google API access.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('qa/phase-b/B07_IntentFaultTest_QA_ONLY.gs', 'utf8');
const adapter = fs.readFileSync('qa/phase-b/PhaseBIsolatedAdapter.gs', 'utf8');
const reqId = 'QA-PB-003';
const intentKey = 'REQ_ISSUE_V1_QA-PB-003';
const armKey = 'PHASEB_B07_ARM_QA-PB-003';

function validPlan() {
  return JSON.stringify({
    version: 1, doc: 'QA-PB-RQ003',
    shape: [
      {id: 'REQ-QA-PB-003-1', line: 'QA-PB-L5', code: 'QA-004', qty: 2},
      {id: 'REQ-QA-PB-003-2', line: 'QA-PB-L6', code: 'QA-005', qty: 3}
    ],
    who: 'QA TEST ACCOUNT', at: '2026-10-30T09:00:00.000Z',
    prices: [1, 1]
  });
}

function fixture(opts = {}) {
  const values = new Map();
  if (opts.intent) values.set(intentKey, opts.intent === 'valid' ? validPlan() : opts.intent);
  if (opts.armed) values.set(armKey, opts.armed);
  const writes = [];
  const original = [
    ['REQ-QA-PB-001-1', 'QA-001', 2, 'QA-PB-RQ001'],
    ['REQ-QA-PB-001-2', 'QA-001', 3, 'QA-PB-RQ001'],
    ['REQ-QA-PB-002-1', 'QA-002', 4, 'QA-PB-RQ002'],
    ['REQ-QA-PB-002-2', 'QA-003', 1, 'QA-PB-RQ002']
  ];
  const state = {
    movements: original.map(([id, sku, qty, doc]) => ({id, sku, qty, doc})),
    status: 'อนุมัติ',
    balance: {QA001: 95, QA002: 96, QA003: 99, QA004: 100, QA005: 100}
  };
  if (opts.partial) {
    state.movements.push({id:'REQ-QA-PB-003-1',sku:'QA-004',qty:2,doc:'QA-PB-RQ003'});
    state.balance.QA004 = 98;
  }
  if (opts.badBalance) state.balance.QA005 = 50;
  const props = {
    getProperty: k => values.get(k) ?? null,
    setProperty: (k,v) => { writes.push(['set', k]); values.set(k,v); },
    deleteProperty: k => { writes.push(['delete',k]); values.delete(k); }
  };
  const ctx = {
    PropertiesService: {getScriptProperties: () => props},
    stagingDb_: () => ({}),
    phaseBPreflightReadOnly: () => ({
      status:'ISOLATED_SYNTHETIC_PREFLIGHT_PASS',
      formula:'MOVEMENT_ONLY_FORMULA_VERIFIED', skuCount:52,
      requestStatus:[
        {id:'QA-PB-001',status:'จ่ายแล้ว'},
        {id:'QA-PB-002',status:'จ่ายแล้ว'},
        {id:reqId,status:state.status}
      ],
      postedMovements:state.movements.map(m=>({...m})),
      balance:{...state.balance}
    }),
    reqIssueRows_: () => state.movements.map(m => {
      const v=Array(14).fill('');
      v[1]='จ่ายออก'; v[2]=m.sku; v[4]=m.qty; v[10]=m.id; v[13]=m.doc;
      return {v};
    }),
    console: {log:()=>{}}
  };
  vm.createContext(ctx);
  const hookSnippet = opts.withoutHook
    ? 'function writeIssue_(r) { return r.id; }'
    : 'function writeIssue_(r) { phaseBInjectOnceAfterIntent_(r.id); }';
  vm.runInContext(hookSnippet,ctx);
  vm.runInContext(source,ctx,{timeout:3000});
  ctx.setReqStatus = (id, action) => {
    assert.equal(id,reqId);
    assert.equal(action,'issue');
    if (!values.has(intentKey)) props.setProperty(intentKey,validPlan());
    ctx.writeIssue_({id});
    if (state.status === 'จ่ายแล้ว') return {ok:true,reused:true};
    state.movements.push(
      {id:'REQ-QA-PB-003-1',sku:'QA-004',qty:2,doc:'QA-PB-RQ003'},
      {id:'REQ-QA-PB-003-2',sku:'QA-005',qty:3,doc:'QA-PB-RQ003'}
    );
    state.balance.QA004 = 98;
    state.balance.QA005 = 97;
    state.status = 'จ่ายแล้ว';
    return {ok:true,reused:false};
  };
  return {ctx,props,values,writes,state};
}

test('B07 adapter accepts exactly three synthetic requisitions',()=>{
  assert.match(adapter, /const expected = \['QA-PB-001', 'QA-PB-002', 'QA-PB-003'\]/);
  assert.match(adapter, /reqs\.length !== expected\.length/);
  assert.match(adapter, /QA-PB-003.*QA-004.*QA-005/);
});

test('B07 read-only readiness leaves all properties and stock unchanged',()=>{
  const h=fixture();
  const r=h.ctx.phaseB07ValidateReadOnly();
  assert.equal(r.status,'PHASEB_B07_READY_READ_ONLY');
  assert.equal(r.activeMovements,4);
  assert.equal(r.intentAbsent,true);
  assert.equal(h.writes.length,0);
  assert.equal(h.state.balance.QA004,100);
});

test('B07 actual one-shot fault stores intent before movement and disarms',()=>{
  const h=fixture();
  const r=h.ctx.phaseB07CrashAfterIntentOnce();
  assert.equal(r.status,'PHASEB_B07_INTENT_FAULT_INJECTED');
  assert.equal(r.noStockChange,true);
  assert.equal(r.activeMovements,4);
  assert.equal(h.values.has(intentKey),true);
  assert.equal(h.values.has(armKey),false);
  assert.equal(h.state.movements.length,4);
  assert.deepEqual(h.writes.map(x=>x[0]+':'+x[1]),[
    'set:'+armKey,'set:'+intentKey,'delete:'+armKey
  ]);
});

test('B07 recovery resumes saved intent only once after fault',()=>{
  const h=fixture();
  h.ctx.phaseB07CrashAfterIntentOnce();
  const r=h.ctx.phaseB07RecoverAfterIntentOnce();
  assert.equal(r.status,'PHASEB_B07_RECOVERY_PASS');
  assert.equal(r.activeMovements,6);
  assert.equal(r.balance.QA004,98);
  assert.equal(r.balance.QA005,97);
  assert.equal(h.values.has(armKey),false);
  assert.equal(h.state.movements.length,6);
  assert.equal(new Set(h.state.movements.map(m=>m.id)).size,6);
});

test('B07 preexisting valid intent fails closed before crash',()=>{
  const h=fixture({intent:'valid'});
  assert.throws(()=>h.ctx.phaseB07CrashAfterIntentOnce(),/preexisting intent\/armed flag/);
  assert.equal(h.writes.length,0);
  assert.equal(h.state.movements.length,4);
});

test('B07 remaining armed flag blocks recovery',()=>{
  const h=fixture({intent:'valid',armed:'AFTER_INTENT'});
  assert.throws(()=>h.ctx.phaseB07RecoverAfterIntentOnce(),/fault remains armed/);
  assert.equal(h.writes.length,0);
});

test('B07 invalid saved intent blocks recovery without postings',()=>{
  const h=fixture({intent:'{"invalid":true}'});
  assert.throws(()=>h.ctx.phaseB07RecoverAfterIntentOnce(),/persisted intent payload mismatch/);
  assert.equal(h.state.movements.length,4);
  assert.equal(h.writes.length,0);
});

test('B07 unrecognized partial state fails closed before issuing',()=>{
  const h=fixture({intent:'valid',partial:true});
  assert.throws(()=>h.ctx.phaseB07RecoverAfterIntentOnce(),/unexpected active movements/);
  assert.equal(h.state.movements.length,5);
  assert.equal(h.writes.length,0);
});

test('B07 no injection hook blocks attempt before any property write',()=>{
  const h=fixture({withoutHook:true});
  assert.throws(()=>h.ctx.phaseB07CrashAfterIntentOnce(),/reviewed QA-only hook not found/);
  assert.equal(h.writes.length,0);
});

test('B07 unexpected inventory balance stops readiness',()=>{
  const h=fixture({badBalance:true});
  assert.throws(()=>h.ctx.phaseB07ValidateReadOnly(),/stock balance drift/);
  assert.equal(h.writes.length,0);
});
