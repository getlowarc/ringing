// A table of things (sounds, voices): typed-array columns indexed by slot, kept
// the same length as the slots, grown by doubling and shrunk by the 1/4
// rule. Growing and shrinking happen in add() and fit(), never in render(), so
// render allocates nothing.
//
// WHY THE 1/4 RULE, NOT A TIMER. When the slots in use reach only a quarter of
// the capacity, shrink to the power of two growth would have picked for them.
// That is amortised O(1) with no thrash: after a shrink the table is at most
// half full, so it takes as many adds again to grow as it took removes to shrink.

import { Slots, resized } from './slots.js';

/** The smallest table worth growing from: 16 slots, so a handful of voices never regrows. */
export const MIN_CAPACITY = 16;

export class Store {
  /**
   * @param {Record<string, Function>} columns name -> typed array constructor
   * @param {string[]} objects names of plain arrays, one entry per slot, for things
   *   that aren't numbers (a sound's sample data); entries are null when free
   */
  constructor(columns, objects = []) {
    this.slots = new Slots();
    this.columnNames = Object.keys(columns);
    this.objectNames = objects;
    for (const name of this.columnNames) this[name] = new columns[name](0);
    for (const name of objects) this[name] = [];
  }

  get capacity() { return this.slots.capacity; }
  get count() { return this.slots.count; }

  /** A free slot, growing the columns first if there is none. */
  add() {
    let s = this.slots.take();
    if (s < 0) {
      this.#resize(Math.max(MIN_CAPACITY, this.slots.capacity * 2));
      s = this.slots.take();
    }
    return s;
  }

  /** Frees a slot. Its columns keep stale numbers; add()'s caller writes every column. */
  release(s) {
    this.slots.release(s);
    // An indexed loop, not for-of: release() runs inside render when a voice ends, and for-of on an
    // array makes an iterator object in code V8 hasn't optimised yet.
    const names = this.objectNames;
    for (let i = 0; i < names.length; i++) this[names[i]][s] = null;
  }

  /** Shrinks when the slots in use reach only a quarter of the capacity. Not for use inside render. */
  fit() {
    const { top, capacity } = this.slots;
    if (capacity <= MIN_CAPACITY || top * 4 > capacity) return false;
    let next = MIN_CAPACITY;
    while (next < top) next *= 2;
    this.#resize(next);
    return true;
  }

  #resize(capacity) {
    this.slots.resize(capacity);
    for (const name of this.columnNames) this[name] = resized(this[name], capacity);
    for (const name of this.objectNames) {
      const old = this[name].length;
      this[name].length = capacity;
      for (let i = old; i < capacity; i++) this[name][i] = null;
    }
  }
}
