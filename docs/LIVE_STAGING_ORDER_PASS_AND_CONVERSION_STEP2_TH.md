# STAGING acceptance: Step 1 PASS, Step 2 guarded sale conversion (2026-10-27)

## Step 1, independently verified from LIVE Google Sheets connector

User execution log:
\`\`\`json
{
  "test": "LIVE_GOOGLE_STAGING_ORDER_CREATE_RETRY",
  "status": "PASS",
  "orderId": "KS-QA-LIVE-20261027-ORDER001",
  "orderNo": "OR-QA-LIVE-20261027-ORDER001",
  "duplicateReused": true,
  "salesLines": 1,
  "beforeStock": 3000,
  "afterStock": 3000,
  "noStockChange": true
}
\`\`\`

At verification after that user execution:
- Spreadsheet: \`149kQunDS0c5xxXbcOcNQNsjLWPUINnlSebkG5o-1qys\` (staging title verified).
- \`ออร์เดอร์และใบขาย!A4:D4\`: expected order ID, order number, date and QA customer.
- \`ออร์เดอร์และใบขาย!H4\`: \`ใบออร์เดอร์\`
- \`ออร์เดอร์และใบขาย!J4\`: \`ร่าง\`
- \`ออร์เดอร์และใบขาย!K4\`: \`รอจัดส่ง\`
- \`ออร์เดอร์และใบขาย!L4\`: \`ยังไม่ชำระ\`
- \`ออร์เดอร์และใบขาย!O4:P4\`: \`10,10\`
- \`รายการขาย!A6:H6\`: exactly one line, order ID matches, SKU \`K2-3000K\`, qty 1, unit price 10, total 10.
- \`KAIDEE_OperationJournal!A2:D2\`: \`CREATE:QA-LIVE-20261027-ORDER001\` / \`DONE\`.

**Verdict: LIVE order creation & retry PASS with complete order record.**
The earlier file \`LIVE_STAGING_ORDER_ROW_AUDIT_2026-10-27.md\` documented an earlier transient FAIL (only A:D existed at that time); this document records resolution, not a contradictory simultaneous status.
No production spreadsheet reads/writes or production web-app deployment are needed.

## Step 2: guarded order -> sale conversion, no stock post

Paste into the **existing STAGING** project, \`StagingDiagnostics.gs\` and invoke \`qaConvertOrderNoStockPosting\`. This function mutates only the staging order header H/I/J and **does not** call shipment or stock-posting functions.

\`\`\`javascript
function qaConvertOrderNoStockPosting() {
  requireAdmin_();
  const ready = stagingPreflight();
  if (ready.status !== 'READY_FOR_LIVE_STAGING_TEST') {
    throw new Error('STAGING Preflight ไม่ผ่าน');
  }

  const ss = stagingDb_();
  const id = 'KS-QA-LIVE-20261027-ORDER001';
  const code = 'K2-3000K';
  const before = stagingOrder_(ss, id);
  if (!before) throw new Error('ไม่พบออร์เดอร์ STAGING');
  const h = before.values;
  if (!['ใบออร์เดอร์', 'ใบขายสินค้า'].includes(String(h[7]))) {
    throw new Error('ประเภทเอกสารไม่ถูกต้อง; หยุดเพื่อป้องกันข้อมูลเสีย');
  }
  if (!['ร่าง', 'ยืนยัน'].includes(String(h[9])) ||
      String(h[10]) !== 'รอจัดส่ง' ||
      String(h[11]) !== 'ยังไม่ชำระ' ||
      Number(h[14]) !== 10 || Number(h[15]) !== 10) {
    throw new Error('สถานะหรือยอดเงินไม่ถูกต้อง; หยุดก่อนแปลง');
  }
  const lines = stagingLines_(ss, id);
  if (lines.length !== 1 || lines[0].code !== code ||
      lines[0].qty !== 1 || lines[0].total !== 10) {
    throw new Error('รายการขายไม่ครบ; หยุดก่อนแปลง');
  }

  const beforeMoves = stagingAllMovements_(ss);
  const beforeStock = stagingBalance_(stagingInventory_(ss), beforeMoves)[code];
  const first = stagingConvertOrder(id);
  const second = stagingConvertOrder(id);
  const after = stagingOrder_(ss, id);
  const afterMoves = stagingAllMovements_(ss);
  const afterStock = stagingBalance_(stagingInventory_(ss), afterMoves)[code];

  const movementFingerprint = rows => JSON.stringify(
    rows.map(x => [x.id, x.type, x.code, x.qty, x.doc])
  );

  const expectedSaleNo = 'SO-' + id;
  const pass = Boolean(
    first.ok && second.ok && first.saleNo === expectedSaleNo &&
    second.saleNo === expectedSaleNo &&
    after && after.values[7] === 'ใบขายสินค้า' &&
    String(after.values[8]) === expectedSaleNo &&
    after.values[9] === 'ยืนยัน' &&
    after.values[10] === 'รอจัดส่ง' &&
    beforeStock === afterStock &&
    movementFingerprint(beforeMoves) === movementFingerprint(afterMoves)
  );

  const result = {
    test: 'LIVE_STAGING_CONVERT_TO_SALE_NO_STOCK_POST',
    status: pass ? 'PASS' : 'FAIL',
    orderId: id,
    saleNo: first.saleNo,
    duplicateSaleNo: second.saleNo,
    documentType: after ? String(after.values[7]) : 'MISSING',
    documentStatus: after ? String(after.values[9]) : 'MISSING',
    beforeStock, afterStock,
    noStockPosting: beforeStock === afterStock &&
      movementFingerprint(beforeMoves) === movementFingerprint(afterMoves)
  };
  Logger.log(JSON.stringify(result, null, 2));
  if (!pass) throw new Error('STAGING conversion FAIL - stop before shipment');
  return result;
}
\`\`\`

## Do not proceed automatically

Until Step 2 is verified by readback, do NOT invoke \`stagingShipOrder\`, \`stagingReverseOrder\`, any PDF sharing, or deploy production. Do not alter the production spreadsheet or existing webapp. After Step 2 is PASS, separately test shipment, duplicate shipment, return, recovery, and real-identity PDF permissions.
