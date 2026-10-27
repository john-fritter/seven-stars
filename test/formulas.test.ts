import { describe, expect, it } from 'vitest';
import { createWorld, step } from '../src/core/index.js';
import { axisFactor, urgency } from '../src/core/needs.js';
import { rankOrder } from '../src/core/schedule.js';
import { along, canHear, canSee, nextDoor, station, walkMinutes } from '../src/core/station.js';
import { discomfortAt } from '../src/core/temperature.js';
import { ctxFor, data } from './helpers.js';

describe('urgency', () => {
  it('is weight × ((100 − n) / 100)²', () => {
    expect(urgency(1.5, 100)).toBe(0);
    expect(urgency(1.5, 0)).toBe(1.5);
    expect(urgency(1.2, 50)).toBeCloseTo(0.3);
  });
});

describe('personality grid', () => {
  it('scales by 1 + k × (axis − 5) / 5', () => {
    expect(axisFactor(0.5, 5)).toBe(1);
    expect(axisFactor(0.5, 10)).toBe(1.5);
    expect(axisFactor(0.5, 0)).toBe(0.5);
    expect(axisFactor(-0.5, 10)).toBe(0.5);
  });
});

describe('walking', () => {
  it('takes the shortest path through the station', () => {
    const st = station(data);
    expect(walkMinutes(st, 'common', 'common')).toBe(0);
    expect(walkMinutes(st, 'lounge', 'spa')).toBe(1);
    expect(walkMinutes(st, 'rec', 'spa')).toBe(2); // across the common room and through the lounge
    expect(walkMinutes(st, 'dorm', 'suite')).toBe(2); // along the south Promenade
    expect(walkMinutes(st, 'fishbowl', 'cafe')).toBe(1); // a glass cell walks out through its room
  });

  it('walks through the spaces in between, never anywhere private', () => {
    const st = station(data);
    const route = (a: string, b: string) => {
      const p = st.paths[st.roomIndex.get(a)!]![st.roomIndex.get(b)!]!;
      return p.spaces.filter((s, i) => i === 0 || s !== p.spaces[i - 1]);
    };
    expect(route('rec', 'spa')).toEqual(['rec', 'ring_e', 'common', 'ring_n', 'lounge', 'spa']);
    expect(route('suite', 'dorm')).toEqual(['suite', 'ring_w', 'ring_s', 'dorm']);
    expect(along(st, 'suite', 'dorm', 0.5)!.space).toBe('ring_s');
    for (const p of st.paths.flat()) if (p) for (const s of p.spaces.slice(1, -1)) expect(['occupants', 'robots']).not.toContain(st.room.get(s)!.access);
  });

  it('sees through arches and glass, hears through arches, and knows its walls', () => {
    const st = station(data);
    expect(canSee(st, 'common', 'cafe')).toBe(true);
    expect(canHear(st, 'common', 'cafe')).toBe(true);
    expect(canSee(st, 'lounge', 'spa')).toBe(true);
    expect(canHear(st, 'lounge', 'spa')).toBe(false);
    expect(canSee(st, 'common', 'fishbowl')).toBe(true);
    expect(canSee(st, 'common', 'restroom')).toBe(false);
    expect(canSee(st, 'ring_n', 'ring_e')).toBe(false); // round the corner
    expect(nextDoor(st, 'dorm').sort()).toEqual(['good', 'rec']);
    expect(nextDoor(st, 'suite')).toEqual([]); // soundproofed
  });
});

describe('ceremony order', () => {
  it('ranks by meter, then lifetime points, then a seeded draw', () => {
    const w = createWorld(data, 5);
    step(w, 8 * 60); // the first cast has arrived
    const [a, b, c, d] = w.contestants;
    for (const x of w.contestants) Object.assign(x, { meter: 10, lifetime: 0 });
    Object.assign(a!, { meter: 50, lifetime: 0 });
    Object.assign(b!, { meter: 50, lifetime: 30 });
    Object.assign(c!, { meter: 90, lifetime: 0 });
    Object.assign(d!, { meter: 10, lifetime: 99 });
    const order = rankOrder(ctxFor(w), w.contestants).map((x) => x.id);
    expect(order.slice(0, 4)).toEqual([c!.id, b!.id, a!.id, d!.id]);
  });

  it('assigns everyone a rank and the matching bed at the ceremony', () => {
    const w = createWorld(data, 6);
    step(w, 22 * 60);
    const ranks = w.contestants.map((c) => c.rank).sort();
    expect(ranks).toEqual([1, 2, 3, 4, 5, 6, 7]);
    // The Wheel's suite night swaps two beds until the wake chime.
    for (const c of w.contestants) if (!w.show.bedSwap?.includes(c.id)) expect(c.bed).toBe(data.ranks.ranks[String(c.rank) as '1']!.bed);
  });
});

describe('temperature', () => {
  it('counts degrees felt outside the comfort range, clothing included', () => {
    const w = createWorld(data, 8);
    step(w, 8 * 60);
    const ctx = ctxFor(w);
    const c = w.contestants[0]!;
    Object.assign(c, { species: 'human', rank: 7 }); // 66–76, paper jumpsuit −1
    expect(discomfortAt(ctx, c, 70)).toBe(0);
    expect(discomfortAt(ctx, c, 61)).toBe(6); // feels 60
    expect(discomfortAt(ctx, c, 80)).toBe(3); // feels 79
  });
});
