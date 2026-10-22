// People as mood: company, worry, missing someone, envy and friction. DESIGN.md Part two,
// Personality, traits and mood: the next pass (People as mood, grudges and friction).
import type { Ctx } from './context.js';
import { condition } from './thoughts.js';
import type { Contestant, Relation } from './types.js';

/**
 * Every ten minutes: the best-liked friend and the partner in the room lift mood, the most
 * disliked person drags it down. Each is one thought about that person, gone when they leave.
 */
export function company(ctx: Ctx, c: Contestant): void {
  const p = ctx.data.social.people;
  let friend: Contestant | null = null;
  let partner: Contestant | null = null;
  let enemy: Contestant | null = null;
  if (!c.asleep) {
    let best = p.friend.at;
    let worst = p.enemy.at;
    for (const o of ctx.w.contestants) {
      if (o === c || o.room !== c.room) continue;
      const r = c.ledger[o.id];
      if (!r) continue;
      if (p.partner.labels.includes(r.label)) partner ??= o;
      else if (r.affection >= best) [friend, best] = [o, r.affection];
      if (r.affection <= worst) [enemy, worst] = [o, r.affection];
    }
  }
  const at = (id: string, o: Contestant | null) => condition(ctx, c, id, o ? ctx.data.thoughts.thoughts[id]!.value : null, o?.id ?? null);
  at(p.friend.thought, friend);
  at(p.partner.thought, partner);
  at(p.enemy.thought, enemy);
}

/**
 * Hourly while awake: a friend on the chopping block, a partner out of sight for a day, and
 * someone they can't stand ranked above them.
 */
export function worries(ctx: Ctx, c: Contestant): void {
  const p = ctx.data.social.people;
  const doomLine = ctx.data.meter.doomed.below;
  let doomed: Contestant | null = null;
  let missing: Contestant | null = null;
  let envied: Contestant | null = null;
  let lowest = doomLine;
  let worst = p.envy.at;
  for (const o of c.asleep ? [] : ctx.w.contestants) {
    if (o === c) continue;
    const r = c.ledger[o.id];
    if (!r) continue;
    if (r.affection >= p.worry.at && o.meter < lowest) [doomed, lowest] = [o, o.meter];
    if (p.missing.labels.includes(r.label) && ctx.w.t - (r.seen ?? r.met) >= p.missing.hours * 60) missing ??= o;
    if (c.rank !== null && o.rank !== null && o.rank < c.rank && r.affection <= worst) [envied, worst] = [o, r.affection];
  }
  const at = (id: string, o: Contestant | null) => condition(ctx, c, id, o ? ctx.data.thoughts.thoughts[id]!.value : null, o?.id ?? null);
  at(p.worry.thought, doomed);
  at(p.missing.thought, missing);
  at(p.envy.thought, envied);
}

/**
 * Every social round: two awake people sharing a room drift together when their personalities
 * match and apart when they clash, by rate × (pivot − how far apart they are) each way. Also
 * notes that they've seen each other.
 */
export function friction(ctx: Ctx): void {
  const f = ctx.data.social.people.friction;
  const cast = ctx.w.contestants;
  for (let i = 0; i < cast.length; i++) {
    for (let j = i + 1; j < cast.length; j++) {
      const a = cast[i]!;
      const b = cast[j]!;
      if (a.room !== b.room) continue;
      const ra = a.ledger[b.id];
      const rb = b.ledger[a.id];
      if (!ra || !rb) continue;
      ra.seen = rb.seen = ctx.w.t;
      if (a.asleep || b.asleep || f.rate === 0) continue;
      let d = 0;
      for (const k of f.axes) d += Math.abs(a.personality[k] - b.personality[k]);
      const drift = f.rate * (f.pivot - d / f.axes.length);
      nudge(ctx, ra, drift);
      nudge(ctx, rb, drift);
    }
  }
}

/**
 * Friction moves affection a little every round, so it keeps one running reason ("clash" or
 * "click") instead of crowding the dated reasons out of the ledger.
 */
function nudge(ctx: Ctx, r: Relation, amount: number): void {
  r.affection = Math.min(100, Math.max(-100, r.affection + amount));
  const why = amount < 0 ? 'clash' : 'click';
  const x = r.reasons.find((y) => y.why === why);
  if (x) {
    x.amount += amount;
    x.times++;
    x.t = ctx.w.t;
  } else {
    r.reasons.push({ t: ctx.w.t, why, dim: 'affection', amount, times: 1 });
    if (r.reasons.length > ctx.data.social.ledger.keepReasons) r.reasons.shift();
  }
}
