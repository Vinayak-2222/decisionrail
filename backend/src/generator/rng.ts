import { createHash } from "crypto";

// Mulberry32 — small, fast, deterministic PRNG for bulk dataset generation.
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rng = () => number;

export function weightedChoice<T extends string>(rng: Rng, weights: Record<T, number>): T {
  const entries = Object.entries(weights) as [T, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [key, w] of entries) {
    if (r < w) return key;
    r -= w;
  }
  return entries[entries.length - 1][0];
}

// Sample from a Beta(alpha, beta) distribution using the Cheng (1978) BB algorithm approximation
// via two Gammas — good enough for our small integer-ish alpha/beta shape params.
export function sampleBeta(rng: Rng, alpha: number, beta: number): number {
  const x = sampleGamma(rng, alpha);
  const y = sampleGamma(rng, beta);
  return x / (x + y);
}

function sampleGamma(rng: Rng, shape: number): number {
  // Marsaglia-Tsang method, shape >= 1 assumed (true for our config values)
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number, v: number;
    do {
      const u1 = rng();
      const u2 = rng();
      // Box-Muller for a standard normal sample
      x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

// Deterministic per-(caseId, action) Bernoulli draw — same pair always yields the same outcome,
// independent of generation order or which policy "chooses" it later. This is what makes the
// potential-outcomes table a fixed, pre-committed ground truth (Phase 5 Section 6, step 3).
export function seededBernoulli(caseId: string, action: string, probability: number): boolean {
  const hash = createHash("sha256").update(`${caseId}:${action}`).digest();
  // Take first 4 bytes as a uint32, normalize to [0,1)
  const uint = hash.readUInt32BE(0);
  const draw = uint / 4294967296;
  return draw < probability;
}

export function clip01(x: number): number {
  return Math.max(0, Math.min(1, x));
}