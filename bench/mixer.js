// What a block costs, with the real package: N looping voices through render().
// The budget for one 128-frame block at 48 kHz is 128/48000 = 2.667 ms; a mixer
// above about half of that is at its limit, because the host's audio thread has
// other work. For comparison, the spike's kernel (spike/kernel.js: the same
// resample, gain and pan, plus a biquad filter per voice) measured 66 us a block
// for 100 voices and 528 us for 800 on the same machine.
// Run: node bench/mixer.js

import { Ringing } from '../src/ringing.js';

const RATE = 48000, BLOCK = 128, BUDGET_US = (BLOCK / RATE) * 1e6;
const tone = (n) => Float32Array.from({ length: n }, (_, i) => ((i * 7) % 100) / 100 - 0.5);

console.log(`node ${process.version}  budget per ${BLOCK}-frame block: ${BUDGET_US.toFixed(0)} us`);
console.log('voices   mono us/block   stereo us/block   (% of budget, stereo)   max stereo voices at 50%');
for (const n of [25, 50, 100, 200, 400, 800, 1600]) {
  const row = [];
  for (const stereo of [false, true]) {
    const audio = new Ringing({ sampleRate: RATE });
    const sound = audio.addSound({ channels: stereo ? [tone(96000), tone(96000)] : [tone(96000)], sampleRate: RATE });
    for (let i = 0; i < n; i++) audio.play(sound, { loop: true, pitch: 0.5 + ((i * 37) % 100) / 50, pan: (((i * 53) % 200) - 100) / 100, volume: 0.1 });
    const l = new Float32Array(BLOCK), r = new Float32Array(BLOCK);
    for (let i = 0; i < 2000; i++) audio.render(l, r, BLOCK);   // warm up V8
    const runs = [];
    for (let k = 0; k < 7; k++) {
      const t = process.hrtime.bigint();
      for (let i = 0; i < 2000; i++) audio.render(l, r, BLOCK);
      runs.push(Number(process.hrtime.bigint() - t) / 1000 / 2000);
    }
    runs.sort((a, b) => a - b);
    row.push(runs[3]);
  }
  const [mono, stereo] = row;
  console.log(`${String(n).padStart(6)}  ${mono.toFixed(1).padStart(13)}  ${stereo.toFixed(1).padStart(15)}   ${(stereo / BUDGET_US * 100).toFixed(1).padStart(14)}%   ${Math.floor(n * BUDGET_US * 0.5 / stereo).toString().padStart(8)}`);
}
