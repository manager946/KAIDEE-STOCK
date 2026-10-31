'use strict';
// B08-1 F-13 (business mutation gate) and F-14 (seed start under the script lock) — OFFLINE only.
// Executes the generated SEED / RUNNER bundles against in-memory doubles. The lock double is
// deterministic: these tests prove the fail-closed LOGIC, NOT real Apps Script concurrency.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {runtime, seed, baseProps, preSeedProps, blankBook, IDS, RUN} = require('./helpers/b08-sheets-double');

const P = 'QA-DISP-' + RUN + '-';
const GATE = /PHASEB08_STOP: (business mutation blocked|company settings mutation disabled)/;

/** Every Code.gs business mutation entry point, called directly as if from the Apps Script editor. */
function businessCalls(t) {
  const specLen = vm.runInContext('SPEC_HEAD.length', t.ctx);
  return {
    'setReqStatus issue': () => t.ctx.setReqStatus(P + 'PC-001', 'issue'),
    'setReqStatus approve': () => t.ctx.setReqStatus(P + 'PC-001', 'approve'),
    'setReqStatus cancel': () => t.ctx.setReqStatus(P + 'PC-001', 'cancel'),
    saveReq: () => t.ctx.saveReq({date: '2026-11-01', requester: 'qa', dept: 'qa', reason: 'qa', lines: [{code: 'QA-001', qty: 1}]}),
    submitOrder: () => t.ctx.submitOrder({name: 'qa', contact: '0', company: 'qa', note: '', lines: [{code: 'QA-001', qty: 1}]}),
    addMovement: () => t.ctx.addMovement({date: '2026-11-01', type: 'รับเข้า', code: 'QA-001', qty: 1, price: 1, note: ''}),
    updateMovement: () => t.ctx.updateMovement({id: 'X', date: '2026-11-01', type: 'รับเข้า', code: 'QA-001', qty: 1}),
    deleteMovement: () => t.ctx.deleteMovement('X'),
    requestDelete: () => t.ctx.requestDelete('X', 'reason'),
    decideDelete: () => t.ctx.decideDelete('X', 'approve'),
    setOpening: () => t.ctx.setOpening('QA-001', 90, 'qa'),
    deleteReqs: () => t.ctx.deleteReqs([P + 'PC-001']),
    saveQuote: () => t.ctx.saveQuote({customer: 'qa', lines: [{code: 'QA-001', qty: 1, price: 1}]}),
    confirmQuote: () => t.ctx.confirmQuote('X'),
    deleteQuote: () => t.ctx.deleteQuote('X'),
    setupSpecs: () => t.ctx.setupSpecs(),
    saveSpecs: () => t.ctx.saveSpecs(['QA-001'], Array(specLen).fill('')),
    setCompany: () => t.ctx.setCompany({name: 'qa'})
  };
}
const nonConfig = props => Object.keys(props).filter(k => !/^KAIDEE_B08_/.test(k)).sort().map(k => k + '=' + props[k]);
function assertAllBlocked(t, extraMessage) {
  const before = nonConfig(t.props);
  const calls = businessCalls(t);
  assert.equal(Object.keys(calls).length, 18);
  for (const [name, call] of Object.entries(calls)) {
    let err = null;
    try { call(); } catch (e) { err = e.message; }
    assert.ok(err && (GATE.test(err) || (extraMessage && extraMessage.test(err))), name + ' must STOP at the gate, got: ' + err);
  }
  assert.equal(t.writes.length, 0, 'zero business writes');
  assert.deepEqual(t.structure, [], 'no sheet created/renamed');
  assert.deepEqual(nonConfig(t.props), before, 'zero new intents / properties');
  assert.equal(Object.keys(t.props).some(k => k.indexOf('REQ_ISSUE_V1_') === 0), false);
}

/* ---------- F-13: direct business calls in the RUNNER bundle ---------- */
const runnerStates = {
  NOT_STARTED: () => preSeedProps(),
  STARTED: () => preSeedProps({PHASEB08_SEED_STATE: 'STARTED'}),
  REVIEW_REQUIRED: () => preSeedProps({PHASEB08_SEED_STATE: 'REVIEW_REQUIRED', PHASEB08_SEED_ERROR: 'x'}),
  'COMPLETED without DONE': () => { const p = baseProps(); delete p.PHASEB08_SEED_DONE; return p; }
};
for (const [state, props] of Object.entries(runnerStates)) test('F-13 RUNNER bundle, seed ' + state + ': every direct business call STOPs with zero writes', () => {
  assertAllBlocked(runtime({props: props(), book: seed()}));
});

