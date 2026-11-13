// The public core: construction, the clock, render and destroy.
// Run: node test/ringing.test.js

import assert from 'node:assert/strict';
import { Ringing, MIN_SAMPLE_RATE, MAX_SAMPLE_RATE } from '../src/ringing.js';
import { suite, test } from './test.js';

suite('ringing');

test('an instance knows its rate, and its clock starts at zero', () => {
  const audio = new Ringing({ sampleRate: 48000 });
  assert.equal(audio.sampleRate, 48000);
  assert.equal(audio.frames, 0);
  assert.equal(audio.time, 0);
});

test('the limits are the documented ones, and both ends are accepted', () => {
  assert.equal(MIN_SAMPLE_RATE, 8000);
  assert.equal(MAX_SAMPLE_RATE, 384000);
  assert.equal(new Ringing({ sampleRate: 8000 }).sampleRate, 8000);
  assert.equal(new Ringing({ sampleRate: 384000 }).sampleRate, 384000);
  assert.throws(() => new Ringing({ sampleRate: 7999 }));
  assert.throws(() => new Ringing({ sampleRate: 384001 }));
});

test('render advances the clock by exactly the frames asked for', () => {
  const audio = new Ringing({ sampleRate: 48000 });
  const l = new Float32Array(128), r = new Float32Array(128);
  audio.render(l, r, 128);
  assert.equal(audio.frames, 128);
  assert.equal(audio.time, 128 / 48000);
  audio.render(l, r, 0);
  assert.equal(audio.frames, 128);
  for (let i = 0; i < 374; i++) audio.render(l, r, 128);
  assert.equal(audio.frames, 375 * 128);
  assert.equal(audio.time, 1);          // 48,000 frames at 48,000 Hz is one second, exactly
});

test('render fills the block with silence, leaves the rest alone, and chains', () => {
  const audio = new Ringing({ sampleRate: 48000 });
  const l = new Float32Array(8).fill(0.5), r = new Float32Array(8).fill(-0.5);
  assert.equal(audio.render(l, r, 4), audio);
  assert.deepEqual([...l], [0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5]);
  assert.deepEqual([...r], [0, 0, 0, 0, -0.5, -0.5, -0.5, -0.5]);
});

test('two instances do not affect each other', () => {
  const a = new Ringing({ sampleRate: 48000 }), b = new Ringing({ sampleRate: 44100 });
  a.render(new Float32Array(10), new Float32Array(10), 10);
  assert.equal(a.frames, 10);
  assert.equal(b.frames, 0);
  assert.equal(b.sampleRate, 44100);
});

test('after destroy the plain data still reads, and the calls throw', () => {
  const audio = new Ringing({ sampleRate: 48000 });
  audio.render(new Float32Array(5), new Float32Array(5), 5);
  audio.destroy();
  assert.equal(audio.frames, 5);
  assert.equal(audio.sampleRate, 48000);
  assert.throws(() => audio.render(new Float32Array(5), new Float32Array(5), 5), /render: this Ringing was destroyed/);
});
