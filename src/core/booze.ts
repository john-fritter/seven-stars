// Booze and intoxication. DESIGN.md Part two, Booze, and Personality grid (Why people drink).
// Quality goes by rank, capped by what each place pours. Drinks add intoxication, which wears
// off by the hour; the stages change how people talk, flirt and fight.
import type { ActionDef, Axis } from '../data/schema.js';
import { accessRank, log, type Ctx } from './context.js';
import { feel } from './ledger.js';
import { addNeed, axisFactor } from './needs.js';
import { chance } from './rng.js';
import { think } from './thoughts.js';
import type { Contestant } from './types.js';

type Stage = Ctx['data']['booze']['stages'][number];

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** The highest stage they've reached, or undefined when sober. */
export function stageOf(ctx: Ctx, c: Contestant): Stage | undefined {
  if (c.intox <= 0) return undefined;
  let best: Stage | undefined;
  for (const s of ctx.data.booze.stages) if (c.intox >= s.at && (!best || s.at > best.at)) best = s;
  return best;
}

/** A personality axis as it acts right now: drunk people are less honest and less kind. */
export function axis(ctx: Ctx, c: Contestant, a: Axis): number {
  const shift = stageOf(ctx, c)?.axes[a] ?? 0;
  return clamp(c.personality[a] + shift, 0, 10);
}

/** A stage multiplier for the drinker: 1 when sober. */
export function stageMult(ctx: Ctx, c: Contestant, k: 'interaction' | 'social' | 'fight' | 'walk'): number {
  return stageOf(ctx, c)?.[k] ?? 1;
}

/** How drunkenness scales an interaction type for the one starting it. */
export function moveMult(ctx: Ctx, c: Contestant, id: string): number {
  return stageOf(ctx, c)?.moves[id] ?? 1;
}

/** The quality a contestant gets at a place that pours `best`: their rank's, or the place's best if worse. */
export function qualityFor(ctx: Ctx, c: Contestant, best: string): string {
  const b = ctx.data.booze;
  const mine = b.byRank[String(accessRank(ctx, c)) as '1']!;
  return b.order.indexOf(mine) >= b.order.indexOf(best) ? mine : best;
}

export function rankQuality(ctx: Ctx, c: Contestant): string {
  return ctx.data.booze.byRank[String(accessRank(ctx, c)) as '1']!;
}

/** Why they reach for a drink: taste, company, and a bad mood (doubled for the volatile). */
export function drinkPull(ctx: Ctx, c: Contestant, company: boolean): number {
  const p = ctx.data.booze.pull;
  const taste = (p.taste * c.drinking) / 10;
  const social = company ? (p.social * (c.personality.outgoing + c.personality.playful)) / 20 : 0;
  const self = c.mood < p.lowMood ? ((p.self * (p.lowMood - c.mood)) / p.lowMood) * Math.max(0, axisFactor(p.selfVolatileK, c.personality.calm)) : 0;
  return taste + social + self;
}

/** Drinks appeal less the drunker they are: × (1 − intoxication ÷ soberAt), never below 0. */
export function soberFactor(ctx: Ctx, c: Contestant): number {
  return Math.max(0, 1 - c.intox / ctx.data.booze.pull.soberAt);
}

/** The fun a drink action gives, from the quality poured. */
export function drinkFun(ctx: Ctx, c: Contestant, def: ActionDef): number {
  return ctx.data.booze.qualities[qualityFor(ctx, c, def.booze!)]!.fun;
}

/**
 * Downs a drink: intoxication, bladder, the enjoyment thought, and tomorrow's hangover. A drink
 * gets logged so the harness can count drinks by quality. Fun is spread over the action itself.
 */
export function drink(ctx: Ctx, c: Contestant, quality: string, room: string, from?: string): void {
  const b = ctx.data.booze;
  const q = b.qualities[quality]!;
  const sp = ctx.data.species.species[c.species]!;
  const before = stageOf(ctx, c)?.id;
  c.intox = Math.min(100, c.intox + b.intoxication.perDrink / sp.size);
  addNeed(c, 'bladder', -b.bladderPerDrink);
  c.drinks += q.hangover;
  think(ctx, c, q.thought);
  log(ctx, 'drink', from ? [c.id, from] : [c.id], room, { quality, intox: Math.round(c.intox) });
  staged(ctx, c, before);
}

