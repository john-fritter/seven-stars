// What people know. DESIGN.md Part two, What people know.
//
// Every contestant carries their own news: who's been with whom (the worst of it, and when it last
// happened) and who's known for what (a card cheat). Seeing it, doing it or hearing about it all
// count. Only news lands: hearing what they already know, or an older or milder version of it,
// does nothing, and seeing the same two at it again only stokes what they already feel.
//
// Gossip picks what to tell by how fresh it is, how much the listener cares, and how willing the
// teller is to tell on the people in it: the loyal keep their friends' secrets, and tip off a
// friend whose partner is straying.
//
//   weight  = 0.5^(age ÷ halfLife) × (juicy for the listener ? juicy : 1)   which piece comes to mind
//   willing = Π over the people in it (1 − protect × loyal/10 × affection/100)   the odds they say it
import { axis, stageOf } from './booze.js';
import { log, type Ctx } from './context.js';
import { chance, weightedIndex } from './rng.js';
import { canHear } from './station.js';
import { evidence, labelOf, stoke } from './romance.js';
import type { Contestant, Label, News } from './types.js';

/** The reputation for cheating at cards (news.yaml reputation.card_cheat). */
export const CARD_CHEAT = 'card_cheat';

const INVOLVED: readonly Label[] = ['flirting', 'fling', 'dating', 'exclusive'];

function aboard(ctx: Ctx, id: string): Contestant | undefined {
  return ctx.w.contestants.find((x) => x.id === id);
}

export function severity(ctx: Ctx, what: string): number {
  return ctx.data.news.severity[what] ?? 1;
}

/** What `x` knows about this pair, if anything. */
export function newsOf(x: Contestant, a: string, b: string): News | undefined {
  return x.news.find((n) => n.with !== null && ((n.who === a && n.with === b) || (n.who === b && n.with === a)));
}

/** Whether `x` knows about this pair. */
export function knows(x: Contestant, a: string, b: string): boolean {
  return newsOf(x, a, b) !== undefined;
}

/** Whether `x` knows `who` for `what` (a card cheat). */
export function knownFor(x: Contestant, who: string, what: string): boolean {
  return x.news.some((n) => n.with === null && n.who === who && n.what === what);
}

/** Whether this would be news to `x`: they don't know it, or only a milder version. */
export function isNews(ctx: Ctx, x: Contestant, n: News): boolean {
  if (n.with === null) return !knownFor(x, n.who, n.what);
  const k = newsOf(x, n.who, n.with);
  return !k || severity(ctx, n.what) > severity(ctx, k.what);
}

/** Forgets news about anyone no longer aboard. */
function prune(ctx: Ctx, x: Contestant): void {
  if (x.news.some((n) => !aboard(ctx, n.who) || (n.with !== null && !aboard(ctx, n.with)))) {
    x.news = x.news.filter((n) => aboard(ctx, n.who) && (n.with === null || aboard(ctx, n.with)));
  }
}

/**
 * `x` learns that `who` and `other` got together (`what`: kiss, lovin', ...), last at `t`. `how` is
 * what the log calls it (they saw it, gossip, a scene). If it's news, they react as to catching
 * them at it; if they'd already reacted to it, seeing more of the same only stokes it; old news
 * does nothing. Returns whether it was news.
 */
export function learn(ctx: Ctx, x: Contestant, who: Contestant, other: Contestant, what: string, t = ctx.w.t, how = what): boolean {
  prune(ctx, x);
  const k = newsOf(x, who.id, other.id);
  const worse = !k || severity(ctx, what) > severity(ctx, k.what);
  if (k && !worse && t <= k.t) return false; // old news
  const n = k ?? { who: who.id, with: other.id, what, t };
  if (k) {
    if (worse) k.what = what;
    k.t = Math.max(k.t, t);
  } else x.news.push(n);
  if (x === who || x === other) return worse;
  if (worse || !n.felt) {
    const reacted = evidence(ctx, x, who, other, how) || evidence(ctx, x, other, who, how);
    if (reacted) n.felt = true;
  } else {
    stoke(ctx, x, who, other);
    stoke(ctx, x, other, who);
  }
  return worse;
}

