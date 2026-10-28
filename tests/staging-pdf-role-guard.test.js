'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const code=fs.readFileSync('apps-script/Code.gs','utf8');
test('staging admin role has fixed explicit allowlist and no active-user fallback',()=>{
 assert.match(code,/const ADMINS = \['manager@metangprint\.org'\]/);
 const admins=code.slice(code.indexOf('function admins_()'),code.indexOf('function isAdmin_()'));
 assert.doesNotMatch(admins,/getEffectiveUser/);
 assert.match(admins,/ADMINS\.map/);
 assert.match(code,/function savePdf\(/);
 assert.match(code,/requireStaff_\(\)/);
 assert.match(code,/const PDF_SHARE_ANYONE = false/);
});
