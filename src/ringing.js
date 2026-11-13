// Ringing: the one public entry. The core makes samples and nothing else: it
// never plays them, and it touches no browser or Node API.
// A host calls render() for each block it needs and carries the result to a
// speaker, a file or a stream.

import { fail, readOnly, whole, known, options, show, number, boolean } from './core/check.js';
import { newSounds, Voices, RAMP_TIME, KNEE } from './voices.js';

export { decode } from './decode.js';
export { dbToGain, gainToDb } from './gain.js';
export { RAMP_TIME, KNEE as LIMITER_KNEE };

// The lowest and highest sample rates anything uses. 8,000 Hz is telephone
// audio, the lowest rate a speech codec runs at; 384,000 Hz is the highest rate
// professional audio interfaces offer. A rate outside them is a mistake (a
// frequency in kHz, a value in the wrong field), not a device, so it throws.
export const MIN_SAMPLE_RATE = 8000;
export const MAX_SAMPLE_RATE = 384000;

// The range of pitch: ten octaves each way, 2^-10 to 2^10. Human hearing spans about ten
// octaves (20 Hz to 20 kHz), so a pitch beyond either end moves a sound out of hearing
// altogether; it is almost certainly a mistake (a frequency in Hz given as a rate). It also
// keeps a voice's step through its sound finite, which the mixer's loop wrap relies on.
export const MIN_PITCH = 1 / 1024;
export const MAX_PITCH = 1024;

const OPTIONS = ['sampleRate'];
const SOUND_OPTIONS = ['channels', 'sampleRate'];
const VOICE_OPTIONS = ['sound', 'volume', 'pitch', 'pan', 'loop'];
const CHANGE_OPTIONS = VOICE_OPTIONS;     // what setVoice is given; `sound` is named so it can be refused
const PLAY_OPTIONS = VOICE_OPTIONS.slice(1);

/** Everything an instance holds, reachable from its handles through INSIDE and nowhere else. */
class Inside {
  constructor(sampleRate) {
    this.sampleRate = sampleRate;
    this.frames = 0;
    this.destroyed = false;
    this.sounds = newSounds();
    this.voices = new Voices(sampleRate);
  }
}
const INSIDE = new WeakMap();

function checkRate(caller, value) {
  if (!Number.isInteger(value) || value < MIN_SAMPLE_RATE || value > MAX_SAMPLE_RATE) {
    fail(caller, `sampleRate must be a whole number from ${MIN_SAMPLE_RATE} to ${MAX_SAMPLE_RATE}, got ${show(value)}`);
  }
  return value;
}

/** A handle's slot in `store`, or -1 if it has been removed or has ended. */
function slotOf(caller, name, value, audio, Kind, store) {
  if (!(value instanceof Kind)) fail(caller, `${name} must be a ${Kind.name}, got ${show(value)}`);
  if (value.audio !== audio) fail(caller, `${name} belongs to another Ringing`);
  return store.slots.slotOf(value.id);
}

function alive(inside, caller) {
  if (inside.destroyed) fail(caller, 'this Ringing was destroyed');
}

export class Ringing {
  /**
   * @param {{ sampleRate: number }} options
   */
  constructor(opts) {
    const caller = 'new Ringing';
    const given = options(caller, opts);
    known(caller, given, OPTIONS);
    INSIDE.set(this, new Inside(checkRate(caller, given.sampleRate)));
  }

  /** Frames a second the host plays at. Read only. */
  get sampleRate() { return INSIDE.get(this).sampleRate; }
  set sampleRate(_) { readOnly('sampleRate'); }

  /** Frames rendered so far: the core's own clock. Read only. */
  get frames() { return INSIDE.get(this).frames; }
  set frames(_) { readOnly('frames'); }

  /** Seconds rendered so far, `frames / sampleRate`. Read only. */
  get time() { const i = INSIDE.get(this); return i.frames / i.sampleRate; }
  set time(_) { readOnly('time'); }

