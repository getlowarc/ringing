// dbToGain and gainToDb: the standard conversions, on the exact exp and log.
// Run: node test/gain.test.js

import assert from 'node:assert/strict';
import { dbToGain, gainToDb } from '../src/ringing.js';
import { suite, test, thrown } from './test.js';

suite('gain');

test('0 dB is a gain of 1 exactly, and silence is -Infinity dB', () => {
  assert.equal(dbToGain(0), 1);
  assert.equal(gainToDb(1), 0);
  assert.equal(dbToGain(-Infinity), 0);
  assert.equal(gainToDb(0), -Infinity);
});

test('the well-known points: -6 dB is about half, +20 dB is ten times, -20 dB a tenth', () => {
  assert.ok(Math.abs(dbToGain(-6.020599913279624) - 0.5) < 1e-15);
  assert.ok(Math.abs(dbToGain(20) - 10) < 1e-13);
  assert.ok(Math.abs(dbToGain(-20) - 0.1) < 1e-16);
  assert.ok(Math.abs(gainToDb(0.5) + 6.020599913279624) < 1e-14);
  assert.ok(Math.abs(gainToDb(10) - 20) < 1e-14);
});

test('they undo each other', () => {
  for (let db = -90; db <= 30; db += 0.37) assert.ok(Math.abs(gainToDb(dbToGain(db)) - db) < 1e-12, `${db}`);
});

test('bad input throws, naming the call', () => {
  assert.equal(thrown(() => dbToGain('loud')), "dbToGain: db must be a number, got 'loud'");
  assert.equal(thrown(() => dbToGain(NaN)), 'dbToGain: db must be a number, got NaN');
  assert.equal(thrown(() => gainToDb(-1)), 'gainToDb: gain must be a number from 0, got -1');
  assert.equal(thrown(() => gainToDb(NaN)), 'gainToDb: gain must be a number from 0, got NaN');
});
