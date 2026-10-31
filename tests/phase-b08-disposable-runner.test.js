'use strict';
// B08 disposable runner — OFFLINE only. Executes the generated bundle (hooked
// Code.gs COPY + B08 adapter + runner) against in-memory doubles. These tests
// do NOT certify Google concurrency, quota, durability or real process crashes.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {runtime, seed, cloneBook, baseProps, sha, IDS, RUN, G: Gf, I: If} = require('./helpers/b08-sheets-double');

const STOP = /PHASEB08_STOP/;
const req = key => 'QA-DISP-' + RUN + '-' + key;
const ledgerIds = t => [...t.book.sheets['บันทึกรับ-จ่าย'].data].filter(([k]) => k.endsWith(',11')).map(([, x]) => x.v);
function onlyTargetOpened(t) { assert.ok(t.opened.every(id => id === IDS.target), 'opened a non-target ID'); }

test('G-0 readiness is zero-write and opens only the bound target', () => {
  const t = runtime();
  const r = t.ctx.phaseB08ValidateReadOnly();
  assert.equal(r.status, 'PHASEB08_READY_READ_ONLY');
  assert.equal(r.requests.length, 7);
  assert.equal(t.writes.length, 0);
  assert.deepEqual(Object.keys(t.props).filter(k => /^PHASEB08_|^REQ_ISSUE/.test(k)), []);
  onlyTargetOpened(t);
});

const guardCases = {
  'denylist shorter than 4': () => ({props: baseProps({KAIDEE_B08_DENYLIST_SHA256: [IDS.staging, IDS.prod, IDS.qaOld].map(sha).join(',')})}),
  'target configured as protected STAGING ID': () => ({props: baseProps({KAIDEE_B08_TARGET_ID: IDS.staging, KAIDEE_B08_TARGET_SHA256: sha(IDS.staging)})}),
  'running inside the B07 QA project': () => ({scriptId: IDS.b07}),
  'unknown project identity': () => ({scriptId: 'someOtherProject_000000001'}),
  'target hash mismatch': () => ({props: baseProps({KAIDEE_B08_TARGET_SHA256: sha('x')})}),
  'STAGING property present in project': () => ({props: baseProps({KAIDEE_STAGING_SPREADSHEET_ID: 'anything'})}),
  'B07 intent key present in project': () => ({props: baseProps({'REQ_ISSUE_V1_QA-PB-003': '{}'})}),
  'project trigger present': () => ({triggers: [{}]}),
  'protected title': () => ({book: seed({title: 'KAIDEE-STOCK-SYNTHETIC-QA-STEP8-15'})}),
  'sheet bound to another project': () => ({book: seed({scriptSha: sha('anotherProject_00000000001')})}),
  'run ID mismatch (title/sentinel)': () => ({book: Object.assign(seed(), {title: 'KAIDEE-STOCK-DISPOSABLE-QA-B08-' + RUN}), props: baseProps({KAIDEE_B08_RUN_ID: 'OTHER123'})}),
  'foreign QA-PB requisition in sheet': () => { const b = seed(); b.sheets['ใบเบิกสินค้า'].data.set('2,1', {v: 'QA-PB-001', f: ''}); return {book: b}; },
  'orphan ledger row without MovementID': () => { const b = seed(); b.sheets['บันทึกรับ-จ่าย'].data.set('4,3', {v: 'QA-010', f: ''}); b.sheets['บันทึกรับ-จ่าย'].data.set('4,2', {v: 'จ่ายออก', f: ''}); return {book: b}; },
  'non-canonical H formula': () => { const b = seed(); b.sheets['คลังสินค้า'].data.set('20,8', {v: '', f: '=1'}); return {book: b}; },
  'extra tab': () => { const b = seed(); b.sheets.Extra = require('./helpers/b08-sheets-double').makeSheet('Extra'); return {book: b}; }
};
for (const [name, make] of Object.entries(guardCases)) test('G guard fails closed: ' + name, () => {
  const t = runtime(make());
  assert.throws(() => t.ctx.phaseB08ValidateReadOnly(), STOP);
  assert.throws(() => t.ctx.phaseB08PartialCommitFaultOnce(), STOP);
  assert.equal(t.writes.length, 0);
  assert.equal(t.props.PHASEB08_ARM, undefined);
  onlyTargetOpened(t);
});

test('G runtime source attestation mismatch stops before arming', () => {
  const t = runtime();
  t.ctx.withLock_ = function withLock_(fn) { return fn(); }; // tampered critical section
  assert.throws(() => t.ctx.phaseB08PartialCommitFaultOnce(), /attestation mismatch: withLock_/);
  assert.equal(t.props.PHASEB08_ARM, undefined);
  assert.equal(t.writes.length, 0);
});

test('PC-1..3 partial commit: fault, independent readback, resume pending only, idempotent retry', () => {
  const t = runtime();
  const f = t.ctx.phaseB08PartialCommitFaultOnce();
  assert.equal(f.evidenceClass, 'SIMULATED_EXCEPTION_AFTER_FLUSH');
  assert.equal(f.realProcessCrash, 'NOT_TESTED');
  assert.equal(t.props.PHASEB08_ARM, undefined);
  assert.ok(t.log.some(e => e[0] === 'flush'));
  // recovery is refused until a separate readback is recorded
  assert.throws(() => t.ctx.phaseB08PartialCommitRecoverOnce(), /missing evidence PHASEB08_PC_READBACK/);
  const rb = t.ctx.phaseB08PartialCommitReadback();
  assert.equal(rb.status, 'PHASEB08_PC_READBACK_PASS');
  assert.equal(t.bal('QA-010'), 98); assert.equal(t.bal('QA-011'), 100);
  const r = t.ctx.phaseB08PartialCommitRecoverOnce();
  assert.equal(r.receipt.reused, false);
  assert.equal(t.bal('QA-010'), 98); assert.equal(t.bal('QA-011'), 97);
  assert.deepEqual(ledgerIds(t), ['REQ-' + req('PC-001') + '-1', 'REQ-' + req('PC-001') + '-2']);
});

