// Real-time safe: after construction, render() allocates nothing, with voices
// playing and with voices ending. A garbage collection pause on the audio thread
// is an audible click, so it is counted, not hoped for. Needs --expose-gc (npm
// test passes it).
// Run: node --expose-gc test/realtime.test.js

import assert from 'node:assert/strict';
import { Ringing } from '../src/ringing.js';
import { Voices } from '../src/voices.js';
import { suite, test } from './test.js';

suite('realtime');

const RATE = 48000;
const flat = (n, v = 0.01) => new Float32Array(n).fill(v);

test('rendering silence allocates nothing', () => {
  assert.equal(typeof globalThis.gc, 'function', 'run with node --expose-gc');
  const audio = new Ringing({ sampleRate: RATE });
  const l = new Float32Array(128), r = new Float32Array(128);
  for (let i = 0; i < 50000; i++) audio.render(l, r, 128);   // warm up the JIT
  gc();
  const before = process.memoryUsage().heapUsed;
  for (let i = 0; i < 2000000; i++) audio.render(l, r, 128);
  const grown = process.memoryUsage().heapUsed - before;
  // 2,000,000 blocks is 83 minutes of audio. One allocation of even 16 bytes a
  // block would be 32 MB; a few hundred KB is the test runner's own noise.
  assert.ok(grown < 512 * 1024, `heap grew by ${grown} bytes over 2,000,000 blocks`);
});

test('rendering 500 looping voices, mono and stereo, allocates nothing', () => {
  const audio = new Ringing({ sampleRate: RATE });
  const mono = audio.addSound({ channels: [flat(4800)], sampleRate: RATE });
  const stereo = audio.addSound({ channels: [flat(4800), flat(4800)], sampleRate: 44100 });
  for (let i = 0; i < 500; i++) audio.play(i % 2 ? mono : stereo, { loop: true, pitch: 0.5 + (i % 7) / 4, pan: (i % 11) / 5 - 1 });
  const l = new Float32Array(128), r = new Float32Array(128);
  for (let i = 0; i < 2000; i++) audio.render(l, r, 128);
  gc();
  const before = process.memoryUsage().heapUsed;
  for (let i = 0; i < 20000; i++) audio.render(l, r, 128);
  const grown = process.memoryUsage().heapUsed - before;
  assert.ok(grown < 512 * 1024, `heap grew by ${grown} bytes over 20,000 blocks of 500 voices`);
});

test('voices ending inside render (their slots freed, their events written) allocate nothing once warm', () => {
  // V8 runs new code unoptimised at first, and unoptimised code boxes every double it computes
  // into a heap object: the first such render allocates 779 KB. By round 150 it is optimised and
  // allocates exactly 0. "After warm-up" is the honest claim, and what is measured here.
  const audio = new Ringing({ sampleRate: RATE });
  const short = audio.addSound({ channels: [flat(8)], sampleRate: RATE });
  const l = new Float32Array(128), r = new Float32Array(128);
  const WARM = 250;
  let grown = 0;
  for (let round = 0; round < 400; round++) {
    for (let i = 0; i < 1000; i++) audio.play(short);     // allocates handles: not what is measured
    gc();
    const before = process.memoryUsage().heapUsed;
    audio.render(l, r, 128);                              // all 1000 end in this one block
    if (round >= WARM) grown += process.memoryUsage().heapUsed - before;
    assert.equal(audio.events().length, 1000);
  }
  assert.ok(grown < 512 * 1024, `heap grew by ${grown} bytes over 150 renders that ended 1000 voices each`);
});

test('off means off: with no voices the mixer is never entered', () => {
  let entered = 0;
  const mix = Voices.prototype.mix;
  Voices.prototype.mix = function (...args) { entered++; return mix.apply(this, args); };
  try {
    const audio = new Ringing({ sampleRate: RATE });
    const l = new Float32Array(128).fill(1), r = new Float32Array(128).fill(1);
    audio.render(l, r, 128);
    assert.equal(entered, 0, 'rendered silence by entering the mixer');
    assert.ok(l.every((v) => v === 0) && r.every((v) => v === 0));
    const sound = audio.addSound({ channels: [flat(64)], sampleRate: RATE });
    audio.render(l, r, 128);
    assert.equal(entered, 0, 'a sound with no voice entered the mixer');
    const voice = audio.play(sound, { loop: true });
    audio.render(l, r, 128);
    assert.equal(entered, 1);
    voice.stop();                         // it fades out over one ramp, so the mixer runs until that is done
    for (let i = 0; i < 4; i++) audio.render(l, r, 128);
    const afterFade = entered;
    audio.render(l, r, 128);
    audio.render(l, r, 128);
    assert.equal(entered, afterFade, 'a stopped voice left the mixer running after its fade');
  } finally {
    Voices.prototype.mix = mix;
  }
});
