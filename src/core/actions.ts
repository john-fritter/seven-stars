// Choosing, starting, running and ending actions. DESIGN.md Part two, Choosing actions.
//
//   score = (Σ u(n) × gain_n / 10 + pulls − costs) × personality × mood × noise
//
// Gains are capped at what the need can still take. A weighted pick among the top few follows.
import type { ActionDef, MealDef, Need } from '../data/schema.js';
import { accessRank, canEnter, dayOf, inRanks, isNight, log, timeOfDay, type Ctx } from './context.js';
import { gainsOf, personalityOf } from './derived.js';
import { addNeed, needUrgency } from './needs.js';
import { between, weightedIndex } from './rng.js';
import { walkMinutes, type ObjectInstance } from './station.js';
import { companyPull, expectedKnockOdds, knock, occupants } from './social.js';
import { discomfortAt, preferredSetting, setThermostat, situationComfort } from './temperature.js';
import type { Activity, Contestant } from './types.js';

/** Scheduled actions that aren't advertised by objects. */
export const MEAL = 'meal';
export const CEREMONY = 'ceremony';
export const IDLE = 'idle';
export const WAIT = 'wait'; // waiting for a toilet to free up
export const FIGHT = 'fight';
export const AT_DOOR = 'at_door'; // turned away after knocking


const defCache = new WeakMap<Activity, ActionDef | undefined>();

export function actionDef(ctx: Ctx, a: Activity): ActionDef | undefined {
  if (defCache.has(a)) return defCache.get(a);
  const def = a.object ? ctx.st.object.get(a.object)!.actions.find((d) => d.id === a.action) : ctx.st.personal.find((d) => d.id === a.action);
  defCache.set(a, def);
  return def;
}

/** On, or heading to, a toilet, or queuing for one: the bladder override leaves them be. */
export function onToilet(ctx: Ctx, c: Contestant): boolean {
  const a = c.activity;
  return !!a && (a.action === WAIT || (a.object !== null && actionDef(ctx, a)?.kind === 'toilet'));
}

// ---------------------------------------------------------------------------------------------
// Scoring

function moodMult(ctx: Ctx, c: Contestant, tags: readonly string[]): number {
  const mood = ctx.data.personality.mood;
  if (c.mood >= mood.lowBelow) return 1;
  let m = 1;
  for (const tag of tags) m *= mood.multipliers[tag] ?? 1;
  return m;
}

function needTerm(ctx: Ctx, c: Contestant, n: Need, gain: number): number {
  const g = Math.min(gain, 100 - c.needs[n]);
  return g > 0 ? (needUrgency(ctx.data, c, n) * g) / 10 : 0;
}

interface Candidate {
  def: ActionDef | null; // null for meals
  object: ObjectInstance | null;
  room: string;
  meal?: MealDef;
  knock?: string; // host to knock on first
  score: number;
}

/** Who is in, or heading to, each room, not counting `c`. */
function company(ctx: Ctx, c: Contestant): Map<string, number> {
  const m = new Map<string, number>();
  for (const o of ctx.w.contestants) {
    if (o === c) continue;
    const r = o.activity?.room ?? o.room;
    m.set(r, (m.get(r) ?? 0) + 1);
  }
  return m;
}

function scoreAction(ctx: Ctx, c: Contestant, def: ActionDef, room: string, others: Map<string, number>, critical: boolean, night: boolean, pull: number): number {
  const a = ctx.data.actions;
  const walk = walkMinutes(ctx.st, c.room, room);
  if (critical) return def.kind === 'toilet' ? 100 - walk : 0; // nearest toilet wins

  let needs = 0;
  let pulls = def.kind === 'sleep' || def.kind === 'toilet' ? 0 : pull;
  for (const [n, g] of gainsOf(ctx.data, c, def)) {
    if (n === 'social' && def.company && !others.get(room)) continue;
    needs += needTerm(ctx, c, n, g);
  }
  if (def.kind === 'sleep') {
    needs += needTerm(ctx, c, 'rest', (100 - c.needs.rest) * def.quality!);
    if (night) pulls += a.nightSleepPull * def.quality!;
  } else if (def.kind === 'toilet') {
    needs += needTerm(ctx, c, 'bladder', 100);
  } else if (def.kind === 'thermostat') {
    const now = discomfortAt(ctx, c, ctx.w.rooms[room]!.temp);
    const after = discomfortAt(ctx, c, preferredSetting(ctx, c));
    needs += needTerm(ctx, c, 'comfort', (now - after) * ctx.data.temperature.comfortPerDegree);
  }
  needs += needTerm(ctx, c, 'comfort', situationComfort(ctx, c, room, def.comfort) - c.needs.comfort);

  let costs = walk * a.walkCostPerMinute + (def.speciesCost[c.species] ?? def.cost);
  if (def.tags.includes('exposed') && !def.private && others.get(room)) costs += (c.modesty / 10) * a.modestyCost;

  return (needs + pulls - costs) * personalityOf(ctx.data, c, def) * moodMult(ctx, c, def.tags);
}

