/**
 * KAIDEE Stock staging-only sales integration, V0.2.
 * SAFE BY DEFAULT: refuses all spreadsheets whose name does not start with
 * "KAIDEE-STOCK STAGING". Never deploy as production without independent review.
 *
 * Script Property required: KAIDEE_STAGING_SPREADSHEET_ID = ID of an authorized COPY.
 * Requires existing Code.gs helpers: requireStaff_, me_, withLock_, mvFormulas_.
 * No production spreadsheet references are hard-coded.
 *
 * Public entry points: stagingCreateOrder, stagingListOrders, stagingConvertOrder,
 * stagingShipOrder, stagingReverseOrder, stagingRecoverOperation.
 */
const KDS = {
  titlePrefix: 'KAIDEE-STOCK STAGING',
  setting: 'KAIDEE_STAGING_SPREADSHEET_ID',
  order: 'ออร์เดอร์และใบขาย', line: 'รายการขาย',
  mv: 'บันทึกรับ-จ่าย', inv: 'คลังสินค้า',
  ops: 'KAIDEE_OperationJournal',
  orderCols: 23, lineCols: 9, journalCols: 8
};
const KDS_OPS = ['OperationKey','Action','OrderID','Status','PayloadJSON','UpdatedAt','Actor','Error'];

function stagingDb_() {
  const id = PropertiesService.getScriptProperties().getProperty(KDS.setting);
  if (!id || !/^[\w-]{20,}$/.test(id)) throw new Error('ยังไม่ได้ตั้งค่า staging spreadsheet ID');
  const s = SpreadsheetApp.openById(id);
  if (String(s.getName()).indexOf(KDS.titlePrefix) !== 0)
    throw new Error('ปฏิเสธการเขียน: ไฟล์เป้าหมายไม่ใช่ KAIDEE-STOCK STAGING');
  return s;
}
function stagingSheet_(s, name) {
  const sh = s.getSheetByName(name);
  if (!sh) throw new Error('ไม่พบแท็บ: ' + name);
  return sh;
}
function stagingRows_(sh, start, count) {
  const n = sh.getLastRow() - start + 1;
  return n <= 0 ? [] : sh.getRange(start, 1, n, count).getValues();
}
function stagingFind_(sh, start, cols, index, id) {
  const a = stagingRows_(sh, start, cols);
  const found = a.findIndex(r => String(r[index]) === String(id));
  return found < 0 ? null : {row:start+found, values:a[found]};
}
function stagingFreeRow_(sh, start) {
  const n = sh.getMaxRows() - start + 1;
  const cells = n > 0 ? sh.getRange(start, 1, n, 1).getValues() : [];
  let i = cells.findIndex(r => r[0] === '');
  if (i >= 0) return start+i;
  sh.insertRowAfter(sh.getMaxRows());
  return sh.getMaxRows();
}
function stagingRequireId_(x) {
  const v = String(x || '').trim();
  if (!/^[A-Za-z0-9:_-]{8,90}$/.test(v)) throw new Error('รหัสคำขอไม่ถูกต้อง');
  return v;
}
function stagingPositive_(n, name, allowZero) {
  const v = Number(n);
  if (n == null || n === '' || !Number.isFinite(v) || v < 0 || (!allowZero && v <= 0) || v > 1000000)
    throw new Error('จำนวนของ ' + name + ' ไม่ถูกต้อง');
  return v;
}
function stagingNum2_(n, name) {
  const v = stagingPositive_(n, name, true);
  return Math.round(v * 100)/100;
}
function stagingJournal_(ss) {
  let sh = ss.getSheetByName(KDS.ops);
  if (!sh) {
    sh = ss.insertSheet(KDS.ops);
    sh.getRange(1, 1, 1, KDS_OPS.length).setValues([KDS_OPS]);
    sh.setFrozenRows(1);
  }
  return sh;
}
function stagingOp_(ss, key, kind, id, payload) {
  const sh = stagingJournal_(ss);
  let found = stagingFind_(sh, 2, KDS.journalCols, 0, key);
  const json = JSON.stringify(payload);
  if (found) {
    const v = found.values;
    if (v[1] !== kind || String(v[2]) !== String(id) || String(v[4]) !== json)
      throw new Error('OperationKey ถูกใช้กับข้อมูลอื่นแล้ว');
    return {sh, row:found.row, done:v[3] === 'DONE', status:v[3]};
  }
  const row = stagingFreeRow_(sh, 2);
  sh.getRange(row, 1, 1, KDS.journalCols).setValues(
    [[key,kind,id,'PENDING',json,new Date(),me_(),'']]);
  return {sh,row,done:false,status:'PENDING'};
}
function stagingOpStatus_(op, status, error) {
  op.sh.getRange(op.row,4).setValue(status);
  op.sh.getRange(op.row,6).setValue(new Date());
  op.sh.getRange(op.row,8).setValue(String(error || '').slice(0,300));
}
function stagingInventory_(ss) {
  const sh = stagingSheet_(ss, KDS.inv), rows = stagingRows_(sh,8,10), out={};
  rows.forEach(r => {
    if (!r[0]) return;
    const code=String(r[0]);
    if (out[code]) throw new Error('รหัสสินค้าซ้ำ: '+code);
    out[code]={code,description:String(r[2]||''),unit:String(r[3]||''),price:Number(r[4])||0,opening:Number(r[5])||0};
  });
  return out;
}
function stagingAllMovements_(ss) {
  const sh = stagingSheet_(ss,KDS.mv);
  return stagingRows_(sh,4,16).map((r,i)=>({
    row:4+i,type:String(r[1]||''),code:String(r[2]||''),qty:Number(r[4])||0,
    price:Number(r[6])||0,id:String(r[10]||''),doc:String(r[13]||'')
  }));
}
function stagingBalance_(inventory,moves) {
  const bal={};
  Object.keys(inventory).forEach(k=>bal[k]=inventory[k].opening);
  moves.forEach(m=>{
    if (!Object.prototype.hasOwnProperty.call(bal,m.code)) return;
    if (m.type==='รับเข้า') bal[m.code]+=m.qty;
    else if (m.type==='จ่ายออก') bal[m.code]-=m.qty;
  });
  return bal;
}
function stagingOrder_(ss, id) {
  return stagingFind_(stagingSheet_(ss,KDS.order),2,KDS.orderCols,0,id);
}
function stagingLines_(ss,id) {
  return stagingRows_(stagingSheet_(ss,KDS.line),2,KDS.lineCols)
    .filter(r=>String(r[1])===String(id) && String(r[0])!=='')
    .map(r=>({id:String(r[0]),code:String(r[2]),description:String(r[3]),
      unit:String(r[4]),qty:Number(r[5]),price:Number(r[6]),total:Number(r[7])}));
}
/** Require a customer-provided stable clientMutationId for safe create retries. */
function stagingCreateOrder(p) {
  requireStaff_();
  return withLock_(() => {
    const ss=stagingDb_(), inv=stagingInventory_(ss);
    p=p||{};
    const mutation=stagingRequireId_(p.clientMutationId);
    const entries=Array.isArray(p.lines)?p.lines:[];
    if (!entries.length || entries.length>30) throw new Error('ออร์เดอร์ต้องมีสินค้า 1-30 รายการ');
    const customer=String(p.customer||'').trim().slice(0,120);
    if (!customer) throw new Error('กรุณาระบุลูกค้า');
    const clean=entries.map(e=>{
      const code=String(e.code||'');
      if (!inv[code]) throw new Error('ไม่พบสินค้า '+code);
      const qty=stagingPositive_(e.qty,code,false);
      if (!Number.isInteger(qty)) throw new Error('จำนวนต้องเป็นจำนวนเต็ม');
      const price=stagingNum2_(e.price, 'ราคาต่อหน่วย');
      return {code,qty,price,description:inv[code].description,unit:inv[code].unit};
    });
    const discount=stagingNum2_(p.discount||0,'ส่วนลด');
    const shipping=stagingNum2_(p.shipping||0,'ค่าจัดส่ง');
    const subtotal=Math.round(clean.reduce((s,l)=>s+l.qty*l.price,0)*100)/100;
    if (discount>subtotal) throw new Error('ส่วนลดมากกว่ายอดสินค้า');
    const total=Math.round((subtotal-discount+shipping)*100)/100;
    const key='CREATE:'+mutation, sh=stagingSheet_(ss,KDS.order);
    // ID derives from client key: retries after a crash always use the same ID.
    const orderId='KS-'+mutation;
    const id=orderId.slice(0,90);
    const today=Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyy-MM-dd');
    const no='OR-'+mutation; // deterministic across midnight / retries
    const date=new Date(today+'T12:00:00');
    const payload={id,no,customer,discount,shipping,subtotal,total,
      contact:String(p.contact||'').slice(0,80),address:String(p.address||'').slice(0,300),
      note:String(p.note||'').slice(0,300),lines:clean};
    const op=stagingOp_(ss,key,'CREATE',id,payload);
    if (op.done) {
      const hDone=stagingOrder_(ss,id), lsDone=stagingLines_(ss,id);
      if (hDone && String(hDone.values[7])==='ใบออร์เดอร์' &&
          String(hDone.values[9])==='ร่าง' && String(hDone.values[10])==='รอจัดส่ง' &&
          String(hDone.values[11])==='ยังไม่ชำระ' &&
          Number(hDone.values[14])===subtotal && Number(hDone.values[15])===total &&
          lsDone.length===clean.length) return {ok:true,orderId:id,no,reused:true};
    }
    try {
      const h=stagingOrder_(ss,id);
      if (h && (String(h.values[1])!==no || String(h.values[3])!==customer))
        throw new Error('พบออร์เดอร์ที่รหัสตรงกันแต่รายละเอียดไม่ตรงกัน');
      // The previous failed write may have persisted A:G before Sheets rejected H.
      // Replay MUST complete the same row, never create a new one or mark DONE early.
      const expectedRow=[
        id,no,date,customer,payload.contact,payload.address,'','ใบออร์เดอร์','',
        'ร่าง','รอจัดส่ง','ยังไม่ชำระ',discount,shipping,subtotal,total,0,total,
        me_(),'','',payload.note,''
      ];
      if (!h) {
        const row=stagingFreeRow_(sh,2);
        sh.getRange(row,1,1,KDS.orderCols).setValues([expectedRow]);
      } else {
        const strictCols=[0,1,3,7,9,10,11,12,13,14,15,16,17,21];
        strictCols.forEach(i=>{
          const v=h.values[i];
          if(v!=='' && v!=null && String(v)!==String(expectedRow[i]))
            throw new Error('ข้อมูลออร์เดอร์เดิมไม่ตรงกับคำขอที่คอลัมน์ '+(i+1)+'; ห้ามบันทึกซ้ำ');
        });
        const restored=expectedRow.map((value,i)=>{
          const current=h.values[i];
          return current===''||current==null?value:current;
        });
        // All 23 columns now use actual validated dropdown values.
        sh.getRange(h.row,1,1,KDS.orderCols).setValues([restored]);
      }
      const ls=stagingSheet_(ss,KDS.line);
      clean.forEach((l,i)=>{
        const lineId=id+'-L'+String(i+1).padStart(2,'0');
        const existing=stagingFind_(ls,2,KDS.lineCols,0,lineId);
        if (existing) {
          const v=existing.values;
          if (String(v[1])!==id || String(v[2])!==l.code || Number(v[5])!==l.qty || Number(v[6])!==l.price || Number(v[7])!==Math.round(l.qty*l.price*100)/100)
            throw new Error('รายการขายเดิมไม่ตรงกับออร์เดอร์');
        } else {
          const row=stagingFreeRow_(ls,2);
          ls.getRange(row,1,1,KDS.lineCols).setValues([[
            lineId,id,l.code,l.description,l.unit,l.qty,l.price,
            Math.round(l.qty*l.price*100)/100,''
          ]]);
        }
      });
      const verified=stagingOrder_(ss,id), verifiedLines=stagingLines_(ss,id);
      if(!verified || verified.values[7]!=='ใบออร์เดอร์' ||
         verified.values[9]!=='ร่าง' || verified.values[10]!=='รอจัดส่ง' ||
         verified.values[11]!=='ยังไม่ชำระ' ||
         Number(verified.values[14])!==subtotal || Number(verified.values[15])!==total ||
         verifiedLines.length!==clean.length)
        throw new Error('ออร์เดอร์บันทึกไม่ครบ; ห้ามกำหนด DONE');
      stagingOpStatus_(op,'DONE','');
      return {ok:true,orderId:id,no,reused:op.done};
    } catch(e) {
      stagingOpStatus_(op,'ERROR',e.message);
      throw e;
    }
  });
}
function stagingListOrders() {
  requireStaff_();
  const ss=stagingDb_();
  return stagingRows_(stagingSheet_(ss,KDS.order),2,KDS.orderCols)
    .filter(r=>String(r[0])!=='').slice(-100).reverse().map(r=>({
      id:String(r[0]),no:String(r[1]),customer:String(r[3]),docType:String(r[7]),
      saleNo:String(r[8]),docStatus:String(r[9]),delivery:String(r[10]),
      total:Number(r[15])||0
    }));
}
function stagingConvertOrder(id) {
  requireStaff_();
  return withLock_(()=>{
    const ss=stagingDb_(),h=stagingOrder_(ss,id);
    if(!h) throw new Error('ไม่พบออร์เดอร์');
    const v=h.values;
    if (String(v[9])==='ยกเลิก') throw new Error('ออร์เดอร์ถูกยกเลิก');
    const lines=stagingLines_(ss,id);
    if(!lines.length) throw new Error('ยังไม่มีรายการขาย');
    const saleNo=String(v[8]||('SO-'+String(id)));
    const sh=stagingSheet_(ss,KDS.order);
    sh.getRange(h.row,8,1,3).setValues([['ใบขายสินค้า',saleNo,'ยืนยัน']]);
    return {ok:true,id,saleNo};
  });
}
/** An incomplete row has a permanent MovementID and an inert 'เตรียม...' status. */
function stagingEnsureMovement_(ss,m,kind) {
  const sh=stagingSheet_(ss,KDS.mv);
  const all=stagingAllMovements_(ss);
  const old=all.filter(x=>x.id===m.id);
  if (old.length>1) throw new Error('MovementID ซ้ำ: '+m.id);
  if (old.length) {
    const v=old[0];
    if (v.code!==m.code || v.qty!==m.qty || v.doc!==m.doc ||
        ![kind==='SALE'?'เตรียมจ่าย':'เตรียมรับคืน',kind==='SALE'?'จ่ายออก':'รับเข้า'].includes(v.type))
      throw new Error('MovementID เดิมไม่ตรงข้อมูลที่ต้องบันทึก: '+m.id);
    return v.row;
  }
  const row=stagingFreeRow_(sh,4);
  const f=mvFormulas_(row),type=kind==='SALE'?'เตรียมจ่าย':'เตรียมรับคืน';
  const who=me_(),now=new Date();
  sh.getRange(row,1,1,16).setValues([[
    now,type,m.code,f[0],m.qty,f[1],m.price,f[2],
    who,(kind==='SALE'?'ส่งมอบ':'รับคืน')+' ตามใบขาย '+m.doc,m.id,now,who,m.doc,'',''
  ]]);
  return row;
}
function stagingShipCore_(ss,id,kind,reason) {
  const h=stagingOrder_(ss,id);
  if(!h) throw new Error('ไม่พบออร์เดอร์');
  const order=h.values;
  const saleNo=String(order[8]||'');
  if(String(order[7])!=='ใบขายสินค้า' || !saleNo)
    throw new Error('ต้องแปลงออร์เดอร์เป็นใบขายก่อน');
  const isReversal=kind==='REVERSE';
  if (!isReversal && String(order[9])==='ยกเลิก') throw new Error('ใบขายถูกยกเลิก');
  if (isReversal && String(order[9])==='ยกเลิก') {
    const done=stagingFind_(stagingJournal_(ss),2,KDS.journalCols,0,'REVERSE:'+id);
    if (done && done.values[3]==='DONE') return {ok:true,id,saleNo,reused:true};
  }
  const lines=stagingLines_(ss,id);
  if(!lines.length) throw new Error('ไม่มีรายการขาย');
  const inv=stagingInventory_(ss);
  const movements=stagingAllMovements_(ss);
  const plans=lines.map(l=>({
    id:(isReversal?'SALE-REV-':'SALE-')+l.id,code:l.code,qty:l.qty,price:l.price,doc:saleNo
  }));
  plans.forEach(x=>{
    if(!inv[x.code]||!Number.isFinite(x.qty)||x.qty<=0)
      throw new Error('รายการขายไม่ถูกต้อง: '+x.code);
  });
  const existingById={};
  movements.forEach(m=>{if(m.id)existingById[m.id]=(existingById[m.id]||[]).concat(m)});
  // Reject legacy posting under the same document: no guesswork/double issue.
  const validIds=new Set(plans.map(x=>x.id));
  if (new Set(plans.map(x=>x.id)).size !== plans.length) throw new Error('SaleLineID ซ้ำในออร์เดอร์');
  if(!isReversal && movements.some(m=>m.doc===saleNo && m.type==='จ่ายออก' && !validIds.has(m.id)))
    throw new Error('พบรายการจ่ายเดิมในเลขใบขายเดียวกัน ต้องตรวจด้วยคนก่อน');
  if (isReversal) {
    plans.forEach((x,i)=>{
      const from=existingById['SALE-'+lines[i].id]||[];
      if(from.length!==1||from[0].type!=='จ่ายออก')
        throw new Error('ยังไม่พบการส่งมอบครบทุกบรรทัด');
    });
  }
  const required={};
  plans.forEach(x=>{
    const found=existingById[x.id]||[];
    if(found.length>1) throw new Error('MovementID ซ้ำ');
    const done=found.length===1 && found[0].type===(isReversal?'รับเข้า':'จ่ายออก');
    if(!done&&!isReversal) required[x.code]=(required[x.code]||0)+x.qty;
  });
  const bal=stagingBalance_(inv,movements);
  Object.keys(required).forEach(code=>{
    if((bal[code]||0)<required[code])
      throw new Error('สต๊อกไม่พอ: '+code+' ขาด '+(required[code]-bal[code]));
  });
  const key=(isReversal?'REVERSE:':'SHIP:')+id;
  const previous=stagingFind_(stagingJournal_(ss),2,KDS.journalCols,0,key);
  const previousPayload=previous?JSON.parse(String(previous.values[4]||'{}')):null;
  const op=stagingOp_(ss,key,kind,id,{saleNo,lines:plans,reason:previousPayload?String(previousPayload.reason||''):String(reason||'').slice(0,250)});
  if(op.done) return {ok:true,id,saleNo,reused:true};
  try {
    // Phase 1: prepare all movements; no stock change in formulas yet.
    const rowNumbers=plans.map(m=>stagingEnsureMovement_(ss,m,kind));
    // Phase 2: post exactly once per deterministic MovementID.
    const sh=stagingSheet_(ss,KDS.mv);
    rowNumbers.forEach(row=>{
      const cell=sh.getRange(row,2);
      const expected=isReversal?'รับเข้า':'จ่ายออก';
      if (cell.getValue()!==expected) cell.setValue(expected);
    });
    const ord=stagingSheet_(ss,KDS.order);
    if(isReversal) {
      // Column K has strict validation: only รอจัดส่ง / ส่งมอบแล้ว.
      // Keep historical delivery status; journal records the reversal reason.
      ord.getRange(h.row,10).setValue('ยกเลิก');
      ord.getRange(h.row,11).setNote('คืนสินค้าแล้ว (STAGING); ดู OperationJournal และ MovementID SALE-REV- เพื่อยืนยัน');
    } else {
      ord.getRange(h.row,11).setValue('ส่งมอบแล้ว');
      ord.getRange(h.row,20,1,2).setValues([[me_(),new Date()]]);
    }
    stagingOpStatus_(op,'DONE','');
    return {ok:true,id,saleNo,reused:false,lines:plans.length};
  } catch(e) {
    stagingOpStatus_(op,'ERROR',e.message);
    throw e;
  }
}
function stagingShipOrder(id) {
  requireStaff_();
  return withLock_(()=>stagingShipCore_(stagingDb_(),String(id),'SALE',''));
}
function stagingReverseOrder(id,reason) {
  requireStaff_();
  if(!String(reason||'').trim()) throw new Error('กรุณาระบุเหตุผลคืนสินค้า');
  return withLock_(()=>stagingShipCore_(stagingDb_(),String(id),'REVERSE',reason));
}
function stagingRecoverOperation(key) {
  requireStaff_();
  return withLock_(()=>{
    const ss=stagingDb_(),op=stagingFind_(stagingJournal_(ss),2,KDS.journalCols,0,key);
    if(!op) throw new Error('ไม่พบ OperationKey');
    const action=String(op.values[1]),id=String(op.values[2]);
    if(action==='SALE'||action==='REVERSE')
      return stagingShipCore_(ss,id,action,(JSON.parse(String(op.values[4]||'{}')).reason)||'');
    // Creation replay needs original order request; caller should retry the exact input.
    throw new Error('สำหรับ CREATE ให้ส่งข้อมูลคำขอเดิมพร้อม clientMutationId เดิมอีกครั้ง');
  });
}
