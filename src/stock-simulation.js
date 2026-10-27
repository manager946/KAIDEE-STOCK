'use strict';
// Pure simulation only: NEVER writes to Google Sheets.
function validateQuantity(q) {
  if (!Number.isFinite(q) || q <= 0 || Math.round(q * 1000) !== q * 1000)
    throw new Error('Quantity must be positive with at most 3 decimals');
  return q;
}
function runMovement(state, action) {
  const s = { onHand: state.onHand, reserved: state.reserved, applied: [...state.applied] };
  const { type, key, quantity } = action;
  if (!key || typeof key !== 'string') throw new Error('Missing fulfillment key');
  const id = type + ':' + key;
  if (s.applied.includes(id)) return s; // repeat has no stock effect
  validateQuantity(quantity);
  if (type === 'RESERVE') {
    if (s.onHand - s.reserved < quantity) throw new Error('Insufficient available stock');
    s.reserved += quantity;
  } else if (type === 'POST') {
    if (s.reserved >= quantity) s.reserved -= quantity;
    else if (s.onHand - s.reserved < quantity) throw new Error('Insufficient available stock');
    if (s.onHand < quantity) throw new Error('Insufficient stock');
    s.onHand -= quantity;
  } else if (type === 'REVERSE') {
    if (!s.applied.includes('POST:' + key)) throw new Error('Original posting not found');
    s.onHand += quantity;
  } else {
    throw new Error('Unknown movement');
  }
  s.applied.push(id);
  return s;
}
module.exports = { runMovement, validateQuantity };
