import { describe, expect, it } from 'vitest';
import { companyWant, drainNeeds, freshness, recover, wearThin } from '../src/core/needs.js';
import { think } from '../src/core/thoughts.js';
import type { Contestant } from '../src/core/types.js';
import { aboard, alone, data } from './helpers.js';

describe('fun and social', () => {
  it('recreation wears thin with repeats and recovers by the hour', () => {
    const { ctx, cast } = aboard();
    const c = cast[0]!;
    const t = data.needs.tolerance;
    c.tolerance = {};
    expect(freshness(ctx, c, 'gaze', 'fun')).toBe(1);
    for (let i = 0; i < 30; i++) wearThin(ctx, c, 'gaze', 30); // one 30-minute go
    expect(freshness(ctx, c, 'gaze', 'fun')).toBeCloseTo(1 - t.perUse);
    expect(freshness(ctx, c, 'dance', 'fun')).toBe(1); // only that action
    expect(freshness(ctx, c, 'gaze', 'hunger')).toBe(1); // only the listed needs
    for (let i = 0; i < 300; i++) wearThin(ctx, c, 'gaze', 30);
    expect(freshness(ctx, c, 'gaze', 'fun')).toBe(t.floor);
    for (let i = 0; i < 100; i++) recover(ctx, c);
    expect(c.tolerance.gaze).toBeUndefined();
  });

  it('bad moments knock the sliders down (social through company)', () => {
    const { ctx, cast } = aboard();
    const [a, b] = cast as [Contestant, Contestant];
    a.company = 80;
    think(ctx, a, 'rebuffed', b.id);
    expect(a.company).toBe(80 + data.thoughts.thoughts.rebuffed!.needs.social!);
  });

  it('company rises with people around and falls alone', () => {
    const { w, ctx, cast } = aboard();
    const [a, b] = cast as [Contestant, Contestant];
    alone(w, a, b);
    Object.assign(b, { room: a.room, asleep: false });
    a.company = 20;
    drainNeeds(ctx, a);
    expect(a.company).toBeGreaterThan(20);
    b.room = a.room === 'garden' ? 'lounge' : 'garden';
    a.company = 50;
    drainNeeds(ctx, a);
    expect(a.company).toBeLessThan(50);
  });

  it('social is how close company sits to their own point, both ways', () => {
    const { w, ctx, cast } = aboard();
    const [a, b] = cast as [Contestant, Contestant];
    alone(w, a, b);
    a.companyPoint = 30;
    a.company = 30;
    drainNeeds(ctx, a);
    const near = a.needs.social;
    a.company = 80;
    drainNeeds(ctx, a);
    const over = a.needs.social;
    a.company = 0;
    drainNeeds(ctx, a);
    expect(near).toBeGreaterThan(90);
    expect(over).toBeLessThan(10);
    expect(a.needs.social).toBeLessThan(near);
  });

  it('wants company when under their point, and quiet when over it', () => {
    const { ctx, cast } = aboard();
    const a = cast[0]!;
    a.companyPoint = 50;
    a.company = 10;
    expect(companyWant(ctx, a)).toBeGreaterThan(0);
    a.company = 90;
    expect(companyWant(ctx, a)).toBeLessThan(0);
  });
});
