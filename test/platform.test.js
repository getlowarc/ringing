// The core is the same on any JavaScript engine because it uses none of their
// platforms: no Web Audio, no DOM, no timers, no fetch, no workers, no Node
// modules. Hosts live in src/adapters/, which nothing in the core imports.
// Run: node test/platform.test.js

import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { suite, test } from './test.js';

suite('platform');

const root = fileURLToPath(new URL('../src', import.meta.url));
const adapters = join(root, 'adapters');

function sources(dir, skip) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (path === skip) continue;
    if (statSync(path).isDirectory()) files.push(...sources(path, skip));
    else if (name.endsWith('.js')) files.push(path);
  }
  return files;
}

const strip = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

// Names that only exist on a platform. A word boundary on each, so `fetchSlot` is fine.
const PLATFORM = /\b(AudioContext|OfflineAudioContext|AudioWorklet\w*|AudioNode|AudioBuffer\w*|window|document|navigator|self|fetch|XMLHttpRequest|setTimeout|setInterval|setImmediate|requestAnimationFrame|queueMicrotask|Worker|MessageChannel|postMessage|process|require|Buffer|SharedArrayBuffer|Atomics|performance|localStorage)\b/;

test('nothing in the core uses a platform API', () => {
  const files = sources(root, adapters);
  assert.ok(files.length > 0);
  for (const file of files) {
    const hit = strip(readFileSync(file, 'utf8')).match(PLATFORM);
    assert.ok(!hit, `${relative(root, file)} uses ${hit && hit[0]}`);
  }
});

test('the core imports only core files, never Node modules or adapters', () => {
  for (const file of sources(root, adapters)) {
    for (const m of strip(readFileSync(file, 'utf8')).matchAll(/\bfrom\s+['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]/g)) {
      const spec = m[1] ?? m[2];
      assert.ok(spec.startsWith('.'), `${relative(root, file)} imports ${spec}`);
      assert.ok(!spec.includes('adapters'), `${relative(root, file)} imports an adapter: ${spec}`);
    }
  }
});

test('adapters, when there are any, are the only place a platform may appear', () => {
  assert.ok(!existsSync(adapters) || statSync(adapters).isDirectory());
});
