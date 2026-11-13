// The table behind sounds and voices: grows by doubling, shrinks by the 1/4 rule,
// keeps every live thing's data across both, and never hands one slot out twice.
// Run: node test/store.test.js

import assert from 'node:assert/strict';
import { Store, MIN_CAPACITY } from '../src/core/store.js';
import { suite, test } from './test.js';

suite('store');

const make = () => new Store({ n: Float64Array }, ['thing']);

test('it starts empty and grows by doubling from the smallest table', () => {
  const store = make();
  assert.equal(store.capacity, 0);
  const seen = new Set();
  for (let i = 0; i < MIN_CAPACITY; i++) seen.add(store.add());
  assert.equal(store.capacity, MIN_CAPACITY);
  store.add();
  assert.equal(store.capacity, MIN_CAPACITY * 2);
  assert.equal(seen.size, MIN_CAPACITY);
});

test('growing keeps every live thing\'s numbers and objects', () => {
  const store = make();
  const slots = [];
  for (let i = 0; i < 100; i++) {
    const s = store.add();
    store.n[s] = i * 1.5;
    store.thing[s] = { i };
    slots.push(s);
  }
  slots.forEach((s, i) => { assert.equal(store.n[s], i * 1.5); assert.equal(store.thing[s].i, i); });
  assert.equal(store.capacity, 128);
});

test('shrinking happens only when the slots in use reach a quarter of the capacity, and keeps the rest', () => {
  const store = make();
  const slots = Array.from({ length: 100 }, () => store.add());
  slots.forEach((s) => { store.n[s] = s + 0.5; });
  for (let i = 99; i >= 33; i--) store.release(slots[i]);      // top falls to 33: more than a quarter of 128
  assert.equal(store.fit(), false);
  assert.equal(store.capacity, 128);
  for (let i = 32; i >= 8; i--) store.release(slots[i]);       // top falls to 8: under a quarter
  assert.equal(store.fit(), true);
  assert.equal(store.capacity, MIN_CAPACITY, 'the smallest table that holds them, never below the minimum');
  for (let i = 0; i < 8; i++) assert.equal(store.n[slots[i]], slots[i] + 0.5, 'survivors intact');
});

test('growing again after a shrink never hands out a slot twice, or revives an old id', () => {
  const store = make();
  const a = Array.from({ length: 64 }, () => store.add());
  const oldIds = a.map((s) => store.slots.id(s));
  for (const s of a) store.release(s);
  store.fit();
  const again = Array.from({ length: 64 }, () => store.add());
  assert.equal(new Set(again).size, 64);
  for (const id of oldIds) assert.equal(store.slots.slotOf(id), -1, 'an id from before the shrink matches nothing');
});

test('a freed slot clears its objects, so nothing is kept alive by a dead thing', () => {
  const store = make();
  const s = store.add();
  store.thing[s] = { big: new Array(1000) };
  store.release(s);
  assert.equal(store.thing[s], null);
});
