/**
 * Read-only diagnostics for a test-only Google Apps Script project.
 * Depends on Code.gs and SalesStaging.gs from the same PR.
 * Does NOT write spreadsheet cells, PDF files, or script properties.
 */
function stagingPreflight() {
  requireAdmin_();
  const ss=stagingDb_(); // fails closed if staging property/name is wrong
  const expectations=[
    {title:'คลังสินค้า',headerRow:7,minColumns:10,cols:{0:'รหัส/รุ่นสินค้า',5:'ยอดยกมา',8:'คงเหลือ'}},
    {title:'บันทึกรับ-จ่าย',headerRow:3,minColumns:16,cols:{0:'วันที่',1:'ประเภทรายการ',10:'MovementID',13:'DocumentNo'}},
    {title:'ใบเบิกสินค้า',headerRow:1,minColumns:12,cols:{0:'ReqID'}},
    {title:'รายการใบเบิก',headerRow:1,minColumns:6,cols:{0:'LineID',1:'ReqID'}},
    {title:'ผู้ใช้งาน',headerRow:1,minColumns:4,cols:{0:'อีเมล',2:'บทบาท'}},
    {title:'ออร์เดอร์และใบขาย',headerRow:1,minColumns:23,cols:{0:'OrderID',8:'เลขใบขาย',22:'เอกสาร PDF'}},
    {title:'รายการขาย',headerRow:1,minColumns:9,cols:{0:'SaleLineID',1:'OrderID'}},
  ];
  const checks=expectations.map(e=>{
    const sheet=ss.getSheetByName(e.title);
    if(!sheet) return {tab:e.title,pass:false,problem:'ไม่พบแท็บ'};
    if(sheet.getMaxColumns()<e.minColumns)
      return {tab:e.title,pass:false,problem:'จำนวนคอลัมน์ไม่ครบ'};
    const headers=sheet.getRange(e.headerRow,1,1,e.minColumns).getDisplayValues()[0];
    const wrong=Object.keys(e.cols)
      .filter(k=>String(headers[Number(k)]||'').trim()!==e.cols[k])
      .map(k=>({column:Number(k)+1,expected:e.cols[k]}));
    return {tab:e.title,pass:wrong.length===0,problem:wrong.length?'หัวตารางไม่ตรง':'',mismatch:wrong};
  });
  const pdfSafe=PDF_SHARE_ANYONE===false && PDF_FOLDER==='KAIDEE-STOCK STAGING PDF';
  const props=PropertiesService.getScriptProperties();
  const hasProperty=!!props.getProperty(KDS.setting);
  const ok=checks.every(c=>c.pass) && pdfSafe && hasProperty;
  return {
    status:ok?'READY_FOR_LIVE_STAGING_TEST':'BLOCKED',
    spreadsheetTitle:ss.getName(),
    userRole:role_(),targetPropertyConfigured:hasProperty,
    pdfPrivateByDefault:PDF_SHARE_ANYONE===false,
    pdfStagingFolderIsolated:PDF_FOLDER==='KAIDEE-STOCK STAGING PDF',
    checks,
    generatedAt:Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyy-MM-dd HH:mm:ss'),
    note:'READ ONLY. Does not confirm stock posting, reversal, permissions or deployment.'
  };
}
