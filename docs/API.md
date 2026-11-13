# Ringing API reference

Every public call, option and setting in Ringing, with what it throws. Ringing makes samples and
nothing else: it never plays them, and it touches no browser or Node API. A host (an
`AudioWorklet`, a file writer, a test) asks it for blocks of samples and carries them on.

## Conventions

These hold everywhere, so one learned is one learned for good.

- **Sound is numbers.** A *sample* is one number: where the speaker cone should be at one instant.
  Audio is a stream of them, `sampleRate` of them every second (48,000 is usual). A *frame* is one
  sample for each channel at the same instant, so stereo has two samples a frame. Ringing renders
  in *blocks* of frames (a browser's audio thread asks for 128 at a time).
- **Sounds and voices.** A *sound* is decoded samples Ringing holds: a footstep, a music track. It
  never changes once added. A *voice* is one playing instance of a sound, with its own volume,
  pitch, pan and loop. Ten footsteps at once are ten voices of one sound.
- **Mixing** is adding: the output of a block is the sum of every voice's samples, each scaled by
  its volume and pan.
- **No clicks.** A *click* is a sudden jump in the waveform, which the ear hears as a tick. A gain
  that changes between two samples makes one, so Ringing never does that: a change to a voice's
  `volume` or `pan`, and a `stop`, slides the gain in a straight line over one *ramp*, **about 7.96 ms**
  (382 frames at 48 kHz; `RAMP_TIME`). That is the shortest ramp no sharper than the steepest part
  of a full-scale 20 Hz sine, the lowest note the ear hears. A new voice starts at its gains at
  once. `pitch` changes take effect at once and need no ramp: the voice's position moves along at
  a new speed but never jumps, so the waveform stays continuous. Ringing does not alter the audio
  in a file: a sound that starts or ends away from zero clicks because the file does.
- **Safety limit.** Many loud voices add to more than 1.0, which a speaker or a file turns into a
  harsh crack (*clipping*). After mixing, a sample above `LIMITER_KNEE` (-1 dB, about 0.891) is bent
  smoothly toward 1.0 and never goes over it (in the Float32 output it rounds to exactly 1.0 from
  about 100,000 up); a sample below the knee is left bit for bit. It is a soft knee with no
  latency. A look-ahead compressor/limiter, which is transparent and adds a little delay, comes
  later as a bus effect.
- **Units.** Time is in seconds, never milliseconds or frames. Pitch is a playback rate (1 is
  normal, 2 is an octave up). **Volume is linear gain**: 1 is full, 0.5 is half the amplitude, 0 is
  silence; `dbToGain` and `gainToDb` convert from and to decibels.
- **One way to make, change, read and remove.** `addX(options)` makes one and returns a handle,
  `setX(handle, changes)` changes some of its options and leaves the rest, `xOf(handle)` returns a
  **copy** of its options (or `null` if it is gone), and `remove(handle)` removes it. Sounds are
  the one exception: they never change, so there is no `setSound`.
- **Options are one plain object,** every field with a default except where a field says
  *required*. An unknown option throws, and suggests the nearest known name.
- **Handles** hold the instance and an id (a generation and a slot): a finished voice's slot is
  reused, and an old handle never reaches the new voice. Compare handles by `id`, not identity.
- **Events are read, not delivered.** Ringing never calls back from inside `render`; after a
  render, `audio.events()` returns what happened in it.
- **Errors name the call, the option, the rule and what was given:**
  `` `${call}: ${option} must be ${rule}, got ${value}` ``. Bad input throws at the call that took it;
  nothing is checked per sample. Every method of an instance that was destroyed throws
  `<call>: this Ringing was destroyed`.
- **Read-only properties throw if assigned to,** saying so.
- **No global state.** Two instances in one page never affect each other.
- **Same calls, same samples.** The same calls give bit-identical samples on every machine and
  every JavaScript engine. Nothing in Ringing calls `Math.sin`, `exp`, `log` or `pow`, which engines
  may round differently.

## Contents

- [`new Ringing(options)`](#new-ringing)
- [`audio.sampleRate`](#sampleRate), [`audio.frames`](#frames), [`audio.time`](#time)
- [`audio.render(left, right, frames)`](#render)
- [`decode(bytes)`](#decode)
- [`audio.addSound(options)`](#addSound), [`audio.soundOf(sound)`](#soundOf)
- [`audio.play(sound, options)`](#play), [`audio.addVoice(options)`](#addVoice)
- [`audio.setVoice(voice, changes)`](#setVoice), [`audio.voiceOf(voice)`](#voiceOf)
- [`audio.remove(handle)`](#remove)
- [`audio.events()`](#events)
- [`audio.destroy()`](#destroy)
- [Voice](#voice): [`alive`](#voice-alive), [`setVolume`](#voice-setVolume), [`setPitch`](#voice-setPitch), [`setPan`](#voice-setPan), [`setLoop`](#voice-setLoop), [`stop`](#voice-stop)
- [Sound and Voice handles](#handles): [`id`](#handle-id), [`audio`](#handle-audio)
- [`dbToGain(db)`, `gainToDb(gain)`](#gain)
- [Constants](#constants)

## A to Z

[`addSound`](#addSound) · [`addVoice`](#addVoice) · [`alive`](#voice-alive) · [`audio`](#handle-audio) ·
[`dbToGain`](#gain) · [`decode`](#decode) · [`destroy`](#destroy) · [`events`](#events) ·
[`frames`](#frames) · [`gainToDb`](#gain) · [`id`](#handle-id) · [`LIMITER_KNEE`](#constants) · [`MAX_PITCH`](#constants) ·
[`MAX_SAMPLE_RATE`](#constants) · [`MIN_PITCH`](#constants) · [`MIN_SAMPLE_RATE`](#constants) ·
[`new Ringing`](#new-ringing) · [`play`](#play) · [`RAMP_TIME`](#constants) · [`remove`](#remove) · [`render`](#render) ·
[`sampleRate`](#sampleRate) · [`setLoop`](#voice-setLoop) · [`setPan`](#voice-setPan) ·
[`setPitch`](#voice-setPitch) · [`setVoice`](#setVoice) · [`setVolume`](#voice-setVolume) ·
[`soundOf`](#soundOf) · [`stop`](#voice-stop) · [`time`](#time) · [`voiceOf`](#voiceOf)

---

<a id="new-ringing"></a>
### `new Ringing(options)` → `Ringing`

Makes an audio instance. It needs the one thing only the host knows: the sample rate its device
plays at. Everything else is derived from it.

| Option | Default | Meaning |
|---|---|---|
| `sampleRate` | *required* | Frames a second, a whole number from 8000 to 384000. |

**Returns:** the instance.

**Throws:**

- `new Ringing: sampleRate must be a whole number from 8000 to 384000, got undefined`
- `new Ringing: sampleRate must be a whole number from 8000 to 384000, got 44.1`
- `new Ringing: unknown option 'sampleRat' (did you mean 'sampleRate'?)`
- `new Ringing: options must be an object, got 48000`

**Example:**

```js
import { Ringing } from 'ringing-audio';

const audio = new Ringing({ sampleRate: 48000 });
```

**Notes:** the limits are the lowest and highest rates anything uses (telephone audio, and
professional interfaces). A rate outside them is almost always a mistake, such as `44.1`.

<a id="sampleRate"></a>
### `audio.sampleRate` → `number`

Frames a second, as given to the constructor. Read only.

**Throws:** `sampleRate is read only`

<a id="frames"></a>
### `audio.frames` → `number`

Frames rendered so far: the core's own clock. It starts at 0 and `render` advances it. Read only.

**Throws:** `frames is read only`

<a id="time"></a>
### `audio.time` → `number`

Seconds rendered so far, `frames / sampleRate`. Read only.

**Throws:** `time is read only`

**Notes:** this is the core's clock, not the host's. A host maps one to the other.

<a id="render"></a>
### `audio.render(left, right, frames)` → `Ringing`

Fills the first `frames` samples of `left` and `right` with the next block of sound, and advances
the clock by `frames`. With nothing playing the block is silence, and the call costs one fill of
each array. It allocates nothing.

| Argument | Meaning |
|---|---|
| `left` | A `Float32Array` for the left channel, at least `frames` long. |
| `right` | A `Float32Array` for the right channel, at least `frames` long. |
| `frames` | How many frames to render, a whole number from 0. |

**Returns:** the instance, so calls chain.

**Throws:**

- `render: left must be a Float32Array, got 1,2,3`
- `render: right must be a Float32Array, got an object`
- `render: frames must be a whole number of at least 0, got 1.5`
- `render: frames must be at most 128, the length of the shorter of left and right, got 129`
- `render: this Ringing was destroyed`

**Example:**

```js
const left = new Float32Array(128), right = new Float32Array(128);
audio.render(left, right, 128);   // audio.frames is now 128
```

**Notes:** samples past `frames` are left as they were. Everything is checked here, at the call,
and nothing per sample. A voice that ends part-way through the block contributes up to the frame
where it ends, and the voice is reported by [`events()`](#events).

<a id="decode"></a>
### `decode(bytes)` → `{ channels, sampleRate }`

Reads a sound file's bytes into samples. A plain function (not a method of an instance) because it
needs no instance. The result is what [`audio.addSound`](#addSound) takes. Version 0.1 reads WAV:
8, 16, 24 and 32 bit PCM and 32 and 64 bit float, mono or stereo, including
`WAVE_FORMAT_EXTENSIBLE`. Samples are converted exactly, to the range -1 to 1.

| Argument | Meaning |
|---|---|
| `bytes` | The whole file, as a `Uint8Array` (or any view of bytes) or an `ArrayBuffer`. |

**Returns:** `{ channels: Float32Array[], sampleRate: number }`.

**Throws:**

- `decode: bytes must be a Uint8Array or an ArrayBuffer, got 5`
- `decode: not a WAV file (no RIFF and WAVE header at byte 0)`
- `decode: this is FLAC, which Ringing does not read yet; it reads WAV`
- `decode: WAV has 3 channels; Ringing reads mono and stereo`
- `decode: WAV format 2 is not supported; Ringing reads PCM and float WAV`
- `decode: WAV has 8 bits per sample; Ringing reads 8, 16, 24 and 32 bit PCM and 32 and 64 bit float`
- `decode: WAV holds no audio frames`

**Example:**

```js
const bytes = new Uint8Array(await (await fetch('step.wav')).arrayBuffer());
const sound = audio.addSound(decode(bytes));
```

**Notes:** the same message form is used for Ogg and MP3 (`this is Ogg, which Ringing does not read
yet; it reads WAV`). A WAV whose data size is left as 0xFFFFFFFF by a streaming writer, or that was
cut short, reads what is there; a partial frame at the end is dropped. Loading the file is the
host's job: Ringing never fetches.

<a id="addSound"></a>
### `audio.addSound(options)` → `Sound`

Adds a sound: decoded samples Ringing holds from now on. They are **copied**, so the arrays passed
in can be dropped. A sound never changes (there is no `setSound`).

| Option | Default | Meaning |
|---|---|---|
| `channels` | *required* | One `Float32Array` for mono, or two of the same length for stereo (left, right). At least 2 frames, all finite. |
| `sampleRate` | *required* | Frames a second the samples were recorded at, a whole number from 8000 to 384000. It is converted to the instance's rate on playback. |

**Returns:** a [`Sound`](#handles).

**Throws:**

- `addSound: channels must be an array of 1 or 2 Float32Arrays, got 5`
- `addSound: channels[0] must be a Float32Array, got 1,2,3`
- `addSound: channels must all be the same length, got 4 and 3`
- `addSound: channels must hold at least 2 frames, got 1`
- `addSound: sampleRate must be a whole number from 8000 to 384000, got 0`
- `addSound: channels[0] must hold finite numbers, got NaN at frame 1`
- `addSound: unknown option 'channel' (did you mean 'channels'?)`
- `addSound: this Ringing was destroyed`

**Example:**

```js
const sound = audio.addSound({ channels: [Float32Array.of(0, 0.5, 1, 0.5)], sampleRate: 48000 });
```

**Notes:** a NaN reaching the mix can ruin everything, so every sample is checked once, here.

<a id="soundOf"></a>
### `audio.soundOf(sound)` → `{ sampleRate, channels, frames, duration }` or `null`

A copy of a sound's facts: its sample rate, channel count (1 or 2), length in frames, and duration in
seconds. `null` if the sound was removed.

**Throws:**

- `soundOf: sound must be a Sound, got 5`
- `soundOf: sound belongs to another Ringing`
- `soundOf: this Ringing was destroyed`

<a id="play"></a>
### `audio.play(sound, options)` → `Voice`

Plays a sound: short for `addVoice({ sound, ...options })`. `audio.play(sound)` plays it once, at
full volume, from the centre.

| Option | Default | Meaning |
|---|---|---|
| `volume` | `1` | Linear gain, 0 or more. 1 is full, 0.5 is half the amplitude. |
| `pitch` | `1` | Playback rate: 1 normal, 2 an octave up, 0.5 an octave down. From 1/1024 to 1024. |
| `pan` | `0` | -1 is all left, 1 is all right, 0 the centre. |
| `loop` | `false` | Play again from the start when the end is reached, with no seam. |

**Returns:** a [`Voice`](#voice).

**Throws:**

- `play: sound must be a Sound, got 5`
- `play: sound belongs to another Ringing`
- `play: sound was removed`
- `play: volume must be a number from 0, got -1`
- `play: pitch must be a number from 0.0009765625 to 1024, got 0`
- `play: pan must be a number from -1 to 1, got 2`
- `play: loop must be true or false, got 1`
- `play: unknown option 'volumn' (did you mean 'volume'?)`
- `play: this Ringing was destroyed`

**Example:**

```js
const voice = audio.play(sound, { volume: 0.5, pan: -0.3, loop: true });
```

**Notes:** a **mono** sound pans with an *equal-power* law, so its loudness doesn't dip in the middle.
A **stereo** sound keeps its own left and right, so `pan` is a *balance*: toward one side the far
side is turned down and the near side is left alone, and at 0 it is untouched. Pitch also converts
between the sound's rate and the instance's, so a 24 kHz sound on a 48 kHz instance plays at the
right speed. The range of pitch is ten octaves each way, the span of human hearing; beyond it a
sound is out of hearing anyway. Reading between two samples is linear interpolation. A voice that
isn't looping ends when its position passes the last frame.

<a id="addVoice"></a>
### `audio.addVoice(options)` → `Voice`

The long form of [`play`](#play). `sound` is required; the rest are as `play`'s options.

| Option | Default | Meaning |
|---|---|---|
| `sound` | *required* | The [`Sound`](#handles) to play. |
| `volume`, `pitch`, `pan`, `loop` | as `play` | See [`play`](#play). |

**Throws:** as `play`, with `addVoice:` as the call, plus
`addVoice: sound must be a Sound, got undefined` and
`addVoice: pitch must be a number from 0.0009765625 to 1024, got 2000`, and
`addVoice: this Ringing was destroyed`.

<a id="setVoice"></a>
### `audio.setVoice(voice, changes)` → `Voice`

Changes any of a voice's options except `sound`, and leaves the rest. Everything is checked before
anything is written. The same changes can be made with the voice's own setters.

| Option | Meaning |
|---|---|
| `volume`, `pitch`, `pan`, `loop` | As [`play`](#play). |
| `sound` | **Not allowed**: a voice's sound is set only when it is made. |

**Returns:** the voice, so calls chain.

**Throws:**

- `setVoice: voice must be a Voice, got 5`
- `setVoice: voice belongs to another Ringing`
- `setVoice: voice has ended`
- `setVoice: changes must be an object, got 5`
- `setVoice: sound can only be set when the voice is made, by addVoice or play`
- `setVoice: volume must be a number from 0, got -1`
- `setVoice: this Ringing was destroyed`

**Notes:** `setVoice` on a finished voice throws, but stopping one does not (see [`remove`](#remove)):
a voice ends on its own all the time, so `stop` can't be an error, while changing a dead voice
means the caller lost track of it. A change to `volume` or `pan` slides in over one ramp
(about 7.96 ms), so it doesn't click; changing it again before the ramp ends slides from wherever
the gain has got to. `pitch` and `loop` take effect at once. The voice's `voiceOf` options show the
new values immediately, though the sound reaches them a few milliseconds later.

<a id="voiceOf"></a>
### `audio.voiceOf(voice)` → `{ sound, volume, pitch, pan, loop, position }` or `null`

A copy of a voice's options, with `sound` as a [`Sound`](#handles) and `position`, how far through
its sound the voice is, in seconds of the sound. `null` if the voice has ended.

**Throws:**

- `voiceOf: voice must be a Voice, got 5`
- `voiceOf: voice belongs to another Ringing`
- `voiceOf: this Ringing was destroyed`

<a id="remove"></a>
### `audio.remove(handle)`

Removes a sound or a voice. Removing a **voice** stops it: its handle is dead at once, and its sound
fades out over one ramp (about 7.96 ms) so it doesn't click, then it frees itself. Removing a
**sound** stops every voice playing it the same way (with no event, since it was done on purpose);
the sound's handle is dead at once, and its memory is freed when the last of those voices has
finished fading, within one ramp of the next `render`. Removing what is already gone is not an
error.

**Throws:**

- `remove: handle must be a Sound or a Voice, got 5`
- `remove: handle belongs to another Ringing`
- `remove: this Ringing was destroyed`

<a id="events"></a>
### `audio.events()` → `{ type, voice }[]`

What happened in the last [`render`](#render), as plain data, oldest first. Today there is one kind:
`{ type: 'ended', voice }`, for each voice that reached the end of its sound. It describes only the
last render: the next `render` replaces it. Voices stopped by hand or ended by `remove` are not
events.

**Throws:** `events: this Ringing was destroyed`

**Example:**

```js
audio.render(left, right, 128);
for (const e of audio.events()) if (e.type === 'ended') console.log('finished', e.voice.id);
```

<a id="destroy"></a>
### `audio.destroy()`

Releases everything the instance holds. Using it afterwards throws, naming the call.

**Throws:** `destroy: this Ringing was destroyed` (when it was already destroyed).

**Notes:** reading `sampleRate`, `frames` and `time` still works after `destroy`, since they are
plain data, and `voice.alive` is `false`.

<a id="voice"></a>
### `Voice`

One playing instance of a sound, made by [`play`](#play) or [`addVoice`](#addVoice), never with `new`.

<a id="voice-alive"></a>
#### `voice.alive` → `boolean`

False once the sound has finished or the voice was stopped. Read only.

**Throws:** `alive is read only`

<a id="voice-setVolume"></a>
#### `voice.setVolume(volume)` → `Voice`

<a id="voice-setPitch"></a>
#### `voice.setPitch(pitch)` → `Voice`

<a id="voice-setPan"></a>
#### `voice.setPan(pan)` → `Voice`

<a id="voice-setLoop"></a>
#### `voice.setLoop(loop)` → `Voice`

Each changes one option, as [`setVoice`](#setVoice) does, and returns the voice so calls chain:
`voice.setPitch(1.5).setVolume(0.8)`.

**Throws:**

- `voice.setVolume: volume must be a number from 0, got -1`
- `voice.setPitch: pitch must be a number from 0.0009765625 to 1024, got 0`
- `voice.setPan: pan must be a number from -1 to 1, got 2`
- `voice.setLoop: loop must be true or false, got 1`
- `voice.setVolume: this voice has ended`
- `voice.setVolume: this Ringing was destroyed`

(`setPitch`, `setPan` and `setLoop` throw the same two last messages under their own names.)

<a id="voice-stop"></a>
#### `voice.stop()`

Ends the voice: `voice.alive` is `false` at once, and the sound fades out over one ramp (about 7.96 ms)
so it doesn't click. Stopping one that already ended is not an error. No `'ended'` event: it was
done on purpose.

<a id="handles"></a>
### `Sound` and `Voice` handles

A handle holds the instance and an id, and its state lives in the instance's tables, so a handle is
cheap to keep and never keeps a sound's samples alive.

<a id="handle-id"></a>
#### `sound.id`, `voice.id` → `number`

A generation and a slot in one whole number, unique for the life of the instance: a finished voice's
slot is reused under the next generation, so an old id never matches the new voice. Compare handles
by `id`, not identity. Read only.

**Throws:** `id is read only`

<a id="handle-audio"></a>
#### `sound.audio`, `voice.audio` → `Ringing`

The instance the handle belongs to. Read only.

**Throws:** `audio is read only`

<a id="gain"></a>
### `dbToGain(db)` → `number`, `gainToDb(gain)` → `number`

Convert between decibels and linear gain. Every 6 dB is about double or half the amplitude; 0 dB is
a gain of 1. `dbToGain(-Infinity)` is 0, and `gainToDb(0)` is `-Infinity`. Built on Ringing's own
exact `exp` and `log`, so the same bits come out on every machine.

**Throws:**

- `dbToGain: db must be a number, got 'loud'`
- `gainToDb: gain must be a number from 0, got -1`

**Example:**

```js
audio.play(sound, { volume: dbToGain(-12) });   // 12 dB quieter
```

<a id="constants"></a>
### Constants

`MIN_SAMPLE_RATE` (8000) and `MAX_SAMPLE_RATE` (384000), the limits of `sampleRate`; `MIN_PITCH`
(1/1024) and `MAX_PITCH` (1024), the limits of `pitch`; `RAMP_TIME` (1 / (2 pi 20) seconds, about
0.00796), how long a gain ramp lasts at any sample rate; and `LIMITER_KNEE` (`dbToGain(-1)`, about
0.891), where the safety limit begins. All exported from `ringing-audio`.
