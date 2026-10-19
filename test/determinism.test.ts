import { describe, expect, it } from 'vitest';
import { createWorld, load, save, step } from '../src/core/index.js';
import { data } from './helpers.js';

describe('determinism', () => {
  it('replays the same events from the same seed', () => {
    const a = createWorld(data, 42);
    const b = createWorld(data, 42);
    expect(JSON.stringify(step(a, 3 * 1440))).toBe(JSON.stringify(step(b, 3 * 1440)));
    expect(save(a)).toBe(save(b));
  });

  it('differs between seeds', () => {
    const a = step(createWorld(data, 1), 1440);
    const b = step(createWorld(data, 2), 1440);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('round-trips save and load mid-run', () => {
    const original = createWorld(data, 7);
    step(original, 1440 + 777); // mid-afternoon on day 2, mid-activity for most
    const copy = load(data, save(original));
    expect(JSON.stringify(step(copy, 2 * 1440))).toBe(JSON.stringify(step(original, 2 * 1440)));
    expect(save(copy)).toBe(save(original));
  });

  it('gives the same events whether stepped in one go or minute by minute', () => {
    const a = createWorld(data, 3);
    const b = createWorld(data, 3);
    const big = step(a, 1440);
    const small = Array.from({ length: 1440 }, () => step(b, 1)).flat();
    expect(JSON.stringify(small)).toBe(JSON.stringify(big));
  });
});
