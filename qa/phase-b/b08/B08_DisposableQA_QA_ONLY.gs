/**
 * KAIDEE-STOCK Phase B08 — DISPOSABLE QA RUNNERS. NEVER DEPLOY.
 * Requires PhaseB08DisposableAdapter.gs, the generated B08_BundleIdentity.gs and
 * the hooked QA copy of Code.gs produced by scripts/b08-qa-bundle.js.
 *
 * Evidence classes (never upgrade one into another):
 *   SIMULATED_EXCEPTION[_AFTER_FLUSH] — deliberate throw from a QA-only hook.
 *   REAL_PROCESS_CRASH                — NOT TESTED by B08 (kill/timeout/quota).
 * QA files write ONLY PHASEB08_* Script Properties (arm + evidence). Business
 * writes happen exclusively through the unchanged setReqStatus() path.
 */
const B08_POINTS = Object.freeze(['BEFORE_INTENT_READ', 'BEFORE_INTENT_WRITE', 'AFTER_ACTIVATE']);
const B08_MARKER = 'PHASEB08_SIMULATED_FAULT:';
const B08_ARM = 'PHASEB08_ARM';
// B08_FIXTURE is defined in PhaseB08DisposableAdapter.gs (single source for guard + runners).
const B08_LOCK_WAIT_MS = 20000; // must equal withLock_ waitLock in Code.gs (statically verified)

/* ---------- evidence-only property helpers (the ONLY property writers) ---------- */
function b08SetEvidence_(key, value) {
  if (!/^PHASEB08_[A-Z0-9_]+$/.test(key)) b08Stop_('evidence key outside PHASEB08_ namespace');
  PropertiesService.getScriptProperties().setProperty(key, typeof value === 'string' ? value : JSON.stringify(value));
}
function b08DeleteEvidence_(key) {
  if (!/^PHASEB08_[A-Z0-9_]+$/.test(key)) b08Stop_('evidence key outside PHASEB08_ namespace');
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty(key);
  if (props.getProperty(key) !== null) b08Stop_('could not delete ' + key);
}
function b08Evidence_(key) {
  const raw = PropertiesService.getScriptProperties().getProperty(key);
  if (!raw) b08Stop_('missing evidence ' + key);
  return JSON.parse(raw);
}

/* ---------- QA-only fault hook (called from 3 reviewed lines in the QA Code.gs copy) ---------- */
function phaseB08Fault_(point, reqId) {
  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty(B08_ARM);
  if (!raw) return;
  let arm;
  try { arm = JSON.parse(raw); } catch (_e) { b08Stop_('unreadable arm'); }
  if (arm.point !== point || arm.reqId !== reqId) return;
  const who = b08Identity_();
  if (arm.run !== who.run || B08_POINTS.indexOf(point) < 0) b08Stop_('arm run/point mismatch');
  b08DeleteEvidence_(B08_ARM); // disarm BEFORE throwing: one-shot
  if (point === 'AFTER_ACTIVATE') SpreadsheetApp.flush(); // make the partial state durable & observable
  throw new Error(B08_MARKER + point);
}

/* ---------- identity / attestation ---------- */
function b08ReqId_(run, key) { return 'QA-DISP-' + run + '-' + key; }
function b08HookCheck_() {
  if (typeof B08_BUNDLE_IDENTITY !== 'object' || !B08_BUNDLE_IDENTITY.functionSha256)
    b08Stop_('generated bundle identity missing');
  const fns = {writeIssue_, setReqStatus, withLock_, stagingDb_, b08Identity_, b08ValidateConfig_,
    b08FixtureGuard_, b08Reconcile52_, b08Snapshot_, b08Cell_, phaseB08ValidateReadOnly, phaseB08Fault_, savePdf, doGet};
  const actual = {};
  Object.keys(fns).forEach(name => {
    actual[name] = b08Sha256Hex_(Function.prototype.toString.call(fns[name]));
    if (actual[name] !== B08_BUNDLE_IDENTITY.functionSha256[name])
      b08Stop_('runtime source attestation mismatch: ' + name);
  });
  const src = Function.prototype.toString.call(writeIssue_);
  B08_POINTS.forEach(p => { if (src.indexOf("phaseB08Fault_('" + p + "', r.id)") < 0) b08Stop_('hook missing ' + p); });
  [savePdf, doGet].forEach(fn => {
    if (Function.prototype.toString.call(fn).indexOf("throw new Error('PHASEB08_STOP:") < 0)
      b08Stop_('PDF/web entry point is not neutralized');
  });
  return {bundle: B08_BUNDLE_IDENTITY.hookedCodeSha256, functions: actual};
}