test('F-13 RUNNER identity but seeder file still installed (state COMPLETED): every business call STOPs', () => {
  const t = runtime({seedBundle: true, identityKind: 'RUNNER', props: baseProps(), book: seed()});
  assertAllBlocked(t);
  assert.throws(() => t.ctx.setReqStatus(P + 'PC-001', 'issue'), /seeder still installed/);
});

/* ---------- F-13: direct business calls in the SEED bundle ---------- */
const seedStates = {
  NOT_STARTED: () => preSeedProps(),
  STARTED: () => preSeedProps({PHASEB08_SEED_STATE: 'STARTED'}),
  REVIEW_REQUIRED: () => preSeedProps({PHASEB08_SEED_STATE: 'REVIEW_REQUIRED', PHASEB08_SEED_ERROR: 'x'}),
  'COMPLETED (seeder still installed)': () => baseProps()
};
for (const [state, props] of Object.entries(seedStates)) test('F-13 SEED bundle, seed ' + state + ': every direct business call STOPs with zero writes', () => {
  const t = runtime({seedBundle: true, props: props(), book: seed()});
  assertAllBlocked(t);
  assert.throws(() => t.ctx.setReqStatus(P + 'PC-001', 'issue'), /bundle identity is SEED, not RUNNER/);
});

test('F-13 business calls right after a real seed (SEED bundle, state COMPLETED, seeder installed) STOP', () => {
  const t = runtime({seedBundle: true, book: blankBook(), props: preSeedProps()});
  t.ctx.phaseB08SeedDisposableOnce();
  const n = t.writes.length, s = t.structure.length;
  for (const call of Object.values(businessCalls(t))) assert.throws(call, GATE);
  assert.equal(t.writes.length, n);
  assert.equal(t.structure.length, s);
  assert.equal(Object.keys(t.props).some(k => k.indexOf('REQ_ISSUE_V1_') === 0), false);
});

test('F-13 seed read-back cannot be abused: locked business workflow and proxy writes STOP inside read-back', () => {
  const t = runtime({seedBundle: true, book: seed(), props: preSeedProps({PHASEB08_SEED_STATE: 'STARTED'})});
  const r = t.ctx.b08WithSeedReadback_(() => {
    const out = {};
    try { t.ctx.setReqStatus(P + 'PC-001', 'issue'); } catch (e) { out.issue = e.message; }
    const sheet = t.ctx.stagingDb_().getSheetByName('ใบเบิกสินค้า');
    out.read = sheet.getRange(2, 1, 1, 1).getValues()[0][0];
    try { sheet.getRange(2, 7).setValue('จ่ายแล้ว'); } catch (e) { out.write = e.message; }
    try { t.ctx.stagingDb_().insertSheet('X'); } catch (e) { out.insert = e.message; }
    return out;
  });
  assert.match(r.issue, /business mutation blocked: bundle identity is SEED/);
  assert.equal(r.read, P + 'PC-001', 'read-back can still read');
  assert.match(r.write, /read-only seed read-back: Range\.setValue not allowed/);
  assert.match(r.insert, /read-only seed read-back: Spreadsheet\.insertSheet not allowed/);
  assert.equal(t.writes.length, 0);
  assert.equal(Object.keys(t.props).some(k => k.indexOf('REQ_ISSUE_V1_') === 0), false);
});

test('F-13 seed read-back is refused outside STARTED, outside the SEED bundle, or with the seeder removed', () => {
  for (const [opts, re] of [
    [{seedBundle: true, props: preSeedProps()}, /seed read-back not permitted/],
    [{seedBundle: true, props: baseProps()}, /seed read-back not permitted/],
    [{props: preSeedProps({PHASEB08_SEED_STATE: 'STARTED'})}, /seed read-back not permitted/]]) {
    const t = runtime(Object.assign({book: seed()}, opts));
    assert.throws(() => t.ctx.b08WithSeedReadback_(() => t.ctx.stagingDb_()), re);
  }
});

test('F-13 positive control: RUNNER bundle with seed COMPLETED still runs the business workflow', () => {
  const t = runtime();
  assert.equal(t.ctx.setReqStatus(P + 'LOCK-001', 'issue').ok, true);
  assert.equal(t.bal('QA-020'), 99);
});

/* ---------- F-14: seed start under the script lock (offline logic only, not real concurrency) ---------- */
function seedRun(o = {}) { return runtime(Object.assign({seedBundle: true, book: blankBook(), props: preSeedProps()}, o)); }

