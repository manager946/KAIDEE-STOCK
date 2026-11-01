'use strict';
// B08-1 seeder, pre-seed guard, seed state machine and identity preflight — OFFLINE only.
// Executes the generated SEED / RUNNER bundles against in-memory doubles. No Google access.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {runtime, seed, baseProps, preSeedProps, blankBook, makeSheet, sha, IDS, RUN, TEST_ADMIN} = require('./helpers/b08-sheets-double');

const STOP = /PHASEB08_STOP/;
const P = 'QA-DISP-' + RUN + '-';
const plain = x => JSON.parse(JSON.stringify(x));
const constIn = (t, expr) => plain(vm.runInContext(expr, t.ctx));

/* ---------- F-10: independent literal fixture (NOT derived from B08_FIXTURE or the generator) ---------- */
const EXPECTED = [
  ['PC-001', [['QA-010', 2], ['QA-011', 3]]],
  ['LOCK-001', [['QA-020', 1]]],
  ['LOCK-002', [['QA-021', 1]]],
  ['PROP-001', [['QA-030', 1]]],
  ['PROP-002', [['QA-031', 1]]],
  ['RESTORE-001', [['QA-040', 2]]],
  ['RESTORE-002', [['QA-041', 1]]]
];
const EXPECTED_HEADERS = EXPECTED.map(([k]) => [P + k, P + 'RQ-' + k, 'อนุมัติ']);
const EXPECTED_LINES = [
  [P + 'PC-001-L1', P + 'PC-001', 'QA-010', 2],
  [P + 'PC-001-L2', P + 'PC-001', 'QA-011', 3],
  [P + 'LOCK-001-L1', P + 'LOCK-001', 'QA-020', 1],
  [P + 'LOCK-002-L1', P + 'LOCK-002', 'QA-021', 1],
  [P + 'PROP-001-L1', P + 'PROP-001', 'QA-030', 1],
  [P + 'PROP-002-L1', P + 'PROP-002', 'QA-031', 1],
  [P + 'RESTORE-001-L1', P + 'RESTORE-001', 'QA-040', 2],
  [P + 'RESTORE-002-L1', P + 'RESTORE-002', 'QA-041', 1]
];
const cell = (b, tab, r, c) => (b.sheets[tab].data.get(r + ',' + c) || {v: '', f: ''});
const rawHeaders = b => { const out = []; for (let r = 2; r <= b.sheets['ใบเบิกสินค้า'].getLastRow(); r++)
  out.push([cell(b, 'ใบเบิกสินค้า', r, 1).v, cell(b, 'ใบเบิกสินค้า', r, 2).v, cell(b, 'ใบเบิกสินค้า', r, 7).v]); return out; };
const rawLines = b => { const out = []; for (let r = 2; r <= b.sheets['รายการใบเบิก'].getLastRow(); r++)
  out.push([1, 2, 3, 4].map(c => cell(b, 'รายการใบเบิก', r, c).v)); return out; };

function seedRun(o = {}) {
  return runtime(Object.assign({seedBundle: true, book: blankBook(), props: preSeedProps()}, o));
}
function seededPair() {
  const s = seedRun();
  const r = s.ctx.phaseB08SeedDisposableOnce();
  // Owner deletes the seeder file and installs the RUNNER identity: same workbook + properties.
  const runner = runtime({book: s.book, props: s.props});
  runner.opened.length = 0;
  return {s, r, runner};
}

test('F-10 literal fixture: 7 headers, 8 lines, 52 SKUs, 0 movements (counts derived from the literal only)', () => {
  assert.equal(EXPECTED.length, 7);
  assert.equal(EXPECTED.reduce((n, [, l]) => n + l.length, 0), 8);
  assert.equal(EXPECTED_LINES.length, 8);
});

test('F-10 adapter B08_FIXTURE equals the independent literal (order, SKU, qty)', () => {
  const t = runtime();
  assert.deepEqual(Object.entries(constIn(t, 'B08_FIXTURE')), EXPECTED);
});

