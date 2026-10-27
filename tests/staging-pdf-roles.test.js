'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
for(const [email,role] of [['owner@metangprint.org','admin'],['qa@metangprint.org','staff'],['','public']])test('PDF server role gate and private sharing: '+role,()=>{
 const sharing=[];
 const file={setSharing:(...a)=>sharing.push(a),getUrl:()=> 'mock:private-pdf',getId:()=> 'mock-file'};
 const folder={createFile:()=>file};
 const x={Session:{getActiveUser:()=>({getEmail:()=>email}),getEffectiveUser:()=>({getEmail:()=> 'owner@metangprint.org'})},DriveApp:{Access:{PRIVATE:'PRIVATE',ANYONE_WITH_LINK:'ANYONE'},Permission:{VIEW:'VIEW'},getFoldersByName:()=>({hasNext:()=>true,next:()=>folder})},Utilities:{base64Decode:()=>Array.from(Buffer.from('%PDF-'+ 'x'.repeat(100))),newBlob:()=>({})}};
 vm.createContext(x);vm.runInContext(fs.readFileSync('apps-script/Code.gs','utf8'),x);
 assert.equal(x.role_(),role);
 if(role==='public'){assert.throws(()=>x.savePdf('QA-stock','none','mock','stock'),/พนักงาน/);assert.equal(sharing.length,0);}
 else {assert.equal(x.savePdf('QA-stock','none','mock','stock').shared,false);assert.deepEqual(sharing,[['PRIVATE','VIEW']]);}
});
