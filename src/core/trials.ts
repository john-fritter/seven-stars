// Bodies, accusations and placeholder trials. DESIGN.md Part two, Arrivals, deaths and trials.
//
// A murder nobody saw leaves a body until someone walks in on it. Once a murder is known, everyone
// weighs who did it from what they know and feel; the bravest, most suspicious one accuses, and the
// next morning everyone else votes. The loser, accuser or accused, is spaced. The engine keeps the
// truth: a killer who frames someone and wins walks free.
import { TRIAL } from './actions.js';
import { axis } from './booze.js';
import { dayOf, log, timeOfDay, type Ctx } from './context.js';
import { feel } from './ledger.js';
import { shuffle } from './rng.js';
import { mourn, rollCall, space } from './show.js';
import { think } from './thoughts.js';
import type { Body, Contestant, Trial } from './types.js';

/** Every minute while there are bodies: anyone awake who walks in on one finds it. The killer doesn't count. */
export function findBodies(ctx: Ctx): void {
  const show = ctx.w.show;
  for (const body of [...show.bodies]) {
    const finder = ctx.w.contestants.find((c) => c.room === body.room && !c.asleep && c.id !== body.killer && c.activity?.phase !== 'walk');
    if (finder) found(ctx, body, finder);
  }
}

/** The announcer declares any body still unfound at the ceremony; the robots collect it. */
export function announceBodies(ctx: Ctx): void {
  for (const body of [...ctx.w.show.bodies]) found(ctx, body, null);
}

/** A murder becomes known: by a finder, the announcer, or the witnesses who saw it happen. */
export function found(ctx: Ctx, body: Body, finder: Contestant | null): void {
  const show = ctx.w.show;
  const unfound = show.bodies.includes(body);
  show.bodies = show.bodies.filter((b) => b !== body);
  if (unfound) {
    log(ctx, 'body_found', finder ? [finder.id] : [], body.room, { victim: body.id, name: body.name, minutes: ctx.w.t - body.t, ...(finder ? {} : { announced: true }) });
    if (finder) think(ctx, finder, ctx.data.trials.foundThought, body.id);
  }
  mourn(ctx, body.id, body.feelings);
  accuse(ctx, body);
}

/**
 * How much `i` suspects `j` of the murder, 0..100. A witness knows; anyone else goes on dislike,
 * fear, the victim's enemies, and having both been seen near the victim.
 */
export function suspicion(ctx: Ctx, body: Body, i: Contestant, j: Contestant): number {
  const s = ctx.data.trials.suspicion;
  if (body.witnesses.includes(i.id)) return j.id === body.killer ? s.witnessed : 0;
  const r = i.ledger[j.id];
  let v = s.dislike * Math.max(0, -(r?.affection ?? 0)) + s.fear * (r?.fear ?? 0);
  if (body.feelings[j.id]?.enemy) v += s.enemy;
  if (body.near.includes(i.id) && body.near.includes(j.id)) v += s.near;
  return Math.min(v, s.witnessed - 1);
}

/** The contestant with the highest suspicion × brave ÷ 10 accuses their top suspect, if they dare. */
function accuse(ctx: Ctx, body: Body): void {
  const tr = ctx.data.trials;
  const cast = ctx.w.contestants;
  let best: { accuser: Contestant; accused: Contestant; suspicion: number; score: number } | null = null;
  for (const i of cast) {
    for (const j of cast) {
      if (i === j) continue;
      const s = suspicion(ctx, body, i, j);
      const score = (s * axis(ctx, i, 'brave')) / 10;
      if (score >= tr.accuseAt && (!best || score > best.score)) best = { accuser: i, accused: j, suspicion: s, score };
    }
  }
  if (!best) {
    log(ctx, 'no_accusation', [], body.room, { victim: body.id, name: body.name });
    return;
  }
  const { accuser, accused } = best;
  // Held at the next morning's trial hour.
  const day = dayOf(ctx.w.t) + (timeOfDay(ctx.w.t) < ctx.data.schedule.trials.at ? 0 : 1);
  const trial: Trial = { day, victim: body.id, name: body.name, killer: body.killer, accuser: accuser.id, accused: accused.id, witnesses: body.witnesses };
  ctx.w.show.trials.push(trial);
  log(ctx, 'accusation', [accuser.id, accused.id], accuser.room, { victim: body.id, name: body.name, suspicion: Math.round(best.suspicion), day, right: accused.id === body.killer });
  think(ctx, accused, tr.accused.thought, accuser.id);
  feel(ctx, accused, accuser, 'affection', tr.accused.affection, 'accused me of murder');
}

