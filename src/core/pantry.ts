// Food that runs out: each meal's spread, served in rank order, and the snack machine's stock.
// DESIGN.md Part two, Needs (Food and exertion, as built). Numbers in ranks.yaml spread and snacks.
import { dayOf, log, type Ctx } from './context.js';
import { feel } from './ledger.js';
import { addNeed } from './needs.js';
import { chance } from './rng.js';
import { think } from './thoughts.js';
import { traitFx } from './traits.js';
import type { Activity, Contestant } from './types.js';

function rankOf(ctx: Ctx, c: Contestant): number {
  return c.rank ?? ctx.data.ranks.newcomerRank;
}

function foodOf(ctx: Ctx, c: Contestant): string {
  return ctx.data.ranks.ranks[String(rankOf(ctx, c)) as '1']!.food;
}

/** Whoever could still turn up for this meal group: awake, out of the fishbowl, not yet eaten. */
function waiting(ctx: Ctx, c: Contestant, group: string): Contestant[] {
  const day = dayOf(ctx.w.t);
  return ctx.w.contestants.filter((o) => o !== c && !o.asleep && !o.confined && o.eaten[group] !== day);
}

/** A meal group's first sitting opens: the cafe puts out its spread for everyone aboard. */
export function openSpread(ctx: Ctx, group: string): void {
  const s = ctx.data.ranks.spread;
  if (!s) return;
  const eaters = ctx.w.contestants.filter((c) => !c.confined).length;
  ctx.w.show.spread[group] = Math.round(s.perEater * eaters * 100) / 100;
}

/**
 * Served on sitting down: a portion, or what's left of one. Those served last (rank 7's
 * leftovers) only get what the rest won't need; everyone else waits for their betters.
 * Returns the portion (0 to 1).
 */
export function serve(ctx: Ctx, c: Contestant, a: Activity, group: string): number {
  const s = ctx.data.ranks.spread;
  const full = ctx.data.ranks.food[a.food!]!.hunger;
  if (!s) {
    a.bite = full / ctx.data.schedule.mealMinutes;
    return 1;
  }
  const left = ctx.w.show.spread[group] ?? 0;
  const last = s.last.includes(a.food!);
  const r = rankOf(ctx, c);
  const ahead = waiting(ctx, c, group).filter((o) => !s.last.includes(foodOf(ctx, o)) && (last || rankOf(ctx, o) < r)).length;
  const portion = Math.max(0, Math.min(1, left - ahead));
  ctx.w.show.spread[group] = left - portion;
  a.bite = (full * portion) / ctx.data.schedule.mealMinutes;
  a.portion = portion;
  return portion;
}

/**
 * At the end of a plate: still hungry, or greedy (the cruel), they go back for seconds if
 * there's more than the others still to eat will need. Returns whether they did.
 */
export function seconds(ctx: Ctx, c: Contestant, a: Activity, group: string): boolean {
  const s = ctx.data.ranks.spread;
  if (!s || a.seconds) return false;
  const greedy = chance(ctx.w.rng, (s.greed * (10 - c.personality.kind)) / 10);
  if (c.needs.hunger >= s.secondsBelow && !greedy) return false;
  const left = ctx.w.show.spread[group] ?? 0;
  const ahead = waiting(ctx, c, group).filter((o) => !s.last.includes(foodOf(ctx, o))).length;
  const portion = Math.min(1, left - ahead);
  if (portion < s.minPortion) return false;
  ctx.w.show.spread[group] = left - portion;
  a.seconds = true;
  a.bite = (ctx.data.ranks.food[a.food!]!.hunger * portion) / s.secondsMinutes;
  a.endAt = ctx.w.t + s.secondsMinutes;
  log(ctx, 'seconds', [c.id], a.room, { meal: a.meal, portion: Math.round(portion * 100) / 100, hungry: Math.round(c.needs.hunger), greedy: c.needs.hunger >= s.secondsBelow });
  return true;
}

/** Turned up to an empty table. */
export function nothingLeft(ctx: Ctx, c: Contestant, a: Activity): void {
  log(ctx, 'meal_empty', [c.id], a.room, { meal: a.meal, food: a.food });
  const s = ctx.data.ranks.spread;
  if (s) think(ctx, c, s.empty);
}

/** The machine is refilled once a day. */
export function restock(ctx: Ctx): void {
  const s = ctx.data.ranks.snacks;
  if (!s) return;
  ctx.w.show.snacks = s.stock;
  ctx.w.show.restocked = ctx.w.t;
  log(ctx, 'restock', [], undefined, { snacks: s.stock });
}

/** Whether there might be a snack for an action that takes one: their stash, or the machine, which they only find empty when they get there. */
export function snackThere(ctx: Ctx, c: Contestant, takes: 'machine' | 'stash'): boolean {
  if (!ctx.data.ranks.snacks) return true;
  return takes === 'machine' ? (c.foundEmpty ?? -1) < ctx.w.show.restocked : c.snacks > 0;
}

/**
 * On reaching the machine (or digging into the stash): takes the snack. A hoarder may pocket
 * another. Returns false when there's nothing there after all.
 */
export function takeSnack(ctx: Ctx, c: Contestant, takes: 'machine' | 'stash', room: string): boolean {
  const s = ctx.data.ranks.snacks;
  if (!s) return true;
  if (takes === 'stash') {
    if (c.snacks <= 0) return false;
    c.snacks--;
    return true;
  }
  if (ctx.w.show.snacks <= 0) {
    c.foundEmpty = ctx.w.t; // they won't try again before it's refilled
    log(ctx, 'snacks_gone', [c.id], room);
    think(ctx, c, s.empty);
    return false;
  }
  ctx.w.show.snacks--;
  if (ctx.w.show.snacks === 0) log(ctx, 'sold_out', [c.id], room);
  if (c.snacks < s.max && ctx.w.show.snacks > 0 && chance(ctx.w.rng, s.carry * traitFx(ctx.data, c).carry)) {
    ctx.w.show.snacks--;
    c.snacks++;
    log(ctx, 'stash', [c.id], room, { left: ctx.w.show.snacks });
    if (ctx.w.show.snacks === 0) log(ctx, 'sold_out', [c.id], room);
  }
  return true;
}

/** Hands a stashed snack to someone hungry. */
export function shareSnack(ctx: Ctx, c: Contestant, o: Contestant): void {
  const s = ctx.data.ranks.snacks;
  if (!s || c.snacks <= 0) return;
  c.snacks--;
  addNeed(o, 'hunger', s.hunger);
  feel(ctx, o, c, 'affection', s.share.affection, 'shared a snack');
  think(ctx, o, s.share.thought, c.id);
  log(ctx, 'share_snack', [c.id, o.id], c.room, { hunger: Math.round(o.needs.hunger) });
}

/** Pinches someone's stashed snack. The show doesn't punish it; the owner may not notice, and the honest feel it. */
export function swipeSnack(ctx: Ctx, c: Contestant, o: Contestant): void {
  const s = ctx.data.ranks.snacks;
  if (!s || o.snacks <= 0) return;
  o.snacks--;
  addNeed(c, 'hunger', s.hunger);
  const noticed = chance(ctx.w.rng, s.swipe.noticed);
  log(ctx, 'swipe_snack', [c.id, o.id], c.room, { noticed });
  think(ctx, c, ctx.data.thoughts.moments.guilt.thought);
  if (noticed) {
    feel(ctx, o, c, 'affection', s.swipe.affection, 'swiped a snack');
    think(ctx, o, s.swipe.thought, c.id);
  }
}
