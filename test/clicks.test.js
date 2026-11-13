// No clicks. A click is a sudden jump in the waveform. These tests render a slow
// sine (20 Hz, the bottom of hearing, where the waveform itself moves least per
// frame) through every kind of change and check that no step between two
// neighbouring samples is bigger than a bounded multiple of the sine's own
// steepest step. A gain jump on a half-scale sine would be a step of 0.5, about
// 380 times the sine's own 0.0013; a click-free ramp stays within 2 times.
// Run: node test/clicks.test.js

import assert from 'node:assert/strict';
import { Ringing, RAMP_TIME } from '../src/ringing.js';
import { sin } from '../src/core/math.js';
import { suite, test } from './test.js';

suite('clicks');

const RATE = 48000;
const RAMP = Math.round(RAMP_TIME * RATE);
const AMPLITUDE = 0.5;
const HZ = 20;
const PERIOD = RATE / HZ;                                   // 2,400 frames: the sine loops with no seam
// The steepest step a sine of this amplitude and frequency makes between two frames.
const NATURAL = AMPLITUDE * 2 * Math.PI * HZ / RATE;
/** The allowed step: a ramp adds at most amplitude / RAMP to it, which is the same size again. */
const BOUND = 2 * NATURAL * 1.001;

const sine = () => Float32Array.from({ length: PERIOD }, (_, i) => AMPLITUDE * sin(2 * Math.PI * i / PERIOD));

/** A looping 20 Hz sine, hard left so the left channel is the voice at its gain. */
function rig(options = {}) {
  const audio = new Ringing({ sampleRate: RATE });
  const sound = audio.addSound({ channels: [sine()], sampleRate: RATE });
  const voice = audio.play(sound, { loop: true, pan: -1, ...options });
  return { audio, voice, sound };
}

/** Renders `n` frames and returns the left channel. */
function run(audio, n) {
  const l = new Float32Array(n), r = new Float32Array(n);
  audio.render(l, r, n);
  return l;
}

/** The biggest step between neighbouring samples across `blocks` of output joined end to end. */
function biggestStep(...blocks) {
  let big = 0, previous = blocks[0][0];
  for (const b of blocks) for (const x of b) { big = Math.max(big, Math.abs(x - previous)); previous = x; }
  return big;
}

test('the ramp lasts 1 / (2 pi 20) seconds: as steep as the lowest note the ear hears', () => {
  assert.ok(Math.abs(RAMP_TIME - 0.00795774715459477) < 1e-15);
  assert.equal(RAMP, 382);
  // A change of 1.0 over RAMP frames moves 1/RAMP a frame, and a full-scale 20 Hz sine's steepest
  // step is 2 pi 20 / 48000: the two agree to a frame's rounding.
  assert.ok(Math.abs(1 / RAMP - 2 * Math.PI * HZ / RATE) / (1 / RAMP) < 0.002);
});

test('a volume change slides in a straight line over one ramp and lands exactly', () => {
  const audio = new Ringing({ sampleRate: RATE });
  audio.play(audio.addSound({ channels: [new Float32Array(1000).fill(0.5)], sampleRate: RATE }), { loop: true, pan: -1 }).setVolume(0.5);
  const out = run(audio, RAMP + 10);
  for (let i = 0; i < RAMP; i++) {
    const gain = 1 + (0.5 - 1) * i / RAMP;
    assert.ok(Math.abs(out[i] - 0.5 * gain) < 1e-6, `frame ${i}: ${out[i]}, wanted ${0.5 * gain}`);
  }
  assert.equal(out[RAMP], 0.25, 'on the target exactly, with no drift');
  assert.equal(out[RAMP + 9], 0.25);
});

test('changing volume, up and down, never steps by more than twice the sine\'s own steepest step', () => {
  const { audio, voice } = rig();
  const blocks = [run(audio, 700)];
  voice.setVolume(0); blocks.push(run(audio, 1500));        // down to silence
  voice.setVolume(1); blocks.push(run(audio, 1500));        // back up
  voice.setVolume(2); blocks.push(run(audio, 1500));        // louder than the sound was
  assert.ok(biggestStep(...blocks) <= BOUND, `a step of ${biggestStep(...blocks)} is past ${BOUND}`);
});

