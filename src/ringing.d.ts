/** The lowest sample rate Ringing accepts, in frames a second: telephone audio. */
export const MIN_SAMPLE_RATE: 8000;
/** The highest sample rate Ringing accepts, in frames a second: professional audio interfaces. */
export const MAX_SAMPLE_RATE: 384000;
/** The lowest `pitch` (a playback rate): ten octaves down, 2^-10. */
export const MIN_PITCH: number;
/** The highest `pitch` (a playback rate): ten octaves up, 2^10. */
export const MAX_PITCH: 1024;

/**
 * How long a gain ramp lasts, in seconds: 1 / (2 pi 20), about 7.96 ms. The shortest ramp that is no
 * sharper than the steepest part of a full-scale 20 Hz sine, the lowest note the ear hears.
 */
export const RAMP_TIME: number;
/** Where the master safety limit begins, as a gain: -1 dB below full scale, about 0.891. */
export const LIMITER_KNEE: number;

export interface RingingOptions {
  /** Frames a second the host plays at, a whole number from 8000 to 384000. Required. */
  sampleRate: number;
}

export interface SoundOptions {
  /** One Float32Array for mono, or two of the same length for stereo (left, right). At least 2 frames, all finite. */
  channels: [Float32Array] | [Float32Array, Float32Array];
  /** Frames a second the samples were recorded at, a whole number from 8000 to 384000. */
  sampleRate: number;
}

export interface VoiceChanges {
  /** Linear gain, 0 or more. 1 is full. Default 1. */
  volume?: number;
  /** Playback rate: 1 normal, 2 an octave up. From 1/1024 to 1024. Default 1. */
  pitch?: number;
  /** -1 all left, 1 all right. Default 0. */
  pan?: number;
  /** Play again from the start at the end, with no seam. Default false. */
  loop?: boolean;
}

/** What `play` takes after the sound. */
export type PlayOptions = VoiceChanges;

export interface VoiceOptions extends VoiceChanges {
  /** The sound to play. Required. */
  sound: Sound;
}

export interface SoundInfo {
  sampleRate: number;
  channels: 1 | 2;
  frames: number;
  /** Seconds. */
  duration: number;
}

export interface VoiceInfo {
  sound: Sound;
  volume: number;
  pitch: number;
  pan: number;
  loop: boolean;
  /** How far through its sound the voice is, in seconds of the sound. */
  position: number;
}

export interface EndedEvent {
  type: 'ended';
  voice: Voice;
}

/** Decoded samples, as `decode` returns them and `addSound` takes them. */
export interface Decoded {
  channels: [Float32Array] | [Float32Array, Float32Array];
  sampleRate: number;
}

/** Reads a sound file's bytes (WAV in 0.1) into samples. Needs no instance. */
export function decode(bytes: Uint8Array | ArrayBuffer): Decoded;

/** Decibels to linear gain: 0 dB is 1, -6 dB about 0.5, -Infinity is 0. */
export function dbToGain(db: number): number;
/** Linear gain to decibels: 1 is 0 dB, 0 is -Infinity. */
export function gainToDb(gain: number): number;

export class Ringing {
  constructor(options: RingingOptions);

  /** Frames a second the host plays at. Read only. */
  readonly sampleRate: number;
  /** Frames rendered so far: the core's own clock. Read only. */
  readonly frames: number;
  /** Seconds rendered so far, `frames / sampleRate`. Read only. */
  readonly time: number;

  /**
   * Fills the first `frames` samples of `left` and `right` with the next block of
   * sound and advances the clock by `frames`. Returns the instance, so calls chain.
   */
  render(left: Float32Array, right: Float32Array, frames: number): this;

  /** Adds a sound: decoded samples, copied. */
  addSound(options: SoundOptions): Sound;
  /** A copy of a sound's facts, or null if it was removed. */
  soundOf(sound: Sound): SoundInfo | null;

  /** Plays a sound: short for `addVoice({ sound, ...options })`. */
  play(sound: Sound, options?: PlayOptions): Voice;
  /** Starts a voice: one playing instance of a sound. */
  addVoice(options: VoiceOptions): Voice;
  /** Changes any of a voice's options except `sound`. Returns the voice. */
  setVoice(voice: Voice, changes: VoiceChanges): Voice;
  /** A copy of a voice's options and position, or null if it has ended. */
  voiceOf(voice: Voice): VoiceInfo | null;

  /** Removes a sound (ending its voices) or a voice. Removing what is gone is not an error. */
  remove(handle: Sound | Voice): void;

  /** What happened in the last render, as plain data. */
  events(): EndedEvent[];

  /** Releases everything. Using the instance afterwards throws. */
  destroy(): void;
}

/** One decoded sound, held by the Ringing that made it. Made by `addSound`, never with `new`. */
export class Sound {
  // A private member makes Sound its own type: without it a Voice, which has the same
  // public members, would be accepted wherever a Sound is asked for.
  #private;
  private constructor();
  /** The Ringing it belongs to. Read only. */
  readonly audio: Ringing;
  /** A generation and a slot in one number. Compare by id, not identity. Read only. */
  readonly id: number;
}

/** One playing instance of a sound. Made by `play` or `addVoice`, never with `new`. */
export class Voice {
  #private;
  private constructor();
  /** The Ringing it belongs to. Read only. */
  readonly audio: Ringing;
  /** A generation and a slot in one number. Compare by id, not identity. Read only. */
  readonly id: number;
  /** False once the sound has finished or the voice was stopped. Read only. */
  readonly alive: boolean;

  setVolume(volume: number): this;
  setPitch(pitch: number): this;
  setPan(pan: number): this;
  setLoop(loop: boolean): this;
  /** Ends the voice. Stopping one that already ended is not an error. */
  stop(): void;
}