test('PC recovery stops if state drifted between readback and recovery', () => {
  const t = runtime();
  t.ctx.phaseB08PartialCommitFaultOnce();
  t.ctx.phaseB08PartialCommitReadback();
  t.book.sheets['ใบเบิกสินค้า'].data.set('2,6', {v: 'edited after readback', f: ''});
  const writes = t.writes.length;
  assert.throws(() => t.ctx.phaseB08PartialCommitRecoverOnce(), /drifted since readback/);
  assert.equal(t.writes.length, writes);
  assert.equal(t.bal('QA-011'), 100);
});

test('PC unexpected error (not the marker) stops and leaves arm for manual review', () => {
  const t = runtime({lockBusy: true});
  assert.throws(() => t.ctx.phaseB08PartialCommitFaultOnce(), /expected simulated fault NOT observed.*DO NOT RETRY/);
  assert.ok(t.props.PHASEB08_ARM, 'arm is preserved as evidence');
  assert.throws(() => t.ctx.phaseB08PartialCommitFaultOnce(), /arm already present/);
  assert.equal(t.writes.length, 0);
});

test('LOCK-1 A holds real withLock_ 35 s; B times out inside the hold with zero business writes', () => {
  let t;
  t = runtime({onSleep: () => { t.tick(1500); t.ctx.phaseB08LockContenderB(); }});
  const a = t.ctx.phaseB08LockHolderA();
  assert.equal(a.holdMs, 35000);
  const b = JSON.parse(t.props.PHASEB08_LOCK_B);
  assert.match(b.error, /Lock timeout/);
  assert.equal(b.preSha256, b.postSha256);
  const ev = t.ctx.phaseB08LockEvaluateReadOnly();
  assert.equal(ev.lock1.verdict, 'PASS');
  assert.deepEqual(JSON.parse(JSON.stringify(ev.lock1.readback)), {status: 'อนุมัติ', rows: 0, intent: false});
  assert.equal(t.writes.length, 0);
  assert.equal(t.ctx.phaseB08LockIssueAfterRelease().status, 'PHASEB08_LOCK_RETRY_PASS');
  assert.equal(t.bal('QA-020'), 99);
});

test('LOCK-1 evaluator: INCONCLUSIVE, FAIL and STOP paths', () => {
  const {ctx} = runtime();
  const a = {role: 'A', reqKey: 'LOCK-001', acquiredAt: 1000, releaseAt: 36000};
  const b = o => Object.assign({role: 'B', reqKey: 'LOCK-001', startedAt: 2000, endedAt: 22000,
    error: 'Lock timeout: another process was holding the lock for too long.', preSha256: 'x', postSha256: 'x',
    activeRows: 0, intentAt: null, status: 'อนุมัติ'}, o);
  assert.equal(ctx.b08EvaluateLockTimeout_(a, b()).verdict, 'PASS');
  assert.equal(ctx.b08EvaluateLockTimeout_(a, b({startedAt: 30000, endedAt: 50000})).verdict, 'INCONCLUSIVE');
  assert.equal(ctx.b08EvaluateLockTimeout_(a, b({error: null})).verdict, 'FAIL');
  assert.equal(ctx.b08EvaluateLockTimeout_(a, b({error: null, startedAt: 40000})).verdict, 'INCONCLUSIVE');
  assert.equal(ctx.b08EvaluateLockTimeout_(a, b({postSha256: 'y'})).verdict, 'FAIL');
  assert.equal(ctx.b08EvaluateLockTimeout_(a, b({endedAt: 5000})).verdict, 'FAIL');
  assert.equal(ctx.b08EvaluateLockTimeout_(a, b({error: 'Exceeded quota'})).verdict, 'STOP');
  assert.equal(ctx.b08EvaluateLockTimeout_(a, b({reqKey: 'LOCK-002'})).verdict, 'STOP');
});

test('LOCK-2 serialization evaluator uses intent.at written inside the critical section', () => {
  const {ctx} = runtime();
  const a = {role: 'A', reqKey: 'LOCK-002', acquiredAt: Date.parse('2026-10-31T03:00:00Z'), releaseAt: Date.parse('2026-10-31T03:00:10Z')};
  const b = o => Object.assign({role: 'B', reqKey: 'LOCK-002', startedAt: a.acquiredAt + 2000, error: null,
    intentAt: '2026-10-31T03:00:10.050Z', activeRows: 1, status: 'จ่ายแล้ว'}, o);
  assert.equal(ctx.b08EvaluateLockSerial_(a, b()).verdict, 'PASS');
  assert.equal(ctx.b08EvaluateLockSerial_(a, b({intentAt: '2026-10-31T03:00:05.000Z'})).verdict, 'FAIL');
  assert.equal(ctx.b08EvaluateLockSerial_(a, b({startedAt: a.releaseAt + 1})).verdict, 'INCONCLUSIVE');
  assert.equal(ctx.b08EvaluateLockSerial_(a, b({activeRows: 2})).verdict, 'FAIL');
  assert.equal(ctx.b08EvaluateLockSerial_(a, b({error: 'x'})).verdict, 'STOP');
});

test('LOCK-2 contender records intent.at and ledger from the real issue path', () => {
  const t = runtime();
  const b = t.ctx.phaseB08LockSerialContenderB();
  assert.equal(b.error, null);
  assert.equal(b.activeRows, 1);
  assert.equal(b.status, 'จ่ายแล้ว');
  assert.equal(typeof b.intentAt, 'string');
});

