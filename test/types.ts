// The API reference's examples, type-checked against src/ringing.d.ts. It is
// compiled, never run: `npm run test:types`. Lines marked @ts-expect-error must
// NOT type-check, which is how a loosened declaration gets caught.

import {
  Ringing, Sound, Voice, decode, dbToGain, gainToDb,
  MIN_SAMPLE_RATE, MAX_SAMPLE_RATE, MIN_PITCH, MAX_PITCH, RAMP_TIME, LIMITER_KNEE,
  type SoundInfo, type VoiceInfo, type EndedEvent,
} from '../src/ringing.js';

const audio = new Ringing({ sampleRate: 48000 });
const left = new Float32Array(128), right = new Float32Array(128);
audio.render(left, right, 128);

const rate: number = audio.sampleRate;
const frames: number = audio.frames;
const seconds: number = audio.time;
const chained: Ringing = audio.render(left, right, 0).render(left, right, 0);
const lo: 8000 = MIN_SAMPLE_RATE;
const hi: 384000 = MAX_SAMPLE_RATE;
const pitchLo: number = MIN_PITCH;
const pitchHi: 1024 = MAX_PITCH;
const rampSeconds: number = RAMP_TIME;
const knee: number = LIMITER_KNEE;

// The examples in docs/API.md.
const bytes = new Uint8Array(0);
const decoded = decode(bytes);
const fromFile: Sound = audio.addSound(decoded);
const sound: Sound = audio.addSound({ channels: [Float32Array.of(0, 0.5, 1, 0.5)], sampleRate: 48000 });
const stereo: Sound = audio.addSound({ channels: [left, right], sampleRate: 22050 });
const info: SoundInfo | null = audio.soundOf(sound);
const voice: Voice = audio.play(sound, { volume: 0.5, pan: -0.3, loop: true });
const quiet: Voice = audio.play(sound, { volume: dbToGain(-12) });
const long: Voice = audio.addVoice({ sound, pitch: 2 });
const same: Voice = audio.setVoice(voice, { pitch: 1.5, loop: false });
const where: VoiceInfo | null = audio.voiceOf(voice);
const ok: boolean = voice.alive;
voice.setPitch(1.5).setVolume(0.8).setPan(0).setLoop(true);
const ids: number = voice.id + sound.id;
const owner: Ringing = voice.audio;
audio.render(left, right, 128);
const ended: number[] = [];
for (const e of audio.events()) {
  const event: EndedEvent = e;
  if (event.type === 'ended') ended.push(event.voice.id);
}
const db: number = gainToDb(0.5);
audio.remove(sound);
audio.remove(voice);
voice.stop();
audio.destroy();

// @ts-expect-error sampleRate is required
new Ringing({});
// @ts-expect-error the options object is required
new Ringing();
// @ts-expect-error unknown option
new Ringing({ sampleRate: 48000, volume: 1 });
// @ts-expect-error sampleRate is read only
audio.sampleRate = 1;
// @ts-expect-error frames is read only
audio.frames = 1;
// @ts-expect-error time is read only
audio.time = 1;
// @ts-expect-error render takes Float32Arrays
audio.render([0], [0], 1);
// @ts-expect-error render needs a frame count
audio.render(left, right);
// @ts-expect-error a sound needs its sample rate
audio.addSound({ channels: [left] });
// @ts-expect-error channels are Float32Arrays
audio.addSound({ channels: [[0, 1]], sampleRate: 48000 });
// @ts-expect-error at most two channels
audio.addSound({ channels: [left, right, left], sampleRate: 48000 });
// @ts-expect-error play takes a Sound, not a number
audio.play(5);
// @ts-expect-error volume is a number
audio.play(sound, { volume: 'loud' });
// @ts-expect-error unknown voice option
audio.play(sound, { volumn: 1 });
// @ts-expect-error a voice's sound can't be changed
audio.setVoice(voice, { sound });
// @ts-expect-error addVoice needs a sound
audio.addVoice({ volume: 1 });
// @ts-expect-error alive is read only
voice.alive = true;
// @ts-expect-error id is read only
voice.id = 1;
// @ts-expect-error handles are made by the instance, not with new
new Voice();
// @ts-expect-error a Voice is not a Sound, though it has the same members
const wrong: Sound = voice;
// @ts-expect-error a Sound is not a Voice
audio.setVoice(sound, {});

export {
  rate, frames, seconds, chained, lo, hi, pitchLo, pitchHi, rampSeconds, knee, fromFile, stereo, info, quiet, long, same,
  where, ok, ids, owner, db, wrong,
};
