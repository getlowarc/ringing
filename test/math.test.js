// Determinism's foundations: Ringing's own sin, cos, exp and log are right, give
// the same bits everywhere, and nothing in src/ calls a function the spec lets
// engines round differently.
// Run: node test/math.test.js

import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sin, cos, exp, log } from '../src/core/math.js';
import { suite, test } from './test.js';

suite('math');

// Computed on Node 22 (V8) on 2026-11-12, and the same on Bun 1.4.4 (JavaScriptCore),
// which is what shows it holds across engines. CI runs this file on both.
const HASH = '502631100651a920';

/** Distance from x to the next double up: one unit in the last place. */
function ulp(x) {
  const f = new Float64Array([Math.abs(x)]);
  const i = new BigInt64Array(f.buffer);
  i[0] += 1n;
  return f[0] - Math.abs(x) || Number.MIN_VALUE;
}

let seed = 12345;
const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

test('sin and cos agree with Math.sin and Math.cos to 1 ulp', () => {
  // V8's are fdlibm's too, so agreement this close says the coefficients and
  // the reduction are right; it is not what makes ours deterministic (using
  // only exact operations is).
  const xs = [0, 1e-300, 1e-8, 0.5, Math.PI / 4, Math.PI / 2, Math.PI, 2 * Math.PI, 100, 1e5, 8e5];
  for (let i = 0; i < 100000; i++) xs.push((random() * 2 - 1) * [1, 10, 1000, 8e5][i % 4]);
  for (let k = 1; k < 10000; k++) xs.push(k * Math.PI / 2, k * Math.PI / 4);
  for (const x of xs) {
    assert.ok(Math.abs(sin(x) - Math.sin(x)) <= ulp(Math.sin(x)), `sin(${x})`);
    assert.ok(Math.abs(cos(x) - Math.cos(x)) <= ulp(Math.cos(x)), `cos(${x})`);
  }
  assert.equal(sin(0), 0);
  assert.equal(cos(0), 1);
});

test('exp agrees with Math.exp to 1 ulp, and its limits are exact', () => {
  const xs = [0, 1e-300, 1e-9, 0.34, 0.35, 0.5, 1, -1, 2, 10, -10, 100, -100, 700, -700, 709.7, -745, 709.78];
  for (let i = 0; i < 200000; i++) xs.push((random() * 2 - 1) * [1, 5, 50, 700][i % 4]);
  for (const x of xs) {
    const want = Math.exp(x);
    assert.ok(Math.abs(exp(x) - want) <= ulp(want), `exp(${x}): got ${exp(x)}, want ${want}`);
  }
  assert.equal(exp(0), 1);
  assert.equal(exp(710), Infinity);
  assert.equal(exp(-746), 0);
  assert.ok(Number.isNaN(exp(NaN)));
  assert.equal(exp(-Infinity), 0);
  assert.equal(exp(Infinity), Infinity);
});

test('log agrees with Math.log to 1 ulp, and its limits are exact', () => {
  const xs = [1, 0.5, 2, Math.E, 10, 1e-300, 5e-324, 1e300, 1.5, 0.7071, 1.4142, 1 + 1e-10, 1 - 1e-10];
  for (let i = 0; i < 200000; i++) xs.push(random() * [1, 10, 1e6, 1e-6][i % 4] + 1e-300);
  for (const x of xs) {
    const want = Math.log(x);
    assert.ok(Math.abs(log(x) - want) <= ulp(want), `log(${x}): got ${log(x)}, want ${want}`);
  }
  assert.equal(log(1), 0);
  assert.equal(log(0), -Infinity);
  assert.ok(Number.isNaN(log(-1)));
  assert.ok(Number.isNaN(log(NaN)));
  assert.equal(log(Infinity), Infinity);
});

test('exp and log undo each other', () => {
  for (let i = 0; i < 10000; i++) {
    const x = random() * 20 - 10;
    assert.ok(Math.abs(log(exp(x)) - x) <= 4 * ulp(x) + 1e-15, `log(exp(${x}))`);
  }
});

test('the same bits on every machine: a fixed sweep hashes to a stored value', () => {
  // FNV-1a over the 64 bits of every result. If this changes on any machine or
  // runtime (CI runs it on Bun too), that machine's functions differ in a bit.
  let h = 0xcbf29ce484222325n;
  const buf = new Float64Array(1), words = new BigUint64Array(buf.buffer);
  const mix = (v) => { buf[0] = v; h = ((h ^ words[0]) * 0x100000001b3n) & 0xffffffffffffffffn; };
  for (let i = -2000; i <= 2000; i++) {
    const x = i * 0.0173;
    mix(sin(x)); mix(cos(x)); mix(exp(x * 0.1)); mix(log(Math.abs(x) + 0.001));
  }
  assert.equal(h.toString(16), HASH, `math hash is ${h.toString(16)}`);
});

test('nothing in src/ calls an implementation-approximated function', () => {
  // The spec lets engines round these differently, so none may appear anywhere
  // in the package, not only in render(): a setter that writes a filter
  // coefficient writes state too. src/core/math.js is the way to get them.
  const banned = /\bMath\.(sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|asinh|acosh|atanh|exp|expm1|log|log1p|log2|log10|pow|cbrt|hypot|random)\b|\*\*/;
  const root = fileURLToPath(new URL('../src', import.meta.url));
  const files = [];
  (function walk(dir) {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith('.js')) files.push(path);
    }
  })(root);
  assert.ok(files.length > 0);
  for (const file of files) {
    const code = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')            // block comments
      .replace(/\/\/.*$/gm, '');                   // line comments
    const hit = code.match(banned);
    assert.ok(!hit, `${file} uses ${hit && hit[0]}`);
  }
});
