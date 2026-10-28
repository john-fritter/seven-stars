import { describe, expect, it } from 'vitest';
import { drainNeeds, freshness, recover, wearThin } from '../src/core/needs.js';
import { companyPull } from '../src/core/social.js';
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

  it('bad moments knock the sliders down', () => {
    const { ctx, cast } = aboard();
    const [a, b] = cast as [Contestant, Contestant];
    a.needs.social = 80;
    think(ctx, a, 'rebuffed', b.id);
    expect(a.needs.social).toBe(80 + data.thoughts.thoughts.rebuffed!.needs.social!);
  });

  it('social drains faster alone', () => {
    const { w, ctx, cast } = aboard();
    const [a, b] = cast as [Contestant, Contestant];
    alone(w, a, b);
    Object.assign(b, { room: a.room, asleep: false });
    a.needs.social = 50;
    drainNeeds(ctx, a);
    const company = 50 - a.needs.social;
    b.room = a.room === 'garden' ? 'lounge' : 'garden';
    a.needs.social = 50;
    drainNeeds(ctx, a);
    expect(50 - a.needs.social).toBeCloseTo(company * (data.needs.situational.alone.social ?? 1));
  });

  it('pulls the lonely toward anyone awake', () => {
    const { w, ctx, cast } = aboard();
    const [a, b] = cast as [Contestant, Contestant];
    alone(w, a, b);
    Object.assign(b, { room: 'garden', asleep: false, activity: null });
    a.ledger = {};
    a.needs.social = 100;
    expect(companyPull(ctx, a, 'garden')).toBe(0);
    a.needs.social = 10;
    expect(companyPull(ctx, a, 'garden')).toBeGreaterThan(0);
  });
});
