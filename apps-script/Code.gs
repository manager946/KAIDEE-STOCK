/**
 * LED Stock Dashboard - Google Apps Script (Web App)
 * วางไฟล์นี้ในโปรเจกต์ Apps Script ที่สร้างจาก Google Sheets (ส่วนขยาย > Apps Script)
 * ชื่อชีตต้องตรงกับไฟล์: คลังสินค้า, บันทึกรับ-จ่าย, ใบเบิกสินค้า, รายการใบเบิก
 *
 * หลักการนับสต๊อก: ทุกการเคลื่อนไหวอยู่ในชีต บันทึกรับ-จ่าย ที่เดียว
 *   คงเหลือ = ยอดยกมา + รับเข้า − จ่ายออก
 *   เมื่อกด "จ่ายสินค้า" ตามใบเบิก ระบบจะเขียนรายการ จ่ายออก ลงชีตนี้ (DocumentNo = เลขใบเบิก)
 * STAGING SAFETY: do not run fixFormulas(); it is disabled to preserve reconciliation formulas.
 */
const SH = {inv: 'คลังสินค้า', mv: 'บันทึกรับ-จ่าย', rq: 'ใบเบิกสินค้า', ln: 'รายการใบเบิก', sum: 'สรุปยอดขายรายเดือน'};
const INV_FIRST = 8;   // แถวแรกของสินค้าในชีตคลังสินค้า
const MV_FIRST = 4;    // แถวแรกของข้อมูลในชีตบันทึกรับ-จ่าย

/** ค่าเริ่มต้นหัวกระดาษใบเบิก — แก้ได้จากหน้าเว็บ (แท็บ ใบเบิก → ข้อมูลบริษัท) ค่าที่บันทึกจากหน้าเว็บจะใช้แทนค่านี้ */
const COMPANY = {
  name: '',
  address: '',
  taxId: '',          // เลขประจำตัวผู้เสียภาษี 13 หลัก
  branch: '',         // '' = สำนักงานใหญ่ หรือเลขสาขา 5 หลัก เช่น '00001'
  phone: ''
};
const VAT_RATE = 0.07;
const PDF_FOLDER = 'KAIDEE-STOCK STAGING PDF'; // Dedicated test folder; never mix with real PDFs         // โฟลเดอร์ใน Google Drive ที่เก็บไฟล์ PDF
const PDF_SHARE_ANYONE = false; // Private by default. Never auto-share internal sales documents.                 // true = ทุกคนที่มีลิงก์เปิดดูได้ (ส่งทาง LINE ได้), false = เฉพาะคนที่มีสิทธิ์
const APPROVERS = [];  // อีเมลผู้มีสิทธิ์อนุมัติใบเบิก เช่น ['manager@metangprint.org'] — เว้นว่าง = ทุกคนอนุมัติได้

/**
 * ผู้ดูแลที่ยืนยันการลบรายการจ่ายตามใบเบิก (คืนสต๊อกทั้งใบ) เช่น ['manager@metangprint.org']
 * เว้นว่าง = เจ้าของสคริปต์ (บัญชีที่กด ทำให้ใช้งานได้) เป็นผู้ดูแล
 */
// STAGING ONLY: explicit Admin allowlist; no dynamic effective-user fallback.
// In execute-as-user runs, getEffectiveUser() may be the invoking Staff user.
const ADMINS = ['manager@metangprint.org'];
/**
 * หน้าบ้าน / หลังบ้าน
 *  - แอดมิน   = ADMINS ที่กำหนดรายชื่อชัดเจน (ไม่อนุมานจากผู้เรียกใช้)
 *  - ผู้ดูแล/พนักงานหลังบ้าน = ทุกอีเมลในโดเมน STAFF_DOMAIN และอีเมลใน STAFF
 *  - หน้าบ้าน (บุคคลภายนอก) = คนอื่นทั้งหมด เห็นเฉพาะแคตตาล็อกสินค้า และส่งคำสั่งเบิกสินค้าได้อย่างเดียว
 * ระบบรู้อีเมลได้เฉพาะคนในโดเมนเดียวกับเจ้าของสคริปต์ คนนอกโดเมนจะเป็นหน้าบ้านเสมอ
 */
const STAFF_DOMAIN = 'metangprint.org';
const STAFF = [];
// STAGING ONLY: extra exact Gmail addresses are held in Script Properties,
// not committed to GitHub. Never trust an email supplied by the browser.
const STAGING_STAFF_EMAILS_PROPERTY = 'KAIDEE_STAGING_STAFF_EMAILS';
const PUBLIC_SHOW_PRICE = true;            // หน้าบ้านเห็นราคาต่อหน่วยในแคตตาล็อก
const PUBLIC_ORDER_LIMIT_PER_HOUR = 30;    // จำกัดจำนวนคำสั่งจากหน้าบ้านต่อชั่วโมง กันสแปม
const PUBLIC_TAG = '[หน้าบ้าน]';

/** ชีตเก็บคำขอลบ ระบบสร้างให้อัตโนมัติเมื่อมีคำขอแรก */
const DREQ_SH = 'คำขอลบรายการ';
const DREQ_HEAD = ['RequestID', 'วันที่ขอ', 'ผู้ขอ', 'เอกสาร', 'จำนวนรายการ', 'เหตุผล', 'สถานะ', 'ผู้ดูแล', 'วันที่ตัดสิน', 'MovementID'];

const EDITABLE = ['ร่าง', 'รออนุมัติ', 'อนุมัติ'];
/** ใบเบิกคิดราคาเป็นสัดส่วนของราคาสินค้าในคลัง (0.5 = 50%) */
const REQ_PRICE_RATE = 0.5;
/** จำนวนคอลัมน์ที่ล้างเมื่อลบใบเบิก (รวมคอลัมน์ L–S ที่เวอร์ชันก่อนอาจเคยเขียนไว้) */
const RQ_COLS = 19;
/** ชีตใบเสนอราคา ระบบสร้างให้อัตโนมัติเมื่อบันทึกใบแรก */
const QSH = {qt: 'ใบเสนอราคา', ql: 'รายการใบเสนอราคา'};
const QT_HEAD = ['QuoteID', 'เลขที่', 'วันที่', 'ลูกค้า', 'ที่อยู่ลูกค้า', 'เลขผู้เสียภาษีลูกค้า', 'สาขาลูกค้า', 'ผู้ติดต่อ/โทร',
  'พนักงานขาย', 'ยืนราคา (วัน)', 'ส่วนลด (บาท)', 'เงื่อนไข', 'ผู้สร้าง', 'แก้ไขล่าสุด',
  'สถานะ', 'ใบเบิกอ้างอิง', 'วันที่ยืนยัน', 'ผู้ยืนยัน'];
const QL_HEAD = ['LineID', 'QuoteID', 'รหัส/รุ่นสินค้า', 'จำนวน', 'ราคา/หน่วย'];

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('ขายดีมีตังค์')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* ---------- ตัวช่วย ---------- */
const isDate_ = v => Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v);
function fmtDate_(v) {
  return isDate_(v) ? Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd') : '';
}
function parseDate_(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3]);
}
const me_ = () => Session.getActiveUser().getEmail() || 'web';
const ss_ = () => stagingDb_(); // STAGING BUILD ONLY: all legacy functions use the verified copy
const sh_ = name => {
  const s = ss_().getSheetByName(name);
  if (!s) throw new Error('ไม่พบชีต ' + name);
  return s;
};
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { const r = fn(); SpreadsheetApp.flush(); return r; } finally { lock.releaseLock(); }
}
/** แถวว่างแถวแรก (ดูจากคอลัมน์ที่กำหนด) ถ้าไม่มีให้เพิ่มแถวท้ายชีต */
function emptyRow_(sh, first, cols) {
  const max = sh.getMaxRows();
  if (max >= first) {
    const v = sh.getRange(first, 1, max - first + 1, Math.max.apply(null, cols)).getValues();
    const i = v.findIndex(r => cols.every(c => r[c - 1] === ''));
    if (i !== -1) return first + i;
  }
  sh.insertRowAfter(max);
  return max + 1;
}