test('F-14 lock contention: another execution holds the script lock -> STOP, no marker, no writes', () => {
  const t = seedRun({lockBusy: true});
  assert.throws(() => t.ctx.phaseB08SeedDisposableOnce(), /another execution holds the script lock; seed not started, no marker written/);
  assert.equal(t.writes.length, 0);
  assert.deepEqual(t.structure, []);
  assert.deepEqual(nonConfig(t.props), []);
});

test('F-14 duplicate start while the first execution is inside the critical section: second STOPs, single seed', () => {
  const t = seedRun();
  const ss = t.ctx.SpreadsheetApp.openById(IDS.target); t.opened.length = 0;
  const insert = ss.insertSheet; let second = null;
  ss.insertSheet = n => {
    if (second === null) { try { t.ctx.phaseB08SeedDisposableOnce(); second = 'NO ERROR'; } catch (e) { second = e.message; } }
    return insert(n);
  };
  const r = t.ctx.phaseB08SeedDisposableOnce();
  assert.match(second, /another execution holds the script lock/);
  assert.equal(r.status, 'PHASEB08_SEED_COMPLETED');
  assert.equal(t.structure.filter(x => x[0] === 'insertSheet').length, 3, 'exactly one seed');
  assert.deepEqual(t.timeline.filter(e => e[0] === 'setProperty').map(e => e[1]),
    ['PHASEB08_SEED_STATE', 'PHASEB08_SEED_DONE', 'PHASEB08_SEED_STATE'], 'the losing execution wrote no marker');
  assert.equal(t.lockHeld(), false, 'lock released');
});

test('F-14 stale STARTED from a crashed execution: re-run STOPs inside the lock and does not touch the marker', () => {
  const t = seedRun({props: preSeedProps({PHASEB08_SEED_STATE: 'STARTED'})});
  assert.throws(() => t.ctx.phaseB08SeedDisposableOnce(), /seed state is not NOT_STARTED \(found PHASEB08_SEED_STATE\)/);
  assert.equal(t.props.PHASEB08_SEED_STATE, 'STARTED', 'not overwritten with REVIEW_REQUIRED by a losing execution');
  assert.equal(t.props.PHASEB08_SEED_ERROR, undefined);
  assert.equal(t.timeline.filter(e => e[0] === 'setProperty' || e[0] === 'deleteProperty').length, 0);
  assert.equal(t.writes.length, 0);
  assert.equal(t.lockHeld(), false);
});

test('F-14 duplicate start after COMPLETED: STOP, state stays COMPLETED, no property touched', () => {
  const t = seedRun();
  t.ctx.phaseB08SeedDisposableOnce();
  const n = t.timeline.length;
  assert.throws(() => t.ctx.phaseB08SeedDisposableOnce(), /seed state is not NOT_STARTED/);
  assert.equal(t.props.PHASEB08_SEED_STATE, 'COMPLETED');
  assert.equal(t.timeline.slice(n).filter(e => e[0] === 'setProperty' || e[0] === 'write').length, 0);
  assert.equal(t.lockHeld(), false);
});

test('F-14 a failure after STARTED releases the lock and marks REVIEW_REQUIRED exactly once', () => {
  const t = seedRun();
  const ss = t.ctx.SpreadsheetApp.openById(IDS.target); t.opened.length = 0;
  ss.insertSheet = () => { throw new Error('SIMULATED_INSERT_FAILURE'); };
  assert.throws(() => t.ctx.phaseB08SeedDisposableOnce(), /REVIEW_REQUIRED, no automatic reset: SIMULATED_INSERT_FAILURE/);
  assert.equal(t.lockHeld(), false);
  assert.deepEqual(t.timeline.filter(e => e[0] === 'setProperty').map(e => e[1]),
    ['PHASEB08_SEED_STATE', 'PHASEB08_SEED_ERROR', 'PHASEB08_SEED_STATE']);
  assert.equal(t.props.PHASEB08_SEED_STATE, 'REVIEW_REQUIRED');
});

test('F-14 a pre-STARTED guard failure (workbook not blank) releases the lock and writes no marker', () => {
  const b = blankBook(); b.sheets['แผ่น1'].data.set('3,3', {v: 'x', f: ''});
  const t = seedRun({book: b});
  assert.throws(() => t.ctx.phaseB08SeedDisposableOnce(), /target workbook is not blank/);
  assert.equal(t.lockHeld(), false);
  assert.deepEqual(nonConfig(t.props), []);
});

/* ---------- F-13 defense-in-depth: the two read-back precondition layers, each on its own ---------- */

