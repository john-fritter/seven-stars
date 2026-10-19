// Per-contestant values that only depend on the data and the contestant's fixed sheet, cached
// outside the world so the hot loop doesn't recompute them every minute. Never serialized.
import { NEEDS, type ActionDef, type GameData, type Need } from '../data/schema.js';
import { axisFactor } from './needs.js';
import type { Contestant } from './types.js';

export interface Derived {
  data: GameData;
  awake: number[]; // drain per minute by NEEDS index
  asleep: number[];
  comfortLo: number;
  comfortHi: number;
  gains: Map<ActionDef, [Need, number][]>; // species overrides and recreation taste applied
  personality: Map<ActionDef, number>;
}

// NEEDS order is fixed (hunger, rest, hygiene, bladder, social, fun, comfort); drainNeeds relies on it.
const cache = new WeakMap<Contestant, Derived>();

export function derived(data: GameData, c: Contestant): Derived {
  let d = cache.get(c);
  if (!d || d.data !== data) {
    const sp = data.species.species[c.species]!;
    const awake = NEEDS.map((n) => {
      const axis = data.personality.needDrain[n];
      const p = axis ? axisFactor(data.personality.k, c.personality[axis]) : 1;
      return n === 'comfort' ? 0 : (data.needs.needs[n].drainPerHour * (sp.drain[n] ?? 1) * p) / 60;
    });
    d = {
      data,
      awake,
      asleep: awake.map((r, i) => r * data.needs.asleepDrain[NEEDS[i]!]),
      comfortLo: sp.comfort[0],
      comfortHi: sp.comfort[1],
      gains: new Map(),
      personality: new Map(),
    };
    cache.set(c, d);
  }
  return d;
}

/** What an action refills for this contestant, in total. */
export function gainsOf(data: GameData, c: Contestant, def: ActionDef): [Need, number][] {
  const d = derived(data, c);
  let g = d.gains.get(def);
  if (!g) {
    const taste = data.actions.recreationTaste;
    const fun = def.recreation ? (c.favoriteRecreation.includes(def.recreation) ? taste.favorite : taste.other) : 1;
    g = (Object.entries(def.speciesGains[c.species] ?? def.gains) as [Need, number][]).map(([n, x]) => [n, n === 'fun' ? x * fun : x]);
    d.gains.set(def, g);
  }
  return g;
}

/** The personality grid's multiplier for an action's tags. */
export function personalityOf(data: GameData, c: Contestant, def: ActionDef): number {
  const d = derived(data, c);
  let m = d.personality.get(def);
  if (m === undefined) {
    const p = data.personality;
    m = 1;
    for (const tag of def.tags) for (const e of p.tags[tag] ?? []) m *= axisFactor(e.k ?? p.k, c.personality[e.axis]);
    d.personality.set(def, m);
  }
  return m;
}
