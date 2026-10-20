// The world is plain serializable data. Static definitions live in GameData, never in here.
import type { Axis, Need } from '../data/schema.js';
import type { Rng } from './rng.js';

export type { Axis, Need };

export type Personality = Record<Axis, number>;
export type Needs = Record<Need, number>;

/** What a contestant is doing. They walk to `room`, then do the action until `endAt`. */
export interface Activity {
  action: string; // action id, or a scheduled one: "meal", "ceremony", "idle"
  object: string | null; // object instance id, if any
  room: string;
  phase: 'walk' | 'do';
  startedAt: number; // when they set off
  arriveAt: number;
  minutes: number | null; // how long once there; null: a fixed endAt or its own end condition (sleep)
  endAt: number | null; // set on arrival; null: runs until its own end condition
  meal?: string; // meal id for meal activities
  food?: string; // what they were served
}

export interface Contestant {
  id: string;
  name: string;
  pronouns: string;
  species: string;
  strength: number;
  stamina: number;
  beauty: number;
  personality: Personality;
  ideal: Personality;
  gender: number; // 0 feminine .. 10 masculine
  drawnToFeminine: number;
  drawnToMasculine: number;
  monogamy: number;
  favoriteRecreation: string[];
  drinking: number;
  modesty: number;
  quirk: string;

  arrivedAt: number;
  rank: number | null; // null until their first ceremony
  bed: string | null; // object instance id
  needs: Needs;
  mood: number;
  health: number;
  meter: number;
  lifetime: number;
  room: string;
  asleep: boolean;
  activity: Activity | null;
  eaten: Record<string, number>; // meal group -> day last eaten

  ledger: Record<string, Relation>; // contestant id -> how this contestant feels about them
  thoughts: Thought[];
  guest: Guest | null; // let into someone else's bedroom
  knocked: Record<string, number>; // host id -> when this contestant last knocked on them
  confined: Confinement | null; // serving a fishbowl sentence
  immunities: number; // secret immunities: each cancels one spacing
}

export interface Confinement {
  room: string;
  since: number;
  until: number;
}

/** An infraction waiting for the ceremony. */
export interface Infraction {
  who: string;
  rule: string;
  t: number;
  room: string;
  scored: number; // what the act itself scored for them, for the rule-of-cool waiver
}

/** The show's bookkeeping: the judge's boredom, repeat pairs, and infractions awaiting sentence. */
export interface ShowState {
  day: number; // the day `today` counts
  today: Record<string, number>; // event type -> times scored today, station-wide
  pairs: Record<string, number[]>; // "type|a|b" -> when that pair last scored it, within the repeat window
  pending: Infraction[];
}

/** One reason in the ledger. Repeats of the same reason merge into the latest entry. */
export interface Reason {
  t: number;
  why: string;
  dim: string;
  amount: number;
  times: number;
}

/** How one contestant feels about another. Not shared: each side has its own. */
export interface Relation {
  affection: number; // −100..100
  trust: number; // 0..100
  fear: number; // 0..100, fear or resentment
  attraction: number; // 0..10
  knows: number; // 0..1: how well they know the other's real personality
  chemistry: number; // hidden per-pair roll, the same on both sides
  met: number;
  reasons: Reason[];
}

export interface Thought {
  id: string;
  about: string | null;
  value: number; // personality and species already applied
  until: number;
}

export interface Guest {
  room: string;
  host: string;
  since: number;
}

export interface RoomState {
  temp: number;
  setting: number;
}

export interface World {
  version: 1;
  seed: number;
  t: number; // station minute about to be simulated; day 1 starts at t = 0
  rng: Rng;
  nextId: number;
  contestants: Contestant[];
  rooms: Record<string, RoomState>;
  objects: Record<string, string[]>; // object instance id -> contestants using or walking to it
  show: ShowState;
}

/** Everything meaningful that happens. If it isn't in the log, it didn't happen. */
export interface SimEvent {
  t: number;
  type: string;
  actors: string[];
  room?: string;
  data?: Record<string, unknown>;
  points?: number;
}
