// Ids and slots: reuse, generations, retirement, and shrinking without letting
// an old id come back to life. Voices end on their own all the time, so a stale
// id reaching a new voice is the bug this guards against.
// Run: node test/ids.test.js

import assert from 'node:assert/strict';
import { Slots, SLOT_SPAN, MAX_GENERATION, MAX_ID } from '../src/core/slots.js';
import { suite, test } from './test.js';

suite('ids');

/** A Slots with room for `n`, the way a column owner grows it. */
function slotsOf(n) {
  const slots = new Slots();
  slots.resize(n);
  return slots;
}

test('an id is its generation times 2^24 plus its slot, and stays an exact number', () => {
  assert.equal(SLOT_SPAN, 2 ** 24);
  assert.equal(MAX_ID, Number.MAX_SAFE_INTEGER);
  assert.equal(MAX_ID & 0xffffff, SLOT_SPAN - 1);
  assert.equal((MAX_ID - (MAX_ID & 0xffffff)) / SLOT_SPAN, MAX_GENERATION);
  const slots = slotsOf(4);
  const s = slots.take();
  assert.equal(s, 0);
  assert.equal(slots.id(s), 1 * SLOT_SPAN + 0);
  assert.equal(slots.slotOf(slots.id(s)), s);
});

test('a freed slot is reused under the next generation, and the old id stops matching', () => {
  const slots = slotsOf(4);
  const a = slots.take(), b = slots.take();
  const old = slots.id(a);
  slots.release(a);
  assert.equal(slots.slotOf(old), -1);
  const c = slots.take();
  assert.equal(c, a);
  assert.equal(slots.id(c), old + SLOT_SPAN);
  assert.equal(slots.slotOf(old), -1);
  assert.equal(slots.slotOf(slots.id(c)), c);
  assert.equal(slots.slotOf(slots.id(b)), b);
});

test('a slot whose generation runs out is retired and never handed out again', () => {
  const slots = slotsOf(4);
  const s = slots.take();
  slots.take();
  slots.generations[s] = MAX_GENERATION;
  const last = slots.id(s);
  assert.equal(last, MAX_ID - (SLOT_SPAN - 1) + s);
  slots.release(s);
  assert.equal(slots.slotOf(last), -1);
  for (let i = 0; i < 2; i++) assert.notEqual(slots.take(), s);
  assert.equal(slots.count, 3);
  assert.equal(slots.top, 4);
});

test('entries for slots above top are stale, and are skipped rather than handed out twice', () => {
  const slots = slotsOf(8);
  const [a, b, c] = [slots.take(), slots.take(), slots.take()];
  slots.release(b);
  slots.release(c);   // top falls past both, leaving two stale entries
  const d = slots.take(), e = slots.take();
  assert.deepEqual([a, d, e].sort(), [0, 1, 2]);
});

test('after storage shrinks and regrows, no old id matches a new thing', () => {
  const slots = slotsOf(128);
  const taken = [];
  for (let i = 0; i < 100; i++) taken.push(slots.take());
  // Churn slot 80 so its generation climbs, keeping an id from each life.
  const old = [];
  for (let i = 0; i < 5; i++) {
    old.push(slots.id(80));
    slots.release(80);
    assert.equal(slots.take(), 80);
  }
  old.push(slots.id(80));
  for (let s = 99; s >= 1; s--) slots.release(s);   // keep slot 0, free the rest
  slots.resize(1);
  // Regrow past slot 80 and churn it again. Without the floor, slot 80 would
  // start over at generation 1 and reach the old ids' generations.
  slots.resize(128);
  for (let i = 0; i < 99; i++) slots.take();
  for (let i = 0; i < 10; i++) {
    for (const id of old) assert.equal(slots.slotOf(id), -1);
    slots.release(80);
    slots.take();
  }
});

test('random churn keeps every live id and slot distinct, and every dead id dead', () => {
  const slots = new Slots();
  const live = [], dead = [];
  let seed = 7;
  const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let round = 0; round < 20000; round++) {
    if (live.length === 0 || random() < 0.55) {
      let s = slots.take();
      if (s < 0) { slots.resize(Math.max(8, slots.capacity * 2)); s = slots.take(); }
      live.push([s, slots.id(s)]);
    } else {
      const [[s, id]] = live.splice(Math.floor(random() * live.length), 1);
      slots.release(s);
      dead.push(id);
    }
  }
  assert.equal(slots.count, live.length);
  assert.equal(new Set(live.map(([, id]) => id)).size, live.length);
  assert.equal(new Set(live.map(([s]) => s)).size, live.length);
  for (const [, id] of live) assert.ok(slots.slotOf(id) >= 0);
  for (const id of dead) assert.equal(slots.slotOf(id), -1);
});
