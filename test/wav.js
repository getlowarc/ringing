// A WAV file built in a test: the tests generate their own assets, so nothing
// binary is checked in. `samples` are per channel; `format` 1 is PCM, 3 float.
export function wav({ channels = [[0]], rate = 48000, bits = 16, format = 1, extensible = false, extra = false, dataSize, trailing = 0 }) {
  const count = channels.length, frames = channels[0].length, bytes = bits >> 3;
  const fmtSize = extensible ? 40 : 16;
  const dataBytes = frames * count * bytes + trailing;
  const total = 12 + (extra ? 8 + 4 : 0) + 8 + fmtSize + 8 + dataBytes;
  const out = new ArrayBuffer(total), v = new DataView(out);
  let at = 0;
  const text = (s) => { for (const ch of s) v.setUint8(at++, ch.charCodeAt(0)); };
  const u16 = (n) => { v.setUint16(at, n, true); at += 2; };
  const u32 = (n) => { v.setUint32(at, n, true); at += 4; };
  text('RIFF'); u32(total - 8); text('WAVE');
  if (extra) { text('LIST'); u32(4); text('abcd'); }          // a chunk to skip
  text('fmt '); u32(fmtSize);
  u16(extensible ? 0xfffe : format); u16(count); u32(rate); u32(rate * count * bytes); u16(count * bytes); u16(bits);
  if (extensible) { u16(22); u16(bits); u32(0); u16(format); at += 14; }
  text('data'); u32(dataSize ?? dataBytes);
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < count; c++) {
      const x = channels[c][i];
      if (format === 3) { if (bits === 32) v.setFloat32(at, x, true); else if (bits === 64) v.setFloat64(at, x, true); }   // other widths: a header only, for the refusal tests
      else if (bits === 8) v.setUint8(at, x + 128);
      else if (bits === 16) v.setInt16(at, x, true);
      else if (bits === 24) { v.setUint8(at, x & 255); v.setUint8(at + 1, (x >> 8) & 255); v.setUint8(at + 2, (x >> 16) & 255); }
      else v.setInt32(at, x, true);
      at += bytes;
    }
  }
  return new Uint8Array(out);
}
