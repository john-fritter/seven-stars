// Choosing, starting, running and ending actions. DESIGN.md Part two, Choosing actions.
//
//   score = (Σ u(n) × gain_n / 10 + pulls − costs) × personality × mood × noise
//
// Gains are capped at what the need can still take. A weighted pick among the top few follows.
import type { ActionDef, MealDef, Need } from '../data/schema.js';
import { drinkFun, drinkPull, finishDrink, hungoverFactor, qualityFor, soberFactor, stageMult } from './booze.js';
import { breakArrive, breakMinute, endBreak } from './breaks.js';
import { accessRank, canEnter, dayOf, effectOn, effectsToday, inRanks, isNightFor, log, noisy, timeOfDay, type Ctx } from './context.js';
import { gathering } from './schedule.js';
import { gainsOf, personalityOf, tagMult } from './derived.js';
import { feel, rel } from './ledger.js';
import { nothingLeft, seconds, serve, snackThere, takeSnack } from './pantry.js';
import { addNeed, companyWant, freshness, needUrgency, sleepLine, wearThin } from './needs.js';
import { between, chance, pick, weightedIndex } from './rng.js';
import { bedtime, labelOf, lovinArrive, morning } from './romance.js';
import { along, canSee, nextDoor, walkMinutes, type ObjectInstance } from './station.js';
import { actionPull, desperateEase, ownRepeats } from './ratings.js';
import { caughtIn, infraction, sneakCost } from './show.js';
import { askToShare, available, companyPull, expectedKnockOdds, guestOf, inPassing, knock, occupants, personPull, talkOdds } from './social.js';
import { discomfortAt, preferredSetting, setThermostat, situationComfort } from './temperature.js';
import { think } from './thoughts.js';
import { traitFx } from './traits.js';
import type { Activity, Contestant } from './types.js';

/** Scheduled actions that aren't advertised by objects. */
export const MEAL = 'meal';
export const CEREMONY = 'ceremony';
export const EVENT = 'event'; // the daily event (events.ts)
export const TRIAL = 'trial'; // a morning trial (trials.ts)
export const IDLE = 'idle';
export const BRUSHED_OFF = 'brushed_off'; // asked someone to talk and got a no
export const WAIT = 'wait'; // waiting for a toilet to free up
export const FIGHT = 'fight';
export const AT_DOOR = 'at_door'; // turned away after knocking
export const LOVIN = 'lovin'; // lumps under the covers (romance.ts)
export const SLEEPWALK = 'sleepwalk'; // a sleepwalker's wander (traits.yaml)
export const PASSED_OUT = 'passed_out'; // out cold where they fell (booze.yaml passOut)
export const LIE_AWAKE = 'lie_awake'; // woken in the night, staring at the ceiling (needs.yaml noise.lieAwake)

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
  talkTo?: string; // someone to ask for a conversation
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

function scoreAction(ctx: Ctx, c: Contestant, def: ActionDef, room: string, others: Map<string, number>, critical: boolean, night: boolean, pull: number, extra = 0): number {
  const a = ctx.data.actions;
  const walk = walkMinutes(ctx.st, c.room, room);
  if (critical) return def.kind === 'toilet' ? 100 - walk : 0; // nearest toilet wins

  let needs = 0;
  const chore = def.kind === 'sleep' || def.kind === 'toilet' || def.tags.includes(a.choreTag);
  // The people there pull only on things done with people; company fit on everything but chores.
  let pulls = (!chore && withPeople(def) ? pull : 0) + extra;
  if (!chore) pulls += companyFit(ctx, c, room, def);
  for (const [n, g] of gainsOf(ctx.data, c, def)) {
    if (n === 'social') continue; // company fit covers it
    needs += needTerm(ctx, c, n, g * freshness(ctx, c, def.id, n));
  }
  if (def.kind === 'sleep') {
    needs += needTerm(ctx, c, 'rest', (100 - c.needs.rest) * def.quality!);
    if (night) pulls += a.nightSleepPull * def.quality!;
  } else if (def.kind === 'toilet') {
    needs += needTerm(ctx, c, 'bladder', 100);
  } else if (def.kind === 'drink') {
    needs += needTerm(ctx, c, 'fun', drinkFun(ctx, c, def));
    pulls += drinkPull(ctx, c, !!others.get(room));
  } else if (def.kind === 'thermostat') {
    const now = discomfortAt(ctx, c, ctx.w.rooms[room]!.temp);
    const after = discomfortAt(ctx, c, preferredSetting(ctx, c));
    needs += needTerm(ctx, c, 'comfort', (now - after) * ctx.data.temperature.comfortPerDegree);
  }
  // A chore's comfort (a hot shower) counts only as far as they need what it's for: the clean don't shower to feel better.
  const comfort = needTerm(ctx, c, 'comfort', situationComfort(ctx, c, room, def.comfort) - c.needs.comfort);
  needs += chore && def.kind === 'timed' ? comfort * needFor(ctx, c, def) : comfort;

  let costs = walk * a.walkCostPerMinute + (def.speciesCost[c.species] ?? def.cost);
  if (def.tags.includes('exposed') && !def.private && others.get(room)) costs += (c.modesty / 10) * a.modestyCost;

  const enough = def.kind === 'drink' ? soberFactor(ctx, c) * hungoverFactor(ctx, c) * traitFx(ctx.data, c).drink : 1;
  const after = def.nightTags.length && isNightFor(ctx, c, ctx.w.t) ? tagMult(ctx.data, c, def.nightTags) : 1; // the hot tub after hours
  // A performance gets old for the performer: the stage gets passed around.
  const encore = def.logs ? ctx.data.actions.encore ** ownRepeats(ctx, c, def.logs) : 1;
  // Pastimes wear thin: their whole appeal fades with use (needs.yaml tolerance.appealFloor).
  const fresh = pastime(ctx, def) ? Math.max(ctx.data.needs.tolerance.appealFloor, 1 - (c.tolerance[def.id] ?? 0)) : 1;
  // Playing for the cameras: whatever scores pulls harder as the meter falls (ratings.ts).
  return ((needs + pulls) * fresh - costs) * spice(ctx, c, def.tags) * personalityOf(ctx.data, c, def) * after * desperateEase(ctx, c, def) * moodMult(ctx, c, def.tags) * enough * encore + actionPull(ctx, c, def);
}