function mealScore(ctx: Ctx, c: Contestant, meal: MealDef): number {
  const food = ctx.data.ranks.food[foodFor(ctx, c)]!;
  const walk = walkMinutes(ctx.st, c.room, meal.room);
  return needTerm(ctx, c, 'hunger', food.hunger) + ctx.data.actions.mealPull - walk * ctx.data.actions.walkCostPerMinute;
}

function foodFor(ctx: Ctx, c: Contestant): string {
  return ctx.data.ranks.ranks[String(accessRank(ctx, c)) as '1']!.food;
}

/** Meals this contestant could go to right now. */
export function openMeals(ctx: Ctx, c: Contestant): MealDef[] {
  const m = timeOfDay(ctx.w.t);
  const day = dayOf(ctx.w.t);
  const r = accessRank(ctx, c);
  return ctx.data.schedule.meals.filter((meal) => m >= meal.from && m < meal.to && c.eaten[meal.group] !== day && inRanks(r, meal.ranks) && canEnter(ctx, c, meal.room));
}

function usable(ctx: Ctx, c: Contestant, def: ActionDef): boolean {
  if (def.onlySpecies && !def.onlySpecies.includes(c.species)) return false;
  if (def.notSpecies?.includes(c.species)) return false;
  return inRanks(accessRank(ctx, c), def.ranks);
}

/** A bed `c` may use: their own, or their host's when it sleeps two. */
function bedAllowed(ctx: Ctx, c: Contestant, o: ObjectInstance, host: Contestant | undefined): boolean {
  if (c.bed === o.id) return true;
  return !!host && host.bed === o.id && o.capacity > 1;
}

function hostOf(ctx: Ctx, c: Contestant): Contestant | undefined {
  const g = c.guest;
  return g ? ctx.w.contestants.find((o) => o.id === g.host) : undefined;
}

function candidates(ctx: Ctx, c: Contestant): Candidate[] {
  const out: Candidate[] = [];
  const others = company(ctx, c);
  const critical = c.needs.bladder < ctx.data.needs.bladder.criticalBelow;
  const night = isNight(ctx, ctx.w.t);
  const host = hostOf(ctx, c);
  for (const room of ctx.st.rooms) {
    if (!canEnter(ctx, c, room.id)) continue;
    const pull = critical ? 0 : companyPull(ctx, c, room.id);
    const guest = c.guest?.room === room.id && !(c.bed !== null && ctx.st.object.get(c.bed)!.room === room.id);
    for (const o of ctx.st.objectsInRoom.get(room.id)!) {
      const users = ctx.w.objects[o.id]!;
      if (users.length >= o.capacity && !users.includes(c.id)) continue;
      for (const def of o.actions) {
        if (def.assigned && !bedAllowed(ctx, c, o, guest ? host : undefined)) continue;
        if (def.kind === 'thermostat' && (guest || preferredSetting(ctx, c) === ctx.w.rooms[room.id]!.setting)) continue;
        if (!usable(ctx, c, def)) continue;
        out.push({ def, object: o, room: room.id, score: scoreAction(ctx, c, def, room.id, others, critical, night, pull) });
      }
    }
  }
  if (critical) return out;
  knockCandidates(ctx, c, others, night, out);
  for (const def of ctx.st.personal) {
    if (usable(ctx, c, def)) out.push({ def, object: null, room: c.room, score: scoreAction(ctx, c, def, c.room, others, false, night, companyPull(ctx, c, c.room)) });
  }
  for (const meal of openMeals(ctx, c)) out.push({ def: null, object: null, room: meal.room, meal, score: mealScore(ctx, c, meal) });
  return out;
}

