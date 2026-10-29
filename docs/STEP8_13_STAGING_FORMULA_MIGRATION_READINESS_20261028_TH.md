# Step 8.13 — STAGING stock formula migration readiness (READ ONLY)
Date: 2026-10-28 (Asia/Bangkok). Owner: Technical Lead & QA.
Repository: `manager946/KAIDEE-STOCK`. Existing **Draft PR #5** from `codex/stock-formula-safety-20261028` into `test/isolated-staging-integration-2026-10-27`.

## Decision: **BLOCKED for formula migration, issuing, merge and production deployment**

This report is a read-only inspection and a future test specification. It is **not** approval or execution of a Sheets migration, Apps Script deployment, or permission change. No Google Sheets edits, Apps Script changes, PDF ACL changes, Production writes or PR merge were performed in this review.

### Observed STAGING data — connector READ ONLY

Validated the known, independently approved STAGING spreadsheet by exact title prefix `KAIDEE-STOCK STAGING`. Read bounded ranges:
`คลังสินค้า!A8:I80` (calculated values), `คลังสินค้า!H8:H80` (formulas), `บันทึกรับ-จ่าย!A4:N200`, `ใบเบิกสินค้า!A2:K200`, `รายการใบเบิก!A2:F200`, `ออร์เดอร์และใบขาย!A2:K200` and `รายการขาย!A2:I200` (calculated values). Inspected only aggregate observations; no customer/Staff/PII values are reproduced.

| Evidence / condition | Observed | Evaluation |
| --- | --- | --- |
| Inventory nonblank SKU rows | 52, contiguous rows 8–59 | PASS snapshot |
| Received (G) and issued (H) vs active movement ledger by SKU | 52/52 exact numeric matches | PASS snapshot |
| `I = F + G - H` by SKU | 52/52 exact numeric matches | PASS snapshot |
| Issued-quantity H formula with paid-requisition fallback | **52/52** | FAIL for new requisition issue |
| H formula with sale fallback | **52/52** | Needs legacy migration QA |
| Canonical pure movement-only H formula | 0/52 | Candidate only |
| Active movement rows in scanned ledger | 2: one outbound SALE and one inbound SALE-REV | PASS current net accounting |
| Duplicate nonblank active MovementID | 0 | PASS bounded scan only |
| Active outbound movement with missing ID or DocumentNo | 0 | PASS bounded scan only |
| Requisition headers / paid requisitions / requisition lines | 0 / 0 / 0 | No live legacy REQ migration exercised |
| Sales orders / sale lines / confirmed shipped orders | 3 / 5 / 0 | No active sale fallback burden |
| Sample `K2-3000K` | opening 3,000; received 1; issued 1; remaining 3,000 | PASS snapshot |

`stockFormulaAudit_()` is deliberately fail-closed for the existing H formulas: `REVIEW_REQUIRED`, `safeForNewRequisitionIssue:false`. Its 12 reported issue rows are a **capped diagnostic sample**, not proof that only 12 of 52 rows are affected.

**Limitations:** This is a point-in-time bounded read, not a transactional snapshot across all ranges. Zero duplicate active MovementIDs does not prove absence of historical, inactive or orphan entries. Exact numeric balance matches do not establish correct provenance, legacy posting completeness, actual Google Sheets formula evaluation after migration, or real Admin/Staff/Public/PDF authorization.

### Root cause and stock integrity

Current H formula includes outbound ledger `SUMIFS` **plus** a paid-requisition fallback without corresponding `REQ-` anti-duplicate handling. A future requisition with 10 units written as outgoing movement **and** switched to `จ่ายแล้ว` can count H as 20 (instead of 10) and understate I by 10. The SALE fallback currently has an anti-duplicate term, but that does not repair the REQ path.

The candidate movement-only `คลังสินค้า!H8` formula for an **isolated synthetic scratch environment only**:
```gs
=SUMIFS('บันทึกรับ-จ่าย'!$E:$E,'บันทึกรับ-จ่าย'!$C:$C,A8,'บันทึกรับ-จ่าย'!$B:$B,"จ่ายออก")
```
Would copy down with its relative `A<row>` reference. **DO NOT apply to existing STAGING or Production.** Shape-matching alone does not validate ledger uniqueness or historical sales/requisitions. The live formula gate must stay blocked.

The PR #5 `REQ_ISSUE_V1_` intent, inert preparation and resumable per-line commit are proven by **offline mocks** including 72 injected crash/recovery scenarios (36 write points before/after), but do not make the multi-line operation atomic: clients may observe a partially committed ledger, and incomplete orphan rows/properties require manual handling. All offline safety guards remain required.

### Acceptance criteria and go/no-go gates

