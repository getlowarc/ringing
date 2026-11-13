// Sine, cosine, exp and log that give the same bits on every machine.
//
// Ringing promises that the same calls give bit-identical samples on every
// CPU, browser and runtime. JavaScript makes most of that free: it forbids
// fused multiply-add and extended precision, so + - * / and Math.sqrt round
// the same everywhere. The functions the spec calls "implementation-approximated"
// are the exception: Math.sin, cos, exp, log, pow and the rest may differ in the
// last bit between V8, SpiderMonkey and JavaScriptCore, and one differing bit in
// a filter coefficient is a different waveform on another machine. Nothing in
// the core may call them (test/math.test.js reads the sources and checks).
//
// So these use only exactly-rounded operations, in fdlibm's method.
//
// sin and cos reduce x by the nearest multiple of pi/2, with pi/2 split into
// three 33-bit parts so each product with the multiple is exact, then evaluate
// fdlibm's minimax polynomials for sine and cosine on [-pi/4, pi/4]. They agree
// with a correctly rounded result to about one unit in the last place while
// |x| < 2^19 * pi/2 (823,550 radians), where the multiple times the first part
// is still exact. Past that they lose accuracy, but never determinism. Audio
// never gets near it: a filter or a pan angle is a few radians.
//
// exp and log are fdlibm's e_exp.c and e_log.c: argument reduction by ln 2
// (kept in two parts, again so the product with the integer is exact), then a
// minimax polynomial. Within 1 ulp of correctly rounded. Their scalings by
// powers of two are made by writing exponent bits with a DataView, which is
// exact and has no byte-order dependence (the byte order is named).
//
// The polynomial coefficients and splits of pi/2 and ln 2 are fdlibm's:
//   Copyright (C) 1993 by Sun Microsystems, Inc. All rights reserved.
//   Developed at SunSoft, a Sun Microsystems, Inc. business.
//   Permission to use, copy, modify, and distribute this software is freely
//   granted, provided that this notice is preserved.

const INV_PIO2 = 6.36619772367581382433e-01;   // 2 / pi
const PIO2_1 = 1.57079632673412561417e+00;     // first 33 bits of pi/2
const PIO2_1T = 6.07710050650619224932e-11;    // pi/2 - PIO2_1
const PIO2_2 = 6.07710050630396597660e-11;     // second 33 bits
const PIO2_2T = 2.02226624879595063154e-21;    // pi/2 - (PIO2_1 + PIO2_2)
const PIO2_3 = 2.02226624871116645580e-21;     // third 33 bits
const PIO2_3T = 8.47842766036889956997e-32;    // pi/2 - (PIO2_1 + PIO2_2 + PIO2_3)

// When to take the second and third rounds of reduction. fdlibm takes them when
// the first result's exponent is more than 16, then 49, below x's: that many
// bits cancelled, and the next 33 bits of pi/2 are needed. Comparing magnitudes
// is the same test without reading exponent bits, to within a factor of 2 in
// where it cuts over. The second round is set to cut over early, which only
// adds accuracy; the third is set late, because it drops the second's rounding
// error, which is zero only once the cancellation is that deep.
const ROUND_2 = 3.0517578125e-05;       // 2^-15
const ROUND_3 = 8.881784197001252e-16;  // 2^-50

const S1 = -1.66666666666666324348e-01, S2 = 8.33333333332248946124e-03;
const S3 = -1.98412698298579493134e-04, S4 = 2.75573137070700676789e-06;
const S5 = -2.50507602534068634195e-08, S6 = 1.58969099521155010221e-10;

const C1 = 4.16666666666666019037e-02, C2 = -1.38888888888741095749e-03;
const C3 = 2.48015872894767294178e-05, C4 = -2.75573143513906633035e-07;
const C5 = 2.08757232129817482790e-09, C6 = -1.13596475577881948265e-11;

// The reduced argument, as a head and a tail: x - n pi/2 = head + tail.
// Module scratch: nothing here is re-entered.
let head = 0, tail = 0;

