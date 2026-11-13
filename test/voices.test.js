// Sounds and voices: what comes out of render() is exactly what the mixer's
// rules say, because rendering is deterministic: no listening, only numbers.
// Gain changes ramp and the master limit bends peaks above its knee, so these
// tests use samples inside the knee and read gains after a ramp has finished;
// test/clicks.test.js and test/limiter.test.js hold those two behaviours.
// Run: node test/voices.test.js

import assert from 'node:assert/strict';
import { Ringing, Sound, Voice } from '../src/ringing.js';
import { cos, sin } from '../src/core/math.js';
import { RAMP_TIME } from '../src/voices.js';
import { suite, test, thrown } from './test.js';

suite('voices');

const RATE = 48000;
const RAMP = Math.round(RAMP_TIME * RATE);                    // frames a gain ramp lasts here
const ramp16 = (n) => Float32Array.from({ length: n }, (_, i) => i / 16);   // 0, 1/16, 2/16...: exact, inside the knee
const flat = (n, v) => new Float32Array(n).fill(v);
const make = () => new Ringing({ sampleRate: RATE });
/** Renders `n` frames and returns copies of both channels. */
function block(audio, n) {
  const l = new Float32Array(n), r = new Float32Array(n);
  audio.render(l, r, n);
  return [[...l], [...r]];
}
/** Renders past a ramp, then one more frame, and returns that frame's [left, right]: the settled gains. */
function settled(audio) {
  block(audio, RAMP + 8);
  const [l, r] = block(audio, 1);
  return [l[0], r[0]];
}
const SQRT_HALF = cos(Math.PI / 4);   // the gain each side gets from a centred mono sound

test('a mono sound plays out exactly, once, then the voice ends and says so', () => {
  const audio = make();
  const sound = audio.addSound({ channels: [ramp16(8)], sampleRate: RATE });
  const voice = audio.play(sound, { pan: -1 });
  assert.ok(voice.alive);
  const [l] = block(audio, 10);
  assert.deepEqual(l, [0, 1, 2, 3, 4, 5, 6, 7, 0, 0].map((x) => x / 16));
  assert.ok(!voice.alive);
  const events = audio.events();
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'ended');
  assert.equal(events[0].voice.id, voice.id);
  block(audio, 4);
  assert.deepEqual(audio.events(), [], "events are only the last render's");
});

test('volume scales and pan places: equal power for mono, so the squares add to the volume squared', () => {
  const audio = make();
  audio.play(audio.addSound({ channels: [flat(4000, 0.5)], sampleRate: RATE }), { volume: 0.5, loop: true });
  let [l, r] = block(audio, 1);
  assert.equal(l[0], Math.fround(0.5 * 0.5 * SQRT_HALF), 'a new voice starts at its gains at once');
  assert.equal(r[0], Math.fround(0.5 * 0.5 * sin(Math.PI / 4)));
  for (const pan of [-1, -0.5, 0.25, 1]) {
    const a = make();
    a.play(a.addSound({ channels: [flat(16, 0.5)], sampleRate: RATE }), { pan });
    [l, r] = block(a, 1);
    assert.ok(Math.abs(l[0] ** 2 + r[0] ** 2 - 0.25) < 1e-6, `pan ${pan}: ${l[0]}, ${r[0]}`);
  }
  const hard = make();
  hard.play(hard.addSound({ channels: [flat(16, 0.5)], sampleRate: RATE }), { pan: -1 });
  [l, r] = block(hard, 1);
  assert.equal(l[0], 0.5);
  assert.ok(r[0] < 1e-6);
});

test('a stereo sound keeps its own sides, and pan is a balance that turns only the far side down', () => {
  const audio = make();
  audio.play(audio.addSound({ channels: [flat(16, 0.5), flat(16, -0.25)], sampleRate: RATE }));
  let [l, r] = block(audio, 1);
  assert.deepEqual([l[0], r[0]], [0.5, -0.25], 'untouched at pan 0');
  const a = make();
  a.play(a.addSound({ channels: [flat(16, 0.5), flat(16, -0.25)], sampleRate: RATE }), { pan: 0.5 });
  [l, r] = block(a, 1);
  assert.deepEqual([l[0], r[0]], [0.25, -0.25], 'toward the right: left halves, right stays');
});

test('pitch 0.5 reads half a frame at a time, blending neighbours; pitch 2 skips every other', () => {
  const half = make();
  half.play(half.addSound({ channels: [ramp16(8)], sampleRate: RATE }), { pitch: 0.5, pan: -1 });
  assert.deepEqual(block(half, 6)[0], [0, 0.5, 1, 1.5, 2, 2.5].map((x) => x / 16));
  const twice = make();
  twice.play(twice.addSound({ channels: [ramp16(8)], sampleRate: RATE }), { pitch: 2, pan: -1 });
  assert.deepEqual(block(twice, 6)[0], [0, 2, 4, 6, 0, 0].map((x) => x / 16));
});

test('a sound recorded at another rate plays at the right speed', () => {
  const audio = make();   // 48 kHz device, 24 kHz sound: half a frame per output frame
  audio.play(audio.addSound({ channels: [ramp16(8)], sampleRate: 24000 }), { pan: -1 });
  assert.deepEqual(block(audio, 4)[0], [0, 0.5, 1, 1.5].map((x) => x / 16));
});