/* ---------- อ่านข้อมูล ---------- */
function readItems_() {
  const s = sh_(SH.inv);
  const n = Math.max(s.getLastRow() - INV_FIRST + 1, 1);
  return s.getRange(INV_FIRST, 1, n, 10).getValues().filter(r => r[0] !== '')
    .map(r => [String(r[0]), r[1], r[2], r[3], Number(r[4]) || 0, Number(r[5]) || 0, Number(r[9]) || 0]);
}
function readMv_() {
  const s = sh_(SH.mv);
  const n = Math.max(s.getLastRow() - MV_FIRST + 1, 1);
  return s.getRange(MV_FIRST, 1, n, 14).getValues().map((r, i) => ({
    row: MV_FIRST + i, date: r[0], type: r[1], code: String(r[2]), qty: Number(r[4]) || 0,
    amount: Number(r[7]) || 0, user: r[8], note: r[9], id: String(r[10] || '') || 'ROW-' + (MV_FIRST + i), doc: String(r[13] || '')
  })).filter(x => (x.type === 'รับเข้า' || x.type === 'จ่ายออก') && x.code !== '');
}
function readReqs_() {
  const rs = sh_(SH.rq), ls = sh_(SH.ln);
  const rv = rs.getLastRow() > 1 ? rs.getRange(2, 1, rs.getLastRow() - 1, 11).getValues() : [];
  const lv = ls.getLastRow() > 1 ? ls.getRange(2, 1, ls.getLastRow() - 1, 5).getValues() : [];
  const lines = lv.map((l, i) => ({row: 2 + i, id: String(l[0]), req: String(l[1]), code: String(l[2]), qty: Number(l[3]) || 0, note: l[4]}))
    .filter(l => l.id !== '' && l.code !== '');
  return rv.map((r, i) => ({
    row: 2 + i, id: String(r[0]), no: r[1], date: r[2], requester: r[3], dept: r[4], reason: r[5],
    status: r[6], approver: r[7], payer: r[8], paidAt: r[9], creator: r[10],
    lines: lines.filter(l => l.req === String(r[0]))
  })).filter(r => r.id !== '');
}
/** คงเหลือ = ยอดยกมา + รับเข้า − จ่ายออก (จากชีตบันทึกรับ-จ่ายอย่างเดียว) */
function balances_(items, mv) {
  const b = {};
  items.forEach(i => { b[i[0]] = i[5]; });
  mv.forEach(m => { if (m.code in b) b[m.code] += m.type === 'รับเข้า' ? m.qty : -m.qty; });
  return b;
}
/**
 * Read-only, fail-closed stock formula gate. Checks every nonblank SKU row.
 *
 * The current STAGING H-column hybrid formula includes BOTH:
 *   - outgoing movements, including REQ-* and SALE-* postings; and
 *   - a paid-requisition fallback without a matching REQ-* anti-duplicate term.
 * Its SALE-* fallback has anti-double-counting, but paid requisitions do not.
 * Therefore the hybrid formula must NOT authorize a new requisition issue.
 *
 * A pure, canonical movement-ledger formula is the only formula shape this
 * guard can classify as safe for NEW requisition issues. This is NOT a full
 * historical migration/reconciliation certificate. Never auto-repair a sheet.
 */
// Normalize syntax only: whitespace/case inside quoted names or criteria changes semantics.
function stockFormulaSyntax_(formula) {
  return String(formula || '').replace(/("(?:[^"]|"")*"|'(?:[^']|'')*')|([^"']+)/g,
    (match, quoted, syntax) => quoted || syntax.replace(/\s+/g, '').toUpperCase());
}
function stockFormulaAudit_() {
  const inv = sh_(SH.inv);
  const count = Math.max(inv.getLastRow() - INV_FIRST + 1, 0);
  const issues = [];
  let checkedSkuCount = 0;
  if (!count) issues.push({row: INV_FIRST, reason: 'NO_INVENTORY_ROWS'});
  else {
    const skuCells = inv.getRange(INV_FIRST, 1, count, 1).getDisplayValues();
    const hFormulas = inv.getRange(INV_FIRST, 8, count, 1).getFormulas();
    for (let i = 0; i < count; i++) {
      if (!String(skuCells[i][0] || '').trim()) continue;
      checkedSkuCount++;
      const row = INV_FIRST + i;
      const actual = stockFormulaSyntax_(hFormulas[i][0]);
      const canonical = stockFormulaSyntax_("=SUMIFS('บันทึกรับ-จ่าย'!$E:$E,'บันทึกรับ-จ่าย'!$C:$C,A" +
        row + ",'บันทึกรับ-จ่าย'!$B:$B,\"จ่ายออก\")");
      if (actual !== canonical) {
        const reason = actual.includes('รายการใบเบิก')
          ? 'REQUISITION_FALLBACK_DOUBLE_COUNT_RISK'
          : 'NONCANONICAL_OR_MISSING_ISSUED_FORMULA';
        if (issues.length < 12) issues.push({row, reason});
      }
    }
    if (!checkedSkuCount) issues.push({row: INV_FIRST, reason: 'NO_SKUS'});
  }
  const d = String(sh_(SH.mv).getRange(MV_FIRST, 4).getFormula() || '');
  if (/\$D\$59\b/i.test(d)) issues.push({row: MV_FIRST, reason: 'LEGACY_BOUNDED_MOVEMENT_FORMULA'});
  return {
    status: issues.length ? 'REVIEW_REQUIRED' : 'MOVEMENT_ONLY_FORMULA_VERIFIED',
    safeForNewRequisitionIssue: issues.length === 0,
    checkedSkuCount, issues,
    note: 'READ ONLY: checks formula shape, not historical ledger reconciliation. Never run fixFormulas.'
  };
}
// Keep legacy UI flag fail-closed; it now means manual review required, not auto-repair.
function needFix_() { return !stockFormulaAudit_().safeForNewRequisitionIssue; }
/** Admin-only, no document mutation; log only the summary, not the formulas or SKUs. */
function qaStockFormulaAuditReadOnly() {
  requireAdmin_();
  const result = stockFormulaAudit_();
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

/** ข้อมูลทั้งหมดสำหรับหน้าเว็บ */
function getData() {
  if (role_() === 'public') return publicData_();
  const items = readItems_();
  const mv = readMv_().map(m => [fmtDate_(m.date), m.type, m.code, m.qty, m.amount, m.user || '', m.note || '', m.id, m.doc]);
  const rq = readReqs_().map(r => [
    r.no, fmtDate_(r.date), r.requester, r.dept, r.reason, r.status,
    r.lines.map(l => [l.code, l.qty, l.id, l.note || '']),
    r.approver || '', r.id, r.payer || '', fmtDate_(r.paidAt)
  ]);
  return {items: items, mv: mv, rq: rq, needFix: needFix_(), me: me_(), company: getCompany_(), vatRate: VAT_RATE, reqRate: REQ_PRICE_RATE, qt: readQuotes_().map(quoteOut_), spec: readSpecs_(),
    role: role_(), isAdmin: isAdmin_(), admins: admins_(), dreq: readDelReqs_().slice(-50).map(x => { delete x.row; return x; })};
}

/* ===================== หน้าบ้าน (บุคคลภายนอก) ===================== */
/** ข้อมูลที่หน้าบ้านเห็น: แคตตาล็อก สเปก และสถานะมีสินค้า (ไม่มีจำนวนสต๊อก ยอดขาย ใบเบิก ใบเสนอราคา) */
function publicData_() {
  const items = readItems_(), b = balances_(items, readMv_()), pend = {};
  readReqs_().filter(r => r.status === 'รออนุมัติ' || r.status === 'อนุมัติ')
    .forEach(r => r.lines.forEach(l => { pend[l.code] = (pend[l.code] || 0) + l.qty; }));
  const avail = {};
  items.forEach(i => { const a = (b[i[0]] || 0) - (pend[i[0]] || 0); avail[i[0]] = a <= 0 ? 'สินค้าหมด' : a <= i[6] ? 'เหลือน้อย' : 'มีสินค้า'; });
  const co = getCompany_();
  return {role: 'public', me: '', items: items.map(i => [i[0], i[1], i[2], i[3], PUBLIC_SHOW_PRICE ? i[4] : 0, 0, 0]), avail: avail,
    showPrice: PUBLIC_SHOW_PRICE, spec: readSpecs_(), company: {name: co.name, phone: co.phone},
    mv: [], rq: [], qt: [], dreq: [], needFix: false, isAdmin: false, vatRate: VAT_RATE, reqRate: REQ_PRICE_RATE};
}
/** หน้าบ้านส่งคำสั่งเบิกสินค้า → กลายเป็นใบเบิกสถานะ รออนุมัติ ให้หลังบ้านตรวจ */
function submitOrder(o) {
  o = o || {};
  if (String(o.website || '')) throw new Error('ส่งคำสั่งไม่สำเร็จ');   // ช่องกับดักบอท
  const name = String(o.name || '').trim().slice(0, 80), contact = String(o.contact || '').trim().slice(0, 80);
  const company = String(o.company || '').trim().slice(0, 120), note = String(o.note || '').trim().slice(0, 300);
  if (!name) throw new Error('กรุณาใส่ชื่อผู้สั่ง');
  if (!contact) throw new Error('กรุณาใส่เบอร์โทรหรือ LINE สำหรับติดต่อกลับ');
  const lines = (o.lines || []).slice(0, 31);
  if (lines.length > 30) throw new Error('สั่งได้ไม่เกิน 30 รายการต่อครั้ง');
  lines.forEach(l => { const q = Number(l.qty); if (!(q >= 1 && q <= 100000 && Math.floor(q) === q)) throw new Error('จำนวนของ ' + l.code + ' ต้องเป็นจำนวนเต็ม 1–100,000'); });
  return withLock_(() => {
    const props = PropertiesService.getScriptProperties();
    const key = 'ORD_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMddHH');
    const n = Number(props.getProperty(key) || 0);
    if (n >= PUBLIC_ORDER_LIMIT_PER_HOUR) throw new Error('มีคำสั่งเข้ามามากเกินไป กรุณาลองใหม่ภายหลังหรือติดต่อทางโทรศัพท์');
    const res = saveReqCore_({date: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
      requester: name + ' (' + contact + ')', dept: company || 'ลูกค้าภายนอก', reason: (PUBLIC_TAG + ' ' + note).trim(),
      lines: lines.map(l => ({code: String(l.code || ''), qty: Number(l.qty), note: ''}))});
    props.setProperty(key, String(n + 1));
    return {ok: true, no: res.no};
  });
}

