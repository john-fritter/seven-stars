// A killer's guilt, and murders that come back. DESIGN.md Part two, Arrivals, deaths and trials
// (Guilt and unsolved murders). Numbers in data/trials.yaml guilt and reopen.
//
// Guilt depends on who they are and what happened: the kind and the honest feel it most (source
// guilt), killing someone they liked hurts more than killing someone they hated, an innocent spaced
// for it hurts again (worse if they did the accusing), and being back where it happened stings.
// Guilt wants out: in the diary room, in drink, or in a breakdown in front of everyone. Whoever
// learns the truth can bring the murder back to trial, however the first trial went.
import { axis, stageOf } from './booze.js';
import { log, type Ctx } from './context.js';
import { hear } from './news.js';
import { chance } from './rng.js';
import { grieve } from './show.js';
import { canHear } from './station.js';
import { condition, think, thoughtValue, updateMood } from './thoughts.js';
import { believe, found, schedule } from './trials.js';
import type { Case, Contestant, News, Trial } from './types.js';

const aboard = (ctx: Ctx, id: string) => ctx.w.contestants.find((x) => x.id === id);

/** The latest murder on `c`'s conscience, if they've one. */
export function crimeOf(ctx: Ctx, c: Contestant): Case | undefined {
  let best: Case | undefined;
  for (const k of ctx.w.show.cases) if (k.killer === c.id && (!best || k.t > best.t)) best = k;
  return best;
}

/** How heavy their guilt over their crimes is, 0..1: their remorse and scapegoat thoughts ÷ trials.yaml guilt.full. */
export function guiltShare(ctx: Ctx, c: Contestant): number {
  const g = ctx.data.trials.guilt;
  let w = 0;
  for (const x of c.thoughts) if (x.value < 0 && (x.id === g.remorse.thought || x.id === g.scapegoat.thought)) w -= x.value;
  return Math.min(1, w / g.full);
}

/**
 * At the kill (breaks.ts attack): remorse by how they felt about the victim just before, × honest
 * and kind; grief for a friend or gloating over a rival like anyone else, but not shaken.
 */
export function remorse(ctx: Ctx, killer: Contestant, victim: string, affection: number): void {
  const r = ctx.data.trials.guilt.remorse;
  const base = Math.min(0, r.base - r.perAffection * affection);
  const value = base < 0 ? thoughtValue(ctx, killer, r.thought, base) : 0;
  if (value < 0) think(ctx, killer, r.thought, victim, base);
  const felt = grieve(ctx, killer, victim, affection, true);
  log(ctx, 'remorse', [killer.id, victim], killer.room, { value: Math.round(value * 10) / 10, affection: Math.round(affection), felt });
}

/** Every ten minutes: back in the room where they did it, while the remorse lasts. */
export function haunt(ctx: Ctx, c: Contestant): void {
  const g = ctx.data.trials.guilt;
  let about: string | null = null;
  if (!c.asleep) {
    for (const k of ctx.w.show.cases) {
      if (k.killer === c.id && k.room === c.room && c.thoughts.some((x) => x.id === g.remorse.thought && x.about === k.victim)) about = k.victim;
    }
  }
  condition(ctx, c, g.haunted, about ? ctx.data.thoughts.thoughts[g.haunted]!.value : null, about);
}

/**
 * The trial is over and the killer is still aboard. An innocent spaced for it: guilt about them,
 * worse if the killer accused them; walking free, the cruel enjoy it. Then anyone who knows the
 * truth may bring it back.
 */
export function verdict(ctx: Ctx, trial: Trial, loser: Contestant, spaced: boolean): void {
  const k = ctx.w.show.cases.find((x) => x.victim === trial.victim);
  const killer = k && aboard(ctx, k.killer);
  if (!k || !killer) return;
  const g = ctx.data.trials.guilt;
  if (spaced && loser !== killer) {
    const framed = trial.accuser === killer.id;
    const base = ctx.data.thoughts.thoughts[g.scapegoat.thought]!.value + (framed ? g.scapegoat.framed : 0);
    think(ctx, killer, g.scapegoat.thought, loser.id, base);
    log(ctx, 'scapegoat', [killer.id, loser.id], killer.room, { victim: k.victim, name: k.name, framed, value: Math.round(thoughtValue(ctx, killer, g.scapegoat.thought, base) * 10) / 10 });
  }
  if (spaced || loser !== killer) think(ctx, killer, g.gotAway);
  reopen(ctx, k);
}

/**
 * The killer confesses to `hearers`. An unfound body is found; a pending trial gains witnesses;
 * otherwise everyone who heard believes it and the murder may come back to trial.
 */
