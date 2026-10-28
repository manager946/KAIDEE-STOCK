# STAGING LIVE QA — shipment reconciliation and step 4 return (27 October 2026)

## Live reconciliation: important defect found and fixed (STAGING Sheet only)

User supplied a successful live Apps Script result:
\`\`\`json
{
  "test":"LIVE_STAGING_RECOVER_SHIP_EXACTLY_ONCE",
  "status":"PASS",
  "beforeStock":3000,
  "afterFirst":2999,
  "afterDuplicate":2999,
  "movementCount":1,
  "duplicateReused":true,
  "journalStatus":"DONE",
  "deliveryStatus":"ส่งมอบแล้ว"
}
\`\`\`

Independent connector read of **STAGING copy only** (\`149kQunDS0c5xxXbcOcNQNsjLWPUINnlSebkG5o-1qys\`) initially exposed discrepancy: \`คลังสินค้า!H8\` **2** and \`I8\` **2998**, even though there was exactly one \`จ่ายออก\` movement in row 101, quantity 1, MovementID \`SALE-KS-QA-LIVE-20261027-ORDER001-L01\`, and just one sold line. Cause: inventory outflow formula summed both \`บันทึกรับ-จ่าย\` outgoing movements and \`รายการขาย\` lines belonging to delivered, confirmed sales **without excluding already-journaled lines**. Apps Script \`stagingBalance_\` counted movements only, masking native formula double-count.

### STAGING-only formula repair performed via Google Sheets API
- Tested a subtraction term in temporary \`ชีต1!Y1\`: COUNT/FILTER matched one double-counted sale line; test output **1**.
- Added the tested subtraction term to **existing H formulas only** in \`คลังสินค้า!H8:H59\`, preserving every existing receipt, request and legacy-sale component and formatting. Specifically subtract quantities of delivered, confirmed sale lines where \`บันทึกรับ-จ่าย!K4:K\` already includes \`"SALE-"&SaleLineID\`.
- Verified **52/52** SKU outflow formulas contain \`ARRAYFORMULA(COUNTIF(\`; no non-reconciled SKU found.
- Verified native sheet H8=1, I8=2999; next SKU H9=0, I9=500; unchanged document "ใบขายสินค้า"/"ยืนยัน"/"ส่งมอบแล้ว"; journal CREATE and SHIP both DONE.
- Cleared temporary \`ชีต1!Y1\`, restoring it to blank.
- **No production Sheet or web app was edited.** Original formulas were read and their standard components preserved.
- **Do not call \`fixFormulas()\`**: in Code.gs this function resets the H inventory column to a ledger-only formula, overwriting the reconciliation and legacy requested/confirmed sale components. Keep production blocked until formula solution is tested and explicitly migrated into the application’s normal formula management.

Live shipment with repeat: **PASS at ledger/operation level; PASS after STAGING stock formula repair in Google Sheets**. Failure injection and real-user PDF permissions remain untested.

## Step 4 — guarded single-unit reversal and duplicate-return test

**DANGER:** This is a real write to the private **STAGING COPY ONLY**. Do not call on production or when the order/movement/stock values differ from the specified guards. Paste only the following function into the already-existing \`StagingDiagnostics.gs\`, save, then select and run \`qaReturnAfterShipmentExactlyOnce\` ONE TIME. If it throws, stop without rerunning and inspect sheet/journal/readback.

\`\`\`javascript
function qaReturnAfterShipmentExactlyOnce() {
  requireAdmin_();
  const p = stagingPreflight();
  if (p.status !== 'READY_FOR_LIVE_STAGING_TEST')
    throw new Error('STAGING preflight ไม่ผ่าน');
  const ss = stagingDb_();
  if (ss.getId() !== '149kQunDS0c5xxXbcOcNQNsjLWPUINnlSebkG5o-1qys')
    throw new Error('Spreadsheet ID ไม่ใช่ STAGING ที่อนุญาต');

  const id = 'KS-QA-LIVE-20261027-ORDER001';
  const sku = 'K2-3000K';
  const lineId = id + '-L01';
  const order = stagingOrder_(ss, id);
  if (!order || order.values[7] !== 'ใบขายสินค้า' ||
      order.values[9] !== 'ยืนยัน' ||
      order.values[10] !== 'ส่งมอบแล้ว')
    throw new Error('สถานะใบขายไม่ตรง; ห้ามคืนสินค้า');

  const shipOp = stagingFind_(stagingSheet_(ss, KDS.ops),
    2, KDS.journalCols, 0, 'SHIP:' + id);
  const existing = stagingAllMovements_(ss);
  if (!shipOp || shipOp.values[3] !== 'DONE' ||
      existing.filter(m => m.id === 'SALE-' + lineId &&
        m.code === sku && m.type === 'จ่ายออก' && m.qty === 1).length !== 1 ||
      existing.some(m => m.id === 'SALE-REV-' + lineId))
    throw new Error('พบ MovementID ไม่ถูกต้องหรือคืนสินค้าไปแล้ว');

  const inventorySheet = stagingSheet_(ss, KDS.inv);
  const balance = () => stagingBalance_(stagingInventory_(ss),
    stagingAllMovements_(ss))[sku];
  const before = balance(), nativeBefore = Number(inventorySheet.getRange(8, 9).getValue());
  if (before !== 2999 || nativeBefore !== 2999)
    throw new Error('ยอดก่อนคืนไม่ใช่ 2999; ห้ามบันทึก');

  const first = stagingReverseOrder(id, 'QA-STAGING-RETURN-20261027');
  SpreadsheetApp.flush();
  const afterFirst = balance();
  const duplicate = stagingReverseOrder(id, 'QA-STAGING-RETURN-20261027');
  SpreadsheetApp.flush();
  const afterDuplicate = balance();
  const nativeAfter = Number(inventorySheet.getRange(8, 9).getValue());
  const reversed = stagingAllMovements_(ss).filter(m =>
    m.id === 'SALE-REV-' + lineId);
  const finalOrder = stagingOrder_(ss, id);
  const journal = stagingFind_(stagingSheet_(ss, KDS.ops),
    2, KDS.journalCols, 0, 'REVERSE:' + id);
  const pass = Boolean(
    first.ok && duplicate.ok && duplicate.reused === true &&
    afterFirst === 3000 && afterDuplicate === 3000 && nativeAfter === 3000 &&
    reversed.length === 1 && reversed[0].code === sku &&
    reversed[0].type === 'รับเข้า' && reversed[0].qty === 1 &&
    finalOrder && finalOrder.values[9] === 'ยกเลิก' &&
    journal && journal.values[3] === 'DONE'
  );

  const result = {
    test: 'LIVE_STAGING_RETURN_EXACTLY_ONCE',
    status: pass ? 'PASS' : 'FAIL',
    orderId: id,
    beforeStock: before, nativeBefore,
    afterFirst, afterDuplicate, nativeAfter,
    reverseMovementCount: reversed.length,
    duplicateReused: duplicate.reused,
    documentStatus: finalOrder ? finalOrder.values[9] : 'MISSING',
    reverseJournalStatus: journal ? journal.values[3] : 'MISSING'
  };
  Logger.log(JSON.stringify(result, null, 2));
  if (!pass) throw new Error('QA return FAIL; STOP and inspect');
  return result;
}
\`\`\`

Expected result: sale cancellation document status \`ยกเลิก\` and exactly one return movement with qty 1; outgoing qty 1; native formula stock 2999 -> 3000 -> 3000; \`REVERSE:<orderId>\` Journal DONE; second call reused. The strict native delivery-status dropdown does not have a "returned" value; the code preserves K="ส่งมอบแล้ว" and records return in doc cancellation, reversal journal and K-cell note.

After this PASS verify live Sheets by independent connector read. Separate failure injection and permission tests still required before production.