/**
 * Bedrooms `c` can't enter but could knock on: each action there is scored as if they were
 * let in, × the odds they expect from the most promising occupant, minus the awkwardness of asking.
 */
function knockCandidates(ctx: Ctx, c: Contestant, others: Map<string, number>, night: boolean, out: Candidate[]): void {
  const k = ctx.data.social.knock;
  for (const room of ctx.st.rooms) {
    if (room.access !== 'occupants' || canEnter(ctx, c, room.id)) continue;
    let host: Contestant | undefined;
    let odds = 0;
    for (const o of occupants(ctx, room.id, c)) {
      const p = expectedKnockOdds(ctx, c, o);
      if (p > odds) [host, odds] = [o, p];
    }
    if (!host) continue;
    const pull = companyPull(ctx, c, room.id);
    for (const o of ctx.st.objectsInRoom.get(room.id)!) {
      const users = ctx.w.objects[o.id]!;
      if (users.length >= o.capacity) continue;
      for (const def of o.actions) {
        if (def.assigned && !bedAllowed(ctx, c, o, host)) continue;
        if (!k.actions.includes(def.id) || !usable(ctx, c, def)) continue;
        const score = scoreAction(ctx, c, def, room.id, others, false, night, pull) * odds - k.cost;
        if (score > 0) out.push({ def, object: o, room: room.id, knock: host.id, score });
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Deciding and running

/** Picks and starts the next action. Scheduled obligations come first, then the scoring. */
export function decide(ctx: Ctx, c: Contestant): void {
  const cer = ctx.data.schedule.ceremony;
  const m = timeOfDay(ctx.w.t);
  const critical = c.needs.bladder < ctx.data.needs.bladder.criticalBelow;
  if (!critical && m >= cer.at && m < cer.at + cer.minutes) {
    begin(ctx, c, { action: CEREMONY, object: null, room: cer.room, endAt: ctx.w.t - m + cer.at + cer.minutes });
    return;
  }

  const list = candidates(ctx, c);
  const [lo, hi] = ctx.data.actions.noise;
  for (const cand of list) cand.score *= between(ctx.w.rng, lo, hi);
  const ranked = list.filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, ctx.data.actions.topChoices);
  if (critical && ranked.length === 0) {
    begin(ctx, c, { action: WAIT, object: null, room: c.room, minutes: ctx.data.needs.bladder.waitMinutes });
    return;
  }
  if (ranked.length === 0 || ranked[0]!.score < ctx.data.actions.idle.score) {
    begin(ctx, c, { action: IDLE, object: null, room: c.room, minutes: ctx.data.actions.idle.minutes });
    return;
  }
  const choice = ranked[weightedIndex(ctx.w.rng, ranked.map((x) => x.score))]!;
  if (choice.meal) {
    begin(ctx, c, { action: MEAL, object: null, room: choice.room, minutes: ctx.data.schedule.mealMinutes, meal: choice.meal, food: foodFor(ctx, c) });
  } else {
    const def = choice.def!;
    if (choice.knock) {
      const host = ctx.w.contestants.find((o) => o.id === choice.knock)!;
      if (!knock(ctx, c, host, choice.room)) {
        begin(ctx, c, { action: AT_DOOR, object: null, room: c.room, minutes: ctx.data.social.knock.waitMinutes });
        return;
      }
    }
    begin(ctx, c, { action: def.id, object: choice.object?.id ?? null, room: choice.room, minutes: def.minutes });
  }
}

export interface Plan {
  action: string;
  object: string | null;
  room: string;
  minutes?: number; // how long once there (undefined: until its own end condition)
  endAt?: number; // or a fixed end time
  meal?: MealDef;
  food?: string;
}

export function begin(ctx: Ctx, c: Contestant, p: Plan): void {
  const t = ctx.w.t;
  const walk = walkMinutes(ctx.st, c.room, p.room);
  const a: Activity = {
    action: p.action,
    object: p.object,
    room: p.room,
    phase: 'walk',
    startedAt: t,
    arriveAt: t + walk,
    minutes: p.endAt === undefined ? (p.minutes ?? null) : null,
    endAt: p.endAt ?? null,
  };
  if (p.meal) a.meal = p.meal.id;
  if (p.food) a.food = p.food;
  if (p.object) ctx.w.objects[p.object]!.push(c.id);
  c.activity = a;
  log(ctx, 'act.start', [c.id], p.room, { action: p.action, ...(p.object ? { object: p.object } : {}), walk });
  if (walk === 0) arrive(ctx, c);
}

function arrive(ctx: Ctx, c: Contestant): void {
  const a = c.activity!;
  c.room = a.room;
  if (c.guest && c.guest.room !== a.room) {
    log(ctx, 'guest_leave', [c.id, c.guest.host], c.guest.room);
    c.guest = null;
  }
  a.phase = 'do';
  if (a.minutes !== null) a.endAt = ctx.w.t + a.minutes;
  if (a.action === MEAL) c.eaten[ctx.data.schedule.meals.find((m) => m.id === a.meal)!.group] = dayOf(ctx.w.t);
  const def = actionDef(ctx, a);
  if (def?.kind === 'sleep') c.asleep = true;
}

/** Ends the current activity. Completion effects only apply when it finished properly. */
export function endActivity(ctx: Ctx, c: Contestant, how: 'done' | 'interrupted' | 'woke'): void {
  const a = c.activity;
  if (!a) return;
  if (how === 'done' && a.phase === 'do') {
    const def = actionDef(ctx, a);
    if (def?.kind === 'toilet') c.needs.bladder = 100;
    if (def?.kind === 'thermostat') setThermostat(ctx, c, a.room);
    if (a.action === MEAL) log(ctx, 'meal', [c.id], a.room, { meal: a.meal, food: a.food });
  }
  if (a.object) {
    const users = ctx.w.objects[a.object]!;
    const i = users.indexOf(c.id);
    if (i >= 0) users.splice(i, 1);
  }
  const doing = a.phase === 'do' ? ctx.w.t - a.arriveAt : 0;
  const walked = Math.min(ctx.w.t, a.arriveAt) - a.startedAt;
  log(ctx, 'act.end', [c.id], a.room, { action: a.action, how, minutes: doing, walk: walked });
  if (c.asleep) {
    c.asleep = false;
    log(ctx, 'wake', [c.id], a.room, { rest: Math.round(c.needs.rest) });
  }
  c.activity = null;
}

/** One minute of whatever the contestant is doing. */
export function runActivity(ctx: Ctx, c: Contestant): void {
  const a = c.activity;
  if (!a) return;
  const t = ctx.w.t;
  if (a.phase === 'walk') {
    if (t < a.arriveAt) return;
    arrive(ctx, c);
  }
  if (a.endAt !== null && t >= a.endAt) {
    endActivity(ctx, c, 'done');
    return;
  }
  const def = actionDef(ctx, a);
  if (a.action === MEAL) {
    addNeed(c, 'hunger', ctx.data.ranks.food[a.food!]!.hunger / ctx.data.schedule.mealMinutes);
  } else if (def) {
    if (def.kind === 'sleep') {
      addNeed(c, 'rest', (ctx.data.needs.sleep.restPerHour * def.quality!) / 60);
      if (c.needs.rest >= 100 && !isNight(ctx, t)) endActivity(ctx, c, 'done');
    } else if (def.minutes) {
      const gains = gainsOf(ctx.data, c, def);
      if (gains.length === 0) return;
      const others = def.company ? ctx.w.contestants.some((o) => o !== c && o.room === c.room) : true;
      for (const [n, g] of gains) {
        if (n === 'social' && !others) continue;
        addNeed(c, n, g / def.minutes);
      }
    }
  }
}

/** Comfort drifts toward the comfort of the current situation, over `minutes`. */
export function followComfort(ctx: Ctx, c: Contestant, minutes: number): void {
  const a = c.activity;
  const comfort = a && a.phase === 'do' ? actionDef(ctx, a)?.comfort : undefined;
  const target = situationComfort(ctx, c, c.room, comfort);
  const step = (ctx.data.needs.comfortFollowPerHour / 60) * minutes;
  const diff = target - c.needs.comfort;
  c.needs.comfort += Math.max(-step, Math.min(step, diff));
}
