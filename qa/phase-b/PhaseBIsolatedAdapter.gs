/**
 * KAIDEE-STOCK Step 8.15 Phase B — TEST-ONLY, NEVER DEPLOY.
 *
 * Standalone NEW Apps Script project only. Include the reviewed
 * apps-script/Code.gs from Draft PR #5 and THIS file, but NOT SalesStaging.gs
 * (which also declares stagingDb_). Run functions from editor only.
 *
 * Absolutely no copied Production/STAGING Properties, PDFs, UI deployments,
 * Gmail permissions or additional source sheets.
 *
 * CONFIGURE IN THIS NEW PROJECT'S SCRIPT PROPERTIES ONLY:
 *   KAIDEE_PHASEB_SYNTHETIC_SPREADSHEET_ID = exact synthetic-only workbook ID.
 * Do not commit the ID or other account-specific values to GitHub.
 */
const PHASEB_QA = Object.freeze({
  property: 'KAIDEE_PHASEB_SYNTHETIC_SPREADSHEET_ID',
  exactTitle: 'KAIDEE-STOCK-SYNTHETIC-QA-STEP8-15',
  sentinel: 'KAIDEE-STOCK SYNTHETIC QA — NO REAL DATA',
  allowedTabs: ['คลังสินค้า', 'บันทึกรับ-จ่าย', 'ใบเบิกสินค้า', 'รายการใบเบิก']
});

/** Replace SalesStaging.gs's stagingDb_ ONLY in this isolated test project. */
function stagingDb_() {
  const props = PropertiesService.getScriptProperties();
  const id = String(props.getProperty(PHASEB_QA.property) || '');
  if (!/^[A-Za-z0-9_-]{20,}$/.test(id)) {
    throw new Error('PHASEB_STOP: missing valid synthetic sheet ID property');
  }
  const existingStaging = props.getProperty('KAIDEE_STAGING_SPREADSHEET_ID');
  if (existingStaging && existingStaging === id) {
    throw new Error('PHASEB_STOP: cannot target an existing STAGING property');
  }
  const ss = SpreadsheetApp.openById(id);
  if (ss.getId() !== id || ss.getName() !== PHASEB_QA.exactTitle) {
    throw new Error('PHASEB_STOP: synthetic spreadsheet ID/title mismatch');
  }
  const tabs = ss.getSheets().map(sh => sh.getName()).sort();
  if (JSON.stringify(tabs) !== JSON.stringify(PHASEB_QA.allowedTabs.slice().sort())) {
    throw new Error('PHASEB_STOP: unexpected/missing synthetic sheet tabs');
  }
  const inv = ss.getSheetByName('คลังสินค้า');
  if (inv.getRange('A1').getDisplayValue() !== PHASEB_QA.sentinel) {
    throw new Error('PHASEB_STOP: missing synthetic-only sentinel');
  }
  const codes = inv.getRange(8, 1, 52, 1).getDisplayValues().map(row => row[0]);
  if (!codes.every((code, i) => code === 'QA-' + ('000' + (i + 1)).slice(-3))) {
    throw new Error('PHASEB_STOP: unexpected inventory identity / real data risk');
  }
  return ss;
}

