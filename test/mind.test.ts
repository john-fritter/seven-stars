import { describe, expect, it } from 'vitest';
import { attack, breakLevel, breakLines, startBreak } from '../src/core/breaks.js';
import { createWorld, step } from '../src/core/index.js';
import { meet, rel } from '../src/core/ledger.js';
import { spacings } from '../src/core/show.js';
import { condition, conditions, grievance, think, thoughtValue, updateMood } from '../src/core/thoughts.js';
import type { Contestant, World } from '../src/core/types.js';
import { ctxFor, data } from './helpers.js';

function aboard(seed = 31, d = data) {
  const w = createWorld(d, seed);
  step(w, 8 * 60);
  return { w, ctx: { ...ctxFor(w), data: d }, cast: w.contestants };
}

/** Everyone but `keep` asleep in the garden, out of the way. */
function alone(w: World, ...keep: Contestant[]) {
  for (const c of w.contestants) {
    if (keep.includes(c)) continue;
    c.room = 'garden';
    c.asleep = true;
  }
}

const flat = (x: number) => ({ outgoing: x, kind: x, honest: x, calm: x, loyal: x, brave: x, vain: x, playful: x });

describe('thoughts', () => {
  it('scale with personality: vain people feel the couch more, brave people fear less', () => {
    const { ctx, cast } = aboard();
    const c = cast[0]!;
    c.species = 'human';
    c.personality = flat(5);
    expect(thoughtValue(ctx, c, 'slept_couch')).toBeCloseTo(-6);
    c.personality.vain = 10;
    expect(thoughtValue(ctx, c, 'slept_couch')).toBeCloseTo(-9);
    expect(thoughtValue(ctx, c, 'watched_execution')).toBeCloseTo(-8);
    c.personality.brave = 10;
    expect(thoughtValue(ctx, c, 'watched_execution')).toBeCloseTo(-4);
    // Each source has the traits that feel it: the loyal grieve harder, the outgoing feel rejection more.
    expect(thoughtValue(ctx, c, 'friend_died')).toBeCloseTo(-12);
    c.personality.loyal = 10;
    expect(thoughtValue(ctx, c, 'friend_died')).toBeCloseTo(-18);
    c.personality.outgoing = 0;
    expect(thoughtValue(ctx, c, 'rebuffed')).toBeCloseTo(-4);
  });

  it('come and go with conditions: low needs and the cold', () => {
    const { w, ctx, cast } = aboard();
    const c = cast[0]!;
    Object.assign(c, { personality: flat(5), rank: 4, room: 'cafe', thoughts: [] });
    Object.assign(c.needs, { hunger: 10, social: 50, fun: 50, comfort: 50 });
    w.rooms.cafe!.temp = data.species.species[c.species]!.comfort[0] - 6; // rank-4 clothes add 1: felt 5° under
    conditions(ctx, c);
    expect(c.thoughts.find((x) => x.id === 'hungry')?.value).toBeCloseTo(-4);
    expect(c.thoughts.find((x) => x.id === 'too_cold')?.value).toBeCloseTo(-2.5);
    c.needs.hunger = 80;
    const [lo, hi] = data.species.species[c.species]!.comfort;
    w.rooms.cafe!.temp = (lo + hi) / 2 - 1;
    conditions(ctx, c);
    expect(c.thoughts).toHaveLength(0);
    condition(ctx, c, 'too_hot', -3);
    condition(ctx, c, 'too_hot', -5);
    expect(c.thoughts.filter((x) => x.id === 'too_hot')).toHaveLength(1);
    expect(c.mood).toBeCloseTo(45);
    Object.assign(c.needs, { social: 90, fun: 90, comfort: 90 }); // well-met needs lift mood
    conditions(ctx, c);
    expect(c.thoughts.map((x) => x.id).sort()).toEqual(['comfortable', 'good_company', 'good_time']);
  });

  it('add up to mood with each source of misery capped', () => {
    const { ctx, cast } = aboard();
    const c = cast[0]!;
    c.personality = flat(5);
    c.thoughts = [];
    const add = (id: string, value: number) => c.thoughts.push({ id, about: null, value, until: ctx.w.t + 600 });
    add('watched_execution', -8);
    add('watched_execution', -8);
    add('someone_died', -6); // fear: −22, capped at −20
    add('sentenced', -10); // humiliation: its own cap
    add('ate_gourmet', 30); // good thoughts aren't capped
    updateMood(ctx, c);
    expect(c.mood).toBeCloseTo(50 - 20 - 10 + 30);
    updateMood({ ...ctx, data: { ...data, thoughts: { ...data.thoughts, sourceCap: 0 } } }, c);
    expect(c.mood).toBeCloseTo(50 - 22 - 10 + 30);
  });

  it('pick the biggest grievance and who it is about', () => {
    const { ctx, cast } = aboard();
    const [a, b, c] = cast as [Contestant, Contestant, Contestant];
    a.thoughts = [];
    think(ctx, a, 'insulted', b.id);
    think(ctx, a, 'insulted', b.id);
    think(ctx, a, 'slighted', c.id);
    think(ctx, a, 'trapped');
    expect(grievance(ctx, a, data.breaks.sources)).toEqual({ source: 'person', about: b.id });
  });
});