/** How much of what an action gives they actually need, 0..1 (1 if it gives nothing). */
function needFor(ctx: Ctx, c: Contestant, def: ActionDef): number {
  let want = 0;
  let total = 0;
  for (const [n, g] of gainsOf(ctx.data, c, def)) {
    if (g <= 0 || n === 'social') continue;
    total += g;
    want += Math.min(g, 100 - c.needs[n]);
  }
  return total > 0 ? want / total : 1;
}

/** A pastime: something done for its own sake, which wears thin with use. */
function pastime(ctx: Ctx, def: ActionDef): boolean {
  return def.kind === 'timed' && !!def.minutes && !def.tags.includes(ctx.data.actions.choreTag) && def.id !== ctx.data.social.company.talk.action;
}

/** How bored they are, 0..1 (needs.yaml boredom). */
export function boredom(ctx: Ctx, c: Contestant): number {
  const b = ctx.data.needs.boredom;
  return b ? Math.max(0, Math.min(1, (b.below - c.needs.fun) / b.below)) : 0;
}

/** The bored lean toward whatever stirs things up. */
function spice(ctx: Ctx, c: Contestant, tags: readonly string[]): number {
  const b = ctx.data.needs.boredom;
  const x = boredom(ctx, c);
  if (!b || x === 0) return 1;
  let m = 1;
  for (const t of tags) if (b.tags[t]) m *= 1 + b.tags[t]! * x;
  return m;
}

/** Done with people: dancing, the bar, the hot tub, games, a conversation. */
function withPeople(def: ActionDef): boolean {
  return def.company || def.tags.includes('social') || def.tags.includes('crowd');
}

/**
 * Company fit (social.yaml company): how far the option moves them toward the company that feels
 * right. fit × want, where want is + lonely, − worn out; + where people are awake, − alone.
 */
function companyFit(ctx: Ctx, c: Contestant, room: string, def: ActionDef, talk = false): number {
  const want = companyWant(ctx, c);
  if (want === 0) return 0;
  let n = 0;
  for (const o of ctx.w.contestants) if (o !== c && (o.activity?.room ?? o.room) === room && !o.asleep) n++;
  const presence = talk ? 1.5 : n > 0 ? (withPeople(def) ? 1 : 0.6) : -1;
  return ctx.data.social.company.fit * want * presence;
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
  const cancelled = effectsToday(ctx).flatMap((id) => ctx.data.wheel.effects[id]!.meals);
  return ctx.data.schedule.meals.filter((meal) => !cancelled.includes(meal.id) && m >= meal.from && m < meal.to && c.eaten[meal.group] !== day && inRanks(r, meal.ranks) && canEnter(ctx, c, meal.room));
}

export function usable(ctx: Ctx, c: Contestant, def: ActionDef): boolean {
  if (def.onlySpecies && !def.onlySpecies.includes(c.species)) return false;
  if (def.notSpecies?.includes(c.species)) return false;
  if ((def.when && !effectOn(ctx, def.when)) || (def.unless && effectOn(ctx, def.unless))) return false;
  if (def.takes && !snackThere(ctx, c, def.takes)) return false;
  return inRanks(accessRank(ctx, c), def.ranks);
}