test('F-13 layer: the read-back wrapper refuses by itself (fn that never touches stagingDb_)', () => {
  for (const opts of [{seedBundle: true, props: preSeedProps()}, {seedBundle: true, props: baseProps()},
    {props: preSeedProps({PHASEB08_SEED_STATE: 'STARTED'})}]) {
    const t = runtime(Object.assign({book: seed()}, opts));
    assert.throws(() => t.ctx.b08WithSeedReadback_(() => 'ran'), /seed read-back not permitted/);
  }
});

test('F-13 layer: the gate read-back branch refuses by itself (read-back depth raised without the wrapper)', () => {
  for (const opts of [{props: baseProps()}, {seedBundle: true, props: baseProps()},
    {props: preSeedProps({PHASEB08_SEED_STATE: 'STARTED'})}]) {
    const t = runtime(Object.assign({book: seed()}, opts));
    vm.runInContext('B08_SEED_READBACK.depth = 1', t.ctx);
    assert.throws(() => t.ctx.stagingDb_(), /seed read-back not permitted/);
    assert.equal(t.writes.length, 0);
  }
});

/* ---------- F-15: read-only facade is an explicit per-kind allowlist (default deny) ---------- */

function inReadback(fn, o = {}) {
  const t = runtime(Object.assign({seedBundle: true, book: seed(), props: preSeedProps({PHASEB08_SEED_STATE: 'STARTED'})}, o));
  const result = t.ctx.b08WithSeedReadback_(() => fn(t.ctx.stagingDb_(), t));
  return {t, result};
}
const f15Denied = {
  'Range.breakApart (reviewer case)': ss => ss.getSheetByName('ใบเบิกสินค้า').getRange(2, 1, 1, 2).breakApart(),
  'Range.splitTextToColumns (reviewer case)': ss => ss.getSheetByName('ใบเบิกสินค้า').getRange(2, 1).splitTextToColumns(),
  'Range.trimWhitespace': ss => ss.getSheetByName('รายการใบเบิก').getRange(2, 1).trimWhitespace(),
  'Range.randomize': ss => ss.getSheetByName('รายการใบเบิก').getRange(2, 1, 3, 1).randomize(),
  'Range.merge': ss => ss.getSheetByName('คลังสินค้า').getRange(1, 1, 1, 2).merge(),
  'Range.check': ss => ss.getSheetByName('คลังสินค้า').getRange(8, 1).check(),
  'Range.removeDuplicates': ss => ss.getSheetByName('รายการใบเบิก').getRange(2, 1, 8, 5).removeDuplicates(),
  'Range.createFilter': ss => ss.getSheetByName('รายการใบเบิก').getRange(1, 1, 9, 5).createFilter(),
  'Range.copyTo': ss => ss.getSheetByName('คลังสินค้า').getRange(8, 1).copyTo(null),
  'Range.setValue': ss => ss.getSheetByName('ใบเบิกสินค้า').getRange(2, 7).setValue('จ่ายแล้ว'),
  'Range.getSheet (child object escape)': ss => ss.getSheetByName('คลังสินค้า').getRange(8, 1).getSheet(),
  'Sheet.appendRow': ss => ss.getSheetByName('บันทึกรับ-จ่าย').appendRow(['x']),
  'Sheet.hideSheet': ss => ss.getSheetByName('คลังสินค้า').hideSheet(),
  'Sheet.protect': ss => ss.getSheetByName('คลังสินค้า').protect(),
  'Sheet.getParent (parent object escape)': ss => ss.getSheetByName('คลังสินค้า').getParent(),
  'Sheet.getMaxRows (unlisted read is denied too)': ss => ss.getSheetByName('คลังสินค้า').getMaxRows(),
  'Spreadsheet.deleteSheet': ss => ss.deleteSheet(ss.getSheetByName('คลังสินค้า')),
  'Spreadsheet.insertSheet': ss => ss.insertSheet('X'),
  'Spreadsheet.getActiveSheet (object escape)': ss => ss.getActiveSheet(),
  'Spreadsheet.getOwner (unknown method)': ss => ss.getOwner()
};
for (const [name, call] of Object.entries(f15Denied)) test('F-15 read-back facade denies ' + name + ' with zero writes', () => {
  const kind = name.split('.')[0], method = name.split(' ')[0].split('.')[1];
  const {t, result} = inReadback((ss, rt) => { try { call(ss); return 'NO ERROR'; } catch (e) { return e.message; } });
  assert.match(result, new RegExp('read-only seed read-back: ' + kind + '\\.' + method + ' not allowed'));
  assert.equal(t.writes.length, 0, 'zero writes');
  assert.deepEqual(t.structure, []);
});

