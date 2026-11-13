// Every message a public call can throw, word for word, with the call that
// throws it. errors.test.js triggers each one; docs.test.js checks docs/API.md
// lists each one. Add an entry here when a call gains a throw.

import { Ringing, decode, dbToGain, gainToDb } from '../src/ringing.js';
import { wav } from './wav.js';

const ok = () => new Ringing({ sampleRate: 48000 });
const block = () => [new Float32Array(128), new Float32Array(128)];
const dead = () => { const a = ok(); a.destroy(); return a; };
const data = (n = 4) => Float32Array.from({ length: n }, (_, i) => i);
/** An instance with a sound and a voice playing it. */
const rig = () => {
  const audio = ok();
  const sound = audio.addSound({ channels: [data(64)], sampleRate: 48000 });
  return { audio, sound, voice: audio.play(sound) };
};
/** A voice that has ended, and the instance it was in. */
const ended = () => { const r = rig(); r.voice.stop(); return r; };
const other = () => rig();   // handles from a different instance

export const MESSAGES = [
  // new Ringing
  [() => new Ringing(), 'new Ringing: sampleRate must be a whole number from 8000 to 384000, got undefined'],
  [() => new Ringing({ sampleRate: 44.1 }), 'new Ringing: sampleRate must be a whole number from 8000 to 384000, got 44.1'],
  [() => new Ringing({ sampleRat: 48000 }), "new Ringing: unknown option 'sampleRat' (did you mean 'sampleRate'?)"],
  [() => new Ringing(48000), 'new Ringing: options must be an object, got 48000'],

  // render
  [() => ok().render([1, 2, 3], ...block().slice(1), 128), 'render: left must be a Float32Array, got 1,2,3'],
  [() => ok().render(block()[0], {}, 128), 'render: right must be a Float32Array, got an object'],
  [() => ok().render(...block(), 1.5), 'render: frames must be a whole number of at least 0, got 1.5'],
  [() => ok().render(...block(), 129), 'render: frames must be at most 128, the length of the shorter of left and right, got 129'],
  [() => dead().render(...block(), 128), 'render: this Ringing was destroyed'],

  // addSound
  [() => ok().addSound({ channels: 5, sampleRate: 48000 }), 'addSound: channels must be an array of 1 or 2 Float32Arrays, got 5'],
  [() => ok().addSound({ channels: [[1, 2, 3]], sampleRate: 48000 }), 'addSound: channels[0] must be a Float32Array, got 1,2,3'],
  [() => ok().addSound({ channels: [data(4), data(3)], sampleRate: 48000 }), 'addSound: channels must all be the same length, got 4 and 3'],
  [() => ok().addSound({ channels: [data(1)], sampleRate: 48000 }), 'addSound: channels must hold at least 2 frames, got 1'],
  [() => ok().addSound({ channels: [data(4)], sampleRate: 0 }), 'addSound: sampleRate must be a whole number from 8000 to 384000, got 0'],
  [() => ok().addSound({ channels: [Float32Array.of(0, NaN, 1)], sampleRate: 48000 }), 'addSound: channels[0] must hold finite numbers, got NaN at frame 1'],
  [() => ok().addSound({ channel: [data(4)], sampleRate: 48000 }), "addSound: unknown option 'channel' (did you mean 'channels'?)"],
  [() => dead().addSound({ channels: [data(4)], sampleRate: 48000 }), 'addSound: this Ringing was destroyed'],

  // soundOf
  [() => ok().soundOf(5), 'soundOf: sound must be a Sound, got 5'],
  [() => ok().soundOf(other().sound), 'soundOf: sound belongs to another Ringing'],
  [() => dead().soundOf(5), 'soundOf: this Ringing was destroyed'],

  // play
  [() => { const r = rig(); r.audio.play(5); }, 'play: sound must be a Sound, got 5'],
  [() => { const r = rig(); r.audio.play(other().sound); }, 'play: sound belongs to another Ringing'],
  [() => { const r = rig(); r.audio.remove(r.sound); r.audio.play(r.sound); }, 'play: sound was removed'],
  [() => { const r = rig(); r.audio.play(r.sound, { volume: -1 }); }, 'play: volume must be a number from 0, got -1'],
  [() => { const r = rig(); r.audio.play(r.sound, { pitch: 0 }); }, 'play: pitch must be a number from 0.0009765625 to 1024, got 0'],
  [() => { const r = rig(); r.audio.play(r.sound, { pan: 2 }); }, 'play: pan must be a number from -1 to 1, got 2'],
  [() => { const r = rig(); r.audio.play(r.sound, { loop: 1 }); }, 'play: loop must be true or false, got 1'],
  [() => { const r = rig(); r.audio.play(r.sound, { volumn: 1 }); }, "play: unknown option 'volumn' (did you mean 'volume'?)"],
  [() => dead().play(5), 'play: this Ringing was destroyed'],

  // addVoice
  [() => ok().addVoice({}), 'addVoice: sound must be a Sound, got undefined'],
  [() => { const r = rig(); r.audio.addVoice({ sound: r.sound, pitch: 2000 }); }, 'addVoice: pitch must be a number from 0.0009765625 to 1024, got 2000'],
  [() => dead().addVoice({}), 'addVoice: this Ringing was destroyed'],

  // setVoice and the voice's own setters
  [() => ok().setVoice(5, {}), 'setVoice: voice must be a Voice, got 5'],
  [() => { const r = rig(); r.audio.setVoice(other().voice, {}); }, 'setVoice: voice belongs to another Ringing'],
  [() => { const r = ended(); r.audio.setVoice(r.voice, { volume: 1 }); }, 'setVoice: voice has ended'],
  [() => { const r = rig(); r.audio.setVoice(r.voice, 5); }, 'setVoice: changes must be an object, got 5'],
  [() => { const r = rig(); r.audio.setVoice(r.voice, { sound: r.sound }); }, 'setVoice: sound can only be set when the voice is made, by addVoice or play'],
  [() => { const r = rig(); r.audio.setVoice(r.voice, { volume: -1 }); }, 'setVoice: volume must be a number from 0, got -1'],
  [() => { const r = rig(); r.voice.setVolume(-1); }, 'voice.setVolume: volume must be a number from 0, got -1'],
  [() => { const r = rig(); r.voice.setPitch(0); }, 'voice.setPitch: pitch must be a number from 0.0009765625 to 1024, got 0'],
  [() => { const r = rig(); r.voice.setPan(2); }, 'voice.setPan: pan must be a number from -1 to 1, got 2'],
  [() => { const r = rig(); r.voice.setLoop(1); }, 'voice.setLoop: loop must be true or false, got 1'],
  [() => { const r = ended(); r.voice.setVolume(1); }, 'voice.setVolume: this voice has ended'],
  [() => { const r = rig(); r.audio.destroy(); r.voice.setVolume(1); }, 'voice.setVolume: this Ringing was destroyed'],
  [() => dead().setVoice(5, {}), 'setVoice: this Ringing was destroyed'],

  // voiceOf, remove, events, destroy
  [() => ok().voiceOf(5), 'voiceOf: voice must be a Voice, got 5'],
  [() => { const r = rig(); r.audio.voiceOf(other().voice); }, 'voiceOf: voice belongs to another Ringing'],
  [() => dead().voiceOf(5), 'voiceOf: this Ringing was destroyed'],
  [() => ok().remove(5), 'remove: handle must be a Sound or a Voice, got 5'],
  [() => { const r = rig(); r.audio.remove(other().sound); }, 'remove: handle belongs to another Ringing'],
  [() => dead().remove(5), 'remove: this Ringing was destroyed'],
  [() => dead().events(), 'events: this Ringing was destroyed'],
  [() => dead().destroy(), 'destroy: this Ringing was destroyed'],

  // read-only properties
  [() => { ok().sampleRate = 1; }, 'sampleRate is read only'],
  [() => { ok().frames = 1; }, 'frames is read only'],
  [() => { ok().time = 1; }, 'time is read only'],
  [() => { rig().voice.id = 1; }, 'id is read only'],
  [() => { rig().voice.audio = 1; }, 'audio is read only'],
  [() => { rig().voice.alive = true; }, 'alive is read only'],
  [() => { rig().sound.id = 1; }, 'id is read only'],

  // decode and gain
  [() => decode(5), 'decode: bytes must be a Uint8Array or an ArrayBuffer, got 5'],
  [() => decode(new Uint8Array(20)), 'decode: not a WAV file (no RIFF and WAVE header at byte 0)'],
  [() => decode(Uint8Array.of(0x66, 0x4c, 0x61, 0x43, 0, 0)), 'decode: this is FLAC, which Ringing does not read yet; it reads WAV'],
  [() => decode(wav({ channels: [[1], [1], [1]] })), 'decode: WAV has 3 channels; Ringing reads mono and stereo'],
  [() => decode(wav({ channels: [[1]], format: 2 })), 'decode: WAV format 2 is not supported; Ringing reads PCM and float WAV'],
  [() => decode(wav({ channels: [[1]], bits: 8, format: 3 })), 'decode: WAV has 8 bits per sample; Ringing reads 8, 16, 24 and 32 bit PCM and 32 and 64 bit float'],
  [() => decode(wav({ channels: [[]] })), 'decode: WAV holds no audio frames'],
  [() => dbToGain('loud'), "dbToGain: db must be a number, got 'loud'"],
  [() => gainToDb(-1), 'gainToDb: gain must be a number from 0, got -1'],
];
