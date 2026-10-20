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
          // Nobody is in a room above their rank unless they were let in. (Infractions don't exist yet.)
          if (!canEnter(ctx, c, c.room)) throw new Error(`${c.name} (rank ${c.rank}) is in ${c.room} at t=${w.t}`);
          if (!(c.health >= 0 && c.health <= 100)) throw new Error(`${c.name} health = ${c.health} at t=${w.t}`);
          if (!(c.mood >= 0 && c.mood <= 100)) throw new Error(`${c.name} mood = ${c.mood} at t=${w.t}`);
          for (const [id, r] of Object.entries(c.ledger)) {
            const ok = r.affection >= -100 && r.affection <= 100 && r.trust >= 0 && r.trust <= 100 && r.fear >= 0 && r.fear <= 100 && r.attraction >= 0 && r.attraction <= 10;
            if (!ok || id === c.id) throw new Error(`${c.name}'s ledger on ${id} is out of range at t=${w.t}: ${JSON.stringify(r)}`);
          }
          if (c.guest && c.guest.host === c.id) throw new Error(`${c.name} is their own guest`);
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
