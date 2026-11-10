import { describe, expect, it } from 'vitest';
import { createWorld, step } from '../src/core/index.js';
import { meet, rel } from '../src/core/ledger.js';
import { CARD_CHEAT, hear, isNews, knownFor, learn, learnRep, looseLips, scoop, twoTimer, willing } from '../src/core/news.js';
import { topics } from '../src/core/confessionals.js';
import { exclusiveOdds, kissOdds } from '../src/core/romance.js';
import type { Contestant, World } from '../src/core/types.js';
import { ctxFor, data } from './helpers.js';

function aboard(seed = 41) {
  const w = createWorld(data, seed);
  step(w, 8 * 60);
  return { w, ctx: ctxFor(w), cast: w.contestants as Contestant[] };
}

function alone(w: World, ...keep: Contestant[]) {
  for (const c of w.contestants) {
    if (keep.includes(c)) continue;
    c.room = 'garden';
    c.asleep = true;
  }
}

const flat = (x: number) => ({ outgoing: x, kind: x, honest: x, calm: x, loyal: x, brave: x, vain: x, playful: x });
const count = (ctx: { events: { type: string }[] }, type: string) => ctx.events.filter((e) => e.type === type).length;

describe('what people know', () => {
  it('only news lands: old news does nothing, more of the same only stokes it, worse lands again', () => {
    const { w, ctx, cast } = aboard();
    const [a, b, c] = cast as [Contestant, Contestant, Contestant];
    alone(w, a);
    meet(ctx, a, b);
    meet(ctx, a, c);
    rel(a, b)!.label = 'exclusive';
    learn(ctx, a, b, c, 'kiss', w.t - 60, 'gossip');
    expect(count(ctx, 'betrayal')).toBe(1);
    const affection = rel(a, b)!.affection;
    // Hearing it again, or an older version: nothing.
    hear(ctx, a, { who: b.id, with: c.id, what: 'kiss', t: w.t - 60 }, 'gossip');
    hear(ctx, a, { who: c.id, with: b.id, what: 'kiss', t: w.t - 600 }, 'scene');
    expect(count(ctx, 'betrayal')).toBe(1);
    // Another kiss later: they're still at it. The betrayal starts over, but no new scene or hit.
    a.thoughts = a.thoughts.filter((x) => x.id !== 'betrayed');
    w.t += 120;
    learn(ctx, a, b, c, 'kiss');
    expect(count(ctx, 'betrayal')).toBe(1);
    expect(rel(a, b)!.affection).toBe(affection);
    expect(a.thoughts.some((x) => x.id === 'betrayed' && x.about === b.id)).toBe(true);
    // Lovin' is worse than a kiss: that's news.
    learn(ctx, a, b, c, 'lovin');
    expect(count(ctx, 'betrayal')).toBe(2);
    expect(isNews(ctx, a, { who: b.id, with: c.id, what: 'kiss', t: w.t })).toBe(false);
  });

  it('reacts later to something they knew before they cared', () => {
    const { w, ctx, cast } = aboard();
    const [a, b, c] = cast as [Contestant, Contestant, Contestant];
    alone(w, a);
    meet(ctx, a, b);
    learn(ctx, a, b, c, 'kiss'); // nothing between a and b yet
    expect(count(ctx, 'betrayal')).toBe(0);
    rel(a, b)!.label = 'exclusive';
    w.t += 60;
    learn(ctx, a, b, c, 'kiss');
    expect(count(ctx, 'betrayal')).toBe(1);
  });

  it('forgets news about people who have gone', () => {
    const { w, ctx, cast } = aboard();
    const [a, b, c, d] = cast as [Contestant, Contestant, Contestant, Contestant];
    learn(ctx, a, b, c, 'kiss');
    w.contestants = w.contestants.filter((x) => x !== c);
    learn(ctx, a, b, d, 'kiss');
    expect(a.news.map((n) => n.with)).toEqual([d.id]);
  });

  it('the loyal keep their friends’ secrets', () => {
    const { w, ctx, cast } = aboard();
    const [a, b, c, d] = cast as [Contestant, Contestant, Contestant, Contestant];
    alone(w, a, b);
    meet(ctx, a, b);
    meet(ctx, a, c);
    Object.assign(rel(a, c)!, { affection: 80 });
    const n = { who: c.id, with: d.id, what: 'kiss', t: w.t };
    a.personality = flat(10);
    expect(willing(ctx, a, n)).toBe(0);
    a.personality = { ...flat(5), loyal: 2 };
    expect(willing(ctx, a, n)).toBeCloseTo(0.8);
    // Loyal 10, drunk: still won't tell on a friend.
    a.personality = flat(10);
    a.intox = 100;
    learn(ctx, a, c, d, 'kiss');
    for (let i = 0; i < 100; i++) looseLips(ctx, a, b, 'chitchat');
    expect(count(ctx, 'blab')).toBe(0);
    // ...but someone they don't care about is fair game.
    Object.assign(rel(a, c)!, { affection: 0 });
    for (let i = 0; i < 100 && !count(ctx, 'blab'); i++) looseLips(ctx, a, b, 'chitchat');
    expect(count(ctx, 'blab')).toBe(1);
  });

  it('a loyal friend tips someone off about a straying partner', () => {
    const { w, ctx, cast } = aboard();
    const [a, b, c, d] = cast as [Contestant, Contestant, Contestant, Contestant];
    alone(w, a, b);
    meet(ctx, a, b);
    meet(ctx, b, c);
    a.personality = { ...flat(5), loyal: 10, honest: 10, playful: 0 }; // never gossips sober
    Object.assign(rel(a, b)!, { affection: 100 });
    Object.assign(rel(b, c)!, { label: 'dating', affection: 50, attraction: 8 });
    learn(ctx, a, c, d, 'kiss');
    for (let i = 0; i < 100 && !count(ctx, 'tip_off'); i++) looseLips(ctx, a, b, 'chitchat');
    expect(ctx.events.find((e) => e.type === 'tip_off')?.actors).toEqual([a.id, b.id, c.id, d.id]);
    expect(count(ctx, 'jealous')).toBe(1);
    expect(isNews(ctx, b, { who: c.id, with: d.id, what: 'kiss', t: w.t })).toBe(false);
  });

  it('a scoop is only worth telling the camera while people don’t know', () => {
    const { ctx, cast } = aboard();
    const [a, b, c] = cast as [Contestant, Contestant, Contestant];
    for (const x of cast) x.news = [];
    learn(ctx, a, b, c, 'kiss');
    const n = a.news[0]!;
    expect(scoop(ctx, a, n)).toBe(1);
    expect(topics(ctx, a).some((t) => t.kind === 'spill')).toBe(true);
    for (const x of cast) if (x !== a && x !== b && x !== c) learn(ctx, x, b, c, 'kiss');
    expect(scoop(ctx, a, n)).toBe(0);
    expect(topics(ctx, a).some((t) => t.kind === 'spill')).toBe(false);
  });
});