test('F-10 seeder layout equals the literal: request IDs, doc numbers, status, line IDs, SKU, qty, order', () => {
  const t = seedRun();
  const L = plain(t.ctx.b08SeedLayout_(RUN, sha(IDS.script)));
  assert.deepEqual(L.rq.slice(1).map(r => [r[0], r[1], r[6]]), EXPECTED_HEADERS);
  assert.deepEqual(L.ln.slice(1).map(r => r.slice(0, 4)), EXPECTED_LINES);
  const skus = L.inv.slice(7, 59);
  assert.equal(skus.length, 52);
  skus.forEach((r, i) => {
    assert.equal(r[0], 'QA-' + String(i + 1).padStart(3, '0'));
    assert.deepEqual([r[4], r[5], r[9]], [10, 100, 5]);
  });
  assert.deepEqual(L.invFormulas[0], ["=SUMIFS('บันทึกรับ-จ่าย'!$E:$E,'บันทึกรับ-จ่าย'!$C:$C,A8,'บันทึกรับ-จ่าย'!$B:$B,\"รับเข้า\")",
    "=SUMIFS('บันทึกรับ-จ่าย'!$E:$E,'บันทึกรับ-จ่าย'!$C:$C,A8,'บันทึกรับ-จ่าย'!$B:$B,\"จ่ายออก\")", '=F8+G8-H8']);
  assert.equal(L.invFormulas[51][2], '=F59+G59-H59');
});

test('F-10 seeded workbook (raw cells) and the runner test fixture both equal the literal', () => {
  const {s} = seededPair();
  assert.deepEqual(rawHeaders(s.book), EXPECTED_HEADERS);
  assert.deepEqual(rawLines(s.book), EXPECTED_LINES);
  assert.equal(s.book.sheets['บันทึกรับ-จ่าย'].getLastRow(), 3, 'ledger has only its header row: 0 movements');
  const fixture = seed();
  assert.deepEqual(rawHeaders(fixture), EXPECTED_HEADERS);
  assert.deepEqual(rawLines(fixture), EXPECTED_LINES);
});

/* ---------- F-9: pre-seed identity guard ---------- */

test('F-9 seed preflight on a blank, correctly bound target: READY with zero writes', () => {
  const t = seedRun();
  const r = t.ctx.phaseB08SeedPreflightReadOnly();
  assert.equal(r.status, 'PHASEB08_SEED_PREFLIGHT_READY_READ_ONLY');
  assert.deepEqual(plain(r.plan), {tabs: 4, headers: 7, lines: 8, skus: 52, movements: 0});
  assert.equal(t.writes.length, 0);
  assert.deepEqual(t.structure, []);
  assert.deepEqual(Object.keys(t.props).filter(k => /^PHASEB08_|^REQ_ISSUE/.test(k)), []);
  assert.ok(t.opened.every(id => id === IDS.target));
});

