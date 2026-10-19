// Thoughts and mood: mood is the base plus every active thought. DESIGN.md Part two,
// Thoughts, mood and breaks. Only what the social layer needs so far; breaks come later.
import type { Ctx } from './context.js';
import { axisFactor } from './needs.js';
import type { Contestant } from './types.js';

/** A thought's value for this contestant: volatility and species applied. */
export function thoughtValue(ctx: Ctx, c: Contestant, id: string): number {
  const th = ctx.data.thoughts;
  const def = th.thoughts[id]!;
  return def.value * axisFactor(th.volatileK, c.personality.calm) * (th.species[c.species]?.[def.source] ?? 1);
}

/** Adds a thought. At the stacking limit for that thought about that person, the oldest goes. */
export function think(ctx: Ctx, c: Contestant, id: string, about: string | null = null): void {
  const def = ctx.data.thoughts.thoughts[id]!;
  const same = c.thoughts.filter((x) => x.id === id && x.about === about);
  if (same.length >= def.stack) {
    const oldest = same.reduce((a, b) => (b.until < a.until ? b : a));
    c.thoughts.splice(c.thoughts.indexOf(oldest), 1);
  }
  c.thoughts.push({ id, about, value: thoughtValue(ctx, c, id), until: ctx.w.t + def.hours * 60 });
  updateMood(ctx, c);
}

/** Drops expired thoughts. */
export function expireThoughts(ctx: Ctx, c: Contestant): void {
  const t = ctx.w.t;
  if (!c.thoughts.some((x) => x.until <= t)) return;
  c.thoughts = c.thoughts.filter((x) => x.until > t);
  updateMood(ctx, c);
}

export function updateMood(ctx: Ctx, c: Contestant): void {
  let m = ctx.data.personality.mood.base;
  for (const x of c.thoughts) m += x.value;
  c.mood = Math.min(100, Math.max(0, m));
}
