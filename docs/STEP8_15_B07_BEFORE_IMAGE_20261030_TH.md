# Step 8.15 Phase B07 — Pre-change synthetic snapshot / readiness

**Status:** Synthetic read-only before-image captured; no B07 crash injection run.
**Scope:** Only isolated synthetic Google Sheet titled `KAIDEE-STOCK-SYNTHETIC-QA-STEP8-15`. The production and original staging Sheets, Apps Script projects, deployment, PDF ACLs and PR merge are out of scope.

## Sanitized bounded before-image (2026-10-30, Asia/Bangkok)
- Inventory 52 fictional SKUs `QA-001` through `QA-052` in `คลังสินค้า!A8:I59`, opening=100 each.
- Exactly 52 row-relative G/H/I formulas were read (formula strings not copied into this document).
- Stock `[SKU,opening,received,issued,balance]`:
  - `QA-001,100,0,5,95`
  - `QA-002,100,0,4,96`
  - `QA-003,100,0,1,99`
  - `QA-004,100,0,0,100`
  - `QA-005,100,0,0,100`
  - `QA-006`–`QA-052`: `100,0,0,100`.
- The four active ledger movements in `บันทึกรับ-จ่าย`:
  | ID | SKU | Qty | Document |
  | --- | --- | ---: | --- |
  | `REQ-QA-PB-001-1` | QA-001 | 2 | QA-PB-RQ001 |
  | `REQ-QA-PB-001-2` | QA-001 | 3 | QA-PB-RQ001 |
  | `REQ-QA-PB-002-1` | QA-002 | 4 | QA-PB-RQ002 |
  | `REQ-QA-PB-002-2` | QA-003 | 1 | QA-PB-RQ002 |
- Two requisition headers: `QA-PB-001` and `QA-PB-002`, both `จ่ายแล้ว`; four lines (QA-001 qty 2+3, QA-002 qty 4, QA-003 qty 1).
- All 52 displayed numerical balances correct; zero duplicate MovementIDs in the scanned range. Do not alter historical 001/002 data for the next test.
- Snapshot checksum (FNV-1a 32 over canonical JSON comprising inventory A/F/G/H/I numeric values, active ledger B/C/E/K/N, requisition A/B/G, line A-D and 52 G/H/I formula text rows, in that exact order): `fnv1a32:dfb7e756`.
- This is a **sanitized bounded evidence snapshot**, not a full restorable Google Sheets backup. The exact backup of test-only Script Properties is **not accessible** from current tool connections. Prior to any deliberate crash, export the original 001/002 `REQ_ISSUE_V1_` test-only properties privately from the isolated Apps Script QA project, without sharing values in GitHub. Do **not** erase or alter them.

## B07 preconditions and stops
1. The existing Phase B adapter currently rejects a third requisition. Upgrade the **isolated QA adapter only** to verify exact 001/002/003 fixture shape before running Preflight after inserting 003. Do not weaken the spreadsheet ID/title/sentinel checks or the source Code.gs guard.
2. Add `QA-PB-003` with two new synthetic lines, QA-004 qty 2 and QA-005 qty 3, status `อนุมัติ`, and **zero** posted movements for this new requisition. Never repurpose 001/002.
3. Confirm distinct header ID, document number and line IDs; existing ledger remains the same four rows; 52-row stock unchanged.
4. Prior to simulated crashes, capture the test-only `REQ_ISSUE_V1_QA-PB-003` property state in Apps Script (expected absent before first attempt). Without a verified isolated test-only fault injection runner, **do not** invoke `setReqStatus('QA-PB-003','issue')` because it would simply post normally, not test recovery.
5. A real crash during multi-line issue is not atomic; record any partial balance and do not call retry automatically if the returned result or ledger is ambiguous.
6. No formula migration on original STAGING and no production or shared-file modifications.

**Release decision:** B04–B06.1 passed; B07 actual crash/recovery **NOT YET RUN**.