for (const [n, fn, point] of [[1, 'phaseB08PropBeforeReadOnce', 'BEFORE_INTENT_READ'], [2, 'phaseB08PropBeforeWriteOnce', 'BEFORE_INTENT_WRITE']])
  test('PROP-' + n + ' simulated fault ' + point + ': no intent, no business change, unrelated keys preserved', () => {
    const t = runtime();
    const r = t.ctx[fn]();
    assert.equal(r.point, point);
    assert.equal(r.realQuota, 'PENDING');
    assert.equal(t.props['REQ_ISSUE_V1_' + req('PROP-00' + n)], undefined);
    assert.equal(t.writes.length, 0);
    assert.equal(t.ctx['phaseB08PropIssueAfterFault' + n]().status, 'PHASEB08_PROP_RETRY_PASS');
    assert.equal(t.bal(n === 1 ? 'QA-030' : 'QA-031'), 99);
  });

function snapshotOf(t) { return JSON.parse(JSON.stringify(t.ctx.b08Snapshot_())); }
function restoreRuntime(source, {withIntents = true, mutate} = {}) {
  const p2 = 'disposableScript_P2_0001', w2 = 'disposableRestoreSheet_0001';
  const book = cloneBook(source.book, {id: w2, title: 'KAIDEE-STOCK-DISPOSABLE-QA-B08-' + RUN + '-R1'});
  book.sheets['คลังสินค้า'].data.set('2,1', {v: 'B08-BIND|' + RUN + '|' + sha(p2), f: ''});
  const props = baseProps({KAIDEE_B08_TARGET_ID: w2, KAIDEE_B08_TARGET_SHA256: sha(w2), KAIDEE_B08_SCRIPT_SHA256: sha(p2),
    KAIDEE_B08_ROLE: 'RESTORE', KAIDEE_B08_RESTORE_SEQ: '1'});
  if (withIntents) Object.keys(source.props).filter(k => k.startsWith('REQ_ISSUE_V1_')).forEach(k => { props[k] = source.props[k]; });
  if (mutate) mutate(book, props);
  const t = runtime({book, props, scriptId: p2});
  t.opened.length = 0;
  return t;
}

test('RB-1..4 full restore into a separate project: business equal, config excluded, validation on clone only', () => {
  const src = runtime();
  src.ctx.phaseB08RestorePrepareIssueOnce();
  const before = snapshotOf(src);
  const r = restoreRuntime(src);
  const restored = snapshotOf(r);
  const cmp = r.ctx.b08CompareSnapshots_(before, restored);
  assert.deepEqual([...cmp.diffs], []);
  assert.equal(cmp.equal, true);
  assert.notEqual(before.config.title, restored.config.title);
  assert.notEqual(before.config.binding, restored.config.binding);
  const v = r.ctx.phaseB08RestoreValidateOnce();
  assert.equal(v.status, 'PHASEB08_RESTORE_VALIDATION_PASS');
  assert.equal(r.bal('QA-041'), 99);
  assert.deepEqual(snapshotOf(src).business, before.business, 'source untouched');
  assert.ok(r.opened.every(id => id === 'disposableRestoreSheet_0001'));
});

const diffCases = {
  'intent logical timestamp': (b, p) => { const k = Object.keys(p).find(x => x.startsWith('REQ_ISSUE_V1_')); const o = JSON.parse(p[k]); o.at = '2026-01-01T00:00:00.000Z'; p[k] = JSON.stringify(o); },
  'ledger timestamp': b => { const d = b.sheets['บันทึกรับ-จ่าย'].data.get('4,1'); d.v = new Date(d.v.getTime() + 1000); },
  'movement ID': b => { b.sheets['บันทึกรับ-จ่าย'].data.get('4,11').v = 'REQ-QA-DISP-' + RUN + '-RESTORE-001-9'; },
  'H formula text': b => { b.sheets['คลังสินค้า'].data.get('47,8').f += ' '; },
  'header status': b => { b.sheets['ใบเบิกสินค้า'].data.get('7,7').v = 'อนุมัติ'; /* RESTORE-001 paid -> approved */ },
  'missing intent': (b, p) => { Object.keys(p).filter(k => k.startsWith('REQ_ISSUE_V1_')).forEach(k => delete p[k]); }
};
for (const [name, mutate] of Object.entries(diffCases)) test('RB-3 equality detects drift: ' + name, () => {
  const src = runtime();
  src.ctx.phaseB08RestorePrepareIssueOnce();
  const before = snapshotOf(src);
  let r;
  try { r = restoreRuntime(src, {mutate}); } catch (e) { throw e; }
  let after;
  try { after = snapshotOf(r); } catch (e) { assert.match(e.message, STOP); return; } // guard caught it first
  const cmp = r.ctx.b08CompareSnapshots_(before, after);
  assert.equal(cmp.equal, false);
  assert.ok(cmp.diffs.length >= 1);
});

test('RB-5 negative restore without intents fails closed with zero writes', () => {
  const src = runtime();
  src.ctx.phaseB08RestorePrepareIssueOnce();
  const r = restoreRuntime(src, {withIntents: false});
  const res = r.ctx.phaseB08RestoreNegativeOnce();
  assert.equal(res.status, 'PHASEB08_RESTORE_NEGATIVE_FAIL_CLOSED_PASS');
  assert.match(res.error, /manual review/);
  assert.equal(r.writes.length, 0);
});

test('RB role separation: validation mutation refused in TEST project; prepare refused in RESTORE project', () => {
  const t = runtime();
  assert.throws(() => t.ctx.phaseB08RestoreValidateOnce(), /only in a RESTORE project/);
  const src = runtime(); src.ctx.phaseB08RestorePrepareIssueOnce();
  const r = restoreRuntime(src);
  assert.throws(() => r.ctx.phaseB08RestorePrepareIssueOnce(), STOP);
});

