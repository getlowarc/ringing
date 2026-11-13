// Voices: every sound that is playing, and the mixer that adds them together.
//
// Mixing in plain words. A sound is a list of numbers (samples), played at some
// rate. To make the next block of output, each voice reads the next few samples
// of its sound, scales them by its volume and pan, and ADDS them into the
// output. Sounds add: two voices playing at once are the sum of both.
//
// A voice's `pos` is where it is in its sound, counted in the sound's own
// frames, and may fall between two: pitch 1.5, or a sound recorded at 24 kHz
// played on a 48 kHz device, steps by a fraction. Reading between two samples is
// linear interpolation: blend them in proportion to how close each is. It is the
// cheapest way to read a fraction and it slightly dulls high frequencies;
// milestone 6 adds a better one and measures the difference.
//
// CLICKS. A click is a sudden jump in the waveform. Changing a voice's gain from
// 1 to 0.5 between two samples is such a jump, so a gain change is spread over a
// short RAMP instead (the gain slides in a straight line to its new value), and
// a stopped voice fades out the same way rather than being cut. Only gains ramp:
// changing pitch moves the voice's position along at a new speed but never makes
// it jump, so the waveform stays continuous and needs no ramp. A voice that is
// not changing runs the plain fast loops below, unchanged from the spike's
// kernel (spike/kernel.js, measured at 800 voices in 19.8% of a block's budget).
//
// SAFETY LIMIT. Many loud voices add past 1.0, which a speaker or a file turns
// into a harsh crack (clipping). After mixing, anything above KNEE is bent
// smoothly toward 1.0 and never goes over it; anything below is left bit for bit.

import { Store } from './core/store.js';
import { cos, sin } from './core/math.js';
import { USED, SLOT_SPAN } from './core/slots.js';
import { dbToGain } from './gain.js';

/**
 * How long a gain ramp lasts: the shortest for which the ramp is no sharper than
 * the lowest note the ear hears. A change of 1.0 in gain over N frames moves 1/N a
 * frame; a full-scale sine of frequency f moves at most 2 pi f / sampleRate a
 * frame, so a ramp of N = sampleRate / (2 pi f) frames is exactly as steep as that
 * sine's steepest part. With f = 20 Hz, the bottom of hearing, that is 1 / (2 pi 20)
 * seconds, about 7.96 ms, whatever the sample rate (382 frames at 48 kHz).
 */
export const RAMP_TIME = 1 / (2 * Math.PI * 20);

/**
 * Where the safety limit begins, as a gain: -1 dB below full scale, the ceiling
 * broadcast loudness standards (EBU R128) allow for peaks. It stays this far from
 * 1.0 so that everything an ordinary mix does is left untouched.
 */
export const KNEE = dbToGain(-1);
const ABOVE_KNEE = 1 - KNEE;

// Stores. A sound's samples are kept as one Float32Array a channel, with one
// extra sample on the end (see addSound) so a looped read never needs a branch.
export function newSounds() {
  return new Store({
    frames: Float64Array,
    rate: Float64Array,
    channels: Uint8Array,
    plays: Int32Array,      // voices playing it, fading out ones included
    gone: Uint8Array,       // 1 once it was removed: freed when its last voice has faded out
  }, ['d0', 'd1']);
}

export class Voices {
  constructor(sampleRate) {
    /** Frames a gain ramp lasts at this sample rate: RAMP_TIME, rounded to a whole frame. */
    this.rampFrames = Math.max(1, Math.round(RAMP_TIME * sampleRate));
    this.store = new Store({
      sound: Int32Array,      // the slot of the sound it plays
      pos: Float64Array,      // where it is in the sound, in the sound's frames
      step: Float64Array,     // frames of the sound per frame of output: pitch * soundRate / sampleRate
      volume: Float64Array,
      pitch: Float64Array,
      pan: Float64Array,
      gl: Float64Array,       // TARGET gain into the left channel, from volume and pan
      gr: Float64Array,       // TARGET gain into the right channel
      cl: Float64Array,       // the gain now: equal to the target unless a ramp is running
      cr: Float64Array,
      dl: Float64Array,       // how much each gain moves a frame while ramping
      dr: Float64Array,
      ramp: Int32Array,       // frames of ramp left; 0 means the gains are at their targets
      dying: Uint8Array,      // fading out after stop(): its handle is dead, its slot is not yet free
      loop: Uint8Array,
    });
    /** Ids of the voices that ended in the last render, in the order they ended. */
    this.ended = new Float64Array(0);
    this.endedCount = 0;
  }

