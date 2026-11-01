# Phase B07 — Final QA report / Live Intent Recovery + Retry PASS

วันที่ 2026-10-31 (Asia/Bangkok), Draft PR #5 เท่านั้น
สาขา `codex/stock-formula-safety-20261028`; ตรวจต้นทางที่
`519f71c626c30fe6ca91249354d99b880be9b581` ก่อนเพิ่ม tests/docs รอบนี้

## ตรวจหลักฐาน B07 Recovery ก่อนดำเนินงาน

สถานะล่าสุด supersede checkpoint PENDING ใน handoff และรายงานรอบก่อน
อ่าน `PHASE_B07_LIVE_RECOVERY_VERIFICATION_20261031_TH.md` ที่มีอยู่จริงใน
commit `9717a4b0695df440aec39e0a0aa476290be4dbe6` และรับคำยืนยันล่าสุดของผู้ใช้:

- **B07 Live Intent Recovery: PASS** — owner Execution log ระบุ
  `PHASEB_B07_RECOVERY_PASS`, receipt `ok:true,reused:false`; การตรวจ Google Sheets
  จริงที่บันทึกไว้ยืนยัน 52/52 SKU reconcile, active movements 6 รายการ ID ไม่ซ้ำ,
  003 `จ่ายแล้ว` พร้อม issuer/time, QA-004=98 และ QA-005=97
- **Post-Recovery Retry: PASS ตามคำยืนยันล่าสุดของผู้ใช้** จาก owner Execution log
  และการตรวจ Google Sheets จริง: 52/52 SKU, 6 movements ไม่มี ID ซ้ำ,
  003 paid และข้อมูลเดิมคงอยู่ ไม่ใช่ผล offline test
- รายการเดิม 001/002 และประวัติ 003 ให้คงไว้ทั้งหมด ไม่ใช้เป็น fixture ทดสอบรอบใหม่

Provenance: recovery log/ค่ารายบรรทัดอยู่ในเอกสาร live verification เดิม;
retry PASS อ้างอิงคำยืนยันผู้ใช้ในงานนี้ ไม่มี raw retry log/execution ID เพิ่มใน checkout
จึงไม่สร้าง execution ID หรือ receipt ใหม่ขึ้นเอง รอบนี้ไม่ได้อ่าน Google Sheets,
Execution log หรือ Script Properties โดยตรง และไม่ขยายผลเป็นการพิสูจน์
exact crash timing, post-recovery properties ทุก key หรือ fault boundaries ทั้งหมด
exact simulated-crash moment ยังคง INCONCLUSIVE; live gates อื่นยัง PENDING

## ผลทดสอบใน cloud instance

- Baseline `npm test`: 108 PASS ตาม runner
- เพิ่ม `tests/phase-b-service-failures.test.js` และ service doubles ใน
  `tests/helpers/recovery-fixture.js`: 10 tests เรียก `apps-script/Code.gs` โดยไม่แก้ source
- รอบก่อน `npm test`: 118 PASS / 0 FAIL / 0 SKIPPED
- รอบนี้เพิ่ม `tests/phase-b-disposable-qa.test.js` อีก 5 กรณี: different-SKU partial commit,
  lock reacquisition หลัง error, property read outage หลัง paid, full in-memory restore
  เข้า runtime ใหม่และ negative restore ที่ขาด intent
- `npm test` รอบนี้: 123 PASS / 0 FAIL / 0 SKIPPED
- `git diff --check`: PASS

| หัวข้อ | ผล offline | ขอบเขตที่ยังไม่พิสูจน์ |
| --- | --- | --- |
| Partial commit | หลัง active บรรทัดแรก balance 98; resume เหลือ 95; retry ไม่เพิ่มแถวและไม่เปลี่ยน intent/แถวเดิม | การ persist และ crash timing ของ Google จริง |
| LockService | ใช้ withLock_ จริง: wait 20000, timeout ไม่เขียน, nested entry ถูกปฏิเสธ, release หลัง error | concurrent executions จริง/timeout ของบริการ |
| Script Properties | read/quota error ไม่เขียน ledger; ambiguous success เก็บ intent เดิม; oversized/malformed intent ถูกบล็อก | quota จริงและความทนทานของบริการ |
| Flush | error ปลด lock, preparation ยัง inert; recovery ไม่จ่ายซ้ำ | flush visibility จริง |
| Rollback | negative test: ล้าง ledger อย่างเดียวแล้ว paid header/intent ยังคงอยู่; issue/cancel ถูกบล็อก | ไม่มี application rollback API และยังไม่มี real restore drill |

Service doubles ทำงาน synchronous และไม่จำลอง Google distributed storage
หรือ quota ทั้งระบบ การกู้คืนแบบ resume ไม่ใช่ transaction rollback
tests เดิมที่ทดสอบ B07 helper มี stub setReqStatus; tests ใหม่ใช้ business source จริง
แต่แทน storage/auth/formula services ด้วยข้อมูลจำลอง ไม่รับรอง runtime ทั้งระบบ

## ขอบเขตที่รักษา

แก้เพิ่มเฉพาะ tests/docs ไม่แก้ apps-script, manifests, สูตร H8:H59 หรือ PDF ACL
ไม่เชื่อมต่อ/เขียน STAGING, Production หรือ isolated Google fixture จริง
ไม่มีการลบ/ย้อนประวัติ 001/002/003 หรือ intent keys ไม่มี merge/deploy
สถานะ live ทั้งหมดต้องอ่านใหม่ก่อน owner execution ตาม runbook คู่กัน

## ข้อสรุป

Offline QA PASS; B07 Live Intent Recovery และ Post-Recovery Retry PASS ตาม provenance ข้างต้น
Partial Commit, real concurrency, quota และ full restore drill ยัง PENDING
ต้องขออนุญาตแยกก่อนสร้าง/เขียนข้อมูลทดสอบใหม่ ใช้ Disposable QA Project
และ Spreadsheet ใหม่เท่านั้น ไม่ใช้ fixture เดิมหรือ 001/002/003
คง Draft / ห้าม Merge / ห้าม Deploy / ห้ามแก้ PDF ACL หรือ Production
รายงานนี้ไม่รับรอง CI ของ commit ใหม่จนกว่าจะมี matching-SHA run สำเร็จ
ดู `PHASE_B07_OWNER_QA_RUNBOOK_20261031_TH.md` สำหรับ gate และหลักฐานที่ต้องส่งกลับ