/** `x` learns `who` is known for `what` (news.yaml reputation). Returns whether it was news. */
export function learnRep(ctx: Ctx, x: Contestant, who: Contestant, what: string, t = ctx.w.t): boolean {
  if (x === who || knownFor(x, who.id, what)) return false;
  prune(ctx, x);
  x.news.push({ who: who.id, with: null, what, t });
  return true;
}

/** Passes one piece of news on: `x` hears it (`how`: gossip, a scene, playback). */
export function hear(ctx: Ctx, x: Contestant, n: News, how: string): boolean {
  const who = aboard(ctx, n.who);
  if (!who) return false;
  if (n.with === null) return learnRep(ctx, x, who, n.what, n.t);
  const other = aboard(ctx, n.with);
  return !!other && learn(ctx, x, who, other, n.what, n.t, how);
}

/** A two-timer, as far as `x` knows: with two different people inside news.yaml two_timer.days. */
export function twoTimer(ctx: Ctx, x: Contestant, who: string): boolean {
  const since = ctx.w.t - ctx.data.news.reputation.two_timer.days * 1440;
  let first: string | null = null;
  for (const n of x.news) {
    if (n.with === null || n.t < since || (n.who !== who && n.with !== who)) continue;
    const other = n.who === who ? n.with : n.who;
    if (first === null) first = other;
    else if (other !== first) return true;
  }
  return false;
}

/** How willing `c` is to tell this: the loyal won't tell on people they like. */
export function willing(ctx: Ctx, c: Contestant, n: News): number {
  const k = ctx.data.news.protect * (axis(ctx, c, 'loyal') / 10);
  let w = 1;
  for (const id of n.with === null ? [n.who] : [n.who, n.with]) {
    if (id === c.id) continue;
    const aff = c.ledger[id]?.affection ?? 0;
    w *= Math.max(0, 1 - (k * Math.max(0, aff)) / 100);
  }
  return w;
}

/** How fresh it is: 1 now, halving every news.yaml gossip.halfLifeDays. */
export function freshness(ctx: Ctx, n: News): number {
  return Math.pow(0.5, (ctx.w.t - n.t) / (ctx.data.news.gossip.halfLifeDays * 1440));
}

/** The share of everyone else aboard (not the teller or the people in it) who don't know it yet. */
export function scoop(ctx: Ctx, c: Contestant, n: News): number {
  const others = ctx.w.contestants.filter((x) => x !== c && x.id !== n.who && x.id !== n.with);
  if (!others.length) return 0;
  return others.filter((x) => isNews(ctx, x, n)).length / others.length;
}

/** Something `c` tells `o`: news to them, not about either of them, if they're willing to say it. */
function pickNews(ctx: Ctx, c: Contestant, o: Contestant): News | null {
  const g = ctx.data.news.gossip;
  const options: News[] = [];
  const weights: number[] = [];
  for (const n of c.news) {
    if (n.who === c.id || n.with === c.id || n.who === o.id || n.with === o.id) continue;
    if (!aboard(ctx, n.who) || (n.with !== null && !aboard(ctx, n.with)) || !isNews(ctx, o, n)) continue;
    const juicy = n.with !== null && (labelOf(o, aboard(ctx, n.who)!) !== 'none' || labelOf(o, aboard(ctx, n.with)!) !== 'none');
    options.push(n);
    weights.push(freshness(ctx, n) * (juicy ? g.juicy : 1));
  }
  if (!options.length) return null;
  // What comes to mind first; then whether they'll actually say it.
  const n = options[weightedIndex(ctx.w.rng, weights)]!;
  return chance(ctx.w.rng, willing(ctx, c, n)) ? n : null;
}

/**
 * Tipping off a friend (news.yaml tipOff): `c` knows someone `o` is involved with has been with
 * someone else, and tells them straight, out of loyalty to `o`.
 */
