import { describe, expect, it } from 'vitest';
import { createWorld, step } from '../src/core/index.js';
import { attractionTarget, feel, genderFit, meet, personalityFit, rel } from '../src/core/ledger.js';
import { fight, fightChance, flirtOdds, interactionChance, interactionWeight, knock, knockOdds } from '../src/core/social.js';
import { think } from '../src/core/thoughts.js';
import type { Contestant } from '../src/core/types.js';
import { station } from '../src/core/station.js';
import { ctxFor, data } from './helpers.js';

/** A world with the first cast aboard, and a context for calling systems directly. */
function aboard(seed = 11, d = data) {
  const w = createWorld(d, seed);
  step(w, 8 * 60);
  return { w, ctx: { ...ctxFor(w), data: d, st: station(d) }, cast: w.contestants };
}

const flat = (x: number) => ({ outgoing: x, kind: x, honest: x, calm: x, loyal: x, brave: x, vain: x, playful: x });

describe('interaction chance', () => {
  it('is outgoing ÷ 10 × (0.5 + social urgency)', () => {
    const { ctx, cast } = aboard();
    const c = cast[0]!;
    c.personality.outgoing = 8;
    c.needs.social = 100;
    expect(interactionChance(ctx, c)).toBeCloseTo(0.4);
    c.needs.social = 0;
    expect(interactionChance(ctx, c)).toBeCloseTo(1.2);
  });

  it('scales insults by dislike and cruelty, and gates flirts on attraction', () => {
    const { ctx, cast } = aboard();
    const [a, b] = cast as [Contestant, Contestant];
    meet(ctx, a, b);
    const insult = data.social.interactions.find((d) => d.id === 'insult')!;
    const flirt = data.social.interactions.find((d) => d.id === 'flirt')!;
    a.personality.kind = 5;
    rel(a, b)!.affection = 0;
    expect(interactionWeight(ctx, a, b, insult)).toBeCloseTo(insult.weight);
    rel(a, b)!.affection = -50; // × 2
    a.personality.kind = 0; // × 2
    expect(interactionWeight(ctx, a, b, insult)).toBeCloseTo(insult.weight * 4);
    rel(a, b)!.attraction = 3.9;
    expect(interactionWeight(ctx, a, b, flirt)).toBe(0);
    rel(a, b)!.attraction = 5;
    expect(interactionWeight(ctx, a, b, flirt)).toBeGreaterThan(0);
  });
});

describe('attraction', () => {
  it('fits gender through the two attraction axes', () => {
    const { cast } = aboard();
    const [a, b] = cast as [Contestant, Contestant];
    Object.assign(a, { drawnToFeminine: 10, drawnToMasculine: 0 });
    Object.assign(b, { gender: 0 });
    expect(genderFit(a, b)).toBe(1);
    b.gender = 10;
    expect(genderFit(a, b)).toBe(0);
    Object.assign(a, { drawnToFeminine: 6, drawnToMasculine: 4 });
    b.gender = 5;
    expect(genderFit(a, b)).toBeCloseTo(0.5);
  });

  it('is scale × genderFit × (0.4 beauty + 0.6 perceived fit + chemistry), first impressions on looks', () => {
    const ten = structuredClone(data);
    ten.social.attraction.scale = 10;
    const { ctx, cast } = aboard(undefined, ten);
    const [a, b] = cast as [Contestant, Contestant];
    Object.assign(a, { drawnToFeminine: 10, drawnToMasculine: 10, ideal: { ...flat(5), honest: 10 } });
    Object.assign(b, { gender: 5, beauty: 7, rank: 4, personality: { ...flat(5), honest: 10 } }); // rank 4 clothes: beauty +0
    meet(ctx, a, b);
    const r = rel(a, b)!;
    r.chemistry = 0.1;
    r.knows = 0; // fit is judged on looks: 0.7
    expect(attractionTarget(ctx, a, b)).toBeCloseTo(10 * (0.4 * 0.7 + 0.6 * 0.7 + 0.1));
    r.knows = 1; // a perfect match for their ideal
    expect(personalityFit(ctx, a, b)).toBe(1);
    expect(attractionTarget(ctx, a, b)).toBeCloseTo(10 * (0.4 * 0.7 + 0.6 * 1 + 0.1));
  });

  it('lets a deceptive contestant look more like your type than they are', () => {
    const { ctx, cast } = aboard();
    const [a, b] = cast as [Contestant, Contestant];
    Object.assign(a, { drawnToFeminine: 10, drawnToMasculine: 10, ideal: flat(10) });
    Object.assign(b, { gender: 5, personality: flat(5) });
    meet(ctx, a, b);
    rel(a, b)!.knows = 1;
    b.personality.honest = 10;
    const honest = attractionTarget(ctx, a, b);
    b.personality.honest = 0;
    expect(attractionTarget(ctx, a, b)).toBeGreaterThan(honest);
  });
});