/* ---------- รับ-จ่าย ---------- */
/** ตรวจว่าหลังเปลี่ยนแปลงแล้วไม่มีสินค้าติดลบ */
function assertNoNegative_(items, mvAfter, codes) {
  const b = balances_(items, mvAfter);
  codes.forEach(c => {
    if (b[c] < 0) throw new Error('ทำไม่ได้: ' + c + ' จะเหลือ ' + b[c] + ' (ติดลบ)');
  });
}
function checkMove_(m, items) {
  if (m.type !== 'รับเข้า' && m.type !== 'จ่ายออก') throw new Error('ประเภทรายการไม่ถูกต้อง');
  if (!Number.isFinite(Number(m.qty)) || Number(m.qty) <= 0) throw new Error('จำนวนต้องเป็นตัวเลขที่มากกว่า 0');
  if (!items.some(i => i[0] === String(m.code))) throw new Error('ไม่พบรหัสสินค้า ' + m.code);
  if (m.date && !parseDate_(m.date)) throw new Error('วันที่ไม่ถูกต้อง');
}

/** เพิ่มรายการรับเข้า/จ่ายออก */
function addMovement(m) {
  requireStaff_();
  return withLock_(() => {
    const items = readItems_(), mv = readMv_();
    checkMove_(m, items);
    const code = String(m.code), qty = Number(m.qty);
    assertNoNegative_(items, mv.concat([{type: m.type, code: code, qty: qty}]), [code]);
    const sh = sh_(SH.mv);
    const row = emptyRow_(sh, MV_FIRST, [2, 3]);
    ensureMvFormulas_(sh, row);
    const now = new Date();
    sh.getRange(row, 1, 1, 3).setValues([[parseDate_(m.date) || now, m.type, code]]);
    sh.getRange(row, 5).setValue(qty);
    sh.getRange(row, 9, 1, 5).setValues([[m.user || me_(), m.note || '', 'WEB-' + now.getTime(), now, me_()]]);
    return {ok: true, row: row};
  });
}

/** แก้ไขรายการรับ-จ่ายที่บันทึกแล้ว */
function updateMovement(id, m) {
  requireStaff_();
  return withLock_(() => {
    const items = readItems_(), mv = readMv_();
    const cur = mv.find(x => x.id === id);
    if (!cur) throw new Error('ไม่พบรายการ ' + id);
    if (cur.doc) {
      // รายการจากใบเบิก: แก้ได้เฉพาะวันที่ ผู้บันทึก หมายเหตุ (สินค้า/จำนวนต้องตรงกับใบเบิก)
      if ((m.type && m.type !== cur.type) || (m.code && String(m.code) !== cur.code) || (m.qty !== undefined && m.qty !== '' && Number(m.qty) !== cur.qty))
        throw new Error('รายการจากใบเบิก ' + cur.doc + ' แก้ได้เฉพาะวันที่ ผู้บันทึก หมายเหตุ ถ้าต้องแก้จำนวน ให้กดลบ (คืนสต๊อกทั้งใบ) แล้วแก้ที่ใบเบิก');
      if (m.date && !parseDate_(m.date)) throw new Error('วันที่ไม่ถูกต้อง');
      const s = sh_(SH.mv);
      s.getRange(cur.row, 1).setValue(parseDate_(m.date) || cur.date || new Date());
      s.getRange(cur.row, 9, 1, 2).setValues([[m.user || cur.user || me_(), m.note || '']]);
      return {ok: true};
    }
    checkMove_(m, items);
    const after = mv.map(x => x.id === id ? {type: m.type, code: String(m.code), qty: Number(m.qty)} : x);
    assertNoNegative_(items, after, [cur.code, String(m.code)]);
    const sh = sh_(SH.mv);
    ensureMvFormulas_(sh, cur.row);
    sh.getRange(cur.row, 1, 1, 3).setValues([[parseDate_(m.date) || cur.date || new Date(), m.type, String(m.code)]]);
    sh.getRange(cur.row, 5).setValue(Number(m.qty));
    sh.getRange(cur.row, 9, 1, 2).setValues([[m.user || cur.user || me_(), m.note || '']]);
    if (/^ROW-/.test(id)) sh.getRange(cur.row, 11).setValue('WEB-' + Date.now());
    return {ok: true};
  });
}

/** ลบรายการรับ-จ่าย (ล้างข้อมูลในแถว แต่เก็บสูตรคอลัมน์ D, F, H ไว้) */
function admins_() {
  // Fail closed: only explicitly configured, nonempty Admin addresses.
  return ADMINS.map(x => String(x).trim().toLowerCase()).filter(Boolean);
}
function isAdmin_() { return admins_().indexOf(String(me_()).toLowerCase()) !== -1; }
function stagingStaffGmailEmails_() {
  const prop = PropertiesService.getScriptProperties()
    .getProperty(STAGING_STAFF_EMAILS_PROPERTY);
  const entries = String(prop || '').split(',');
  // Exact email allowlist only; no wildcard/domain granting for Gmail.
  return entries.map(x => x.trim().toLowerCase())
    .filter(x => /^[a-z0-9._%+-]+@gmail\.com$/.test(x));
}
function role_() {
  if (isAdmin_()) return 'admin';
  const m = String(me_()).trim().toLowerCase();
  // Apps Script may hide an external user's email in execute-as-owner mode.
  // A missing identity MUST NOT gain Staff/Admin access.
  if (!m || m === 'web') return 'public';
  if (STAFF.map(x => String(x).trim().toLowerCase()).indexOf(m) !== -1) return 'staff';
  if (stagingStaffGmailEmails_().indexOf(m) !== -1) return 'staff';
  if (STAFF_DOMAIN && m.slice(-(STAFF_DOMAIN.length + 1)) === '@' + STAFF_DOMAIN.toLowerCase()) return 'staff';
  return 'public';
}

// Admin-only, read-only config check. Does not disclose any email address.
function qaStagingStaffGmailConfigReadOnly() {
  requireAdmin_();
  const ss = stagingDb_();
  if (ss.getId() !== '149kQunDS0c5xxXbcOcNQNsjLWPUINnlSebkG5o-1qys') {
    throw new Error('STAGING spreadsheet guard failed');
  }
  const raw = String(PropertiesService.getScriptProperties()
    .getProperty(STAGING_STAFF_EMAILS_PROPERTY) || '').trim();
  const configured = stagingStaffGmailEmails_();
  const valid = raw !== '' && raw.split(',').length === 1 &&
    configured.length === 1;
  const result = {
    test: 'STAGING_STAFF_GMAIL_ALLOWLIST_CONFIG_READ_ONLY',
    status: valid ? 'READY_FOR_IDENTITY_TEST' : 'BLOCKED',
    staffGmailCount: configured.length,
    currentRole: role_(),
    identityVerifiedWithRealStaff: false,
    note: 'READ ONLY. No emails printed, no PDF created, no sharing changed.'
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}
function requireStaff_() { if (role_() === 'public') throw new Error('ส่วนนี้สำหรับพนักงานหลังบ้านเท่านั้น'); }
/** ตรวจสิทธิ์แอดมินจากเซิร์ฟเวอร์ก่อนเปลี่ยนสูตรหรือโครงสร้างชีต */
function requireAdmin_() { if (!isAdmin_()) throw new Error('เฉพาะผู้ดูแลระบบเท่านั้น'); }

/** ลบรายการรับ-จ่าย: รายการที่มาจากใบเบิก (คืนสต๊อกทั้งใบ) ผู้ดูแลเท่านั้นที่ลบได้ คนอื่นให้ส่งคำขอด้วย requestDelete */
function deleteMovement(id) {
  requireStaff_();
  return withLock_(() => {
    const cur = readMv_().find(x => x.id === id);
    if (cur && cur.doc && !isAdmin_()) throw new Error('การลบรายการจ่ายตามใบเบิก (คืนสต๊อกทั้งใบ) ต้องให้ผู้ดูแลยืนยัน กด "ขอลบ" เพื่อส่งคำขอให้ผู้ดูแล');
    return deleteMovementCore_(id);
  });
}
function deleteMovementCore_(id) {
  {
    const items = readItems_(), mv = readMv_();
    const cur = mv.find(x => x.id === id);
    if (!cur) throw new Error('ไม่พบรายการ ' + id);
    const sh = sh_(SH.mv);
    // เก็บแถวเดิมเป็น audit trail แทน clearContent(): สูตร SUMIFS และ readMv_
    // นับเฉพาะ "รับเข้า" / "จ่ายออก" จึงไม่กระทบยอดเมื่อเปลี่ยนเป็น "ยกเลิก-..."
    const cancel = x => {
      const cell = sh.getRange(x.row, 2);
      const oldType = String(cell.getValue());
      if (oldType !== 'รับเข้า' && oldType !== 'จ่ายออก') throw new Error('สถานะรายการเปลี่ยนแล้ว กรุณารีเฟรช');
      const note = 'ยกเลิก ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss') + ' โดย ' + me_();
      // เขียนหมายเหตุในเซลล์เดิมก่อนเปลี่ยนประเภทรายการ เพื่อให้ตรวจย้อนหลังได้
      cell.setNote((note + '\n' + (cell.getNote() || '')).slice(0, 2000));
      cell.setValue('ยกเลิก-' + oldType);
    };
    if (cur.doc) {
      // ต้องยกเลิกทั้งใบเพื่อป้องกันยอดเบิกไม่ตรงกับเอกสาร
      const rows = mv.filter(x => x.doc === cur.doc);
      rows.forEach(cancel);
      const r = readReqs_().find(x => x.no === cur.doc);
      if (r && r.status === 'จ่ายแล้ว') {
        const rs = sh_(SH.rq);
        rs.getRange(r.row, 7).setValue('อนุมัติ');
        rs.getRange(r.row, 9, 1, 2).clearContent();
      }
      return {ok: true, reverted: cur.doc, count: rows.length};
    }
    // ยกเลิกการรับเข้าอาจทำให้คงเหลือติดลบ จึงต้องตรวจเช่นเดิม
    assertNoNegative_(items, mv.filter(x => x.id !== id), [cur.code]);
    cancel(cur);
    return {ok: true};
  }
}