/** Bedtime: their night, or the body clock saying it's nearly time (needs.yaml sleep.clock.bedtime). */
function bedtimeFor(ctx: Ctx, c: Contestant): boolean {
  return isNightFor(ctx, c, ctx.w.t) || sleepLine(ctx, c, ctx.w.t) >= ctx.data.needs.sleep.clock.bedtime;
}

/** Sleep is only a choice once they're tired enough for the time of day (the body clock). */
function napOk(ctx: Ctx, c: Contestant, def: ActionDef): boolean {
  return def.kind !== 'sleep' || c.needs.rest < sleepLine(ctx, c, ctx.w.t);
}

/** A bed `c` may use: their own, or their host's when it sleeps two. */
function bedAllowed(ctx: Ctx, c: Contestant, o: ObjectInstance, host: Contestant | undefined): boolean {
  if (c.bed === o.id) return true;
  return !!host && host.bed === o.id && o.capacity > 1;
}

/** Whose bed this is, if anyone's. */
function ownerOf(ctx: Ctx, o: ObjectInstance): Contestant | undefined {
  return ctx.w.contestants.find((x) => x.bed === o.id);
}

/**
 * How `c` feels about sharing a bed with `mate`: welcome with someone they fancy, unwelcome
 * otherwise. pull × (attraction − neutral) ÷ 10 + a bonus for their label.
 */
export function bedmateFeeling(ctx: Ctx, c: Contestant, mate: Contestant): number {
  const s = ctx.data.needs.sleep.share;
  return (s.pull * ((rel(c, mate)?.attraction ?? 0) - s.neutral)) / 10 + (s.labels[labelOf(c, mate)] ?? 0);
}

/**
 * Who'd be in this bed with them: whoever's in it or heading there, and its owner if it isn't theirs,
 * unless the owner is already in (or heading for) another bed.
 */
function bedmates(ctx: Ctx, c: Contestant, o: ObjectInstance): Contestant[] {
  const ids = new Set(ctx.w.objects[o.id]!.filter((id) => id !== c.id));
  const owner = ownerOf(ctx, o);
  const away = owner?.activity && owner.activity.object !== o.id && (owner.activity.action === LOVIN || actionDef(ctx, owner.activity)?.kind === 'sleep');
  if (owner && owner !== c && !away) ids.add(owner.id);
  return ctx.w.contestants.filter((x) => ids.has(x.id));
}

/**
 * Extra pull on a bed: how they feel about the bedmates (choosing where to spend the night, not
 * a nap), and the cost of someone noisy in there right now.
 */
function bedExtra(ctx: Ctx, c: Contestant, o: ObjectInstance, def: ActionDef, night: boolean): number {
  if (def.kind !== 'sleep') return 0;
  let x = 0;
  if (def.assigned && night) for (const m of bedmates(ctx, c, o)) x += bedmateFeeling(ctx, c, m);
  const din = noiseAt(ctx, c, o.room);
  if (din) x -= ctx.data.needs.sleep.noise.cost * din.k;
  return x;
}

function hostOf(ctx: Ctx, c: Contestant): Contestant | undefined {
  const g = c.guest;
  return g ? ctx.w.contestants.find((o) => o.id === g.host) : undefined;
}

function candidates(ctx: Ctx, c: Contestant): Candidate[] {
  const out: Candidate[] = [];
  const others = company(ctx, c);
  const critical = c.needs.bladder < ctx.data.needs.bladder.criticalBelow;
  const night = bedtimeFor(ctx, c);
  const host = hostOf(ctx, c);
  for (const room of ctx.st.rooms) {
    // Rooms above their rank are a choice too, at the risk of an infraction; never when the
    // bladder is critical, never the robots' rooms, and never out of the fishbowl.
    const sneak = !canEnter(ctx, c, room.id);
    if (sneak && (critical || c.confined || room.access === 'robots')) continue;
    const risk = sneak && !caughtIn(ctx, c, room.id) ? sneakCost(ctx, c) : 0;
    const pull = critical ? 0 : companyPull(ctx, c, room.id);
    const guestHere = c.guest?.room === room.id;
    const guest = guestHere && !(c.bed !== null && ctx.st.object.get(c.bed)!.room === room.id);
    for (const o of ctx.st.objectsInRoom.get(room.id)!) {
      const users = ctx.w.objects[o.id]!;
      if (users.length >= o.capacity && !users.includes(c.id)) continue;
      for (const def of o.actions) {
        if (def.assigned && !bedAllowed(ctx, c, o, guestHere ? host : undefined)) continue;
        if (def.kind === 'thermostat' && (sneak || guest || preferredSetting(ctx, c) === ctx.w.rooms[room.id]!.setting)) continue;
        if (!usable(ctx, c, def) || !napOk(ctx, c, def)) continue;
        // The night pull is for a bed of their own (or their host's), not the nearest couch.
        const bedtime = night && (def.assigned || o.id === c.bed);
        const score = scoreAction(ctx, c, def, room.id, others, critical, bedtime, pull, bedExtra(ctx, c, o, def, night)) - risk;
        out.push({ def, object: o, room: room.id, score });
      }
    }
  }
  if (critical) return out;
  // One invitation at a time: a guest leaves before knocking anywhere else.
  if (!c.confined && !(c.guest && c.room === c.guest.room)) knockCandidates(ctx, c, others, night, out);
  if (!c.confined && !c.guest) shareCandidates(ctx, c, others, night, out);
  if (!c.confined) talkCandidates(ctx, c, out);
  for (const def of ctx.st.personal) {
    if (def.id === ctx.data.social.company.talk.action) continue;
    if (usable(ctx, c, def)) out.push({ def, object: null, room: c.room, score: scoreAction(ctx, c, def, c.room, others, false, night, companyPull(ctx, c, c.room)) });
  }
  for (const meal of openMeals(ctx, c)) out.push({ def: null, object: null, room: meal.room, meal, score: mealScore(ctx, c, meal) });
  return out;
}

