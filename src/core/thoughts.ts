// Thoughts and mood: mood is the base plus every active thought. DESIGN.md Part two,
// Thoughts, mood and breaks. Conditions (low needs, the temperature) are thoughts refreshed
// while they last; breaks (breaks.ts) read the sources to pick what kind of break.
import type { Ctx } from './context.js';
import { axis } from './booze.js';
import { axisFactor } from './needs.js';
import { derived } from './derived.js';
import { clothingWarmth, discomfortAt } from './temperature.js';
import { traitFx } from './traits.js';
import type { Axis, Contestant } from './types.js';

/**
 * A thought's value for this contestant: personality, volatility, species and traits applied. `base`
 * replaces the data's value for thoughts whose size depends on the situation (the meter's dread).
 */
export function thoughtValue(ctx: Ctx, c: Contestant, id: string, base?: number): number {
  const th = ctx.data.thoughts;
  const def = th.thoughts[id]!;
  let v = (base ?? def.species[c.species] ?? def.value) * axisFactor(th.volatileK, axis(ctx, c, 'calm')) * (th.species[c.species]?.[def.source] ?? 1);
  const of = (a: Axis | 'modesty') => (a === 'modesty' ? c.modesty : c.personality[a]);
  for (const s of def.scale) v *= axisFactor(s.k, of(s.axis));
  for (const s of th.sources[def.source] ?? []) v *= axisFactor(s.k, of(s.axis));
  const fx = traitFx(ctx.data, c);
  return v * (fx.thoughts[id] ?? 1) * (fx.sources[def.source] ?? 1);
}

/** Adds a thought. At the stacking limit for that thought about that person, the oldest goes. */
export function think(ctx: Ctx, c: Contestant, id: string, about: string | null = null, base?: number): void {
  const def = ctx.data.thoughts.thoughts[id]!;
  const value = thoughtValue(ctx, c, id, base);
  if (value === 0) return;
  const same = c.thoughts.filter((x) => x.id === id && x.about === about);
  if (same.length >= def.stack) {
    const oldest = same.reduce((a, b) => (b.until < a.until ? b : a));
    c.thoughts.splice(c.thoughts.indexOf(oldest), 1);
  }
  c.thoughts.push({ id, about, value, until: ctx.w.t + def.hours * 60 });
  updateMood(ctx, c);
}

/** Drops a thought (and any repeats of it) if they have it. */
export function forget(ctx: Ctx, c: Contestant, id: string): void {
  if (!c.thoughts.some((x) => x.id === id)) return;
  c.thoughts = c.thoughts.filter((x) => x.id !== id);
  updateMood(ctx, c);
}

/**
 * A thought that lasts while a condition holds: refreshed with the current value, or dropped.
 * `about` is who it's about now (the friend in the room, say), which can change while it lasts.
 */
export function condition(ctx: Ctx, c: Contestant, id: string, base: number | null, about: string | null = null): void {
  const i = c.thoughts.findIndex((x) => x.id === id);
  if (base === null) {
    if (i >= 0) forget(ctx, c, id);
    return;
  }
  const value = thoughtValue(ctx, c, id, base);
  const until = ctx.w.t + ctx.data.thoughts.thoughts[id]!.hours * 60;
  if (i >= 0) {
    const x = c.thoughts[i]!;
    x.until = until;
    if (value === 0) return forget(ctx, c, id);
    x.about = about;
    if (x.value === value) return;
    x.value = value;
    updateMood(ctx, c);
  } else if (value !== 0) {
    c.thoughts.push({ id, about, value, until });
    updateMood(ctx, c);
  }
}

/** Every ten minutes: low (and well-met) needs, the temperature and a crowd (Loners) reach mood. */
export function conditions(ctx: Ctx, c: Contestant): void {
  const th = ctx.data.thoughts;
  const crowd = traitFx(ctx.data, c).crowd;
  if (crowd) {
    let n = 0;
    for (const o of ctx.w.contestants) if (o !== c && o.room === c.room) n++;
    condition(ctx, c, crowd.thought, n >= crowd.at ? th.thoughts[crowd.thought]!.value : null);
  }
  for (const n of th.needs) {
    const v = c.needs[n.need];
    const on = n.below !== undefined ? v < n.below : v > n.above!;
    condition(ctx, c, n.thought, on ? th.thoughts[n.thought]!.value : null);
  }
  const tp = th.temperature;
  const temp = ctx.w.rooms[c.room]!.temp;
  const off = discomfortAt(ctx, c, temp);
  const cold = off > 0 && temp + clothingWarmth(ctx, c) < derived(ctx.data, c).comfortLo;
  const value = off > 0 ? -Math.min(tp.max, off * tp.perDegree) : null;
  condition(ctx, c, tp.cold, cold ? value : null);
  condition(ctx, c, tp.hot, cold ? null : value);
}

/** "Trapped here", easing over their first days aboard. Refreshed hourly, and on arrival. */
export function trappedHere(ctx: Ctx, c: Contestant): void {
  const tr = ctx.data.thoughts.trapped;
  const x = Math.min(1, (ctx.w.t - c.arrivedAt) / (tr.days * 1440));
  condition(ctx, c, tr.thought, tr.from + (tr.to - tr.from) * x);
}

/** Drops expired thoughts. */
export function expireThoughts(ctx: Ctx, c: Contestant): void {
  const t = ctx.w.t;
  if (!c.thoughts.some((x) => x.until <= t)) return;
  c.thoughts = c.thoughts.filter((x) => x.until > t);
  updateMood(ctx, c);
}

/**
 * The base plus every thought, with each source's bad thoughts adding up to at most its cap
 * (`caps`, else `sourceCap`).
 */
export function updateMood(ctx: Ctx, c: Contestant): void {
  const th = ctx.data.thoughts;
  let m = ctx.data.personality.mood.base;
  const bad = new Map<string, number>();
  for (const x of c.thoughts) {
    if (x.value >= 0 || !th.sourceCap) m += x.value;
    else bad.set(th.thoughts[x.id]!.source, (bad.get(th.thoughts[x.id]!.source) ?? 0) + x.value);
  }
  for (const [src, v] of bad) m += Math.max(-(th.caps[src] ?? th.sourceCap), v);
  c.mood = Math.min(100, Math.max(0, m));
}

/**
 * The worst grievance among `sources`: the source whose bad thoughts add up to the most (each
 * × its weight, default 1), and who its thoughts are most about.
 */
export function grievance(ctx: Ctx, c: Contestant, sources: Record<string, unknown>, weights: Record<string, number> = {}): { source: string; about: string | null } | null {
  const th = ctx.data.thoughts.thoughts;
  const bySource = new Map<string, number>();
  for (const x of c.thoughts) {
    const s = th[x.id]!.source;
    if (x.value < 0 && s in sources) bySource.set(s, (bySource.get(s) ?? 0) + x.value * (weights[s] ?? 1));
  }
  let source: string | null = null;
  let worst = 0;
  for (const [s, v] of bySource) {
    if (v < worst) [source, worst] = [s, v];
  }
  if (source === null) return null;
  const byWho = new Map<string, number>();
  for (const x of c.thoughts) {
    if (x.value < 0 && x.about !== null && th[x.id]!.source === source) byWho.set(x.about, (byWho.get(x.about) ?? 0) + x.value);
  }
  let about: string | null = null;
  worst = 0;
  for (const [id, v] of byWho) {
    if (v < worst) [about, worst] = [id, v];
  }
  return { source, about };
}