/* ---------- คำขอลบรายการจ่ายตามใบเบิก (รอผู้ดูแลยืนยัน) ---------- */
function dreqSheet_(create) {
  let sh = ss_().getSheetByName(DREQ_SH);
  if (!sh && create) { sh = ss_().insertSheet(DREQ_SH); sh.getRange(1, 1, 1, DREQ_HEAD.length).setValues([DREQ_HEAD]); }
  return sh;
}
function readDelReqs_() {
  const sh = dreqSheet_(false);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, DREQ_HEAD.length).getValues().map((r, i) => ({
    row: 2 + i, id: String(r[0]), at: isDate_(r[1]) ? Utilities.formatDate(r[1], Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm') : String(r[1]),
    by: String(r[2]), doc: String(r[3]), count: Number(r[4]) || 0, reason: String(r[5]), status: String(r[6]),
    admin: String(r[7]), decidedAt: isDate_(r[8]) ? Utilities.formatDate(r[8], Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm') : String(r[8] || ''), mvId: String(r[9])
  })).filter(x => x.id !== '');
}
/** ส่งคำขอลบรายการจ่ายตามใบเบิก ให้ผู้ดูแลยืนยัน */
function requestDelete(id, reason) {
  requireStaff_();
  const why = String(reason || '').trim();
  if (!why) throw new Error('กรุณาใส่เหตุผลที่ขอลบ');
  return withLock_(() => {
    const mv = readMv_(), cur = mv.find(x => x.id === id);
    if (!cur) throw new Error('ไม่พบรายการ ' + id);
    if (!cur.doc) throw new Error('รายการนี้ไม่ได้มาจากใบเบิก ลบได้เลยโดยไม่ต้องขอ');
    const dup = readDelReqs_().find(x => x.doc === cur.doc && x.status === 'รออนุมัติ');
    if (dup) throw new Error('มีคำขอลบ ' + cur.doc + ' รอผู้ดูแลยืนยันอยู่แล้ว');
    const sh = dreqSheet_(true), row = emptyRow_(sh, 2, [1]);
    const reqId = 'DEL-' + Utilities.getUuid().slice(0, 8);
    sh.getRange(row, 1, 1, DREQ_HEAD.length).setValues([[reqId, new Date(), me_(), cur.doc, mv.filter(x => x.doc === cur.doc).length, why.slice(0, 300), 'รออนุมัติ', '', '', id]]);
    return {ok: true, id: reqId, doc: cur.doc};
  });
}
/** ผู้ดูแลอนุมัติ (ลบและคืนสต๊อกทั้งใบ) หรือไม่อนุมัติคำขอ — ผู้ขอยกเลิกคำขอของตัวเองได้ */
function decideDelete(reqId, approve) {
  requireStaff_();
  return withLock_(() => {
    const q = readDelReqs_().find(x => x.id === reqId);
    if (!q) throw new Error('ไม่พบคำขอ ' + reqId);
    if (q.status !== 'รออนุมัติ') throw new Error('คำขอนี้' + q.status + 'ไปแล้ว');
    const admin = isAdmin_(), own = String(q.by).toLowerCase() === String(me_()).toLowerCase();
    if (approve && !admin) throw new Error('เฉพาะผู้ดูแลเท่านั้นที่อนุมัติการลบได้');
    if (!approve && !admin && !own) throw new Error('เฉพาะผู้ดูแลหรือผู้ขอเท่านั้นที่ยกเลิกคำขอได้');
    let status = approve ? 'อนุมัติ' : (admin ? 'ไม่อนุมัติ' : 'ผู้ขอยกเลิก'), res = null;
    if (approve) {
      const mv = readMv_(), target = mv.find(x => x.id === q.mvId) || mv.find(x => x.doc === q.doc);
      if (target) res = deleteMovementCore_(target.id); else status = 'ยกเลิก (ไม่พบรายการแล้ว)';
    }
    dreqSheet_(true).getRange(q.row, 7, 1, 3).setValues([[status, me_(), new Date()]]);
    return {ok: true, status: status, doc: q.doc, count: res ? res.count : 0};
  });
}

/* ---------- ข้อมูลบริษัท (หัวกระดาษใบเบิก) ---------- */
function getCompany_() {
  let saved = {};
  try { saved = JSON.parse(PropertiesService.getScriptProperties().getProperty('COMPANY') || '{}'); } catch (e) {}
  const c = {};
  ['name', 'address', 'taxId', 'branch', 'phone'].forEach(k => { c[k] = String(saved[k] != null ? saved[k] : (COMPANY[k] || '')); });
  return c;
}
/** ตรวจเลขประจำตัวผู้เสียภาษี 13 หลักตามหลักเลขตรวจสอบของกรมสรรพากร */
function validTaxId_(id) {
  if (!/^\d{13}$/.test(id)) return false;
  let s = 0;
  for (let i = 0; i < 12; i++) s += +id[i] * (13 - i);
  return (11 - s % 11) % 10 === +id[12];
}
/** บันทึกข้อมูลบริษัทจากหน้าเว็บ */
function setCompany(c) {
  requireStaff_();
  if (APPROVERS.length && APPROVERS.indexOf(me_()) === -1) throw new Error('คุณไม่มีสิทธิ์แก้ข้อมูลบริษัท');
  const v = {
    name: String(c.name || '').trim(),
    address: String(c.address || '').trim(),
    taxId: String(c.taxId || '').replace(/[\s-]/g, ''),
    branch: String(c.branch || '').replace(/\s/g, ''),
    phone: String(c.phone || '').trim()
  };
  if (!v.name) throw new Error('กรุณาใส่ชื่อบริษัท');
  if (v.name.length > 150 || v.address.length > 400 || v.phone.length > 60) throw new Error('ข้อความยาวเกินไป');
  if (v.taxId && !validTaxId_(v.taxId)) throw new Error('เลขประจำตัวผู้เสียภาษีไม่ถูกต้อง (ต้องเป็นตัวเลข 13 หลัก และเลขตรวจสอบหลักสุดท้ายต้องถูก)');
  if (v.branch && !/^\d{5}$/.test(v.branch)) throw new Error('เลขสาขาต้องเป็นตัวเลข 5 หลัก เช่น 00001');
  if (v.branch === '00000') v.branch = '';
  PropertiesService.getScriptProperties().setProperty('COMPANY', JSON.stringify(v));
  return v;
}

/* ===================== สเปกสินค้า (คอลัมน์ M–AA ของชีตคลังสินค้า) ===================== */
const SPEC_COL = 13;   // M
const SPEC_HEAD = ['ชิป LED', 'ความสว่าง', 'มุมกระจายแสง', 'แรงดัน', 'กำลังไฟ', 'กระแสไฟ', 'ขนาด (มม.)', 'กันน้ำ',
  'อายุใช้งาน', 'ต่อพ่วงสูงสุด', 'อุณหภูมิใช้งาน', 'วัสดุตัวเรือน', 'มาตรฐาน', 'อายุการใช้งาน', 'รูปภาพ (ลิงก์)'];
/** ชื่อหัวคอลัมน์เดิมที่ยังรับได้ (ระบบเปลี่ยนเป็นชื่อใหม่ให้เมื่อบันทึกครั้งถัดไป) */
const SPEC_OLD = {13: ['รับประกัน']};
const specHeadMatch_ = (x, i) => String(x).trim() === SPEC_HEAD[i] || (SPEC_OLD[i] || []).indexOf(String(x).trim()) !== -1;
const SPEC_IMG = SPEC_HEAD.length - 1;
/** สเปก LED K9 จากเอกสารผู้ผลิต (ใช้เติมครั้งแรกเมื่อช่องยังว่าง) */
const SPEC_K9 = ['2835 SMD × 3', '180 lm', '175°', 'DC 12V', '1 W', '', '66.8 × 14 × 10.6', 'IP68',
  '60,000 ชม.', '20 ชิ้น/สาย', '−20 ถึง 60 °C', 'ABS สีขาว', 'CE · RoHS · BIS · UL', '7 ปี', ''];

function specHeadOk_(sh) {
  if (sh.getMaxColumns() < SPEC_COL + SPEC_HEAD.length - 1) return false;
  const h = sh.getRange(INV_FIRST - 1, SPEC_COL, 1, SPEC_HEAD.length).getValues()[0];
  return SPEC_HEAD.every((x, i) => specHeadMatch_(h[i], i));
}
/** สร้างหัวคอลัมน์สเปกที่แถว 7 (เพิ่มคอลัมน์ให้ถ้าชีตมีไม่พอ) ไม่เขียนทับถ้าช่องหัวตารางมีข้อมูลอื่นอยู่ */
function ensureSpecCols_(sh) {
  const need = SPEC_COL + SPEC_HEAD.length - 1, max = sh.getMaxColumns();
  if (max < need) sh.insertColumnsAfter(max, need - max);
  const rg = sh.getRange(INV_FIRST - 1, SPEC_COL, 1, SPEC_HEAD.length);
  const h = rg.getValues()[0];
  const clash = h.findIndex((x, i) => x !== '' && !specHeadMatch_(x, i));
  if (clash !== -1) throw new Error('สร้างคอลัมน์สเปกไม่ได้: ช่องหัวตารางแถว ' + (INV_FIRST - 1) + ' คอลัมน์ที่ ' + (SPEC_COL + clash) + ' มีข้อความ "' + h[clash] + '" อยู่แล้ว ย้ายข้อมูลนั้นออกก่อน');
  rg.setValues([SPEC_HEAD]);
  try { sh.getRange(INV_FIRST - 1, 1).copyFormatToRange(sh, SPEC_COL, need, INV_FIRST - 1, INV_FIRST - 1); } catch (e) { /* รูปแบบหัวตารางเป็นแค่ความสวยงาม */ }
}
function readSpecs_() {
  const sh = sh_(SH.inv), out = {head: SPEC_HEAD, img: SPEC_IMG, ready: specHeadOk_(sh), rows: {}};
  if (!out.ready) return out;
  const n = Math.max(sh.getLastRow() - INV_FIRST + 1, 1);
  const codes = sh.getRange(INV_FIRST, 1, n, 1).getValues();
  const v = sh.getRange(INV_FIRST, SPEC_COL, n, SPEC_HEAD.length).getValues();
  codes.forEach((c, i) => {
    if (c[0] === '') return;
    const r = v[i].map(x => String(x == null ? '' : x).trim());
    if (r.some(Boolean)) out.rows[String(c[0])] = r;
  });
  return out;
}
/** อ่านค่า V / W / A จากรายละเอียดสินค้า เช่น "MEAN WELL LRS 12V 600W (50A)" */
function specFromDesc_(code, desc) {
  if (/^K9\b/i.test(code)) return SPEC_K9.slice();
  const d = String(desc || ''), r = SPEC_HEAD.map(() => '');
  const v = /(DC\s*)?(\d+(?:\.\d+)?)\s*V\b/i.exec(d), w = /(\d+(?:\.\d+)?)\s*W\b/i.exec(d), a = /(\d+(?:\.\d+)?)\s*A\b/i.exec(d);
  if (v) r[3] = (v[1] ? 'DC ' : '') + v[2] + 'V';
  if (w) r[4] = w[1] + ' W';
  if (a) r[5] = a[1] + ' A';
  return r;
}
/**
 * สร้างคอลัมน์สเปก (M–AA) แล้วเติมข้อมูลเริ่มต้นให้แถวที่ยังว่าง:
 * K9 ใช้สเปกจากเอกสารผู้ผลิต รุ่นอื่นอ่านแรงดัน/กำลังไฟ/กระแสจากช่องรายละเอียด
 * รันจาก Apps Script หรือกดปุ่มในแท็บ ตัวอย่างสินค้า ก็ได้ รันซ้ำได้ ไม่เขียนทับช่องที่มีข้อมูลแล้ว
 */
function setupSpecs() {
  requireStaff_();
  return withLock_(() => {
    const sh = sh_(SH.inv);
    ensureSpecCols_(sh);
    const n = Math.max(sh.getLastRow() - INV_FIRST + 1, 1);
    const base = sh.getRange(INV_FIRST, 1, n, 3).getValues();
    const rg = sh.getRange(INV_FIRST, SPEC_COL, n, SPEC_HEAD.length), v = rg.getValues();
    let filled = 0;
    base.forEach((b, i) => {
      if (b[0] === '' || v[i].some(x => x !== '')) return;
      const r = specFromDesc_(String(b[0]), b[2]);
      if (r.some(Boolean)) { v[i] = r; filled++; }
    });
    if (filled) rg.setValues(v);
    return {ok: true, filled: filled};
  });
}
/** บันทึกสเปกให้รหัสสินค้าที่เลือก (ใช้ค่าเดียวกันทุกรหัส) */
function saveSpecs(codes, vals) {
  requireStaff_();
  if (!Array.isArray(codes) || !codes.length || codes.length > 200) throw new Error('เลือกรหัสสินค้าอย่างน้อย 1 รายการ');
  if (!Array.isArray(vals) || vals.length !== SPEC_HEAD.length) throw new Error('ข้อมูลสเปกไม่ครบ');
  const v = vals.map(x => String(x == null ? '' : x).trim().slice(0, 300));
  if (v[SPEC_IMG] && !/^https:\/\//i.test(v[SPEC_IMG])) throw new Error('ลิงก์รูปภาพต้องขึ้นต้นด้วย https');
  return withLock_(() => {
    const sh = sh_(SH.inv);
    ensureSpecCols_(sh);
    const col = sh.getRange(INV_FIRST, 1, sh.getLastRow() - INV_FIRST + 1, 1).getValues().map(r => String(r[0]));
    const rowsIdx = codes.map(c => {
      const i = col.indexOf(String(c));
      if (i === -1) throw new Error('ไม่พบรหัสสินค้า ' + c);
      return INV_FIRST + i;
    });
    rowsIdx.forEach(r => sh.getRange(r, SPEC_COL, 1, SPEC_HEAD.length).setValues([v]));
    return {ok: true, n: rowsIdx.length};
  });
}

/* ---------- ยอดยกมา ---------- */
/** แก้ยอดยกมาของสินค้า (คอลัมน์ F ชีตคลังสินค้า) และเก็บประวัติไว้ในโน้ตของเซลล์ */
function setOpening(code, value, reason) {
  requireStaff_();
  return withLock_(() => {
    const v = Number(value);
    if (value === '' || value == null || !isFinite(v) || v < 0) throw new Error('ยอดยกมาต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป');
    const items = readItems_(), mv = readMv_();
    const idx = items.findIndex(i => i[0] === String(code));
    if (idx === -1) throw new Error('ไม่พบรหัสสินค้า ' + code);
    const old = items[idx][5];
    const after = items.map(i => i[0] === String(code) ? i.slice(0, 5).concat([v, i[6]]) : i);
    const b = balances_(after, mv)[String(code)];
    if (b < 0) throw new Error('ทำไม่ได้: ' + code + ' จะเหลือ ' + b + ' (ติดลบ) เพราะจ่ายออกไปแล้วมากกว่านี้');

    const sh = sh_(SH.inv);
    const col = sh.getRange(INV_FIRST, 1, sh.getLastRow() - INV_FIRST + 1, 1).getValues();
    const row = INV_FIRST + col.findIndex(r => String(r[0]) === String(code));
    const cell = sh.getRange(row, 6);
    cell.setValue(v);
    const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
    const line = stamp + ' ' + me_() + ': ' + old + ' → ' + v + (reason ? ' (' + reason + ')' : '');
    cell.setNote((line + '\n' + (cell.getNote() || '')).slice(0, 2000));
    return {ok: true, old: old, value: v, balance: b};
  });
}

function mvFormulas_(r) {
  return [
    '=IFERROR(VLOOKUP(C' + r + ", 'คลังสินค้า'!$A$8:$D, 3, FALSE), \"\")",
    '=IFERROR(VLOOKUP(C' + r + ", 'คลังสินค้า'!$A$8:$D, 4, FALSE), \"\")",
    '=IF(B' + r + '="", "", IF(B' + r + '="จ่ายออก", E' + r + ' * IF(AND(ISNUMBER(G' + r + '), G' + r + '>0), G' + r +
      ", IFERROR(VLOOKUP(C" + r + ", 'คลังสินค้า'!$A$8:$E, 5, FALSE), 0)), 0))"
  ];
}
function ensureMvFormulas_(sh, row) {
  const f = mvFormulas_(row);
  [4, 6, 8].forEach((c, i) => { if (!sh.getRange(row, c).getFormula()) sh.getRange(row, c).setFormula(f[i]); });
}

/* ---------- ใบเบิก (ออเดอร์) ---------- */
const reqNum_ = no => { const m = /^เบิก-(\d+)-/.exec(no || ''); return m ? +m[1] : 0; };
/** เลขล่าสุดที่เคยใช้ เก็บไว้กันเลขซ้ำเมื่อลบใบเบิกที่ยกเลิก */
function lastReqNum_() { return Number(PropertiesService.getScriptProperties().getProperty('LAST_REQ_NO')) || 0; }
function bumpReqNum_(n) { if (n > lastReqNum_()) PropertiesService.getScriptProperties().setProperty('LAST_REQ_NO', String(n)); }
function nextReqNo_(reqs, d) {
  let n = lastReqNum_();
  reqs.forEach(r => { n = Math.max(n, reqNum_(r.no)); });
  const p = x => ('0' + x).slice(-2);
  return 'เบิก-' + ('000' + (n + 1)).slice(-4) + '-' + p(d.getDate()) + p(d.getMonth() + 1) + String(d.getFullYear() + 543).slice(-2);
}
function newId_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 8); }

