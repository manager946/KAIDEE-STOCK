# Phase B07 — Final offline QA report / live gate ยังไม่ผ่าน

วันที่ 2026-10-31 (Asia/Bangkok), Draft PR #5 เท่านั้น
สาขา `codex/stock-formula-safety-20261028`; ตรวจต้นทางที่
`519f71c626c30fe6ca91249354d99b880be9b581` ก่อนเพิ่ม tests/docs รอบนี้

## ตรวจหลักฐาน B07 Recovery ก่อนดำเนินงาน

อ่าน handoff, before-image, helper, adapter และ PR #5 body/comments จริงแล้ว
PR เป็น OPEN / DRAFT และ head ตรง SHA ข้างต้น ไม่มี comment แนบ recovery log ใหม่
CI ของ SHA เดิมแสดง pass ใน runs 41167024656 / 41167027729
ผล CI เป็น offline เท่านั้น

หลักฐานใน handoff เป็นรายงานก่อนหน้า: intent 003 present/valid, arm absent,
ไม่มี ledger 003, 001/002 paid, 003 approved และ 52 balances ตรง before-image
รอบนี้ไม่มี Google Sheets/Apps Script connector จึงไม่ได้อ่านข้อมูลปัจจุบันหรือ
Script Properties โดยตรง และไม่ได้ตรวจ execution log ของ Google ใหม่
ไม่มีหลักฐานใหม่ยืนยัน `PHASEB_B07_RECOVERY_PASS` หรือ independent after-image
สรุป **B07 real recovery PENDING / ยังไม่อนุญาต release** ไม่ใช่ FAIL ของระบบ
และไม่ถือว่าการจำลอง offline เป็นหลักฐานว่า crash/recovery จริงสำเร็จ

## ผลทดสอบใน cloud instance

- Baseline `npm test`: 108 PASS ตาม runner
- เพิ่ม `tests/phase-b-service-failures.test.js` และ service doubles ใน
  `tests/helpers/recovery-fixture.js`: 10 tests เรียก `apps-script/Code.gs` โดยไม่แก้ source
- `npm test` หลังเพิ่ม: 118 PASS / 0 FAIL / 0 SKIPPED
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

Offline QA PASS; B07 real recovery, real concurrency, quota และ full restore drill
ยัง PENDING ต้องได้รับอนุมัติและดำเนินการโดยผู้ใช้ใน QA แยกเท่านั้น
คง Draft / ห้าม Merge / ห้าม Deploy / ห้ามแก้ PDF ACL หรือ Production
รายงานนี้ไม่รับรอง CI ของ commit ใหม่จนกว่าจะมี matching-SHA run สำเร็จ
ดู `PHASE_B07_OWNER_QA_RUNBOOK_20261031_TH.md` สำหรับ gate และหลักฐานที่ต้องส่งกลับ