/* ---------- canonical business snapshot ---------- */
function b08Value_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]') return {t: isNaN(value) ? 'INVALID' : value.toISOString()};
  return value === '' || value == null ? '' : value;
}
/** F-6: formula cells keep BOTH the formula text and the calculated value. */
function b08Cell_(value, formula) {
  if (formula) return {f: String(formula), v: b08Value_(value)};
  return b08Value_(value);
}
function b08Grid_(sh, r, c, n, m) {
  if (n <= 0) return [];
  const rg = sh.getRange(r, c, n, m), v = rg.getValues(), f = rg.getFormulas();
  return v.map((row, i) => row.map((x, j) => b08Cell_(x, f[i][j])));
}
function b08Stable_(x) {
  if (Array.isArray(x)) return '[' + x.map(b08Stable_).join(',') + ']';
  if (x && typeof x === 'object')
    return '{' + Object.keys(x).sort().map(k => JSON.stringify(k) + ':' + b08Stable_(x[k])).join(',') + '}';
  return JSON.stringify(x);
}
function b08Snapshot_() {
  const ss = stagingDb_(), who = b08Identity_();
  const inv = ss.getSheetByName('คลังสินค้า'), mv = ss.getSheetByName('บันทึกรับ-จ่าย');
  const rq = ss.getSheetByName('ใบเบิกสินค้า'), ln = ss.getSheetByName('รายการใบเบิก');
  const invGrid = b08Grid_(inv, 1, 1, 59, 10);
  const binding = invGrid[1][0];
  invGrid[1][0] = '<CONFIG:BINDING>';
  const all = PropertiesService.getScriptProperties().getProperties();
  const prefix = 'REQ_ISSUE_V1_QA-DISP-' + who.run + '-';
  const intents = {};
  Object.keys(all).filter(k => k.indexOf(prefix) === 0).forEach(k => {
    try { intents[k] = JSON.parse(all[k]); } catch (_e) { intents[k] = {unparsable: all[k]}; }
  });
  const business = {
    run: who.run,
    inventory: invGrid,
    ledger: b08Grid_(mv, MV_FIRST, 1, Math.max(0, mv.getLastRow() - MV_FIRST + 1), 14),
    requisitions: b08Grid_(rq, 1, 1, rq.getLastRow(), 11),
    lines: b08Grid_(ln, 1, 1, ln.getLastRow(), 5),
    intents
  };
  return {
    business,
    businessSha256: b08Sha256Hex_(b08Stable_(business)),
    reconciliation: b08Reconcile52_(),
    // Project-specific: reported but EXCLUDED from restore equality.
    config: {title: ss.getName(), role: who.role, targetSha256: who.targetSha, scriptSha256: who.scriptSha,
      binding: String(binding), evidenceKeys: Object.keys(all).filter(k => /^PHASEB08_/.test(k)).sort()}
  };
}
/** Pure comparator for restore equality. Compares business only; config excluded by construction. */
function b08CompareSnapshots_(a, b) {
  const diffs = [];
  const walk = (x, y, path) => {
    if (diffs.length >= 50) return;
    const ox = x && typeof x === 'object', oy = y && typeof y === 'object';
    if (!ox || !oy) { if (b08Stable_(x) !== b08Stable_(y)) diffs.push(path); return; }
    if (Array.isArray(x) !== Array.isArray(y)) { diffs.push(path); return; }
    const keys = Array.from(new Set(Object.keys(x).concat(Object.keys(y)))).sort();
    keys.forEach(k => walk(x[k], y[k], path + '/' + k));
  };
  if (!a || !b || !a.business || !b.business) return {equal: false, diffs: ['<missing business section>']};
  walk(a.business, b.business, '');
  return {equal: diffs.length === 0, diffs,
    excluded: ['config.title', 'config.role', 'config.targetSha256', 'config.scriptSha256',
      'config.binding (คลังสินค้า!A2)', 'PHASEB08_* evidence keys']};
}