/**
 * สร้างหรือแก้ไขใบเบิก
 * r = {id?, date:'yyyy-MM-dd', requester, dept, reason, lines:[{code, qty, note}]}
 */
function saveReq(r) { requireStaff_(); return withLock_(() => saveReqCore_(r)); }
function saveReqCore_(r) {
  {
    const items = readItems_(), reqs = readReqs_();
    if (!String(r.requester || '').trim()) throw new Error('กรุณาใส่ชื่อผู้เบิก');
    const date = parseDate_(r.date);
    if (!date) throw new Error('วันที่ไม่ถูกต้อง');
    const merged = {};
    (r.lines || []).forEach(l => {
      const c = String(l.code || ''), q = Number(l.qty);
      if (!c) return;
      if (!items.some(i => i[0] === c)) throw new Error('ไม่พบรหัสสินค้า ' + c);
      if (!Number.isFinite(q) || q <= 0) throw new Error('จำนวนของ ' + c + ' ต้องเป็นตัวเลขที่มากกว่า 0');
      merged[c] = merged[c] ? {code: c, qty: merged[c].qty + q, note: merged[c].note} : {code: c, qty: q, note: l.note || ''};
    });
    const lines = Object.keys(merged).map(k => merged[k]);
    if (!lines.length) throw new Error('ใบเบิกต้องมีสินค้าอย่างน้อย 1 รายการ');

    const rs = sh_(SH.rq), ls = sh_(SH.ln);
    let cur = null, row;
    if (r.id) {
      cur = reqs.find(x => x.id === r.id);
      if (!cur) throw new Error('ไม่พบใบเบิก');
      if (EDITABLE.indexOf(cur.status) === -1) throw new Error('ใบเบิกสถานะ "' + cur.status + '" แก้ไขไม่ได้');
      row = cur.row;
      cur.lines.forEach(l => { ls.getRange(l.row, 1, 1, 5).clearContent(); ls.getRange(l.row, 7).clearContent(); });   // ล้างรายการเดิม (ไม่แตะสูตรคอลัมน์ F)
    } else {
      row = emptyRow_(rs, 2, [1]);
    }
    const id = cur ? cur.id : newId_();
    const no = cur ? cur.no : nextReqNo_(reqs, date);
    bumpReqNum_(reqNum_(no));
    // แก้ไขแล้วต้องอนุมัติใหม่
    rs.getRange(row, 1, 1, 8).setValues([[id, no, date, r.requester, r.dept || '', r.reason || '', 'รออนุมัติ', '']]);
    if (!cur) rs.getRange(row, 11).setValue(me_());

    lines.forEach(l => {
      const lr = emptyRow_(ls, 2, [1]);
      ls.getRange(lr, 1, 1, 5).setValues([[newId_(), id, l.code, l.qty, l.note]]);
      if (!ls.getRange(lr, 6).getFormula()) {
        ls.getRange(lr, 6).setFormula('=IF(B' + lr + '="","",IFERROR(VLOOKUP(B' + lr + ",'ใบเบิกสินค้า'!A:G,7,FALSE),\"\"))");
      }
    });
    return {ok: true, id: id, no: no};
  }
}