  /**
   * Fills the first `frames` samples of `left` and `right` with the next block
   * of sound, and advances the clock by `frames`. With nothing playing it is
   * silence, and costs one fill of each array.
   */
  render(left, right, frames) {
    const caller = 'render';
    const inside = INSIDE.get(this);
    alive(inside, caller);
    if (!(left instanceof Float32Array)) fail(caller, `left must be a Float32Array, got ${show(left)}`);
    if (!(right instanceof Float32Array)) fail(caller, `right must be a Float32Array, got ${show(right)}`);
    whole(caller, 'frames', frames);
    const room = Math.min(left.length, right.length);
    if (frames > room) {
      fail(caller, `frames must be at most ${room}, the length of the shorter of left and right, got ${frames}`);
    }
    left.fill(0, 0, frames);
    right.fill(0, 0, frames);
    // Off means off: with nothing playing, the mixer is never entered.
    if (inside.voices.store.count > 0) inside.voices.mix(inside.sounds, left, right, frames);
    else inside.voices.endedCount = 0;
    inside.frames += frames;
    return this;
  }

  /**
   * Adds a sound: decoded samples, one Float32Array a channel (one for mono, two
   * for stereo), copied, so the caller's arrays can be dropped.
   */
  addSound(opts) {
    const caller = 'addSound';
    const inside = INSIDE.get(this);
    alive(inside, caller);
    const given = options(caller, opts);
    known(caller, given, SOUND_OPTIONS);
    const { channels } = given;
    if (!Array.isArray(channels) || channels.length < 1 || channels.length > 2) {
      fail(caller, `channels must be an array of 1 or 2 Float32Arrays, got ${show(channels)}`);
    }
    channels.forEach((c, i) => {
      if (!(c instanceof Float32Array)) fail(caller, `channels[${i}] must be a Float32Array, got ${show(c)}`);
    });
    const frames = channels[0].length;
    if (channels.length === 2 && channels[1].length !== frames) {
      fail(caller, `channels must all be the same length, got ${frames} and ${channels[1].length}`);
    }
    if (frames < 2) fail(caller, `channels must hold at least 2 frames, got ${frames}`);
    const sampleRate = checkRate(caller, given.sampleRate);

    // Copy and check in one pass, before anything is written. One extra sample on the end
    // repeats the first, so a looped voice blends across the seam with no special case.
    const copies = channels.map((c, ch) => {
      const data = new Float32Array(frames + 1);
      for (let i = 0; i < frames; i++) {
        const v = c[i];
        if (v - v !== 0) fail(caller, `channels[${ch}] must hold finite numbers, got ${v} at frame ${i}`);
        data[i] = v;
      }
      data[frames] = data[0];
      return data;
    });

    const { sounds } = inside;
    const s = sounds.add();
    sounds.frames[s] = frames;
    sounds.rate[s] = sampleRate;
    sounds.channels[s] = copies.length;
    sounds.d0[s] = copies[0];
    sounds.d1[s] = copies.length === 2 ? copies[1] : null;
    sounds.plays[s] = 0;
    sounds.gone[s] = 0;
    return new Sound(this, sounds.slots.id(s));
  }

  /** A copy of a sound's facts, or null if it was removed. */
  soundOf(sound) {
    const caller = 'soundOf';
    const inside = INSIDE.get(this);
    alive(inside, caller);
    const s = slotOf(caller, 'sound', sound, this, Sound, inside.sounds);
    if (s < 0) return null;
    const { frames, rate, channels } = inside.sounds;
    return { sampleRate: rate[s], channels: channels[s], frames: frames[s], duration: frames[s] / rate[s] };
  }

  /** Plays a sound: short for `addVoice({ sound, ...options })`. */
  play(sound, opts) {
    const caller = 'play';
    alive(INSIDE.get(this), caller);
    const given = options(caller, opts);
    known(caller, given, PLAY_OPTIONS);
    return this.#addVoice(caller, sound, given);
  }