/** Sets head and tail, and returns n, the multiple of pi/2 taken off. */
function reduce(x) {
  const n = Math.round(x * INV_PIO2);
  // fdlibm's __ieee754_rem_pio2, medium case: each round takes off the next
  // 33 bits of n pi/2 (n times 33 bits is exact for |n| < 2^20) and keeps what
  // the subtraction rounded away in w.
  let r = x - n * PIO2_1;
  let w = n * PIO2_1T;
  head = r - w;
  const limit = Math.abs(x);
  if (Math.abs(head) < limit * ROUND_2) {
    let t = r;
    w = n * PIO2_2;
    r = t - w;
    w = n * PIO2_2T - ((t - r) - w);
    head = r - w;
    if (Math.abs(head) < limit * ROUND_3) {
      t = r;
      w = n * PIO2_3;
      r = t - w;
      w = n * PIO2_3T - ((t - r) - w);
      head = r - w;
    }
  }
  tail = (r - head) - w;
  return n;
}

/** sin(x + y) for |x + y| <= pi/4, y the tail of x. */
function kernelSin(x, y) {
  const z = x * x, v = z * x;
  const r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
  return x - ((z * (0.5 * y - v * r) - y) - v * S1);
}

/** cos(x + y) for |x + y| <= pi/4. */
function kernelCos(x, y) {
  const z = x * x;
  const r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
  const hz = 0.5 * z, w = 1 - hz;
  return w + (((1 - w) - hz) + (z * r - x * y));
}

export function sin(x) {
  const n = reduce(x);
  switch (n & 3) {
    case 0: return kernelSin(head, tail);
    case 1: return kernelCos(head, tail);
    case 2: return -kernelSin(head, tail);
    default: return -kernelCos(head, tail);
  }
}

export function cos(x) {
  const n = reduce(x);
  switch (n & 3) {
    case 0: return kernelCos(head, tail);
    case 1: return -kernelSin(head, tail);
    case 2: return -kernelCos(head, tail);
    default: return kernelSin(head, tail);
  }
}

// ---------------------------------------------------------------------------
// exp and log

// A double's two 32-bit words, read and written by name instead of by the
// machine's byte order: DataView says big-endian, so the high word (sign,
// exponent and the top 20 bits of the fraction) is always at offset 0.
const bits = new DataView(new ArrayBuffer(8));
const BIG = false; // getUint32(offset, littleEndian): false = big-endian

/** The high word of x. */
const high = (x) => { bits.setFloat64(0, x); return bits.getUint32(0, BIG); };

/** 2^k exactly, for k from -1022 to 1023: the exponent field, written directly. */
function exp2(k) {
  bits.setUint32(0, (k + 1023) << 20, BIG);
  bits.setUint32(4, 0, BIG);
  return bits.getFloat64(0);
}

const LN2_HI = 6.93147180369123816490e-01;  // first 32 bits of ln 2 (so n * LN2_HI is exact for |n| < 2^20)
const LN2_LO = 1.90821492927058770002e-10;  // ln 2 - LN2_HI
const INV_LN2 = 1.44269504088896338700e+00; // 1 / ln 2
const EXP_P1 = 1.66666666666666019037e-01, EXP_P2 = -2.77777777770155933842e-03;
const EXP_P3 = 6.61375632143793436117e-05, EXP_P4 = -1.65339022054652515390e-06;
const EXP_P5 = 4.13813679705723846039e-08;
const EXP_OVERFLOW = 7.09782712893383973096e+02;    // above this exp(x) is Infinity
const EXP_UNDERFLOW = -7.45133219101941108420e+02;  // below this exp(x) is 0
const TWO_M28 = 3.725290298461914e-09;              // 2^-28: below this, exp(x) = 1 + x

