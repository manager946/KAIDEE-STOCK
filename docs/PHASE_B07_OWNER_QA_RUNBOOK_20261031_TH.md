# B07 owner QA runbook — ขออนุมัติก่อนรันจริง

เอกสารเป็นข้อเสนอ ไม่ใช่สิทธิ์ให้ agent รัน Google Apps Script หรือแก้ข้อมูล
ให้ผู้ใช้อนุมัติ scope/project/backup ก่อนดำเนินการผ่าน Editor ของ QA แยก
ห้าม Web App deployment, merge, PDF ACL, STAGING/Production และสูตร H8:H59

## 1. ตรวจสถานะจริงแบบ read-only ก่อน

ยืนยัน standalone QA project ID และ Spreadsheet ID แยกจาก STAGING/Production
ตรวจชื่อ `KAIDEE-STOCK-SYNTHETIC-QA-STEP8-15`, sentinel, 52 synthetic SKU,
tab schema และ QA adapter แบบ exact ID/title โดยไม่ลด guard
เก็บ source version, timestamp, execution ID และ before-image ของ ledger ทั้งหมด,
headers/lines, สูตรและค่าทั้ง 52 แถว พร้อม backup Script Properties แบบส่วนตัว
ห้ามส่ง credentials/property values หรือข้อมูลลูกค้าเข้า GitHub
bounded FNV snapshot เก่าไม่ใช่ full restorable backup และไม่ใช่ checksum สถานะปัจจุบัน

ตรวจ 001/002/003 และ related rows ทั้ง active/prepared/orphan รวมถึง intent/arm
อย่ารัน `phaseB07ValidateReadOnly` หรือ crash runner ซ้ำเพื่อเริ่มใหม่:
readiness function คาดว่า intent absent ซึ่งขัดกับ checkpoint intent present

| สถานะจริง | การดำเนินการ |
| --- | --- |
| 4 active rows เดิม, 003 approved, intent valid, arm absent, ไม่มี prepared/orphan 003 | เข้า gate recovery ด้านล่างได้หลังอนุมัติ |
| 6 rows และ 003 paid | ห้าม recovery runner (คาดว่า 4); ตรวจ after-image ก่อนเสนอ retry |
| 5 rows, prepared/orphan, intent/arm ผิด, balance drift หรือหลักฐานไม่ครบ | STOP; เก็บ log/read-only snapshot ให้ reviewer วิเคราะห์; ห้าม retry/ลบ properties/เขียน ledger มือ |

## 2. B07 recovery หนึ่งครั้ง — owner อนุมัติแยก

อนุมัติให้ใช้เฉพาะ reviewed `phaseB07RecoverAfterIntentOnce` ใน standalone QA
หลังยืนยัน preconditions ปัจจุบันจากข้อ 1 และ backup ที่กู้คืนได้แล้ว
รันจาก Editor หนึ่งครั้ง เก็บ receipt/log/execution ID และเวลา
ห้ามรัน crash injection อีกและห้าม auto retry เมื่อ error/timeout/ผลกำกวม

PASS ต้องมีทั้ง log `PHASEB_B07_RECOVERY_PASS`, receipt ok และ independent readback:
6 distinct nonblank MovementIDs; 001/002 ทั้งแถวและ properties ไม่เปลี่ยน;
003 มีเฉพาะ `REQ-QA-PB-003-1` QA-004 qty 2 / `REQ-QA-PB-003-2` QA-005 qty 3,
doc `QA-PB-RQ003`; issuer/paid timestamp populated; 003 paid;
52 balances reconcile กับ movement-only ledger (QA-004=98, QA-005=97,
QA-001=95, QA-002=96, QA-003=99, อื่น=100), สูตรเดิมไม่เปลี่ยน
intent คงเดิมและ arm absent ไม่มี duplicate/active row ที่ขาด identity
เก็บ before/after comparison แบบส่วนตัว ส่งกลับเฉพาะ sanitized summary