  /** Starts a voice: one playing instance of a sound. */
  addVoice(opts) {
    const caller = 'addVoice';
    alive(INSIDE.get(this), caller);
    const given = options(caller, opts);
    known(caller, given, VOICE_OPTIONS);
    return this.#addVoice(caller, given.sound, given);
  }

  #addVoice(caller, sound, given) {
    const inside = INSIDE.get(this);
    const sk = slotOf(caller, 'sound', sound, this, Sound, inside.sounds);
    if (sk < 0) fail(caller, 'sound was removed');
    const volume = given.volume === undefined ? 1 : number(caller, 'volume', given.volume, 0);
    const pitch = given.pitch === undefined ? 1 : number(caller, 'pitch', given.pitch, MIN_PITCH, MAX_PITCH);
    const pan = given.pan === undefined ? 0 : number(caller, 'pan', given.pan, -1, 1);
    const loop = given.loop === undefined ? false : boolean(caller, 'loop', given.loop);
    const { voices, sounds } = inside;
    const v = voices.store.add();
    voices.reserve();
    const { store } = voices;
    store.sound[v] = sk;
    store.pos[v] = 0;
    store.volume[v] = volume;
    store.pitch[v] = pitch;
    store.pan[v] = pan;
    store.loop[v] = loop ? 1 : 0;
    store.step[v] = pitch * sounds.rate[sk] / inside.sampleRate;
    voices.setGains(v, sounds.channels[sk]);
    voices.begin(v);
    sounds.plays[sk]++;
    return new Voice(this, store.slots.id(v));
  }

  /** Changes any of a voice's options except `sound`; what is left out stays. Returns the voice. */
  setVoice(voice, changes) {
    return changeVoice('setVoice', this, voice, changes);
  }

  /** A copy of a voice's options and where it is, or null if it has ended. */
  voiceOf(voice) {
    const caller = 'voiceOf';
    const inside = INSIDE.get(this);
    alive(inside, caller);
    const s = slotOf(caller, 'voice', voice, this, Voice, inside.voices.store);
    if (s < 0) return null;
    const { store } = inside.voices, { sounds } = inside;
    const sk = store.sound[s];
    return {
      sound: new Sound(this, sounds.slots.id(sk)),
      volume: store.volume[s],
      pitch: store.pitch[s],
      pan: store.pan[s],
      loop: store.loop[s] === 1,
      position: store.pos[s] / sounds.rate[sk],
    };
  }

  /**
   * Removes a sound (ending every voice playing it, with no event) or a voice.
   * Removing what is already gone is not an error: a voice ends on its own all the time.
   */
  remove(handle) {
    const caller = 'remove';
    const inside = INSIDE.get(this);
    alive(inside, caller);
    const { sounds, voices } = inside;
    if (handle instanceof Sound) {
      const s = slotOf(caller, 'handle', handle, this, Sound, sounds);
      if (s >= 0) {
        // Its voices fade out, so the samples must outlive the call by a few milliseconds: the
        // handle is dead now, and the memory is freed when the last of those voices has finished.
        voices.stopSound(s);
        sounds.slots.invalidate(s);
        sounds.gone[s] = 1;
        if (sounds.plays[s] === 0) sounds.release(s);
      }
    } else if (handle instanceof Voice) {
      const s = slotOf(caller, 'handle', handle, this, Voice, voices.store);
      if (s >= 0) voices.stop(s);
    } else {
      fail(caller, `handle must be a Sound or a Voice, got ${show(handle)}`);
    }
    sounds.fit();
    voices.fit();
    return undefined;
  }

  /** What happened in the last render, as plain data: `{ type: 'ended', voice }` for each voice that finished. */
  events() {
    const inside = INSIDE.get(this);
    alive(inside, 'events');
    const { voices } = inside, out = [];
    for (let i = 0; i < voices.endedCount; i++) out.push({ type: 'ended', voice: new Voice(this, voices.ended[i]) });
    return out;
  }

  /** Releases everything. Using it afterwards throws, naming the call. */
  destroy() {
    const inside = INSIDE.get(this);
    alive(inside, 'destroy');
    inside.destroyed = true;
    inside.sounds = newSounds();
    inside.voices = new Voices(inside.sampleRate);
    return undefined;
  }
}

