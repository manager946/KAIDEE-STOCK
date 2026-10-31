/**
 * KAIDEE-STOCK Phase B08-1 — DISPOSABLE SEEDER. SEED BUNDLE ONLY. NEVER DEPLOY.
 *
 * Installed ONCE in the disposable P1 project together with the SEED bundle identity.
 * After phaseB08SeedDisposableOnce reports COMPLETED, the owner DELETES this file and
 * replaces B08_BundleIdentity.gs with the RUNNER bundle version. Every runner STOPs while
 * this file (or a SEED identity) is still installed.
 *
 * Seed state machine (Script Properties, never reset automatically):
 *   (absent) NOT_STARTED -> STARTED -> COMPLETED      any error after STARTED -> REVIEW_REQUIRED
 * PHASEB08_SEED_DONE is written only after a fresh read-back of the real sheet passes every check.
 *
 * Writes are confined to the blank target returned by b08OpenTarget_(): one setName, three
 * insertSheet calls, and setValues/setFormulas on that workbook. No delete/clear, no Drive.
 *
 * F-14: the whole seed (state/blank re-check, STARTED, writes, read-back, DONE, COMPLETED) runs
 * inside the script lock, so two executions cannot both pass the NOT_STARTED check. A losing
 * execution STOPs without touching any marker. REVIEW_REQUIRED is written only by the execution
 * that itself wrote STARTED. Offline tests do not prove real Apps Script concurrency.
 */
const B08_SEED = Object.freeze({
  state: 'PHASEB08_SEED_STATE', done: 'PHASEB08_SEED_DONE', error: 'PHASEB08_SEED_ERROR',
  date: [2026, 10, 1], // 2026-11-01 (month is zero-based), synthetic request date
  actor: 'B08 SEED (synthetic)'
});

/** Pure fixture layout (no I/O). Formula cells are '' in values and set via formulas. */
function b08SeedLayout_(run, scriptSha) {
  const P = 'QA-DISP-' + run + '-';
  const inv = [];
  for (let r = 1; r <= 59; r++) inv.push(['', '', '', '', '', '', '', '', '', '']);
  inv[0][0] = B08.sentinelPrefix + run;
  inv[1][0] = B08.bindPrefix + run + '|' + scriptSha;
  inv[6] = B08_HEADERS.inv.slice();
  const fx = [];
  for (let i = 0; i < 52; i++) {
    const row = 8 + i, n = ('000' + (i + 1)).slice(-3);
    inv[row - 1] = ['QA-' + n, 'QA synthetic item ' + n, 'synthetic', 'unit', 10, B08_INV.opening, '', '', '', 5];
    fx.push([b08InvFormula_('G', row), b08InvFormula_('H', row), b08InvFormula_('I', row)]);
  }
  const date = new Date(B08_SEED.date[0], B08_SEED.date[1], B08_SEED.date[2]);
  const rq = [B08_HEADERS.rq.slice()], ln = [B08_HEADERS.ln.slice()];
  Object.keys(B08_FIXTURE).forEach(key => {
    const id = P + key;
    rq.push([id, P + 'RQ-' + key, date, 'B08 synthetic requester', 'QA', 'B08 disposable fixture', 'อนุมัติ',
      B08_SEED.actor, '', '', B08_SEED.actor]);
    B08_FIXTURE[key].forEach((line, i) => ln.push([id + '-L' + (i + 1), id, line[0], line[1], '']));
  });
  return {inv, invFormulas: fx, mvHeader: [B08_HEADERS.mv.slice()], rq, ln};
}

/** Seed-bundle attestation: SEED identity + hashes of the guard/seed functions. */
function b08SeedAttest_() {
  if (typeof B08_BUNDLE_IDENTITY !== 'object' || B08_BUNDLE_IDENTITY.bundleKind !== 'SEED')
    b08Stop_('SEED bundle identity required for seeding');
  const fns = {b08OpenTarget_, stagingDb_, b08BusinessGate_, b08WithSeedReadback_, b08ReadOnly_, withLock_,
    b08Identity_, b08ValidateConfig_, b08FixtureGuard_, b08AssertFreshFixture_,
    b08Reconcile52_, b08InvFormula_, b08SetEvidence_, b08Snapshot_, b08IdentityReport_,
    b08SeedLayout_, b08PreSeedGuard_, b08SeedVerify_, phaseB08SeedPreflightReadOnly, phaseB08SeedDisposableOnce};
  Object.keys(fns).forEach(name => {
    if (b08Sha256Hex_(Function.prototype.toString.call(fns[name])) !== B08_BUNDLE_IDENTITY.functionSha256[name])
      b08Stop_('seed attestation mismatch: ' + name);
  });
}

/**
 * F-9 pre-seed guard. Needs NO sentinel/binding/SKUs. Before any mutation proves: SEED
 * attestation, project identity + target ID/hash + denylist + triggers + title (b08OpenTarget_),
 * ROLE=TEST, seed state NOT_STARTED with no evidence/intent keys, a blank single-sheet
 * workbook with no named ranges, and an identity that can run the business workflow.
 */