test('a loop wraps with no seam: it blends the last frame toward the first', () => {
  const four = () => Float32Array.of(0, 1, 2, 3).map((x) => x / 16);
  const audio = make();
  audio.play(audio.addSound({ channels: [four()], sampleRate: RATE }), { loop: true, pan: -1 });
  assert.deepEqual(block(audio, 9)[0], [0, 1, 2, 3, 0, 1, 2, 3, 0].map((x) => x / 16));
  const half = make();
  half.play(half.addSound({ channels: [four()], sampleRate: RATE }), { loop: true, pitch: 0.5, pan: -1 });
  assert.deepEqual(block(half, 9)[0], [0, 0.5, 1, 1.5, 2, 2.5, 3, 1.5, 0].map((x) => x / 16), 'across the seam: 3 toward 0');
});

test('voices add: two playing at once are the sum of both', () => {
  const audio = make();
  const s = audio.addSound({ channels: [flat(16, 0.125)], sampleRate: RATE });
  audio.play(s, { pan: -1 }); audio.play(s, { pan: -1 }); audio.play(s, { pan: -1, volume: 2 });
  assert.equal(block(audio, 1)[0][0], 0.5);
});

test('setVoice and the voice setters change what is asked and leave the rest', () => {
  const audio = make();
  const s = audio.addSound({ channels: [flat(8000, 0.5)], sampleRate: RATE });
  const v = audio.play(s, { pan: -1, volume: 1, loop: true });
  assert.equal(audio.voiceOf(v).position, 0);
  block(audio, 1);
  assert.equal(audio.voiceOf(v).position, 1 / RATE, 'position is in seconds of the sound');
  assert.equal(v.setVolume(0.5), v, 'setters chain');
  assert.equal(settled(audio)[0], 0.25, 'the gain has slid to its new value');
  audio.setVoice(v, { pitch: 2, loop: false });
  const got = audio.voiceOf(v);
  assert.equal(got.sound.id, s.id);
  assert.deepEqual([got.volume, got.pitch, got.pan, got.loop], [0.5, 2, -1, false]);
  v.setPan(1).setLoop(true);
  assert.equal(audio.voiceOf(v).pan, 1);
  assert.equal(audio.voiceOf(v).loop, true);
});

test('soundOf gives a copy of the facts, and null once removed', () => {
  const audio = make();
  const s = audio.addSound({ channels: [ramp16(100), ramp16(100)], sampleRate: 22050 });
  assert.deepEqual(audio.soundOf(s), { sampleRate: 22050, channels: 2, frames: 100, duration: 100 / 22050 });
  audio.remove(s);
  assert.equal(audio.soundOf(s), null);
});

test("the sound is copied: changing the caller's array afterwards changes nothing", () => {
  const audio = make();
  const data = flat(8, 0.5);
  const s = audio.addSound({ channels: [data], sampleRate: RATE });
  data.fill(9);
  audio.play(s, { pan: -1 });
  assert.equal(block(audio, 1)[0][0], 0.5);
});

test('removing a sound stops its voices (no events); stopping a voice is fine twice', () => {
  const audio = make();
  const s = audio.addSound({ channels: [ramp16(100)], sampleRate: RATE });
  const a = audio.play(s), b = audio.play(s);
  audio.remove(s);
  assert.ok(!a.alive && !b.alive);
  assert.equal(audio.soundOf(s), null);
  block(audio, 4);
  assert.deepEqual(audio.events(), []);
  const s2 = audio.addSound({ channels: [ramp16(100)], sampleRate: RATE });
  const c = audio.play(s2);
  c.stop();
  c.stop();
  audio.remove(c);
  assert.ok(!c.alive);
});

test("a finished voice's slot is reused, and the old handle never reaches the new voice", () => {
  const audio = make();
  const s = audio.addSound({ channels: [ramp16(4)], sampleRate: RATE });
  const old = audio.play(s);
  block(audio, 8);
  assert.ok(!old.alive);
  const fresh = audio.play(s);
  assert.notEqual(fresh.id, old.id);
  assert.equal(fresh.id & 0xffffff, old.id & 0xffffff, 'same slot');
  assert.ok(fresh.alive && !old.alive);
  old.stop();                       // must not stop the new voice
  assert.ok(fresh.alive);
});

test('a stopped voice\'s slot is reused only after it has faded out, and the old handle never reaches the new voice', () => {
  const audio = make();
  const s = audio.addSound({ channels: [flat(4000, 0.2)], sampleRate: RATE });
  const old = audio.play(s, { loop: true });
  old.stop();
  assert.ok(!old.alive, 'dead at once');
  const during = audio.play(s, { loop: true });
  assert.notEqual(during.id & 0xffffff, old.id & 0xffffff, 'its slot is still in use, fading');
  block(audio, RAMP + 2);
  const after = audio.play(s, { loop: true });
  assert.equal(after.id & 0xffffff, old.id & 0xffffff, 'now free, and reused');
  assert.ok(after.alive && during.alive && !old.alive);
  old.stop();
  assert.ok(after.alive, 'the old handle cannot stop the new voice');
});

test('2,000 voices of one sound mix as their sum', () => {
  const audio = make();
  const s = audio.addSound({ channels: [flat(32, 0.0002)], sampleRate: RATE });
  for (let i = 0; i < 2000; i++) audio.play(s, { pan: -1 });
  const [l] = block(audio, 4);
  assert.ok(Math.abs(l[0] - 0.4) < 1e-4, `${l[0]}`);
});

test('handles hold the instance and an id, and cannot be assigned', () => {
  const audio = make();
  const s = audio.addSound({ channels: [ramp16(4)], sampleRate: RATE });
  const v = audio.play(s);
  assert.ok(s instanceof Sound && v instanceof Voice);
  assert.equal(v.audio, audio);
  assert.equal(thrown(() => { v.id = 3; }), 'id is read only');
  assert.equal(thrown(() => { v.alive = true; }), 'alive is read only');
});
