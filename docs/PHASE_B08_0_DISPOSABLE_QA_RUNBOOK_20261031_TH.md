# Phase B08-0 — Disposable QA Integration: Source/Diff + Owner Runbook (รอรีวิว)

สถานะ: **B08-0 r4 (Independent Review r3: F-8) เฉพาะ source/offline tests — ยังไม่อนุมัติ Live Execution**
Release Decision: **BLOCKED** · Draft PR #5: **KEEP DRAFT**
Base: `codex/stock-formula-safety-20261028` @ `53b6200` · `apps-script/Code.gs`
SHA-256 `4636e966ac1412366cf7e1657ba3ed2c5790c8380702d6a17c5caf6734ca460b`

เอกสารนี้ไม่ใช่สิทธิ์ให้สร้าง Spreadsheet/Apps Script Project, ติดตั้ง hook หรือรัน fault
ทุกขั้น live ต้องได้รับอนุมัติแยกต่อ scenario ห้ามแตะ STAGING, Production,
`KAIDEE-STOCK-SYNTHETIC-QA-STEP8-15`, QA-PB-001/002/003, project QA B07, PDF ACL และ H8:H59 ของระบบเดิม

## 1. ไฟล์ B08-0

| ไฟล์ | หน้าที่ |
| --- | --- |
| `qa/phase-b/b08/PhaseB08DisposableAdapter.gs` | `stagingDb_` ใหม่สำหรับ disposable เท่านั้น: config allowlist, SHA-256 denylist, project/target identity, two-sided binding, fixture guard |
| `qa/phase-b/b08/B08_DisposableQA_QA_ONLY.gs` | fault dispatcher แบบ one-shot, runners PC/LOCK/PROP/RB, canonical snapshot, comparator และ lock evaluators |
| `qa/phase-b/b08/B08_HOOKS.json` | hook 3 จุดแบบ exact-anchor + neutralize `doGet`/`savePdf` (pin SHA-256 ของ body เดิม) ผูกกับ SHA-256 ของ Code.gs ฐาน |
| `qa/phase-b/b08/appsscript.json` | scopes: spreadsheets, script.scriptapp, userinfo.email เท่านั้น |
| `scripts/b08-qa-bundle.js` | `verify` / `build <outDir> [gitSha]` / `compare a.json b.json` + entry-point policy |
| `tests/phase-b08-static-verification.test.js` | static verification + negative injection |
| `tests/phase-b08-disposable-runner.test.js`, `tests/helpers/b08-sheets-double.js` | รัน bundle ที่ generate จริงกับ in-memory doubles |

`apps-script/Code.gs` และ `SalesStaging.gs` ใน repo **ไม่ถูกแก้** hook และ stub อยู่ใน QA copy ที่ build ออกนอก git เท่านั้น

**F-1 (แก้แล้วใน r2):** QA copy ของ Code.gs แทน `savePdf` (เส้นทาง DriveApp/setSharing เดียว) และ `doGet` (HtmlService)
ด้วย stub ที่ throw `PHASEB08_STOP` เท่านั้น ทั้ง bundle จึงไม่มี `DriveApp`, `setSharing`, `HtmlService`, `newBlob` หรือ `base64Decode`
ถ้า body เดิมเปลี่ยน (SHA ไม่ตรง pin) build จะ fail และต้องรีวิวใหม่ manifest ยังไม่มี Drive scope เป็นชั้นที่สอง

## 2. Safety model (fail-closed)