function b08PreSeedGuard_() {
  b08SeedAttest_();
  const t = b08OpenTarget_();
  if (t.who.role !== 'TEST') b08Stop_('seeding is allowed only in a TEST project');
  const all = PropertiesService.getScriptProperties().getProperties();
  const present = Object.keys(all).filter(k => /^PHASEB08_/.test(k) || k.indexOf('REQ_ISSUE_V1_') === 0);
  if (present.length) b08Stop_('seed state is not NOT_STARTED (found ' + present.sort().join(',') + ')');
  const sheets = t.ss.getSheets();
  if (sheets.length !== 1) b08Stop_('target workbook must contain exactly one sheet before seeding');
  if (sheets[0].getLastRow() !== 0 || sheets[0].getLastColumn() !== 0) b08Stop_('target workbook is not blank');
  if (t.ss.getNamedRanges().length !== 0) b08Stop_('target workbook has named ranges');
  const id = b08IdentityReport_();
  if (!id.activeUserEmailPresent || !id.staffOk) b08Stop_('identity cannot run business workflow (role=' + id.role + ')');
  return {ss: t.ss, who: t.who, sheet: sheets[0], identity: id};
}

/** Fresh read-back of the REAL sheet after flush: full guard (seeding mode) + fresh-fixture checks. */
function b08SeedVerify_(who) {
  return b08WithSeedReadback_(() => {
    const g = b08FixtureGuard_(who.run, {seeding: true});
    const fresh = b08AssertFreshFixture_(g);
    return {fresh, businessSha256: b08Snapshot_().businessSha256};
  });
}

/** Zero writes. Run first; share the log and the OAuth consent screenshot. */
function phaseB08SeedPreflightReadOnly() {
  b08SeedAttest_(); // attest BEFORE calling the guard, so a replaced guard cannot skip attestation
  const g = b08PreSeedGuard_();
  return b08Log_({status: 'PHASEB08_SEED_PREFLIGHT_READY_READ_ONLY', run: g.who.run, seedState: 'NOT_STARTED',
    targetBlank: true, role: g.identity.role, plan: {tabs: 4, headers: 7, lines: 8, skus: 52, movements: 0}});
}

/** One-shot seed of the blank disposable workbook. Marker is never reset; any error -> REVIEW_REQUIRED. */
function phaseB08SeedDisposableOnce() {
  b08SeedAttest_(); // attest BEFORE calling the guard, so a replaced guard cannot skip attestation
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) b08Stop_('another execution holds the script lock; seed not started, no marker written');
  let started = false;
  try {
    const g = b08PreSeedGuard_(); // state NOT_STARTED + blank target re-checked INSIDE the critical section
    b08SetEvidence_(B08_SEED.state, 'STARTED');
    started = true;
    const L = b08SeedLayout_(g.who.run, g.who.scriptSha);
    const inv = g.sheet;
    inv.setName('คลังสินค้า');
    const mv = g.ss.insertSheet('บันทึกรับ-จ่าย'), rq = g.ss.insertSheet('ใบเบิกสินค้า'), ln = g.ss.insertSheet('รายการใบเบิก');
    inv.getRange(1, 1, 59, 10).setValues(L.inv);
    inv.getRange(8, 7, 52, 3).setFormulas(L.invFormulas);
    mv.getRange(3, 1, 1, 14).setValues(L.mvHeader);
    rq.getRange(1, 1, L.rq.length, 11).setValues(L.rq);
    ln.getRange(1, 1, L.ln.length, 5).setValues(L.ln);
    SpreadsheetApp.flush();
    const v = b08SeedVerify_(g.who);
    b08SetEvidence_(B08_SEED.done, {run: g.who.run, completedAt: new Date().toISOString(),
      baselineSha256: v.businessSha256, headers: v.fresh.headers, lines: v.fresh.lines, skus: v.fresh.skus});
    b08SetEvidence_(B08_SEED.state, 'COMPLETED');
    return b08Log_({status: 'PHASEB08_SEED_COMPLETED', run: g.who.run, fixture: v.fresh, baselineSha256: v.businessSha256,
      next: 'Delete B08_Seeder_QA_ONLY.gs, install RUNNER B08_BundleIdentity.gs, then run phaseB08PostSeedReadinessReadOnly'});
  } catch (e) {
    const msg = String(e && e.message || e).slice(0, 400);
    if (started) {
      try { b08SetEvidence_(B08_SEED.error, msg); b08SetEvidence_(B08_SEED.state, 'REVIEW_REQUIRED'); } catch (_ignored) { /* keep STARTED */ }
      throw new Error('PHASEB08_STOP: seed failed; state REVIEW_REQUIRED, no automatic reset: ' + msg);
    }
    throw e; // pre-STARTED guard failure: no marker is written or changed
  } finally {
    lock.releaseLock();
  }
}