const f9 = {
  'wrong target (hash mismatch)': () => ({props: preSeedProps({KAIDEE_B08_TARGET_SHA256: sha('someOtherSheet_0000000001')})}),
  'protected target configured (STAGING in denylist)': () => ({props: preSeedProps({KAIDEE_B08_TARGET_ID: IDS.staging, KAIDEE_B08_TARGET_SHA256: sha(IDS.staging)})}),
  'protected target configured (synthetic QA STEP8-15)': () => ({props: preSeedProps({KAIDEE_B08_TARGET_ID: IDS.qaOld, KAIDEE_B08_TARGET_SHA256: sha(IDS.qaOld)})}),
  'wrong project identity': () => ({scriptId: 'someOtherProject_000000001'}),
  'running inside the B07 project': () => ({scriptId: IDS.b07}),
  'target title mismatch': () => ({book: blankBook({title: 'Untitled spreadsheet'})}),
  'target title is the protected QA title': () => ({book: blankBook({title: 'KAIDEE-STOCK-SYNTHETIC-QA-STEP8-15'})}),
  'workbook not blank: value in A1': () => { const b = blankBook(); b.sheets['แผ่น1'].data.set('1,1', {v: 'x', f: ''}); return {book: b}; },
  'workbook not blank: formula far right': () => { const b = blankBook(); b.sheets['แผ่น1'].data.set('1,26', {v: '', f: '=1'}); return {book: b}; },
  'workbook not blank: second sheet': () => { const b = blankBook(); b.sheets['Sheet2'] = makeSheet('Sheet2'); return {book: b}; },
  'workbook has named ranges': () => ({namedRanges: [{}]}),
  'ROLE=RESTORE': () => ({props: preSeedProps({KAIDEE_B08_ROLE: 'RESTORE', KAIDEE_B08_RESTORE_SEQ: '1'})}),
  'seed state STARTED already present': () => ({props: preSeedProps({PHASEB08_SEED_STATE: 'STARTED'})}),
  'seed state COMPLETED already present': () => ({props: baseProps()}),
  'seed state REVIEW_REQUIRED present': () => ({props: preSeedProps({PHASEB08_SEED_STATE: 'REVIEW_REQUIRED', PHASEB08_SEED_ERROR: 'x'})}),
  'existing intent key': () => ({props: preSeedProps({['REQ_ISSUE_V1_' + P + 'PC-001']: '{}'})}),
  'existing evidence key': () => ({props: preSeedProps({PHASEB08_LOCK_A: '{}'})}),
  'trigger present': () => ({triggers: [{}]}),
  'identity cannot run workflow (empty email)': () => ({email: ''}),
  'identity cannot run workflow (unmodified ADMINS, non-admin test address)': () => ({realAdmins: true}),
  'RUNNER identity installed instead of SEED identity': () => ({identityKind: 'RUNNER'})
};
for (const [name, make] of Object.entries(f9)) test('F-9 pre-seed guard STOPs before any mutation: ' + name, () => {
  const t = seedRun(make());
  const before = JSON.stringify(t.props);
  assert.throws(() => t.ctx.phaseB08SeedPreflightReadOnly(), STOP);
  assert.throws(() => t.ctx.phaseB08SeedDisposableOnce(), STOP);
  assert.equal(t.writes.length, 0);
  assert.deepEqual(t.structure, []);
  assert.equal(JSON.stringify(t.props), before, 'no seed marker or any property written');
  assert.ok(t.opened.every(id => id === IDS.target), 'never opens a non-target ID');
});

test('F-9 seed attestation: a weakened pre-seed guard in the editor copy STOPs before mutation', () => {
  const t = seedRun();
  t.ctx.b08PreSeedGuard_ = function b08PreSeedGuard_() { return {}; };
  assert.throws(() => t.ctx.phaseB08SeedDisposableOnce(), /seed attestation mismatch: b08PreSeedGuard_/);
  assert.throws(() => t.ctx.phaseB08SeedPreflightReadOnly(), /seed attestation mismatch: b08PreSeedGuard_/);
  assert.equal(t.writes.length, 0);
  assert.equal(t.props.PHASEB08_SEED_STATE, undefined, 'no STARTED marker when attestation fails');
});

test('F-9 post-seed stagingDb_() keeps full strictness: a blank workbook is rejected even with COMPLETED state', () => {
  const t = runtime({book: blankBook(), props: baseProps()});
  assert.throws(() => t.ctx.stagingDb_(), /unexpected tabs/);
  assert.throws(() => t.ctx.phaseB08ValidateReadOnly(), STOP);
});

/* ---------- F-11: seed state machine and completion verification ---------- */