/** Logs a change of stage; getting hammered is antics the show pays for. */
function staged(ctx: Ctx, c: Contestant, before: string | undefined): void {
  const now = stageOf(ctx, c)?.id;
  if (now === before) return;
  log(ctx, 'intox', [c.id], c.room, { from: before ?? 'sober', to: now ?? 'sober' });
  if (now === 'hammered') {
    c.hammeredSince = ctx.w.t;
    log(ctx, 'hammered', [c.id], c.room);
  }
}

/** A drink finished at the bar or the machine: warming to fellow drinkers, maybe one to go. */
export function finishDrink(ctx: Ctx, c: Contestant, quality: string, room: string): void {
  const b = ctx.data.booze;
  drink(ctx, c, quality, room);
  for (const o of ctx.w.contestants) {
    if (o === c || o.room !== room || o.activity?.phase !== 'do') continue;
    const def = o.activity.object ? ctx.st.object.get(o.activity.object)?.actions.find((d) => d.id === o.activity!.action) : undefined;
    if (def?.kind !== 'drink') continue;
    // Each side warms when they finish their own drink, so a round together is +2 both ways.
    feel(ctx, c, o, 'affection', b.together.affection, 'drank together');
  }
  if (c.inventory.length < b.carry.max) {
    const p = b.carry.chance * Math.max(0, axisFactor(b.carry.kindK, axis(ctx, c, 'kind'))) * (b.carry.quirks[c.quirk] ?? 1);
    if (chance(ctx.w.rng, p)) c.inventory.push(quality);
  }
}

/** One minute sobering up. Coming down from hammered can leave a memory gap. */
export function soberMinute(ctx: Ctx, c: Contestant): void {
  if (c.intox <= 0) return;
  const before = stageOf(ctx, c)?.id;
  c.intox = Math.max(0, c.intox - ctx.data.booze.intoxication.fallPerHour / 60);
  const now = stageOf(ctx, c)?.id;
  if (now === before) return;
  if (before === 'hammered' && c.hammeredSince !== null) {
    const since = c.hammeredSince;
    c.hammeredSince = null;
    if (chance(ctx.w.rng, ctx.data.booze.blackout)) {
      // They keep how they feel but not why: the reasons from that stretch are gone.
      for (const r of Object.values(c.ledger)) r.reasons = r.reasons.filter((x) => x.t < since);
      log(ctx, 'blackout', [c.id], c.room, { since });
    }
  }
  log(ctx, 'intox', [c.id], c.room, { from: before ?? 'sober', to: now ?? 'sober' });
}

/** At the wake chime: last night's drinks come due. */
export function hangover(ctx: Ctx, c: Contestant): void {
  const h = ctx.data.booze.hangover;
  const amount = c.drinks;
  c.drinks = 0;
  if (amount < h.min) return;
  const size = clamp(amount, Math.abs(h.from), Math.abs(h.to));
  think(ctx, c, h.thought, null, -size);
  log(ctx, 'hangover', [c.id], c.room, { amount: Math.round(amount * 10) / 10 });
}

/** Gives a carried drink, the best one, which the target downs on the spot. */
export function giftDrink(ctx: Ctx, c: Contestant, o: Contestant): void {
  const b = ctx.data.booze;
  const best = [...c.inventory].sort((x, y) => b.order.indexOf(x) - b.order.indexOf(y))[0];
  if (!best) return;
  c.inventory.splice(c.inventory.indexOf(best), 1);
  const better = b.order.indexOf(best) < b.order.indexOf(rankQuality(ctx, o));
  feel(ctx, o, c, 'affection', better ? b.gift.better : b.gift.affection, 'gift');
  think(ctx, o, b.gift.thought, c.id);
  addNeed(o, 'fun', b.qualities[best]!.fun);
  log(ctx, 'gift', [c.id, o.id], c.room, { quality: best, better });
  drink(ctx, o, best, o.room, c.id);
}