test('evidence helpers refuse keys outside the PHASEB08_ namespace', () => {
  const t = runtime();
  assert.throws(() => t.ctx.b08SetEvidence_('REQ_ISSUE_V1_' + req('PC-001'), 'x'), STOP);
  assert.throws(() => t.ctx.b08DeleteEvidence_('KAIDEE_B08_TARGET_ID'), STOP);
  assert.equal(t.props.KAIDEE_B08_TARGET_ID, IDS.target);
});

/* ---------- Review corrections: F-1, M8, M4, M14 ---------- */

test('F-1 savePdf (every docType) and doGet fail closed in the bundle with no Drive/Html service present', () => {
  const t = runtime();
  assert.equal(typeof t.ctx.DriveApp, 'undefined');
  assert.equal(typeof t.ctx.HtmlService, 'undefined');
  for (const docType of ['stock', 'quote', 'req', undefined])
    assert.throws(() => t.ctx.savePdf('X', 'none', 'JVBERi0xLjQK', docType), /PHASEB08_STOP: PDF export and file sharing disabled/);
  assert.throws(() => t.ctx.doGet(), /PHASEB08_STOP: web entry disabled/);
  assert.equal(t.writes.length, 0);
  assert.deepEqual(t.opened, [], 'stubs never reach stagingDb_/openById');
});

test('F-1 runtime attestation rejects an editor copy whose savePdf is not neutralized', () => {
  const t = runtime();
  // Simulates an owner pasting the ORIGINAL Code.gs savePdf back into the disposable project.
  t.ctx.savePdf = function savePdf(no, vatMode, b64, docType) { return DriveApp.getFoldersByName(no); };
  assert.throws(() => t.ctx.phaseB08ValidateReadOnly(), /attestation mismatch: savePdf/);
  assert.throws(() => t.ctx.phaseB08PartialCommitFaultOnce(), /attestation mismatch: savePdf/);
  assert.equal(t.props.PHASEB08_ARM, undefined);
  assert.equal(t.writes.length, 0);
});

test('M8 regression: AFTER_ACTIVATE fault is exactly activation -> disarm -> flush -> lock release, then no writes', () => {
  const t = runtime();
  t.ctx.phaseB08PartialCommitFaultOnce();
  const i = t.timeline.findIndex(e => e[0] === 'write' && e[1] === 'บันทึกรับ-จ่าย' && e[3] === 2);
  assert.ok(i >= 0, 'activation write observed');
  const activations = t.timeline.filter(e => e[0] === 'write' && e[3] === 2);
  assert.equal(activations.length, 1, 'only the first line was activated');
  assert.deepEqual(JSON.parse(JSON.stringify(t.timeline.slice(i, i + 4))), [
    ['write', 'บันทึกรับ-จ่าย', 4, 2, 'จ่ายออก'],
    ['deleteProperty', 'PHASEB08_ARM'],
    ['flush'],
    ['release']
  ]);
  assert.deepEqual(t.timeline.slice(i + 4).filter(e => e[0] === 'write' || e[0] === 'flush'), [],
    'no sheet write or flush after the simulated fault in this execution');
});

// Defense-in-depth: remove individual layers in memory and show which layer stops the threat.
const L = {
  configDeny: ["  if (deny.indexOf(targetSha) >= 0 || deny.indexOf(scriptSha) >= 0) b08Stop_('configured identity is denylisted');\n", 'adapter'],
  identityEq: ["  if (scriptSha !== cfg.scriptSha) b08Stop_('project identity mismatch');\n", 'adapter'],
  runtimeDeny: ["  if (cfg.deny.indexOf(scriptSha) >= 0) b08Stop_('running inside a denylisted project');\n", 'adapter'],
  binding: ["  if (head[1][0] !== B08.bindPrefix + who.run + '|' + who.scriptSha) b08Stop_('sheet->project binding mismatch');\n", 'adapter'],
  deleteReread: ["  if (props.getProperty(key) !== null) b08Stop_('could not delete ' + key);\n", 'runner'],
  postFaultArm: ["  if (props.getProperty(B08_ARM) !== null) b08Stop_('fault still armed');\n", 'runner'],
  prepareArm: ["  if (PropertiesService.getScriptProperties().getProperty(B08_ARM)) b08Stop_('arm already present');\n", 'runner']
};
const without = (...names) => src => names.forEach(n => {
  const [line, file] = L[n];
  assert.equal(src[file].split(line).length - 1, 1, 'layer anchor ' + n);
  src[file] = src[file].replace(line, '');
});

test('M4 layers — threat A: bundle + properties copied into the denylisted B07 project', () => {
  const run = (...rm) => { const t = runtime({scriptId: IDS.b07, transform: without(...rm)}); let e = null;
    try { t.ctx.phaseB08ValidateReadOnly(); } catch (x) { e = x.message; } return {e, t}; };
  assert.match(run().e, /running inside a denylisted project/, 'intact: runtime denylist (M4 layer) fires FIRST');
  assert.match(run('runtimeDeny').e, /project identity mismatch/, 'without M4 layer: identity equality stops it');
  assert.match(run('identityEq').e, /running inside a denylisted project/);
  assert.match(run('runtimeDeny', 'identityEq').e, /sheet->project binding mismatch/, 'binding A2 is the last layer');
  const none = run('runtimeDeny', 'identityEq', 'binding');
  assert.equal(none.e, null, 'with all three removed the threat is NOT stopped — each layer is load-bearing');
});

test('M4 layers — threat B: operator sets SCRIPT_SHA256 to the denylisted B07 project hash', () => {
  const props = () => baseProps({KAIDEE_B08_SCRIPT_SHA256: sha(IDS.b07)});
  const run = (...rm) => { const t = runtime({scriptId: IDS.b07, props: props(), transform: without(...rm)}); let e = null;
    try { t.ctx.phaseB08ValidateReadOnly(); } catch (x) { e = x.message; } assert.equal(t.writes.length, 0); return e; };
  assert.match(run(), /configured identity is denylisted/);
  assert.match(run('configDeny'), /running inside a denylisted project/, 'M4 layer is responsible when config check is absent');
  assert.match(run('configDeny', 'runtimeDeny'), /sheet->project binding mismatch/);
  assert.equal(run('configDeny', 'runtimeDeny', 'binding'), null);
});

