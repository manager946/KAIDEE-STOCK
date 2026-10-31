# KAIDEE-STOCK — Phase B07 Live Recovery Independent Verification

ตรวจสอบวันที่ **31 ตุลาคม 2026** (Asia/Bangkok). Scope: **standalone QA Apps Script + separate synthetic-only Google Sheet**, NOT original STAGING or Production.

## 1. Runtime evidence from owner

Owner provided the following successful result from the isolated QA project (sanitized — no secret properties):

```json
{
  "status": "PHASEB_B07_RECOVERY_PASS",
  "receipt": {"ok": true, "reused": false},
  "activeMovements": 6,
  "balance": {
    "QA001": 95, "QA002": 96, "QA003": 99, "QA004": 98, "QA005": 97
  }
}
```

Interpretation: new first-time posting occurred while resuming existing **valid durable intent** for synthetic requisition `QA-PB-003`. The `reused:false` receipt is **expected**, because there were no already-active 003 movements prior to this recovery. This alone does **not** prove process termination or every crash boundary. The prior owner diagnostic had `hasIntent:true`, `intentValidation:VALID`, `hasArm:false`, `relatedLedgerRows:0`; at that checkpoint, exactly 4 old movements were independently confirmed in Google Sheets.

The ChatGPT connector **cannot directly read Apps Script Script Properties or execute Apps Script functions**, so post-recovery property integrity, fault timing and actual owner execution ID remain based on owner evidence, not independent connector proof.

## 2. Independently read Google Sheets **after** owner recovery

Target title: `KAIDEE-STOCK-SYNTHETIC-QA-STEP8-15` (previously verified to be independent from original STAGING/Production).

Read-only, bounded ranges:
- `คลังสินค้า!A8:I59` calculated values (52 SKU rows)
- `คลังสินค้า!G8:I59` formula text
- `บันทึกรับ-จ่าย!A4:N50` ledger values
- `ใบเบิกสินค้า!A2:K8` requisition headers
- `รายการใบเบิก!A2:G10` requisition lines

| Check | Independent observation | Result |
| --- | --- | --- |
| 52 SKUs and opening | `QA-001`–`QA-052`, opening 100 each | PASS |
| H formula row references | 52/52 H formulas contain matching relative `A<row>` and no legacy paid-REQ / SALES fallback | PASS for inspected formula shape |
| Movement-only balance | For every SKU: `G=SUM(receipt ledger)`, `H=SUM(issue ledger)`, `I=F+G-H` | PASS 52/52 |
| Number of active ledger rows | **6** outward, 0 ambiguous/inert rows in bounded scan | PASS |
| IDs | Six unique and nonempty MovementIDs, all quantity/sku/doc matches | PASS |
| Requisition `QA-PB-003` | `จ่ายแล้ว`, issuer and issued time populated | PASS |
| Historical `QA-PB-001`/`002` | Both remain `จ่ายแล้ว` with issuer and issued timestamp | PASS visible headers |
| QA-004 / QA-005 | Remaining **98 / 97** (starting from 100, subtract 2 / 3) | PASS |
| Other balances | QA-001=95, QA-002=96, QA-003=99; QA-006–QA-052=100 | PASS |
| Duplicate or malformed active ledger | 0 duplicate IDs, 0 active rows missing ID/sku/doc/qty within scan | PASS |

Verified active movements:

| MovementID | SKU | Type | Qty | Document |
| --- | --- | --- | ---: | --- |
| `REQ-QA-PB-001-1` | QA-001 | จ่ายออก | 2 | QA-PB-RQ001 |
| `REQ-QA-PB-001-2` | QA-001 | จ่ายออก | 3 | QA-PB-RQ001 |
| `REQ-QA-PB-002-1` | QA-002 | จ่ายออก | 4 | QA-PB-RQ002 |
| `REQ-QA-PB-002-2` | QA-003 | จ่ายออก | 1 | QA-PB-RQ002 |
| `REQ-QA-PB-003-1` | QA-004 | จ่ายออก | 2 | QA-PB-RQ003 |
| `REQ-QA-PB-003-2` | QA-005 | จ่ายออก | 3 | QA-PB-RQ003 |

## 3. QA gate decision and remaining activities

- **B07 Recovery from a previously persisted valid intent: PASS**, supported by owner execution result **and** independent post-recovery actual Google Sheets comparison.
- **B07 exact simulated-crash moment: INCONCLUSIVE**, because the full original fault injection run/marker was not provided. Observed prior saved intent without ledger entries is consistent with after-intent interruption but does not conclusively establish precisely how it arose.
- **B07 post-recovery same-REQ idempotent retry: PENDING**. Before any retry, verify in isolated QA Script Properties that the 003 intent is intact and `PHASEB_B07_ARM_QA-PB-003` is absent, then run one reviewed `setReqStatus('QA-PB-003','issue')` with readback; expected `{ok:true,reused:true}`, six same active rows, unchanged 52 balances and header/intent. Any timeout/error: STOP, no further retries.
- **Real LockService contention / distributed flush failure / actual quota / partial-commit fault / full property+ledger rollback**: NOT PROVEN. Offline tests are not substitutes for these live cases.
- Existing original STAGING formulas `คลังสินค้า!H8:H59` still include hybrid requisition fallback, **not safe for live issue/migration**. No Production permission or release is implied.
- No changes made to synthetic Sheet or Apps Script during this verification. No original STAGING/Production, PDF ACL, Deploy or Merge changes. Keep **Draft PR #5** DRAFT.

## 4. Associated offline QA

Before this addendum, matching-SHA CI for `5e5b3ff77e3b1e57c7c2438707a477523fc35861`: [PR run 41167619819](https://github.com/manager946/KAIDEE-STOCK/actions/runs/41167619819) and [push run 41167616006](https://github.com/manager946/KAIDEE-STOCK/actions/runs/41167616006) both **118 PASS / 0 FAIL / 0 SKIPPED**. This evidence document commit requires its **own** matching-HEAD CI verification.
