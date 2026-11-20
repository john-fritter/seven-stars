// Bodies, accusations and placeholder trials. DESIGN.md Part two, Arrivals, deaths and trials.
//
// A murder nobody saw leaves a body until someone walks in on it. Once a murder is known, everyone
// weighs who did it from what they know and feel; the bravest, most suspicious one accuses, and the
// next morning everyone else votes. The loser, accuser or accused, is spaced. The engine keeps the
// truth: a killer who frames someone and wins walks free.
import { TRIAL } from './actions.js';
import { axis } from './booze.js';
import { dayOf, log, timeOfDay, type Ctx } from './context.js';
import { feel, looks, relation } from './ledger.js';
import { canSee } from './station.js';
import { between, shuffle } from './rng.js';
import { alarm, dreadOf, ease, reopen, verdict } from './guilt.js';
import { knownFor, learnRep } from './news.js';
import { traitFx } from './traits.js';
import { mourn, rollCall, space } from './show.js';
import { think } from './thoughts.js';
import { knowsGrudge } from './plots.js';
import type { Body, Case, Contestant, Trial } from './types.js';

/** The reputation for lying at a trial (news.yaml reputation.liar). */
export const LIAR = 'liar';

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
export function expectedVotes(ctx: Ctx, body: Pick<Body, 'id' | 'name' | 'killer' | 'feelings'>, accuser: Contestant, accused: Contestant, witnesses: string[], said = saidBy(ctx, accuser, witnesses, body.killer, accused)): number {
  const trial: Trial = { day: 0, victim: body.id, name: body.name, killer: body.killer, accuser: accuser.id, accused: accused.id, witnesses, feelings: body.feelings, said };
  const voters = ctx.w.contestants.filter((v) => v !== accuser && v !== accused);
  if (!voters.length) return 0.5;
  // They expect to talk people round too, the vain more than they should (trials.yaml argue forecast).
  const vain = ctx.data.trials.argue.forecast.vain * Math.max(0, axis(ctx, accuser, 'vain') - 5) / 5;
  const hearing: Hearing = { said, gap: presence(ctx, accuser) + vain - presence(ctx, accused), alibi: [], caught: [] };
  // Close calls are coin flips: a margin counts as the odds it survives the room's whims (argue.noise).
  const noise = ctx.data.trials.argue.noise;
  let against = 0;
  for (const v of voters) {
    const x = stand(ctx, trial, v, accuser, accused, hearing);
    if (x.knows) against += x.knows === accused ? 1 : 0;
    else if (noise > 0) against += Math.min(1, Math.max(0, 0.5 - x.margin / (2 * noise)));
    else against += x.margin < 0 ? 1 : x.margin === 0 ? 0.5 : 0;
  }
  return against / voters.length;
}

/** The share of the room they need to expect on their side (trials.yaml convince): more without a real reason. */
function needed(ctx: Ctx, accuser: Contestant, reason: boolean): number {
  const k = ctx.data.trials.convince;
  return k.need - (k.brave * (axis(ctx, accuser, 'brave') - 5)) / 5 + (reason ? 0 : k.spite);
}

/** Whether they'd risk it: the vote they expect against what their nerve needs (trials.yaml convince). */
export function wouldDare(ctx: Ctx, body: Pick<Body, 'id' | 'name' | 'killer' | 'feelings'>, accuser: Contestant, accused: Contestant, witnesses: string[], reason = true, said?: number): boolean {
  return expectedVotes(ctx, body, accuser, accused, witnesses, said) >= needed(ctx, accuser, reason);
}

/** What an accuser has to say when nothing else is known: everything, if they saw the killer do it. */
function saidBy(ctx: Ctx, accuser: Contestant, witnesses: string[], killer: string, accused: Contestant): number {
  return witnesses.includes(accuser.id) && accused.id === killer ? ctx.data.trials.suspicion.witnessed : 0;
}