/* ---------- scenario state from a snapshot ---------- */
function b08ReqState_(snap, reqId) {
  const head = snap.business.requisitions.find(r => r[0] === reqId);
  if (!head) b08Stop_('fixture request missing ' + reqId);
  const prefix = 'REQ-' + reqId + '-';
  const rows = snap.business.ledger.filter(r => String(r[10] || '').indexOf(prefix) === 0)
    .map(r => ({id: r[10], type: r[1], code: r[2], qty: r[4]}));
  const intent = snap.business.intents['REQ_ISSUE_V1_' + reqId] || null;
  return {status: head[6], rows, intent};
}
function b08Balance_(code) { return balances_(readItems_(), readMv_())[code]; }
function b08ExpectFixture_(reqId, key) {
  const r = readReqs_().find(x => x.id === reqId), want = B08_FIXTURE[key];
  if (!r || r.lines.length !== want.length ||
      r.lines.some((l, i) => l.code !== want[i][0] || l.qty !== want[i][1])) b08Stop_('fixture payload mismatch ' + key);
}
function b08Prepare_(key, expectStatus) {
  const who = b08Identity_();
  b08HookCheck_();
  b08FixtureGuard_(who.run);
  const reqId = b08ReqId_(who.run, key);
  b08ExpectFixture_(reqId, key);
  if (PropertiesService.getScriptProperties().getProperty(B08_ARM)) b08Stop_('arm already present');
  const snap = b08Snapshot_(), st = b08ReqState_(snap, reqId);
  if (st.status !== expectStatus) b08Stop_(key + ' status ' + st.status + ' != ' + expectStatus);
  return {who, reqId, snap, st};
}
function b08Untouched_(st, key) {
  if (st.rows.length || st.intent) b08Stop_(key + ' already has ledger rows or intent');
}
function b08Log_(obj) { console.log(JSON.stringify(obj, null, 2)); return obj; }
function b08IssueAndRetry_(reqId, key) {
  const receipt = setReqStatus(reqId, 'issue');
  if (!receipt.ok) b08Stop_(key + ' issue receipt not ok');
  const mid = b08Snapshot_();
  const retry = setReqStatus(reqId, 'issue');
  if (retry.reused !== true) b08Stop_(key + ' retry not reused');
  if (b08Snapshot_().businessSha256 !== mid.businessSha256) b08Stop_(key + ' retry changed business state');
  const st = b08ReqState_(mid, reqId), want = B08_FIXTURE[key];
  if (st.status !== 'จ่ายแล้ว' || st.rows.length !== want.length ||
      st.rows.some((r, i) => r.type !== 'จ่ายออก' || r.code !== want[i][0] || r.qty !== want[i][1]))
    b08Stop_(key + ' ledger/header after issue mismatch');
  want.forEach(([code, qty]) => { if (b08Balance_(code) !== 100 - qty) b08Stop_(key + ' balance ' + code); });
  return {receipt, retryReused: true, businessSha256: mid.businessSha256};
}
function b08Fault_(key, point) {
  const p = b08Prepare_(key, 'อนุมัติ');
  b08Untouched_(p.st, key);
  const props = PropertiesService.getScriptProperties();
  const unrelated = b08Sha256Hex_(b08Stable_(b08NonEvidenceProps_()));
  b08SetEvidence_(B08_ARM, {point, reqId: p.reqId, run: p.who.run, armedAt: new Date().toISOString()});
  let thrown = null;
  try { setReqStatus(p.reqId, 'issue'); } catch (e) { thrown = e; }
  if (!thrown || String(thrown.message) !== B08_MARKER + point)
    b08Stop_('expected simulated fault NOT observed (' + (thrown ? thrown.message : 'no error') +
      '); DO NOT RETRY — inspect manually');
  if (props.getProperty(B08_ARM) !== null) b08Stop_('fault still armed');
  return {p, unrelated, marker: thrown.message};
}
function b08NonEvidenceProps_() {
  const all = PropertiesService.getScriptProperties().getProperties(), out = {};
  Object.keys(all).filter(k => !/^PHASEB08_/.test(k)).forEach(k => { out[k] = all[k]; });
  return out;
}

