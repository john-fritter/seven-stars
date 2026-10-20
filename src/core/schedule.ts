// The daily schedule: arrivals, the wake chime, meals, lights-dim and the ceremony.
// DESIGN.md Part two, Clock and daily schedule.
import { CEREMONY, endActivity, onToilet, openMeals } from './actions.js';
import { canEnter, dayOf, log, timeOfDay, type Ctx } from './context.js';
import { fadeLedger } from './ledger.js';
import { cast } from './generator.js';
import { shuffle } from './rng.js';
import { confine, fishbowlMinute, rollCall, sentencing, spacings } from './show.js';
import { think } from './thoughts.js';
import type { Contestant } from './types.js';

export const CAST_SIZE = 7;

/** Runs whatever the schedule has at this minute, before contestants act. */
export function runSchedule(ctx: Ctx): void {
  const s = ctx.data.schedule;
  const m = timeOfDay(ctx.w.t);
  fishbowlMinute(ctx);

  if (m === s.wakeChime.at) {
    log(ctx, 'wake_chime', []);
    for (const c of ctx.w.contestants) if (c.asleep && c.needs.rest > s.wakeChime.minRest) endActivity(ctx, c, 'woke');
    guestsOut(ctx);
    for (const c of ctx.w.contestants) fadeLedger(ctx, c);
  }
  if (m === s.arrivals) arrivals(ctx);
  if (m === s.lightsDim) log(ctx, 'lights_dim', []);

  // A meal opening pulls awake people out of what they're doing so they can choose to go.
  for (const meal of s.meals) {
    if (m !== meal.from) continue;
    for (const c of ctx.w.contestants) {
      if (!c.asleep && !onToilet(ctx, c) && openMeals(ctx, c).some((x) => x.id === meal.id)) endActivity(ctx, c, 'interrupted');
    }
  }

  if (m === s.ceremony.at) {
    for (const c of ctx.w.contestants) if (c.asleep && !c.confined && c.needs.rest > s.ceremony.wakeAbove) endActivity(ctx, c, 'woke');
    for (const c of ctx.w.contestants) if (!c.asleep && !c.confined && c.activity?.action !== CEREMONY && !onToilet(ctx, c)) endActivity(ctx, c, 'interrupted');
  }
  if (m === s.ceremony.at + s.ceremony.resolveAfter) ceremony(ctx);
}

/** Guest status ends at 07:00 after a night: anyone still inside is shown out to the common room. */
function guestsOut(ctx: Ctx): void {
  for (const c of ctx.w.contestants) {
    const g = c.guest;
    if (!g) continue;
    c.guest = null;
    if (c.room === g.room || c.activity?.room === g.room) {
      endActivity(ctx, c, 'woke');
      if (!canEnter(ctx, c, c.room)) c.room = ctx.data.schedule.ceremony.room;
    }
    log(ctx, 'guest_out', [c.id, g.host], g.room);
  }
}

/** Empty slots refill to seven through casting. */
function arrivals(ctx: Ctx): void {
  const w = ctx.w;
  while (w.contestants.length < CAST_SIZE) {
    const c = cast(ctx.data, w.rng, w.contestants, `c${w.nextId++}`, w.t);
    w.contestants.push(c);
    log(ctx, 'arrive', [c.id], c.room, { name: c.name, species: c.species, pronouns: c.pronouns });
  }
}

/**
 * Ranks the cast by meter, then lifetime points, then a random draw, so the order is
 * total and repeatable. Exported for tests.
 */
export function rankOrder(ctx: Ctx, cast: Contestant[]): Contestant[] {
  return shuffle(ctx.w.rng, [...cast]).sort((a, b) => b.meter - a.meter || b.lifetime - a.lifetime);
}

/**
 * The evening ceremony, in order: roll call, today's infractions and sentences (meter penalties
 * applied), anyone at zero spaced, ranks assigned, the Wheel (still to come), room moves, and the
 * fishbowl's new occupants escorted in.
 */
function ceremony(ctx: Ctx): void {
  const w = ctx.w;
  rollCall(ctx);
  const fishbowl = sentencing(ctx);
  spacings(ctx);

  const order = rankOrder(ctx, w.contestants);
  const changes: { id: string; from: number | null; to: number }[] = [];
  order.forEach((c, i) => {
    const to = i + 1;
    if (c.rank !== to) changes.push({ id: c.id, from: c.rank, to });
    if (c.rank !== null && to !== c.rank) think(ctx, c, to < c.rank ? ctx.data.ranks.thoughts.up : ctx.data.ranks.thoughts.down);
    c.rank = to;
    c.bed = ctx.data.ranks.ranks[String(to) as '1']!.bed;
  });
  log(ctx, 'ceremony', w.contestants.map((c) => c.id), ctx.data.schedule.ceremony.room, {
    day: dayOf(w.t),
    ranks: order.map((c) => c.id),
    changes,
  });

  for (const { c, kind } of fishbowl) if (w.contestants.includes(c)) confine(ctx, c, kind);

  // Room moves: anyone now in or heading for a bed or room that isn't theirs is moved along.
  for (const c of w.contestants) {
    const a = c.activity;
    const def = a?.object ? ctx.st.object.get(a.object)!.actions.find((d) => d.id === a.action) : undefined;
    if (a && ((def?.assigned && a.object !== c.bed) || !canEnter(ctx, c, a.room))) endActivity(ctx, c, 'interrupted');
    if (c.guest && !canEnter(ctx, c, c.guest.room)) c.guest = null; // the host moved out
    if (!canEnter(ctx, c, c.room)) {
      const from = c.room;
      c.room = ctx.data.schedule.ceremony.room;
      log(ctx, 'escorted', [c.id], c.room, { from });
    }
  }
}
