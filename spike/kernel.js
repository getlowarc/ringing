// Spike: the smallest mixer that does what a game voice does. Per voice: read a looping sound at a
// playback rate (linear interpolation), run a lowpass biquad, apply gain and an equal-power pan,
// add into a stereo block. State lives in typed-array columns and render() allocates nothing.
// This is a measurement tool, not the package: it uses Math.sin/cos/tan when setting a voice,
// which Ringing's real core would replace with exact versions.

export class Mixer {
  constructor(maxVoices) {
    const n = maxVoices;
    this.count = 0;
    this.sound = new Array(n).fill(null); // Float32Array, one guard sample appended at the end
    this.pos = new Float64Array(n);
    this.rate = new Float64Array(n);
    this.gl = new Float64Array(n);
    this.gr = new Float64Array(n);
    this.b0 = new Float64Array(n);
    this.b1 = new Float64Array(n);
    this.b2 = new Float64Array(n);
    this.a1 = new Float64Array(n);
    this.a2 = new Float64Array(n);
    this.z1 = new Float64Array(n);
    this.z2 = new Float64Array(n);
  }

  // data: Float32Array whose last element repeats its first, so a looped read never needs a branch.
  add(data, { rate = 1, gain = 1, pan = 0, cutoff = 20000, sampleRate = 48000, start = 0 } = {}) {
    const v = this.count++;
    this.sound[v] = data;
    this.pos[v] = start;
    this.rate[v] = rate;
    const a = (pan + 1) * Math.PI / 4; // equal power: pan -1..1 -> 0..pi/2
    this.gl[v] = gain * Math.cos(a);
    this.gr[v] = gain * Math.sin(a);
    // RBJ lowpass, Q = 1/sqrt(2) (Butterworth).
    const w = 2 * Math.PI * Math.min(cutoff, sampleRate * 0.49) / sampleRate;
    const al = Math.sin(w) / (2 * Math.SQRT1_2), c = Math.cos(w), a0 = 1 + al;
    this.b0[v] = (1 - c) / 2 / a0;
    this.b1[v] = (1 - c) / a0;
    this.b2[v] = (1 - c) / 2 / a0;
    this.a1[v] = -2 * c / a0;
    this.a2[v] = (1 - al) / a0;
    return v;
  }

  render(L, R, n) {
    L.fill(0, 0, n);
    R.fill(0, 0, n);
    for (let v = 0; v < this.count; v++) {
      const d = this.sound[v], len = d.length - 1;
      const rate = this.rate[v], gl = this.gl[v], gr = this.gr[v];
      const b0 = this.b0[v], b1 = this.b1[v], b2 = this.b2[v], a1 = this.a1[v], a2 = this.a2[v];
      let p = this.pos[v], z1 = this.z1[v], z2 = this.z2[v];
      for (let i = 0; i < n; i++) {
        const k = p | 0, f = p - k;
        const s = d[k] + (d[k + 1] - d[k]) * f;
        const y = b0 * s + z1;
        z1 = b1 * s - a1 * y + z2;
        z2 = b2 * s - a2 * y;
        L[i] += y * gl;
        R[i] += y * gr;
        p += rate;
        if (p >= len) p -= len;
      }
      this.pos[v] = p; this.z1[v] = z1; this.z2[v] = z2;
    }
  }
}

// A 2-second looping test sound: a few partials plus a little noise (fixed seed, so every run matches).
export function testSound(sampleRate = 48000, seconds = 2) {
  const len = sampleRate * seconds, d = new Float32Array(len + 1);
  let seed = 12345;
  for (let i = 0; i < len; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const t = i / sampleRate;
    d[i] = 0.3 * Math.sin(2 * Math.PI * 220 * t) + 0.2 * Math.sin(2 * Math.PI * 660 * t) + 0.1 * (seed / 0x7fffffff - 0.5);
  }
  d[len] = d[0];
  return d;
}

// Deterministic per-voice settings so the native graph and the mixer play the same thing.
export function voiceSettings(i) {
  return { rate: 0.5 + ((i * 37) % 100) / 50, gain: 0.2, pan: (((i * 53) % 200) - 100) / 100, cutoff: 800 + ((i * 211) % 8000), start: (i * 4099) % 90000 };
}
