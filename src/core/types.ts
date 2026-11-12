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
  from?: string; // where they set off from (the walk goes through the spaces in between)
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
  bite?: number; // a meal: hunger a minute from the portion they got
  seconds?: boolean; // a meal: they've gone back for more
  portion?: number; // a meal: how much of a portion they were served (0..1)
  summoned?: string; // a confessional the operator called them to: the moment it was about
  about?: string; // ...and the other one in it
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
  company: number; // how much company they've had lately (social.yaml company); needs.social is how close it is to companyPoint
  companyPoint: number; // the company level that feels right to them
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
  tolerance: Record<string, number>; // action id -> how worn out on it they are, 0..1 (needs.yaml tolerance)
  trained: Partial<Record<'fight' | 'dance', number>>; // skills sharpened by training, 0..1, fading (activities.yaml training)
  primped: number; // looking their best until this time (activities.yaml ready); 0: not
  hammeredSince: number | null;
  inventory: string[]; // carried drinks, by quality
  snacks: number; // snacks stashed from the machine (ranks.yaml snacks)
  foundEmpty?: number; // when they last found the snack machine empty
  breakdown: Breakdown | null; // in the middle of a mental break
  news: News[]; // what they know (news.ts): who's been with whom, who's known for what
  told: Record<string, number>; // what they've told the diary-room camera (confessionals.ts) -> when
  deathsSeen: number; // deaths aboard since they arrived (thoughts.yaml numb: you get used to it)
}

/**
 * Something they know (news.yaml): `who` and `with` got together, the worst of it being `what`
 * (a kiss, lovin'), or, with `with` null, `who` is known for `what` (a card cheat). `t` is when it
 * last happened, not when they heard.
 */
export interface News {
  who: string;
  with: string | null;
  what: string;
  t: number;
  felt?: boolean; // they've reacted to it (jealousy, betrayal): more of the same only stokes it
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

/**
 * A murder on the books while its killer is aboard (trials.yaml guilt, reopen): it can come back
 * whenever someone learns the truth, however its trial went.
 */
export interface Case {
  victim: string;
  name: string;
  killer: string;
  room: string;
  t: number;
  feelings: Body['feelings']; // everyone's feelings for the victim when they died
  knew: string[]; // who knows for certain: saw it, or heard the killer confess
  accusers: string[]; // who has accused the killer over it
  kept: string[]; // friends the killer confided in who kept the secret
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
  feelings: Body['feelings']; // everyone's feelings for the victim when they died
  reopened?: boolean; // an old murder, brought back by someone who learned the truth
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
  cases: Case[]; // murders whose killers are still aboard
  trialOn: number | null; // the day trials were last called, so the gathering runs its course
  seen: Record<string, Record<string, number>>; // room -> contestant -> when they last left it
  names: string[]; // every name cast this season, so nobody arrives with a dead contestant's name
  cage: Record<string, number>; // "a|b" -> cage matches that pair has fought this season
  spread: Record<string, number>; // meal group -> portions left today (ranks.yaml spread)
  snacks: number; // left in the snack machine
  restocked: number; // when it was last refilled
  tapes: Record<string, Tape>; // contestant -> their latest confessional, for playback at dinner
  summons: Summons[]; // the operator's calls to the diary room, waiting for them to be free
  called: { day: number; ids: string[] }; // who's been summoned today
  playback: { who: string; day: number }[]; // confessionals to air at that day's dinner
}

/** A confessional on tape: what was said, about whom. */
export interface Tape {
  t: number;
  kind: string;
  about: string[];
  when?: number; // a romance spilled or confessed: when it last happened
  what?: string; // ...and the worst of it
}

/** "Sola to the confessional, please": after a big moment, once they're free. */
export interface Summons {
  who: string;
  moment: string; // the event type
  about: string | null; // the other one in it
  t: number;
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
  seen: number; // the last time they shared a room
  reasons: Reason[];
  label: Label; // what this contestant believes the relationship is
  flirts: number; // flirts that landed between them, either way
  kisses: number; // kisses that landed between them, either way
  lovin: number; // times they've had lovin'
  killer?: string; // the name of someone they believe the other one murdered (trials.ts believe)
  hurt: number; // 0..100: how much they're still hurting over what the other did (social.yaml ledger.hurt)
  aired?: number; // when they last had it out with each other (wants.yaml rival.confront)
}

export interface Thought {
  id: string;
  about: string | null;
  value: number; // personality and species already applied
  until: number;
  vented?: boolean; // poured out in the diary room: its weight already eased (confessionals.yaml vent)
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