/**
 * Talking with someone (social.yaml company.talk): anyone free within a few minutes' walk, in a
 * room they can go into. Scored for the company it gives, the pull of that person and how fresh
 * time with them still is, × the odds they say yes.
 */
function talkCandidates(ctx: Ctx, c: Contestant, out: Candidate[]): void {
  const k = ctx.data.social.company.talk;
  const def = ctx.st.personal.find((d) => d.id === k.action);
  if (!def) return;
  const pm = personalityOf(ctx.data, c, def) * moodMult(ctx, c, def.tags);
  for (const o of ctx.w.contestants) {
    if (o === c || !available(ctx, o) || o.confined || !canEnter(ctx, c, o.room) || !c.ledger[o.id]) continue;
    if (o.activity?.action === k.action || isGathering(o.activity!.action)) continue;
    const walk = walkMinutes(ctx.st, c.room, o.room);
    if (walk > k.within) continue;
    const fresh = Math.max(0.1, 1 - (c.tolerance[talkKey(o.id)] ?? 0));
    const score = (k.pull * fresh + personPull(ctx, c, o, o.room) + companyFit(ctx, c, o.room, def, true) - walk * ctx.data.actions.walkCostPerMinute) * pm * talkOdds(ctx, o, c);
    if (score > 0) out.push({ def, object: null, room: o.room, talkTo: o.id, score });
  }
}

const talkKey = (id: string) => `talk:${id}`;

function isGathering(action: string): boolean {
  return action === MEAL || action === CEREMONY || action === EVENT || action === TRIAL;
}

/** They said yes: both talk where the other one is, for the action's minutes. */
function beginTalk(ctx: Ctx, c: Contestant, o: Contestant, def: ActionDef): void {
  const room = o.room;
  endActivity(ctx, o, 'interrupted');
  const walk = walkMinutes(ctx.st, c.room, room);
  begin(ctx, o, { action: def.id, object: null, room, minutes: walk + def.minutes!, partner: c.id });
  begin(ctx, c, { action: def.id, object: null, room, minutes: def.minutes!, partner: o.id });
  log(ctx, 'talk', [c.id, o.id], room);
}

/**
 * Bedrooms `c` can't enter but could knock on: each action there is scored as if they were
 * let in, × the odds they expect from the most promising occupant (for a bed, from its owner),
 * minus the awkwardness of asking.
 */
function knockCandidates(ctx: Ctx, c: Contestant, others: Map<string, number>, night: boolean, out: Candidate[]): void {
  const k = ctx.data.social.knock;
  for (const room of ctx.st.rooms) {
    if (room.access !== 'occupants' || canEnter(ctx, c, room.id)) continue;
    let best: Contestant | undefined;
    let bestOdds = 0;
    for (const o of occupants(ctx, room.id, c)) {
      const p = expectedKnockOdds(ctx, c, o);
      if (p > bestOdds) [best, bestOdds] = [o, p];
    }
    if (!best) continue;
    const pull = companyPull(ctx, c, room.id);
    for (const o of ctx.st.objectsInRoom.get(room.id)!) {
      const users = ctx.w.objects[o.id]!;
      if (users.length >= o.capacity) continue;
      const owner = ownerOf(ctx, o);
      const host = o.actions.some((d) => d.assigned) && owner && owner !== c ? owner : best;
      const odds = host === best ? bestOdds : expectedKnockOdds(ctx, c, host);
      for (const def of o.actions) {
        if (def.assigned && !bedAllowed(ctx, c, o, host)) continue;
        if (!k.actions.includes(def.id) || !usable(ctx, c, def) || !napOk(ctx, c, def)) continue;
        const score = scoreAction(ctx, c, def, room.id, others, false, night, pull, bedExtra(ctx, c, o, def, night)) * odds - k.cost;
        if (score > 0) out.push({ def, object: o, room: room.id, knock: host.id, score });
      }
    }
  }
}

