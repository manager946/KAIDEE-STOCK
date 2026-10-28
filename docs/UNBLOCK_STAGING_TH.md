# คู่มือติดตั้งและปลด BLOCKED — KAIDEE-STOCK STAGING (27 ตุลาคม 2569)

> **เฉพาะทดสอบเท่านั้น ห้ามทำบน Apps Script โครงการจริงหรือแก้ Google Sheets ต้นฉบับ**

## สถานะล่าสุด
- PR #4 มีหลักฐาน **30/30 tests PASS** จาก GitHub Actions โดยใช้ Node VM และ mock Google Sheets/Drive
- **ยังไม่มีการทดสอบ Apps Script + Google Sheets จริง** และยังไม่มี Deployment Staging
- บัญชีเบราว์เซอร์ที่เชื่อมต่อ ChatGPT เปิด Apps Script Editor ไม่ได้ (browser context / Google CAPTCHA)
- สำเนาสเปรดชีต: https://docs.google.com/spreadsheets/d/149kQunDS0c5xxXbcOcNQNsjLWPUINnlSebkG5o-1qys/edit

## ปลดข้อจำกัดการเข้า Google

1. เปิด Google Chrome ในโปรไฟล์บัญชี Google ที่ได้รับสิทธิ์ใช้งาน Google Sheets Staging (เข้าสู่ระบบด้วยตนเอง)
2. เปิดลิงก์สำเนา Google Sheets ด้านบน; ยืนยันว่าไฟล์มีชื่อเริ่มต้น **KAIDEE-STOCK STAGING**
3. เปิด https://script.google.com/home/projects/create หรือ https://script.new เพื่อสร้างโปรเจกต์ทดลองใหม่ หาก Google ให้ยืนยันตัวตน/CAPTCHA ให้ทำด้วยตนเองบนเบราว์เซอร์ที่เชื่อถือได้ อย่าแชร์รหัสผ่านหรือ OTP
4. ตั้งชื่อ Apps Script โปรเจกต์ \`KAIDEE-STOCK-STAGING-TEST\`; **ห้ามเปิดโปรเจกต์ production แล้วแทนที่ไฟล์เดิม**
5. ถ้าต้องการให้ ChatGPT Work ช่วยต่อ ให้เปิด Work ในเซสชันที่เข้าถึง Google Apps Script ได้แล้ว และระบุให้ตรวจเฉพาะโปรเจกต์ทดลองนี้

## ติดตั้งไฟล์จาก GitHub
เลือก **Branch:** \`test/isolated-staging-integration-2026-10-27\` (Draft PR #4) ไม่ใช่ \`main\`.

ภายในโปรเจกต์ทดลอง สร้างไฟล์และนำเนื้อหาทั้งหมดจาก GitHub มาใส่ตามชื่อจริง:

- \`apps-script/Code.gs\` → ไฟล์สคริปต์ \`Code.gs\`
- \`apps-script/SalesStaging.gs\` → สคริปต์ \`SalesStaging.gs\`
- \`apps-script/StagingDiagnostics.gs\` → สคริปต์ \`StagingDiagnostics.gs\`
- \`apps-script/Index.html\` → ไฟล์ HTML \`Index.html\`

ห้ามนำ \`tests/*.test.js\` ไปวางใน Apps Script: เป็น Node tests เท่านั้น

## ตั้ง Script Property
Apps Script Editor → **Project Settings** → **Script Properties** → **Add script property**

**Property:** \`KAIDEE_STAGING_SPREADSHEET_ID\`

**Value:** \`149kQunDS0c5xxXbcOcNQNsjLWPUINnlSebkG5o-1qys\`

อย่านำ OAuth tokens, password, private key หรือข้อมูลลูกค้าเข้าสู่ GitHub.

## Preflight READ ONLY
1. บันทึกทุกไฟล์ใน Apps Script
2. เลือกฟังก์ชัน \`stagingPreflight\` และกด **Run**
3. อนุมัติ OAuth เฉพาะสิทธิ์ที่เหมาะสมกับโปรเจกต์ทดลอง และบัญชีเจ้าของ (ระวัง Apps Script ขอสิทธิ์ Drive เพราะมีฟังก์ชัน PDF)
4. เปิด Execution log; ต้องเห็นผล \`status: READY_FOR_LIVE_STAGING_TEST\` จากผลลัพธ์ของฟังก์ชัน (หาก Editor ไม่แสดงค่าที่คืน ให้ดูหน้า Executions หรือใส่การเรียก \`Logger.log(JSON.stringify(stagingPreflight()))\` ในฟังก์ชัน wrapper ของโปรเจกต์ทดลอง)
5. ถ้า \`status: BLOCKED\` ให้หยุด ตรวจ tab headers, ชื่อ Staging, สิทธิ์ admin และ Script Property

**หมายเหตุ:** \`stagingPreflight()\` ไม่สร้าง/แก้เซลล์ ไม่บันทึกใบขาย ไม่ตัดสต๊อก และไม่สร้าง PDF.

## Checklist ทดสอบ Apps Script บน Staging
เริ่มจาก Preflight ผ่าน แล้วจึงทดสอบด้วยบัญชีอนุญาตและรหัสสินค้า *เฉพาะ Staging*; เก็บหลักฐานเวลา/OrderID/MovementID และผลลัพธ์ ก่อน-หลังทุกขั้น:

1. สร้างออร์เดอร์ \`stagingCreateOrder\` โดยใช้ \`clientMutationId\` ที่ไม่ซ้ำ และลองส่ง payload เดิมซ้ำ: ต้องได้ OrderID เดิม
2. แปลงเป็นใบขายด้วย \`stagingConvertOrder\`: รายการขายต้องเชื่อม OrderID เดิม
3. ส่งมอบด้วย \`stagingShipOrder\`: จ่ายออกตามแต่ละ SaleLineID ครั้งเดียวเท่านั้น
4. ส่งคำสั่งส่งมอบซ้ำ และสลับคำสั่งซ้ำจากแท็บอื่น: ยอดคงเหลือต้องไม่เปลี่ยน
5. ยกเลิก/คืนสินค้า \`stagingReverseOrder\`: ต้องมี movement รับคืนครบ; ส่งซ้ำต้องไม่เพิ่มยอดอีก
6. ทดสอบ fault injection เฉพาะสำเนา ในขณะที่มีหลาย SaleLineID และเรียก \`stagingRecoverOperation('SHIP:'+id)\`: ตรวจ operation journal และ reconciliation หลัง recovery
7. ตรวจ PDF สร้างใหม่ในโฟลเดอร์ **KAIDEE-STOCK STAGING PDF** เป็น PRIVATE ไม่มี \`anyone\` permission และทดสอบ URL ด้วยบัญชีเจ้าของ พนักงาน และบัญชีที่ไม่ใช่พนักงาน *จริง*
8. ตรวจความสอดคล้องยอด: ledger, stock balances, order status, operation journal, sales totals; ไม่มีรายการซ้ำ
9. ตรวจว่า spreadsheet ต้นฉบับและ Apps Script production ไม่มี version/deployment/data changes

## สิ่งที่ยังต้องระวังก่อนตัดสินใจ go-live
- Google Sheets ไม่รองรับธุรกรรมหลายแถวแบบ ACID; ต้องมีแนวทาง retry, reconciliation, audit trail และ manual recovery ที่ตรวจสอบได้
- \`setSharing(PRIVATE)\` ไม่ได้แปลว่า Staff มีสิทธิ์อ่าน PDF โดยอัตโนมัติ: ตรวจ Google Drive file ACL จริงก่อนรับรอง
- \`Session.getActiveUser()\` อาจว่างตามการตั้งค่า deployment. ทดสอบ role gates ด้วยวิธี Deploy จริงเท่านั้น
- ข้อมูลทดสอบในสำเนาที่คัดมาจาก production อาจมี PII. ห้ามแชร์สำเนาออกสาธารณะ
- ห้าม Merge PR #4 หรือ Deploy production เพียงเพราะ GitHub Actions PASS

**เกณฑ์ผ่าน:** ผล Apps Script runtime + Google Sheets readback + PDFs permissions จริง ต้องมีหลักฐานทุกข้อ จึงตัดสินใจ Production ได้
