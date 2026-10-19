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
