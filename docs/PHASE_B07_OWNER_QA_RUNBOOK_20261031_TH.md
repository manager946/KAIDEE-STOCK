# B07 owner QA runbook — ขออนุมัติก่อนรันจริง

เอกสารเป็นข้อเสนอ ไม่ใช่สิทธิ์ให้ agent รัน Google Apps Script หรือแก้ข้อมูล
ให้ผู้ใช้อนุมัติ scope/project/backup ก่อนดำเนินการผ่าน Editor ของ QA แยก
ห้าม Web App deployment, merge, PDF ACL, STAGING/Production และสูตร H8:H59

## 1. B07 ที่ปิดแล้ว — เก็บประวัติ ห้ามรันซ้ำเพื่อสร้างหลักฐาน

**Live Intent Recovery และ Post-Recovery Retry: PASS** ตาม owner Execution log
และการตรวจ Google Sheets จริงที่ผู้ใช้ยืนยันล่าสุด: 52/52 SKU, 6 movements,
IDs ไม่ซ้ำ, 003 `จ่ายแล้ว`; คงข้อมูลเดิมทั้งหมด รวม 001/002/003 และ intent keys
ดู Final QA Report และ `PHASE_B07_LIVE_RECOVERY_VERIFICATION_20261031_TH.md`
สำหรับ provenance; retry PASS เป็นคำยืนยันล่าสุดของผู้ใช้ ไม่มี raw retry log ใหม่
ใน checkout รอบนี้ และ agent ไม่ได้อ่าน Sheets/Script Properties โดยตรงใหม่

ห้ามรัน `phaseB07RecoverAfterIntentOnce`, readiness, crash runner หรือ retry 003
เพื่อเริ่มทดสอบใหม่ recovery runner คาดว่า 4 movements/003 approved ซึ่งล้าสมัยแล้ว
exact original crash timing ยัง INCONCLUSIVE ไม่เปลี่ยนด้วยผล retry PASS

## 2. แผนขออนุญาตแยก — ยังไม่อนุญาตให้เขียนข้อมูลใหม่

ก่อนสร้าง Project/Spreadsheet, seed fixture, ติดตั้ง hook, รัน fault/recovery หรือ restore
ต้องเสนอ scope/diff/ชื่อ target IDs และขออนุญาตผู้ใช้แยกต่างหาก
งานเอกสารและ offline tests รอบนี้ไม่ถือเป็นการอนุมัติ live writes

เสนอสร้าง **Disposable standalone QA Project ใหม่ และ Spreadsheet ใหม่เท่านั้น**
แยกจาก QA เดิม `KAIDEE-STOCK-SYNTHETIC-QA-STEP8-15`, STAGING และ Production
บันทึก expected/denylisted IDs แบบส่วนตัว ยืนยัน target ID/title/sentinel ทั้งสองฝั่ง;
หาก ID ว่าง/ตรง protected target หรือ guard ไม่ผ่าน ให้ STOP ก่อน mutation
ห้ามผ่อน adapter เดิมซึ่งรับ 001/002/003; เสนอ adapter ใหม่เฉพาะ disposable scope
ใช้ synthetic SKUs และ request/document/line/Movement IDs ใหม่ เช่น prefix
`QA-DISP-<run>-PC/LOCK/PROP/RESTORE` ไม่ reuse 001/002/003
แยก fixture หรือ clone ใหม่ต่อ scenario เพื่อไม่ให้ partial state ปนกัน

เก็บ source SHA, runtime/project identity, เวลา/execution ID, complete ledger,
headers/lines, inventory values/formula text, relevant Script Properties แบบส่วนตัว,
trigger/config metadata และ full backup ที่ restore ได้ก่อน fault injection
บันทึก names/presence/hash ใน sanitized report ไม่ commit secret values/IDs ส่วนตัว
FNV snapshot เก่าไม่ใช่ backup ของ disposable target ใหม่
ยืนยัน protected fixture เดิมเป็น read-only และทำ before/after comparison
โดยไม่แก้ข้อมูลหรือสูตร H8:H59 ในที่ใด; clone ใช้สูตรเดิมและตรวจอ่านเท่านั้น
หากต้องเปลี่ยนสูตรเพื่อให้แผนทำงาน ให้ STOP และเสนอขอบเขตใหม่ ห้ามแก้เอง

## 3. Partial commit / Lock / Properties — อนุมัติและรีวิว runner ก่อน

**ยังไม่มี real runner ที่อนุมัติสำหรับขั้นนี้ ห้ามดัดแปลง B07 runner ไปใช้ทันที**
หลังได้รับอนุญาตแยกแล้วจึงสร้าง disposable QA project + workbook แยกใหม่ ใช้ request IDs ใหม่ไม่ซ้ำ 001/002/003
adapter ปัจจุบันรับแค่สามใบ ห้ามเพิ่มใบใน fixture เดิมหรือผ่อน guard
ต้องเสนอ diff ของ QA-only hook, fixture IDs, fault location, one-shot disarm,
timeout และวิธีเก็บหลักฐานให้ reviewer ยอมรับก่อนติดตั้ง/รัน

| กรณี | วิธีทดสอบที่ต้องรีวิว | เกณฑ์ PASS |
| --- | --- | --- |
| Partial commit | hook one-shot หลัง activate แถวแรกของใบใหม่สองบรรทัด | intent persisted; active 1/prepared 1; header approved; readback ตรง delta; approved resume จ่ายเฉพาะ pending; retry ไม่ซ้ำ |
| LockService | execution A ถือ script lock เกิน waitLock 20 วินาทีเล็กน้อย (เช่น 25 วินาที) และต่ำกว่า execution limit; B เรียก workflow เดียวกันใน project เดียวกัน; เก็บ overlapping timestamps | B เข้า critical section ไม่ได้ระหว่าง A ถือ lock; timeout ไม่มี writes; release แล้ว retry ไม่ซ้ำ |
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
restore ledger+headers+lines+properties+formula text/values ร่วมกันเฉพาะ target ใหม่
เลือก snapshot ที่มีทั้ง paid และ approved synthetic requests; เมื่อ restore เสร็จ
ให้ตรวจ source/config/trigger metadata และ logical timestamps (เทียบ ISO ไม่ใช่ object identity)
จากนั้น owner อนุมัติ validation mutation บน clone ใหม่: paid retry ต้อง reused:true
และ approved request ใหม่จ่ายได้ครั้งเดียว โดย snapshot ต้นทาง/QA เดิมไม่เปลี่ยน
เก็บ full snapshot ก่อน validation mutation และแยกผลหลัง validation ออกจาก restore equality
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