/** เปลี่ยนสถานะใบเบิก: action = approve | issue | cancel */
function setReqStatus(id, action) {
  requireStaff_();
  return withLock_(() => {
    const reqs = readReqs_();
    const r = reqs.find(x => x.id === id);
    if (!r) throw new Error('ไม่พบใบเบิก');
    const rs = sh_(SH.rq), who = me_();

    if (action === 'approve') {
      if (['ร่าง', 'รออนุมัติ'].indexOf(r.status) === -1) throw new Error('อนุมัติได้เฉพาะใบเบิกที่รออนุมัติ');
      if (APPROVERS.length && APPROVERS.indexOf(who) === -1) throw new Error('คุณไม่มีสิทธิ์อนุมัติใบเบิก');
      rs.getRange(r.row, 7, 1, 2).setValues([['อนุมัติ', who]]);
      return {ok: true};
    }
    if (action === 'cancel') {
      if (EDITABLE.indexOf(r.status) === -1) throw new Error('ใบเบิกสถานะ "' + r.status + '" ยกเลิกไม่ได้');
      rs.getRange(r.row, 7).setValue('ยกเลิก');
      return {ok: true};
    }
    if (action === 'issue') {
      if (r.status !== 'อนุมัติ') throw new Error('ต้องอนุมัติก่อนจ่ายสินค้า');
      if (needFix_()) throw new Error('STAGING: สูตรจ่ายออกยังไม่ผ่านการตรวจความปลอดภัย ห้ามจ่ายใบเบิกและห้ามรัน fixFormulas; ให้ Admin ตรวจสูตรและประวัติรายการก่อน');
      const items = readItems_(), mv = readMv_();
      // A missing/edited DocumentNo must not bypass deterministic MovementID protection.
      const issueIds = new Set(r.lines.map((l, i) => 'REQ-' + r.id + '-' + (i + 1)));
      if (mv.some(m => m.doc === r.no || issueIds.has(m.id)))
        throw new Error('ใบเบิกนี้จ่ายสินค้าไปแล้ว');
      const out = r.lines.map(l => ({type: 'จ่ายออก', code: l.code, qty: l.qty}));
      const b = balances_(items, mv.concat(out));
      const short = r.lines.filter(l => b[l.code] < 0).map(l => l.code + ' ขาด ' + (-b[l.code]));
      if (short.length) throw new Error('สินค้าไม่พอจ่าย: ' + short.join(', '));
      writeIssue_(r, who);
      rs.getRange(r.row, 7).setValue('จ่ายแล้ว');
      rs.getRange(r.row, 9, 1, 2).setValues([[who, new Date()]]);
      return {ok: true};
    }
    throw new Error('คำสั่งไม่ถูกต้อง');
  });
}

function writeIssue_(r, who) {
  const sh = sh_(SH.mv), now = new Date();
  const price = {}; readItems_().forEach(i => { price[i[0]] = Math.round(i[4] * REQ_PRICE_RATE * 100) / 100; });
  r.lines.forEach((l, i) => {
    const row = emptyRow_(sh, MV_FIRST, [2, 3]);
    ensureMvFormulas_(sh, row);
    sh.getRange(row, 1, 1, 3).setValues([[now, 'จ่ายออก', l.code]]);
    sh.getRange(row, 5).setValue(l.qty);
    sh.getRange(row, 7).setValue(price[l.code] || 0);   // ราคาเบิก = ราคาสินค้า × REQ_PRICE_RATE
    sh.getRange(row, 9, 1, 6).setValues([[who, 'จ่ายตามใบเบิก ' + r.no, 'REQ-' + r.id + '-' + (i + 1), now, who, r.no]]);
  });
}

/**
 * ลบใบเบิกที่ยกเลิกแล้วออกจากชีต (ทั้งหัวใบและรายการสินค้า) ids = รหัสใบเดียวหรือหลายใบ
 * ลบได้เฉพาะสถานะ ยกเลิก เลขใบเบิกที่ลบจะไม่ถูกนำกลับมาใช้ซ้ำ
 */
function deleteReqs(ids) {
  requireStaff_();
  ids = [].concat(ids || []).map(String);
  if (!ids.length) throw new Error('ไม่ได้เลือกใบเบิก');
  return withLock_(() => {
    const reqs = readReqs_(), mv = readMv_();
    const targets = ids.map(id => {
      const r = reqs.find(x => x.id === id);
      if (!r) throw new Error('ไม่พบใบเบิก');
      if (r.status !== 'ยกเลิก') throw new Error('ลบได้เฉพาะใบเบิกที่ยกเลิกแล้ว (' + r.no + ' สถานะ ' + r.status + ')');
      if (mv.some(m => m.doc === r.no)) throw new Error(r.no + ' มีรายการจ่ายสินค้าแล้ว ลบไม่ได้');
      return r;
    });
    const rs = sh_(SH.rq), ls = sh_(SH.ln);
    targets.forEach(r => {
      bumpReqNum_(reqNum_(r.no));
      r.lines.forEach(l => { ls.getRange(l.row, 1, 1, 5).clearContent(); ls.getRange(l.row, 7).clearContent(); });
      rs.getRange(r.row, 1, 1, RQ_COLS).clearContent();
    });
    return {ok: true, deleted: targets.map(r => r.no)};
  });
}

/* ---------- STAGING: destructive legacy formula repair permanently disabled ---------- */
/**
 * Do not use the original fixFormulas on this STAGING copy: it overwrites
 * the reconciled H-column formula and can double-count/lose legacy movements.
 * Historical reconciliation needs a separate reviewed migration and QA.
 */
function fixFormulas() {
  requireAdmin_();
  throw new Error('STAGING: fixFormulas ถูกปิดเพื่อป้องกันการเขียนทับสูตรสต๊อก กรุณาใช้ qaStockFormulaAuditReadOnly เพื่อตรวจสอบเท่านั้น');
}