/** Trials waiting for this morning. */
export function trialsToday(ctx: Ctx): Trial[] {
  const day = dayOf(ctx.w.t);
  return ctx.w.show.trials.filter((x) => x.day <= day);
}

/** The morning's trials, one after another, in front of whoever came. */
export function holdTrials(ctx: Ctx): void {
  const show = ctx.w.show;
  const today = trialsToday(ctx);
  show.trials = show.trials.filter((x) => !today.includes(x));
  const room = ctx.data.schedule.trials.room;
  const present = rollCall(ctx, TRIAL, room, 'skipped_event');
  for (const trial of today) hold(ctx, trial, present.filter((c) => ctx.w.contestants.includes(c)));
}

/** Which side `v` votes to condemn. */
export function voteOf(ctx: Ctx, trial: Trial, v: Contestant, accuser: Contestant, accused: Contestant): Contestant {
  // A witness votes the truth, when the killer is on trial.
  if (trial.witnesses.includes(v.id)) {
    if (trial.killer === accused.id) return accused;
    if (trial.killer === accuser.id) return accuser;
  }
  const k = ctx.data.trials.fearNudge;
  const score = (x: Contestant) => (v.ledger[x.id]?.affection ?? 0) - k * (v.ledger[x.id]?.fear ?? 0);
  const a = score(accuser);
  let b = score(accused);
  // An accuser who saw it happen testifies, and voters believe them as far as they trust them.
  if (trial.witnesses.includes(accuser.id)) {
    const t = ctx.data.trials.testimony;
    b -= t.base + t.trust * (v.ledger[accuser.id]?.trust ?? 0);
  }
  if (a !== b) return a < b ? accuser : accused;
  return tieLoser(ctx, accuser, accused); // no feelings either way: the show's numbers decide
}

/** A tie breaks on the meter, then lifetime points: the lower one loses. Then a coin. */
function tieLoser(ctx: Ctx, a: Contestant, b: Contestant): Contestant {
  if (a.meter !== b.meter) return a.meter < b.meter ? a : b;
  if (a.lifetime !== b.lifetime) return a.lifetime < b.lifetime ? a : b;
  return shuffle(ctx.w.rng, [a, b])[0]!;
}

function hold(ctx: Ctx, trial: Trial, present: Contestant[]): void {
  const room = ctx.data.schedule.trials.room;
  const accuser = ctx.w.contestants.find((c) => c.id === trial.accuser);
  const accused = ctx.w.contestants.find((c) => c.id === trial.accused);
  if (!accuser || !accused) {
    log(ctx, 'trial_cancelled', [accuser, accused].filter((x) => x !== undefined).map((x) => x.id), room, { victim: trial.victim, name: trial.name });
    return;
  }
  // Proposal: the accuser and accused don't vote.
  const votes: Record<string, string> = {};
  let against = 0;
  for (const v of present) {
    if (v === accuser || v === accused) continue;
    const x = voteOf(ctx, trial, v, accuser, accused);
    votes[v.id] = x.id;
    if (x === accused) against++;
  }
  const n = Object.keys(votes).length;
  const loser = against * 2 > n ? accused : against * 2 < n ? accuser : tieLoser(ctx, accuser, accused);
  const winner = loser === accused ? accuser : accused;
  log(ctx, 'trial', [accuser.id, accused.id], room, {
    victim: trial.victim,
    name: trial.name,
    votes,
    against,
    winner: winner.id,
    loser: loser.id,
    killer: trial.killer,
    right: loser.id === trial.killer,
  });
  think(ctx, winner, ctx.data.trials.survivedThought);
  space(ctx, loser, 'trial', room);
}