test('F-11 seed happy path: STARTED -> COMPLETED only after read-back; structure is rename + 3 inserts, no deletes', () => {
  const {s, r} = seededPair();
  assert.equal(r.status, 'PHASEB08_SEED_COMPLETED');
  assert.equal(s.props.PHASEB08_SEED_STATE, 'COMPLETED');
  const done = JSON.parse(s.props.PHASEB08_SEED_DONE);
  assert.deepEqual([done.run, done.headers, done.lines, done.skus], [RUN, 7, 8, 52]);
  assert.match(done.baselineSha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(plain(s.structure), [['rename', 'แผ่น1', 'คลังสินค้า'], ['insertSheet', 'บันทึกรับ-จ่าย'],
    ['insertSheet', 'ใบเบิกสินค้า'], ['insertSheet', 'รายการใบเบิก']]);
  const order = s.timeline.filter(e => e[0] === 'setProperty').map(e => e[1]);
  assert.deepEqual(order, ['PHASEB08_SEED_STATE', 'PHASEB08_SEED_DONE', 'PHASEB08_SEED_STATE'], 'STARTED, DONE, then COMPLETED');
  assert.equal(s.props.PHASEB08_SEED_ERROR, undefined);
});

test('F-11 post-seed readiness (RUNNER bundle, seeder removed): marker, tabs, 7/8/52, F/G/H/I, 0 movements', () => {
  const {runner, s} = seededPair();
  const r = runner.ctx.phaseB08PostSeedReadinessReadOnly();
  assert.equal(r.status, 'PHASEB08_POST_SEED_READY_READ_ONLY');
  assert.deepEqual(plain(r.fixture), {headers: 7, lines: 8, skus: 52, movements: 0, intents: 0});
  assert.equal(r.baselineSha256, JSON.parse(s.props.PHASEB08_SEED_DONE).baselineSha256);
  assert.equal(runner.ctx.phaseB08ValidateReadOnly().status, 'PHASEB08_READY_READ_ONLY');
  assert.equal(runner.writes.length, 0);
});

test('F-11 runners STOP while the seeder (or a SEED identity) is still installed', () => {
  const {s} = seededPair();
  assert.throws(() => s.ctx.phaseB08ValidateReadOnly(), /bundle identity is not RUNNER/);
  assert.throws(() => s.ctx.phaseB08PartialCommitFaultOnce(), STOP);
  assert.throws(() => s.ctx.phaseB08PartialCommitReadback(), /seeder still installed/);
  // Seeder file still present but RUNNER identity swapped in: still STOP.
  const mixed = runtime({seedBundle: true, identityKind: 'RUNNER', book: s.book, props: s.props});
  assert.throws(() => mixed.ctx.phaseB08ValidateReadOnly(), /seeder still installed/);
  assert.equal(s.props.PHASEB08_ARM, undefined);
});

test('F-11 seeder is one-shot: a second run STOPs with zero writes', () => {
  const {s} = seededPair();
  const n = s.writes.length;
  assert.throws(() => s.ctx.phaseB08SeedDisposableOnce(), /not NOT_STARTED|not blank|exactly one sheet/);
  assert.equal(s.writes.length, n);
  assert.equal(s.props.PHASEB08_SEED_STATE, 'COMPLETED');
});

test('F-11 failure mid-write -> REVIEW_REQUIRED, error kept, no DONE, no automatic reset, runners STOP', () => {
  const t = seedRun();
  const ins = t.ctx.SpreadsheetApp; // inject a service failure on the 2nd insertSheet
  const ss = t.ctx.SpreadsheetApp.openById(IDS.target); t.opened.length = 0;
  let calls = 0; const orig = ss.insertSheet;
  ss.insertSheet = n => { if (++calls === 2) throw new Error('SIMULATED_INSERT_FAILURE'); return orig(n); };
  assert.ok(ins);
  assert.throws(() => t.ctx.phaseB08SeedDisposableOnce(), /seed failed; state REVIEW_REQUIRED, no automatic reset: SIMULATED_INSERT_FAILURE/);
  assert.equal(t.props.PHASEB08_SEED_STATE, 'REVIEW_REQUIRED');
  assert.match(t.props.PHASEB08_SEED_ERROR, /SIMULATED_INSERT_FAILURE/);
  assert.equal(t.props.PHASEB08_SEED_DONE, undefined);
  assert.equal(t.timeline.filter(e => e[0] === 'deleteProperty').length, 0, 'markers never cleared');
  assert.throws(() => t.ctx.phaseB08SeedDisposableOnce(), /not NOT_STARTED/);
  const runner = runtime({book: t.book, props: t.props});
  assert.throws(() => runner.ctx.phaseB08ValidateReadOnly(), /seed error recorded; REVIEW_REQUIRED/);
});

test('F-11 read-back verification failure (wrong data written) -> REVIEW_REQUIRED and no DONE', () => {
  const t = seedRun({transform: src => {
    const a = "inv[row - 1] = ['QA-' + n, 'QA synthetic item ' + n, 'synthetic', 'unit', 10, B08_INV.opening, '', '', '', 5];";
    assert.equal(src.seeder.split(a).length - 1, 1);
    src.seeder = src.seeder.replace(a, a.replace('B08_INV.opening', '(i === 20 ? 99 : B08_INV.opening)'));
  }});
  assert.throws(() => t.ctx.phaseB08SeedDisposableOnce(), /REVIEW_REQUIRED.*F opening drift row 28/);
  assert.equal(t.props.PHASEB08_SEED_STATE, 'REVIEW_REQUIRED');
  assert.equal(t.props.PHASEB08_SEED_DONE, undefined);
});

const stateCases = {
  'STARTED without DONE (crash between writes)': {PHASEB08_SEED_STATE: 'STARTED', PHASEB08_SEED_DONE: undefined},
  'COMPLETED without DONE': {PHASEB08_SEED_DONE: undefined},
  'DONE for another run': {PHASEB08_SEED_DONE: JSON.stringify({run: 'OTHER123', baselineSha256: 'b'.repeat(64), headers: 7, lines: 8, skus: 52})},
  'DONE with wrong line count (9)': {PHASEB08_SEED_DONE: JSON.stringify({run: RUN, baselineSha256: 'b'.repeat(64), headers: 7, lines: 9, skus: 52})},
  'state missing (NOT_STARTED)': {PHASEB08_SEED_STATE: undefined}
};
for (const [name, patch] of Object.entries(stateCases)) test('F-11 runners STOP on incomplete seed state: ' + name, () => {
  const props = baseProps();
  Object.entries(patch).forEach(([k, v]) => { if (v === undefined) delete props[k]; else props[k] = v; });
  const t = runtime({props});
  assert.throws(() => t.ctx.phaseB08ValidateReadOnly(), STOP);
  assert.throws(() => t.ctx.phaseB08PartialCommitFaultOnce(), STOP);
  assert.throws(() => t.ctx.phaseB08PostSeedReadinessReadOnly(), STOP);
  assert.equal(t.writes.length, 0);
});

test('F-11 baseline is evidence only: after PC changes data, general readiness stays READY; fresh-fixture check is post-seed only', () => {
  const {runner} = seededPair();
  runner.ctx.phaseB08PartialCommitFaultOnce(); runner.ctx.phaseB08PartialCommitReadback(); runner.ctx.phaseB08PartialCommitRecoverOnce();
  assert.equal(runner.ctx.phaseB08ValidateReadOnly().status, 'PHASEB08_READY_READ_ONLY');
  assert.throws(() => runner.ctx.phaseB08PostSeedReadinessReadOnly(), /fresh fixture/);
  assert.equal(runner.props.PHASEB08_SEED_STATE, 'COMPLETED', 'seed marker untouched by tests');
});

const freshCases = {
  'requisition header label tampered': b => { b.sheets['ใบเบิกสินค้า'].data.get('1,7').v = 'status'; },
  'inventory header row 7 missing': b => { b.sheets['คลังสินค้า'].data.delete('7,1'); },
  'ledger header row 3 tampered': b => { b.sheets['บันทึกรับ-จ่าย'].data.get('3,11').v = 'ID'; }
};
for (const [name, mutate] of Object.entries(freshCases)) test('F-11 post-seed readiness STOPs: ' + name, () => {
  const {runner} = seededPair();
  mutate(runner.book);
  assert.throws(() => runner.ctx.phaseB08PostSeedReadinessReadOnly(), /header/);
  assert.equal(runner.writes.length, 0);
});

/* ---------- F-12: real identity chain, read-only ---------- */

test('F-12 identity preflight: Session -> me_() -> role_() -> requireStaff_() passes for the sandbox admin; email never printed', () => {
  const t = runtime();
  const r = t.ctx.phaseB08IdentityPreflightReadOnly();
  assert.equal(r.status, 'PHASEB08_IDENTITY_READY_READ_ONLY');
  assert.equal(r.role, 'admin');
  assert.equal(r.activeEqualsEffective, true);
  assert.equal(JSON.stringify(t.log).includes('@'), false, 'no email address in any log line');
  assert.equal(t.writes.length, 0);
  assert.deepEqual(t.opened, [], 'identity preflight never opens a spreadsheet');
});

test('F-12 identity preflight STOPs for an empty active-user email (execute-as limitation)', () => {
  const t = runtime({email: ''});
  assert.throws(() => t.ctx.phaseB08IdentityPreflightReadOnly(), /active user email is empty/);
});

test('F-12 unmodified Code.gs ADMINS: the test address is public and the preflight STOPs (no allowlist change)', () => {
  const t = runtime({realAdmins: true});
  assert.equal(t.ctx.role_(), 'public');
  assert.throws(() => t.ctx.phaseB08IdentityPreflightReadOnly(), /role=public\); do NOT edit ADMINS/);
  assert.throws(() => t.ctx.phaseB08PartialCommitFaultOnce(), /ส่วนนี้สำหรับพนักงานหลังบ้านเท่านั้น|STOP/);
  assert.equal(t.writes.length, 0);
});