/** Read-only safety audit; call before every issue/retry in this separate project. */
function phaseBPreflightReadOnly() {
  const ss = stagingDb_();
  const audit = stockFormulaAudit_();
  if (!audit.safeForNewRequisitionIssue || audit.checkedSkuCount !== 52) {
    throw new Error('PHASEB_STOP: formula audit not safe for 52 synthetic SKUs');
  }
  const reqs = readReqs_(), moves = readMv_(), items = readItems_();
  const expected = ['QA-PB-001', 'QA-PB-002', 'QA-PB-003'];
  if (reqs.length !== expected.length || reqs.some(r => expected.indexOf(r.id) < 0)) {
    throw new Error('PHASEB_STOP: requisition fixture mismatch');
  }
  const spec = {
    'QA-PB-001': [['QA-001', 2], ['QA-001', 3]],
    'QA-PB-002': [['QA-002', 4], ['QA-003', 1]],
    'QA-PB-003': [['QA-004', 2], ['QA-005', 3]]
  };
  reqs.forEach(r => {
    const want = spec[r.id];
    if (r.no !== 'QA-PB-RQ' + r.id.slice(-3) ||
        r.lines.length !== want.length ||
        r.lines.some((line, i) => line.code !== want[i][0] || line.qty !== want[i][1])) {
      throw new Error('PHASEB_STOP: requisition payload mismatch');
    }
    if (['อนุมัติ', 'จ่ายแล้ว'].indexOf(r.status) < 0) {
      throw new Error('PHASEB_STOP: unexpected request status');
    }
  });
  const ids = moves.map(m => m.id);
  if (new Set(ids).size !== ids.length ||
      moves.some(m => !/^REQ-QA-PB-00[123]-[12]$/.test(m.id) ||
                      m.type !== 'จ่ายออก' || !m.doc || m.qty <= 0)) {
    throw new Error('PHASEB_STOP: unknown or duplicate active ledger rows');
  }
  const balance = balances_(items, moves);
  const keys = ['QA-001', 'QA-002', 'QA-003'];
  if (keys.some(key => !Number.isFinite(balance[key])) ||
      !Number.isFinite(balance['QA-004']) || !Number.isFinite(balance['QA-005'])) {
    throw new Error('PHASEB_STOP: missing synthetic balance');
  }
  return {
    status: 'ISOLATED_SYNTHETIC_PREFLIGHT_PASS',
    formula: audit.status,
    skuCount: audit.checkedSkuCount,
    requestStatus: reqs.map(r => ({id: r.id, status: r.status})),
    postedMovements: moves.map(m => ({id: m.id, sku: m.code, qty: m.qty, doc: m.doc})),
    balance: {QA001: balance['QA-001'], QA002: balance['QA-002'], QA003: balance['QA-003'],
      QA004: balance['QA-004'], QA005: balance['QA-005']}
  };
}

function phaseBAssert_(snapshot, expectedCount, expectedBalances) {
  if (snapshot.postedMovements.length !== expectedCount) throw new Error('PHASEB_FAIL: movement count');
  ['QA001','QA002','QA003'].forEach((key, i) => {
    if (snapshot.balance[key] !== expectedBalances[i]) {
      throw new Error('PHASEB_FAIL: stock balance ' + key);
    }
  });
  return snapshot;
}

/** Run deliberately from NEW Apps Script editor, never from public WebApp. */
function phaseBRunFirstIssue() {
  const pre = phaseBPreflightReadOnly();
  if (![0,1,2].includes(pre.postedMovements.length) ||
      pre.postedMovements.some(m => m.doc !== 'QA-PB-RQ001')) {
    throw new Error('PHASEB_STOP: first requisition has unrelated stock postings');
  }
  const receipt = setReqStatus('QA-PB-001', 'issue');
  return {receipt, after: phaseBAssert_(phaseBPreflightReadOnly(), 2, [95,100,100])};
}

/** Safe to call repeatedly; expect 'reused:true' and no additional movement. */
function phaseBRetryFirstIssue() {
  phaseBAssert_(phaseBPreflightReadOnly(), 2, [95,100,100]);
  const receipt = setReqStatus('QA-PB-001', 'issue');
  if (receipt.reused !== true) throw new Error('PHASEB_FAIL: first retry not reused');
  return {receipt, after: phaseBAssert_(phaseBPreflightReadOnly(), 2, [95,100,100])};
}

function phaseBRunSecondIssue() {
  phaseBAssert_(phaseBPreflightReadOnly(), 2, [95,100,100]);
  const receipt = setReqStatus('QA-PB-002', 'issue');
  return {receipt, after: phaseBAssert_(phaseBPreflightReadOnly(), 4, [95,96,99])};
}