test('M14 layers — threat: Script Properties silently fails to delete the arm (one-shot broken)', () => {
  const run = (...rm) => runtime({stickyKeys: ['PHASEB08_ARM'], transform: without(...rm)});
  let t = run();
  assert.throws(() => t.ctx.phaseB08PropBeforeWriteOnce(), /expected simulated fault NOT observed \(PHASEB08_STOP: could not delete PHASEB08_ARM\)/,
    'intact: delete re-read in b08DeleteEvidence_ fires inside the hook, before the marker');
  assert.equal(t.props['REQ_ISSUE_V1_' + req('PROP-002')], undefined);
  assert.equal(t.writes.length, 0);
  t = run('deleteReread');
  assert.throws(() => t.ctx.phaseB08PropBeforeWriteOnce(), /fault still armed/, 'without re-read: runner post-fault check (M14 layer) fires');
  t = run('deleteReread', 'postFaultArm');
  assert.equal(t.ctx.phaseB08PropBeforeWriteOnce().status, 'PHASEB08_PROP_FAULT_PASS', 'both removed: stale arm goes unnoticed…');
  assert.throws(() => t.ctx.phaseB08PropIssueAfterFault2(), /arm already present/, '…until the next prepare refuses to run');
  t = run('deleteReread', 'postFaultArm', 'prepareArm');
  t.ctx.phaseB08PropBeforeWriteOnce();
  assert.throws(() => t.ctx.phaseB08PropIssueAfterFault2(), /PHASEB08_SIMULATED_FAULT:BEFORE_INTENT_WRITE/,
    'all three removed: the retry is hit by an unintended second fault');
});

test('F-1 layers: stub-content check stops an un-neutralized savePdf even if the hash layer is removed', () => {
  const t = runtime({transform: src => {
    const fnList = 'phaseB08Fault_, savePdf, doGet};';
    assert.equal(src.runner.split(fnList).length - 1, 1);
    src.runner = src.runner.replace(fnList, 'phaseB08Fault_};');
  }});
  t.ctx.savePdf = function savePdf(no) { return DriveApp.getFoldersByName(no); };
  assert.throws(() => t.ctx.phaseB08ValidateReadOnly(), /PDF\/web entry point is not neutralized/);
  assert.equal(t.writes.length, 0);
});

/* ---------- Review r2 findings: F-5 relationships, F-6 formula values, F-7 stale arm ---------- */

const P = 'QA-DISP-' + RUN + '-';
const setRow = (sheet, row, vals) => vals.forEach((v, j) => { if (v !== undefined) sheet.data.set(row + ',' + (j + 1), {v, f: ''}); });
function ledgerRow(b, row, {type = 'จ่ายออก', code, qty, id, doc}) {
  const L = b.sheets['บันทึกรับ-จ่าย'];
  setRow(L, row, [new Date('2026-10-31T03:00:00Z'), type, code, undefined, qty, undefined, 5, undefined, 'qa', 'x', id, undefined, undefined, doc]);
}
const intentFor = (key, lines, o = {}) => JSON.stringify(Object.assign({version: 1, doc: P + 'RQ-' + key,
  shape: lines.map(([code, qty], i) => ({id: 'REQ-' + P + key + '-' + (i + 1), line: P + key + '-L' + (i + 1), code, qty})),
  who: 'qa', at: '2026-10-31T03:00:00.000Z', prices: lines.map(() => 5)}, o));

