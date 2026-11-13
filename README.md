# Ringing

Fast audio in plain JavaScript, for any app, game or service. No dependencies, no build step.

Ringing makes samples and nothing else. It never plays them: no Web Audio, no DOM, no timers, no
Node modules. A host (an `AudioWorklet` in an Electron app, a file writer in a tool, a test) asks it
for blocks of sound and carries them on.

> **Status: early, and not entirely functional.** Ringing is under construction and is not published
> to npm yet. The API will change before 1.0.
>
> **What works today:** decoding WAV files, sounds and voices with volume, pitch, pan and looping,
> click-free gain changes and fades, a master safety limit, and exact, repeatable output (the same
> calls give the same samples on every machine). All of it is covered by tests and documented in
> [docs/API.md](docs/API.md).
>
> **What does not exist yet:** a host. Nothing here can make a speaker play sound until an adapter
> exists (the `AudioWorklet` adapter is planned), so trying it today means writing the glue
> yourself. Also missing: formats other than WAV, buses, filters and effects, positional audio,
> streaming and music, and an engine adapter. The [roadmap](ROADMAP.md) has the full plan.

```js
import { Ringing, decode } from 'ringing-audio';   // not on npm yet: import from src/ringing.js

const audio = new Ringing({ sampleRate: 48000 });
const sound = audio.addSound(decode(wavBytes));     // wavBytes: the file's bytes, however they were loaded
const voice = audio.play(sound, { volume: 0.5, pan: -0.3, loop: true });

const left = new Float32Array(128), right = new Float32Array(128);
audio.render(left, right, 128);                     // the next 128 frames, ready for a speaker
```

That is the whole setup. There is no `init()` to forget, and nothing to connect or dispose.

## Why a core that never plays

Because then it runs anywhere JavaScript does, tests exactly in Node, and gives the same samples on
every machine. Output is a pair of `Float32Array`s that a host can send to a sound card, a file or a
network stream. Rendering is deterministic: nothing in the core calls `Math.sin`, `exp`, `log` or
`pow`, which engines may round differently, and a stored hash of a mixed scene is checked on both
V8 and JavaScriptCore in CI.

## Speed

On a laptop (Intel i7-1260P), `node bench/mixer.js` mixes 800 stereo voices in about 17% of a
128-frame block's time budget (2.667 ms at 48 kHz), with nothing allocated once the code is warm.
`spike/` holds the first measurement, against native Web Audio nodes. More benchmarks come with the
[roadmap](ROADMAP.md).

## Running the tests

```bash
npm test
```

Node 20 or newer. There is nothing to install. The API reference is [docs/API.md](docs/API.md).

## Licence

MIT.