describe('flirts and fights', () => {
  it('lands a flirt with odds from the attraction back', () => {
    const { ctx, cast } = aboard();
    const [a, b] = cast as [Contestant, Contestant];
    meet(ctx, a, b);
    rel(b, a)!.attraction = 7;
    expect(flirtOdds(ctx, b, a)).toBeCloseTo(0.7);
  });

  it('turns an insult into a fight 4% of the time, ×1.5 for the fully volatile', () => {
    const { ctx, cast } = aboard();
    const c = cast[0]!;
    c.personality.calm = 5;
    expect(fightChance(ctx, c)).toBeCloseTo(0.04);
    c.personality.calm = 0;
    expect(fightChance(ctx, c)).toBeCloseTo(0.06);
  });
});

describe('a fight', () => {
  it('hurts the loser without killing, stops both fighters, and logs the witnesses', () => {
    const { w, ctx, cast } = aboard();
    const [a, b] = cast as [Contestant, Contestant];
    a.health = b.health = 15;
    fight(ctx, a, b);
    const e = ctx.events.find((x) => x.type === 'fight')!;
    expect(e.actors).toEqual([b.id, a.id]); // the insulted one swings
    const loser = e.data!.loser === a.id ? a : b;
    expect(loser.health).toBe(10); // the floor
    expect(a.activity?.action).toBe('fight');
    expect(b.activity?.action).toBe('fight');
    expect(e.data!.outsideCage).toBe(a.room !== 'cage');
    step(w, 10);
    expect(a.activity?.action).not.toBe('fight');
  });
});

describe('the ledger', () => {
  it('keeps dated reasons, merges repeats and clamps values', () => {
    const { ctx, cast } = aboard();
    const [a, b] = cast as [Contestant, Contestant];
    delete a.ledger[b.id];
    delete b.ledger[a.id];
    for (let i = 0; i < 5; i++) feel(ctx, a, b, 'affection', 30, 'chitchat');
    const r = rel(a, b)!;
    expect(r.affection).toBe(100);
    const last = r.reasons[r.reasons.length - 1]!;
    expect(last).toMatchObject({ why: 'chitchat', dim: 'affection', amount: 150, times: 5 });
    feel(ctx, a, b, 'fear', -10, 'insult');
    expect(r.fear).toBe(0);
  });
});

describe('thoughts', () => {
  it('add up into mood, hit harder when volatile, and stack to a limit per person', () => {
    const { ctx, cast } = aboard();
    const [a, b] = cast as [Contestant, Contestant];
    a.species = 'human';
    a.thoughts = [];
    a.personality.calm = 0; // ×1.4
    for (let i = 0; i < 5; i++) think(ctx, a, 'insulted', b.id); // stack 3
    expect(a.thoughts).toHaveLength(3);
    expect(a.mood).toBeCloseTo(50 - 3 * 6 * 1.4);
  });
});

describe('knocking', () => {
  it('odds rise with affection and attraction, scale with kindness, and drop when asleep', () => {
    const { ctx, cast } = aboard();
    const [host, k] = cast as [Contestant, Contestant];
    meet(ctx, host, k);
    host.personality.kind = 5;
    Object.assign(rel(host, k)!, { affection: 0, attraction: 0 });
    expect(knockOdds(ctx, host, k, false)).toBeCloseTo(0.15);
    Object.assign(rel(host, k)!, { affection: 40, attraction: 5 });
    expect(knockOdds(ctx, host, k, false)).toBeCloseTo(0.75);
    expect(knockOdds(ctx, host, k, true)).toBeCloseTo(0.225);
    host.personality.kind = 10;
    expect(knockOdds(ctx, host, k, false)).toBeCloseTo(1);
  });

  it('makes a yes a legal guest, and a repeat knock within three hours costs affection', () => {
    const { w, ctx, cast } = aboard();
    step(w, 14 * 60); // after the first ceremony, everyone has a bed
    const host = cast.find((c) => c.rank === 1)!;
    const k = cast.find((c) => c.rank === 7)!;
    meet(ctx, host, k);
    Object.assign(rel(host, k)!, { affection: 100, attraction: 10 });
    host.asleep = false;
    host.personality.kind = 10; // a sure yes
    for (const c of cast) if (c.guest?.host === host.id) c.guest = null; // not already hosting
    expect(knock(ctx, k, host, 'suite')).toBe(true);
    expect(k.guest).toMatchObject({ room: 'suite', host: host.id });
    const before = rel(host, k)!.affection;
    knock(ctx, k, host, 'suite');
    expect(rel(host, k)!.affection).toBe(before - 3);
  });
});