  /** Make room for the events a full table could produce, before render needs it. */
  reserve() {
    if (this.ended.length < this.store.capacity) {
      const bigger = new Float64Array(this.store.capacity);
      bigger.set(this.ended.subarray(0, this.endedCount));
      this.ended = bigger;
    }
  }

  /** Shrinks the table, and the event buffer when no events are waiting. Not for use inside render. */
  fit() {
    this.store.fit();
    if (this.endedCount === 0 && this.ended.length > this.store.capacity) this.ended = new Float64Array(this.store.capacity);
  }

  /**
   * The gains a voice's volume and pan give. A mono sound pans with an
   * equal-power law: as it moves from left to right, the two gains are the cosine
   * and sine of an angle from 0 to a quarter turn, so their squares always add to
   * 1 and the sound's loudness doesn't dip in the middle. A stereo sound keeps
   * its own left and right, so pan is a balance: turning toward one side turns
   * the other side down and leaves the near side alone, as a hi-fi balance knob
   * does. At pan 0 a stereo sound is untouched. These are the TARGETS; `retarget`
   * sets up the ramp that gets there.
   */
  setGains(s, channels) {
    const { volume, pan } = this.store;
    if (channels === 1) {
      const angle = (pan[s] + 1) * QUARTER_TURN / 2;   // pan -1..1 -> 0..a quarter turn
      this.store.gl[s] = volume[s] * cos(angle);
      this.store.gr[s] = volume[s] * sin(angle);
    } else {
      this.store.gl[s] = volume[s] * (pan[s] > 0 ? 1 - pan[s] : 1);
      this.store.gr[s] = volume[s] * (pan[s] < 0 ? 1 + pan[s] : 1);
    }
  }

  /** A new voice starts at its target gains at once: nothing was playing, so there is nothing to click against. */
  begin(s) {
    const st = this.store;
    st.cl[s] = st.gl[s];
    st.cr[s] = st.gr[s];
    st.ramp[s] = 0;
    st.dying[s] = 0;
  }

  /** After setGains: slide from the gains now to the new targets over one ramp. */
  retarget(s) {
    const st = this.store, r = this.rampFrames;
    st.dl[s] = (st.gl[s] - st.cl[s]) / r;
    st.dr[s] = (st.gr[s] - st.cr[s]) / r;
    st.ramp[s] = r;
  }

  /**
   * Stops a voice: its handle is dead at once, and it fades to silence over one ramp and then
   * frees itself, so that being stopped mid-sound doesn't click. No event: it was done on purpose.
   */
  stop(s) {
    const st = this.store, r = this.rampFrames;
    st.slots.invalidate(s);
    st.gl[s] = 0;
    st.gr[s] = 0;
    st.dl[s] = -st.cl[s] / r;
    st.dr[s] = -st.cr[s] / r;
    st.ramp[s] = r;
    st.dying[s] = 1;
  }

  /** Stops every voice playing the sound in slot `sound` (they fade out; the sound is freed after). */
  stopSound(sound) {
    const { slots, sound: of, dying } = this.store;
    for (let s = 0; s < slots.top; s++) if (slots.state[s] === USED && of[s] === sound && dying[s] === 0) this.stop(s);
  }

  /** Frees a voice's slot, and its sound too if the sound was removed and this was its last voice. */
  free(s, sounds) {
    const k = this.store.sound[s];
    this.store.release(s);
    if (--sounds.plays[k] === 0 && sounds.gone[k] === 1) sounds.release(k);
  }

