# Ringing roadmap

What Ringing is for, what 1.0 has to be, and the milestones that get it there. When a milestone
finishes, its status changes here in the same commit. When the plan changes, this file changes
first, and the reason goes in the log at the bottom.

Status: ✅ done · 🔨 in progress · ⬜ not started

---

## The goals

Ringing is an audio package you call. It is not a player, an engine or a mixing desk with a window.
1.0 is the point where all of these goals are met and measured.

1. **Professional grade.** What a real game reaches for, built the way production audio is built,
   and held to tests that listen with numbers: levels and pan as computed, no clicks, loops with no
   seam, no clipping when many sounds stack, and the same inputs giving the same samples.
2. **Fast, in plain JavaScript.** No WebAssembly, no build step, no dependencies. Measured against
   Howler.js, Tone.js, Three.js's `PositionalAudio` and Babylon.js's sound engine, in one page, on a
   laptop (Intel i7-1260P, Iris Xe) and a desktop (Ryzen 5 5500).
3. **Out of the way.** Callers say which sound, how loud and where. No `init()`, no bookkeeping,
   no settings to tune for a correct result.
4. **One consistent API.** One way to add, set, read and remove every kind of thing; errors that
   name the call, the option, the rule and the value; one API reference with every call in it;
   units and axes shared with glTF (metres, seconds, Y-up, right-handed).
5. **Any app, game or service.** The core makes samples and nothing else. It never plays, and it
   imports no engine, no browser API and no Node module. A browser game, a server and a tool that
   renders audio to a file are equal users.

### What Ringing never does

