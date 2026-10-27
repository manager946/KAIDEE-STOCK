'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {runMovement} = require('../src/stock-simulation');
test('reserve leaves physical inventory unchanged', () => {
  const s=runMovement({onHand:10,reserved:0,applied:[]},{type:'RESERVE',key:'a',quantity:3});
  assert.equal(s.onHand,10);assert.equal(s.reserved,3);
});
test('posting a second time has no extra inventory effect', () => {
  let s={onHand:10,reserved:0,applied:[]};
  s=runMovement(s,{type:'POST',key:'order-1',quantity:4});
  s=runMovement(s,{type:'POST',key:'order-1',quantity:4});
  assert.equal(s.onHand,6);
});
test('reversal cannot happen twice', () => {
  let s={onHand:10,reserved:0,applied:[]};
  s=runMovement(s,{type:'POST',key:'x',quantity:2});
  s=runMovement(s,{type:'REVERSE',key:'x',quantity:2});
  s=runMovement(s,{type:'REVERSE',key:'x',quantity:2});
  assert.equal(s.onHand,10);
});
test('reject posting beyond available inventory', () => {
  assert.throws(()=>runMovement({onHand:2,reserved:0,applied:[]},{type:'POST',key:'b',quantity:3}));
});