test('F-15 facade invariants: no property writes, no keys, no prototype, no raw object identity', () => {
  const {t, result} = inReadback((ss, rt) => {
    const out = {};
    for (const [k, f] of [['set', () => { ss.x = 1; }], ['define', () => Object.defineProperty(ss, 'y', {value: 1})], ['delete', () => { delete ss.getName; }]])
      try { f(); out[k] = 'NO ERROR'; } catch (e) { out[k] = e.message; }
    out.keys = Object.keys(ss);
    out.has = 'getRange' in ss.getSheetByName('คลังสินค้า');
    out.proto = Object.getPrototypeOf(ss);
    const sheet = ss.getSheetByName('คลังสินค้า');
    out.rawSheet = sheet === rt.book.sheets['คลังสินค้า'];
    out.rawRange = sheet.getRange(8, 1) === rt.book.sheets['คลังสินค้า'].getRange(8, 1);
    out.rawInArray = ss.getSheets().some(x => Object.values(rt.book.sheets).includes(x));
    return out;
  });
  for (const k of ['set', 'define', 'delete']) assert.match(result[k], /read-only seed read-back: Spreadsheet\.(set|define|delete) /);
  assert.deepEqual([...result.keys], []);
  assert.equal(result.has, false);
  assert.equal(result.proto, null);
  assert.equal(result.rawSheet, false);
  assert.equal(result.rawRange, false);
  assert.equal(result.rawInArray, false);
  assert.equal(t.writes.length, 0);
});

test('F-15 a "value" getter that returns an object STOPs (no mutable object can leak through a value slot)', () => {
  const {result} = inReadback((ss, rt) => {
    const inv = rt.book.sheets['คลังสินค้า'], orig = inv.getRange;
    inv.getRange = (...a) => Object.assign(orig(...a), {getValues: () => inv});
    try { ss.getSheetByName('คลังสินค้า').getRange(8, 1).getValues(); return 'NO ERROR'; } catch (e) { return e.message; }
    finally { inv.getRange = orig; }
  });
  assert.match(result, /Range\.getValues returned an object/);
});

test('F-15 positive: every allowlisted read works inside the STARTED read-back', () => {
  const {t, result} = inReadback(ss => {
    const inv = ss.getSheetByName('คลังสินค้า');
    return {
      name: ss.getName(), id: ss.getId(), tabs: ss.getSheets().map(s => s.getName()),
      lastRow: inv.getLastRow(), lastCol: inv.getLastColumn(),
      codes: inv.getRange(8, 1, 52, 1).getValues().map(r => r[0]),
      hFormula: inv.getRange(8, 8).getFormula(), hFormulas: inv.getRange(8, 8, 2, 1).getFormulas(),
      display: inv.getRange(1, 1).getDisplayValue(), displays: inv.getRange(7, 1, 1, 2).getDisplayValues(),
      value: inv.getRange(8, 6).getValue ? inv.getRange(8, 6).getValues()[0][0] : null
    };
  });
  assert.equal(result.name, 'KAIDEE-STOCK-DISPOSABLE-QA-B08-' + RUN);
  assert.equal(result.id, IDS.target);
  assert.deepEqual([...result.tabs], ['คลังสินค้า', 'บันทึกรับ-จ่าย', 'ใบเบิกสินค้า', 'รายการใบเบิก']);
  assert.equal(result.lastRow, 59);
  assert.equal(result.codes.length, 52);
  assert.match(result.hFormula, /^=SUMIFS\(/);
  assert.equal(result.hFormulas.length, 2);
  assert.match(result.display, /NO REAL DATA/);
  assert.equal(result.value, 100);
  assert.equal(t.writes.length, 0);
});

test('F-15 positive: a full seed still verifies its read-back under STARTED and reaches COMPLETED', () => {
  const t = runtime({seedBundle: true, book: blankBook(), props: preSeedProps()});
  assert.equal(t.ctx.phaseB08SeedDisposableOnce().status, 'PHASEB08_SEED_COMPLETED');
  assert.equal(t.props.PHASEB08_SEED_STATE, 'COMPLETED');
});

test('F-15 business calls during seed STARTED still STOP inside and outside the read-back (zero writes / intents)', () => {
  const {t, result} = inReadback((ss, rt) => {
    const errs = [];
    for (const call of Object.values(businessCalls(rt))) { try { call(); errs.push('NO ERROR'); } catch (e) { errs.push(e.message); } }
    return errs;
  });
  assert.equal(result.length, 18);
  assert.ok(result.every(m => GATE.test(m)), result.find(m => !GATE.test(m)));
  assert.equal(t.writes.length, 0);
  assert.equal(Object.keys(t.props).some(k => k.indexOf('REQ_ISSUE_V1_') === 0), false);
});
