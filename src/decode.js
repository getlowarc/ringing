// decode(bytes): a file's bytes to samples. It is a plain function, not a method
// of Ringing, because it needs no instance: it reads bytes and returns numbers,
// touching no platform. Version 0.1 reads WAV; FLAC and Ogg Vorbis join it
// (milestones 10 and 11) and the same call reads them.

import { fail, show } from './core/check.js';
import { decodeWav } from './core/wav.js';

/**
 * @param {Uint8Array | ArrayBuffer} bytes the whole file
 * @returns {{ channels: Float32Array[], sampleRate: number }} what `audio.addSound` takes
 */
export function decode(bytes) {
  let view;
  if (bytes instanceof ArrayBuffer) view = new DataView(bytes);
  else if (ArrayBuffer.isView(bytes)) view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  else fail('decode', `bytes must be a Uint8Array or an ArrayBuffer, got ${show(bytes)}`);

  const head = (i) => (i < view.byteLength ? view.getUint8(i) : 0);
  const ascii = (at, n) => String.fromCharCode(...Array.from({ length: n }, (_, i) => head(at + i)));
  if (ascii(0, 4) === 'RIFF') return decodeWav(view);
  const known = ascii(0, 4) === 'fLaC' ? 'FLAC'
    : ascii(0, 4) === 'OggS' ? 'Ogg'
    : ascii(0, 3) === 'ID3' || (head(0) === 0xff && (head(1) & 0xe0) === 0xe0) ? 'MP3'
    : null;
  if (known) fail('decode', `this is ${known}, which Ringing does not read yet; it reads WAV`);
  fail('decode', 'not a WAV file (no RIFF and WAVE header at byte 0)');
}
