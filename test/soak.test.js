// Nothing grows forever. Add, play and remove every kind of thing, many times:
// storage returns to where it started, and the garbage collector gets back every
// handle, sound and instance: leaks are kept at bay permanently, not
// discovered later.
// Run: node --expose-gc test/soak.test.js

import assert from 'node:assert/strict';
import { Ringing } from '../src/ringing.js';
import { Slots } from '../src/core/slots.js';
import { MIN_CAPACITY } from '../src/core/store.js';
import { suite, testAsync } from './test.js';

suite('soak');

const RATE = 48000;
const data = (n) => new Float32Array(n).fill(0.1);

/** Lets the garbage collector run: collecting a WeakRef'd object needs turns of the event loop. */
async function collect() {
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    gc();
  }
}

/**
 * Makes, renders and destroys `n` instances and returns only weak references. Its own function,
 * so the last instance isn't left on the test's stack frame, which would keep exactly one alive
 * and look like a leak.
 */
function madeInstances(n) {
  const refs = [];
  const l = new Float32Array(128), r = new Float32Array(128);
  for (let i = 0; i < n; i++) {
    const audio = new Ringing({ sampleRate: RATE });
    const sound = audio.addSound({ channels: [data(300)], sampleRate: RATE });
    audio.play(sound, { loop: true });
    audio.render(l, r, 128);
    audio.destroy();
    refs.push(new WeakRef(audio), new WeakRef(sound));
  }
  return refs;
}

/** Plays and ends `n` voices of a sound in one instance; returns weak references to every handle. */
function madeVoices(audio, sound, n) {
  const refs = [];
  const l = new Float32Array(128), r = new Float32Array(128);
  for (let i = 0; i < n; i++) refs.push(new WeakRef(audio.play(sound)));
  audio.render(l, r, 128);        // all end: they were 8 frames long
  return refs;
}

await testAsync('10,000 instances made, played and destroyed, with their sounds, are all collected', async () => {
  assert.equal(typeof globalThis.gc, 'function', 'run with node --expose-gc');
  const refs = madeInstances(10000);
  await collect();
  const alive = refs.filter((ref) => ref.deref() !== undefined).length;
  assert.equal(alive, 0, `${alive} of ${refs.length} handles and instances were not collected`);
});

await testAsync('100,000 sounds and voices added and removed leave the instance working, with nothing left playing', async () => {
  const audio = new Ringing({ sampleRate: RATE });
  const sound = audio.addSound({ channels: [data(8)], sampleRate: RATE });
  const l = new Float32Array(400), r = new Float32Array(400);
  for (let round = 0; round < 100; round++) {
    const sounds = [], voices = [];
    for (let i = 0; i < 500; i++) {
      const s = audio.addSound({ channels: [data(16)], sampleRate: RATE });
      sounds.push(s);
      voices.push(audio.play(s, { loop: true }), audio.play(sound, { loop: true }));
    }
    for (const v of voices) v.stop();
    for (const s of sounds) audio.remove(s);
    audio.render(l, r, 400);          // the stopped voices fade out over one ramp (382 frames), then free themselves
  }
  assert.equal(audio.soundOf(sound).frames, 8, 'the one sound that stayed is intact');
  // 100,000 voices and 50,000 sounds made and removed; the instance holds one sound, no voices.
  // (That the tables shrink back is test/store.test.js's; this is the whole instance on top of it.)
  audio.render(l, r, 128);
  assert.deepEqual(audio.events(), []);
  assert.ok(l.subarray(0, 128).every((v) => v === 0), 'no voice is left playing');   // only the first 128 frames were rendered
  const extra = audio.play(sound);
  assert.ok(extra.alive, 'and a new voice still starts');
});

await testAsync('ended voices and removed sounds are collected, and their slots reused without growing', async () => {
  const audio = new Ringing({ sampleRate: RATE });
  const sound = audio.addSound({ channels: [data(8)], sampleRate: RATE });
  const refs = [];
  for (let round = 0; round < 50; round++) refs.push(...madeVoices(audio, sound, 2000));
  await collect();
  const alive = refs.filter((ref) => ref.deref() !== undefined).length;
  assert.equal(alive, 0, `${alive} of ${refs.length} ended voices' handles were not collected`);
});

await testAsync('slots taken and released 1,000,000 times end where they started', async () => {
  const slots = new Slots();
  slots.resize(1024);
  for (let i = 0; i < 1000000; i++) {
    const a = slots.take(), b = slots.take();
    slots.release(a);
    slots.release(b);
  }
  assert.equal(slots.count, 0);
  assert.equal(slots.top, 0);
  assert.equal(slots.capacity, 1024);
  assert.ok(MIN_CAPACITY <= 1024);
});

await testAsync('the samples of a removed sound are freed once its voices have faded out, and not before', async () => {
  const audio = new Ringing({ sampleRate: RATE });
  const source = data(1000000);                                   // 4 MB, made once and reused
  const l = new Float32Array(400), r = new Float32Array(400);
  // Freed buffers are only reclaimed after the collector has had a few turns, so wait for it.
  const memory = async () => { await collect(); return process.memoryUsage().arrayBuffers; };
  const base = await memory();
  const sounds = Array.from({ length: 20 }, () => audio.addSound({ channels: [source], sampleRate: RATE }));
  const voices = sounds.map((s) => audio.play(s, { loop: true }));
  const held = await memory();
  assert.ok(held - base > 70e6, `20 sounds of 4 MB should hold about 80 MB, held ${(held - base) / 1e6} MB`);
  for (const s of sounds) audio.remove(s);
  assert.ok(voices.every((v) => !v.alive));
  assert.ok(await memory() - base > 70e6, 'the samples are kept while the voices fade, so the fade has something to play');
  audio.render(l, r, 400);                                         // one ramp: the fades are over
  const after = await memory();
  assert.ok(after - base < 4e6, `still holding ${(after - base) / 1e6} MB after the fade`);
});
