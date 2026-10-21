// The show's enforcement: infractions, sentences, the fishbowl and spacings. DESIGN.md Part two,
// The meter and scoring, and Rank, privileges, rules and punishments.
//
// Detection is total: an infraction is logged the moment it happens and waits for the evening
// ceremony, where the guilty are sentenced in front of everyone.
import { CEREMONY, endActivity } from './actions.js';
import { dayOf, log, MINUTES_PER_DAY, timeOfDay, type Ctx } from './context.js';
import { addNeed } from './needs.js';
import { chance } from './rng.js';
import { feel } from './ledger.js';
import { addMeter } from './scoring.js';
import { think } from './thoughts.js';
import { found } from './trials.js';
import type { Body, Contestant } from './types.js';

/** Logs an infraction and holds it for the ceremony. `scored` is what the act itself earned them. */
export function infraction(ctx: Ctx, c: Contestant, rule: string, room: string, scored = 0): void {
  ctx.w.show.pending.push({ who: c.id, rule, t: ctx.w.t, room, scored });
  log(ctx, 'infraction', [c.id], room, { rule });
}

/** Already caught in this room since the last ceremony: the cameras don't count twice. */
export function caughtIn(ctx: Ctx, c: Contestant, room: string): boolean {
  return ctx.w.show.pending.some((x) => x.who === c.id && x.rule === 'above_rank' && x.room === room);
}

/**
 * The scoring cost of sneaking into a room above your rank:
 * cost × (1 + honestK × (honest − 5) ÷ 5) × (1 + braveK × (brave − 5) ÷ 5).
 */
export function sneakCost(ctx: Ctx, c: Contestant): number {
  const s = ctx.data.rules.sneak;
  const f = (k: number, axis: number) => Math.max(0, 1 + (k * (axis - 5)) / 5);
  return s.cost * f(s.honestK, c.personality.honest) * f(s.braveK, c.personality.brave);
}

// ---------------------------------------------------------------------------------------------
// The ceremony's enforcement steps, in order

/**
 * Anyone not at a gathering (the ceremony, the daily event, a trial) when it resolves skipped it,
 * asleep or not. The fishbowl counts as there. Returns who was.
 */
export function rollCall(ctx: Ctx, action = CEREMONY, room = ctx.data.schedule.ceremony.room, rule = 'skipped_ceremony'): Contestant[] {
  const here: Contestant[] = [];
  for (const c of ctx.w.contestants) {
    // Proposal: someone in the middle of a breakdown is excused.
    const ok = c.confined !== null || c.breakdown !== null || c.activity?.action === action || (c.room === room && !c.asleep);
    if (ok) here.push(c);
    else infraction(ctx, c, rule, c.room);
  }
  return here;
}

/** The step a contestant's infractions add up to: the worst one, one higher for each extra. */
export function sentenceStep(ctx: Ctx, rules: string[]): number {
  const r = ctx.data.rules;
  const worst = Math.max(...rules.map((x) => r.infractions[x]!.step));
  return Math.min(r.sentences.length, worst + rules.length - 1);
}

/**
 * "Tonight's infractions...": waivers for the gloriously entertaining, then one sentence per
 * contestant, its meter penalty applied on the spot. Returns who goes to the fishbowl.
 */
