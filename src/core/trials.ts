// Bodies, accusations and placeholder trials. DESIGN.md Part two, Arrivals, deaths and trials.
//
// A murder nobody saw leaves a body until someone walks in on it. Once a murder is known, everyone
// weighs who did it from what they know and feel; the bravest, most suspicious one accuses, and the
// next morning everyone else votes. The loser, accuser or accused, is spaced. The engine keeps the
// truth: a killer who frames someone and wins walks free.
import { TRIAL } from './actions.js';
import { axis } from './booze.js';
import { dayOf, log, timeOfDay, type Ctx } from './context.js';
import { feel, relation } from './ledger.js';
import { canSee } from './station.js';
import { shuffle } from './rng.js';
import { alarm, ease, reopen, verdict } from './guilt.js';
import { learnRep } from './news.js';
import { mourn, rollCall, space } from './show.js';
import { think } from './thoughts.js';
import { knowsGrudge } from './plots.js';
import type { Body, Contestant, Trial } from './types.js';

/** Every minute while there are bodies: anyone awake who walks in on one, or can see it (glass, an arch), finds it. The killer doesn't count. */
export function findBodies(ctx: Ctx): void {
  const show = ctx.w.show;
  for (const body of [...show.bodies]) {
    const finder = ctx.w.contestants.find((c) => canSee(ctx.st, c.room, body.room) && !c.asleep && c.id !== body.killer && c.activity?.phase !== 'walk');
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
  mourn(ctx, body.id, body.feelings, body.killer);
  const killer = ctx.w.contestants.find((c) => c.id === body.killer);
  if (killer) believe(ctx, killer, body.witnesses, body, 'witnessed');
  accuse(ctx, body);
}

/**
 * They now believe `who` is a killer (trials.yaml memory): affection and fear once, more for the
 * victim's friends, down to the floor at least, a thought, and a dislike that won't fade past the
 * floor (ledger.ts).
 */
export function believe(ctx: Ctx, who: Contestant, ids: string[], body: Pick<Body, 'id' | 'name' | 'feelings'>, how: string, from?: Contestant): void {
  const m = ctx.data.trials.memory;
  const h = ctx.data.trials.hearsay;
  const hearsay = how === 'gossip';
  const friendAt = ctx.data.social.ledger.friendAt;
  const believers: Contestant[] = [];
  for (const id of ids) {
    const b = ctx.w.contestants.find((c) => c.id === id);
    if (!b || b === who) continue;
    const before = b.ledger[who.id];
    const mine = (body.feelings[b.id]?.affection ?? 0) >= friendAt;
    // Already believed (on someone's word, a fresh certainty still lands). A second murder, of
    // someone they loved, still shuts them out for good.
    if (before?.killer && (hearsay || !before.hearsay)) {
      if (mine && !before.mine) {
        before.mine = true;
        feel(ctx, b, who, 'affection', m.friend, `killed my friend ${body.name}`);
      }
      continue;
    }
    const already = !!before?.killer;
    if (!already) {
      feel(ctx, b, who, 'affection', hearsay ? h.affection : m.affection, `killed ${body.name}`);
      feel(ctx, b, who, 'fear', hearsay ? h.fear : m.fear, `killed ${body.name}`);
    } else {
      // They'd heard it; now they know: the rest of the shock.
      feel(ctx, b, who, 'affection', m.affection - h.affection, `killed ${body.name}`);
      feel(ctx, b, who, 'fear', m.fear - h.fear, `killed ${body.name}`);
    }
    if (mine && !already) feel(ctx, b, who, 'affection', m.friend, `killed my friend ${body.name}`);
    const r = relation(ctx, b, who);
    if (r.affection > m.floor) feel(ctx, b, who, 'affection', m.floor - r.affection, `killed ${body.name}`); // a rival, at least
    r.killer = body.name;
    if (mine) r.mine = true;
    if (hearsay) r.hearsay = true;
    else delete r.hearsay;
    if (!already) think(ctx, b, m.thought, who.id);
    // It's news, and the fastest kind (news.yaml killer).
    learnRep(ctx, b, who, ctx.data.news.killer.what, ctx.w.t, body.id);
    believers.push(b);
  }
  if (believers.length) log(ctx, 'killer_known', [who.id, ...believers.map((b) => b.id)], undefined, { victim: body.id, name: body.name, how, ...(from ? { from: from.id } : {}) });
}

/**
 * How much `i` suspects `j` of the murder, 0..100. A witness knows; anyone else goes on dislike,
 * fear, the victim's enemies, and having both been seen near the victim.
 */
export function suspicion(ctx: Ctx, body: Body, i: Contestant, j: Contestant): number {
  const s = ctx.data.trials.suspicion;
  if (body.witnesses.includes(i.id)) return j.id === body.killer ? s.witnessed : 0;
  const r = i.ledger[j.id];
  const v = s.dislike * Math.max(0, -(r?.affection ?? 0)) + s.fear * (r?.fear ?? 0) + evidence(ctx, body, i, j);
  return Math.min(v, s.witnessed - 1);
}

/**
 * The part of `i`'s suspicion of `j` they could put to the room (trials.yaml reason): what they
 * saw or know, not how they feel. A witness has all of it.
 */
export function evidence(ctx: Ctx, body: Body, i: Contestant, j: Contestant): number {
  const s = ctx.data.trials.suspicion;
  if (body.witnesses.includes(i.id)) return j.id === body.killer ? s.witnessed : 0;
  let v = 0;
  // Bad blood they know of between the suspect and the victim (plots.yaml grudges), either way.
  if (knowsGrudge(ctx, i, j.id, body.id)) v += s.enemy;
  // The cameras' teaser put them among a few (plots.yaml clue).
  if (ctx.w.show.cases.find((k) => k.victim === body.id)?.clued?.includes(j.id)) v += ctx.data.plots.clue.suspicion;
  if (body.near.includes(i.id) && body.near.includes(j.id)) v += s.near;
  if (body.locked?.includes(j.id)) v += s.locked;
  // They've been told this one did it (news.yaml killer: on someone's word).
  if (i.ledger[j.id]?.killer === body.name) v += s.heard;
  return v;
}

/**
 * How the accuser reads the room (trials.yaml convince): the share of the others aboard they expect
 * to vote against the accused, from how the room treats each of them. A tie counts as half.
 */
export function expectedVotes(ctx: Ctx, body: Pick<Body, 'id' | 'name' | 'killer' | 'feelings'>, accuser: Contestant, accused: Contestant, witnesses: string[]): number {
  const trial: Trial = { day: 0, victim: body.id, name: body.name, killer: body.killer, accuser: accuser.id, accused: accused.id, witnesses, feelings: body.feelings };
  const voters = ctx.w.contestants.filter((v) => v !== accuser && v !== accused);
  if (!voters.length) return 0.5;
  let against = 0;
  for (const v of voters) {
    const x = leaning(ctx, trial, v, accuser, accused);
    against += x === accused ? 1 : x === null ? 0.5 : 0;
  }
  return against / voters.length;
}

/** Whether they'd risk it: the vote they expect against what their nerve needs (trials.yaml convince). */
export function wouldDare(ctx: Ctx, body: Pick<Body, 'id' | 'name' | 'killer' | 'feelings'>, accuser: Contestant, accused: Contestant, witnesses: string[]): boolean {
  const k = ctx.data.trials.convince;
  const need = k.need - (k.brave * (axis(ctx, accuser, 'brave') - 5)) / 5;
  return expectedVotes(ctx, body, accuser, accused, witnesses) >= need;
}

/** The best accusation anyone dares over this body: a real reason, the nerve, and a room they expect to win. */
export function bestAccusation(ctx: Ctx, body: Body): { accuser: Contestant; accused: Contestant; suspicion: number } | null {
  const tr = ctx.data.trials;
  let best: { accuser: Contestant; accused: Contestant; suspicion: number; score: number } | null = null;
  for (const i of ctx.w.contestants) {
    for (const j of ctx.w.contestants) {
      if (i === j || evidence(ctx, body, i, j) < tr.reason) continue;
      const s = suspicion(ctx, body, i, j);
      const score = (s * axis(ctx, i, 'brave')) / 10;
      if (score < tr.accuseAt || (best && score <= best.score)) continue;
      if (!wouldDare(ctx, body, i, j, body.witnesses)) continue;
      best = { accuser: i, accused: j, suspicion: s, score };
    }
  }
  return best;
}

/** The contestant with the highest suspicion × brave ÷ 10 accuses their top suspect, if they dare. */
function accuse(ctx: Ctx, body: Body): void {
  const best = bestAccusation(ctx, body);
  if (!best) {
    log(ctx, 'no_accusation', [], body.room, { victim: body.id, name: body.name });
    return;
  }
  schedule(ctx, body, best.accuser, best.accused, body.witnesses, best.suspicion, false);
}

/** An accusation, tried at the next morning's trial hour. Reopened: an old murder brought back (guilt.ts). */
export function schedule(ctx: Ctx, body: Pick<Body, 'id' | 'name' | 'killer' | 'feelings'>, accuser: Contestant, accused: Contestant, witnesses: string[], suspicion: number, reopened: boolean): void {
  const tr = ctx.data.trials;
  const day = dayOf(ctx.w.t) + (timeOfDay(ctx.w.t) < ctx.data.schedule.trials.at ? 0 : 1);
  const trial: Trial = { day, victim: body.id, name: body.name, killer: body.killer, accuser: accuser.id, accused: accused.id, witnesses, feelings: body.feelings, ...(reopened ? { reopened } : {}) };
  ctx.w.show.trials.push(trial);
  ctx.w.show.cases.find((k) => k.victim === body.id)?.accusers.push(accuser.id);
  // The killer feels the net tighten, or loosen when it's someone else in the dock.
  const d = ctx.data.trials.guilt.dread;
  if (accused.id === body.killer) alarm(ctx, body.killer, d.accused, body.id);
  else {
    const k = ctx.w.show.cases.find((x) => x.victim === body.id && x.killer === body.killer);
    if (k) ease(ctx, k, d.otherAccused);
  }
  log(ctx, 'accusation', [accuser.id, accused.id], accuser.room, { victim: body.id, name: body.name, suspicion: Math.round(suspicion), day, right: accused.id === body.killer, ...(reopened ? { reopened } : {}) });
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
  return leaning(ctx, trial, v, accuser, accused) ?? tieLoser(ctx, accuser, accused); // no feelings either way: the show's numbers decide
}

/** Which side `v` leans to condemn, or null if their feelings don't split them. */
function leaning(ctx: Ctx, trial: Trial, v: Contestant, accuser: Contestant, accused: Contestant): Contestant | null {
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
  return null;
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
    const k = ctx.w.show.cases.find((x) => x.victim === trial.victim);
    if (k) reopen(ctx, k);
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
    ...(trial.reopened ? { reopened: true } : {}),
  });
  think(ctx, winner, ctx.data.trials.survivedThought);
  const spaced = space(ctx, loser, 'trial', room);
  if (spaced && loser.id === trial.killer) ctx.w.show.killerSpaced = ctx.w.t;
  // An accused who walks out alive, cleared or saved by an immunity, is a killer to everyone who
  // wanted them spaced, apart from the real killer, who knows better.
  const survivor = spaced ? winner : loser;
  if (survivor === accused) {
    const against = Object.keys(votes).filter((id) => votes[id] === accused.id);
    believe(ctx, accused, [accuser.id, ...against].filter((id) => id !== trial.killer), { id: trial.victim, name: trial.name, feelings: trial.feelings }, spaced ? 'cleared' : 'immunity');
  }
  verdict(ctx, trial, loser, spaced);
}