export function exp(x) {
  if (x !== x) return x;
  if (x > EXP_OVERFLOW) return Infinity;
  if (x < EXP_UNDERFLOW) return 0;
  const ax = Math.abs(x);
  let hi = 0, lo = 0, k = 0;
  if (ax > 0.5 * 0.6931471805599453) {            // |x| > 0.5 ln 2: reduce
    if (ax < 1.5 * 0.6931471805599453) {          // |x| < 1.5 ln 2: k is 1 or -1
      k = x < 0 ? -1 : 1;
      hi = x - k * LN2_HI;
      lo = k * LN2_LO;
    } else {
      k = Math.trunc(INV_LN2 * x + (x < 0 ? -0.5 : 0.5));
      hi = x - k * LN2_HI;
      lo = k * LN2_LO;
    }
    x = hi - lo;
  } else if (ax < TWO_M28) {
    return 1 + x;
  }
  const t = x * x;
  const c = x - t * (EXP_P1 + t * (EXP_P2 + t * (EXP_P3 + t * (EXP_P4 + t * EXP_P5))));
  if (k === 0) return 1 - ((x * c) / (c - 2) - x);
  const y = 1 - ((lo - (x * c) / (2 - c)) - hi);
  // Scale by 2^k. Below 2^-1021 the result is subnormal, so scale in two exact
  // steps and round once at the end, as fdlibm does.
  if (k >= -1021) return k === 1024 ? y * 2 * exp2(1023) : y * exp2(k);
  return y * exp2(k + 1000) * 9.332636185032189e-302; // 2^-1000
}

const TWO_54 = 1.8014398509481984e+16;
const LG1 = 6.666666666666735130e-01, LG2 = 3.999999999940941908e-01;
const LG3 = 2.857142874366239149e-01, LG4 = 2.222219843214978396e-01;
const LG5 = 1.818357216161805012e-01, LG6 = 1.531383769920937332e-01;
const LG7 = 1.479819860511658591e-01;

export function log(x) {
  if (x !== x) return x;
  if (x < 0) return NaN;
  if (x === 0) return -Infinity;
  if (x === Infinity) return x;
  let k = 0;
  let hx = high(x);
  if (hx < 0x00100000) {          // subnormal: scale up by 2^54
    k -= 54;
    x *= TWO_54;
    hx = high(x);
  }
  k += (hx >> 20) - 1023;
  hx &= 0x000fffff;
  // Bring x into [sqrt(2)/2, sqrt(2)): i is 0x100000 when the fraction is past sqrt(2) - 1.
  const i0 = (hx + 0x95f64) & 0x100000;
  bits.setFloat64(0, x);
  bits.setUint32(0, hx | (i0 ^ 0x3ff00000), BIG);
  x = bits.getFloat64(0);
  k += i0 >> 20;
  const f = x - 1;
  const dk = k;
  if ((0x000fffff & (2 + hx)) < 3) {              // |f| < 2^-20
    if (f === 0) return k === 0 ? 0 : dk * LN2_HI + dk * LN2_LO;
    const R = f * f * (0.5 - 0.33333333333333333 * f);
    return k === 0 ? f - R : dk * LN2_HI - ((R - dk * LN2_LO) - f);
  }
  const s = f / (2 + f);
  const z = s * s;
  const w = z * z;
  const t1 = w * (LG2 + w * (LG4 + w * LG6));
  const t2 = z * (LG1 + w * (LG3 + w * (LG5 + w * LG7)));
  const R = t2 + t1;
  if (((hx - 0x6147a) | (0x6b851 - hx)) > 0) {   // fdlibm: i = hx - 0x6147a, j = 0x6b851 - hx, i |= j
    const hfsq = 0.5 * f * f;
    return k === 0 ? f - (hfsq - s * (hfsq + R)) : dk * LN2_HI - ((hfsq - (s * (hfsq + R) + dk * LN2_LO)) - f);
  }
  return k === 0 ? f - s * (f - R) : dk * LN2_HI - ((s * (f - R) - dk * LN2_LO) - f);
}
