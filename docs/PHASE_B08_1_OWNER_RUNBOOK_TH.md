# Phase B08-1 — Disposable W1/P1 + Seeder: Owner Runbook (Windows + Apps Script Editor)

สถานะ: **ข้อเสนอสำหรับรีวิว (r2: F-13/F-14) — ยังไม่อนุมัติให้สร้าง/แก้ Google Sheets หรือ Apps Script และยังไม่อนุมัติรัน seeder**
Release Decision: **BLOCKED** · Draft PR #5: **KEEP DRAFT**
ห้ามแตะ STAGING, Production, B07, ชีต QA STEP8-15, PDF ACL และสูตร H8:H59 ของระบบเดิม

## 1. สิ่งที่จะสร้าง (หลังได้รับอนุมัติ)
| สิ่งที่สร้าง | ชื่อ | หมายเหตุ |
|---|---|---|
| W1 Spreadsheet ใหม่ (ว่าง) | `KAIDEE-STOCK-DISPOSABLE-QA-B08-<RUN>` | สร้างด้วย `sheets.new` ไม่ copy จากไฟล์ใด ไม่แชร์ |
| P1 Apps Script **standalone** | `KAIDEE-STOCK-B08-P1-<RUN>` | สร้างด้วย `script.new` **ห้ามใช้ bound script** (ส่วนขยาย > Apps Script) |

`<RUN>` = A–Z/0–9 ยาว 6–12 ตัว ใช้ครั้งเดียว เช่น `B0811101A`

## 2. Bundle สองชุด (build และตรวจ SHA-256 ก่อนวาง)
- **SEED bundle** = `Code.gs` (QA copy ที่มี hook และ neutralize แล้ว), adapter, runner, `B08_Seeder_QA_ONLY.gs`, `B08_BundleIdentity.gs` (**SEED**) และ `appsscript.json`
- **RUNNER bundle** = ไฟล์เดียวกัน**ยกเว้น** seeder และใช้ `B08_BundleIdentity.gs` (**RUNNER**)
- ตรวจ SHA-256 ด้วย `Get-FileHash -Algorithm SHA256 <file>` ให้ตรงกับ `BUNDLE_SHA256.json` ก่อนวางทุกไฟล์

## 3. ขั้นตอน (ทำตามลำดับ และหยุดที่ STOP ทุกครั้ง)
0. **T0 backup:** เปิด Drive แล้วจดเวลา "Last modified" ของ STAGING, Production, ชีต QA STEP8-15 และ project B07 (ดูอย่างเดียว ไม่รันอะไร)
1. สร้าง W1 ด้วย `sheets.new` ในบัญชี Admin (owner) ตั้งชื่อให้ตรงทุกตัวอักษร และ**ไม่พิมพ์อะไรลงชีต**
2. สร้าง P1 ด้วย `script.new` → Project Settings → ติ๊ก "Show appsscript.json manifest file in editor"
3. วาง **SEED bundle**: แทนที่ `Code.gs` เริ่มต้น เพิ่มไฟล์ `.gs` ที่เหลือให้ชื่อตรง แล้ววาง `appsscript.json`
4. คำนวณ hash บนเครื่อง Windows (ID จะไม่ถูกแสดงบนจอหรือเก็บใน history):
   ```
   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\b08-sha256-id.ps1
   ```
   ทำทีละ ID: W1 (จาก URL), P1 (Project Settings → Script ID) และ protected IDs อย่างน้อย 4 ค่า (แนะนำ 6 ค่า: ชีต STAGING, ชีต Production, ชีต QA STEP8-15, project B07, project STAGING, project Production)
5. Project Settings → Script Properties (เก็บค่าจริงแบบส่วนตัว ห้าม commit):
   `KAIDEE_B08_TARGET_ID`, `KAIDEE_B08_TARGET_SHA256`, `KAIDEE_B08_SCRIPT_SHA256`, `KAIDEE_B08_RUN_ID`,
   `KAIDEE_B08_ROLE=TEST`, `KAIDEE_B08_DENYLIST_SHA256` (คั่นด้วยจุลภาค) **ห้ามใส่ key อื่น**
6. รัน `phaseB08IdentityPreflightReadOnly` แล้วอนุญาตสิทธิ์
   - หน้าขออนุญาตต้องมีเพียง 3 รายการ แล้วส่ง screenshot กลับมา:
     (1) Google Sheets: See, edit, create, and delete spreadsheets → `spreadsheets`
     (2) "Allow this application to run when you are not present" → `script.scriptapp` ซึ่งใช้**เฉพาะอ่าน** `getProjectTriggers()` เพื่อยืนยันว่า trigger = 0 (โค้ดไม่สร้าง trigger ใดๆ ตาม static check)
     (3) See your primary Google Account email address → `userinfo.email`
     ถ้ามีรายการอื่น เช่น Drive ให้ STOP
   - ผลต้องเป็น `PHASEB08_IDENTITY_READY_READ_ONLY` และ `role=admin` ถ้าไม่ใช่ให้ **STOP** และ**ห้ามแก้ ADMINS**