test('F-12 active and effective user differ: reported, not hidden', () => {
  const t = runtime({effectiveEmail: 'owner@example.test'});
  const r = t.ctx.phaseB08IdentityPreflightReadOnly();
  assert.equal(r.activeEqualsEffective, false);
});

test('F-9 SEED identity is required by kind (not only by hashes)', () => {
  const t = seedRun({identityKind: 'RUNNER'});
  assert.throws(() => t.ctx.phaseB08SeedPreflightReadOnly(), /SEED bundle identity required/);
  assert.equal(t.writes.length, 0);
});

test('F-9 opened spreadsheet whose ID differs from the configured target is rejected before any check passes', () => {
  const t = seedRun();
  const real = t.ctx.SpreadsheetApp.openById;
  t.ctx.SpreadsheetApp.openById = id => { const ss = real(id); return Object.assign({}, ss, {getId: () => 'aliasedSheet_000000000000001'}); };
  assert.throws(() => t.ctx.phaseB08SeedPreflightReadOnly(), /opened spreadsheet ID mismatch/);
  assert.throws(() => t.ctx.phaseB08SeedDisposableOnce(), /opened spreadsheet ID mismatch/);
  assert.equal(t.writes.length, 0);
  assert.equal(t.props.PHASEB08_SEED_STATE, undefined);
});

