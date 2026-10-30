/**
 * B07 — isolated synthetic-only Apps Script test helper.
 * NEVER put this in STAGING or Production; NEVER deploy as a web app.
 *
 * Prerequisites in SAME standalone KAIDEE-STOCK-PHASE-B-QA project:
 *  (1) reviewed Code.gs copied from Draft PR #5 (QA copy only),
 *  (2) PhaseBIsolatedAdapter.gs with three requisitions in its preflight,
 *  (3) EXACTLY ONE QA-only hook line in Code.gs, directly AFTER:
 *        props.setProperty(key, encoded);
 *      insert:
 *        phaseBInjectOnceAfterIntent_(r.id);
 *
 * The hook must be in the new-intent 'else' path of writeIssue_(), not
 * above setProperty, not within setReqStatus, and not in production source.
 *
 * Run phaseB07ValidateReadOnly first. Only after independent review,
 * run phaseB07CrashAfterIntentOnce; then inspect and recover separately.
 */
const PHASEB_B07 = Object.freeze({
  reqId: 'QA-PB-003',
  reqDoc: 'QA-PB-RQ003',
  intentKey: 'REQ_ISSUE_V1_QA-PB-003',
  armKey: 'PHASEB_B07_ARM_QA-PB-003',
  target: 'AFTER_INTENT',
  crashMarker: 'PHASEB_B07_EXPECTED_CRASH_AFTER_INTENT'
});

function phaseB07AssertKnownState_(pre, expectedCount, expectedStatus, balance45) {
  if (pre.status !== 'ISOLATED_SYNTHETIC_PREFLIGHT_PASS' ||
      pre.formula !== 'MOVEMENT_ONLY_FORMULA_VERIFIED' || pre.skuCount !== 52) {
    throw new Error('PHASEB_B07_STOP: formula/isolation preflight did not pass');
  }
  const required = {
    'QA-PB-001': 'จ่ายแล้ว',
    'QA-PB-002': 'จ่ายแล้ว',
    'QA-PB-003': expectedStatus
  };
  if (pre.requestStatus.length !== 3 ||
      pre.requestStatus.some(r => !Object.prototype.hasOwnProperty.call(required, r.id) ||
                                  required[r.id] !== r.status)) {
    throw new Error('PHASEB_B07_STOP: unexpected requisition status');
  }
  const prior = {
    'REQ-QA-PB-001-1': ['QA-001', 2, 'QA-PB-RQ001'],
    'REQ-QA-PB-001-2': ['QA-001', 3, 'QA-PB-RQ001'],
    'REQ-QA-PB-002-1': ['QA-002', 4, 'QA-PB-RQ002'],
    'REQ-QA-PB-002-2': ['QA-003', 1, 'QA-PB-RQ002']
  };
  const newlyPosted = {
    'REQ-QA-PB-003-1': ['QA-004', 2, 'QA-PB-RQ003'],
    'REQ-QA-PB-003-2': ['QA-005', 3, 'QA-PB-RQ003']
  };
  const expected = expectedCount === 4 ? prior : {...prior, ...newlyPosted};
  if (pre.postedMovements.length !== expectedCount ||
      pre.postedMovements.some(m => !expected[m.id] ||
        m.sku !== expected[m.id][0] || m.qty !== expected[m.id][1] ||
        m.doc !== expected[m.id][2]) ||
      new Set(pre.postedMovements.map(m => m.id)).size !== expectedCount) {
    throw new Error('PHASEB_B07_STOP: unexpected active movements or duplicate ID');
  }
  const b = pre.balance;
  if (b.QA001 !== 95 || b.QA002 !== 96 || b.QA003 !== 99 ||
      b.QA004 !== balance45[0] || b.QA005 !== balance45[1]) {
    throw new Error('PHASEB_B07_STOP: stock balance drift');
  }
  return pre;
}
function phaseB07CheckHookInstalled_() {
  // Built-in Apps Script V8 function source text must contain the actual hook.
  // If this check fails, STOP; without the hook, an issue would post normally.
  const src = Function.prototype.toString.call(writeIssue_);
  if (src.indexOf('phaseBInjectOnceAfterIntent_(r.id);') < 0) {
    throw new Error('PHASEB_B07_STOP: reviewed QA-only hook not found in writeIssue_');
  }
  if (typeof phaseBInjectOnceAfterIntent_ !== 'function') {
    throw new Error('PHASEB_B07_STOP: fault hook helper missing');
  }
}
function phaseB07ValidatePlan_(encoded) {
  if (!encoded) throw new Error('PHASEB_B07_STOP: intent not persisted');
  let plan;
  try { plan = JSON.parse(encoded); }
  catch (_err) { throw new Error('PHASEB_B07_STOP: unreadable recovery intent'); }
  if (plan.version !== 1 || plan.doc !== PHASEB_B07.reqDoc ||
      !Array.isArray(plan.shape) || plan.shape.length !== 2 ||
      plan.shape[0].id !== 'REQ-QA-PB-003-1' ||
      plan.shape[0].line !== 'QA-PB-L5' ||
      plan.shape[0].code !== 'QA-004' || plan.shape[0].qty !== 2 ||
      plan.shape[1].id !== 'REQ-QA-PB-003-2' ||
      plan.shape[1].line !== 'QA-PB-L6' ||
      plan.shape[1].code !== 'QA-005' || plan.shape[1].qty !== 3 ||
      !plan.who || !plan.at || !Array.isArray(plan.prices) ||
      plan.prices.length !== 2) {
    throw new Error('PHASEB_B07_STOP: persisted intent payload mismatch');
  }
  return {version: plan.version, doc: plan.doc, lineCount: plan.shape.length};
}
function phaseB07AssertNoPreparedOrUnknownRows_() {
  const rows = reqIssueRows_();
  const ids = rows.map(m => String(m.v[10] || '')).filter(Boolean);
  if (new Set(ids).size !== ids.length ||
      rows.some(({v}) =>
        String(v[10] || '').indexOf('REQ-QA-PB-003-') === 0 ||
        String(v[13] || '') === PHASEB_B07.reqDoc ||
        (v[1] === 'จ่ายออก' && (!v[10] || !v[13])))) {
    throw new Error('PHASEB_B07_STOP: prior prepared, duplicate or unidentified movement');
  }
}
/** Zero-write readiness check; run FIRST and share its log. */
function phaseB07ValidateReadOnly() {
  const pre = phaseB07AssertKnownState_(phaseBPreflightReadOnly(), 4, 'อนุมัติ', [100,100]);
  phaseB07CheckHookInstalled_();
  phaseB07AssertNoPreparedOrUnknownRows_();
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty(PHASEB_B07.intentKey) ||
      props.getProperty(PHASEB_B07.armKey)) {
    throw new Error('PHASEB_B07_STOP: preexisting intent/armed flag — manual review');
  }
  const result = {
    status: 'PHASEB_B07_READY_READ_ONLY',
    target: 'QA-PB-003',
    scenario: 'AFTER_INTENT_ONLY',
    activeMovements: pre.postedMovements.length,
    balance: pre.balance,
    intentAbsent: true,
    armed: false
  };
  console.log(JSON.stringify(result, null, 2));
  return result;
}
/**
 * Called ONLY by one QA-only line in writeIssue_() after new intent storage.
 * Disarms BEFORE throwing, ensuring the deliberate exception triggers once.
 */