| Gate | Proof required | Now |
| --- | --- | --- |
| AC-M01 Snapshot | Immutable before-image of all 52 original H formulas and F/G/H/I values, row identity, lastRow, and movement records; provenance and timestamps | BLOCKED, full export not authorized |
| AC-M02 Legacy coverage | Every paid REQ and confirmed shipped SALE line reconciled to exactly one valid posted movement or explicitly classified as a verified unposted legacy fallback | BLOCKED for migration (current data has no paid REQ) |
| AC-M03 Ledger integrity | Zero duplicate/ambiguous MovementIDs across *all* relevant active, inert, and historical rows, plus IDs/quantities/DocNo matching source documents | BLOCKED, active bounded scan only |
| AC-M04 Formula semantics | Offline parser and real formula engine tests prove correct row-relative H, empty/unknown SKU, zero/negative quantities, and rows beyond 59 | BLOCKED, real formula engine not exercised |
| AC-M05 No balance drift | Before/after F/G/H/I comparison on an independently verified synthetic clone, 52/52 matching baseline | BLOCKED, no clone writes allowed now |
| AC-M06 Requisition once | Create, approve, issue one/multi-line REQ: exactly one active outgoing movement per line, H increases once, I decreases once | PASS offline mock, BLOCKED integration |
| AC-M07 Requisition retry | Fail/crash before/after every prepare/commit/header step: idempotent resume, zero active orphan effects | PASS offline mock 72 scenarios, BLOCKED integration |
| AC-M08 Sales lifecycle | Ship/retry/return/retry only once, source SKU/qty/DocNo exact match, no duplicate return inflation | PASS offline mock, BLOCKED integration |
| AC-M09 Access and isolation | Verified isolated STAGING identity, private PDFs, distinct spreadsheet/Apps Script deployment, Admin/Staff/Public live permissions | BLOCKED real integration |
| AC-M10 Safe rollback | Demonstrate repeatable restore of original H formulas and unchanged F/G/H/I on an isolated synthetic clone with a written change log | BLOCKED until separately authorized |
| AC-M11 Release protocol | CI green for matching PR HEAD, human QA approval, explicit scoped migration authorization, Draft PR not merged | PASS for earlier mock CI only; release BLOCKED |

### Recommended offline tests for Codex (no real Google access)

1. Pure in-memory fixture for 52 SKU rows: assert canonical H computation equals movement-only ledger; hybrid double counts one paid REQ.
2. Legacy paid-requisition without posted movement: demonstrate that movement-only **drops** issued quantity; migration MUST FAIL CLOSED rather than silently overwrite.
3. Legacy shipped sale with absent `SALE-` movement: same historical-backfill blocker.
4. Duplicate `REQ-`, `SALE-` and `SALE-REV-` IDs, missing ID/DocumentNo, partial/inert rows and changed line order: deny migration and report exact reason **without revealing PII**.
5. Simulate a newly appended SKU at row 60+, missing/unknown H formula, and cross-SKU aggregation: preflight must reject unsafe shape.
6. Confirm unit tests explicitly separate `Safety Gate PASS` from `Migration Approved`; do not make the current hybrid accepted or run `fixFormulas()`.

### Proposed **future-only** clone migration and rollback checklist — NOT EXECUTED

*Requires separate user approval before **any** real Sheet write, even to a clone.*

1. Confirm a **new independent synthetic-only** spreadsheet ID, independent Apps Script execution identity, private PDF folder and no Production reference. Obtain immutable original snapshot + row/ID checksum.
2. Dry-run an export/reconciliation and identify all legacy paid REQ, shipped SALE, duplicate movement IDs, active rows missing metadata, inert/orphan rows, changed line positions and quota risks. Block on any ambiguity.
3. On **synthetic clone only**, copy the candidate H formula to H8:H59 and newer SKU rows; assert exact equality of all 52 balances and ledger totals before initiating new transactions.
4. Run controlled multi-SKU REQ issue / retry / injected-crash recovery, SALE ship and return with idempotent retries, and verify inventory and journal consistency. Verify real `SpreadsheetApp.flush`, LockService, PropertiesService quotas and authorization with test accounts.
5. Rollback drill: halt writers, restore original formulas using snapshot, compare every SKU F/G/H/I against pre-test state, verify ledger rows and unresolved intents, and log immutable audit evidence. Restoration of formulas alone cannot undo actual stock movements.
6. Present evidence and obtain separate written authorization to modify existing STAGING if warranted. Production remains prohibited until independent acceptance and release process.

### QA decision

- **PASS:** Current read-only 52/52 reconciliation, no active-identifier duplicates in bounded scan, PR #5 offline recovery tests and formula fail-closed safeguard.
- **FAIL:** Existing 52 hybrid H formulas are not approved for issuing new requisitions.
- **BLOCKED:** Historical migration certification, clone integration, live account/PDF ACL test, rollback drill, STAGING mutation, PR merge and Production.
- No `fixFormulas()`, no automated migration, no Google Sheets writes, no deployment, no ACL change, no merge.
