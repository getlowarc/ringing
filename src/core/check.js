// Checking what comes in, so nothing quietly wrong gets into a mix.
//
// Every option and argument is checked at the call that took it, and a bad one
// throws naming that call, the option, what it must be and what it got:
//
//   play: volume must be a finite number, got NaN
//
// The caller's name is passed in rather than fixed here, so setVoice's errors
// say setVoice: one check serves both calls, and neither borrows the other's
// name. Nothing is checked inside render(). Everything was checked on the way
// in, so a mix that goes wrong points at the mixer, never at a NaN that
// slipped past the door.

/** `caller: message`, or just the message when the call is a property assignment. */
export function fail(caller, message) {
  throw new Error(caller ? `${caller}: ${message}` : message);
}

/**
 * A property you can read but not set. It throws rather than ignoring the
 * write (rule 26): a module is strict and would throw anyway, but a classic
 * script is not, and there the write would vanish without a word.
 */
export function readOnly(name, hint) {
  throw new Error(hint ? `${name} is read only; use ${hint}` : `${name} is read only`);
}

/** How a bad value reads in a message: arrays as 1,NaN,0 (comma-separated), strings quoted. */
export function show(value) {
  if (typeof value === 'string') return `'${value}'`;
  if (typeof value === 'bigint') return `${value}n`;
  if (typeof value === 'function') return 'a function';
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    return value.length === 0 ? 'an empty array' : Array.from(value, (x) => show(x)).join(',');
  }
  if (value !== null && typeof value === 'object') return 'an object';
  return String(value);
}

const isNumber = (x) => typeof x === 'number' && Number.isFinite(x);

/** An array of `n` items, or a typed array: rule 52 takes any array-like, a Float32Array included. */
function arrayOf(value, n) {
  return value !== null && typeof value === 'object' && value.length === n;
}

export function finite(caller, name, value) {
  if (!isNumber(value)) fail(caller, `${name} must be a finite number, got ${show(value)}`);
  return value;
}

export function positive(caller, name, value) {
  if (!isNumber(value) || value <= 0) fail(caller, `${name} must be a positive number, got ${show(value)}`);
  return value;
}

/** A whole number from `min` up: counts of frames and voices. */
export function whole(caller, name, value, min = 0) {
  if (!Number.isInteger(value) || value < min) {
    fail(caller, `${name} must be a whole number of at least ${min}, got ${show(value)}`);
  }
  return value;
}

/** 'lowpass', 'highpass' or 'bandpass', in that phrasing. */
export function oneOf(caller, name, value, choices) {
  if (!choices.includes(value)) {
    const listed = choices.map((c) => `'${c}'`);
    const phrase = listed.length === 1 ? listed[0]
      : `${listed.slice(0, -1).join(', ')} or ${listed[listed.length - 1]}`;
    fail(caller, `${name} must be ${phrase}, got ${show(value)}`);
  }
  return value;
}

const NONE = Object.freeze({});

/** The options object itself. Left out, it is `{}`: every field takes its default. */
export function options(caller, value, name = 'options') {
  if (value === undefined) return NONE;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(caller, `${name} must be an object, got ${show(value)}`);
  }
  return value;
}

/**
 * Throws on any option name not in `names`, suggesting the nearest.
 *
 * A misspelt option that is quietly ignored is a test that quietly tests
 * nothing, so a typo in an option name has to be an error, not a shrug.
 */
export function known(caller, given, names) {
  for (const key of Object.keys(given)) {
    if (names.includes(key)) continue;
    const near = nearest(key, names);
    fail(caller, near
      ? `unknown option '${key}' (did you mean '${near}'?)`
      : `unknown option '${key}' (the options are ${names.join(', ')})`);
  }
}

/**
 * The known name closest to a typo, or null when none is close.
 *
 * Close means an edit distance below half the typed name's length: more of
 * what was typed agrees with the suggestion than disagrees, so it is likelier
 * a slip than a different word. Past that, the message lists every option
 * instead of guessing. Case is ignored, so 'Volume' finds 'volume'. A tie goes to
 * the name listed first, so the same typo always gets the same answer.
 */
export function nearest(typed, names) {
  let best = null, bestDistance = Infinity;
  for (const name of names) {
    const d = distance(typed.toLowerCase(), name.toLowerCase());
    if (d < bestDistance) { best = name; bestDistance = d; }
  }
  return bestDistance < typed.length / 2 ? best : null;
}

/**
 * Edit distance counting a swap of two neighbours as one edit, as well as an
 * insertion, deletion or substitution (Damerau's optimal string alignment).
 * Swaps are the commonest typo, 'volumn' for 'volume', and plain Levenshtein
 * would count one as two.
 */
function distance(a, b) {
  const rows = a.length + 1, cols = b.length + 1;
  const d = new Array(rows * cols);
  for (let i = 0; i < rows; i++) d[i * cols] = i;
  for (let j = 0; j < cols; j++) d[j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[(i - 1) * cols + j] + 1, d[i * cols + j - 1] + 1, d[(i - 1) * cols + j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, d[(i - 2) * cols + j - 2] + 1);
      }
      d[i * cols + j] = v;
    }
  }
  return d[rows * cols - 1];
}

/** A finite number from `min` to `max` (`max` may be Infinity, meaning no upper bound). */
export function number(caller, name, value, min, max = Infinity) {
  if (!isNumber(value) || value < min || value > max) {
    const range = max === Infinity ? `from ${min}` : `from ${min} to ${max}`;
    fail(caller, `${name} must be a number ${range}, got ${show(value)}`);
  }
  return value;
}

export function boolean(caller, name, value) {
  if (value !== true && value !== false) fail(caller, `${name} must be true or false, got ${show(value)}`);
  return value;
}