- **Play anything in the core.** No Web Audio, no `AudioContext`, no sound card, no `fetch`, no DOM,
  no timers, no workers. Hosts carry samples to speakers (see [Adapters](#part-five-hosts)).
- **Own the loop, the clock, the device or the caller's files.** `audio.render(left, right, frames)`
  renders the frames it is asked for.
- **Depend on anything**, at run time or for its tests, except Node's own modules. CI may fetch
  tools for a check (TypeScript for the types, Bun for determinism, headless Chrome for the
  worklet adapter); the package never needs them.
- **Call `Math.sin`, `cos`, `exp`, `pow` and the rest of the implementation-approximated
  functions**: `test/math.test.js` reads the sources and fails if one appears.

---

## 1.0: what it has to be

### Features

| Area | In 1.0 |
|---|---|
| Core | `new Ringing({ sampleRate })`, `audio.render(left, right, frames)`, the core's own clock in frames and seconds, plain-data events read after a render. |
| Sounds | Decoded samples in memory; decoders for WAV, FLAC and OGG Vorbis; sample rates converted as needed. |
| Voices | Play, stop, volume, pitch (playback rate), pan, loop and loop points, start at an exact frame, handles that never reach a reused slot. |
| Mix | Buses in a tree with volume and mute; voice limits with a stated drop rule; a limiter so stacked sounds don't clip; every change smoothed so nothing clicks. |
| Resampling | Linear by default, a windowed-sinc option, the cost and gain measured. |
| Effects | Biquad filters (lowpass, highpass, bandpass, notch, shelves, peaking), compressor/limiter, ducking, reverb. |
| Positional | Listener and emitters in metres; distance falloff; a small delay and filter model for left/right and front/back; Doppler (off by default); an `occlusion` amount. 2D pan for 2D scenes. |
| Music | Streaming for long tracks, seamless loops, crossfades, layers and stingers for adaptive music, scheduling on exact frames. |
| Variation | Random pitch and volume from a seeded generator; a set of sounds picked at random. |
| Output | Stereo, on a channel layout that 5.1 and 7.1 can join later. |
| Hosts | `AudioWorklet` adapter (Electron and browsers) with a main-thread handle; a WAV and stream writer for services and tools; an engine adapter (camera to listener, nodes to emitters). |
| Data | Offline rendering to a buffer or a file; exact, repeatable output. |

### Correctness, held by tests, with the defaults alone

- A sound placed left is louder in the left channel, by the amount the pan law says.
- A sound at twice the distance is 6 dB quieter, on the inverse distance law.
- A loop has no click at its seam; a start, stop or volume change has no click, at a ramp length
  derived and documented.
- A scheduled voice starts on the exact frame it was asked to.
- Ten explosions in one frame don't clip.
- Each decoder reproduces its reference files bit for bit.
- The same calls give bit-identical samples on V8 (Node) and JavaScriptCore (Bun), checked in CI
  against a stored hash of a rendered scene.
- The soak test passes for every kind of thing that can be added and removed; nothing grows.
- Off means off: every feature not in use costs nothing, counted by a test.
- A game's music costs a few hundred kilobytes, not 69 MB, because long sounds stream.

### Speed

Goals, provisional until milestone 7 measures where Ringing stands. If the numbers show a goal can't
be met, it is reset with those numbers, never quietly.

- Faster than Howler.js, Tone.js, `PositionalAudio` and Babylon.js's sound engine on every benchmark
  scene where they overlap, and the gaps measured, not claimed.
- At least 500 voices mixed within half the block budget (2.667 ms for 128 frames at 48 kHz, half
  of it 1.33 ms) with a lowpass and positional model on each, on the laptop, recorded on the
  desktop too. The spike mixed 800 simple voices in 19.8% of the budget.
- No block slower than the budget in a ten-minute run, and no allocation after construction,
  counted by a test.

Benchmark scenes: voices mixed per block; voices started per block; 100 playing voices' CPU;
memory for a set of sounds; latency from `play` to the first nonzero sample; positional voices;
a music track streaming; package size.

### Ease

- The README's hello world is under 10 lines, and every line is the caller's own decision.
- Every scene in the correctness list runs with no setting changed from its default.
- Every call is in `docs/API.md`, with every error it throws, word for word, and an example a test
  runs.

---

## Milestones

Each one is finished, to the bar below, before the next starts. A milestone with new public API
starts with an API proposal that is approved before code is written; one without starts with a
short design note.

**The bar for every milestone.** Tests that fail without the work. `docs/API.md`, the types, the
README and the CHANGELOG updated in the same change. The errors test, the docs test, the soak, the
math test and the no-platform-API test cover anything new. Determinism holds. Off means off,
tested. Real-time safety (nothing allocates in `render`) holds, tested. Performance measured where
the milestone touches `render`, A/B in one run. No new dependency. CI green on Node 20, 22 and 24
and on the types.

Each milestone names the **concepts** it is built from: the ideas to read up on, in the order the
package needs them. Each is explained in plain words in the docs before the code uses it.

### Part one: making sound

**1. Foundations ✅** *(done 2026-11-12; the math hash is identical on Node 22 and Bun 1.4.4, and the types check passes on TypeScript 7.0.2; the CI workflow is written and its first run is on the push of this commit)*
*Concepts:* what a sample is; sample rate and why 48 kHz; blocks and the real-time budget;
generational handles; struct-of-arrays storage; why floating point can be deterministic in
JavaScript.
`new Ringing({ sampleRate })`, `audio.render(left, right, frames)` (silence), the core clock
(`frames`, `time`), `sampleRate`, `destroy()`; 53-bit generational id slots, the shared check
function and error format, `src/core/math.js` (exact `sin`, `cos`, `exp`, `log`, with
`test/math.test.js` banning the rest), docs, types, soak, the no-platform-API test, and the
real-time test (`render` allocates nothing). The public add/set/read/remove pattern arrives with
the first real kind, in milestone 2 (changed from the original plan, 2026-11-12): there is nothing
real to add or remove yet, so milestone 1 builds the machinery and tests it directly.

**2. Sounds and voices ✅** *(done 2026-11-12)*
*Concepts:* PCM; mono and stereo; the WAV file; interpolation and what pitch change does to a
sample; the gain stage; equal-power panning and balance; why a double returned from a call can be
boxed in code that isn't optimised yet.
`addSound`, `soundOf`, `play`, `addVoice`, `setVoice`, `voiceOf`, `remove`, `events()`, the voice
setters; `decode` (WAV, bit-exact, whole file); `dbToGain` and `gainToDb`; the mixer, built from
`spike/kernel.js` without the filter (milestone 5). API as approved 2026-11-12: linear volume
with dB helpers, `stop` fine on a dead voice and `setVoice` throws, mono pans equal-power and stereo
balances, removing a sound ends its voices, no `setSound`, pitch from 1/1024 to 1024 (ten octaves
each way, the span of hearing). Measured with `bench/mixer.js` against the spike on the same laptop
and run: 800 stereo voices cost 468 us a block (17.5% of the 2,667 us budget), the spike's kernel with
its filter 428 us; about 2,000 to 2,300 voices fit in half the budget up to 800 voices, and 1,600
stereo voices cost 1,414 us (53%), where cache effects start. The determinism hash of a whole
mixed scene is `de6cfe88e7418cc0` on Node 22 and Bun 1.4.4. Deferred as approved: scheduling a voice
to start on an exact frame (milestone 12), `audio.volume` and mute (4), and incremental decoding
(12): `decode` reads the whole file.

**3. No clicks ✅** *(done 2026-11-12)*
*Concepts:* why an abrupt change is audible (a step is a click); ramps; the slowest sound the ear
hears as the measure of a safe ramp; clipping and limiting; soft knees.
Gain changes slide over `RAMP_TIME` = 1 / (2 pi 20) s (about 7.96 ms), derived as the shortest ramp
no sharper than a full-scale 20 Hz sine's steepest step, and tested: a 20 Hz sine put through volume
and pan changes (up, down, repeated inside a ramp), pitch changes, `stop()` and `remove` never steps
by more than twice its own steepest step (a hard cut would step 380 times it). `stop()` and `remove`
fade out, with the handle dead at once and the slot and a removed sound's samples kept until the
fade is done (tested with `arrayBuffers`). A new voice starts at its gains at once, and natural
starts, ends and loop seams are the file's own: Ringing doesn't alter authored audio (loop
crossfades are milestone 12). The master safety limit is a zero-latency soft knee at -1 dB
(`LIMITER_KNEE`): bit-exact below, bent toward 1.0 and never over above, 3 to 1,000 stacked voices
included; a look-ahead compressor/limiter is milestone 5's bus effect. No new calls: two new
constants, `RAMP_TIME` and `LIMITER_KNEE`. The mixer costs the same (800 stereo voices: 475 us a
block, against 468 before), since voices that aren't changing run the same fast loops. The scene
hash changed on purpose, to `48a58d4664938935` on Node 22 and Bun 1.4.4.

### Part two: mixing

**4. Buses and voice limits ⬜**
*Concepts:* a mixing bus and a signal tree; gain staging; voice stealing and priorities.
Buses with volume and mute in a tree, `audio.volume`, `audio.muted`; the voice limit's measured cap
and its drop rule (quietest, then oldest); a muted empty bus does no work.

**5. Filters and effects ⬜**
*Concepts:* the biquad filter (the RBJ cookbook); cutoff and Q; dynamic range compression; ducking
and the sidechain.
Lowpass, highpass, bandpass, notch, shelves and peaking filters on voices and buses; a
compressor/limiter; ducking (music dips while a bus plays). Coefficients from the exact math, not
`Math.sin`.

**6. A better resampler ⬜**
*Concepts:* aliasing and imaging; the sinc function and windowing; why linear interpolation dulls
the highs.
A windowed-sinc resampler as an option. Its cost against linear measured in A/B blocks, and its
audible gain measured on a sweep (the level of what leaks above Nyquist). The default stays
whichever the numbers justify, said plainly.

**7. Benchmark ⬜**
*Concepts:* the real-time budget as a measuring stick; why the worst block matters more than the
average; fair comparison.
`bench/compare.html` in one page, taking turns: Ringing against Howler.js, Tone.js, Three.js's
`PositionalAudio` and Babylon.js's sound engine, on the laptop and the desktop, plugged in and on
battery, recorded in `bench/RESULTS.md`. The provisional speed goals above are reset here with
the numbers. Changes no package code, so it releases nothing by itself.

### Part three: space

**8. The listener and emitters ⬜**
*Concepts:* the inverse distance law; panning laws; inter-aural time and level differences; the
speed of sound.
Listener and emitters in metres; distance falloff; a pan, small delay and filter model for
left/right and front/back; voices following an emitter; 2D pan for 2D scenes.

**9. Doppler and occlusion ⬜**
*Concepts:* the Doppler effect; occlusion as a lowpass.
Doppler from emitter and listener velocity and 343 m/s, off by default; `occlusion` from 0 to 1
(the "why" belongs to the caller, such as a physics engine's raycast, not to Ringing).

### Part four: files and music

**10. FLAC ⬜**
*Concepts:* lossless compression; linear prediction; Rice coding.
An incremental FLAC decoder, bit-exact against the reference files.

**11. OGG Vorbis ⬜**
*Concepts:* lossy compression; the MDCT; windowing and overlap-add; the Ogg container; codebooks.
An incremental Vorbis decoder, checked against reference output; the hardest piece of 1.0, and
measured, since decoding competes for the same budget as mixing.

**12. Streaming and music ⬜**
*Concepts:* streaming and double buffering; seamless loop points; crossfades; adaptive music.
`addStream` from an incremental decoder; the rule that picks stream or decode (derived from
memory); seamless loops; crossfades; layers and stingers; scheduling on exact frames; a test that
a game's music doesn't cost its memory.

**13. Reverb ⬜**
*Concepts:* what a room does to sound; comb and all-pass filters; early reflections.
A reverb built from delay lines, with a documented room model and a measured cost.

**14. Variation ⬜**
Random pitch and volume from a seeded generator; a set of sounds picked at random (footsteps).

### Part five: hosts

**15. Offline rendering and the stream writer ⬜**
*Concepts:* offline against real-time rendering; the WAV format on the way out.
`src/adapters/wav.js`: render a scene to a buffer or a WAV file, and a stream writer for services.
A test renders a scene and compares the hash.

**16. The `AudioWorklet` adapter ⬜**
*Concepts:* the audio thread; message passing; `SharedArrayBuffer`; autoplay locks; device
latency.
`src/adapters/worklet.js`: runs the core in an `AudioWorklet` and gives the main thread the same
API, sending calls across and reading events back. Autoplay unlocking by the rule chosen under
the open questions below. A headless-Chrome check, and a manual check in Electron on real hardware.

**17. The engine adapter ⬜**
Camera to listener and nodes to emitters, once per drawn frame; smoothed moves; the answer to the
time-scale question. Written against plain positions and rotations, so any engine (Three.js,
Babylon.js, PlayCanvas, a 2D canvas) is an equal user, with examples for each.

### Part six: 1.0

**18. The performance pass ⬜**
Direct timers, A/B in blocks, the soak at scale, the ten-minute run with no slow block. Resets or
confirms the speed goals with numbers.

**19. The audit and the API review ⬜**
Everything gone through and made to last: names, errors, docs, types, defaults; the determinism
hash on Bun; the open questions below closed.

### After 1.0

Not promised, in the order they'd come:

- **MP3**, then **Opus** (the hardest decoder).
- **HRTF** for headphones, once a measured dataset with a licence is chosen.
- **5.1 and 7.1** output on the channel layout.
- **Synthesis**: oscillators and envelopes, for generated and adaptive sound.
- **WebAssembly**, only if a measurement shows plain JavaScript can't reach a goal, and only as an
  explicit decision, with the numbers.

---

## Decisions and open questions

Decided:

1. **Volume** is linear gain, with `dbToGain` and `gainToDb` helpers.
2. **Dead voices:** `stop` on a finished voice is not an error; `setVoice` on one throws.

Open, to settle before the API they touch is documented:

3. **Autoplay unlock:** the adapter listens for the first gesture and then removes its listener
   (the leading option).
4. **Time scale:** do sounds follow an engine's time scale (slow motion slows pitch) or play at real
   time? Real time, with an option, is the leading answer.
5. **Doppler:** off by default (the leading answer).

---

## Demos

Demos live in `demo/`, are never published, never imported by `src/`, and never needed by a test.
They are the way to hear what the tests check with numbers. The first is a page that plays a sound
through the `AudioWorklet` adapter and lets the listener move an emitter around. Benchmark
pages print numbers. `serve.js` serves them, since modules don't load over `file://`.

---

## Versions and releases

Ringing is developed in the open and released as it goes: through a run of 0.x versions, to 1.0
once the goals above are met. **There is no rush to 1.0.** Every release, and every publish to npm,
is a deliberate step; this section is the plan, not a schedule.

### Version numbers

`vMAJOR.MINOR.PATCH`, measured against `docs/API.md`:

| Change | Before 1.0 | From 1.0 |
|---|---|---|
| Breaks code written against the API reference | `0.x.0` | `x.0.0` (major) |
| Adds to the API: a call, an option, a feature | `0.x.0` | `1.x.0` (minor) |
| Changes existing code: a bug fix, a speed-up, a docs correction | `0.x.y` | `1.x.y` (patch) |

### Planned versions

Each milestone that adds API is a minor version. Fixes between them are patches. The grouping is
a plan and will move.

| Version | Milestones | What it brings |
|---|---|---|
| 0.1.0 | 1, 2, 3 | Play a sound: handles, WAV, voices, a click-free mixer. |
| 0.2.0 | 4 | Buses, mute, voice limits. |
| 0.3.0 | 5 | Filters, compressor/limiter, ducking. |
| 0.4.0 | 6 | The windowed-sinc resampler (a better sound, not a new API, so a minor only if an option is added). |
| — | 7 | The benchmark changes no package code, so it releases nothing by itself. |
| 0.5.0 | 8, 9 | Positional audio, Doppler, occlusion. |
| 0.6.0 | 10 | FLAC. |
| 0.7.0 | 11 | OGG Vorbis. |
| 0.8.0 | 12 | Streaming and music. |
| 0.9.0 | 13, 14 | Reverb and variation. |
| 0.10.0 | 15 | Offline rendering, the WAV and stream writer. |
| 0.11.0 | 16 | The `AudioWorklet` adapter. |
| 0.12.0 | 17 | The engine adapter. |
| 0.12.x | 18 | The performance pass: reworks, so patches. |
| 1.0.0 | 19 | The API gone through and made to last, the determinism hash on Bun. |

### How a release is made

1. On `develop`, one commit titled `Release x.y.z: <theme>` sets the version in `package.json` and
   moves `## [Unreleased]` in the CHANGELOG under `## [x.y.z] - <date>`, opening with a short
   plain-English paragraph on what it brings.
2. A pull request from `develop` into `main`; `main` takes nothing else.
3. Merging it runs `.github/workflows/release.yml`, which tags `vx.y.z`, writes the GitHub release
   from that CHANGELOG section, and publishes to npm with trusted publishing: no token stored
   anywhere. `.github/release-notes.js` refuses to release a version the CHANGELOG doesn't
   describe.

### Before the first release

- ⬜ `release.yml` and `release-notes.js`, with the step that stops the release while
  `package.json` is still `"private": true`.
- ⬜ `.github/affected.js`: CI runs only the tests a change reaches, with its own test.
- ⬜ A placeholder `ringing-audio` published on npm to claim the name: npm only checks a new name
  for similarity to existing packages at the first publish, so it is claimed while it can still
  change cheaply.
- ⬜ A `main` branch for the release pull request, taking pull requests only; the trusted
  publisher set on npmjs.com (`ringing-audio` → Settings → Trusted publishers → GitHub Actions,
  `getlowarc/ringing`, `release.yml`), which needs the name to exist first.
- ⬜ `package.json` loses `"private": true` at the first release.

---

## Log

- **2026-11-13.** The repository became public, with a README note that it is not yet fully
  functional.
- **2026-11-12 (milestone 3).** Gain changes ramp over 1 / (2 pi 20) s, stops fade out, and a soft
  master limit sits at -1 dB; the scene hash changed on purpose.
- **2026-11-12 (milestone 2).** Built to the approved proposal. Two things learned: V8's unoptimised
  code boxes doubles, so the first renders that end voices allocate (779 KB) until the code is
  optimised, after which it is exactly 0, and the real-time claim is "after warm-up", tested that
  way; and TypeScript treats two classes with the same members as the same type, so `Voice` and
  `Sound` carry a private member to stay distinct.
- **2026-11-12.** Name chosen: Ringing, npm `ringing-audio`; repository `getlowarc/ringing`.
  Direction set: a pure sample-making core, no Web Audio in it, hosts as adapters; own decoders
  (WAV, FLAC, OGG Vorbis in 1.0; MP3 and Opus after); stereo on a channel layout; a positional
  model before HRTF; determinism bit for bit; WebAssembly banned. The spike (`spike/`) measured a
  plain-JS mixer at 66 µs a block for 100 voices and 528 µs for 800 in Node (budget 2,667 µs), and
  3.1x to 5.0x faster than native Web Audio nodes in an offline A/B at 25 to 400 voices.
