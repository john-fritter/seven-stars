// The one seeded random generator (mulberry32). Its state is plain data inside the World,
// so save/load carries it and a run replays exactly.

export interface Rng {
  s: number;
}

export function createRng(seed: number): Rng {
  return { s: seed >>> 0 };
}

/** A float in [0, 1). */
export function next(r: Rng): number {
  let t = (r.s = (r.s + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function between(r: Rng, lo: number, hi: number): number {
  return lo + (hi - lo) * next(r);
}

export function int(r: Rng, n: number): number {
  return Math.floor(next(r) * n);
}

export function chance(r: Rng, p: number): boolean {
  return next(r) < p;
}

export function pick<T>(r: Rng, items: readonly T[]): T {
  return items[int(r, items.length)]!;
}

/** Picks an index with probability proportional to its weight. */
export function weightedIndex(r: Rng, weights: readonly number[]): number {
  let total = 0;
  for (const w of weights) total += Math.max(0, w);
  if (total <= 0) return int(r, weights.length);
  let x = next(r) * total;
  for (let i = 0; i < weights.length; i++) {
    x -= Math.max(0, weights[i]!);
    if (x < 0) return i;
  }
  return weights.length - 1;
}

/** A normal draw (Box-Muller, no cached second value so the state stays one number). */
export function normal(r: Rng, mean: number, sd: number): number {
  const u = 1 - next(r);
  const v = next(r);
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Fisher-Yates, in place. */
export function shuffle<T>(r: Rng, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = int(r, i + 1);
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}