/** Whether they'd make something up for want of a real reason (trials.yaml argue lie). */
export function wouldLie(ctx: Ctx, c: Contestant): boolean {
  return axis(ctx, c, 'honest') <= ctx.data.trials.argue.lie.honest;
}

/** What they'd put to the room against `j`: the evidence, or a lie if it's thin and they're the lying kind. */
function caseAgainst(ctx: Ctx, body: Body, i: Contestant, j: Contestant): { said: number; lie: boolean; reason: boolean } {
  const tr = ctx.data.trials;
  const ev = evidence(ctx, body, i, j);
  const reason = ev >= tr.reason;
  if (!reason && wouldLie(ctx, i) && tr.argue.lie.claim > ev) return { said: tr.argue.lie.claim, lie: true, reason };
  return { said: ev, lie: false, reason };
}

/**
 * How convincing they are to a room (trials.yaml argue): charisma (traits add or take some), and a
 * little more of a hearing for looks.
 */
export function presence(ctx: Ctx, c: Contestant): number {
  const ch = Math.min(10, Math.max(0, c.charisma + traitFx(ctx.data, c).charisma));
  return ch + ctx.data.trials.argue.beauty * looks(ctx, c);
}

/** The best accusation anyone dares over this body: a real reason, the nerve, and a room they expect to win. */
export function bestAccusation(ctx: Ctx, body: Body): Accusation | null {
  const tr = ctx.data.trials;
  let best: (Accusation & { score: number }) | null = null;
  for (const i of ctx.w.contestants) {
    for (const j of ctx.w.contestants) {
      if (i === j) continue;
      const s = suspicion(ctx, body, i, j);
      const score = (s * axis(ctx, i, 'brave')) / 10;
      if (score < tr.accuseAt || (best && score <= best.score)) continue;
      // Without a real reason it's spite: they go ahead only if they're sure the room is with them.
      const c = caseAgainst(ctx, body, i, j);
      if (!wouldDare(ctx, body, i, j, body.witnesses, c.reason, c.said)) continue;
      best = { accuser: i, accused: j, suspicion: s, score, said: c.said, lie: c.lie };
    }
  }
  // The killer, afraid of being caught, may get in first: whoever the room is likeliest to condemn.
  const frame = framing(ctx, body);
  if (frame && (!best || frame.score > best.score)) return frame;
  return best;
}

export interface Accusation {
  accuser: Contestant;
  accused: Contestant;
  suspicion: number;
  said: number; // what they'll put to the room (trials.yaml argue said)
  lie: boolean;
}

/**
 * The killer's move (trials.yaml frame): if they're sure enough they'll be caught (`dread`), they
 * accuse whoever they expect the room to condemn most readily, if they expect to win by `margin`
 * over what spite needs. Their score is their dread × 100 × brave ÷ 10.
 */
function framing(ctx: Ctx, body: Body): (Accusation & { score: number }) | null {
  const f = ctx.data.trials.frame;
  const killer = ctx.w.contestants.find((c) => c.id === body.killer);
  const k = ctx.w.show.cases.find((x) => x.victim === body.id && x.killer === body.killer);
  if (!killer || !k) return null;
  const dread = dreadOf(ctx, k);
  if (dread < f.dread) return null;
  // Whoever would defend worst: disliked, unconvincing, nothing against them they could answer.
  let pick: { accused: Contestant; votes: number; said: number; lie: boolean } | null = null;
  for (const j of ctx.w.contestants) {
    if (j === killer) continue;
    const c = caseAgainst(ctx, body, killer, j);
    const votes = expectedVotes(ctx, body, killer, j, body.witnesses, c.said);
    if (!pick || votes > pick.votes) pick = { accused: j, votes, said: c.said, lie: c.lie };
  }
  if (!pick || pick.votes < needed(ctx, killer, false) + f.margin) return null;
  return { accuser: killer, accused: pick.accused, suspicion: suspicion(ctx, body, killer, pick.accused), score: (dread * 100 * axis(ctx, killer, 'brave')) / 10, said: pick.said, lie: pick.lie };
}