test('changing volume or pan again before a ramp finishes stays smooth', () => {
  const { audio, voice } = rig({ pan: 0 });
  const blocks = [run(audio, 500)];
  for (let i = 0; i < 40; i++) {
    voice.setVolume(i % 2 ? 1 : 0.1).setPan(i % 3 === 0 ? -1 : 1);   // every 50 frames: well inside a ramp
    blocks.push(run(audio, 50));
  }
  assert.ok(biggestStep(...blocks) <= BOUND, `a step of ${biggestStep(...blocks)} is past ${BOUND}`);
});

test('pan ramps both channels to their new gains', () => {
  const audio = new Ringing({ sampleRate: RATE });
  const voice = audio.play(audio.addSound({ channels: [new Float32Array(1000).fill(0.5)], sampleRate: RATE }), { loop: true, pan: -1 });
  run(audio, 10);
  voice.setPan(1);
  const l = new Float32Array(RAMP + 4), r = new Float32Array(RAMP + 4);
  audio.render(l, r, RAMP + 4);
  assert.ok(l[0] > l[RAMP / 2] && l[RAMP / 2] > l[RAMP + 3], 'left slides down');
  assert.ok(r[0] < r[RAMP / 2] && r[RAMP / 2] < r[RAMP + 3], 'right slides up');
  assert.ok(l[RAMP + 3] < 1e-6 && Math.abs(r[RAMP + 3] - 0.5) < 1e-6, 'and they land on hard right');
});

test('a changed pitch moves the voice along faster or slower but never makes it jump', () => {
  const { audio, voice } = rig();
  const blocks = [run(audio, 700)];
  voice.setPitch(2); blocks.push(run(audio, 700));         // twice the speed: twice the steps
  voice.setPitch(0.25); blocks.push(run(audio, 700));
  assert.ok(biggestStep(...blocks) <= 2 * NATURAL * 1.001, `a step of ${biggestStep(...blocks)}`);
});

test('stop() fades out over one ramp to exact silence, with no step, and the voice is dead at once', () => {
  const { audio, voice } = rig();
  const before = run(audio, 600);                           // 600 frames in: the sine is near its peak
  voice.stop();
  assert.ok(!voice.alive);
  const fade = run(audio, RAMP + 50);
  assert.ok(biggestStep(before, fade) <= BOUND, `a step of ${biggestStep(before, fade)}`);
  assert.ok(Math.abs(fade[0]) > 0.4, 'it was loud when stopped');
  assert.equal(fade[RAMP], 0, 'exactly silent once the ramp is over');
  assert.ok(fade.slice(RAMP).every((x) => x === 0), 'and stays silent');
});

test('removing a sound fades its voices out the same way, and says nothing', () => {
  const { audio, sound } = rig();
  const before = run(audio, 600);
  audio.remove(sound);
  const fade = run(audio, RAMP + 50);
  assert.ok(biggestStep(before, fade) <= BOUND);
  assert.equal(fade[RAMP], 0);
  assert.deepEqual(audio.events(), []);
});

test('a stopped voice fades from wherever its gain was, even partway through a ramp', () => {
  const { audio, voice } = rig();
  const a = run(audio, 600);
  voice.setVolume(0.2);
  const b = run(audio, 100);                                // part of the way down
  voice.stop();
  const c = run(audio, RAMP + 10);
  assert.ok(biggestStep(a, b, c) <= BOUND, `a step of ${biggestStep(a, b, c)}`);
  assert.equal(c[RAMP], 0);
});

test('a voice that ends on its own while fading out is freed quietly, with no event', () => {
  const audio = new Ringing({ sampleRate: RATE });
  const voice = audio.play(audio.addSound({ channels: [new Float32Array(100).fill(0.5)], sampleRate: RATE }), { pan: -1 });
  voice.stop();                                              // 100 frames of sound, 382 frames of fade: the sound ends first
  const out = run(audio, 500);
  assert.ok(out[0] === 0.5 && out[99] < 0.5 && out[99] > 0.3, 'fading while the sound lasts');
  assert.ok(out.slice(100).every((x) => x === 0));
  assert.deepEqual(audio.events(), []);
});