/* ======================= Editor entry points ======================= */

/** G: zero-write readiness. Run first; share the sanitized log. */
function phaseB08ValidateReadOnly() {
  const who = b08Identity_();
  // F-7: report the REAL arm state; a stale arm is a STOP, never 'armed:false'.
  const arm = PropertiesService.getScriptProperties().getProperty(B08_ARM);
  if (arm !== null) b08Stop_('stale PHASEB08_ARM present (' + arm + '); manual review before any run');
  const att = b08HookCheck_();
  const g = b08FixtureGuard_(who.run);
  const snap = b08Snapshot_();
  // Re-read at the end: an arm set by another execution DURING readiness must not be reported as ready.
  const armEnd = PropertiesService.getScriptProperties().getProperty(B08_ARM);
  if (armEnd !== null) b08Stop_('PHASEB08_ARM appeared during readiness (' + armEnd + '); manual review');
  return b08Log_({status: 'PHASEB08_READY_READ_ONLY', run: who.run, role: who.role,
    formula: g.formula, reconciliation: {checked: g.reconciliation.checked, mismatches: 0, totalIssued: g.reconciliation.totalIssued},
    requests: g.reqs, moveCount: g.moveCount, attestation: att.bundle, businessSha256: snap.businessSha256,
    armed: armEnd !== null, evidenceKeys: snap.config.evidenceKeys});
}

/** PC-1: simulated exception after the FIRST line activates (flushed). */
function phaseB08PartialCommitFaultOnce() {
  const f = b08Fault_('PC-001', 'AFTER_ACTIVATE');
  return b08Log_({status: 'PHASEB08_PC_FAULT_INJECTED', evidenceClass: 'SIMULATED_EXCEPTION_AFTER_FLUSH',
    realProcessCrash: 'NOT_TESTED', marker: f.marker,
    next: 'Run phaseB08PartialCommitReadback in a NEW execution + owner Sheets UI readback before recovery'});
}
/** PC-1b: independent readback in a separate execution. Writes only PHASEB08_PC_READBACK. */
function phaseB08PartialCommitReadback() {
  const who = b08Identity_();
  b08FixtureGuard_(who.run);
  const reqId = b08ReqId_(who.run, 'PC-001');
  if (PropertiesService.getScriptProperties().getProperty(B08_ARM)) b08Stop_('arm present after fault');
  const snap = b08Snapshot_(), st = b08ReqState_(snap, reqId);
  const ok = st.status === 'อนุมัติ' && st.intent && st.intent.version === 1 &&
    st.intent.doc === b08ReqId_(who.run, 'RQ-PC-001') && st.rows.length === 2 &&
    st.rows[0].id === 'REQ-' + reqId + '-1' && st.rows[0].type === 'จ่ายออก' &&
    st.rows[1].id === 'REQ-' + reqId + '-2' && st.rows[1].type === '' &&
    b08Balance_('QA-010') === 98 && b08Balance_('QA-011') === 100;
  if (!ok) b08Stop_('partial-commit readback does not match expected durable state; DO NOT RECOVER');
  b08SetEvidence_('PHASEB08_PC_READBACK', {businessSha256: snap.businessSha256, at: new Date().toISOString()});
  return b08Log_({status: 'PHASEB08_PC_READBACK_PASS', header: st.status, activeRows: 1, preparedRows: 1,
    intentPresent: true, balance: {'QA-010': 98, 'QA-011': 100}, businessSha256: snap.businessSha256});
}
/** PC-2/PC-3: resume only the pending line, then idempotent retry. */
function phaseB08PartialCommitRecoverOnce() {
  const who = b08Identity_();
  b08HookCheck_();
  b08FixtureGuard_(who.run);
  const rb = b08Evidence_('PHASEB08_PC_READBACK');
  const before = b08Snapshot_();
  if (before.businessSha256 !== rb.businessSha256) b08Stop_('state drifted since readback; re-inspect');
  const reqId = b08ReqId_(who.run, 'PC-001');
  const firstRow = JSON.stringify(before.business.ledger.find(r => r[10] === 'REQ-' + reqId + '-1'));
  const intent = b08Stable_(b08ReqState_(before, reqId).intent);
  const res = b08IssueAndRetry_(reqId, 'PC-001');
  const after = b08Snapshot_();
  if (res.receipt.reused !== false) b08Stop_('recovery should report reused:false');
  if (JSON.stringify(after.business.ledger.find(r => r[10] === 'REQ-' + reqId + '-1')) !== firstRow)
    b08Stop_('committed first line changed during recovery');
  if (b08Stable_(b08ReqState_(after, reqId).intent) !== intent) b08Stop_('intent changed during recovery');
  return b08Log_({status: 'PHASEB08_PC_RECOVERY_PASS', receipt: res.receipt, retryReused: true,
    balance: {'QA-010': 98, 'QA-011': 97}, businessSha256: after.businessSha256});
}

