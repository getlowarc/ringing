// Kernel cost in plain Node (same V8 as Chromium's audio thread). The real-time budget for one
// 128-frame block at 48 kHz is 128/48000 = 2.667 ms; a mixer using 50% of that is at its limit in
// practice, because the browser also runs its own work on that thread.
import { Mixer, testSound, voiceSettings } from './kernel.js';

const SR = 48000, BLOCK = 128, BUDGET_US = (BLOCK / SR) * 1e6;
const data = testSound(SR);
const L = new Float32Array(BLOCK), R = new Float32Array(BLOCK);

console.log(`node ${process.version}  budget per ${BLOCK}-frame block: ${BUDGET_US.toFixed(0)} us`);
console.log('voices   us/block   % of budget   max voices at 50%');
for (const n of [25, 50, 100, 200, 400, 800, 1600]) {
  const m = new Mixer(n);
  for (let i = 0; i < n; i++) m.add(data, { ...voiceSettings(i), sampleRate: SR });
  for (let i = 0; i < 2000; i++) m.render(L, R, BLOCK); // warm up V8
  const runs = [];
  for (let r = 0; r < 7; r++) {
    const t = process.hrtime.bigint();
    for (let i = 0; i < 2000; i++) m.render(L, R, BLOCK);
    runs.push(Number(process.hrtime.bigint() - t) / 1000 / 2000);
  }
  runs.sort((a, b) => a - b);
  const us = runs[3];
  console.log(`${String(n).padStart(6)}  ${us.toFixed(1).padStart(9)}  ${(us / BUDGET_US * 100).toFixed(1).padStart(10)}%   ${Math.floor(n * (BUDGET_US * 0.5) / us)}`);
}
