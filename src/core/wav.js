// The WAV decoder. A WAV file is a RIFF container: the bytes "RIFF", a size, the
// bytes "WAVE", then chunks, each a four-letter name, a size and its bytes. Two
// matter: "fmt " (the format: how many channels, the sample rate, how each sample
// is stored) and "data" (the samples themselves). Anything else (a title, a
// loop marker) is skipped.
//
// Every conversion to Float32 is exact: integers are divided by a power of two
// (32768 for 16-bit, and so on), which a double does without rounding, and a
// Float32Array then holds the result exactly because it has at most 24 bits of
// precision to start with. 32-bit integer samples have 31 bits, so they round
// once, to the nearest Float32, the same way on every machine.

import { fail } from './check.js';

const PCM = 1, FLOAT = 3, EXTENSIBLE = 0xfffe;

const tag = (view, at) => String.fromCharCode(view.getUint8(at), view.getUint8(at + 1), view.getUint8(at + 2), view.getUint8(at + 3));

/**
 * @param {DataView} view the whole file
 * @returns {{ channels: Float32Array[], sampleRate: number }}
 */
export function decodeWav(view) {
  if (view.byteLength < 12 || tag(view, 0) !== 'RIFF' || tag(view, 8) !== 'WAVE') {
    fail('decode', 'not a WAV file (no RIFF and WAVE header at byte 0)');
  }
  let fmt = null, dataAt = -1, dataLength = 0;
  for (let at = 12; at + 8 <= view.byteLength;) {
    const name = tag(view, at), size = view.getUint32(at + 4, true);
    const body = at + 8;
    if (name === 'fmt ') {
      if (size < 16 || body + 16 > view.byteLength) fail('decode', `WAV fmt chunk at byte ${at} is too short`);
      let format = view.getUint16(body, true);
      // WAVE_FORMAT_EXTENSIBLE carries the real format in the first two bytes of a sub-format GUID.
      if (format === EXTENSIBLE && size >= 40 && body + 26 <= view.byteLength) format = view.getUint16(body + 24, true);
      fmt = {
        format,
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        bits: view.getUint16(body + 14, true),
      };
    } else if (name === 'data') {
      dataAt = body;
      // A writer that streams doesn't know the length yet and leaves 0xFFFFFFFF, or a file is
      // cut short: either way the data is whatever is there.
      dataLength = Math.min(size, view.byteLength - body);
      if (fmt) break;
    }
    at = body + size + (size & 1);   // chunks are padded to an even length
  }
  if (fmt === null) fail('decode', 'WAV has no fmt chunk');
  if (dataAt < 0) fail('decode', 'WAV has no data chunk');

  const { format, channels: count, sampleRate, bits } = fmt;
  if (format !== PCM && format !== FLOAT) {
    fail('decode', `WAV format ${format} is not supported; Ringing reads PCM and float WAV`);
  }
  if (count < 1 || count > 2) fail('decode', `WAV has ${count} channels; Ringing reads mono and stereo`);
  const ints = format === PCM && (bits === 8 || bits === 16 || bits === 24 || bits === 32);
  const floats = format === FLOAT && (bits === 32 || bits === 64);
  if (!ints && !floats) {
    fail('decode', `WAV has ${bits} bits per sample; Ringing reads 8, 16, 24 and 32 bit PCM and 32 and 64 bit float`);
  }

  const bytes = bits >> 3, stride = bytes * count;
  const frames = Math.floor(dataLength / stride);   // a partial frame at the end is dropped
  if (frames === 0) fail('decode', 'WAV holds no audio frames');
  const out = [];
  for (let c = 0; c < count; c++) {
    const data = new Float32Array(frames);
    let at = dataAt + c * bytes;
    for (let i = 0; i < frames; i++, at += stride) data[i] = sample(view, at, format, bits);
    out.push(data);
  }
  return { channels: out, sampleRate };
}

function sample(view, at, format, bits) {
  if (format === FLOAT) return bits === 32 ? view.getFloat32(at, true) : view.getFloat64(at, true);
  switch (bits) {
    case 8: return (view.getUint8(at) - 128) / 128;            // 8-bit WAV is unsigned
    case 16: return view.getInt16(at, true) / 32768;
    case 24: return (view.getUint8(at) | (view.getUint8(at + 1) << 8) | (view.getInt8(at + 2) << 16)) / 8388608;
    default: return view.getInt32(at, true) / 2147483648;
  }
}
