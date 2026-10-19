// The daily schedule: arrivals, the wake chime, meals, lights-dim and the ceremony.
// DESIGN.md Part two, Clock and daily schedule.
import { CEREMONY, endActivity, onToilet, openMeals } from './actions.js';
import { canEnter, dayOf, log, timeOfDay, type Ctx } from './context.js';
import { cast } from './generator.js';
import { shuffle } from './rng.js';
import type { Contestant } from './types.js';

export const CAST_SIZE = 7;

/** Runs whatever the schedule has at this minute, before contestants act. */
export function runSchedule(ctx: Ctx): void {
  const s = ctx.data.schedule;
  const m = timeOfDay(ctx.w.t);

  if (m === s.wakeChime.at) {
    log(ctx, 'wake_chime', []);
    for (const c of ctx.w.contestants) if (c.asleep && c.needs.rest > s.wakeChime.minRest) endActivity(ctx, c, 'woke');
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
    for (const c of ctx.w.contestants) if (!c.asleep && c.activity?.action !== CEREMONY && !onToilet(ctx, c)) endActivity(ctx, c, 'interrupted');
  }
  if (m === s.ceremony.at + s.ceremony.resolveAfter) ceremony(ctx);
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
 * The evening ceremony. Slice one's full order is: sentences, meter penalties, spacings, ranks,
 * the Wheel, room moves. Only ranks and room moves exist so far.
 */
function ceremony(ctx: Ctx): void {
  const w = ctx.w;
  const order = rankOrder(ctx, w.contestants);
  const changes: { id: string; from: number | null; to: number }[] = [];
  order.forEach((c, i) => {
    const to = i + 1;
    if (c.rank !== to) changes.push({ id: c.id, from: c.rank, to });
    c.rank = to;
    c.bed = ctx.data.ranks.ranks[String(to) as '1']!.bed;
  });
  log(ctx, 'ceremony', w.contestants.map((c) => c.id), ctx.data.schedule.ceremony.room, {
    day: dayOf(w.t),
    ranks: order.map((c) => c.id),
    changes,
  });

  // Room moves: anyone now in or heading for a bed or room that isn't theirs is moved along.
  for (const c of w.contestants) {
    const a = c.activity;
    const def = a?.object ? ctx.st.object.get(a.object)!.actions.find((d) => d.id === a.action) : undefined;
    if (a && ((def?.assigned && a.object !== c.bed) || !canEnter(ctx, c, a.room))) endActivity(ctx, c, 'interrupted');
    if (!canEnter(ctx, c, c.room)) {
      const from = c.room;
      c.room = ctx.data.schedule.ceremony.room;
      log(ctx, 'escorted', [c.id], c.room, { from });
    }
  }
}
