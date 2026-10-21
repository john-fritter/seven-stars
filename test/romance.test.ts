import { describe, expect, it } from 'vitest';
import { axis, drink, giftDrink, hangover, qualityFor, soberMinute, stageOf } from '../src/core/booze.js';
import { createWorld, step } from '../src/core/index.js';
import { meet, rel } from '../src/core/ledger.js';
import { askExclusive, evidence, exclusiveOdds, kiss, kissOdds, lovin, propositionOdds, secretFlingOdds } from '../src/core/romance.js';
import { interactionWeight } from '../src/core/social.js';
import type { Contestant, World } from '../src/core/types.js';
import { ctxFor, data } from './helpers.js';

function aboard(seed = 41) {
  const w = createWorld(data, seed);
  step(w, 8 * 60);
  return { w, ctx: ctxFor(w), cast: w.contestants };
}

function alone(w: World, ...keep: Contestant[]) {
  for (const c of w.contestants) {
    if (keep.includes(c)) continue;
    c.room = 'garden';
    c.asleep = true;
  }
}

const flat = (x: number) => ({ outgoing: x, kind: x, honest: x, calm: x, loyal: x, brave: x, vain: x, playful: x });

describe('booze', () => {
  it('pours your rank or the place\'s best, whichever is worse', () => {
    const { ctx, cast } = aboard();
    const c = cast[0]!;
    c.rank = 1;
    expect(qualityFor(ctx, c, 'fancy')).toBe('fancy');
    expect(qualityFor(ctx, c, 'good')).toBe('good');
    expect(qualityFor(ctx, c, 'rotgut')).toBe('rotgut');
    c.rank = 5;
    expect(qualityFor(ctx, c, 'fancy')).toBe('cheap');
  });

  it('adds 25 ÷ size per drink, with stages, drunk honesty, and a fall of 8 an hour', () => {
    const { ctx, cast } = aboard();
    const c = cast[0]!;
    Object.assign(c, { species: 'feline', intox: 0, personality: flat(5) }); // size 0.8
    drink(ctx, c, 'cheap', c.room);
    expect(c.intox).toBeCloseTo(31.25);
    expect(stageOf(ctx, c)?.id).toBe('tipsy');
    drink(ctx, c, 'cheap', c.room);
    expect(stageOf(ctx, c)?.id).toBe('drunk');
    expect(axis(ctx, c, 'honest')).toBe(3);
    expect(axis(ctx, c, 'calm')).toBe(5);
    for (let i = 0; i < 60; i++) soberMinute(ctx, c);
    expect(c.intox).toBeCloseTo(62.5 - 8);
  });

  it('pays for getting hammered, and leaves a hangover sized by what they drank', () => {
    const { ctx, cast } = aboard();
    const c = cast[0]!;
    Object.assign(c, { species: 'human', intox: 0, drinks: 0, thoughts: [], personality: flat(5) });
    for (let i = 0; i < 4; i++) drink(ctx, c, 'rotgut', c.room);
    expect(ctx.events.filter((e) => e.type === 'hammered')).toHaveLength(1);
    hangover(ctx, c);
    expect(c.thoughts.find((x) => x.id === 'hangover')?.value).toBeCloseTo(-10); // 4 × 3.5, capped
    expect(c.drinks).toBe(0);
    c.drinks = 1; // one fancy drink: no hangover
    hangover(ctx, c);
    expect(c.thoughts.filter((x) => x.id === 'hangover')).toHaveLength(1);
  });

  it('makes a better drink a strong favor', () => {
    const { ctx, cast } = aboard();
    const [a, b] = cast as [Contestant, Contestant];
    meet(ctx, a, b);
    Object.assign(b, { rank: 7 });
    rel(b, a)!.affection = 0;
    a.inventory = ['cheap'];
    giftDrink(ctx, a, b);
    expect(rel(b, a)!.affection).toBe(15);
    expect(a.inventory).toHaveLength(0);
    expect(ctx.events.find((e) => e.type === 'gift')!.data!.awards).toBeDefined();
  });
});