/** The contestant with the highest suspicion × brave ÷ 10 accuses their top suspect, if they dare. */
function accuse(ctx: Ctx, body: Body): void {
  const best = bestAccusation(ctx, body);
  if (!best) {
    log(ctx, 'no_accusation', [], body.room, { victim: body.id, name: body.name });
    return;
  }
  schedule(ctx, body, best.accuser, best.accused, body.witnesses, best.suspicion, false, best);
}

/** An accusation, tried at the next morning's trial hour. Reopened: an old murder brought back (guilt.ts). */
export function schedule(ctx: Ctx, body: Pick<Body, 'id' | 'name' | 'killer' | 'feelings'>, accuser: Contestant, accused: Contestant, witnesses: string[], suspicion: number, reopened: boolean, plan?: { said: number; lie: boolean }): void {
  const tr = ctx.data.trials;
  const day = dayOf(ctx.w.t) + (timeOfDay(ctx.w.t) < ctx.data.schedule.trials.at ? 0 : 1);
  const said = plan?.said ?? saidBy(ctx, accuser, witnesses, body.killer, accused);
  const trial: Trial = { day, victim: body.id, name: body.name, killer: body.killer, accuser: accuser.id, accused: accused.id, witnesses, feelings: body.feelings, said, ...(reopened ? { reopened } : {}), ...(plan?.lie ? { lie: true } : {}) };
  ctx.w.show.trials.push(trial);
  ctx.w.show.cases.find((k) => k.victim === body.id)?.accusers.push(accuser.id);
  // The killer feels the net tighten, or loosen when it's someone else in the dock.
  const d = ctx.data.trials.guilt.dread;
  if (accused.id === body.killer) alarm(ctx, body.killer, d.accused, body.id);
  else {
    const k = ctx.w.show.cases.find((x) => x.victim === body.id && x.killer === body.killer);
    if (k) ease(ctx, k, d.otherAccused);
  }
  log(ctx, 'accusation', [accuser.id, accused.id], accuser.room, { victim: body.id, name: body.name, suspicion: Math.round(suspicion), said: Math.round(said), day, right: accused.id === body.killer, ...(reopened ? { reopened } : {}), ...(plan?.lie ? { lie: true } : {}) });
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

/**
 * What the room heard at a trial (trials.yaml argue): what the accuser had, the delivery gap
 * (accuser − accused), who can vouch for the accused, and who caught the accuser lying.
 */
export interface Hearing {
  said: number;
  gap: number;
  alibi: string[];
  caught: string[];
}

/**
 * Which side `v` votes to condemn. Without a hearing, only what was said counts, not how. At a
 * hearing, each voter takes it their own way: a whim of up to ± argue.noise.
 */
export function voteOf(ctx: Ctx, trial: Trial, v: Contestant, accuser: Contestant, accused: Contestant, hearing?: Hearing): Contestant {
  const x = stand(ctx, trial, v, accuser, accused, hearing);
  if (x.knows) return x.knows;
  const noise = ctx.data.trials.argue.noise;
  const m = x.margin + (hearing && noise > 0 ? between(ctx.w.rng, -noise, noise) : 0);
  if (m !== 0) return m > 0 ? accuser : accused;
  return tieLoser(ctx, accuser, accused); // no feelings either way: the show's numbers decide
}

/** How far `v` believes what `x` says at a trial (trials.yaml argue said): trust, less for a known liar. */
export function credibility(ctx: Ctx, v: Contestant, x: Contestant): number {
  const ar = ctx.data.trials.argue;
  const liar = knownFor(v, x.id, LIAR) ? ctx.data.news.reputation.liar.credibility : 1;
  return (ar.said.trustBase + (v.ledger[x.id]?.trust ?? 0) / 100) * liar;
}

/**
 * Where `v` stands: who they know did it, if they know, or the margin by which the accused stands
 * better with them than the accuser (above 0: they'd condemn the accuser).
 */
export function stand(ctx: Ctx, trial: Trial, v: Contestant, accuser: Contestant, accused: Contestant, hearing?: Hearing): { knows?: Contestant; margin: number } {
  // A witness votes the truth, when the killer is on trial.
  if (trial.witnesses.includes(v.id)) {
    if (trial.killer === accused.id) return { knows: accused, margin: 0 };
    if (trial.killer === accuser.id) return { knows: accuser, margin: 0 };
  }
  // They know better: they were with the accused when it happened, or caught the accuser lying.
  if (hearing && (hearing.alibi.includes(v.id) || hearing.caught.includes(v.id))) return { knows: accuser, margin: 0 };
  const ar = ctx.data.trials.argue;
  const k = ctx.data.trials.fearNudge;
  const score = (x: Contestant) => (v.ledger[x.id]?.affection ?? 0) - k * (v.ledger[x.id]?.fear ?? 0);
  const a = score(accuser);
  const b0 = score(accused);
  let b = b0;
  // The case, believed as far as they trust the accuser.
  const said = hearing ? hearing.said : (trial.said ?? saidBy(ctx, accuser, trial.witnesses, trial.killer, accused));
  b -= ar.said.k * said * credibility(ctx, v, accuser);
  if (hearing) {
    if (hearing.alibi.length) b += ar.alibi * credibility(ctx, v, accused);
    // The better speaker sways them, as far as their feelings leave them open to it.
    const open = Math.max(ar.openness.min, 1 - Math.abs(a - b0) / ar.openness.span);
    b -= ar.sway * hearing.gap * open;
  }
  // The night before.
  const p = trial.pleas?.[v.id];
  if (p) b += p.accused - p.accuser;
  return { margin: b - a };
}

/**
 * How well they put it on the day (trials.yaml argue delivery): presence, composure, a guilty
 * conscience or plain nerves in the dock, a hangover, having got ready, a lie, and a roll.
 */
export function delivery(ctx: Ctx, trial: Trial, c: Contestant, k: Case | undefined): number {
  const ar = ctx.data.trials.argue;
  const d = ar.delivery;
  const calm = axis(ctx, c, 'calm');
  let v = presence(ctx, c) + (d.calm * (calm - 5)) / 5;
  if (c.id === trial.accused) {
    if (c.id === trial.killer && k) v -= d.dread * dreadOf(ctx, k);
    else v -= (d.nerves * Math.max(0, d.nervesCalm - calm)) / d.nervesCalm;
  }
  const hang = c.thoughts.find((x) => x.id === ctx.data.booze.hangover.thought);
  if (hang) v -= Math.min(d.hangoverMax, d.hangover * Math.abs(hang.value));
  if (ctx.w.t < c.primped) v += d.ready;
  if (c.id === trial.accuser && trial.lie) v -= ar.lie.base + ar.lie.perHonest * axis(ctx, c, 'honest');
  return v + between(ctx.w.rng, 0, d.die);
}

/** Speech grades for the log and the meter (scoring.yaml trial_speech). */
function grade(ctx: Ctx, d: number): string {
  const g = ctx.data.trials.argue.grade;
  return d >= g.strong ? 'strong' : d < g.weak ? 'weak' : 'fair';
}

// ---------------------------------------------------------------------------------------------
// The night before (trials.yaml argue plead)

/** The trial `c` is a side in that `o` will vote at, if any. */
function pleaTrial(ctx: Ctx, c: Contestant, o: Contestant): Trial | undefined {
  return ctx.w.show.trials.find((t) => (t.accuser === c.id || t.accused === c.id) && t.accuser !== o.id && t.accused !== o.id);
}

/** Whether `c` has a case to plead to `o` tonight, and room left to sway them. */
export function canPlead(ctx: Ctx, c: Contestant, o: Contestant): boolean {
  const t = pleaTrial(ctx, c, o);
  if (!t) return false;
  const side = t.accuser === c.id ? 'accuser' : 'accused';
  return (t.pleas?.[o.id]?.[side] ?? 0) < ctx.data.trials.argue.plead.max;
}

/** `c` pleads their case to `o`, who hears them out unless they dislike them or think them a killer. */
export function plead(ctx: Ctx, c: Contestant, o: Contestant): void {
  const t = pleaTrial(ctx, c, o);
  if (!t) return;
  const pl = ctx.data.trials.argue.plead;
  const side = t.accuser === c.id ? 'accuser' : 'accused';
  const r = o.ledger[c.id];
  if ((r?.affection ?? 0) < pl.refuseBelow || r?.killer) {
    log(ctx, 'plead_refused', [c.id, o.id], c.room, { victim: t.victim, side });
    return;
  }
  const p = ((t.pleas ??= {})[o.id] ??= { accuser: 0, accused: 0 });
  p[side] = Math.min(pl.max, p[side] + (pl.base * presence(ctx, c)) / 5);
  log(ctx, 'plead', [c.id, o.id], c.room, { victim: t.victim, side, lean: Math.round(p[side] * 10) / 10 });
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
  // The case and the defense (trials.yaml argue).
  const k = ctx.w.show.cases.find((x) => x.victim === trial.victim);
  const here = (ids: string[] | undefined) => (ids ?? []).filter((id) => present.some((c) => c.id === id));
  const vouch = (who: Contestant) => (k?.alibi?.[who.id] ?? []).filter((id) => ctx.w.contestants.some((c) => c.id === id));
  const alibi = vouch(accused);
  const dA = delivery(ctx, trial, accuser, k);
  const dB = delivery(ctx, trial, accused, k);
  const said = trial.said ?? saidBy(ctx, accuser, trial.witnesses, trial.killer, accused);
  log(ctx, 'trial_speech', [accuser.id], room, { victim: trial.victim, role: 'case', grade: grade(ctx, dA), delivery: Math.round(dA * 10) / 10, presence: Math.round(presence(ctx, accuser) * 10) / 10, said: Math.round(said), ...(trial.lie ? { lie: true } : {}) });
  log(ctx, 'trial_speech', [accused.id], room, { victim: trial.victim, role: 'defense', grade: grade(ctx, dB), delivery: Math.round(dB * 10) / 10, presence: Math.round(presence(ctx, accused) * 10) / 10, ...(alibi.length ? { alibi: alibi.length } : {}) });
  // A lie, seen through by anyone who was with either of them when it happened.
  const caught = trial.lie ? here([...new Set([...alibi, ...vouch(accuser)])]).filter((id) => id !== accuser.id && id !== accused.id) : [];
  if (caught.length) {
    const lie = ctx.data.trials.argue.lie;
    log(ctx, 'lie_caught', [accuser.id, ...caught], room, { victim: trial.victim, name: trial.name });
    for (const id of caught) {
      const v = present.find((c) => c.id === id)!;
      feel(ctx, v, accuser, 'affection', lie.affection, 'lied at the trial');
      learnRep(ctx, v, accuser, LIAR);
    }
  }
  const hearing: Hearing = { said, gap: dA - dB, alibi: here(alibi), caught };
  // Proposal: the accuser and accused don't vote.
  const votes: Record<string, string> = {};
  let against = 0;
  for (const v of present) {
    if (v === accuser || v === accused) continue;
    const x = voteOf(ctx, trial, v, accuser, accused, hearing);
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
    delivery: [Math.round(dA * 10) / 10, Math.round(dB * 10) / 10],
    said: Math.round(said),
    ...(alibi.length ? { alibi: alibi.length } : {}),
    ...(trial.lie ? { lie: true, caught: caught.length } : {}),
    ...(trial.pleas ? { pleaded: Object.keys(trial.pleas).length } : {}),
    // How the room would have gone on feelings and evidence alone, for the harness.
    feelingsAlone: present.filter((v) => {
      if (v === accuser || v === accused) return false;
      const x = stand(ctx, { ...trial, pleas: {} }, v, accuser, accused, { ...hearing, gap: 0 });
      return x.knows ? x.knows === accused : x.margin < 0;
    }).length,
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