function phaseBInjectOnceAfterIntent_(reqId) {
  if (reqId !== PHASEB_B07.reqId) return;
  stagingDb_(); // fail-closed exact ID/title/tab/sentinel check
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty(PHASEB_B07.armKey) !== PHASEB_B07.target) return;
  phaseB07ValidatePlan_(props.getProperty(PHASEB_B07.intentKey));
  props.deleteProperty(PHASEB_B07.armKey);
  if (props.getProperty(PHASEB_B07.armKey)) {
    throw new Error('PHASEB_B07_STOP: fault trigger could not disarm');
  }
  throw new Error(PHASEB_B07.crashMarker);
}
/**
 * Deliberate failure: issues through unchanged business workflow until the
 * durable intent has been saved, then throws before any movement preparation.
 * DO NOT RUN until the read-only validation has been independently accepted.
 */
function phaseB07CrashAfterIntentOnce() {
  phaseB07ValidateReadOnly(); // guards before ANY mutation
  const props = PropertiesService.getScriptProperties();
  props.setProperty(PHASEB_B07.armKey, PHASEB_B07.target);
  let thrown;
  try { setReqStatus(PHASEB_B07.reqId, 'issue'); }
  catch (error) { thrown = error; }
  if (!thrown || String(thrown.message) !== PHASEB_B07.crashMarker) {
    throw new Error('PHASEB_B07_STOP: expected fault NOT observed; inspect ledger manually before retry');
  }
  const saved = phaseB07ValidatePlan_(props.getProperty(PHASEB_B07.intentKey));
  if (props.getProperty(PHASEB_B07.armKey)) {
    throw new Error('PHASEB_B07_STOP: fault still armed');
  }
  const after = phaseB07AssertKnownState_(phaseBPreflightReadOnly(), 4, 'อนุมัติ', [100,100]);
  phaseB07AssertNoPreparedOrUnknownRows_();
  const evidence = {
    status:'PHASEB_B07_INTENT_FAULT_INJECTED',
    simulatedError:PHASEB_B07.crashMarker,
    intent:saved,
    activeMovements:after.postedMovements.length,
    balance:after.balance,
    noStockChange:true
  };
  console.log(JSON.stringify(evidence, null, 2));
  return evidence;
}
/**
 * Separate call AFTER inspecting crash evidence and ensuring no orphan.
 * Expected success: six active movements, QA-004=98, QA-005=97.
 */
function phaseB07RecoverAfterIntentOnce() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty(PHASEB_B07.armKey)) {
    throw new Error('PHASEB_B07_STOP: fault remains armed');
  }
  phaseB07ValidatePlan_(props.getProperty(PHASEB_B07.intentKey));
  phaseB07AssertKnownState_(phaseBPreflightReadOnly(), 4, 'อนุมัติ', [100,100]);
  phaseB07AssertNoPreparedOrUnknownRows_();
  const receipt = setReqStatus(PHASEB_B07.reqId, 'issue');
  if (!receipt.ok) throw new Error('PHASEB_B07_STOP: recovery receipt not OK');
  const after = phaseB07AssertKnownState_(phaseBPreflightReadOnly(), 6, 'จ่ายแล้ว', [98,97]);
  const evidence = {
    status:'PHASEB_B07_RECOVERY_PASS',
    receipt,
    activeMovements:after.postedMovements.length,
    balance:after.balance
  };
  console.log(JSON.stringify(evidence, null, 2));
  return evidence;
}
