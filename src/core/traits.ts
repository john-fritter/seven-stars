// Named traits (D-108): one to three per contestant, each a row of effects on systems that already
// exist. DESIGN.md Part two, Personality, traits and mood: the next pass. This file rolls them and
// merges a contestant's rows into one set of effects; the systems read that.
import type { GameData, Need, TraitDef } from '../data/schema.js';
import { axisFactor } from './needs.js';
import { weightedIndex, type Rng } from './rng.js';
import type { Contestant } from './types.js';

/** A contestant's traits merged: multipliers multiplied, offsets added, the rest collected. */
export interface TraitFx {
  tags: Record<string, number>;
  interactions: Record<string, number>;
  nearby: Record<string, number>;
  thoughts: Record<string, number>;
  sources: Record<string, number>;
  drain: Partial<Record<Need, number>>;
  scores: Record<string, number>;
  arrival: string[]; // thoughts carried from arrival
  breakLine: number;
  fight: number;
  fightOn: string[];
  charm: number;
  aura: number;
  dislikeFade: number;
  partnerPull: number;
  crowd: { at: number; thought: string } | undefined;
  watched: { events: string[]; thought: string }[];
  attraction: number;
  datingAfter: number | undefined;
  attached: number;
  confront: number | undefined;
  exposedThought: string | undefined;
  drink: number;
  drinkCompany: number;
  hangover: number;
  intox: number;
  carry: number;
  dislikesDrunk: number;
  dislikesFilthy: number;
  noise: 'asleep' | 'awake' | undefined;
  nightShift: number;
  sleepwalk: { perHour: number; minutes: number } | undefined;
  peacemaker: number;
}

function mergeMult(into: Record<string, number>, from: Record<string, number | undefined>): void {
  for (const [k, v] of Object.entries(from)) if (v !== undefined) into[k] = (into[k] ?? 1) * v;
}

export function mergeTraits(defs: TraitDef[]): TraitFx {
  const fx: TraitFx = {
    tags: {},
    interactions: {},
    nearby: {},
    thoughts: {},
    sources: {},
    drain: {},
    scores: {},
    arrival: [],
    breakLine: 0,
    fight: 1,
    fightOn: [],
    charm: 1,
    aura: 0,
    dislikeFade: 1,
    partnerPull: 1,
    crowd: undefined,
    watched: [],
    attraction: 1,
    datingAfter: undefined,
    attached: 1,
    confront: undefined,
    exposedThought: undefined,
    drink: 1,
    drinkCompany: 1,
    hangover: 1,
    intox: 1,
    carry: 1,
    dislikesDrunk: 0,
    dislikesFilthy: 0,
    noise: undefined,
    nightShift: 0,
    sleepwalk: undefined,
    peacemaker: 0,
  };
  for (const t of defs) {
    mergeMult(fx.tags, t.tags);
    mergeMult(fx.interactions, t.interactions);
    mergeMult(fx.nearby, t.nearby);
    mergeMult(fx.thoughts, t.thoughts);
    mergeMult(fx.sources, t.sources);
    mergeMult(fx.drain, t.drain);
    mergeMult(fx.scores, t.scores);
    if (t.thought) fx.arrival.push(t.thought);
    fx.breakLine += t.breakLine;
    fx.fight *= t.fight;
    fx.fightOn.push(...t.fightOn);
    fx.charm *= t.charm;
    fx.aura += t.aura;
    fx.dislikeFade *= t.dislikeFade;
    fx.partnerPull *= t.partnerPull;
    fx.crowd ??= t.crowd;
    if (t.watched) fx.watched.push(t.watched);
    fx.attraction *= t.attraction;
    if (t.datingAfter !== undefined) fx.datingAfter = Math.min(fx.datingAfter ?? Infinity, t.datingAfter);
    fx.attached *= t.attached;
    if (t.confront !== undefined) fx.confront = Math.max(fx.confront ?? 0, t.confront);
    fx.exposedThought ??= t.exposedThought;
    fx.drink *= t.drink;
    fx.drinkCompany *= t.drinkCompany;
    fx.hangover *= t.hangover;
    fx.intox *= t.intox;
    fx.carry *= t.carry;
    fx.dislikesDrunk += t.dislikes.drunk ?? 0;
    fx.dislikesFilthy += t.dislikes.filthy ?? 0;
    fx.noise ??= t.noise;
    fx.nightShift += t.nightShift;
    fx.sleepwalk ??= t.sleepwalk;
    fx.peacemaker = Math.max(fx.peacemaker, t.peacemaker);
  }
  return fx;
}

// Cached outside the world, like derived.ts, and rebuilt if the data or the traits array changes.
const cache = new WeakMap<Contestant, { data: GameData; traits: string[]; fx: TraitFx }>();

/** A contestant's merged trait effects. */
export function traitFx(data: GameData, c: Contestant): TraitFx {
  const hit = cache.get(c);
  if (hit && hit.data === data && hit.traits === c.traits) return hit.fx;
  const fx = mergeTraits(c.traits.map((id) => data.traits.traits[id]!).filter(Boolean));
  cache.set(c, { data, traits: c.traits, fx });
  return fx;
}

type Sheet = Pick<Contestant, 'personality' | 'modesty' | 'drinking' | 'monogamy'>;

/** A trait's weight in the roll for this sheet: its weight, tilted by whatever it leans on. */
export function traitWeight(data: GameData, def: TraitDef, c: Sheet): number {
  if (!def.lean) return def.weight;
  const by = def.lean.by;
  const v = by === 'modesty' || by === 'drinking' || by === 'monogamy' ? c[by] : c.personality[by];
  return def.weight * Math.max(0, axisFactor(def.lean.k ?? data.traits.leanK, v));
}

/** Whether two traits can't go together (either one says so). */
export function excludes(data: GameData, a: string, b: string): boolean {
  const t = data.traits.traits;
  return a === b || !!t[a]?.excludes.includes(b) || !!t[b]?.excludes.includes(a);
}

/** Rolls one to three traits, none of them opposites. Returned in roll order. */
export function rollTraits(data: GameData, rng: Rng, c: Sheet): string[] {
  const tr = data.traits;
  const n = weightedIndex(rng, tr.count) + 1;
  const ids = Object.keys(tr.traits);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const weights = ids.map((id) => (out.some((x) => excludes(data, x, id)) ? 0 : traitWeight(data, tr.traits[id]!, c)));
    if (!weights.some((w) => w > 0)) break;
    out.push(ids[weightedIndex(rng, weights)]!);
  }
  return out;
}

export function hasTrait(c: Contestant, id: string): boolean {
  return c.traits.includes(id);
}
