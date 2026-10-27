'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
test('prepare-staging refuses missing or incorrect script ID and never uploads',()=>{
  for(const id of ['', 'PRODUCTION_OR_UNKNOWN']){
    const args=['scripts/prepare-staging.mjs',...(id?[id]:[])];
    const r=cp.spawnSync('node',args,{cwd:root,encoding:'utf8'});
    assert.equal(r.status,2);
    assert.match(r.stderr,/BLOCKED/);
  }
});
test('prepare-staging uses the one known existing staging project',()=>{
  const s=fs.readFileSync(path.join(root,'scripts/prepare-staging.mjs'),'utf8');
  assert.match(s,/1FkShpFVzV_xDURPN-7HLPk6ASdmLJo3trjXB5Xd6LAILHfxYU6BOeyWa/);
  assert.doesNotMatch(s,/\bexecSync\(|\bexecFileSync\(['"]clasp|\bspawnSync\(['"]clasp/);
});
