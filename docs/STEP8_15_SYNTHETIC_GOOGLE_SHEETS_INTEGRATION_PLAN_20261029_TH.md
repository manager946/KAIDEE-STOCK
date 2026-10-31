# Step 8.15 — Synthetic-only Google Sheets formula/integration test gate (2026-10-29)

**STATUS: PREPARED, NOT EXECUTED — AWAITING EXPLICIT AUTHORIZATION FOR NEW SHEET WRITES.**

Repository: `manager946/KAIDEE-STOCK`. Existing Draft PR #5 on `codex/stock-formula-safety-20261028`, targeting `test/isolated-staging-integration-2026-10-27`. Do not open a replacement PR, merge, deploy, publish Apps Script, or alter permissions.

## Why this is the next gate

Step 8.13 found **52/52 inventory SKU rows (8–59)** with correct displayed G/H/I against the active Movement ledger, yet **52/52 current H formulas still combine ledger SUMIFS with paid-requisition fallback**. A paid REQ posted to `บันทึกรับ-จ่าย` and marked `จ่ายแล้ว` can therefore count twice. Step 8.14 offline tests **94/94 PASS**, but neither mock tests nor formula source inspection prove real Google Sheets evaluation or transactional consistency under Apps Script.

**Real STAGING H8:H59 must stay unchanged and current requisition issue remains blocked.**

## Authorizations, scope and isolation

**No real Google Sheets creation or write has been authorized by the phrase 'ขั้นตอนถัดไป'.** Obtain a separate explicit user approval before creating or modifying even a synthetic test spreadsheet.

After approval, use a **NEW EMPTY** independent spreadsheet named `KAIDEE-STOCK-SYNTHETIC-QA-STEP8-15` (or an unambiguous unique suffix), never an existing STAGING or Production copy. Confirm **distinct spreadsheet ID**, owner, title, no sensitive/business transaction data, no links/formulas that reach other spreadsheets, no attached Production Apps Script, no production identifiers in the test runner. Restrict all writes to this exact verified synthetic file. Do not modify sharing permissions, create public PDFs or configure public deployment.

If there is no supported tool to make a verified new empty sheet, **STOP** and report BLOCKED rather than substituting an existing spreadsheet. Explicit approval to write to a *new* synthetic file does not authorize writes to existing STAGING, a renamed existing file, a Production sheet, or any PDF/ACL/Deployment changes.

## Phase A — Real Sheets formula engine (isolated synthetic only)

After the above approval and identity checks:

1. Generate 52 synthetic SKUs `QA-001` through `QA-052` on `คลังสินค้า!A8:A59`; set `F8:F59=100`. No real item/customer/staff data.
2. Create `บันทึกรับ-จ่าย` with columns aligned to current app: A date, B `รับเข้า` or `จ่ายออก`, C SKU, E quantity, K deterministic synthetic MovementID and N DocumentNo. Other fields can be synthetic placeholders.
3. At each inventory row `r`, set:
   - `G(r)=SUMIFS('บันทึกรับ-จ่าย'!$E:$E,'บันทึกรับ-จ่าย'!$C:$C,A(r),'บันทึกรับ-จ่าย'!$B:$B,"รับเข้า")`
   - `H(r)=SUMIFS('บันทึกรับ-จ่าย'!$E:$E,'บันทึกรับ-จ่าย'!$C:$C,A(r),'บันทึกรับ-จ่าย'!$B:$B,"จ่ายออก")`
   - `I(r)=F(r)+G(r)-H(r)`
   Use actual A1 row references and formulas, not literal `(r)` syntax.
4. Before any synthetic movement, verify exactly 52/52 `G=H=0, I=100`. Save a full original snapshot of formulas, A/F/G/H/I and synthetic Movement rows in a **separate QA artifact**, with checksum, timestamps and target ID redacted in public docs.
5. Execute only synthetic test rows as listed below; read Google Sheets **calculated values**, verify expected quantities and recorded movement identity.
6. Restore original synthetic test state and formulas, then compare 52/52 and inspect movement rows. **Restoring formulas alone does not undo posted stock movements.** Capture rollback evidence and stop if any mismatch.
7. No `fixFormulas()`, no hybrid formula acceptance, no Apps Script publication.

### Formula test matrix (all synthetic)

