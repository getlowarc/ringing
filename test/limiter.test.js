// The master safety limit: stacked loud voices don't clip. Below the knee (-1 dB
// below full scale) every sample is untouched bit for bit; above it the output
// bends toward 1.0 and never reaches it.
// Run: node test/limiter.test.js

import assert from 'node:assert/strict';
import { Ringing, LIMITER_KNEE } from '../src/ringing.js';
import { dbToGain } from '../src/gain.js';
import { suite, test } from './test.js';

suite('limiter');

const RATE = 48000;

/** One sample through the mixer: a looping one-value sound at `volume` (hard left), the left output. */
function through(value, { voices = 1, volume = 1, mono = true } = {}) {
  const audio = new Ringing({ sampleRate: RATE });
  const sound = audio.addSound({ channels: mono ? [new Float32Array(8).fill(value)] : [new Float32Array(8).fill(value), new Float32Array(8).fill(value)], sampleRate: RATE });
  for (let i = 0; i < voices; i++) audio.play(sound, { loop: true, pan: -1, volume });
  const l = new Float32Array(1), r = new Float32Array(1);
  audio.render(l, r, 1);
  return l[0];
}

test('the knee is -1 dB below full scale', () => {
  assert.equal(LIMITER_KNEE, dbToGain(-1));
  assert.ok(Math.abs(LIMITER_KNEE - 0.8912509381337456) < 1e-15);
});

test('below the knee every sample passes bit for bit, both signs', () => {
  let seed = 99;
  const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 2000; i++) {
    const x = Math.fround((random() * 2 - 1) * LIMITER_KNEE);
    assert.equal(through(x), x, `${x}`);
  }
  assert.equal(through(Math.fround(LIMITER_KNEE)), Math.fround(LIMITER_KNEE), 'right at the knee');
});

test('above the knee the output is bent: past the knee, never over 1.0, and rising with the input', () => {
  // In the exact formula the output approaches 1.0 and never reaches it. The output is a
  // Float32, though, which has 24 bits to spend near 1.0, so from about 10^5 up the result
  // rounds to exactly 1.0: never over it, which is the promise.
  let previous = LIMITER_KNEE;
  for (const x of [0.9, 0.95, 1, 1.5, 2, 5, 20, 1000, 10000]) {
    const y = through(Math.fround(x));
    assert.ok(y > previous && y < 1, `${x} -> ${y} should be above ${previous} and under 1`);
    previous = y;
  }
  for (const x of [1e5, 1e6, 1e12, 1e30]) {
    const y = through(Math.fround(x));
    assert.ok(y >= previous && y <= 1, `${x} -> ${y}`);
    previous = y;
  }
});

test('it is smooth where it starts: no corner at the knee, the slope is the straight line\'s', () => {
  const step = 1e-4;
  const slope = (through(Math.fround(LIMITER_KNEE + 2 * step)) - through(Math.fround(LIMITER_KNEE + step))) / step;
  assert.ok(Math.abs(slope - 1) < 0.01, `slope just above the knee is ${slope}`);
  const y = through(Math.fround(LIMITER_KNEE + step));
  // It leaves the line only to second order: (1 - knee) u^2 with u = step / (1 - knee), about 9e-8
  // here, plus the Float32 output's own rounding (6e-8 near 1).
  const off = y - (LIMITER_KNEE + step);
  assert.ok(Math.abs(off) < 3e-7, `it has moved ${off} from the line`);
});

test('negative samples are bent the same way as positive ones', () => {
  for (const x of [0.95, 1.5, 10, 1e9]) assert.equal(through(-x), -through(x), `${x}`);
});

test('an infinite sum gives 1.0 and not a NaN, and a huge one gives 1.0 or just under', () => {
  assert.equal(through(1, { volume: 1e39 }), 1);                  // overflows the Float32 output to Infinity
  assert.ok(through(1, { volume: 1e30 }) <= 1);
  assert.ok(!Number.isNaN(through(1, { volume: 1e39 })));
});

test('many voices stacked past full scale come out under 1.0, not clipped to it', () => {
  for (const voices of [3, 10, 100, 1000]) {
    const y = through(0.5, { voices });
    assert.ok(y <= 1 && y > LIMITER_KNEE, `${voices} voices -> ${y}`);
  }
  // Ten explosions at once: strictly under full scale, so a speaker or a file never sees a flat top.
  assert.ok(through(0.9, { voices: 10 }) < 1);
});

test('stereo channels are limited separately', () => {
  const audio = new Ringing({ sampleRate: RATE });
  const sound = audio.addSound({ channels: [new Float32Array(8).fill(3), new Float32Array(8).fill(0.25)], sampleRate: RATE });
  audio.play(sound, { loop: true });
  const l = new Float32Array(1), r = new Float32Array(1);
  audio.render(l, r, 1);
  assert.ok(l[0] > LIMITER_KNEE && l[0] < 1);
  assert.equal(r[0], 0.25, 'the quiet side is untouched');
});

test('silence is silence: with nothing playing the limit is never applied', () => {
  const audio = new Ringing({ sampleRate: RATE });
  const l = new Float32Array(4).fill(7), r = new Float32Array(4).fill(7);
  audio.render(l, r, 4);
  assert.ok(l.every((x) => x === 0) && r.every((x) => x === 0));
});
