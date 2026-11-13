// docs/API.md is complete and its links land: every public member has an entry,
// every message a call can throw is listed word for word, every link goes
// somewhere, and the types name every member.
// Run: node test/docs.test.js

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Ringing, Sound, Voice } from '../src/ringing.js';
import * as entry from '../src/ringing.js';
import { suite, test } from './test.js';
import { MESSAGES } from './messages.js';

suite('docs');

const docs = readFileSync(new URL('../docs/API.md', import.meta.url), 'utf8');
const types = readFileSync(new URL('../src/ringing.d.ts', import.meta.url), 'utf8');
const ids = new Set([...docs.matchAll(/<a id="([^"]+)"><\/a>/g)].map((m) => m[1]));

const own = (Class) => Object.getOwnPropertyNames(Class.prototype).filter((n) => n !== 'constructor');
const members = own(Ringing);
// Voice members have anchors voice-<name>; the members Sound and Voice share (id, audio) are
// documented together under handle-<name>.
const voiceMembers = own(Voice).filter((n) => n !== 'id' && n !== 'audio');
const handleMembers = own(Sound);

test('every public method and getter of Ringing has an entry with an anchor', () => {
  assert.ok(members.length > 0);
  for (const name of members) assert.ok(ids.has(name), `docs/API.md has no <a id="${name}">`);
  assert.ok(ids.has('new-ringing'), 'no entry for the constructor');
});

test('every member of Voice, and of the handles, has an entry with an anchor', () => {
  assert.ok(voiceMembers.length > 0 && handleMembers.length > 0);
  for (const name of voiceMembers) assert.ok(ids.has(`voice-${name}`), `docs/API.md has no <a id="voice-${name}">`);
  for (const name of handleMembers) assert.ok(ids.has(`handle-${name}`), `docs/API.md has no <a id="handle-${name}">`);
  assert.deepEqual(own(Voice).filter((n) => handleMembers.includes(n)).sort(), handleMembers.slice().sort(), 'Voice shares every handle member');
});

test('every exported name is documented', () => {
  for (const name of Object.keys(entry)) assert.ok(docs.includes(name), `docs/API.md never mentions ${name}`);
});

test('every message a call can throw is listed in the reference, word for word', () => {
  for (const [, message] of MESSAGES) assert.ok(docs.includes(message), `docs/API.md does not list: ${message}`);
});

test('every link in the reference lands on an anchor', () => {
  for (const m of docs.matchAll(/\]\(#([^)]+)\)/g)) assert.ok(ids.has(m[1]), `link to #${m[1]} goes nowhere`);
});

test('the A to Z index names every member', () => {
  const az = docs.slice(docs.indexOf('## A to Z'));
  for (const name of [...members, ...voiceMembers, ...handleMembers]) {
    assert.ok(az.includes(`[\`${name}\`]`), `${name} is missing from the A to Z index`);
  }
});

test('the types declare every member and constant', () => {
  for (const name of [...members, ...own(Voice), ...Object.keys(entry)]) {
    assert.ok(new RegExp(String.raw`\b${name}\b`).test(types), `ringing.d.ts never mentions ${name}`);
  }
});
