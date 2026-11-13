// decode(): WAV files to samples, exactly, and every refusal named.
// Run: node test/decode.test.js

import assert from 'node:assert/strict';
import { decode } from '../src/ringing.js';
import { suite, test, thrown } from './test.js';
import { wav } from './wav.js';

suite('decode');

const same = (got, want) => assert.deepEqual([...got], want);

test('16-bit PCM is divided by 32768, exactly', () => {
  const r = decode(wav({ channels: [[0, 16384, -16384, 32767, -32768]], bits: 16 }));
  assert.equal(r.sampleRate, 48000);
  assert.equal(r.channels.length, 1);
  same(r.channels[0], [0, 0.5, -0.5, 32767 / 32768, -1]);
});

test('8-bit is unsigned around 128, 24-bit and 32-bit are signed', () => {
  same(decode(wav({ channels: [[0, 64, -128, 127]], bits: 8 })).channels[0], [0, 0.5, -1, 127 / 128]);
  same(decode(wav({ channels: [[0, 4194304, -8388608, 8388607]], bits: 24 })).channels[0], [0, 0.5, -1, 8388607 / 8388608]);
  same(decode(wav({ channels: [[0, 1073741824, -2147483648]], bits: 32 })).channels[0], [0, 0.5, -1]);
});

test('32-bit and 64-bit float are read as they are', () => {
  same(decode(wav({ channels: [[0, 0.25, -1.5]], bits: 32, format: 3 })).channels[0], [0, 0.25, -1.5]);
  same(decode(wav({ channels: [[0, 0.25, -1.5]], bits: 64, format: 3 })).channels[0], [0, 0.25, -1.5]);
});

test('stereo is split into two channels, and the rate is read', () => {
  const r = decode(wav({ channels: [[1, 2, 3], [-1, -2, -3]], rate: 22050, bits: 16 }));
  assert.equal(r.sampleRate, 22050);
  same(r.channels[0], [1 / 32768, 2 / 32768, 3 / 32768]);
  same(r.channels[1], [-1 / 32768, -2 / 32768, -3 / 32768]);
});

test('extra chunks are skipped, and WAVE_FORMAT_EXTENSIBLE is understood', () => {
  same(decode(wav({ channels: [[16384, 0]], extra: true })).channels[0], [0.5, 0]);
  same(decode(wav({ channels: [[16384, 0]], extensible: true })).channels[0], [0.5, 0]);
  same(decode(wav({ channels: [[0.5, 0]], bits: 32, format: 3, extensible: true })).channels[0], [0.5, 0]);
});

test('a data size left as 0xFFFFFFFF by a streaming writer reads what is there; a partial last frame is dropped', () => {
  same(decode(wav({ channels: [[1, 2, 3]], dataSize: 0xffffffff })).channels[0], [1 / 32768, 2 / 32768, 3 / 32768]);
  same(decode(wav({ channels: [[1, 2, 3]], trailing: 1 })).channels[0], [1 / 32768, 2 / 32768, 3 / 32768]);
});

test('an ArrayBuffer, a Uint8Array and a view into a larger buffer all decode', () => {
  const bytes = wav({ channels: [[16384, -16384]] });
  same(decode(bytes.buffer).channels[0], [0.5, -0.5]);
  const padded = new Uint8Array(bytes.length + 10);
  padded.set(bytes, 7);
  same(decode(padded.subarray(7, 7 + bytes.length)).channels[0], [0.5, -0.5]);
});

test('what it cannot read is refused, naming what and where', () => {
  const m = (bytes) => thrown(() => decode(bytes));
  assert.equal(m(5), 'decode: bytes must be a Uint8Array or an ArrayBuffer, got 5');
  assert.equal(m(new Uint8Array(20)), 'decode: not a WAV file (no RIFF and WAVE header at byte 0)');
  assert.equal(m(new Uint8Array([0x66, 0x4c, 0x61, 0x43, 0, 0])), 'decode: this is FLAC, which Ringing does not read yet; it reads WAV');
  assert.equal(m(new Uint8Array([0x4f, 0x67, 0x67, 0x53, 0, 0])), 'decode: this is Ogg, which Ringing does not read yet; it reads WAV');
  assert.equal(m(new Uint8Array([0x49, 0x44, 0x33, 4, 0])), 'decode: this is MP3, which Ringing does not read yet; it reads WAV');
  assert.equal(m(wav({ channels: [[1], [1], [1]] })), 'decode: WAV has 3 channels; Ringing reads mono and stereo');
  assert.equal(m(wav({ channels: [[1]], format: 2 })), 'decode: WAV format 2 is not supported; Ringing reads PCM and float WAV');
  assert.equal(m(wav({ channels: [[1]], bits: 8, format: 3 })), 'decode: WAV has 8 bits per sample; Ringing reads 8, 16, 24 and 32 bit PCM and 32 and 64 bit float');
  assert.equal(m(wav({ channels: [[]] })), 'decode: WAV holds no audio frames');
});