1. **Static Source Verification** (`verify`, รันใน CI): Code.gs ต้องตรง SHA ฐาน, anchor ต้องพบครั้งเดียว,
   QA copy ต่างจากฐานเฉพาะ hook 3 บรรทัดใน `writeIssue_` + stub 2 ฟังก์ชัน (พิสูจน์แบบ multiset ทีละบรรทัด), waitLock ต้องเป็น 20000 ทั้งสองฝั่ง,
   **ทั้ง bundle** ห้ามมี Drive/Html/sharing/UrlFetch/Mail/open*/create และ **entry-point policy** กำหนดว่า entry point ทุกตัว
   ต้องผ่าน `stagingDb_` หรืออยู่ใน allowlist แบบ property-only (`setCompany` เท่านั้น) หรือไม่มี Google write เลย
   QA files ห้ามมี Drive/sharing/UrlFetch/Gmail/trigger/HtmlService/การเขียน cell/`QA-PB-`/B07 symbols/STAGING property หรือ ID
   ต้องมี `openById` ครั้งเดียวในส่วนที่มี guard, มี `stagingDb_` ตัวเดียว,
   การเขียน property ทำได้เฉพาะ helper `PHASEB08_*`, manifest ต้องไม่มี webapp/executionApi และ bundle ต้องไม่รวม SalesStaging/StagingDiagnostics/Index
2. **Runtime Identity Validation** (ทุก entry point ก่อนอ่านหรือเขียน): ตรวจ config allowlist
   (key ที่ไม่รู้จักทุกตัวทำให้ STOP), denylist ≥4 hash ที่ไม่ซ้ำ, `sha256(ScriptApp.getScriptId())`
   ต้องตรงค่าที่คาดและไม่อยู่ใน denylist, `sha256(target ID)` ต้องตรงค่าที่คาดและไม่อยู่ใน denylist, trigger ต้องเป็น 0,
   title/tab/sentinel/SKU ต้องตรง และ `คลังสินค้า!A2` ต้องผูกกลับมาที่ hash ของ project นี้
3. **Runtime source attestation** (เสริม ไม่ใช่หลักฐานเดียว): SHA-256 ของ `Function.prototype.toString`
   ของฟังก์ชันสำคัญ 10 ตัว (รวม `savePdf`, `doGet`) ต้องตรงกับ `B08_BundleIdentity.gs` และ stub ต้องเป็น `PHASEB08_STOP`
4. **Defense-in-depth ที่ทดสอบแล้ว:** test ถอดทีละชั้นแล้วระบุว่าชั้นไหนรับผิดชอบ (ดู `SECURITY_REVIEW` ใน review package)
5. **Relationship guard (F-5):** `b08FixtureGuard_` อ่าน raw rows แล้วพิสูจน์ header ↔ line ↔ movement ↔ intent
   (fixture ต้องครบ, LineID เรียงตามลำดับ, movement อ้าง line ที่มีจริงทั้ง index/SKU/qty/เลขเอกสาร, ไม่มี intent ลอย, ใบที่จ่ายแล้วต้องมี ledger ครบ)
   ถ้าพบ orphan, unknown, duplicate หรือ malformed record จะ STOP
6. **52-SKU reconciliation (F-6 + F-8):** ตาม schema ที่อนุมัติ (`STEP8_15_SYNTHETIC_GOOGLE_SHEETS_INTEGRATION_PLAN`)
   F8:F59 ต้องเป็นค่าคงที่ 100; G/H/I ต้องเป็นสูตรที่อนุมัติ (G=SUMIFS รับเข้า, H=SUMIFS จ่ายออก, I=F+G-H)
   ค่าที่ Sheets คำนวณของ G/H ต้องเท่ากับยอดจาก ledger และ I ต้องเท่ากับ F+G-H และ `balances_()`; snapshot เก็บทั้ง formula text และ calculated value
   ถ้าพิสูจน์ไม่ได้ (ค่าไม่ตรงหรือไม่ใช่ตัวเลข) readiness จะ STOP และสถานะคงเป็น BLOCKED
7. **Stale arm (F-7):** `phaseB08ValidateReadOnly` อ่าน `PHASEB08_ARM` จริง ถ้ามีค้างจะ STOP พร้อมค่าจริง และไม่ลบให้เอง

## 3. Owner procedure (หลังได้รับอนุมัติแยกเท่านั้น)