test('F-9 ROLE=TEST is enforced on its own: a RESTORE project with a matching -R1 title still cannot seed', () => {
  const t = seedRun({book: blankBook({title: 'KAIDEE-STOCK-DISPOSABLE-QA-B08-' + RUN + '-R1'}),
    props: preSeedProps({KAIDEE_B08_ROLE: 'RESTORE', KAIDEE_B08_RESTORE_SEQ: '1'})});
  assert.throws(() => t.ctx.phaseB08SeedPreflightReadOnly(), /seeding is allowed only in a TEST project/);
  assert.throws(() => t.ctx.phaseB08SeedDisposableOnce(), /seeding is allowed only in a TEST project/);
  assert.equal(t.writes.length, 0);
  assert.equal(t.props.PHASEB08_SEED_STATE, undefined);
});

test('F-11 post-seed readiness STOPs on an intent with no movement (fresh fixture must have 0 intents)', () => {
  const {runner} = seededPair();
  runner.props['REQ_ISSUE_V1_' + P + 'LOCK-001'] = JSON.stringify({version: 1, doc: P + 'RQ-LOCK-001',
    shape: [{id: 'REQ-' + P + 'LOCK-001-1', line: P + 'LOCK-001-L1', code: 'QA-020', qty: 1}], who: 'qa', at: '2026-11-01T00:00:00.000Z', prices: [5]});
  assert.equal(runner.ctx.phaseB08ValidateReadOnly().status, 'PHASEB08_READY_READ_ONLY', 'a valid intent is acceptable in general readiness');
  assert.throws(() => runner.ctx.phaseB08PostSeedReadinessReadOnly(), /fresh fixture must have 0 movements and 0 intents/);
});