export function confess(ctx: Ctx, c: Contestant, hearers: Contestant[], how: string): boolean {
  const k = crimeOf(ctx, c);
  if (!k) return false;
  const ids = hearers.filter((h) => h !== c).map((h) => h.id);
  log(ctx, 'murder_confession', [c.id, ...ids], c.room, { victim: k.victim, name: k.name, how });
  if (!ids.length) return true;
  for (const id of ids) if (!k.knew.includes(id)) k.knew.push(id);
  const show = ctx.w.show;
  const body = show.bodies.find((b) => b.id === k.victim);
  if (body) {
    body.witnesses = [...new Set([...body.witnesses, ...ids])];
    found(ctx, body, null);
    return true;
  }
  const trial = show.trials.find((x) => x.victim === k.victim);
  if (trial) trial.witnesses = [...new Set([...trial.witnesses, ...ids])];
  believe(ctx, c, ids, { id: k.victim, name: k.name, feelings: k.feelings }, how);
  if (!trial) reopen(ctx, k);
  return true;
}

/**
 * Drink and guilt, chatting with a friend: the stage's chance of a tearful confession × how heavy
 * the guilt is. A loyal friend keeps the secret. Returns whether they confessed.
 */
export function drunkConfession(ctx: Ctx, c: Contestant, o: Contestant): boolean {
  const st = stageOf(ctx, c);
  const k = crimeOf(ctx, c);
  if (!st?.confess || !k || k.kept.includes(o.id) || k.knew.includes(o.id)) return false;
  const friendAt = ctx.data.social.ledger.friendAt;
  if ((c.ledger[o.id]?.affection ?? 0) < friendAt) return false;
  if (!chance(ctx.w.rng, st.confess * guiltShare(ctx, c))) return false;
  const keep = ctx.data.trials.guilt.keep;
  if (o.personality.loyal >= keep.loyal && (o.ledger[c.id]?.affection ?? 0) >= friendAt) {
    k.kept.push(o.id);
    think(ctx, o, keep.thought, c.id);
    log(ctx, 'murder_confession', [c.id, o.id], c.room, { victim: k.victim, name: k.name, how: 'drunk', kept: true });
    return true;
  }
  return confess(ctx, c, [o], 'drunk');
}

/**
 * Someone knows the truth: the bravest who knows for certain and hasn't accused the killer over it
 * yet does, if they dare, at the next morning's trial.
 */
export function reopen(ctx: Ctx, k: Case): void {
  const tr = ctx.data.trials;
  const show = ctx.w.show;
  const killer = aboard(ctx, k.killer);
  if (!tr.reopen || !killer || show.bodies.some((b) => b.id === k.victim) || show.trials.some((x) => x.victim === k.victim)) return;
  let best: { c: Contestant; score: number } | null = null;
  for (const id of k.knew) {
    const c = aboard(ctx, id);
    if (!c || c === killer || k.accusers.includes(id)) continue;
    const score = (tr.suspicion.witnessed * axis(ctx, c, 'brave')) / 10;
    if (score >= tr.accuseAt && (!best || score > best.score)) best = { c, score };
  }
  if (!best) return;
  const witnesses = k.knew.filter((id) => aboard(ctx, id));
  schedule(ctx, { id: k.victim, name: k.name, killer: k.killer, feelings: k.feelings }, best.c, killer, witnesses, tr.suspicion.witnessed, true);
}

/**
 * A guilt break (breaks.yaml blurt): it all comes out in front of everyone in earshot. A murder if
 * it weighs on them, otherwise their cheating.
 */
export function blurt(ctx: Ctx, c: Contestant): void {
  const hearers = ctx.w.contestants.filter((o) => o !== c && !o.asleep && canHear(ctx.st, o.room, c.room));
  if (guiltShare(ctx, c) > 0 && confess(ctx, c, hearers, 'breakdown')) return;
  const guilty = ctx.data.romance.guilty;
  if (!c.thoughts.some((x) => x.id === guilty)) return;
  let mine: News | null = null;
  for (const n of c.news) {
    if (n.with === null || (n.who !== c.id && n.with !== c.id) || !aboard(ctx, n.who === c.id ? n.with : n.who)) continue;
    if (!mine || n.t > mine.t) mine = n;
  }
  if (!mine) return;
  const other = mine.who === c.id ? mine.with! : mine.who;
  c.thoughts = c.thoughts.filter((x) => x.id !== guilty);
  updateMood(ctx, c);
  log(ctx, 'blurted', [c.id, other, ...hearers.map((h) => h.id)], c.room, { what: mine.what });
  for (const h of hearers) if (h.id !== other) hear(ctx, h, mine, 'confession');
}
