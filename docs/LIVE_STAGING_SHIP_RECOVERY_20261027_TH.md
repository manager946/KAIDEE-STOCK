# Live STAGING shipment recovery — after validated B-column error (2026-10-27)

Source screenshot of installed `SalesStaging.gs` confirms latest append-only code:
`const row=Math.max(4,sh.getLastRow()+1);`
`sh.getRange(row,11).setValue(m.id);`
and no write to column B before posting.

Independent read-only Google Sheets checks:
- STAGING file ID: `149kQunDS0c5xxXbcOcNQNsjLWPUINnlSebkG5o-1qys`
- `ออร์เดอร์และใบขาย!H4:L4` = ใบขายสินค้า, SO-KS-QA-LIVE-20261027-ORDER001, ยืนยัน, รอจัดส่ง, ยังไม่ชำระ
- `คลังสินค้า!I8` = 3000 for K2-3000K.
- `บันทึกรับ-จ่าย` row 4 and 5 have orphan timestamps in A only from failed writes, but no stock movements. Other legacy rows have notes/status and MUST NOT be overwritten.
- `บันทึกรับ-จ่าย!K4:K200` contains **no MovementID**.
- `KAIDEE_OperationJournal!A3:D3`: SHIP:KS-QA-LIVE-20261027-ORDER001, SALE, same order, ERROR, payload for **one** K2-3000K line qty 1 and correct saleNo.
- Earlier Google failure = B5 strict data validation (must be รับเข้า or จ่ายออก). Latest code prepares data in C:J, K then L:P, never touches B until allowed final posting value `จ่ายออก`.
- GitHub Actions latest completed SUCCESS, but not live Google shipment acceptance.
- DO NOT delete orphan rows, do NOT deploy production.

## Next guarded recovery test

Copy only the function body below into `StagingDiagnostics.gs` of the *existing STAGING* Apps Script project. Save and select `qaRecoverShipmentOnce`. Run once, then share complete log. This is a **mutating STAGING-only** step. Never run on production.

```javascript
function qaRecoverShipmentOnce() {
  requireAdmin_();
  const p = stagingPreflight();
  if (p.status !== 'READY_FOR_LIVE_STAGING_TEST')
    throw new Error('STAGING preflight ไม่ผ่าน');

  const id = 'KS-QA-LIVE-20261027-ORDER001';
  const key = 'SHIP:' + id;
  const sku = 'K2-3000K';
  const movementId = 'SALE-' + id + '-L01';
  const ss = stagingDb_();
  const op = stagingFind_(stagingSheet_(ss, KDS.ops), 2, KDS.journalCols, 0, key);
  if (!op || String(op.values[1]) !== 'SALE' ||
      String(op.values[3]) !== 'ERROR')
    throw new Error('สถานะธุรกรรมไม่ใช่ SALE/ERROR; ต้องตรวจด้วยคนก่อน');

  const header = stagingOrder_(ss, id);
  if (!header || header.values[7] !== 'ใบขายสินค้า' ||
      header.values[9] !== 'ยืนยัน' ||
      header.values[10] !== 'รอจัดส่ง')
    throw new Error('สถานะใบขายไม่ตรง; ห้ามกู้คืน');

  const beforeMovements = stagingAllMovements_(ss);
  if (beforeMovements.some(m => m.id === movementId))
    throw new Error('พบ MovementID เดิมแล้ว; ต้องตรวจด้วยคนก่อน');
  const balance = () => stagingBalance_(
    stagingInventory_(stagingDb_()),
    stagingAllMovements_(stagingDb_())
  )[sku];
  const before = balance();
  if (before !== 3000)
    throw new Error('ยอดสต๊อกไม่ใช่ 3000; ต้องตรวจด้วยคนก่อน');

  // Resume using the SAME operation key. Never create another order or sale.
  const first = stagingRecoverOperation(key);
  const afterFirst = balance();
  const duplicate = stagingRecoverOperation(key);
  const afterDuplicate = balance();
  const movements = stagingAllMovements_(stagingDb_())
    .filter(m => m.id === movementId);
  const finalHeader = stagingOrder_(stagingDb_(), id);
  const finalOp = stagingFind_(
    stagingSheet_(stagingDb_(), KDS.ops), 2, KDS.journalCols, 0, key);
  const pass = !!(first.ok && duplicate.ok && duplicate.reused === true &&
    afterFirst === 2999 && afterDuplicate === 2999 &&
    movements.length === 1 && movements[0].type === 'จ่ายออก' &&
    movements[0].qty === 1 &&
    finalHeader && finalHeader.values[10] === 'ส่งมอบแล้ว' &&
    finalOp && finalOp.values[3] === 'DONE');
  const result = {
    test: 'LIVE_STAGING_RECOVER_SHIP_EXACTLY_ONCE',
    status: pass ? 'PASS' : 'FAIL',
    beforeStock: before, afterFirst, afterDuplicate,
    movementCount: movements.length,
    duplicateReused: duplicate.reused,
    journalStatus: finalOp ? finalOp.values[3] : 'MISSING',
    deliveryStatus: finalHeader ? finalHeader.values[10] : 'MISSING'
  };
  Logger.log(JSON.stringify(result, null, 2));
  if (!pass) throw new Error('STAGING recovery FAIL; stop and inspect');
  return result;
}
```

Expected: stock 3000 -> 2999 -> 2999, exactly one MovementID and one outgoing entry; journal DONE; delivery ส่งมอบแล้ว.

If it throws, DO NOT retry blindly: a partial stock posting may already exist. Record the full log and read back movements, journal, order and stock first. Do NOT call `qaShipOrderExactlyOnce`, because it expects initial 3000 balance and may incorrectly mark recovery results FAIL. Further tests (return, injected crash recovery, PDF real identities) remain BLOCKED pending this test.