/* ---------- ใบเสนอราคา (แยกจากใบเบิก ไม่กระทบสต๊อก) ---------- */
function qsh_(name, head) {
  const ss = ss_();
  let s = ss.getSheetByName(name);
  if (!s) { s = ss.insertSheet(name); s.getRange(1, 1, 1, head.length).setValues([head]); }
  return s;
}
function readQuotes_() {
  const ss = ss_(), qs = ss.getSheetByName(QSH.qt), ls = ss.getSheetByName(QSH.ql);
  if (!qs) return [];
  const qv = qs.getLastRow() > 1 ? qs.getRange(2, 1, qs.getLastRow() - 1, QT_HEAD.length).getValues() : [];
  const lv = ls && ls.getLastRow() > 1 ? ls.getRange(2, 1, ls.getLastRow() - 1, QL_HEAD.length).getValues() : [];
  const lines = lv.map((l, i) => ({row: 2 + i, id: String(l[0]), q: String(l[1]), code: String(l[2]), qty: Number(l[3]) || 0, price: Number(l[4]) || 0}))
    .filter(l => l.id !== '' && l.code !== '');
  return qv.map((r, i) => ({
    row: 2 + i, id: String(r[0]), no: String(r[1]), date: r[2],
    customer: {name: String(r[3] || ''), address: String(r[4] || ''), taxId: String(r[5] || ''), branch: String(r[6] || ''), contact: String(r[7] || '')},
    sales: String(r[8] || ''), validDays: r[9] === '' ? 30 : Number(r[9]) || 0, discount: Number(r[10]) || 0, terms: String(r[11] || ''),
    creator: r[12], updated: r[13], status: String(r[14] || ''), reqNo: String(r[15] || ''), confirmedAt: r[16], confirmedBy: String(r[17] || ''),
    lines: lines.filter(l => l.q === String(r[0]))
  })).filter(q => q.id !== '');
}
function quoteOut_(q) {
  return {id: q.id, no: q.no, date: fmtDate_(q.date), customer: q.customer, sales: q.sales, validDays: q.validDays,
    discount: q.discount, terms: q.terms, lines: q.lines.map(l => [l.code, l.qty, l.price]),
    status: q.status, reqNo: q.reqNo, confirmedAt: fmtDate_(q.confirmedAt), confirmedBy: q.confirmedBy};
}
/** ใบเสนอราคาที่ยืนยันแล้วและใบเบิกที่สร้างยังไม่ถูกยกเลิก/ลบ จะแก้ไขหรือลบไม่ได้ */
function quoteLocked_(q, reqs) {
  return !!q.reqNo && reqs.some(r => r.no === q.reqNo && r.status !== 'ยกเลิก');
}
const qtNum_ = no => { const m = /^QT-(\d+)-/.exec(no || ''); return m ? +m[1] : 0; };
function nextQuoteNo_(quotes, d) {
  const P = PropertiesService.getScriptProperties();
  let n = Number(P.getProperty('LAST_QT_NO')) || 0;
  quotes.forEach(q => { n = Math.max(n, qtNum_(q.no)); });
  const p = x => ('0' + x).slice(-2);
  const no = 'QT-' + ('000' + (n + 1)).slice(-4) + '-' + p(d.getDate()) + p(d.getMonth() + 1) + String(d.getFullYear() + 543).slice(-2);
  P.setProperty('LAST_QT_NO', String(n + 1));
  return no;
}
/**
 * สร้าง/แก้ไขใบเสนอราคา
 * q = {id?, date, sales, customer:{name,address,taxId,branch,contact}, validDays, discount, terms, lines:[{code, qty, price}]}
 */
function saveQuote(q) {
  requireStaff_();
  return withLock_(() => {
    const items = readItems_(), quotes = readQuotes_();
    const date = parseDate_(q.date);
    if (!date) throw new Error('วันที่ไม่ถูกต้อง');
    const cu = q.customer || {};
    const c = {name: String(cu.name || '').trim(), address: String(cu.address || '').trim(), taxId: String(cu.taxId || '').replace(/[\s-]/g, ''),
      branch: String(cu.branch || '').trim(), contact: String(cu.contact || '').trim()};
    if (!c.name) throw new Error('กรุณาใส่ชื่อลูกค้า');
    if (c.taxId && !validTaxId_(c.taxId)) throw new Error('เลขผู้เสียภาษีลูกค้าไม่ถูกต้อง (13 หลัก และหลักสุดท้ายต้องถูก)');
    if (c.name.length > 150 || c.address.length > 400) throw new Error('ข้อมูลลูกค้ายาวเกินไป');
    const validDays = q.validDays === '' || q.validDays == null ? 30 : Number(q.validDays);
    if (!(Number.isInteger(validDays) && validDays >= 0 && validDays <= 365)) throw new Error('ยืนราคาต้องเป็นจำนวนวัน 0–365');
    const discount = q.discount === '' || q.discount == null ? 0 : Number(q.discount);
    if (!(isFinite(discount) && discount >= 0)) throw new Error('ส่วนลดต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป');
    const terms = String(q.terms || '').trim();
    if (terms.length > 1000) throw new Error('เงื่อนไขยาวเกินไป');
    const lines = [];
    (q.lines || []).forEach(l => {
      const code = String(l.code || ''), qty = Number(l.qty), price = Number(l.price);
      if (!code) return;
      if (!items.some(i => i[0] === code)) throw new Error('ไม่พบรหัสสินค้า ' + code);
      if (!Number.isFinite(qty) || qty <= 0) throw new Error('จำนวนของ ' + code + ' ต้องเป็นตัวเลขที่มากกว่า 0');
      if (l.price === '' || l.price == null || !(isFinite(price) && price >= 0)) throw new Error('ราคาของ ' + code + ' ต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป');
      lines.push({code: code, qty: qty, price: Math.round(price * 100) / 100});
    });
    if (!lines.length) throw new Error('ใบเสนอราคาต้องมีสินค้าอย่างน้อย 1 รายการ');
    const sub = lines.reduce((s, l) => s + l.qty * l.price, 0);
    if (!Number.isFinite(sub)) throw new Error('ยอดสินค้าสูงเกินขอบเขตตัวเลขที่รองรับ');
    if (discount > sub + 1e-9) throw new Error('ส่วนลดมากกว่ายอดรวม');

    const qs = qsh_(QSH.qt, QT_HEAD), ls = qsh_(QSH.ql, QL_HEAD);
    let cur = null, row;
    if (q.id) {
      cur = quotes.find(x => x.id === q.id);
      if (!cur) throw new Error('ไม่พบใบเสนอราคา');
      if (quoteLocked_(cur, readReqs_())) throw new Error('ใบเสนอราคานี้ลูกค้ายืนยันแล้ว (' + cur.reqNo + ') แก้ไขไม่ได้');
      row = cur.row;
      cur.lines.forEach(l => ls.getRange(l.row, 1, 1, QL_HEAD.length).clearContent());
    } else {
      row = emptyRow_(qs, 2, [1]);
    }
    const id = cur ? cur.id : newId_();
    const no = cur ? cur.no : nextQuoteNo_(quotes, date);
    qs.getRange(row, 1, 1, 14).setValues([[id, no, date, c.name, c.address, c.taxId, c.branch, c.contact,
      String(q.sales || '').trim(), validDays, discount, terms, cur ? cur.creator : me_(), new Date()]]);
    lines.forEach(l => {
      const lr = emptyRow_(ls, 2, [1]);
      ls.getRange(lr, 1, 1, QL_HEAD.length).setValues([[newId_(), id, l.code, l.qty, l.price]]);
    });
    return {ok: true, id: id, no: no};
  });
}
/**
 * ลูกค้ายืนยันใบเสนอราคา → สร้างใบเบิก (สถานะ รออนุมัติ) จากรายการในใบเสนอราคา
 * จากนั้นอนุมัติ → จ่ายสินค้า ในแท็บใบเบิกเพื่อตัดสต๊อกตามปกติ
 */
function confirmQuote(id) {
  requireStaff_();
  return withLock_(() => {
    const q = readQuotes_().find(x => x.id === String(id));
    if (!q) throw new Error('ไม่พบใบเสนอราคา');
    if (quoteLocked_(q, readReqs_())) throw new Error('ใบเสนอราคานี้ยืนยันไปแล้ว (' + q.reqNo + ')');
    if (!q.lines.length) throw new Error('ใบเสนอราคาไม่มีรายการสินค้า');
    const now = new Date();
    const res = saveReqCore_({
      date: Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
      requester: q.sales || me_(), dept: 'ขาย',
      reason: 'ตามใบเสนอราคา ' + q.no + ' (' + q.customer.name + ')',
      lines: q.lines.map(l => ({code: l.code, qty: l.qty, note: q.no}))
    });
    const qs = ss_().getSheetByName(QSH.qt);
    if (qs.getRange(1, 15).getValue() === '') qs.getRange(1, 1, 1, QT_HEAD.length).setValues([QT_HEAD]);
    qs.getRange(q.row, 15, 1, 4).setValues([['ยืนยันแล้ว', res.no, now, me_()]]);
    return {ok: true, quoteNo: q.no, reqNo: res.no, reqId: res.id};
  });
}

