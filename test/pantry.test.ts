import { describe, expect, it } from 'vitest';
import { begin, endActivity, runActivity } from '../src/core/actions.js';
import { attractionNow } from '../src/core/booze.js';
import { breakLines } from '../src/core/breaks.js';
import { drainNeeds } from '../src/core/needs.js';
import { openSpread, restock, serve, shareSnack, snackThere, swipeSnack, takeSnack } from '../src/core/pantry.js';
import { fightChance } from '../src/core/social.js';
import type { Activity, Contestant } from '../src/core/types.js';
import { aboard, alone, data } from './helpers.js';

const meal = (food: string): Activity => ({ action: 'meal', object: null, room: 'cafe', phase: 'do', startedAt: 0, arriveAt: 0, minutes: 30, endAt: null, meal: 'breakfast', food });

describe('the spread', () => {
  it('puts out a portion per head, and rank 7 gets only what nobody ahead needs', () => {
    const { ctx, cast } = aboard();
    for (const c of cast) Object.assign(c, { asleep: false, confined: null, eaten: {} });
    cast.forEach((c, i) => (c.rank = i + 1));
    openSpread(ctx, 'breakfast');
    const s = data.ranks.spread!;
    expect(ctx.w.show.spread.breakfast).toBeCloseTo(s.perEater * cast.length);
    // Rank 7 sits down first: they wait for the six who haven't eaten.
    const last = cast[6]!;
    const a = meal('leftovers');
    expect(serve(ctx, last, a, 'breakfast')).toBeCloseTo(Math.min(1, s.perEater * cast.length - 6));
    // A top rank always gets a full plate while there's one to give.
    expect(serve(ctx, cast[0]!, meal('gourmet'), 'breakfast')).toBe(1);
  });

  it('fills the same whatever the food: quality is a mood, not a portion', () => {
    const foods = Object.values(data.ranks.food).map((f) => f.hunger);
    expect(new Set(foods).size).toBe(1);
  });
});

describe('the snack machine', () => {
  it('runs out, and whoever finds it empty stops trying until the refill', () => {
    const { ctx, cast } = aboard();
    const c = cast[0]!;
    restock(ctx);
    expect(ctx.w.show.snacks).toBe(data.ranks.snacks!.stock);
    ctx.w.show.snacks = 0;
    expect(snackThere(ctx, c, 'machine')).toBe(true); // they don't know yet
    expect(takeSnack(ctx, c, 'machine', 'rec')).toBe(false);
    expect(snackThere(ctx, c, 'machine')).toBe(false);
    ctx.w.t++;
    restock(ctx);
    expect(snackThere(ctx, c, 'machine')).toBe(true);
  });

  it('stashed snacks can be shared or swiped', () => {
    const { ctx, cast } = aboard();
    const [a, b] = cast as [Contestant, Contestant];
    a.snacks = 1;
    b.needs.hunger = 30;
    shareSnack(ctx, a, b);
    expect(a.snacks).toBe(0);
    expect(b.needs.hunger).toBe(30 + data.ranks.snacks!.hunger);
    b.snacks = 1;
    a.needs.hunger = 30;
    swipeSnack(ctx, a, b);
    expect(b.snacks).toBe(0);
    expect(a.needs.hunger).toBe(30 + data.ranks.snacks!.hunger);
    expect(ctx.w.show.pending.some((x) => x.who === a.id)).toBe(false); // the show doesn't fine it
  });
});

describe('exertion', () => {
  it('a fight leaves them tired, hungry and sweaty', () => {
    const { w, ctx, cast } = aboard();
    const c = cast[0]!;
    alone(w, c);
    endActivity(ctx, c, 'interrupted');
    Object.assign(c.needs, { rest: 80, hunger: 80, hygiene: 80 });
    begin(ctx, c, { action: 'fight', object: null, room: c.room, minutes: 3 });
    for (let i = 0; i < 4; i++) {
      runActivity(ctx, c);
      w.t++;
    }
    runActivity(ctx, c);
    const cost = data.needs.exertion.fight!.cost;
    expect(c.needs.rest).toBeCloseTo(80 + cost.rest!);
    expect(c.needs.hygiene).toBeCloseTo(80 + cost.hygiene!);
  });

  it('dancing drains faster than standing about', () => {
    const { w, ctx, cast } = aboard();
    const c = cast[0]!;
    alone(w, c);
    c.activity = null;
    c.asleep = false;
    c.needs.hygiene = 50;
    drainNeeds(ctx, c);
    const still = 50 - c.needs.hygiene;
    c.activity = { action: 'dance', object: null, room: c.room, phase: 'do', startedAt: w.t, arriveAt: w.t, minutes: 30, endAt: w.t + 30 };
    c.needs.hygiene = 50;
    drainNeeds(ctx, c);
    expect(50 - c.needs.hygiene).toBeCloseTo(still + data.needs.exertion.dance!.perHour.hygiene! / 60);
  });
});

describe('tired and grubby', () => {
  it('short of sleep, short of temper', () => {
    const { ctx, cast } = aboard();
    const [a, b] = cast as [Contestant, Contestant];
    const f = data.needs.fuse!;
    a.needs.rest = 90;
    const rested = fightChance(ctx, a, b);
    a.needs.rest = f.restBelow - 1;
    expect(fightChance(ctx, a, b)).toBeCloseTo(Math.min(1, rested * f.fight));
    expect(breakLines(ctx, 5, f.breakLines).minor).toBe(breakLines(ctx, 5).minor + f.breakLines);
  });

  it('the grubby are less attractive', () => {
    const { ctx, cast } = aboard();
    const [a, b] = cast as [Contestant, Contestant];
    const g = data.needs.grubby!;
    a.intox = 0;
    b.needs.hygiene = 90;
    expect(attractionNow(ctx, a, 6, b)).toBe(6);
    b.needs.hygiene = g.below - 1;
    expect(attractionNow(ctx, a, 6, b)).toBe(6 - g.attraction);
  });
});