const f5Cases = {
  'orphan line referencing an unknown request': [b => setRow(b.sheets['รายการใบเบิก'], 10, [P + 'PC-099-L1', P + 'PC-099', 'QA-012', 1, '']), /orphan line .*PC-099-L1 references unknown requisition/],
  'extra line with blank SKU (invisible to readReqs_)': [b => setRow(b.sheets['รายการใบเบิก'], 10, [P + 'LOCK-001-L2', P + 'LOCK-001', '', 1, '']), /line payload mismatch .*LOCK-001/],
  'line without RequestID': [b => setRow(b.sheets['รายการใบเบิก'], 10, ['X-L1', '', 'QA-012', 1, '']), /line without LineID\/RequestID at row 10/],
  'duplicate LineID': [b => setRow(b.sheets['รายการใบเบิก'], 10, [P + 'LOCK-001-L1', P + 'LOCK-001', 'QA-020', 1, '']), /duplicate LineID/],
  'ID-less header content': [b => setRow(b.sheets['ใบเบิกสินค้า'], 9, ['', '', '', '', '', 'note']), /unknown or ID-less requisition header at row 9/],
  'duplicate header': [b => setRow(b.sheets['ใบเบิกสินค้า'], 9, [P + 'LOCK-001', P + 'RQ-LOCK-001', '', 'qa', 'qa', 'qa', 'อนุมัติ']), /duplicate requisition ID/],
  'missing fixture request': [b => setRow(b.sheets['ใบเบิกสินค้า'], 8, ['', '', '', '', '', '', '']), /orphan line .*RESTORE-002-L1|missing fixture requisition RESTORE-002/],
  'fixture request removed together with its line': [b => { setRow(b.sheets['ใบเบิกสินค้า'], 8, ['', '', '', '', '', '', '']); setRow(b.sheets['รายการใบเบิก'], 9, ['', '', '', '', '']); }, /missing fixture requisition RESTORE-002/],
  'unknown extra request with a valid prefix': [b => { setRow(b.sheets['ใบเบิกสินค้า'], 9, [P + 'PC-002', P + 'RQ-PC-002', '', 'qa', 'qa', 'qa', 'อนุมัติ']); }, /unknown or ID-less requisition header at row 9/],
  'valid-prefix orphan movement (passes the old regex)': [b => ledgerRow(b, 4, {code: 'QA-012', qty: 1, id: 'REQ-' + P + 'PC-099-1', doc: P + 'RQ-PC-099'}), /movement REQ-.*PC-099-1 references unknown requisition/],
  'movement for a non-existent line index': [b => ledgerRow(b, 4, {code: 'QA-020', qty: 1, id: 'REQ-' + P + 'LOCK-001-2', doc: P + 'RQ-LOCK-001'}), /references unknown line/],
  'movement payload differs from its line': [b => ledgerRow(b, 4, {code: 'QA-020', qty: 5, id: 'REQ-' + P + 'LOCK-001-1', doc: P + 'RQ-LOCK-001'}), /does not match its header\/line/],
  'movement with wrong document number': [b => ledgerRow(b, 4, {code: 'QA-020', qty: 1, id: 'REQ-' + P + 'LOCK-001-1', doc: P + 'RQ-LOCK-002'}), /does not match its header\/line/],
  'prepared movement without intent': [b => ledgerRow(b, 4, {type: '', code: 'QA-020', qty: 1, id: 'REQ-' + P + 'LOCK-001-1', doc: P + 'RQ-LOCK-001'}), /ledger\/paid state without intent/],
  'duplicate movement ID': [b => { const m = {type: '', code: 'QA-020', qty: 1, id: 'REQ-' + P + 'LOCK-001-1', doc: P + 'RQ-LOCK-001'}; ledgerRow(b, 4, m); ledgerRow(b, 5, m); }, /duplicate MovementID/],
  'orphan intent with a valid key prefix': [(b, p) => { p['REQ_ISSUE_V1_' + P + 'PC-099'] = '{}'; }, /intent without requisition/],
  'intent that disagrees with its lines': [(b, p) => { p['REQ_ISSUE_V1_' + P + 'LOCK-001'] = intentFor('LOCK-001', [['QA-020', 9]]); }, /intent does not match header\/lines/],
  'paid header with incomplete ledger': [(b, p) => { b.sheets['ใบเบิกสินค้า'].data.get('3,7').v = 'จ่ายแล้ว'; p['REQ_ISSUE_V1_' + P + 'LOCK-001'] = intentFor('LOCK-001', [['QA-020', 1]]); }, /paid requisition with incomplete ledger/]
};
for (const [name, [mutate, re]] of Object.entries(f5Cases)) test('F-5 readiness STOPs: ' + name, () => {
  const book = seed(), props = baseProps();
  mutate(book, props);
  const t = runtime({book, props});
  assert.throws(() => t.ctx.phaseB08ValidateReadOnly(), re);
  assert.throws(() => t.ctx.phaseB08PartialCommitFaultOnce(), STOP);
  assert.equal(t.writes.length, 0);
  assert.equal(t.props.PHASEB08_ARM, undefined);
});

test('F-5 legitimate partial-commit state (active 1 + prepared 1 + intent) still passes the relationship guard', () => {
  const t = runtime();
  t.ctx.phaseB08PartialCommitFaultOnce();
  const r = t.ctx.phaseB08PartialCommitReadback();
  assert.equal(r.status, 'PHASEB08_PC_READBACK_PASS');
});

