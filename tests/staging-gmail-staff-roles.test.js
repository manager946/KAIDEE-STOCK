'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const src = fs.readFileSync('apps-script/Code.gs','utf8');
function env(email,property){
  const x={
    Session:{getActiveUser:()=>({getEmail:()=>email})},
    PropertiesService:{getScriptProperties:()=>({getProperty:()=>property})},
  };
  vm.createContext(x);
  vm.runInContext(src,x);
  return x;
}
test('specified Gmail is Staff but not Admin',()=>{
  const x=env('  worker.qa@gmail.com  ','worker.qa@gmail.com');
  assert.equal(x.role_(),'staff');
  assert.equal(x.isAdmin_(),false);
  assert.throws(()=>x.requireAdmin_(),/เฉพาะผู้ดูแลระบบ/);
});
test('unlisted Gmail is Public',()=>{
  const x=env('other.qa@gmail.com','worker.qa@gmail.com');
  assert.equal(x.role_(),'public');
  assert.throws(()=>x.requireStaff_(),/พนักงานหลังบ้าน/);
});
test('blank identity must not gain staff permission',()=>{
  const x=env('','worker.qa@gmail.com');
  assert.equal(x.role_(),'public');
});
test('malformed property and domain-wide Gmail not accepted',()=>{
  const x=env('other.qa@gmail.com','@gmail.com');
  assert.equal(x.role_(),'public');
});
test('explicit admin remains admin despite worker gmail property',()=>{
  const x=env('manager@metangprint.org','worker.qa@gmail.com');
  assert.equal(x.role_(),'admin');
});
