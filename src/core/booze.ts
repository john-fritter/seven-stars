// Booze and intoxication. DESIGN.md Part two, Booze, and Personality grid (Why people drink).
// Quality goes by rank, capped by what each place pours. Drinks add intoxication, which wears
// off by the hour; the stages change how people talk, flirt and fight.
import type { ActionDef, Axis } from '../data/schema.js';
import { accessRank, effectsToday, log, type Ctx } from './context.js';
import { feel } from './ledger.js';
import { addNeed, axisFactor } from './needs.js';
import { between, chance } from './rng.js';
import { begin, endActivity, onToilet, PASSED_OUT } from './actions.js';
import { think } from './thoughts.js';
import { traitFx } from './traits.js';
import type { Contestant } from './types.js';
import { canSee } from './station.js';

type Stage = Ctx['data']['booze']['stages'][number];

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** The highest stage they've reached, or undefined when sober. */
export function stageOf(ctx: Ctx, c: Contestant): Stage | undefined {
  if (c.intox <= 0) return undefined;
  let best: Stage | undefined;
  for (const s of ctx.data.booze.stages) if (c.intox >= s.at && (!best || s.at > best.at)) best = s;
  return best;
}

/** A personality axis as it acts right now: drunk people are more volatile (less calm). */
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
  // A party (the Wheel) pours the top shelf for everyone, wherever they drink.
  for (const id of effectsToday(ctx)) {
    const party = ctx.data.wheel.effects[id]!.booze;
    if (party) return party;
  }
  const b = ctx.data.booze;
  const mine = b.byRank[String(accessRank(ctx, c)) as '1']!;
  return b.order.indexOf(mine) >= b.order.indexOf(best) ? mine : best;
}

export function rankQuality(ctx: Ctx, c: Contestant): string {
  return ctx.data.booze.byRank[String(accessRank(ctx, c)) as '1']!;
}

/** Why they reach for a drink: taste, company (more for party animals), and a bad mood (doubled for the volatile). */
export function drinkPull(ctx: Ctx, c: Contestant, company: boolean): number {
  const p = ctx.data.booze.pull;
  const taste = (p.taste * c.drinking) / 10;
  const social = company ? ((p.social * (c.personality.outgoing + c.personality.playful)) / 20) * traitFx(ctx.data, c).drinkCompany : 0;
  const self = c.mood < p.lowMood ? ((p.self * (p.lowMood - c.mood)) / p.lowMood) * Math.max(0, axisFactor(p.selfVolatileK, c.personality.calm)) : 0;
  return taste + social + self;
}

/**
 * Self-control: drinks appeal less the drunker they are, × (1 − intoxication ÷ their limit), never
 * below 0. Most people stop around tipsy; heavy drinkers and the miserable keep going.
 */
export function soberFactor(ctx: Ctx, c: Contestant): number {
  return Math.max(0, 1 - c.intox / drinkLimit(ctx, c));
}

/** The morning after: while the hangover lasts, a drink scores × hangover.drinkMult. */
export function hungoverFactor(ctx: Ctx, c: Contestant): number {
  const h = ctx.data.booze.hangover;
  return c.thoughts.some((x) => x.id === h.thought) ? h.drinkMult : 1;
}

export function drinkLimit(ctx: Ctx, c: Contestant): number {
  const p = ctx.data.booze.pull;
  const misery = c.mood < p.lowMood ? (p.lowMood - c.mood) / p.lowMood : 0;
  return p.limit.base + p.limit.perDrinking * c.drinking + p.limit.miserable * misery;
}

/** Attraction as they judge it right now: beer goggles add a little when drunk. */
export function attractionNow(ctx: Ctx, c: Contestant, attraction: number, seen?: Contestant): number {
  return attraction + (stageOf(ctx, c)?.goggles ?? 0) - (seen ? grubbiness(ctx, seen) : 0);
}

/** How much less attractive someone is for needing a wash (needs.yaml grubby). */
export function grubbiness(ctx: Ctx, c: Contestant): number {
  const g = ctx.data.needs.grubby;
  return g && c.needs.hygiene < g.below ? g.attraction : 0;
}

/** How much readier they are to say yes when drunk. */
export function agreeMult(ctx: Ctx, c: Contestant): number {
  return stageOf(ctx, c)?.agree ?? 1;
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
  const fx = traitFx(ctx.data, c);
  const before = stageOf(ctx, c)?.id;
  c.intox = Math.min(100, c.intox + (b.intoxication.perDrink * fx.intox) / sp.size);
  addNeed(c, 'bladder', -b.bladderPerDrink);
  c.drinks += q.hangover * fx.hangover;
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
    const p = b.carry.chance * Math.max(0, axisFactor(b.carry.kindK, axis(ctx, c, 'kind'))) * traitFx(ctx.data, c).carry;
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

/**
 * Every hour while hammered: they may throw up (hygiene, and the humiliation if anyone saw) or pass
 * out where they are, which the ceremony's summons doesn't rouse them from.
 */
export function hammeredHour(ctx: Ctx, c: Contestant): void {
  if (stageOf(ctx, c)?.id !== 'hammered' || c.asleep || c.breakdown || c.activity?.action === PASSED_OUT || onToilet(ctx, c)) return;
  const b = ctx.data.booze;
  const saw = ctx.w.contestants.filter((o) => o !== c && canSee(ctx.st, o.room, c.room) && !o.asleep);
  if (chance(ctx.w.rng, b.puke.perHour)) {
    addNeed(c, 'hygiene', b.puke.hygiene);
    log(ctx, 'puke', [c.id], c.room);
    if (saw.length) think(ctx, c, b.puke.thought);
    for (const o of saw) think(ctx, o, b.puke.witnessThought, c.id);
    return;
  }
  if (chance(ctx.w.rng, b.passOut.perHour)) {
    endActivity(ctx, c, 'interrupted');
    log(ctx, 'passed_out', [c.id], c.room);
    if (saw.length) think(ctx, c, b.passOut.thought);
    begin(ctx, c, { action: PASSED_OUT, object: null, room: c.room, minutes: Math.round(between(ctx.w.rng, b.passOut.minutes[0], b.passOut.minutes[1])) });
  }
}
