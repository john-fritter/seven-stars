import { loadGameData } from '../src/data/load.js';
import type { Ctx } from '../src/core/context.js';
import { station } from '../src/core/station.js';
import type { Contestant, World } from '../src/core/types.js';
import { createWorld, step } from '../src/core/index.js';
import type { GameData } from '../src/data/schema.js';

export const data = loadGameData('./data');

export function ctxFor(w: World): Ctx {
  return { data, st: station(data), w, events: [] };
}

/** A world with the first cast aboard (08:00 on day 1), and a context for calling systems directly. */
export function aboard(seed = 21, d: GameData = data) {
  const w = createWorld(d, seed);
  step(w, 8 * 60);
  const ctx: Ctx = { data: d, st: station(d), w, events: [] };
  return { w, ctx, cast: w.contestants };
}

/**
 * Puts everyone but `keep` to sleep in the garden, so they don't count as witnesses, and out of
 * whatever bed or seat they held.
 */
export function alone(w: World, ...keep: Contestant[]) {
  const away = new Set(w.contestants.filter((c) => !keep.includes(c)).map((c) => c.id));
  for (const c of w.contestants) {
    if (!away.has(c.id)) continue;
    c.room = 'garden';
    c.asleep = true;
    c.activity = null;
  }
  for (const [id, users] of Object.entries(w.objects)) w.objects[id] = users.filter((u) => !away.has(u));
}