/** LOCK-1 A: hold the real script lock longer than waitLock. Zero business writes. */
function phaseB08LockHolderA() { return b08LockHolder_('PHASEB08_LOCK_A', 'LOCK-001', 35000); }
/** LOCK-2 A: hold shorter than waitLock so B must wait then proceed. */
function phaseB08LockSerialHolderA() { return b08LockHolder_('PHASEB08_LOCK2_A', 'LOCK-002', 10000); }
function b08LockHolder_(key, reqKey, holdMs) {
  const p = b08Prepare_(reqKey, 'อนุมัติ');
  b08Untouched_(p.st, reqKey);
  const ev = {role: 'A', reqKey, holdMs, invokedAt: Date.now(), preSha256: p.snap.businessSha256};
  withLock_(() => { ev.acquiredAt = Date.now(); Utilities.sleep(holdMs); ev.releaseAt = Date.now(); });
  ev.returnedAt = Date.now();
  ev.postSha256 = b08Snapshot_().businessSha256;
  if (ev.postSha256 !== ev.preSha256) b08Stop_('lock holder changed business state');
  b08SetEvidence_(key, ev);
  return b08Log_(Object.assign({status: 'PHASEB08_LOCK_HELD_AND_RELEASED'}, ev));
}
/** LOCK-1 B: start within ~10 s of A; expect waitLock timeout and zero writes. */
function phaseB08LockContenderB() { return b08LockContender_('PHASEB08_LOCK_B', 'LOCK-001'); }
/** LOCK-2 B: start while A holds; expect to wait, then issue exactly once. */
function phaseB08LockSerialContenderB() { return b08LockContender_('PHASEB08_LOCK2_B', 'LOCK-002'); }
function b08LockContender_(key, reqKey) {
  const p = b08Prepare_(reqKey, 'อนุมัติ');
  b08Untouched_(p.st, reqKey);
  const ev = {role: 'B', reqKey, preSha256: p.snap.businessSha256, startedAt: Date.now()};
  try { ev.result = setReqStatus(p.reqId, 'issue'); ev.error = null; }
  catch (e) { ev.error = String(e && e.message || e); ev.result = null; }
  ev.endedAt = Date.now();
  const snap = b08Snapshot_(), st = b08ReqState_(snap, p.reqId);
  ev.postSha256 = snap.businessSha256;
  ev.status = st.status;
  ev.activeRows = st.rows.filter(r => r.type === 'จ่ายออก').length;
  ev.intentAt = st.intent ? st.intent.at : null;
  b08SetEvidence_(key, ev);
  return b08Log_(Object.assign({status: 'PHASEB08_LOCK_CONTENDER_RECORDED'}, ev));
}
/** Pure evaluator: LOCK-1 (timeout). */
function b08EvaluateLockTimeout_(a, b, opts) {
  const tol = (opts && opts.toleranceMs) || 2000, wait = (opts && opts.waitMs) || B08_LOCK_WAIT_MS;
  if (!a || !b || a.role !== 'A' || b.role !== 'B' || a.reqKey !== b.reqKey) return {verdict: 'STOP', why: 'evidence pair invalid'};
  const overlapped = b.startedAt >= a.acquiredAt && b.startedAt + wait <= a.releaseAt + tol;
  if (b.error === null) {
    return overlapped ? {verdict: 'FAIL', why: 'B acquired the lock while A held it'}
      : {verdict: 'INCONCLUSIVE', why: 'B did not overlap A for a full wait window'};
  }
  if (!/lock|timeout|timed out/i.test(b.error)) return {verdict: 'STOP', why: 'unexpected B error: ' + b.error};
  if (b.preSha256 !== b.postSha256 || b.activeRows !== 0 || b.intentAt !== null || b.status !== 'อนุมัติ')
    return {verdict: 'FAIL', why: 'B timed out but business state changed'};
  if (b.endedAt - b.startedAt < wait - 1000) return {verdict: 'FAIL', why: 'B failed before a full waitLock window'};
  if (!overlapped || b.endedAt > a.releaseAt + tol) return {verdict: 'INCONCLUSIVE', why: 'timeout outside A hold window'};
  return {verdict: 'PASS', why: 'B waited ' + (b.endedAt - b.startedAt) + 'ms inside A hold and wrote nothing'};
}
/** Pure evaluator: LOCK-2 (serialization). intentAt is written inside B's critical section. */
function b08EvaluateLockSerial_(a, b) {
  if (!a || !b || a.role !== 'A' || b.role !== 'B' || a.reqKey !== b.reqKey) return {verdict: 'STOP', why: 'evidence pair invalid'};
  if (b.error !== null) return {verdict: 'STOP', why: 'B failed: ' + b.error};
  if (!(b.startedAt >= a.acquiredAt && b.startedAt < a.releaseAt)) return {verdict: 'INCONCLUSIVE', why: 'B did not start while A held the lock'};
  const enteredAt = Date.parse(b.intentAt);
  if (!isFinite(enteredAt) || enteredAt < a.releaseAt) return {verdict: 'FAIL', why: 'B entered critical section before A released'};
  if (b.activeRows !== B08_FIXTURE[b.reqKey].length || b.status !== 'จ่ายแล้ว') return {verdict: 'FAIL', why: 'B ledger/header mismatch'};
  return {verdict: 'PASS', why: 'B waited ' + (enteredAt - b.startedAt) + 'ms and entered after A released'};
}
/** LOCK evaluation with independent fresh ledger readback. Zero writes. */
function phaseB08LockEvaluateReadOnly() {
  const who = b08Identity_();
  b08FixtureGuard_(who.run);
  const out = {status: 'PHASEB08_LOCK_EVALUATION', note: 'Cross-check timestamps against the Executions dashboard'};
  const snap = b08Snapshot_();
  const l1 = b08ReqState_(snap, b08ReqId_(who.run, 'LOCK-001'));
  out.lock1 = b08EvaluateLockTimeout_(b08Evidence_('PHASEB08_LOCK_A'), b08Evidence_('PHASEB08_LOCK_B'));
  out.lock1.readback = {status: l1.status, rows: l1.rows.length, intent: !!l1.intent};
  if (out.lock1.verdict === 'PASS' && (l1.rows.length || l1.intent)) out.lock1 = {verdict: 'FAIL', why: 'readback shows writes'};
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('PHASEB08_LOCK2_A') && props.getProperty('PHASEB08_LOCK2_B')) {
    out.lock2 = b08EvaluateLockSerial_(b08Evidence_('PHASEB08_LOCK2_A'), b08Evidence_('PHASEB08_LOCK2_B'));
    const l2 = b08ReqState_(snap, b08ReqId_(who.run, 'LOCK-002'));
    out.lock2.readback = {status: l2.status, rows: l2.rows.length};
  }
  return b08Log_(out);
}
/** LOCK-3: after A released and LOCK-1 evaluated PASS, issue once + idempotent retry. */
function phaseB08LockIssueAfterRelease() {
  const p = b08Prepare_('LOCK-001', 'อนุมัติ');
  b08Untouched_(p.st, 'LOCK-001');
  return b08Log_(Object.assign({status: 'PHASEB08_LOCK_RETRY_PASS'}, b08IssueAndRetry_(p.reqId, 'LOCK-001')));
}

