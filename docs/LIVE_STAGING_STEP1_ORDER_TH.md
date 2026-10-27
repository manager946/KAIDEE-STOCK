# Live Google Staging acceptance — Step 1: order creation / idempotency smoke

Preflight evidence supplied by user (2026-10-27 15:33:03 Asia/Bangkok):
- status = READY_FOR_LIVE_STAGING_TEST
- userRole = admin
- targetPropertyConfigured = true
- pdfPrivateByDefault = true
- pdfStagingFolderIsolated = true
- 7/7 required tab header checks PASS

**This is evidence only for a read-only preflight, not transaction acceptance.**

Before testing, a connector read of the private staging sheet confirmed:
- Workbook title starts KAIDEE-STOCK STAGING
- SKU K2-3000K exists, with displayed balance 3,000 in staging (may have since changed)
- Order and sale-line tabs exist

## Paste this QA function into StagingDiagnostics.gs of the existing STAGING project

\`\`\`javascript
function qaCreateOrderOnlyOnce() {
  requireAdmin_();
  const preflight = stagingPreflight();
  if (preflight.status !== 'READY_FOR_LIVE_STAGING_TEST') {
    throw new Error('Preflight ยังไม่ผ่าน ห้ามสร้างออร์เดอร์');
  }

  // Fixed mutation ID: re-running this test never creates another order.
  const payload = {
    clientMutationId: 'QA-LIVE-20261027-ORDER001',
    customer: 'QA TEST ONLY - NOT A REAL CUSTOMER',
    note: 'STAGING QA ONLY - DO NOT SHIP',
    lines: [{code: 'K2-3000K', qty: 1, price: 10}]
  };
  const db = stagingDb_();
  const code = 'K2-3000K';
  const before = stagingBalance_(
    stagingInventory_(db), stagingAllMovements_(db))[code];

  const first = stagingCreateOrder(payload);
  const duplicate = stagingCreateOrder(payload);
  const row = stagingOrder_(db, first.orderId);
  const lines = stagingLines_(db, first.orderId);
  const after = stagingBalance_(
    stagingInventory_(db), stagingAllMovements_(db))[code];

  const pass = Boolean(
    first.ok && duplicate.ok &&
    duplicate.orderId === first.orderId &&
    duplicate.reused === true &&
    row && lines.length === 1 &&
    lines[0].code === code && lines[0].qty === 1 &&
    before === after
  );
  const result = {
    test: 'LIVE_GOOGLE_STAGING_ORDER_CREATE_RETRY',
    status: pass ? 'PASS' : 'FAIL',
    orderId: first.orderId,
    orderNo: first.no,
    firstCallReused: first.reused,
    duplicateReused: duplicate.reused,
    salesLines: lines.length,
    beforeStock: before,
    afterStock: after,
    noStockChange: before === after
  };
  Logger.log(JSON.stringify(result, null, 2));
  if (!pass) throw new Error('QA FAIL - stop. Inspect log / do not fulfill order.');
  return result;
}
\`\`\`

## How to run
1. Edit only the existing \`KAIDEE-STOCK-STAGING-TEST-20261027\` project.
2. Paste function **once** into \`StagingDiagnostics.gs\` and save.
3. Select \`qaCreateOrderOnlyOnce\` and press Run. No deployment is required.
4. Record entire execution log. Compare \`ออร์เดอร์และใบขาย\` and \`รายการขาย\` using the returned orderId. Expect exactly one order and one line, no movement and no stock change.
5. If a run fails, **do not change clientMutationId** to force retry; inspect journal and resume using the same key.

Never run this function in production. Do not call \`stagingShipOrder\`, \`stagingReverseOrder\`, \`fixFormulas\`, or deployment from this smoke-test step.

Next after PASS: independent order-to-sale conversion, shipment and duplicate shipment with stock reconciliation, fault injection and recovery, and PDF access with real user identities.