describe('reputation', () => {
  it('a card cheat is known, and gossip spreads it', () => {
    const { ctx, cast } = aboard();
    const [a, b, c] = cast as [Contestant, Contestant, Contestant];
    expect(learnRep(ctx, a, b, CARD_CHEAT)).toBe(true);
    expect(learnRep(ctx, a, b, CARD_CHEAT)).toBe(false);
    expect(knownFor(a, b.id, CARD_CHEAT)).toBe(true);
    hear(ctx, c, a.news.find((n) => n.with === null)!, 'gossip');
    expect(knownFor(c, b.id, CARD_CHEAT)).toBe(true);
  });

  it('a known two-timer finds kisses and commitment harder to come by', () => {
    const { w, ctx, cast } = aboard();
    const [a, b, c, d] = cast as [Contestant, Contestant, Contestant, Contestant];
    alone(w, a);
    meet(ctx, a, b);
    Object.assign(rel(a, b)!, { affection: 40, attraction: 6 });
    a.monogamy = 10;
    const kiss = kissOdds(ctx, a, b);
    const commit = exclusiveOdds(ctx, a, b);
    learn(ctx, a, b, c, 'kiss');
    expect(twoTimer(ctx, a, b.id)).toBe(false);
    learn(ctx, a, b, d, 'kiss');
    expect(twoTimer(ctx, a, b.id)).toBe(true);
    expect(kissOdds(ctx, a, b)).toBeCloseTo(kiss * 0.5);
    expect(exclusiveOdds(ctx, a, b)).toBeCloseTo(commit * data.news.reputation.two_timer.exclusive);
    w.t += 8 * 1440;
    expect(twoTimer(ctx, a, b.id)).toBe(false);
  });
});