describe('romance', () => {
  it('needs a landed flirt before a kiss, and lands one on attraction and affection back', () => {
    const { ctx, cast } = aboard();
    const [a, b] = cast as [Contestant, Contestant];
    meet(ctx, a, b);
    Object.assign(rel(a, b)!, { attraction: 8 });
    Object.assign(rel(b, a)!, { attraction: 6, affection: 50 });
    const kissDef = data.social.interactions.find((d) => d.id === 'kiss')!;
    expect(interactionWeight(ctx, a, b, kissDef)).toBe(0);
    rel(a, b)!.flirts = 1;
    expect(interactionWeight(ctx, a, b, kissDef)).toBeGreaterThan(0);
    expect(kissOdds(ctx, b, a)).toBeCloseTo(0.9);
  });

  it('moves labels to flirting on a kiss, and to dating or a fling after lovin\' by monogamy', () => {
    const { w, ctx, cast } = aboard();
    const [a, b] = cast as [Contestant, Contestant];
    alone(w, a, b);
    Object.assign(a, { room: 'garden', asleep: false, monogamy: 8 });
    Object.assign(b, { room: 'garden', asleep: false, monogamy: 2 });
    meet(ctx, a, b);
    Object.assign(rel(b, a)!, { attraction: 10, affection: 100 });
    kiss(ctx, a, b);
    expect(rel(a, b)!.label).toBe('flirting');
    expect(rel(b, a)!.label).toBe('flirting');
    w.show.today = {};
    lovin(ctx, a, b);
    expect(rel(a, b)!.label).toBe('dating');
    expect(rel(b, a)!.label).toBe('fling');
    expect(a.activity?.action).toBe('lovin');
    expect(b.activity?.partner).toBe(a.id);
    const first = ctx.events.find((e) => e.type === 'lovin')!;
    expect(first.data!.first).toBe(true);
    expect(first.data!.awards).toEqual({ [a.id]: 12, [b.id]: 12 });
    w.show.today = {};
    w.show.pairs = {};
    lovin(ctx, a, b);
    expect(ctx.events.filter((e) => e.type === 'lovin')[1]!.data!.awards).toEqual({ [a.id]: 3, [b.id]: 3 });
  });

  it('only gets a yes from someone who wants it too', () => {
    const { ctx, cast } = aboard();
    const [a, b] = cast as [Contestant, Contestant];
    meet(ctx, a, b);
    Object.assign(rel(b, a)!, { attraction: 5, affection: 50 });
    expect(propositionOdds(ctx, b, a)).toBe(0);
    Object.assign(rel(b, a)!, { attraction: 7, affection: 10 });
    expect(propositionOdds(ctx, b, a)).toBe(0);
    Object.assign(rel(b, a)!, { attraction: 7, affection: 30 });
    expect(propositionOdds(ctx, b, a)).toBeCloseTo(0.7);
  });

  it('asks for exclusivity on attraction, monogamy and loyalty, and lets the deceptive lie', () => {
    const { ctx, cast } = aboard();
    const [a, b] = cast as [Contestant, Contestant];
    meet(ctx, a, b);
    Object.assign(b, { monogamy: 5, personality: flat(5) });
    rel(b, a)!.attraction = 8;
    expect(exclusiveOdds(ctx, b, a)).toBeCloseTo(0.8);
    Object.assign(b, { monogamy: 0, personality: { ...flat(5), honest: 0 } });
    expect(secretFlingOdds(b)).toBe(1);
    Object.assign(b, { monogamy: 10, personality: flat(10) });
    rel(b, a)!.attraction = 10;
    rel(a, b)!.label = 'dating';
    askExclusive(ctx, a, b);
    expect(rel(a, b)!.label).toBe('exclusive');
    expect(rel(b, a)!.label).toBe('exclusive');
  });

  it('turns what you see into betrayal or jealousy by your own label', () => {
    const { w, ctx, cast } = aboard();
    const [a, b, c] = cast as [Contestant, Contestant, Contestant];
    alone(w, a, b, c);
    meet(ctx, a, b);
    rel(a, b)!.label = 'exclusive';
    rel(a, b)!.affection = 50;
    w.show.today = {};
    evidence(ctx, a, b, c, 'kiss');
    expect(rel(a, b)!.affection).toBe(10);
    const e = ctx.events.find((x) => x.type === 'betrayal')!;
    expect(e.actors).toEqual([a.id, b.id, c.id]);
    expect(Object.keys(e.data!.awards as object)).toHaveLength(3);
    rel(a, b)!.label = 'dating';
    evidence(ctx, a, b, c, 'kiss');
    expect(ctx.events.some((x) => x.type === 'jealous')).toBe(true);
    rel(a, b)!.label = 'none';
    const n = ctx.events.length;
    evidence(ctx, a, b, c, 'kiss');
    expect(ctx.events.length).toBe(n);
  });

  it('makes a cheater feel guilty and the witness feel betrayed when it happens in front of them', () => {
    const { w, ctx, cast } = aboard();
    const [a, b, c] = cast as [Contestant, Contestant, Contestant];
    alone(w, a, b, c);
    for (const x of [a, b, c]) Object.assign(x, { room: 'garden', asleep: false });
    meet(ctx, a, b);
    meet(ctx, b, c);
    rel(a, b)!.label = 'exclusive';
    rel(b, a)!.label = 'exclusive';
    lovin(ctx, b, c);
    expect(b.thoughts.some((x) => x.id === 'guilty' && x.about === a.id)).toBe(true);
    expect(a.thoughts.some((x) => x.id === 'betrayed' && x.about === b.id)).toBe(true);
  });
});
