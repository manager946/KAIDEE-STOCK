#!/usr/bin/env node
/**
 * PREPARE ONLY. This program never accesses Google and never calls clasp push.
 * Usage: node scripts/prepare-staging.mjs <EXISTING_STAGING_SCRIPT_ID>
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const EXPECTED_SCRIPT_ID='1FkShpFVzV_xDURPN-7HLPk6ASdmLJo3trjXB5Xd6LAILHfxYU6BOeyWa';
const scriptId=process.argv[2]||'';
if(scriptId!==EXPECTED_SCRIPT_ID){
  console.error('BLOCKED: ต้องใช้เฉพาะ Script ID ของโปรเจกต์ KAIDEE-STOCK-STAGING-TEST-20261027 ที่สร้างไว้แล้ว');
  process.exit(2);
}
const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sourceDir=path.join(repoRoot,'apps-script');
const out=path.join(repoRoot,'build','staging-upload');
const names=['Code.gs','SalesStaging.gs','StagingDiagnostics.gs','Index.html'];
const guards={
  'Code.gs':['const ss_ = () => stagingDb_()','KAIDEE-STOCK STAGING PDF','const PDF_SHARE_ANYONE = false'],
  'SalesStaging.gs':['KAIDEE_STAGING_SPREADSHEET_ID','function stagingCreateOrder','function stagingRecoverOperation'],
  'StagingDiagnostics.gs':['function stagingPreflight'],
  'Index.html':['function stagingSaleView','function stagingSalesAction']
};
for(const name of names){
  const p=path.join(sourceDir,name);
  if(!fs.existsSync(p))throw Error('ไฟล์ไม่ครบ: '+p);
  const txt=fs.readFileSync(p,'utf8');
  for(const word of guards[name])if(!txt.includes(word))throw Error('BLOCKED: source file does not match STAGING build: '+name+' / '+word);
}
fs.mkdirSync(out,{recursive:true});
const mapFile=path.join(out,'.clasp.json');
if(fs.existsSync(mapFile)){
  let prior;
  try{prior=JSON.parse(fs.readFileSync(mapFile,'utf8'))}catch(_){throw Error('มี .clasp.json ที่อ่านไม่ได้: ลบ build/staging-upload ด้วยตัวเองแล้วเริ่มใหม่')}
  if(prior.scriptId!==EXPECTED_SCRIPT_ID)throw Error('BLOCKED: ไฟล์ .clasp.json ที่มีอยู่ชี้ไปยัง Script ID อื่น');
}
for(const name of names)fs.copyFileSync(path.join(sourceDir,name),path.join(out,name));
const manifest={timeZone:'Asia/Bangkok',dependencies:{},exceptionLogging:'STACKDRIVER',runtimeVersion:'V8'};
fs.writeFileSync(path.join(out,'appsscript.json'),JSON.stringify(manifest,null,2)+'\n','utf8');
fs.writeFileSync(mapFile,JSON.stringify({scriptId:EXPECTED_SCRIPT_ID,rootDir:"."},null,2)+'\n','utf8');
const generated=fs.readdirSync(out).sort();
const expected=['.clasp.json','Code.gs','Index.html','SalesStaging.gs','StagingDiagnostics.gs','appsscript.json'].sort();
if(JSON.stringify(generated)!==JSON.stringify(expected)) {
  throw Error('BLOCKED: output contains unexpected files. Clear build/staging-upload and rerun.');
}
console.log('READY TO REVIEW — not uploaded.');
console.log('Staging project: KAIDEE-STOCK-STAGING-TEST-20261027');
console.log('Script ID: '+EXPECTED_SCRIPT_ID);
console.log('Source files: '+names.join(', '));
console.log('Output: '+out);
console.log('NEXT (after your own Google authorization and remote backup):');
console.log('  cd build/staging-upload');
console.log('  clasp show-file-status');
console.log('  clasp push');
console.log('  clasp pull (only in a SEPARATE verification folder; NEVER in this prepared upload folder)');
console.log('NEVER run clasp deploy; DO NOT push from any other project.');
