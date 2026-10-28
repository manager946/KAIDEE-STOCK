# ขั้นตอน 6B — ตรวจตัวตน Gmail ใน Apps Script โปรเจกต์แยก (ไม่แตะสต๊อก)

## ผลก่อนหน้า
- Live STAGING Admin preflight: 7/7 PASS
- Gmail allowlist config: READY_FOR_IDENTITY_TEST; staffGmailCount 1; role admin; identityVerifiedWithRealStaff false
- Admin PDF file/folder owner-only: PASS
- Real Gmail caller still NOT verified.

## แนวทางที่ปลอดภัย
1. สร้าง Apps Script **โปรเจกต์ใหม่ แบบ Standalone** ชื่อ `KAIDEE-IDENTITY-PROBE-STAGING-ONLY`. ห้ามใส่ในโครงการ KAIDEE-STOCK STAGING/Production เพราะมี `doGet()` ชื่อซ้ำ.
2. เปิด `security/identity-probe/Code.gs` จากสาขาทดสอบ GitHub และคัดลอกเฉพาะเนื้อหา JavaScript ทั้งหมด (ไม่เอา markdown).
3. ตั้ง Script Property ชื่อ `KAIDEE_IDENTITY_PROBE_STAFF_EMAIL` ค่า Gmail พนักงานหนึ่งราย (เก็บเฉพาะในโปรเจกต์ใหม่ ไม่ส่งอีเมลให้ ChatGPT/ไม่ commit).
4. จากบัญชีเจ้าของ Script กด Deploy > New deployment > Web app: Execute as **User accessing the web app**; Who has access: **Anyone with Google account** ถ้าตัวเลือกนี้มี. ต้องยืนยัน deployment แบบจำกัดข้อมูลเท่านั้น — บริการนี้แสดงเพียง boolean ไม่ใช่ข้อมูลบุคคล. ห้ามใช้ `Execute as me`, `Anyone` ไม่ต้องล็อกอิน หรือให้บัญชี Staff เป็น Editor ของ Script. ถ้าไม่มีตัวเลือกนี้ให้หยุด.
5. เปิด URL `/exec` ใน Chrome โปรไฟล์แยกที่ลงชื่อเข้าใช้ด้วยบัญชี Gmail ของพนักงานเท่านั้น และดำเนินการขออนุญาต (ถ้ามี) หลังตรวจชื่อ Script. ไม่ต้องให้พนักงานเข้าถึง Google Sheets/Drive/production credentials.
6. คัดลอกเฉพาะผล JSON **ไม่มีอีเมลในผลลัพธ์**:
   - `test: KAIDEE_GMAIL_IDENTITY_PROBE`
   - `activeEmailVisible: true`
   - `effectiveUserMatchesActive: true`
   - `staffAllowlistMatched: true`
   - `status: STAFF_IDENTITY_CONFIRMED`.
7. ถ้า `DENIED_OR_UNVERIFIED`: หยุด; อย่าเพิ่มสิทธิ์ Drive/Sheet, เปลี่ยน `Execute as me`, หรือสวมสิทธิ์ Admin.

**ข้อจำกัด:** ผลจากโปรเจกต์ทดลองยืนยันว่าระบบ Google ส่งตัวตนให้สคริปต์ได้ภายใต้ deployment ที่กำหนด แต่ยังไม่ใช่การทดสอบการเข้าถึง endpoint/Drive ACL ของ STAGING จริง. สำหรับการทดสอบ Staff/PDF แบบครบวงจรต้องวางระบบ authentication/deployment แยกอย่างรัดกุมและจำกัดสิทธิ์เฉพาะที่จำเป็นก่อน.

แหล่งโค้ด: `security/identity-probe/Code.gs` (สาขา `test/isolated-staging-integration-2026-10-27`). Keep PR #4 Draft; no production deployment.