| ID | Setup/action | Expected calculated result / migration decision |
| --- | --- | --- |
| A01 | 52 SKUs opening=100, no movements | All 52 G=0, H=0, I=100 |
| A02 | QA-001 receives 1 and issues 3 | G=1, H=3, I=98 |
| A03 | QA-002 issue 10 under one REQ- ID | H=10, I=90; no paid fallback |
| A04 | QA-003 two line issue qty 2 and 3 | H=5, I=95; exactly two REQ IDs |
| A05 | QA-004 SALE issue 2 and SALE-REV return 2 | G=2, H=2, I=100; return only once |
| A06 | QA-005 prepared/inert row B blank qty 7 | H remains 0, I=100; row excluded from active ledger |
| A07 | Duplicate active MovementID | **FAIL CLOSED** preflight; do not claim SUMIFS deduplicates |
| A08 | Active movement missing ID/DocumentNo or unknown SKU | **FAIL CLOSED** preflight |
| A09 | Paid historical REQ or shipped SALE with no movement | **BLOCK migration**; movement-only alone would overstate stock |
| A10 | New SKU `QA-053` at row 60 | H60 references A60, not A59; exact calculated balance |
| A11 | Wrong quoted criterion `"จ่าย ออก"` or wrong sheet name | Reject as noncanonical even if numeric snapshot seems harmless |
| A12 | Snapshot restore drill after synthetic movements | Full formula, G/H/I and synthetic ledger before/after equality; no remaining active test movements |

Explicitly document negative tests by expected **rejection**; a test that successfully identifies a disallowed condition is QA PASS, not permission to proceed.

### Acceptance for Phase A

- All positive scenarios yield mathematically correct calculated values for all 52+ synthetic SKU rows.
- Invalid or ambiguous history is rejected before any migration.
- MovementID uniqueness is validated separately; SUMIFS does not deduplicate.
- Formula rollback drill restores both formulas and synthetic ledger state exactly.
- No result from the synthetic file is copied into existing STAGING.
- Capture test ID, timestamp, target synthetic spreadsheet unique ID (private audit only), assertion matrix and anonymized screenshot or calculated-value evidence.
- Strictly **NO GO** for existing STAGING modification until a *separate* approval after Phase A human review.

## Phase B — Actual Apps Script recovery integration (separately gated)

**Not covered by approval for the Phase A sheet alone.** Requires a separate isolated Apps Script test project and separate explicit authorization before any write.

- Use ONLY the independently verified synthetic spreadsheet; enforce script-side title prefix and exact expected ID; no Production Script Properties or deployment.
- Exercise `REQ_ISSUE_V1_` property persistence, LockService lock coordination, SpreadsheetApp.flush consistency, at least two SKU and multiple same-SKU lines, two simultaneous cooperating callers where feasible, and idempotent retries.
- Inject crashes before/after preparation of K/N and B activation; verify no active orphan without ID/DocNo, no double issuance, correct recovery when status/header update fails, and safe block on conflict.
- Test property size/quota and orphan retention constraints. No uncontrolled replay; no real staff/identity or PDF permission changes.
- Real multi-line commit is *resumable per line*, **not atomic**. Report observed partial visibility and reserve/writer exclusion limits.

## Rollback criteria and stop conditions

**Stop immediately** if target ID or title is ambiguous; any real company data appears; any formula refers to existing STAGING/Production; a test alters another file; an active movement appears without validated identity; duplicate movement IDs appear; balance drift is unexplained; rollback cannot reproduce snapshot; or source/properties/deployments/ACLs would be affected.

For an isolated synthetic test file, halt all writers, preserve audit evidence, restore *both* ledger movements and original H/G/I formulas, compare all 52 SKU rows and source header rows, and record exceptions for manual review. Never overwrite real STAGING formulas or attempt to 'fix' ledger history.

## Current release decision

- **PASS:** Existing Step 8.14 offline regression 94/94 and read-only STAGING 52/52 numeric snapshot.
- **FAIL:** Existing hybrid H8:H59 formulas not safe to enable REQ issuing.
- **BLOCKED:** Phase A real Google formula-engine test until explicit new-sheet creation/write approval; Phase B Apps Script integration until further approval; actual STAGING migration, merge, Production deployment and PDF permissions.
- **No execution of Phase A or B is claimed by this document.**