/** One decoded sound, held by the Ringing that made it. Made by `audio.addSound`, never directly. */
export class Sound {
  #audio; #id;
  constructor(audio, id) { this.#audio = audio; this.#id = id; }
  /** The Ringing it belongs to. Read only. */
  get audio() { return this.#audio; }
  set audio(_) { readOnly('audio'); }
  /** Its id: a generation and a slot, unique for the life of the instance. Compare by id, not identity. Read only. */
  get id() { return this.#id; }
  set id(_) { readOnly('id'); }
}

/** One playing instance of a sound. Made by `audio.play` or `audio.addVoice`, never directly. */
export class Voice {
  #audio; #id;
  constructor(audio, id) { this.#audio = audio; this.#id = id; }
  /** The Ringing it belongs to. Read only. */
  get audio() { return this.#audio; }
  set audio(_) { readOnly('audio'); }
  /** Its id: a generation and a slot, unique for the life of the instance. Compare by id, not identity. Read only. */
  get id() { return this.#id; }
  set id(_) { readOnly('id'); }
  /** False once the sound finished or the voice was stopped. Read only. */
  get alive() {
    const inside = INSIDE.get(this.#audio);
    return !inside.destroyed && inside.voices.store.slots.slotOf(this.#id) >= 0;
  }
  set alive(_) { readOnly('alive'); }

  setVolume(volume) { return changeVoice('voice.setVolume', this.#audio, this, { volume }); }
  setPitch(pitch) { return changeVoice('voice.setPitch', this.#audio, this, { pitch }); }
  setPan(pan) { return changeVoice('voice.setPan', this.#audio, this, { pan }); }
  setLoop(loop) { return changeVoice('voice.setLoop', this.#audio, this, { loop }); }

  /** Ends the voice. Stopping one that already ended is not an error. */
  stop() {
    this.#audio.remove(this);
    return undefined;
  }
}

/** setVoice and the voice's own setters: check everything, then write, then return the voice. */
function changeVoice(caller, audio, voice, changes) {
  const inside = INSIDE.get(audio);
  alive(inside, caller);
  const own = caller.startsWith('voice.');
  const s = slotOf(caller, own ? 'this voice' : 'voice', voice, audio, Voice, inside.voices.store);
  if (s < 0) fail(caller, own ? 'this voice has ended' : 'voice has ended');
  const given = options(caller, changes, 'changes');
  known(caller, given, CHANGE_OPTIONS);
  if (given.sound !== undefined) fail(caller, 'sound can only be set when the voice is made, by addVoice or play');
  const volume = given.volume === undefined ? undefined : number(caller, 'volume', given.volume, 0);
  const pitch = given.pitch === undefined ? undefined : number(caller, 'pitch', given.pitch, MIN_PITCH, MAX_PITCH);
  const pan = given.pan === undefined ? undefined : number(caller, 'pan', given.pan, -1, 1);
  const loop = given.loop === undefined ? undefined : boolean(caller, 'loop', given.loop);
  const { voices, sounds } = inside, { store } = voices;
  const sk = store.sound[s];
  if (volume !== undefined) store.volume[s] = volume;
  if (pitch !== undefined) {
    store.pitch[s] = pitch;
    store.step[s] = pitch * sounds.rate[sk] / inside.sampleRate;
  }
  if (pan !== undefined) store.pan[s] = pan;
  if (loop !== undefined) store.loop[s] = loop ? 1 : 0;
  if (volume !== undefined || pan !== undefined) {
    voices.setGains(s, sounds.channels[sk]);
    voices.retarget(s);     // the gains slide to their new values, so the change doesn't click
  }
  return voice;
}
