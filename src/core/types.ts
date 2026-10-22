// The world is plain serializable data. Static definitions live in GameData, never in here.
import type { Axis, Label, Level, Need } from '../data/schema.js';
import type { Rng } from './rng.js';

export type { Axis, Label, Level, Need };

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
  booze?: string; // what they're drinking
  partner?: string; // who they're having lovin' with (on a sleep: who they just had it with)
  length?: number; // how long the lovin' lasts once both are there
  bedmate?: string; // who slept beside them
  kept?: string; // who kept them up (a snorer, a hummer)
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
  traits: string[]; // named traits (traits.yaml), in roll order

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
  secret: number; // hidden lifetime points (murder), revealed when they die

  intox: number; // 0.. intoxication
  drinks: number; // hangover weight of what they've drunk since the last wake chime
  hammeredSince: number | null;
  inventory: string[]; // carried drinks, by quality
  breakdown: Breakdown | null; // in the middle of a mental break
}

/** A mental break in progress. Its activity is the break kind; it ends with catharsis. */
export interface Breakdown {
  kind: string;
  level: Level;
  source: string;
  target: string | null;
  since: number;
  follows: number; // times they've chased a target who moved on
  next: number; // when the next insult or drink is due
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

/** A match booked for a daily event: by the Wheel for tomorrow, or set up when the slot opens. */
export interface Booking {
  format: string;
  actors: string[]; // the Wheel's spinner first; empty: picked from whoever turns up
  sudden: boolean; // the loser drops to zero
  prize: boolean; // a winning challenger takes the loser's rank and room until the next ceremony
}

/** Today's daily event, from when the slot opens until the next one. */
export interface DailyEvent extends Booking {
  day: number;
  room: string;
}

/** A murder nobody saw: the victim lies where they fell until someone finds them. */
export interface Body {
  id: string;
  name: string;
  room: string;
  t: number;
  killer: string;
  witnesses: string[];
  near: string[]; // seen in the room shortly before
  feelings: Record<string, { affection: number; enemy: boolean }>; // everyone else, at the time of death
}

/** An accusation waiting for the morning trial. */
export interface Trial {
  day: number;
  victim: string;
  name: string;
  killer: string;
  accuser: string;
  accused: string;
  witnesses: string[];
}

/** The show's bookkeeping: the judge's boredom, repeat pairs, infractions awaiting sentence, and the
 * Wheel's, the daily event's and the trials' state. */
export interface ShowState {
  day: number; // the day `today` counts
  today: Record<string, number>; // event type -> times scored today, station-wide
  mine: Record<string, Record<string, number>>; // contestant -> event type -> times they scored it today as an actor
  pairs: Record<string, number[]>; // "type|a|b" -> when that pair last scored it, within the repeat window
  pending: Infraction[];
  effects: Record<string, number>; // station effect -> the day it's on
  booked: Booking | null; // the Wheel's match for tomorrow's event
  event: DailyEvent | null;
  lastFormat: string | null;
  button: { day: number; pressers: string[] } | null; // revealed at dinner
  bedSwap: string[] | null; // the Wheel's suite night, swapped back at the wake chime
  bodies: Body[];
  trials: Trial[];
  trialOn: number | null; // the day trials were last called, so the gathering runs its course
  seen: Record<string, Record<string, number>>; // room -> contestant -> when they last left it
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
  label: Label; // what this contestant believes the relationship is
  flirts: number; // flirts that landed between them, either way
  kisses: number; // kisses that landed between them, either way
  lovin: number; // times they've had lovin'
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