/** PROP-1/PROP-2: simulated Script Properties failure before read / before durable write. */
function phaseB08PropBeforeReadOnce() { return b08PropFault_('PROP-001', 'BEFORE_INTENT_READ'); }
function phaseB08PropBeforeWriteOnce() { return b08PropFault_('PROP-002', 'BEFORE_INTENT_WRITE'); }
function b08PropFault_(key, point) {
  const f = b08Fault_(key, point);
  const after = b08Snapshot_();
  if (after.businessSha256 !== f.p.snap.businessSha256) b08Stop_('business state changed before durable intent');
  if (b08ReqState_(after, f.p.reqId).intent) b08Stop_('intent unexpectedly persisted');
  if (b08Sha256Hex_(b08Stable_(b08NonEvidenceProps_())) !== f.unrelated) b08Stop_('non-evidence properties changed');
  return b08Log_({status: 'PHASEB08_PROP_FAULT_PASS', point, evidenceClass: 'SIMULATED_EXCEPTION',
    realQuota: 'PENDING', marker: f.marker, businessUnchanged: true, unrelatedPropertiesUnchanged: true});
}
function phaseB08PropIssueAfterFault1() { return b08PropIssue_('PROP-001'); }
function phaseB08PropIssueAfterFault2() { return b08PropIssue_('PROP-002'); }
function b08PropIssue_(key) {
  const p = b08Prepare_(key, 'อนุมัติ');
  b08Untouched_(p.st, key);
  return b08Log_(Object.assign({status: 'PHASEB08_PROP_RETRY_PASS', key}, b08IssueAndRetry_(p.reqId, key)));
}

