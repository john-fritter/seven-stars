import { describe, expect, it } from 'vitest';
import { canEnter } from '../src/core/context.js';
import { createWorld, step } from '../src/core/index.js';
import { ctxFor, data } from './helpers.js';

describe('invariants, checked every minute', () => {
  for (const seed of [1, 2, 3]) {
    it(`hold for seed ${seed} over five days`, () => {
      const w = createWorld(data, seed);
      const ctx = ctxFor(w);
      const [lo, hi] = data.temperature.clamp;
      for (let t = 0; t < 5 * 1440; t++) {
        step(w, 1);
        expect(w.contestants.length).toBeLessThanOrEqual(7);
        for (const c of w.contestants) {
          for (const [need, v] of Object.entries(c.needs)) {
            if (!(v >= 0 && v <= 100)) throw new Error(`${c.name} ${need} = ${v} at t=${w.t}`);
          }
          // Nobody is in a room above their rank. (Invitations and infractions don't exist yet.)
          if (!canEnter(ctx, c, c.room)) throw new Error(`${c.name} (rank ${c.rank}) is in ${c.room} at t=${w.t}`);
          if (c.asleep && c.activity === null) throw new Error(`${c.name} is asleep doing nothing at t=${w.t}`);
        }
        for (const [id, users] of Object.entries(w.objects)) {
          const cap = ctx.st.object.get(id)!.capacity;
          if (users.length > cap) throw new Error(`${id} has ${users.length} users, capacity ${cap}`);
          for (const u of users) expect(w.contestants.find((c) => c.id === u)?.activity?.object).toBe(id);
        }
        for (const r of Object.values(w.rooms)) {
          expect(r.temp).toBeGreaterThanOrEqual(lo);
          expect(r.temp).toBeLessThanOrEqual(hi);
        }
      }
    });
  }
});