7. รัน `phaseB08SeedPreflightReadOnly` → ต้องได้ `PHASEB08_SEED_PREFLIGHT_READY_READ_ONLY` แล้วส่ง log กลับมา **STOP รออนุมัติ seed**
8. *(หลังได้รับอนุมัติ)* รัน `phaseB08SeedDisposableOnce` **ครั้งเดียว** → ต้องได้ `PHASEB08_SEED_COMPLETED`
   - ถ้ามี error: **ห้ามรันซ้ำ และห้ามลบ Script Properties** (state จะเป็น `REVIEW_REQUIRED`) ให้ส่ง log กลับมา
9. **ลบไฟล์ `B08_Seeder_QA_ONLY.gs`** แล้ว**แทนที่ `B08_BundleIdentity.gs` ด้วยไฟล์จาก RUNNER bundle**
10. รัน `phaseB08PostSeedReadinessReadOnly` → ต้องได้ `PHASEB08_POST_SEED_READY_READ_ONLY` (7/8/52/0) แล้วส่ง log กลับมา
11. **T1 backup:** ใน W1 ใช้ File > Version history > Name current version `B08-T1-SEED`, ใช้ File > Make a copy ชื่อ `…-GOLDEN` (**ไม่ติ๊ก share**), รัน `phaseB08BusinessSnapshotReadOnly` แล้วเก็บ JSON แบบส่วนตัว และถ่าย screenshot Script Properties
12. **หยุดที่นี่** PC / LOCK / PROP / RB ต้องได้รับอนุมัติแยกทีละ scenario (ดู `PHASE_B08_0_DISPOSABLE_QA_RUNBOOK_20261031_TH.md`)

ห้ามรันฟังก์ชันอื่นของ `Code.gs` ใน P1 ห้าม Deploy และห้ามเพิ่ม Trigger

## 4. Seed state machine
`NOT_STARTED` (ยังไม่มี key) → `STARTED` → `COMPLETED` (เขียน `PHASEB08_SEED_DONE` หลังอ่านกลับจาก Sheets และตรวจผ่านครบทุกข้อเท่านั้น)
ถ้ามี error หลัง `STARTED` จะเป็น `REVIEW_REQUIRED` + `PHASEB08_SEED_ERROR` และไม่มีการล้างค่าเองอัตโนมัติ
runner ทุกตัวจะ STOP ถ้า state ไม่ใช่ `COMPLETED`, DONE ไม่ตรง run หรือ fixture, ยังมี seeder ติดตั้งอยู่ หรือ identity ไม่ใช่ RUNNER
`baselineSha256` ใน DONE เป็นหลักฐานตั้งต้นเท่านั้น ไม่ถูกบังคับให้เท่ากันหลัง PC/LOCK/PROP

## 4.1 Business mutation gate (F-13) และ seed lock (F-14)
- ใน QA copy ของ `Code.gs` บรรทัดแรกของ `withLock_` คือ `b08BusinessGate_()` (เป็น build transform เท่านั้น ไม่แก้ `apps-script/Code.gs`)
  ดังนั้นการเรียก business function **โดยตรงจาก editor** (`setReqStatus`, `saveReq`, `addMovement`, … ทั้ง 15 ตัวที่เขียนข้อมูล)
  จะ STOP ก่อนเขียนอะไรเลย รวมถึง intent ถ้ายังไม่ใช่ RUNNER identity, seeder ยังติดตั้งอยู่ หรือ seed ยังไม่ `COMPLETED`
- `stagingDb_()` ใช้ gate เดียวกัน ข้อยกเว้นมีแค่ช่วงที่ seeder อ่านกลับภายใต้ `STARTED` และช่วงนั้นได้ object แบบ**อ่านอย่างเดียว**
- `setCompany` ถูก neutralize (เป็น business mutation ตัวเดียวที่ไม่ผ่าน lock)
- seed ทั้งหมดทำภายใต้ script lock (`tryLock`) และตรวจ state กับความว่างของ workbook ซ้ำภายใน lock
  ถ้ามี execution ที่สองเข้ามาจะ STOP โดยไม่แตะ marker ส่วน `REVIEW_REQUIRED` จะเขียนเฉพาะโดย execution ที่เขียน `STARTED` เอง
- **ห้ามรัน business function ใดใน P1 ด้วยตนเอง** ให้ใช้เฉพาะ `phaseB08*` ตามขั้นตอน

## 5. Fixture ที่ seed (ตรวจโดย test แบบ literal อิสระ)
7 headers (`PC-001`, `LOCK-001`, `LOCK-002`, `PROP-001`, `PROP-002`, `RESTORE-001`, `RESTORE-002`) สถานะ `อนุมัติ` ทั้งหมด
8 lines: PC-001 มี 2 บรรทัด (QA-010×2, QA-011×3) ที่เหลือมีใบละ 1 บรรทัด (QA-020×1, QA-021×1, QA-030×1, QA-031×1, QA-040×2, QA-041×1)
52 SKU (`QA-001…052`): E = 10, F = 100, G/H/I เป็นสูตรตาม schema ที่อนุมัติ, J = 5 และมี 0 movements

## 6. STOP gates
`PHASEB08_STOP` ทุกกรณี; scope เกิน 3 ตัว; identity ไม่ใช่ admin/staff; target ไม่ว่าง; seed ไม่ `COMPLETED`;
post-seed readiness ไม่ READY; Last modified ของ T0 เปลี่ยน; ต้องใช้ Drive scope, trigger, deploy หรือแก้สูตรระบบเดิม
