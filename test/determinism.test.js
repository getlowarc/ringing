// The promise: the same calls give bit-identical samples on every machine and
// engine. A whole scene (mono and stereo sounds, many voices, pitch, pan, loop,
// changes mid-way, voices ending) is rendered and every output bit hashed; the
// hash is stored here and CI checks it on Node (V8) and on Bun (JavaScriptCore).
// If it changes after a change to the mixer, either the sound changed on purpose
// (update the hash, and say so in the changelog) or determinism broke.
// Run: node test/determinism.test.js

import assert from 'node:assert/strict';
import { Ringing } from '../src/ringing.js';
import { sin } from '../src/core/math.js';
import { suite, test } from './test.js';

suite('determinism');

// Computed on Node 22 (V8) on 2026-11-12, and the same on Bun (JavaScriptCore). Changed in
// milestone 3 (de6cfe88e7418cc0 before it), on purpose: the scene changes volumes and pans
// mid-way, which now ramp, and stops a voice, which now fades out.
const SCENE_HASH = '48a58d4664938935';

/** The scene's samples, made with Ringing's own sin so the generator is exact too. */
function tone(frames, hz, rate) {
  return Float32Array.from({ length: frames }, (_, i) => 0.6 * sin(2 * Math.PI * hz * i / rate));
}

function renderScene() {
  const audio = new Ringing({ sampleRate: 48000 });
  const mono = audio.addSound({ channels: [tone(4800, 220, 48000)], sampleRate: 48000 });
  const stereo = audio.addSound({ channels: [tone(9600, 330, 44100), tone(9600, 495, 44100)], sampleRate: 44100 });
  const slow = audio.addSound({ channels: [tone(2000, 110, 24000)], sampleRate: 24000 });
  const voices = [];
  for (let i = 0; i < 40; i++) {
    const sound = [mono, stereo, slow][i % 3];
    voices.push(audio.play(sound, {
      volume: 0.05 + (i % 5) * 0.03,
      pitch: 0.5 + (i * 37 % 100) / 50,
      pan: ((i * 53) % 200 - 100) / 100,
      loop: i % 4 !== 0,
    }));
  }
  const l = new Float32Array(128), r = new Float32Array(128);
  const out = new Float32Array(1);
  let h = 0xcbf29ce484222325n;
  const words = new Uint32Array(out.buffer);
  const mix = (v) => { out[0] = v; h = ((h ^ BigInt(words[0])) * 0x100000001b3n) & 0xffffffffffffffffn; };
  for (let block = 0; block < 300; block++) {
    if (block === 100) for (let i = 0; i < 40; i += 3) if (voices[i].alive) voices[i].setPitch(1.25).setVolume(0.2);
    if (block === 150) for (let i = 1; i < 40; i += 5) if (voices[i].alive) voices[i].setPan(-0.5).setLoop(false);
    if (block === 200) voices[2].stop();   // may already have ended: stop() is fine either way
    audio.render(l, r, 128);
    for (let i = 0; i < 128; i++) { mix(l[i]); mix(r[i]); }
    for (const e of audio.events()) mix(e.voice.id % 1000);   // which voices ended, and when, is part of the scene
  }
  return h.toString(16);
}

test('rendering a whole scene twice gives the same bits', () => {
  assert.equal(renderScene(), renderScene());
});

test('the scene hashes to the stored value, the same on every machine', () => {
  assert.equal(renderScene(), SCENE_HASH);
});