function tipOff(ctx: Ctx, c: Contestant, o: Contestant): boolean {
  const aff = c.ledger[o.id]?.affection ?? 0;
  const base = ctx.data.news.tipOff.k * (axis(ctx, c, 'loyal') / 10) * (Math.max(0, aff) / 100);
  if (base <= 0) return false;
  for (const n of [...c.news].reverse()) {
    if (n.with === null || n.who === c.id || n.with === c.id || n.who === o.id || n.with === o.id || !isNews(ctx, o, n)) continue;
    const a = aboard(ctx, n.who);
    const b = aboard(ctx, n.with);
    if (!a || !b) continue;
    const partner = INVOLVED.includes(labelOf(o, a)) ? a : INVOLVED.includes(labelOf(o, b)) ? b : null;
    if (!partner) continue;
    if (!chance(ctx.w.rng, base * willing(ctx, c, { ...n, who: partner.id, with: null }))) return false;
    log(ctx, 'tip_off', [c.id, o.id, partner.id, (partner === a ? b : a).id], c.room, { what: n.what });
    hear(ctx, o, n, 'tip_off');
    return true;
  }
  return false;
}

/**
 * Loose lips, after a chat (news.yaml gossip.interactions): drink makes them confess their own
 * cheating to the one they're cheating on; a loyal friend tips them off about a straying partner;
 * or they blurt something they know, picked by worth. Sober, the playful and the dishonest
 * gossip a little too.
 */
export function looseLips(ctx: Ctx, c: Contestant, o: Contestant, id: string): void {
  const g = ctx.data.news.gossip;
  if (!g.interactions.includes(id)) return;
  const ro = ctx.data.romance;
  const st = stageOf(ctx, c) ?? { id: 'sober', lips: g.sober * Math.max(0, 1 + c.personality.playful / 10 - c.personality.honest / 10), confess: 0 };
  if (st.confess && c.thoughts.some((x) => x.id === ro.guilty && x.about === o.id) && chance(ctx.w.rng, st.confess)) {
    const mine = [...c.news].reverse().find((n) => n.with !== null && (n.who === c.id || n.with === c.id) && n.who !== o.id && n.with !== o.id && isNews(ctx, o, n) && aboard(ctx, n.who === c.id ? n.with : n.who));
    if (mine) {
      const other = aboard(ctx, mine.who === c.id ? mine.with! : mine.who)!;
      c.thoughts = c.thoughts.filter((x) => !(x.id === ro.guilty && x.about === o.id));
      log(ctx, 'confession', [c.id, o.id, other.id], c.room, { stage: st.id });
      hear(ctx, o, mine, 'confession');
      return;
    }
  }
  if (tipOff(ctx, c, o)) return;
  if (!st.lips || !chance(ctx.w.rng, st.lips)) return;
  const n = pickNews(ctx, c, o);
  if (!n) return;
  const juicy = n.with !== null && (labelOf(o, aboard(ctx, n.who)!) !== 'none' || labelOf(o, aboard(ctx, n.with)!) !== 'none');
  log(ctx, 'blab', [c.id, o.id, n.who, ...(n.with ? [n.with] : [])], c.room, { stage: st.id, juicy, what: n.what });
  hear(ctx, o, n, 'gossip');
}

/** The latest romance `c` knows of between `target` and someone else aboard. */
export function latestAbout(ctx: Ctx, c: Contestant, target: Contestant): News | null {
  let best: News | null = null;
  for (const n of c.news) {
    if (n.with === null || (n.who !== target.id && n.with !== target.id)) continue;
    const other = n.who === target.id ? n.with : n.who;
    if (other === c.id || !aboard(ctx, other)) continue;
    if (!best || n.t > best.t) best = n;
  }
  return best;
}

/** A scene: everyone here hears what `target` did, from someone falling apart in front of them. */
export function airIt(ctx: Ctx, c: Contestant, target: Contestant): void {
  const n = latestAbout(ctx, c, target);
  if (!n) return;
  const other = n.who === target.id ? n.with! : n.who;
  const heard = ctx.w.contestants.filter((x) => x !== c && x.id !== target.id && x.id !== other && canHear(ctx.st, x.room, c.room) && !x.asleep);
  log(ctx, 'scene', [c.id, target.id, other], c.room, { heard: heard.map((x) => x.id) });
  for (const x of heard) hear(ctx, x, n, 'scene');
}

/** Pouring it all out to a friend: something they know about someone else may spill too. */
export function pourOut(ctx: Ctx, c: Contestant, friend: Contestant): void {
  const n = pickNews(ctx, c, friend);
  if (!n) return;
  log(ctx, 'blab', [c.id, friend.id, n.who, ...(n.with ? [n.with] : [])], c.room, { venting: true, what: n.what });
  hear(ctx, friend, n, 'gossip');
}