test('F-6 snapshot keeps formula text AND calculated value for H cells', () => {
  const t = runtime();
  t.ctx.phaseB08PartialCommitFaultOnce(); t.ctx.phaseB08PartialCommitReadback(); t.ctx.phaseB08PartialCommitRecoverOnce();
  const s = JSON.parse(JSON.stringify(t.ctx.b08Snapshot_()));
  assert.match(s.business.inventory[16][7].f, /^=SUMIFS\(/);  // row 17 = QA-010
  assert.equal(s.business.inventory[16][7].v, 2);
  assert.equal(s.business.inventory[17][7].v, 3);           // row 18 = QA-011
  assert.equal(s.reconciliation.mismatches.length, 0);
  assert.equal(s.reconciliation.totalIssued, 5);
  const ready = t.ctx.phaseB08ValidateReadOnly();
  assert.equal(ready.reconciliation.checked, 52);
  assert.equal(ready.reconciliation.totalIssued, 5);
});

test('F-6 H8 value 999 with the SAME formula: readiness STOPs and the comparator reports value drift', () => {
  const t = runtime();
  const before = JSON.parse(JSON.stringify(t.ctx.b08Snapshot_()));
  const cell = t.book.sheets['คลังสินค้า'].data.get('8,8');
  t.book.sheets['คลังสินค้า'].data.set('8,8', {f: cell.f, v: 999, pin: true});
  assert.equal(t.book.sheets['คลังสินค้า'].getRange(8, 8).getFormula(), cell.f, 'formula text unchanged');
  assert.throws(() => t.ctx.phaseB08ValidateReadOnly(), /52-SKU reconciliation failed: H value drift row 8 QA-001 sheet=999 ledger=0/);
  assert.throws(() => t.ctx.phaseB08PartialCommitFaultOnce(), /52-SKU reconciliation failed/);
  const after = JSON.parse(JSON.stringify(t.ctx.b08Snapshot_()));
  const cmp = t.ctx.b08CompareSnapshots_(before, after);
  assert.equal(cmp.equal, false);
  // I8 = F8+G8-H8 recalculates from the drifted H8 (as Sheets would), so both calculated values differ.
  assert.deepEqual([...cmp.diffs], ['/inventory/7/7/v', '/inventory/7/8/v']);
  assert.ok(after.reconciliation.mismatches.some(m => /H value drift row 8/.test(m)));
  assert.equal(t.writes.length, 0);
});

test('F-6 non-numeric calculated H value STOPs readiness', () => {
  const book = seed();
  const c = book.sheets['คลังสินค้า'].data.get('30,8');
  book.sheets['คลังสินค้า'].data.set('30,8', {f: c.f, v: '#REF!', pin: true});
  const t = runtime({book});
  assert.throws(() => t.ctx.phaseB08ValidateReadOnly(), /row 30 G\/H\/I not numeric/);
});

test('F-6 restore equality detects formula-value drift in the clone even with identical formula text', () => {
  const src = runtime();
  src.ctx.phaseB08RestorePrepareIssueOnce();
  const before = snapshotOf(src);
  const r = restoreRuntime(src, {mutate: b => { const c = b.sheets['คลังสินค้า'].data.get('47,8'); b.sheets['คลังสินค้า'].data.set('47,8', {f: c.f, v: 0, pin: true}); }});
  const after = snapshotOf(r);
  assert.equal(after.business.inventory[46][7].f, before.business.inventory[46][7].f);
  const cmp = r.ctx.b08CompareSnapshots_(before, after);
  assert.deepEqual([...cmp.diffs], ['/inventory/46/7/v', '/inventory/46/8/v']);
  assert.throws(() => r.ctx.phaseB08RestoreValidateOnce(), /52-SKU reconciliation failed: H value drift row 47 QA-040 sheet=0 ledger=2/);
});

test('F-7 readiness reports the real arm state: stale PHASEB08_ARM is a STOP, never armed:false', () => {
  const arm = JSON.stringify({point: 'AFTER_ACTIVATE', reqId: P + 'PC-001', run: RUN, armedAt: '2026-10-31T02:00:00.000Z'});
  const t = runtime({props: baseProps({PHASEB08_ARM: arm})});
  assert.throws(() => t.ctx.phaseB08ValidateReadOnly(), /stale PHASEB08_ARM present .*AFTER_ACTIVATE.*PC-001/);
  assert.equal(t.props.PHASEB08_ARM, arm, 'arm preserved as evidence, not deleted by readiness');
  assert.equal(t.writes.length, 0);
  assert.equal(t.log.filter(e => e[0] === 'log').length, 0, 'no READY log emitted');
});

test('F-7 readiness without arm reports armed:false and lists real evidence keys', () => {
  const t = runtime({props: baseProps({PHASEB08_LOCK_A: '{}'})});
  const r = t.ctx.phaseB08ValidateReadOnly();
  assert.equal(r.armed, false);
  assert.deepEqual([...r.evidenceKeys], ['PHASEB08_LOCK_A']);
});

test('F-5/F-6/F-7 guards are runtime-attested: a weakened editor copy STOPs before any run', () => {
  for (const [name, weak] of [
    ['b08FixtureGuard_', function b08FixtureGuard_() { return {reqs: [], moveCount: 0, formula: 'X', reconciliation: {checked: 52, mismatches: [], totalIssued: 0}}; }],
    ['b08Reconcile52_', function b08Reconcile52_() { return {checked: 52, mismatches: [], totalIssued: 0}; }],
    ['b08Cell_', function b08Cell_(v, f) { return f ? {f} : v; }],
    ['phaseB08ValidateReadOnly', function phaseB08ValidateReadOnly() { return {armed: false}; }]]) {
    const t = runtime();
    t.ctx[name] = weak;
    assert.throws(() => t.ctx.phaseB08PartialCommitFaultOnce(), new RegExp('attestation mismatch: ' + name));
    assert.equal(t.props.PHASEB08_ARM, undefined);
  }
});

test('F-7 TOCTOU: an arm that appears DURING readiness is a STOP, not a READY with armed:false', () => {
  const t = runtime();
  const audit = t.ctx.stockFormulaAudit_; // not attested; used only to inject a concurrent arm mid-readiness
  t.ctx.stockFormulaAudit_ = function () {
    t.props.PHASEB08_ARM = JSON.stringify({point: 'BEFORE_INTENT_WRITE', reqId: P + 'PROP-002', run: RUN});
    return audit();
  };
  assert.throws(() => t.ctx.phaseB08ValidateReadOnly(), /PHASEB08_ARM appeared during readiness .*BEFORE_INTENT_WRITE/);
  assert.equal(t.log.filter(e => e[0] === 'log').length, 0, 'no READY log emitted');
  assert.equal(t.writes.length, 0);
});

/* ---------- Review r3 finding F-8: inventory F/G/I drift (approved schema F=100, G/H SUMIFS, I=F+G-H) ---------- */

const invSet = (b, r, c, cell) => b.sheets['คลังสินค้า'].data.set(r + ',' + c, cell);
const f8Cases = {
  'F8 = 777 (reviewer case)': [b => invSet(b, 8, 6, {v: 777, f: ''}), /F opening drift row 8 QA-001 sheet=777 expected=100/],
  'F8 replaced by a formula =100': [b => invSet(b, 8, 6, {v: 100, f: '=100'}), /F opening drift row 8 QA-001 sheet==100 expected=100/],
  'F30 blank': [b => invSet(b, 30, 6, {v: '', f: ''}), /F opening drift row 30 QA-023/],
  'G8 = 9 as a constant (reviewer case; formula overwritten)': [b => invSet(b, 8, 7, {v: 9, f: ''}), /G formula drift row 8 QA-001/],
  'G8 calculated 9 with the SAME formula': [b => invSet(b, 8, 7, {v: 9, f: Gf(8), pin: true}), /G value drift row 8 QA-001 sheet=9 ledger=0/],
  'G8 formula counts issues instead of receipts': [b => invSet(b, 8, 7, {v: '', f: Gf(8).replace('รับเข้า', 'จ่ายออก')}), /G formula drift row 8/],
  'I8 = 999 as a constant (reviewer case; formula overwritten)': [b => invSet(b, 8, 9, {v: 999, f: ''}), /I formula drift row 8 QA-001/],
  'I8 calculated 999 with the SAME formula': [b => invSet(b, 8, 9, {v: 999, f: If(8), pin: true}), /I value drift row 8 QA-001 sheet=999 F\+G-H=100/],
  'I8 formula drops the H term': [b => invSet(b, 8, 9, {v: '', f: '=F8+G8'}), /I formula drift row 8/],
  'I8 formula references another row': [b => invSet(b, 8, 9, {v: '', f: If(9)}), /I formula drift row 8/],
  'G40 non-numeric': [b => invSet(b, 40, 7, {v: '#N/A', f: Gf(40), pin: true}), /row 40 G\/H\/I not numeric/]
};
for (const [name, [mutate, re]] of Object.entries(f8Cases)) test('F-8 readiness STOPs on inventory drift: ' + name, () => {
  const book = seed();
  mutate(book);
  const t = runtime({book});
  assert.throws(() => t.ctx.phaseB08ValidateReadOnly(), re);
  assert.throws(() => t.ctx.phaseB08PartialCommitFaultOnce(), /52-SKU reconciliation failed/);
  assert.equal(t.writes.length, 0);
  assert.equal(t.props.PHASEB08_ARM, undefined);
});

test('F-8 valid baseline: 52/52 F=100, G=0, H=0, I=100 with approved formula text', () => {
  const t = runtime();
  const r = t.ctx.phaseB08ValidateReadOnly();
  assert.equal(r.status, 'PHASEB08_READY_READ_ONLY');
  const inv = JSON.parse(JSON.stringify(t.ctx.b08Snapshot_())).business.inventory;
  for (let i = 7; i < 59; i++) {
    assert.equal(inv[i][5], 100);
    assert.deepEqual([inv[i][6].v, inv[i][7].v, inv[i][8].v], [0, 0, 100]);
    assert.equal(inv[i][8].f, '=F' + (i + 1) + '+G' + (i + 1) + '-H' + (i + 1));
  }
});

test('F-8 valid after issues: I tracks F+G-H and the ledger (QA-010 98, QA-011 97, QA-020 99)', () => {
  const t = runtime();
  t.ctx.phaseB08PartialCommitFaultOnce(); t.ctx.phaseB08PartialCommitReadback(); t.ctx.phaseB08PartialCommitRecoverOnce();
  t.ctx.phaseB08LockIssueAfterRelease();
  const r = t.ctx.phaseB08ValidateReadOnly();
  assert.equal(r.reconciliation.totalIssued, 6);
  const inv = JSON.parse(JSON.stringify(t.ctx.b08Snapshot_())).business.inventory;
  assert.deepEqual([inv[16][8].v, inv[17][8].v, inv[26][8].v], [98, 97, 99]); // rows 17, 18, 27
});

test('F-8 valid: formula whitespace/case outside quotes is accepted (same normalization as stockFormulaAudit_)', () => {
  const book = seed();
  invSet(book, 8, 7, {v: '', f: Gf(8).replace(/,/g, ', ').replace('=SUMIFS', '=sumifs')});
  invSet(book, 8, 9, {v: '', f: '= F8 + G8 - H8'});
  const t = runtime({book});
  assert.equal(t.ctx.phaseB08ValidateReadOnly().status, 'PHASEB08_READY_READ_ONLY');
});

test('F-8 restore equality detects F/G/I drift in the clone', () => {
  const src = runtime();
  src.ctx.phaseB08RestorePrepareIssueOnce();
  const before = snapshotOf(src);
  const r = restoreRuntime(src, {mutate: b => { invSet(b, 20, 6, {v: 101, f: ''}); }});
  const cmp = r.ctx.b08CompareSnapshots_(before, snapshotOf(r));
  assert.deepEqual([...cmp.diffs], ['/inventory/19/5', '/inventory/19/8/v']);
  assert.throws(() => r.ctx.phaseB08RestoreValidateOnce(), /F opening drift row 20/);
});

test('F-8 layers: ledger-balance check still stops I drift when the I=F+G-H value check is removed', () => {
  const iLine = "    if (I !== F + G - Hv) mismatches.push('I value drift row ' + row + ' ' + code + ' sheet=' + I + ' F+G-H=' + (F + G - Hv));\n";
  const book = seed();
  invSet(book, 8, 9, {v: 999, f: If(8), pin: true});
  const t = runtime({book, transform: src => {
    assert.equal(src.adapter.split(iLine).length - 1, 1, 'layer anchor');
    src.adapter = src.adapter.replace(iLine, '');
  }});
  assert.throws(() => t.ctx.phaseB08ValidateReadOnly(), /balance drift row 8 QA-001 sheet=999 ledger=100/);
  assert.equal(t.writes.length, 0);
});

test('test identity is admin@example.test in the sandbox only; the real Code.gs Admin allowlist is untouched', () => {
  const {TEST_ADMIN} = require('./helpers/b08-sheets-double');
  assert.equal(TEST_ADMIN, 'admin@example.test');
  const t = runtime();
  assert.equal(t.ctx.Session.getActiveUser().getEmail(), TEST_ADMIN);
  assert.equal(t.ctx.role_(), 'admin', 'real role_/isAdmin_ chain grants admin via the sandbox allowlist');
  // Evaluate the UNMODIFIED Code.gs admins_() in a fresh context: the test address must not be a real Admin.
  const vm = require('node:vm'), ctx = {};
  vm.createContext(ctx);
  vm.runInContext(require('node:fs').readFileSync('apps-script/Code.gs', 'utf8') + ';globalThis.__a=admins_();', ctx);
  assert.ok(ctx.__a.length >= 1 && !ctx.__a.includes(TEST_ADMIN), 'production Admin list does not contain the test address');
});