0. `npm test` และ `node scripts/b08-qa-bundle.js verify` ต้อง PASS บน SHA เดียวกับที่ CI ผ่าน
1. `node scripts/b08-qa-bundle.js build <โฟลเดอร์นอก repo> <gitSha>` แล้วเก็บ `BUNDLE_SHA256.json`
2. สร้าง Spreadsheet และ standalone project ใหม่ตามรายชื่อที่ได้รับอนุมัติ วาง 5 ไฟล์ของ bundle เท่านั้น
   ตั้ง Script Properties `KAIDEE_B08_*` แบบส่วนตัว (denylist เป็น hash ที่ owner คำนวณเอง)
3. Seed fixture ต้องได้รับอนุมัติแยกใน B08-1 (B08-0 ไม่มี seeder)
4. ลำดับการรัน: `phaseB08ValidateReadOnly` → PC → LOCK → PROP → RB ต้อง reconcile 52/52 ก่อนขึ้น scenario ถัดไปทุกครั้ง

| ขั้น | ฟังก์ชัน (execution แยกกัน) | หลักฐานที่ต้องส่งกลับ |
| --- | --- | --- |
| PC | `phaseB08PartialCommitFaultOnce` → **owner ตรวจ Sheets UI ด้วยตนเอง** → `phaseB08PartialCommitReadback` → `phaseB08PartialCommitRecoverOnce` | marker, readback hash, active 1/prepared 1, header อนุมัติ, QA-010=98/QA-011=100 → 98/97, retry reused:true |
| LOCK-1 | แท็บ A `phaseB08LockHolderA` (35 วินาที); ภายใน 10 วินาทีให้รันแท็บ B `phaseB08LockContenderB` → `phaseB08LockEvaluateReadOnly` → `phaseB08LockIssueAfterRelease` | execution ID/start/duration จาก Executions dashboard ของ A และ B, error ของ B, verdict, readback ledger |
| LOCK-2 | `phaseB08LockSerialHolderA` (10 วินาที) + `phaseB08LockSerialContenderB` → evaluate | `intent.at` ของ B ≥ releaseAt ของ A, ledger 1 แถว |
| PROP | `phaseB08PropBeforeReadOnce` / `phaseB08PropBeforeWriteOnce` แล้ว `...IssueAfterFault1/2` | ไม่มี intent, business hash เท่าเดิม, unrelated keys เท่าเดิม |
| RB | `phaseB08RestorePrepareIssueOnce` → snapshot → owner Make a copy (ไม่คัดลอกการแชร์) ไปยัง project RESTORE ใหม่ → snapshot → `compare` offline → `phaseB08RestoreValidateOnce`; RB-5 ใช้ clone อีกชุดที่ไม่มี intents แล้วรัน `phaseB08RestoreNegativeOnce` | compare `equal:true`, diffs [], รายการ config ที่ exclude ไว้, validation PASS และ source hash ไม่เปลี่ยน |

## 4. Stop gates

ห้ามรันซ้ำ ห้ามลบ property และห้ามแก้ ledger เองเมื่อเกิด `PHASEB08_STOP`, error ที่ไม่ใช่ marker,
arm ค้าง, readback ไม่ตรง, state drift, verdict FAIL/STOP หรือ Last modified ของ protected target เปลี่ยน
LOCK ได้ INCONCLUSIVE 2 ครั้งให้หยุด หากต้องใช้ Drive scope, trigger, deploy หรือแก้สูตรเดิมให้หยุดและเสนอขอบเขตใหม่

## 5. ข้อจำกัด

Offline tests ใช้ doubles แบบ synchronous (มี timeline ของ write/flush/lock สำหรับ regression M8) จึงไม่พิสูจน์ concurrency, quota, durability
หรือ process crash จริงของ Google ส่วน LOCK-2 offline ทดสอบได้เฉพาะ evaluator และ contender path
fault ทั้งหมดเป็น SIMULATED_EXCEPTION; REAL_PROCESS_CRASH และ real quota คงสถานะ PENDING/NOT_TESTED
attestation ผ่าน `toString` อาจ false-fail หาก editor แปลง line ending ซึ่งถือเป็น STOP ที่ปลอดภัย
