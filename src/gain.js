// Gain and decibels. Volume in Ringing is linear gain: 1 is full, 0.5 is half the
// amplitude, 0 is silence. Sound designers think in decibels (dB), where every
// 6 dB is about double or half the amplitude and 0 dB is full. These convert.
// Built on the exact exp and log, so the same bits come out on every machine.

import { fail, show } from './core/check.js';
import { exp, log } from './core/math.js';

// ln 10, the natural log of the base of decibels' logarithm. Amplitude ratio
// to dB is 20 log10(gain), and log10(x) = ln(x) / ln(10).
const LN10 = 2.302585092994046;

/** The gain for `db` decibels: `dbToGain(0)` is 1, `dbToGain(-6)` about 0.5, `dbToGain(-Infinity)` 0. */
export function dbToGain(db) {
  if (typeof db !== 'number' || db !== db || db === Infinity) {
    fail('dbToGain', `db must be a number, got ${show(db)}`);
  }
  return exp(db * LN10 / 20);
}

/** The decibels for `gain`: `gainToDb(1)` is 0, `gainToDb(0.5)` about -6.02, `gainToDb(0)` -Infinity. */
export function gainToDb(gain) {
  if (typeof gain !== 'number' || !(gain >= 0) || gain === Infinity) {
    fail('gainToDb', `gain must be a number from 0, got ${show(gain)}`);
  }
  return 20 * log(gain) / LN10;
}