/**
 * Roommates' beds: every bed sleeps two, so they can ask to climb in. Scored like a knock: the
 * bed's score × the odds they expect, minus the awkwardness of asking.
 */
function shareCandidates(ctx: Ctx, c: Contestant, others: Map<string, number>, night: boolean, out: Candidate[]): void {
  if (c.bed === null) return;
  const k = ctx.data.social.knock;
  const roomId = ctx.st.object.get(c.bed)!.room;
  const pull = companyPull(ctx, c, roomId);
  for (const host of occupants(ctx, roomId, c)) {
    const o = ctx.st.object.get(host.bed!)!;
    if (o.id === c.bed || ctx.w.objects[o.id]!.length >= o.capacity || guestOf(ctx, host)) continue;
    const odds = expectedKnockOdds(ctx, c, host);
    for (const def of o.actions) {
      if (def.kind !== 'sleep' || !usable(ctx, c, def) || !napOk(ctx, c, def)) continue;
      const score = scoreAction(ctx, c, def, roomId, others, false, night, pull, bedExtra(ctx, c, o, def, night)) * odds - k.cost;
      if (score > 0) out.push({ def, object: o, room: roomId, knock: host.id, score });
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Deciding and running

/** Picks and starts the next action. Scheduled obligations come first, then the scoring. */
export function decide(ctx: Ctx, c: Contestant): void {
  const critical = c.needs.bladder < ctx.data.needs.bladder.criticalBelow;
  const g = critical || c.confined ? null : gathering(ctx);
  if (g) {
    begin(ctx, c, g);
    return;
  }

  const list = candidates(ctx, c);
  const [lo, hi] = ctx.data.actions.noise;
  for (const cand of list) cand.score *= between(ctx.w.rng, lo, hi);
  const sorted = list.filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
  // A weighted pick among the best few, but only those close to the best: nobody picks a far worse option on a whim.
  const ranked = sorted.slice(0, ctx.data.actions.topChoices).filter((x) => x.score >= sorted[0]!.score * ctx.data.actions.withinOfBest);
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
    if (choice.talkTo) {
      const o = ctx.w.contestants.find((x) => x.id === choice.talkTo)!;
      if (chance(ctx.w.rng, talkOdds(ctx, o, c))) beginTalk(ctx, c, o, def);
      else {
        think(ctx, c, ctx.data.social.company.talk.refused, o.id);
        log(ctx, 'brush_off', [c.id, o.id], o.room);
        begin(ctx, c, { action: BRUSHED_OFF, object: null, room: c.room, minutes: ctx.data.social.knock.waitMinutes });
      }
      return;
    }
    if (choice.knock) {
      const host = ctx.w.contestants.find((o) => o.id === choice.knock)!;
      const asked = canEnter(ctx, c, choice.room) ? askToShare(ctx, c, host, choice.room) : knock(ctx, c, host, choice.room, def.kind === 'sleep');
      if (!asked) {
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
  partner?: string;
  length?: number;
}

export function begin(ctx: Ctx, c: Contestant, p: Plan): void {
  const t = ctx.w.t;
  const walk = Math.round(walkMinutes(ctx.st, c.room, p.room) * stageMult(ctx, c, 'walk')); // hammered people stumble
  const a: Activity = {
    action: p.action,
    object: p.object,
    room: p.room,
    phase: 'walk',
    startedAt: t,
    from: c.room,
    arriveAt: t + walk,
    minutes: p.endAt === undefined ? (p.minutes ?? null) : null,
    endAt: p.endAt ?? null,
  };
  if (p.meal) a.meal = p.meal.id;
  if (p.food) a.food = p.food;
  if (p.partner) a.partner = p.partner;
  if (p.length) a.length = p.length;
  const def = p.object ? ctx.st.object.get(p.object)!.actions.find((d) => d.id === p.action) : undefined;
  if (def?.kind === 'drink') a.booze = qualityFor(ctx, c, def.booze!);
  if (p.object) ctx.w.objects[p.object]!.push(c.id);
  c.activity = a;
  log(ctx, 'act.start', [c.id], p.room, { action: p.action, ...(p.object ? { object: p.object } : {}), walk });
  if (walk === 0) arrive(ctx, c);
}

function arrive(ctx: Ctx, c: Contestant): void {
  const a = c.activity!;
  if (c.room !== a.room) (ctx.w.show.seen[c.room] ??= {})[c.id] = ctx.w.t; // for "seen near the victim"
  c.room = a.room;
  if (c.guest && c.guest.room !== a.room) {
    log(ctx, 'guest_leave', [c.id, c.guest.host], c.guest.room);
    c.guest = null;
  }
  a.phase = 'do';
  // The cameras see everything: walking in above your rank is logged the moment it happens.
  if (!canEnter(ctx, c, a.room) && !caughtIn(ctx, c, a.room)) infraction(ctx, c, 'above_rank', a.room, 0, { doing: a.action });
  if (a.minutes !== null) a.endAt = ctx.w.t + a.minutes;
  if (a.action === MEAL) {
    const group = ctx.data.schedule.meals.find((m) => m.id === a.meal)!.group;
    c.eaten[group] = dayOf(ctx.w.t);
    if (serve(ctx, c, a, group) <= 0) {
      nothingLeft(ctx, c, a);
      endActivity(ctx, c, 'interrupted');
      return;
    }
  }
  const def = actionDef(ctx, a);
  if (def?.takes && !takeSnack(ctx, c, def.takes, a.room)) {
    endActivity(ctx, c, 'interrupted');
    return;
  }
  if (def?.kind === 'sleep') c.asleep = true;
  if (a.action === LOVIN) lovinArrive(ctx, c);
  if (c.breakdown && a.action === c.breakdown.kind) breakArrive(ctx, c);
  if (def?.kind === 'sleep' && def.assigned) bedtime(ctx, c);
}

/** Ends the current activity. Completion effects only apply when it finished properly. */
export function endActivity(ctx: Ctx, c: Contestant, how: 'done' | 'interrupted' | 'woke'): void {
  const a = c.activity;
  if (!a) return;
  const def = a.phase === 'do' ? actionDef(ctx, a) : undefined;
  if (how === 'done' && a.phase === 'do') {
    if (def?.kind === 'toilet') c.needs.bladder = 100;
    if (def?.kind === 'thermostat') setThermostat(ctx, c, a.room);
    if (def?.kind === 'drink') finishDrink(ctx, c, a.booze!, a.room);
    if (a.action === MEAL) {
      log(ctx, 'meal', [c.id], a.room, { meal: a.meal, food: a.food, ...(a.portion !== undefined && a.portion < 1 ? { portion: Math.round(a.portion * 100) / 100 } : {}), ...(a.seconds ? { seconds: true } : {}) });
      const thought = ctx.data.ranks.food[a.food!]!.thought;
      if (thought) think(ctx, c, thought);
    }
    // What it took out of them (needs.yaml exertion): a fight, lovin', the toilet.
    const cost = ctx.data.needs.exertion[a.action]?.cost;
    if (cost) for (const n in cost) addNeed(c, n as Need, cost[n as Need]!);
    if (def?.logs) log(ctx, def.logs, [c.id], a.room);
    if (def?.thought && def.kind !== 'sleep') think(ctx, c, def.thought);
    // Got away with something risky: the brave get a rush.
    const risky = ctx.data.thoughts.moments.risky;
    if (def && (def.tags.includes(risky.tag) || (def.nightTags.includes(risky.tag) && isNightFor(ctx, c, ctx.w.t)))) think(ctx, c, risky.thought);
    // Seen in the shower (or on an open toilet): the modest mind.
    if (def?.tags.includes('exposed') && !def.private && ctx.w.contestants.some((o) => o !== c && canSee(ctx.st, o.room, c.room) && !o.asleep)) {
      think(ctx, c, ctx.data.actions.modestyThought);
      const enjoyed = traitFx(ctx.data, c).exposedThought; // an exhibitionist enjoys it
      if (enjoyed) think(ctx, c, enjoyed);
    }
  }
  if (def?.kind === 'sleep') wokeUp(ctx, c, a, def);
  if (c.breakdown && a.action === c.breakdown.kind) endBreak(ctx, c);
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
    const mate = a.bedmate ? ctx.w.contestants.find((o) => o.id === a.bedmate) : undefined;
    log(ctx, 'wake', [c.id], a.room, {
      rest: Math.round(c.needs.rest),
      slept: doing,
      ...(mate ? { bedmate: mate.id, glad: bedmateFeeling(ctx, c, mate) >= 0 } : {}),
      ...(a.kept ? { kept: a.kept } : {}),
    });
  }
  c.activity = null;
  // Lovin' takes two: if one of them is called away, it's off for both.
  if (a.action === LOVIN && how !== 'done') {
    const p = ctx.w.contestants.find((o) => o.id === a.partner);
    if (p?.activity?.action === LOVIN && p.activity.partner === c.id) endActivity(ctx, p, how);
  }
  // Waking after a night in a bed with someone still in it.
  if (def?.kind === 'sleep' && def.assigned && how !== 'interrupted' && doing >= ctx.data.thoughts.sleepMinutes) morning(ctx, c, a.object!);
  // Lovin' in a bed at night: afterwards they sleep right there.
  if (a.action === LOVIN && how === 'done' && a.object && isNightFor(ctx, c, ctx.w.t)) {
    const sleep = ctx.st.object.get(a.object)!.actions.find((d) => d.kind === 'sleep');
    if (sleep) begin(ctx, c, { action: sleep.id, object: a.object, room: a.room, partner: a.partner });
  }
}

/** Whether they're making a racket: a snorer or hummer, or someone doing something loud. */
function racket(ctx: Ctx, o: Contestant): boolean {
  if (noisy(ctx, o)) return true;
  const a = o.activity;
  return !o.asleep && a?.phase === 'do' && !!actionDef(ctx, a)?.loud;
}

/** The noise a sleeper in `room` would hear: in the room at full strength, next door through the wall. */
function noiseAt(ctx: Ctx, c: Contestant, room: string): { who: Contestant; k: number } | null {
  const near = ctx.w.contestants.find((o) => o !== c && o.room === room && racket(ctx, o));
  if (near) return { who: near, k: 1 };
  const walls = nextDoor(ctx.st, room);
  const far = walls.length ? ctx.w.contestants.find((o) => o !== c && walls.includes(o.room) && racket(ctx, o)) : undefined;
  return far ? { who: far, k: ctx.data.needs.sleep.noise.throughWall } : null;
}

/** Thoughts on waking: where they slept, who beside them, and who kept them up. */
function wokeUp(ctx: Ctx, c: Contestant, a: Activity, def: ActionDef): void {
  const night = ctx.w.t - a.arriveAt >= ctx.data.thoughts.sleepMinutes;
  // A night (or a long nap) leaves a thought about where they slept.
  if (def.thought && night) think(ctx, c, def.thought);
  const s = ctx.data.needs.sleep;
  const mate = a.bedmate ? ctx.w.contestants.find((o) => o.id === a.bedmate) : undefined;
  if (mate && night) think(ctx, c, bedmateFeeling(ctx, c, mate) >= 0 ? s.share.good : s.share.bad, mate.id);
  const culprit = a.kept ? ctx.w.contestants.find((o) => o.id === a.kept) : undefined;
  if (culprit) {
    think(ctx, c, s.noise.thought, culprit.id);
    feel(ctx, c, culprit, 'affection', s.noise.affection, 'kept_up');
  }
}

/**
 * A minute of walking: they're in whichever space the path has reached (a corridor, the common
 * room), where others can see them go by, and may have a word with someone in passing.
 */
function passThrough(ctx: Ctx, c: Contestant, a: Activity): void {
  if (!a.from) return;
  const walk = a.arriveAt - a.startedAt;
  const here = along(ctx.st, a.from, a.room, (ctx.w.t - a.startedAt + 0.5) / walk);
  if (!here || here.space === a.room || here.space === c.room) return;
  (ctx.w.show.seen[c.room] ??= {})[c.id] = ctx.w.t; // for "seen near the victim"
  c.room = here.space;
  // Cutting through a room above their rank (the lounge on the way to the spa) is being in it.
  if (!canEnter(ctx, c, c.room) && !caughtIn(ctx, c, c.room)) infraction(ctx, c, 'above_rank', c.room, 0, { doing: a.action, passing: true });
  inPassing(ctx, c);
}

function mealGroup(ctx: Ctx, a: Activity): string {
  return ctx.data.schedule.meals.find((m) => m.id === a.meal)!.group;
}

/** One minute of whatever the contestant is doing. */
export function runActivity(ctx: Ctx, c: Contestant): void {
  const a = c.activity;
  if (!a) return;
  const t = ctx.w.t;
  if (a.phase === 'walk') {
    if (t < a.arriveAt) return passThrough(ctx, c, a);
    arrive(ctx, c);
    if (c.activity !== a) return; // nothing left when they got there
  }
  if (a.endAt !== null && t >= a.endAt && !(a.action === MEAL && seconds(ctx, c, a, mealGroup(ctx, a)))) {
    endActivity(ctx, c, 'done');
    return;
  }
  const def = actionDef(ctx, a);
  if (a.action === LOVIN) {
    // Waiting for the other one: if they've gone off and done something else, it's off.
    const p = ctx.w.contestants.find((o) => o.id === a.partner);
    if (a.endAt === null && (p?.activity?.action !== LOVIN || p.activity.partner !== c.id)) endActivity(ctx, c, 'interrupted');
  } else if (a.action === ctx.data.social.company.talk.action && a.phase === 'do') {
    // A conversation lasts while the other one is still in it with them.
    const p = ctx.w.contestants.find((o) => o.id === a.partner);
    const theirs = p?.activity;
    if (!p || theirs?.action !== a.action || theirs.partner !== c.id) return endActivity(ctx, c, 'interrupted');
    // Time with the same person gets less fresh, like a pastime.
    const tol = ctx.data.needs.tolerance;
    c.tolerance[talkKey(p.id)] = Math.min(1, (c.tolerance[talkKey(p.id)] ?? 0) + tol.perUse / 30);
  } else if (a.action === MEAL) {
    addNeed(c, 'hunger', a.bite ?? ctx.data.ranks.food[a.food!]!.hunger / ctx.data.schedule.mealMinutes);
  } else if (c.breakdown && a.action === c.breakdown.kind) {
    breakMinute(ctx, c);
  } else if (def) {
    if (def.kind === 'drink') addNeed(c, 'fun', ctx.data.booze.qualities[a.booze!]!.fun / def.minutes!);
    if (def.kind === 'sleep') {
      if (sleepMinute(ctx, c, a, def)) return;
      // By day the body clock wakes them once they're past the line; by night, only rested and the chime do.
      if (!isNightFor(ctx, c, t) && c.needs.rest >= Math.min(100, sleepLine(ctx, c, t) + ctx.data.needs.sleep.clock.margin)) endActivity(ctx, c, 'done');
    } else if (def.minutes) {
      const gains = gainsOf(ctx.data, c, def);
      if (gains.length === 0) {
        if (pastime(ctx, def)) wearThin(ctx, c, def.id, def.minutes);
        return;
      }
      const others = def.company ? ctx.w.contestants.some((o) => o !== c && o.room === c.room) : true;
      let worn = false;
      for (const [n, g] of gains) {
        if (n === 'social' && !others) continue;
        const f = freshness(ctx, c, def.id, n);
        if (ctx.data.needs.tolerance.needs.includes(n)) worn = true;
        addNeed(c, n, (g * f) / def.minutes);
      }
      if (worn || pastime(ctx, def)) wearThin(ctx, c, def.id, def.minutes);
    }
  }
}

/**
 * A minute asleep: rest, unless someone noisy in the room is cutting into it (and might wake
 * them). Notes who's beside them. Returns true if they were woken.
 */
function sleepMinute(ctx: Ctx, c: Contestant, a: Activity, def: ActionDef): boolean {
  const s = ctx.data.needs.sleep;
  let gain = (s.restPerHour * def.quality!) / 60;
  if (a.object && def.assigned && !a.bedmate) {
    const mate = ctx.w.objects[a.object]!.find((id) => id !== c.id && ctx.w.contestants.find((o) => o.id === id)?.asleep);
    if (mate) a.bedmate = mate;
  }
  const din = noiseAt(ctx, c, c.room);
  if (din) {
    const culprit = din.who;
    gain *= 1 - (1 - s.noise.restMult) * din.k;
    a.kept = culprit.id;
    if (chance(ctx.w.rng, s.noise.wakeChance * din.k)) {
      log(ctx, 'kept_up', [c.id, culprit.id], c.room, { noise: traitFx(ctx.data, culprit).noise ?? culprit.activity?.action, ...(din.k < 1 ? { wall: true } : {}) });
      endActivity(ctx, c, 'woke');
      // Woken in the night (and not taken up with whoever's beside them), they lie there a while.
      if (!c.activity && s.noise.lieAwake && isNightFor(ctx, c, ctx.w.t)) begin(ctx, c, { action: LIE_AWAKE, object: null, room: c.room, minutes: s.noise.lieAwake });
      return true;
    }
  }
  addNeed(c, 'rest', gain);
  // A bad spot to sleep (the couch, the fishbowl floor) wakes them now and then.
  const r = s.clock.restless;
  if ((def.comfort ?? 100) < r.below && chance(ctx.w.rng, r.perHour / 60)) {
    log(ctx, 'restless', [c.id], c.room, { spot: a.object });
    endActivity(ctx, c, 'woke');
    return true;
  }
  return false;
}

/**
 * Every hour asleep, a sleepwalker may get up and wander off to another room they're allowed in,
 * then find their way back to bed (or not) like anyone else.
 */
export function sleepwalk(ctx: Ctx, c: Contestant): void {
  const sw = traitFx(ctx.data, c).sleepwalk;
  if (!sw || !c.asleep || c.confined || !chance(ctx.w.rng, sw.perHour)) return;
  const rooms = ctx.st.rooms.filter((r) => r.id !== c.room && r.access !== 'robots' && canEnter(ctx, c, r.id));
  if (!rooms.length) return;
  const to = pick(ctx.w.rng, rooms).id;
  const from = c.room;
  endActivity(ctx, c, 'interrupted');
  log(ctx, 'sleepwalk', [c.id], from, { to });
  begin(ctx, c, { action: SLEEPWALK, object: null, room: to, minutes: sw.minutes });
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
