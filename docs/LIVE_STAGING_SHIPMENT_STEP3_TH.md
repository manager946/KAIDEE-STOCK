# STAGING step 2 PASS, step 3 shipment and duplicate-post check

Verified read-only from STAGING Google Sheet after user supplied LIVE_STAGING_CONVERT_TO_SALE_NO_STOCK_POST PASS:
- `ออร์เดอร์และใบขาย!H4:L4`: `ใบขายสินค้า`, `SO-KS-QA-LIVE-20261027-ORDER001`, `ยืนยัน`, `รอจัดส่ง`, `ยังไม่ชำระ`
- `O4:P4`: 10, 10
- `คลังสินค้า!I8`: 3000; no movement in inspected rows.

Before shipment, fixed `SalesStaging.gs` to leave movement B blank while PREPARED: real STAGING `บันทึกรับ-จ่าย!B4` uses strict dropdown of `รับเข้า` or `จ่ายออก`. MovementID records prepared state; phase 2 sets B to `จ่ายออก`. Commit 133cdbdd89e1d78c6af463f0215f727f800426ef, test e126ae48affab6ea0f2ab8df21186208d9a264a7.

**Do NOT ship using prior SalesStaging.gs**. Replace ONLY SalesStaging.gs in existing STAGING Apps Script project with latest code from test/isolated-staging-integration-2026-10-27, then save; never deploy or edit production.

### Code (copy code body only, not Markdown backticks)

```javascript
function qaShipOrderExactlyOnce() {
  requireAdmin_();
  const preflight = stagingPreflight();
  if (preflight.status !== 'READY_FOR_LIVE_STAGING_TEST')
    throw new Error('Preflight ไม่ผ่าน');

  const ss = stagingDb_();
  const id = 'KS-QA-LIVE-20261027-ORDER001';
  const code = 'K2-3000K';
  const order = stagingOrder_(ss, id);
  if (!order || order.values[7] !== 'ใบขายสินค้า' ||
      order.values[9] !== 'ยืนยัน' ||
      !['รอจัดส่ง', 'ส่งมอบแล้ว'].includes(order.values[10]))
    throw new Error('ใบขายยังไม่พร้อมส่งมอบ');

  const lines = stagingLines_(ss,id);
  if (lines.length !== 1 || lines[0].code !== code ||
      lines[0].qty !== 1 || lines[0].total !== 10)
    throw new Error('รายการขายทดสอบไม่ถูกต้อง');

  const balance = () => stagingBalance_(
    stagingInventory_(stagingDb_()),
    stagingAllMovements_(stagingDb_())
  )[code];

  const before = balance();
  const first = stagingShipOrder(id);
  const middle = balance();
  const second = stagingShipOrder(id);
  const after = balance();
  const refreshed = stagingOrder_(stagingDb_(),id);
  const movements = stagingAllMovements_(stagingDb_())
    .filter(m => m.id === 'SALE-' + id + '-L01');
  const pass = !!(
    first.ok && second.ok && second.reused === true &&
    middle === before - 1 && after === middle &&
    refreshed && refreshed.values[10] === 'ส่งมอบแล้ว' &&
    movements.length === 1 &&
    movements[0].type === 'จ่ายออก' && movements[0].qty === 1
  );
  const result = {
    test:'LIVE_STAGING_SHIP_EXACTLY_ONCE',
    status:pass?'PASS':'FAIL',
    orderId:id,
    beforeStock:before,
    afterFirstShipment:middle,
    afterDuplicateShipment:after,
    duplicateReused:second.reused,
    movementCount:movements.length
  };
  Logger.log(JSON.stringify(result,null,2));
  if (!pass) throw new Error('QA shipment FAIL; หยุดทดสอบ');
  return result;
}
```

Running this function **does write one outgoing movement in STAGING**. It is not a read-only test. Before starting, verify the version was updated and that no other staff are using this test sheet. If exception: STOP and provide the full execution log, do not blindly rerun. After PASS, independently verify `บันทึกรับ-จ่าย!B4` and `คลังสินค้า!I8`; then separately test reversal, failure injection/recovery, real user PDF permissions.

**Production must remain untouched.**
