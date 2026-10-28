# การตรวจออร์เดอร์บน Google STAGING หลัง QA รายงาน PASS — 2026-10-27

**สถานะ: PARTIAL FAIL / STOP BEFORE SALE CONVERSION.** ห้าม Deploy Production.

Google Apps Script execution supplied by user:
\`\`\`json
{"test":"LIVE_GOOGLE_STAGING_ORDER_CREATE_RETRY","status":"PASS","orderId":"KS-QA-LIVE-20261027-ORDER001","duplicateReused":true,"salesLines":1,"beforeStock":3000,"afterStock":3000,"noStockChange":true}
\`\`\`

Independent *read-only* connector verification:
- \`ออร์เดอร์และใบขาย!A4:D4\`: OrderID, order number, date, test customer **exist**
- \`ออร์เดอร์และใบขาย!E4:W4\`: **no entered values** (including H, J, K, L, O, P)
- \`รายการขาย!A6:H6\`: one line, SKU K2-3000K, quantity 1, unit price 10, total 10
- \`KAIDEE_OperationJournal!A2:D2\`: operation CREATE with same OrderID, status DONE
- \`คลังสินค้า!I8\`: 3000; \`บันทึกรับ-จ่าย\` has no movement rows in inspected range.

Thus the previous \`qaCreateOrderOnlyOnce()\` asserted *existence* of an order row, not *completeness*. A PASS from it is not an end-to-end order creation PASS.

## Safe read-only next diagnostic

Add the following **new function only** to \`StagingDiagnostics.gs\` in the existing STAGING project. Run \`qaInspectIncompleteOrderReadOnly\`; **do not rerun a transaction yet**.

\`\`\`javascript
function qaInspectIncompleteOrderReadOnly() {
  requireAdmin_();
  const ss = stagingDb_();
  const id = 'KS-QA-LIVE-20261027-ORDER001';
  const key = 'CREATE:QA-LIVE-20261027-ORDER001';
  const sh = ss.getSheetByName('ออร์เดอร์และใบขาย');
  const data = sh.getLastRow() >= 2
    ? sh.getRange(2, 1, sh.getLastRow() - 1, 23).getValues()
    : [];
  const matches = data.map((r,i) => ({row: i+2, values:r}))
    .filter(x => String(x.values[0]) === id);
  const v = matches.length === 1 ? matches[0].values : [];
  const lines = stagingLines_(ss, id);
  const journal = ss.getSheetByName('KAIDEE_OperationJournal');
  const op = journal
    ? stagingFind_(journal, 2, 8, 0, key) : null;
  const fields = {
    H: String(v[7] || ''),
    J: String(v[9] || ''),
    K: String(v[10] || ''),
    L: String(v[11] || ''),
    O: v[14] === '' ? '' : Number(v[14]),
    P: v[15] === '' ? '' : Number(v[15])
  };
  const complete = matches.length === 1 &&
    fields.H === 'ใบออร์เดอร์' &&
    fields.J === 'ร่าง' &&
    fields.K === 'รอจัดส่ง' &&
    fields.L === 'ยังไม่ชำระ' &&
    fields.O === 10 && fields.P === 10 &&
    lines.length === 1 &&
    lines[0].code === 'K2-3000K' &&
    lines[0].qty === 1 && lines[0].total === 10 &&
    op && String(op.values[3]) === 'DONE';
  const result = {
    test: 'LIVE_ORDER_ROW_COMPLETENESS_READ_ONLY',
    status: complete ? 'PASS' : 'FAIL',
    orderRows: matches.length,
    rowNumber: matches.length === 1 ? matches[0].row : null,
    fields, lineCount: lines.length,
    journalStatus: op ? String(op.values[3]) : 'MISSING',
    // Heuristic: checks whether the deployed function source includes a
    // completion assertion from the latest GitHub patch.
    completionGuardDetected:
      String(stagingCreateOrder).indexOf('ออร์เดอร์บันทึกไม่ครบ') !== -1,
    note: 'READ ONLY. No rows or Script Properties were changed.'
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}
\`\`\`

## Decision

If \`completionGuardDetected=false\`: Apps Script may still execute an older \`SalesStaging.gs\` implementation. Safely back up and replace that file with the latest from Draft PR #4, save, then rerun this **read-only** function; only retry create after confirming source version.

If \`completionGuardDetected=true\` and values remain blank, inspect exact script file content, any duplicate function names, and logs before attempting any write; do not manually fill the missing values.

If \`status=PASS\`, re-read the sheet and proceed to controlled conversion tests separately.

**Production and original Google Sheet remain out of scope.**