describe('breaks', () => {
  it('draw their lines from calmness', () => {
    const { ctx } = aboard();
    const l = breakLines(ctx, 5);
    expect(l.minor).toBeCloseTo(37.5);
    expect(l.major).toBeCloseTo(37.5 * 4 / 7, 2);
    expect(l.extreme).toBeCloseTo(37.5 / 7, 2);
    expect(breakLines(ctx, 0).minor).toBeCloseTo(45);
  });

  it('go by the deepest line their mood is under', () => {
    const { ctx, cast } = aboard();
    const c = cast[0]!;
    c.personality.calm = 5;
    for (const [mood, level] of [[50, null], [30, 'minor'], [15, 'major'], [3, 'extreme']] as const) {
      c.mood = mood;
      expect(breakLevel(ctx, c)).toBe(level);
    }
  });

  it('collapse by grievance unless the breaker is cruel or volatile, and pay by level', () => {
    const { w, ctx, cast } = aboard();
    const [a, b] = cast as [Contestant, Contestant];
    alone(w, a, b);
    Object.assign(a, { room: 'cafe', personality: flat(5) });
    Object.assign(b, { room: 'cafe', asleep: false });
    w.show.today = {};
    // Terror freezes them; rage at a person becomes a screaming spree.
    startBreak(ctx, a, 'extreme', 'fear', 'lash_out', b.id);
    expect(a.breakdown?.kind).toBe('catatonic');
    const e = ctx.events.find((x) => x.type === 'break')!;
    expect(e.data!.awards).toEqual({ [a.id]: 15 * 1.15 }); // b watched
    step(w, 121);
    expect(a.breakdown).toBeNull();
    expect(a.thoughts.some((x) => x.id === 'catharsis')).toBe(true);
    alone(w, a, b);
    Object.assign(a, { room: 'cafe', asleep: false });
    Object.assign(b, { room: 'cafe', asleep: false });
    startBreak(ctx, a, 'extreme', 'person', 'attack', b.id);
    expect(a.breakdown?.kind).toBe('insult_spree');

    a.personality.kind = 2;
    alone(w, a, b);
    Object.assign(a, { room: 'cafe', asleep: false });
    Object.assign(b, { room: 'cafe', asleep: false });
    startBreak(ctx, a, 'extreme', 'person', 'attack', b.id);
    expect(ctx.events.some((x) => x.type === 'fight' && x.data!.attack && x.actors[0] === a.id)).toBe(true);
  });

  it('fall back to moping when there is nobody to take it out on', () => {
    const { ctx, cast } = aboard();
    const a = cast[0]!;
    startBreak(ctx, a, 'minor', 'person', 'insult_spree', null);
    expect(a.breakdown?.kind).toBe('mope');
    expect(a.activity?.room).toBe(a.room);
  });

  it('can turn a crime of passion into a murder, with points kept secret until the killer dies', () => {
    const lethal = structuredClone(data);
    lethal.breaks.passion.perStrength = 1;
    lethal.breaks.passion.firstBlow = 100;
    const { w, ctx, cast } = aboard(31, lethal);
    const [a, b, c] = cast as [Contestant, Contestant, Contestant];
    alone(w, a, b, c);
    Object.assign(a, { room: 'cafe', strength: 9, lifetime: 0, meter: 20 });
    Object.assign(b, { room: 'cafe', strength: 2, asleep: false });
    Object.assign(c, { room: 'cafe', asleep: false });
    w.show.today = {};
    attack(ctx, a, b);
    expect(w.contestants.includes(b)).toBe(false);
    const death = ctx.events.find((x) => x.type === 'death')!;
    expect(death.data).toMatchObject({ cause: 'murder', killer: a.id });
    const murder = ctx.events.find((x) => x.type === 'murder')!;
    expect(murder.data!.awards).toEqual({ [a.id]: 40 });
    expect(a.secret).toBe(100);
    expect(rel(c, a)!.fear).toBeGreaterThanOrEqual(30);
    expect(c.thoughts.some((x) => x.id === 'saw_murder' && x.about === a.id)).toBe(true);
    expect(ctx.events.find((x) => x.type === 'fight')!.data!.killed).toBe(true);
    // Everything else paid lifetime points too; the murder only paid the meter.
    const paid = ctx.events.filter((x) => x.type !== 'murder').reduce((t, x) => t + ((x.data?.awards as Record<string, number> | undefined)?.[a.id] ?? 0), 0);
    expect(a.lifetime).toBeCloseTo(paid);
    const before = a.lifetime;
    // When the killer dies, the secret comes out.
    a.meter = 0;
    a.immunities = 0;
    spacings(ctx);
    const revealed = ctx.events.find((x) => x.type === 'secret_revealed')!;
    expect(revealed.actors[0]).toBe(a.id);
    expect(revealed.data!.lifetime).toBeCloseTo(before + 100);
  });

  it('with no base chance, never kills without a strength advantage', () => {
    const lethal = structuredClone(data);
    lethal.breaks.passion.firstBlow = 100;
    lethal.breaks.passion.base = 0;
    const { w, ctx, cast } = aboard(31, lethal);
    const [a, b] = cast as [Contestant, Contestant];
    alone(w, a, b);
    Object.assign(a, { room: 'cafe', strength: 4 });
    Object.assign(b, { room: 'cafe', strength: 6, asleep: false });
    meet(ctx, a, b);
    attack(ctx, a, b);
    expect(w.contestants.includes(b)).toBe(true);
    expect(b.health).toBeGreaterThanOrEqual(10);
  });

  it('can kill on the base chance alone, even when weaker', () => {
    const lethal = structuredClone(data);
    lethal.breaks.passion.firstBlow = 100;
    lethal.breaks.passion.base = 1;
    const { w, ctx, cast } = aboard(31, lethal);
    const [a, b] = cast as [Contestant, Contestant];
    alone(w, a, b);
    Object.assign(a, { room: 'cafe', strength: 4 });
    Object.assign(b, { room: 'cafe', strength: 6, asleep: false });
    meet(ctx, a, b);
    attack(ctx, a, b);
    expect(w.contestants.includes(b)).toBe(false);
  });

  it("can't break again until they've had a rest", () => {
    const { w, ctx, cast } = aboard();
    const [a, b] = cast as [Contestant, Contestant];
    alone(w, a, b);
    Object.assign(a, { room: 'cafe', personality: flat(5) });
    startBreak(ctx, a, 'minor', 'fear', 'panic', null);
    step(w, 31);
    expect(a.breakdown).toBeNull();
    expect(a.spentUntil).toBe(w.t - 1 + data.breaks.spent * 60);
  });
});
