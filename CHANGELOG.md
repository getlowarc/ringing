# Changelog

All notable changes to Ringing are written here. The format follows
[Keep a Changelog](https://keepachangelog.com), and versions follow [Semantic Versioning](https://semver.org)
measured against `docs/API.md`: before 1.0, a breaking change is a minor version.

## [Unreleased]

### Added

- No clicks (milestone 3): a change to a voice's `volume` or `pan` slides over one ramp (7.96 ms,
  `RAMP_TIME`), and `voice.stop()` and `audio.remove` fade out over one. A removed sound's memory
  is freed when its last voice has finished fading.
- A zero-latency master safety limit: samples above `LIMITER_KNEE` (-1 dB) are bent toward 1.0 and
  never go over it; below it, bit for bit.
- Sounds and voices (milestone 2): `audio.addSound`, `audio.soundOf`, `audio.play`, `audio.addVoice`,
  `audio.setVoice`, `audio.voiceOf`, `audio.remove`, `audio.events()`, and the `Voice` setters
  (`setVolume`, `setPitch`, `setPan`, `setLoop`, `stop`). Volume, pitch (linear resampling, with
  sample-rate conversion), pan (equal-power for mono, balance for stereo) and loop.
- `decode(bytes)`: WAV (8, 16, 24 and 32 bit PCM, 32 and 64 bit float, mono and stereo).
- `dbToGain` and `gainToDb`, on the exact `exp` and `log`.
- A mixer that allocates nothing once warm, with every voice ending reported by `events()`.
- `bench/mixer.js`; the stored determinism hash covers a whole mixed scene, on Node and Bun.
- `new Ringing({ sampleRate })`, `audio.render(left, right, frames)` (silence for now), the core's
  clock (`audio.frames`, `audio.time`), `audio.sampleRate` and `audio.destroy()`.
- Exact `sin`, `cos`, `exp` and `log`, the id slots, and the argument checks the rest will use.
- Tests for accuracy, a stored bit hash, the ban on `Math.sin`/`exp`/`log`/`pow` and `**`, ids,
  errors, the docs, platform-free core, no allocation in `render`, and a soak.