/** ลบใบเสนอราคา (เลขที่ที่ลบแล้วจะไม่ถูกนำกลับมาใช้) */
function deleteQuote(id) {
  requireStaff_();
  return withLock_(() => {
    const q = readQuotes_().find(x => x.id === String(id));
    if (!q) throw new Error('ไม่พบใบเสนอราคา');
    if (quoteLocked_(q, readReqs_())) throw new Error('ใบเสนอราคานี้ลูกค้ายืนยันแล้ว (' + q.reqNo + ') ลบไม่ได้');
    const ss = ss_(), qs = ss.getSheetByName(QSH.qt), ls = ss.getSheetByName(QSH.ql);
    q.lines.forEach(l => ls.getRange(l.row, 1, 1, QL_HEAD.length).clearContent());
    qs.getRange(q.row, 1, 1, QT_HEAD.length).clearContent();
    return {ok: true, no: q.no};
  });
}

/** ตรวจการตั้งค่า ผลดูที่ บันทึกการดำเนินการ */
function checkSetup() {
  requireAdmin_(); // รายละเอียดโครงสร้างระบบสำหรับผู้ดูแลเท่านั้น
  const ss = ss_(), out = [];
  Object.keys(SH).forEach(k => out.push((ss.getSheetByName(SH[k]) ? 'OK       ' : 'ไม่พบชีต ') + SH[k]));
  const a7 = sh_(SH.inv).getRange('A7').getValue();
  out.push((a7 === 'รหัส/รุ่นสินค้า' ? 'OK       ' : 'ผิดตำแหน่ง ') + 'หัวตารางคลังสินค้าอยู่ที่ A7 (พบ: ' + a7 + ')');
  const a3 = sh_(SH.mv).getRange('A3').getValue();
  out.push((a3 === 'วันที่' ? 'OK       ' : 'ผิดตำแหน่ง ') + 'หัวตารางบันทึกรับ-จ่ายอยู่ที่ A3 (พบ: ' + a3 + ')');
  out.push((ss.getSheetByName(QSH.qt) ? 'OK       ' : 'ยังไม่มี   ') + 'ชีตใบเสนอราคา (ระบบสร้างให้เองเมื่อบันทึกใบเสนอราคาใบแรก)');
  out.push(needFix_() ? 'ต้องตรวจ   สูตรสต๊อกยังไม่ปลอดภัยสำหรับการจ่ายใบเบิก; ห้ามรัน fixFormulas' : 'OK       รูปแบบสูตรจ่ายออกตรวจผ่าน (ยังต้องตรวจประวัติต่างหาก)');
  const d = getData();
  out.push('อ่านได้: สินค้า ' + d.items.length + ' | รับ-จ่าย ' + d.mv.length + ' | ใบเบิก ' + d.rq.length);
  Logger.log(out.join('\n'));
  return out;
}

/* ===================== ใบเบิกสินค้า: PDF ===================== */
/**
 * รับไฟล์ PDF ที่หน้าเว็บสร้าง (base64) แล้วเก็บใน Google Drive คืนลิงก์สำหรับเปิด/พิมพ์/แชร์
 * หน้าเว็บวาดเอกสารเองเพื่อให้ภาษาไทยแสดงถูกต้อง ไม่ใช้ตัวแปลง HTML→PDF ของ Google
 */
function savePdf(no, vatMode, b64, docType) {
  requireStaff_();
  if (docType === 'stock') {
    if (!/^[\w-]{1,40}$/.test(String(no))) throw new Error('ชื่อไฟล์สรุปสต๊อกไม่ถูกต้อง');
  } else {
    const d = getData();
    if (docType === 'quote' ? !d.qt.some(x => x.no === no) : !d.rq.some(x => x[0] === no)) throw new Error('ไม่พบเอกสารเลขที่ ' + no);
  }
  const docNo = no;
  const bytes = Utilities.base64Decode(String(b64 || ''));
  if (bytes.length < 100 || bytes.length > 8 * 1024 * 1024 || String.fromCharCode.apply(null, bytes.slice(0, 5)) !== '%PDF-') throw new Error('ไฟล์ PDF ไม่ถูกต้องหรือขนาดใหญ่เกิน 8MB');
  const suffix = {none: 'ไม่รวมVAT', add: 'บวกVAT', incl: 'รวมVAT'}[vatMode] || '';
  const name = docType === 'stock' ? 'สรุปสต๊อก_' + docNo + '.pdf' : (docType === 'quote' ? 'ใบเสนอราคา_' : '') + docNo + (suffix ? '_' + suffix : '') + '.pdf';
  const it = DriveApp.getFoldersByName(PDF_FOLDER);
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder(PDF_FOLDER);
  // Create first; do not trash existing documents before the replacement is safely stored.
  // Preserve older PDFs as document history to support recovery and auditing.
  const file = folder.createFile(Utilities.newBlob(bytes, 'application/pdf', name));
  file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.VIEW);
  let shared = false;
  if (PDF_SHARE_ANYONE) {
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); shared = true; } catch (e) {}
  }
  return {name: name, url: file.getUrl(), shared: shared,
    download: 'https://drive.google.com/uc?export=download&id=' + file.getId()};
}

// ==REQDOC START== (ส่วนนี้มีสำเนาเดียวกันใน Index.html ห้ามเรียก Apps Script API ในส่วนนี้)
function thaiBahtText_(amount) {
  const D = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
  const P = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];
  function group(s, prefix) {
    let out = '', any = prefix;
    for (let i = 0; i < s.length; i++) {
      const d = +s[i], pos = s.length - 1 - i;
      if (d === 0) continue;
      if (pos === 1 && d === 1) out += 'สิบ';
      else if (pos === 1 && d === 2) out += 'ยี่สิบ';
      else if (pos === 0 && d === 1 && any) out += 'เอ็ด';
      else out += D[d] + P[pos];
      any = true;
    }
    return out;
  }
  function read(s) {
    s = s.replace(/^0+/, '');
    if (!s) return '';
    if (s.length <= 6) return group(s, false);
    return read(s.slice(0, s.length - 6)) + 'ล้าน' + group(s.slice(-6), true);
  }
  const cents = Math.round(Math.abs(Number(amount) || 0) * 100);
  const baht = Math.floor(cents / 100), satang = cents % 100;
  let txt = baht ? read(String(baht)) + 'บาท' : '';
  if (satang) txt += read(String(satang)) + 'สตางค์';
  else txt = (txt || 'ศูนย์บาท') + 'ถ้วน';
  return txt;
}

/** เลขใบเสนอราคา: ใช้เลขเดียวกับใบเบิก เปลี่ยนคำนำหน้าเป็น QT เช่น เบิก-0002-151069 → QT-0002-151069 */
function quoteNo_(no) { return String(no || '').replace(/^เบิก/, 'QT'); }

/**
 * คำนวณตัวเลขในเอกสาร
 * req.lines = [[code, qty, price?], ...]  price = ราคาเสนอ (ว่าง = ใช้ราคาในคลังสินค้า)
 * req.discount = ส่วนลดท้ายบิล (บาท)  vatMode = none | add | incl
 */
function reqCalc_(req, items, vatMode, vatRate) {
  vatRate = vatRate == null ? 0.07 : vatRate;
  const r2 = n => Math.round(n * 100) / 100;
  const map = {}; items.forEach(i => { map[i[0]] = i; });
  const pct = Math.round(vatRate * 100) + '%';
  let sum = 0;
  const rows = req.lines.map((l, i) => {
    const it = map[l[0]] || [l[0], '', '(ไม่พบในคลังสินค้า)', '', 0];
    const price = l[2] === null || l[2] === undefined || l[2] === '' ? Number(it[4]) || 0 : Number(l[2]);
    const amt = r2(price * l[1]); sum += amt;
    return {no: i + 1, code: l[0], desc: it[2], unit: it[3], qty: l[1], price: price, amt: amt};
  });
  sum = r2(sum);
  const disc = r2(Math.min(Math.max(Number(req.discount) || 0, 0), sum));
  const base = r2(sum - disc);
  const head = disc ? [['รวมเป็นเงิน', sum], ['หักส่วนลด', -disc], ['ยอดหลังหักส่วนลด', base]] : [];
  let totals, grand;
  if (vatMode === 'add') {
    const vat = r2(base * vatRate); grand = r2(base + vat);
    totals = (disc ? head : [['รวมเป็นเงิน', sum]]).concat([['ภาษีมูลค่าเพิ่ม ' + pct, vat], ['จำนวนเงินรวมทั้งสิ้น', grand]]);
  } else if (vatMode === 'incl') {
    const before = r2(base / (1 + vatRate)); grand = base;
    totals = head.concat([['มูลค่าสินค้าก่อนภาษี', before], ['ภาษีมูลค่าเพิ่ม ' + pct, r2(base - before)], ['จำนวนเงินรวมทั้งสิ้น (รวม VAT)', grand]]);
  } else {
    grand = base; totals = head.concat([['จำนวนเงินรวมทั้งสิ้น', grand]]);
  }
  const note = vatMode === 'add' ? 'ราคาสินค้ายังไม่รวม VAT บวกภาษีมูลค่าเพิ่ม ' + pct
    : vatMode === 'incl' ? 'ราคาสินค้ารวมภาษีมูลค่าเพิ่ม ' + pct + ' แล้ว' : 'ไม่ออกภาษีมูลค่าเพิ่ม';
  return {rows: rows, sum: sum, discount: disc, totals: totals, grand: grand, note: note, text: thaiBahtText_(grand)};
}
// ==REQDOC END==
