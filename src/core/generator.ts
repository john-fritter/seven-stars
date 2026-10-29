import { traitFx } from './traits.js';
// Rolling contestants and casting them. DESIGN.md Part two, Contestants, species and the generator.
import { AXES, NEEDS, type GameData } from '../data/schema.js';
import { between, chance, normal, pick, shuffle, weightedIndex, type Rng } from './rng.js';
import { rollTraits } from './traits.js';
import type { Contestant, Needs, Personality } from './types.js';

const clamp10 = (x: number) => Math.round(Math.min(10, Math.max(0, x)) * 10) / 10;

function rollPersonality(data: GameData, rng: Rng): Personality {
  const { mean, sd } = data.generator.stat;
  const p = {} as Personality;
  for (const a of AXES) p[a] = clamp10(normal(rng, mean, sd));
  return p;
}

export function rollContestant(data: GameData, rng: Rng, id: string, t: number, takenNames: Set<string>): Contestant {
  const g = data.generator;
  const speciesIds = Object.keys(data.species.species);
  const species = speciesIds[weightedIndex(rng, speciesIds.map((s) => data.species.species[s]!.weight))]!;
  const sp = data.species.species[species]!;
  const stat = (name: string) => clamp10(normal(rng, g.stat.mean + (sp.statMean[name] ?? 0), g.stat.sd) + (sp.statShift[name] ?? 0));

  const free = g.names.filter((n) => !takenNames.has(n));
  const name = pick(rng, free.length ? free : g.names);

  const band = g.gender[weightedIndex(rng, g.gender.map((b) => b.weight))]!;
  const gender = clamp10(normal(rng, band.mean, band.sd));
  const [she, he, they] = g.pronouns.options as [string, string, string];
  let pronouns = gender < g.pronouns.sheBelow ? she : gender > g.pronouns.heAbove ? he : they;
  if (chance(rng, g.pronouns.randomChance)) pronouns = pick(rng, g.pronouns.options);

  const needs = {} as Needs;
  for (const n of NEEDS) {
    const [lo, hi] = data.needs.needs[n].start;
    needs[n] = Math.round(between(rng, lo, hi));
  }

  const c: Contestant = {
    id,
    name,
    pronouns,
    species,
    strength: stat('strength'),
    stamina: stat('stamina'),
    beauty: stat('beauty'),
    personality: rollPersonality(data, rng),
    ideal: rollPersonality(data, rng),
    gender,
    drawnToFeminine: clamp10(normal(rng, g.attraction.mean, g.attraction.sd)),
    drawnToMasculine: clamp10(normal(rng, g.attraction.mean, g.attraction.sd)),
    monogamy: stat('monogamy'),
    favoriteRecreation: shuffle(rng, [...g.recreation]).slice(0, g.favoriteRecreations).sort(),
    drinking: stat('drinking'),
    modesty: stat('modesty'),
    traits: [],

    arrivedAt: t,
    rank: null,
    bed: null,
    needs,
    company: 50,
    companyPoint: 50,
    mood: data.personality.mood.base,
    health: 100,
    meter: data.meter.start,
    lifetime: 0,
    room: data.schedule.arrivalRoom,
    asleep: false,
    activity: null,
    eaten: {},
    ledger: {},
    thoughts: [],
    guest: null,
    knocked: {},
    confined: null,
    immunities: 0,
    secret: 0,
    intox: 0,
    drinks: 0,
    tolerance: {},
    hammeredSince: null,
    inventory: [],
    snacks: 0,
    breakdown: null,
    seen: [],
  };
  c.traits = rollTraits(data, rng, c);
  // How much company feels right: from outgoing, moved by traits (Loner).
  const cp = data.social.company;
  c.companyPoint = Math.min(95, Math.max(5, cp.point[0] + ((cp.point[1] - cp.point[0]) * c.personality.outgoing) / 10 + traitFx(data, c).companyPoint));
  c.company = c.companyPoint;
  c.needs.social = 100;
  // Prude and Exhibitionist: modesty acts as theirs, whatever they rolled.
  for (const id of c.traits) {
    const m = data.traits.traits[id]!.modesty;
    if (m !== undefined) c.modesty = m;
  }
  return c;
}

function distance(a: Personality, b: Personality): number {
  let d = 0;
  for (const k of AXES) d += (a[k] - b[k]) ** 2;
  return d;
}

/**
 * Casting for one empty slot: roll several candidates and keep the one whose personality is
 * furthest from the current cast's average, which favors friction and variety. Names already
 * used this season (`used`) aren't reused until the list runs out.
 */
export function cast(data: GameData, rng: Rng, cast: Contestant[], id: string, t: number, used: readonly string[] = []): Contestant {
  let taken = new Set([...used, ...cast.map((c) => c.name)]);
  if (data.generator.names.every((n) => taken.has(n))) taken = new Set(cast.map((c) => c.name));
  const candidates = Array.from({ length: data.generator.candidatesPerSlot }, () => rollContestant(data, rng, id, t, taken));
  if (cast.length === 0) return candidates[0]!;
  const avg = {} as Personality;
  for (const k of AXES) avg[k] = cast.reduce((s, c) => s + c.personality[k], 0) / cast.length;
  let best = candidates[0]!;
  for (const c of candidates) if (distance(c.personality, avg) > distance(best.personality, avg)) best = c;
  return best;
}