export function sentencing(ctx: Ctx): { c: Contestant; kind: 'night' | 'day' }[] {
  const r = ctx.data.rules;
  const room = ctx.data.schedule.ceremony.room;
  const pending = ctx.w.show.pending;
  ctx.w.show.pending = [];
  const fishbowl: { c: Contestant; kind: 'night' | 'day' }[] = [];
  for (const c of ctx.w.contestants) {
    const mine = pending.filter((x) => x.who === c.id);
    if (!mine.length) continue;
    const kept: string[] = [];
    for (const x of mine) {
      if (x.scored >= r.waiver.minPoints && chance(ctx.w.rng, r.waiver.chance)) log(ctx, 'waived', [c.id], room, { rule: x.rule, scored: x.scored });
      else kept.push(x.rule);
    }
    if (!kept.length) continue;
    const step = sentenceStep(ctx, kept);
    const s = r.sentences[step - 1]!;
    log(ctx, 'sentence', [c.id], room, { step, infractions: kept, ...(s.meter ? { meter: s.meter } : {}), ...(s.fishbowl ? { fishbowl: s.fishbowl } : {}) });
    think(ctx, c, r.sentencedThought);
    collective(ctx, c, kept);
    if (s.meter) addMeter(ctx, c, s.meter);
    if (s.fishbowl) fishbowl.push({ c, kind: s.fishbowl });
  }
  return fishbowl;
}

/**
 * Collective punishment: some infractions (theft from the shared food) cost everyone tomorrow,
 * and turn the station against whoever did it.
 */
function collective(ctx: Ctx, c: Contestant, rules: string[]): void {
  const defs = rules.map((x) => ctx.data.rules.infractions[x]!).filter((x) => x.collective.length);
  if (!defs.length) return;
  const day = dayOf(ctx.w.t) + 1;
  const effects = [...new Set(defs.flatMap((x) => x.collective))];
  for (const id of effects) ctx.w.show.effects[id] = day;
  const blame = Math.min(...defs.map((x) => x.blame));
  for (const o of ctx.w.contestants) if (o !== c) feel(ctx, o, c, 'affection', blame, 'punished for them');
  log(ctx, 'collective', [c.id], ctx.data.schedule.ceremony.room, { effects, day });
}

/** Anyone at zero is spaced, unless they hold an immunity. */
export function spacings(ctx: Ctx): void {
  // Decided before anyone goes, so points for watching one spacing can't save the next.
  for (const c of ctx.w.contestants.filter((x) => x.meter <= 0)) space(ctx, c, 'meter');
}

/**
 * The robots take someone to the airlock in front of everyone at `room`, unless they hold an
 * immunity, which is spent instead (proposal: one immunity cancels a spacing of any kind).
 * Returns whether they died.
 */
export function space(ctx: Ctx, c: Contestant, cause: string, room = ctx.data.schedule.ceremony.room): boolean {
  if (c.immunities > 0) {
    c.immunities--;
    log(ctx, 'immunity_spent', [c.id], c.room, { cause, left: c.immunities });
    return false;
  }
  const witnesses = ctx.w.contestants.filter((o) => o !== c && !o.asleep && (o.room === room || ctx.st.room.get(o.room)!.glass === room)).map((o) => o.id);
  kill(ctx, c, cause, room, witnesses);
  for (const o of ctx.w.contestants) if (witnesses.includes(o.id)) think(ctx, o, ctx.data.rules.spacing.watched);
  return true;
}

/**
 * Someone dies: the log, everyone's feelings about it, and they leave the world. A murder leaves
 * a body: found at once if someone saw it, otherwise where it fell until someone walks in.
 */
export function kill(ctx: Ctx, c: Contestant, cause: string, room: string, witnesses: string[], killer?: string): void {
  log(ctx, 'death', [c.id], room, { cause, name: c.name, stay: ctx.w.t - c.arrivedAt, meter: c.meter, witnesses, ...(killer ? { killer } : {}) });
  const rivalAt = ctx.data.social.ledger.rivalAt;
  const feelings: Body['feelings'] = {};
  for (const o of ctx.w.contestants) {
    if (o === c) continue;
    const affection = o.ledger[c.id]?.affection ?? 0;
    feelings[o.id] = { affection, enemy: affection <= rivalAt || (c.ledger[o.id]?.affection ?? 0) <= rivalAt };
  }
  if (cause === 'murder' && killer) {
    const t = ctx.w.t;
    const left = ctx.w.show.seen[room] ?? {};
    const window = ctx.data.trials.nearMinutes;
    const near = ctx.w.contestants.filter((o) => o !== c && (o.room === room || (left[o.id] ?? -Infinity) >= t - window)).map((o) => o.id);
    const body: Body = { id: c.id, name: c.name, room, t, killer, witnesses, near, feelings };
    remove(ctx, c);
    if (witnesses.length) found(ctx, body, null);
    else ctx.w.show.bodies.push(body);
    return;
  }
  mourn(ctx, c.id, feelings);
  remove(ctx, c);
}

