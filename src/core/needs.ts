// Needs drain over time; urgency turns a need's level into how much it matters.
// DESIGN.md Part two, Needs and Choosing actions.
import type { GameData, Need } from '../data/schema.js';
import type { Ctx } from './context.js';
import { derived } from './derived.js';
import type { Contestant } from './types.js';

/** u(n) = weight × ((100 − n) / 100)² */
export function urgency(weight: number, level: number): number {
  const x = (100 - level) / 100;
  return weight * x * x;
}

export function needUrgency(data: GameData, c: Contestant, n: Need): number {
  return urgency(data.needs.needs[n].weight, c.needs[n]);
}

/** Personality multiplier: 1 + k × (axis − 5) / 5. */
export function axisFactor(k: number, axis: number): number {
  return 1 + (k * (axis - 5)) / 5;
}

// Unrolled: this runs for every contestant every minute.
export function drainNeeds(ctx: Ctx, c: Contestant): void {
  const r = c.asleep ? derived(ctx.data, c).asleep : derived(ctx.data, c).awake;
  const n = c.needs;
  n.hunger = Math.max(0, n.hunger - r[0]!);
  n.rest = Math.max(0, n.rest - r[1]!);
  n.hygiene = Math.max(0, n.hygiene - r[2]!);
  n.bladder = Math.max(0, n.bladder - r[3]!);
  n.social = Math.max(0, n.social - r[4]!);
  n.fun = Math.max(0, n.fun - r[5]!);
}

export function addNeed(c: Contestant, n: Need, amount: number): void {
  c.needs[n] = Math.min(100, Math.max(0, c.needs[n] + amount));
}