หลัง evidence ผ่านและผู้ใช้อนุมัติ retry แยก จึงเรียก
`setReqStatus('QA-PB-003','issue')` ครั้งเดียว: PASS = reused:true,
ยัง 6 rows, balances/issuer/time/intent/001/002/003 ไม่เปลี่ยน
ผิดเงื่อนไขใดเป็น FAIL/STOP; ไม่มี log หรือ timeout เป็น INCONCLUSIVE/STOP

## 3. Partial commit / Lock / Properties — อนุมัติและรีวิว runner ก่อน

**ยังไม่มี real runner ที่อนุมัติสำหรับขั้นนี้ ห้ามดัดแปลง B07 runner ไปใช้ทันที**
สร้าง disposable QA project + workbook แยกใหม่ ใช้ request IDs ใหม่ไม่ซ้ำ 001/002/003
adapter ปัจจุบันรับแค่สามใบ ห้ามเพิ่มใบใน fixture เดิมหรือผ่อน guard
ต้องเสนอ diff ของ QA-only hook, fixture IDs, fault location, one-shot disarm,
timeout และวิธีเก็บหลักฐานให้ reviewer ยอมรับก่อนติดตั้ง/รัน

| กรณี | วิธีทดสอบที่ต้องรีวิว | เกณฑ์ PASS |
| --- | --- | --- |
| Partial commit | hook one-shot หลัง activate แถวแรกของใบใหม่สองบรรทัด | intent persisted; active 1/prepared 1; header approved; readback ตรง delta; approved resume จ่ายเฉพาะ pending; retry ไม่ซ้ำ |
| LockService | execution A ถือ script lock ช่วงสั้นที่กำหนด; B เรียก workflow เดียวกันใน project เดียวกัน; เก็บ overlapping timestamps | B เข้า critical section ไม่ได้ระหว่าง A ถือ lock; timeout ไม่มี writes; release แล้ว retry ไม่ซ้ำ |
| Script Properties | QA-only wrapper จำลอง get/set exception ก่อน/หลัง persist เฉพาะ key ใหม่ ไม่จงใจใช้ quota ให้หมด | ก่อน persist ไม่เขียน ledger; หลัง persist intent เดิม resume ได้; unrelated keys ไม่เปลี่ยน |
| Real quota | ไม่เร่งใช้ quota หรือทำลาย keys เพื่อสร้าง failure | PENDING จนมีวิธีปลอดภัย/ข้อผิดพลาดจริงที่อนุมัติ; simulated exception ไม่ถือว่า real quota PASS |

real crash/flush durability ต้องมี independent readback; exception ใน runner
เป็น simulated fault ไม่ใช่หลักฐาน process termination จริง
ทุก error/ambiguous outcome: หยุด ตรวจ ledger/header/properties ก่อนเสนอ recovery

## 4. Rollback drill เฉพาะ disposable fixture

ไม่ rollback หรือ clear 001/002/003 และไม่ลบ historical intent/movements
แยก rollback ของ test fixture ออกจาก business reversal (ไม่ได้อนุมัติในงานนี้)
ก่อน drill เก็บ full snapshot ของ disposable workbook/source/properties และ checksum
พิสูจน์ว่า restore ไป disposable clone ได้โดยไม่แตะ source/fixture ประวัติ
หยุด executions/triggers ของ project disposable ก่อน restore; ให้ owner อนุมัติ
แผน restore เฉพาะ clone พร้อม target IDs ชัดเจนก่อนเขียน
restore ledger+headers+lines+properties+formula text/values ร่วมกัน
PASS = independent full comparison ตรง snapshot, balances reconcile,
ไม่มี orphan/duplicates และ original QA 001/002/003 ไม่เปลี่ยน
ledger-only restore หรือ clear formulas ไม่ใช่ PASS
ยังไม่มีการดำเนิน drill นี้; ห้ามสรุปว่าระบบ rollback ได้จาก offline tests

## หลักฐานส่งกลับสำหรับปิด gate

ส่ง sanitized execution IDs/timestamps, source SHA, status/error markers,
count/unique IDs, before-after deltas, 52-row reconciliation summary,
header/intent/arm validation และผล retry โดยไม่ส่ง secrets/backup values
Final release decision คง BLOCKED แม้ B07 ผ่าน จน required live gates อื่นผ่าน
และมีการอนุมัติงาน release แยกต่างหาก