/** Friends grieve, rivals gloat, everyone else is shaken. */
export function mourn(ctx: Ctx, id: string, feelings: Body['feelings']): void {
  const sp = ctx.data.rules.spacing;
  const l = ctx.data.social.ledger;
  for (const o of ctx.w.contestants) {
    if (o.id === id) continue;
    const aff = feelings[o.id]?.affection ?? 0;
    think(ctx, o, aff >= l.friendAt ? sp.friend : aff <= l.rivalAt ? sp.rival : sp.died, id);
  }
}

/** Takes a contestant out of the world: their objects, their guests, and others' feelings about them. */
function remove(ctx: Ctx, c: Contestant): void {
  endActivity(ctx, c, 'interrupted');
  c.breakdown = null;
  const w = ctx.w;
  // Hidden points (murder) come out when the killer dies.
  if (c.secret) {
    c.lifetime = Math.round((c.lifetime + c.secret) * 100) / 100;
    log(ctx, 'secret_revealed', [c.id], c.room, { points: c.secret, lifetime: c.lifetime });
    c.secret = 0;
  }
  w.contestants.splice(w.contestants.indexOf(c), 1);
  w.show.pending = w.show.pending.filter((x) => x.who !== c.id);
  for (const r of Object.values(w.show.seen)) delete r[c.id];
  for (const o of w.contestants) {
    delete o.ledger[c.id];
    delete o.knocked[c.id];
    const g = o.guest;
    if (g?.host === c.id) {
      o.guest = null;
      if (o.room === g.room || o.activity?.room === g.room) {
        endActivity(ctx, o, 'interrupted');
        o.room = ctx.data.schedule.ceremony.room;
        log(ctx, 'escorted', [o.id], o.room, { from: g.room });
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// The fishbowl

/** The robots escort someone into the glass cell, overnight or for a full day. */
export function confine(ctx: Ctx, c: Contestant, kind: 'night' | 'day'): void {
  const f = ctx.data.rules.fishbowl;
  const t = ctx.w.t;
  let until = t + f.dayHours * 60;
  if (kind === 'night') {
    until = t - timeOfDay(t) + f.release;
    if (until <= t) until += MINUTES_PER_DAY;
  }
  endActivity(ctx, c, c.asleep ? 'woke' : 'interrupted');
  c.guest = null;
  const from = c.room;
  c.room = f.room;
  c.confined = { room: f.room, since: t, until };
  log(ctx, 'escorted', [c.id], f.room, { from, to: f.room, until });
  think(ctx, c, f.thought);
}

/** Every minute: hourly cold dousings, and release when the sentence is served. */
export function fishbowlMinute(ctx: Ctx): void {
  const f = ctx.data.rules.fishbowl;
  const t = ctx.w.t;
  for (const c of ctx.w.contestants) {
    const cf = c.confined;
    if (!cf) continue;
    if (t >= cf.until) {
      endActivity(ctx, c, c.asleep ? 'woke' : 'interrupted');
      c.confined = null;
      c.room = ctx.st.room.get(cf.room)!.glass ?? ctx.data.schedule.ceremony.room;
      log(ctx, 'fishbowl_night', [c.id], c.room, { hours: Math.round((t - cf.since) / 60), day: dayOf(cf.since) });
    } else if (t > cf.since && (t - cf.since) % f.douseEvery === 0) {
      addNeed(c, 'hygiene', f.douseSpecies[c.species] ?? f.douseHygiene);
      log(ctx, 'douse', [c.id], cf.room);
    }
  }
}
