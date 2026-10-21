// The daily schedule: arrivals, the wake chime, trials, meals, the daily event, lights-dim and the
// ceremony. DESIGN.md Part two, Clock and daily schedule.
import { actionDef, CEREMONY, endActivity, EVENT, onToilet, openMeals, TRIAL, type Plan } from './actions.js';
import { canEnter, dayOf, log, timeOfDay, type Ctx } from './context.js';
import { eventToday, openEvent, resolveEvent, revealButton } from './events.js';
import { announceBodies, findBodies, holdTrials, trialsToday } from './trials.js';
import { spinWheel, unswapBeds } from './wheel.js';
import { fadeLedger } from './ledger.js';
import { cast } from './generator.js';
import { shuffle } from './rng.js';
import { confine, fishbowlMinute, rollCall, sentencing, spacings } from './show.js';
import { hangover } from './booze.js';
import { forget, think } from './thoughts.js';
import type { Contestant } from './types.js';

export const CAST_SIZE = 7;

/** Runs whatever the schedule has at this minute, before contestants act. */
export function runSchedule(ctx: Ctx): void {
  const s = ctx.data.schedule;
  const m = timeOfDay(ctx.w.t);
  fishbowlMinute(ctx);
  if (ctx.w.show.bodies.length) findBodies(ctx);

  if (m === 0) {
    // Station effects (cold water, no breakfast, a party) last their day; the old ones go.
    const fx = ctx.w.show.effects;
    const day = dayOf(ctx.w.t);
    for (const id of Object.keys(fx)) if (fx[id]! < day) delete fx[id];
    const on = Object.keys(fx).filter((id) => fx[id] === day);
    if (on.length) log(ctx, 'effects', [], undefined, { effects: on });
  }

  if (m === s.wakeChime.at) {
    log(ctx, 'wake_chime', []);
    if (ctx.w.show.bedSwap) backToBed(ctx);
    for (const c of ctx.w.contestants) if (c.asleep && c.needs.rest > s.wakeChime.minRest) endActivity(ctx, c, 'woke');
    guestsOut(ctx);
    for (const c of ctx.w.contestants) {
      fadeLedger(ctx, c);
      hangover(ctx, c);
    }
  }
  if (m === s.arrivals) arrivals(ctx);
  if (m === s.lightsDim) log(ctx, 'lights_dim', []);

  if (m === s.trials.at && trialsToday(ctx).length) {
    log(ctx, 'trial_called', [], s.trials.room, { trials: trialsToday(ctx).length });
    summon(ctx, TRIAL, s.trials.wakeAbove);
  }
  if (m === s.trials.at + s.trials.resolveAfter && trialsToday(ctx).length) holdTrials(ctx);

  if (m === s.event.at) {
    openEvent(ctx);
    summon(ctx, EVENT, s.event.wakeAbove);
  }
  if (m === s.event.at + s.event.resolveAfter) resolveEvent(ctx);
  if (m === ctx.data.events.button.revealAt && ctx.w.show.button) revealButton(ctx);

  // A meal opening pulls awake people out of what they're doing so they can choose to go.
  for (const meal of s.meals) {
    if (m !== meal.from) continue;
    for (const c of ctx.w.contestants) {
      if (!c.asleep && !c.breakdown && !onToilet(ctx, c) && openMeals(ctx, c).some((x) => x.id === meal.id)) endActivity(ctx, c, 'interrupted');
    }
  }

  if (m === s.ceremony.at) summon(ctx, CEREMONY, s.ceremony.wakeAbove);
  if (m === s.ceremony.at + s.ceremony.resolveAfter) ceremony(ctx);
}

/**
 * A gathering everyone must attend, if one is on now: the ceremony, a trial, the daily event.
 * Contestants who come free while it's on head there.
 */
export function gathering(ctx: Ctx): Plan | null {
  const s = ctx.data.schedule;
  const m = timeOfDay(ctx.w.t);
  const at = (from: number, minutes: number) => m >= from && m < from + minutes;
  const until = (from: number, minutes: number) => ctx.w.t - m + from + minutes;
  if (at(s.ceremony.at, s.ceremony.minutes)) return { action: CEREMONY, object: null, room: s.ceremony.room, endAt: until(s.ceremony.at, s.ceremony.minutes) };
  // A trial is on until its verdicts are in and its time is up.
  if (at(s.trials.at, s.trials.minutes) && ctx.w.show.trialOn === dayOf(ctx.w.t)) return { action: TRIAL, object: null, room: s.trials.room, endAt: until(s.trials.at, s.trials.minutes) };
  const ev = at(s.event.at, s.event.minutes) ? eventToday(ctx) : null;
  if (ev) return { action: EVENT, object: null, room: ev.room, endAt: until(s.event.at, s.event.minutes) };
  return null;
}

/** Everyone is summoned: sleepers with enough rest are woken, and anyone free is pulled out of what they're doing. */
function summon(ctx: Ctx, action: string, wakeAbove: number): void {
  if (action === TRIAL) ctx.w.show.trialOn = dayOf(ctx.w.t);
  for (const c of ctx.w.contestants) if (c.asleep && !c.confined && c.needs.rest > wakeAbove) endActivity(ctx, c, 'woke');
  // Unless they're in the middle of a breakdown, or on the toilet.
  for (const c of ctx.w.contestants) if (!c.asleep && !c.confined && !c.breakdown && c.activity?.action !== action && !onToilet(ctx, c)) endActivity(ctx, c, 'interrupted');
}

/** The suite night is over at the wake chime. Anyone still in a bed or room that isn't theirs any more is moved along. */
function backToBed(ctx: Ctx): void {
  const ids = ctx.w.show.bedSwap ?? [];
  unswapBeds(ctx);
  for (const c of ctx.w.contestants) {
    if (!ids.includes(c.id)) continue;
    const a = c.activity;
    if (a && ((a.object && actionDef(ctx, a)?.assigned && a.object !== c.bed) || !canEnter(ctx, c, a.room))) endActivity(ctx, c, 'woke');
    if (!canEnter(ctx, c, c.room)) {
      const from = c.room;
      c.room = ctx.data.schedule.ceremony.room;
      log(ctx, 'escorted', [c.id], c.room, { from });
    }
  }
}

/** The robots deliver or repossess clothes with the new rank; the outfit leaves a thought. */
export function dress(ctx: Ctx, c: Contestant): void {
  for (const tier of Object.values(ctx.data.clothing.byRank)) if (tier.thought) forget(ctx, c, tier.thought);
  const thought = ctx.data.clothing.byRank[String(c.rank) as '1']!.thought;
  if (thought) think(ctx, c, thought);
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
    think(ctx, c, ctx.data.thoughts.trapped);
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
 * The evening ceremony, in order: any unfound body announced, roll call, today's infractions and
 * sentences (meter penalties applied), anyone at zero spaced, ranks assigned, the Wheel spun by the
 * new bottom rank, room moves, and the fishbowl's new occupants escorted in.
 */
function ceremony(ctx: Ctx): void {
  const w = ctx.w;
  if (w.show.bodies.length) announceBodies(ctx);
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
    dress(ctx, c);
  });
  log(ctx, 'ceremony', w.contestants.map((c) => c.id), ctx.data.schedule.ceremony.room, {
    day: dayOf(w.t),
    ranks: order.map((c) => c.id),
    changes,
  });

  const spinner = order[order.length - 1];
  if (spinner) fishbowl.push(...spinWheel(ctx, spinner, order));

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