  /** Adds the next `n` frames of every voice into `L` and `R`, then limits the peaks. Allocates nothing. */
  mix(sounds, L, R, n) {
    const store = this.store, slots = store.slots;
    const { sound, pos, step, gl, gr, loop, ramp } = store;
    const { frames, d0, d1 } = sounds;
    this.endedCount = 0;
    for (let s = 0; s < slots.top; s++) {
      if (slots.state[s] !== USED) continue;
      if (ramp[s] > 0) { this.mixRamping(s, sounds, L, R, n); continue; }
      const k = sound[s], len = frames[k], a = d0[k], b = d1[k];
      const st = step[s], l = gl[s], r = gr[s];
      let p = pos[s], i = 0;
      if (loop[s] === 1) {
        // A looped read wraps past the end to the start. The guard sample after the last
        // frame equals the first, so the blend across the seam needs no special case.
        if (b === null) {
          for (; i < n; i++) {
            if (p >= len) { p -= len; while (p >= len) p -= len; }
            const j = p | 0, x = a[j] + (a[j + 1] - a[j]) * (p - j);
            L[i] += x * l; R[i] += x * r;
            p += st;
          }
        } else {
          for (; i < n; i++) {
            if (p >= len) { p -= len; while (p >= len) p -= len; }
            const j = p | 0, f = p - j;
            L[i] += (a[j] + (a[j + 1] - a[j]) * f) * l;
            R[i] += (b[j] + (b[j + 1] - b[j]) * f) * r;
            p += st;
          }
        }
        pos[s] = p;
      } else {
        // A voice that isn't looping ends when its position passes the last frame. In the last
        // interval there is nothing to blend toward, so that frame is held.
        const last = len - 1;
        if (b === null) {
          for (; i < n && p < len; i++) {
            const j = p | 0, x = j < last ? a[j] + (a[j + 1] - a[j]) * (p - j) : a[j];
            L[i] += x * l; R[i] += x * r;
            p += st;
          }
        } else {
          for (; i < n && p < len; i++) {
            const j = p | 0, f = p - j;
            L[i] += (j < last ? a[j] + (a[j + 1] - a[j]) * f : a[j]) * l;
            R[i] += (j < last ? b[j] + (b[j + 1] - b[j]) * f : b[j]) * r;
            p += st;
          }
        }
        if (p >= len) {
          // The id is worked out here, not by slots.id(s): an id past 2^30 is a double, and a double
          // returned from a call can be boxed into a heap object, one per ended voice, in render.
          this.ended[this.endedCount++] = slots.generations[s] * SLOT_SPAN + s;
          this.free(s, sounds);
        } else {
          pos[s] = p;
        }
      }
    }
    limit(L, n);
    limit(R, n);
  }

  /**
   * One voice while its gains are ramping (a volume or pan change, or a fade-out): the same
   * reading as the fast loops, one frame at a time, with the gains moving a step a frame. A ramp
   * lasts a few hundred frames, so this slower path is used for a few milliseconds per change.
   */
  mixRamping(s, sounds, L, R, n) {
    const st = this.store;
    const k = st.sound[s], len = sounds.frames[k], a = sounds.d0[k], b = sounds.d1[k];
    const loop = st.loop[s] === 1, last = len - 1, speed = st.step[s];
    const dl = st.dl[s], dr = st.dr[s], tl = st.gl[s], tr = st.gr[s];
    let p = st.pos[s], cl = st.cl[s], cr = st.cr[s], ramp = st.ramp[s], finished = false;
    for (let i = 0; i < n; i++) {
      if (loop) {
        if (p >= len) { p -= len; while (p >= len) p -= len; }
      } else if (p >= len) {
        finished = true;
        break;
      }
      const j = p | 0, f = p - j;
      const inside = loop || j < last;     // the last frame of a voice that isn't looping is held
      const xa = inside ? a[j] + (a[j + 1] - a[j]) * f : a[j];
      const xb = b === null ? xa : inside ? b[j] + (b[j + 1] - b[j]) * f : b[j];
      L[i] += xa * cl;
      R[i] += xb * cr;
      p += speed;
      if (ramp > 0) {
        cl += dl; cr += dr;
        if (--ramp === 0) { cl = tl; cr = tr; }   // land exactly on the target, with no drift
      }
    }
    if (!loop && p >= len) finished = true;
    if (finished) {
      if (st.dying[s] === 0) this.ended[this.endedCount++] = st.slots.generations[s] * SLOT_SPAN + s;
      this.free(s, sounds);
    } else if (st.dying[s] === 1 && ramp === 0) {
      this.free(s, sounds);                        // faded out: nothing more to play
    } else {
      st.pos[s] = p; st.cl[s] = cl; st.cr[s] = cr; st.ramp[s] = ramp;
    }
  }
}

/** A quarter of a full turn, pi / 2: the angle that takes a pan from one side to the other. */
const QUARTER_TURN = 1.5707963267948966;

/**
 * The safety limit on one channel of a block. Below KNEE a sample is untouched. Above it, with u
 * how far past the knee the sample is (in units of the room left to 1.0), the output is
 *
 *   KNEE + (1 - KNEE) * u / (1 + u)
 *
 * which has the same slope as the straight line at the knee (so there is no corner), climbs ever
 * more slowly, and approaches 1.0 without passing it, however large the input (in a Float32 the
 * result rounds to exactly 1.0 from about 10^5 up). It is written as 1 - 1 / (1 + u), the same
 * number, so an infinite input gives 1.0 and not a NaN.
 */
function limit(out, n) {
  for (let i = 0; i < n; i++) {
    const x = out[i];
    if (x > KNEE) out[i] = KNEE + ABOVE_KNEE * (1 - 1 / (1 + (x - KNEE) / ABOVE_KNEE));
    else if (x < -KNEE) out[i] = -(KNEE + ABOVE_KNEE * (1 - 1 / (1 + (-x - KNEE) / ABOVE_KNEE)));
  }
}