/** RB-0 (TEST role): pay RESTORE-001 so the snapshot holds paid + approved requests. */
function phaseB08RestorePrepareIssueOnce() {
  const p = b08Prepare_('RESTORE-001', 'อนุมัติ');
  if (p.who.role !== 'TEST') b08Stop_('prepare only in TEST project');
  b08Untouched_(p.st, 'RESTORE-001');
  return b08Log_(Object.assign({status: 'PHASEB08_RESTORE_SOURCE_READY'}, b08IssueAndRetry_(p.reqId, 'RESTORE-001')));
}
/** RB-1/RB-3: canonical snapshot for OFFLINE equality (scripts/b08-qa-bundle.js compare). Zero writes. */
function phaseB08BusinessSnapshotReadOnly() {
  const who = b08Identity_();
  b08FixtureGuard_(who.run);
  const snap = b08Snapshot_();
  console.log('PHASEB08_SNAPSHOT_SHA256 ' + snap.businessSha256);
  console.log(JSON.stringify(snap));
  return {businessSha256: snap.businessSha256, config: snap.config};
}
/** RB-4 (RESTORE role): validation mutation on the clone only. */
function phaseB08RestoreValidateOnce() {
  const who = b08Identity_();
  if (who.role !== 'RESTORE') b08Stop_('validation mutation only in a RESTORE project');
  b08HookCheck_();
  b08FixtureGuard_(who.run);
  const id1 = b08ReqId_(who.run, 'RESTORE-001');
  const before = b08Snapshot_();
  const r1 = setReqStatus(id1, 'issue');
  if (r1.reused !== true || b08Snapshot_().businessSha256 !== before.businessSha256)
    b08Stop_('restored paid request was not idempotent');
  const p2 = b08Prepare_('RESTORE-002', 'อนุมัติ');
  b08Untouched_(p2.st, 'RESTORE-002');
  const r2 = b08IssueAndRetry_(p2.reqId, 'RESTORE-002');
  return b08Log_({status: 'PHASEB08_RESTORE_VALIDATION_PASS', paidRetryReused: true, approvedIssued: r2});
}
/** RB-5 (RESTORE role, intents deliberately NOT restored): must fail closed with zero writes. */
function phaseB08RestoreNegativeOnce() {
  const who = b08Identity_();
  if (who.role !== 'RESTORE') b08Stop_('negative restore only in a RESTORE project');
  b08FixtureGuard_(who.run, {allowMissingIntent: true});
  const id1 = b08ReqId_(who.run, 'RESTORE-001'), before = b08Snapshot_();
  if (b08ReqState_(before, id1).intent) b08Stop_('negative drill requires intent to be ABSENT');
  let err = null;
  try { setReqStatus(id1, 'issue'); } catch (e) { err = String(e.message); }
  if (!err || !/manual review/.test(err)) b08Stop_('expected fail-closed manual review, got ' + err);
  if (b08Snapshot_().businessSha256 !== before.businessSha256) b08Stop_('negative drill changed state');
  return b08Log_({status: 'PHASEB08_RESTORE_NEGATIVE_FAIL_CLOSED_PASS', error: err});
}
