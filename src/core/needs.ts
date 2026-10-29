// Needs drain over time; urgency turns a need's level into how much it matters.
// DESIGN.md Part two, Needs and Choosing actions.
import type { GameData, Need } from '../data/schema.js';
import { nightShift, timeOfDay, type Ctx } from './context.js';
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
  let social = 1;
  let fun = 1;
  if (!c.asleep) [social, fun] = situation(ctx, c);
  n.hunger = Math.max(0, n.hunger - r[0]!);
  n.rest = Math.max(0, n.rest - r[1]!);
  n.hygiene = Math.max(0, n.hygiene - r[2]!);
  n.bladder = Math.max(0, n.bladder - r[3]!);
  companyMinute(ctx, c);
  n.fun = Math.max(0, n.fun - r[5]! * fun);
  // Exertion (needs.yaml): dancing works up a sweat, sitting still is restful.
  const a = c.activity;
  const ex = a && a.phase === 'do' ? ctx.data.needs.exertion[a.action]?.perHour : undefined;
  if (ex) for (const k in ex) addNeed(c, k as Need, -ex[k as Need]! / 60);
}

/**
 * Social and fun drain faster in the wrong places (needs.yaml situational): alone (nobody else
 * awake in the room), killing time (idle, queueing, turned away at a door), or in the fishbowl.
 */
function situation(ctx: Ctx, c: Contestant): [number, number] {
  const s = ctx.data.needs.situational;
  let social = 1;
  let fun = 1;
  if (!ctx.w.contestants.some((o) => o !== c && o.room === c.room && !o.asleep)) {
    social *= s.alone.social ?? 1;
    fun *= s.alone.fun ?? 1;
  }
  if (c.activity && s.idle.actions.includes(c.activity.action)) {
    social *= s.idle.drain.social ?? 1;
    fun *= s.idle.drain.fun ?? 1;
  }
  if (c.confined) {
    social *= s.confined.social ?? 1;
    fun *= s.confined.fun ?? 1;
  }
  return [social, fun];
}

/** Recreation wears thin (needs.yaml tolerance): what's left of an action's gain for `n`. */
export function freshness(ctx: Ctx, c: Contestant, actionId: string, n: Need): number {
  const t = ctx.data.needs.tolerance;
  if (!t.needs.includes(n)) return 1;
  return Math.max(t.floor, 1 - (c.tolerance[actionId] ?? 0));
}

/** A minute of something that wears thin: perUse spread over the action's minutes. */
export function wearThin(ctx: Ctx, c: Contestant, actionId: string, minutes: number): void {
  c.tolerance[actionId] = Math.min(1, (c.tolerance[actionId] ?? 0) + ctx.data.needs.tolerance.perUse / minutes);
}

/** Hourly: tolerance recovers. */
export function recover(ctx: Ctx, c: Contestant): void {
  const k = ctx.data.needs.tolerance.recoverPerHour;
  for (const id in c.tolerance) {
    const v = c.tolerance[id]! - k;
    if (v <= 0) delete c.tolerance[id];
    else c.tolerance[id] = v;
  }
}

export function addNeed(c: Contestant, n: Need, amount: number): void {
  // Social gains and losses are company: how much they've had (its need follows each minute).
  if (n === 'social') c.company = Math.min(100, Math.max(0, c.company + amount));
  else c.needs[n] = Math.min(100, Math.max(0, c.needs[n] + amount));
}

/**
 * A minute of company (social.yaml company): it moves toward the level of their situation (alone,
 * a few people, a crowd, a conversation), and falls asleep. Their social
 * need is how close it sits to their own comfortable point.
 */
function companyMinute(ctx: Ctx, c: Contestant): void {
  const k = ctx.data.social.company;
  if (c.asleep) c.company = Math.max(0, c.company - k.asleepPerHour / 60);
  else {
    let n = 0;
    for (const o of ctx.w.contestants) if (o !== c && o.room === c.room && !o.asleep) n++;
    let level = k.levels[Math.min(n, k.levels.length - 1)]!;
    if (n > 0 && c.activity?.action === k.talk.action && c.activity.phase === 'do') level += k.talkLevel;
    // It moves toward the level of their situation, a few hours' memory.
    const rate = k.followPerHour / 60;
    const diff = Math.min(100, level) - c.company;
    c.company += Math.max(-rate, Math.min(rate, diff));
  }
  c.needs.social = Math.max(0, 100 - (Math.abs(c.company - c.companyPoint) * 100) / k.width);
}

/** Loneliness (+) or being worn out by people (−), −1 to 1: how far company is from their point. */
export function companyWant(ctx: Ctx, c: Contestant): number {
  return Math.max(-1, Math.min(1, (c.companyPoint - c.company) / ctx.data.social.company.width));
}

/**
 * The body clock (needs.yaml sleep.clock): the rest below which they can fall asleep at this time
 * of their day, straight lines between the points, shifted by their night (owls, early birds).
 */
export function sleepLine(ctx: Ctx, c: Contestant, t: number): number {
  const pts = ctx.data.needs.sleep.clock.sleepLine;
  const m = timeOfDay(t - nightShift(ctx, c));
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    const end = i + 1 < pts.length ? b.at : b.at + 1440;
    if (m >= a.at && m < end) return a.rest + ((b.rest - a.rest) * (m - a.at)) / (end - a.at);
  }
  // Before the first point: between the last one (yesterday) and the first.
  const a = pts[pts.length - 1]!;
  const b = pts[0]!;
  const span = b.at + 1440 - a.at;
  return a.rest + ((b.rest - a.rest) * (m + 1440 - a.at)) / span;
}
