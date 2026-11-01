# Step 8.15 Phase A — Real Google Sheets synthetic formula test evidence (2026-10-29)

## Scope and isolation
- Explicit user authorization: create/write **one new independent synthetic-only Google Sheet**, test movement-only formulas and rollback.
- New spreadsheet title: `KAIDEE-STOCK-SYNTHETIC-QA-STEP8-15`.
- Created new file; independently verified ID does **not** equal existing STAGING or Production spreadsheet IDs. Do not publish its ID in public code or logs. Share directly only with owner via connector context.
- Tests were performed exclusively in this new synthetic spreadsheet. No actual STAGING or Production cells were written; no Apps Script project, deployment, PDF file, Drive ACL, or PR merge modified.
- New sheet has only tabs `คลังสินค้า` and `บันทึกรับ-จ่าย`, 52 entirely fictional SKU codes `QA-001`–`QA-052`, opening 100, and no customer/staff real data.
- A temporary local XLSX prototype was used to define layout; importing it via connector failed with input-shape error, so a **new native empty Sheet** was created and populated only after verifying its unique ID. An interrupted extended test write was read back and verified to have left no cells before retrying narrower writes.

## Phase A test matrix — actual Sheets calculated values

| ID | Actual action and evidence | Verdict |
| --- | --- | --- |
| A01 | Baseline real calculation `G=0,H=0,I=100` across 52/52 QA SKUs | **PASS** |
| A02 | `QA-001`: inbound 1, outbound 3 => `G=1,H=3,I=98` | **PASS** |
| A03 | `QA-002`: 10 outbound units under one synthetic REQ ID => `G=0,H=10,I=90` | **PASS** for formula arithmetic only |
| A04 | `QA-003`: two synthetic REQ lines, quantities 2+3 => `G=0,H=5,I=95`, two distinct IDs in ledger read | **PASS** formula arithmetic |
| A05 | `QA-004`: synthetic SALE 2 outbound and SALE-REV 2 inbound => `G=2,H=2,I=100` | **PASS** arithmetic; not live workflow idempotency |
| A06 | `QA-005`: synthetically prepared row has `B` blank, quantity 7 => `G=0,H=0,I=100` | **PASS** |
| A07 | Duplicate ID rejection through production preflight | **BLOCKED** — no real preflight or Apps Script executed; offline test covers this |
| A08 | Missing ID/DocumentNo or unknown SKU preflight | **BLOCKED** — offline guard only |
| A09 | Paid legacy REQ or confirmed SALE lacking movement | **BLOCKED** — offline fail-closed tests only |
| A10 | `QA-053` in row 60 with intentionally wrong `H60` reference `A59`; observed H=0 and I=100 despite synthetic ledger outgoing=4, demonstrating wrong row reference | **PASS** negative counterexample / required migration validator still unexecuted on real Apps Script |
| A11 | `QA-054` in row 61 with noncanonical quoted `"จ่าย ออก"` criterion was read as H=4 against 4-unit outgoing; this was **unexpected** and cannot certify Sheets matching semantics or safe normalization. Parser/regression test still must reject it as noncanonical. | **REVIEW REQUIRED** |
| A12 | Removed all synthetic movements and temporary rows 60–61; verified 52 original rows returned exactly to `G=0,H=0,I=100` and ledger transaction rows were empty, with original row-relative G/H/I formulas still present 52/52. | **PASS** rollback (original isolated baseline only) |

These were direct **real Google Sheets formula-engine reads**, not Apps Script issue, recovery, or permissions tests. No actual double-post was attempted. The Phase A numerical scenarios (A02–A06) are arithmetic evidence, not proof of unique document lifecycle or lock safety. For A11 the observed result differs from a simplistic syntactic assumption; keep a strict source-level formula guard and investigate this discrepancy separately before any migration approval.

## Historical and release blockers

- Existing STAGING H8:H59 remains **52/52 hybrid paid-requisition fallback**, potentially counting both REQ ledger and paid legacy requisition; issuing must continue **BLOCKED**.
- Historic paid requisitions and shipped sales absent from the ledger require reconciliation before a movement-only migration; none were migrated.
- Live Apps Script `LockService`, `PropertiesService`, `SpreadsheetApp.flush` and recovery fault injection are **not** tested. Phase B requires **separate** authorization; do not deploy or modify even the existing STAGING app as part of Phase A.
- Real Google Sheets does not deduplicate MovementID on behalf of code. Current worksheet demonstration does not prove preflight rejection.
- Rollback of synthetic formulas/ledger on isolated test file is not equivalent to restoring STAGING history or unwinding real order/REQ stock movements.
- Existing Draft PR #5 stays DRAFT; GitHub code/docs only for this evidence commit. All prior CI 94/94 results attach to earlier HEAD and must be reverified after the docs-only commit.

**Verdict: Phase A real formula-arithmetic/rollback PASS; A11 REVIEW REQUIRED; preflight, historical reconciliation, Phase B, existing STAGING migration, PR merge and Production remain BLOCKED.**
