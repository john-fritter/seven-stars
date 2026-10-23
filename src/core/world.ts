// The core API: createWorld, step, save, load.
import type { GameData } from '../data/schema.js';
import { decide, endActivity, followComfort, onToilet, runActivity, sleepwalk } from './actions.js';
import type { Ctx } from './context.js';
import { drainNeeds } from './needs.js';
import { socialRound } from './social.js';
import { soberMinute } from './booze.js';
import { maybeBreak } from './breaks.js';
import { conditions, expireThoughts, trappedHere } from './thoughts.js';
import { company, worries } from './people.js';
import { createRng } from './rng.js';
import { drainMeter, fearTheMeter } from './scoring.js';
import { runSchedule } from './schedule.js';
import { station } from './station.js';
import { clampTemp, driftRooms } from './temperature.js';
import type { SimEvent, World } from './types.js';

// The world stays plain data; the game data it runs on is attached here, outside it.
const worldData = new WeakMap<World, GameData>();

/** A fresh station at midnight on day 1. The first cast arrives at the morning arrivals. */
export function createWorld(data: GameData, seed: number): World {
  const st = station(data);
  const [lo, hi] = data.temperature.clamp;
  const rooms: World['rooms'] = {};
  for (const r of st.rooms) {
    const f = Math.min(hi, Math.max(lo, r.temperature));
    rooms[r.id] = { temp: f, setting: f };
  }
  const objects: World['objects'] = {};
  for (const o of st.objects) objects[o.id] = [];
  const w: World = { version: 1, seed, t: 0, rng: createRng(seed), nextId: 1, contestants: [], rooms, objects, show: newShow() };
  worldData.set(w, data);
  return w;
}

function newShow(): World['show'] {
  return { day: 1, today: {}, mine: {}, pairs: {}, pending: [], effects: {}, booked: null, event: null, lastFormat: null, button: null, bedSwap: null, bodies: [], trials: [], trialOn: null, seen: {}, names: [], cage: {} };
}

/** Swaps the data a world runs on, for hot-reloading tuned values. */
export function setData(world: World, data: GameData): void {
  station(data);
  worldData.set(world, data);
}

/** Advances the world by some station minutes and returns what happened. */
export function step(world: World, minutes: number): SimEvent[] {
  const data = worldData.get(world);
  if (!data) throw new Error('step: this world was not made by createWorld or load');
  const ctx: Ctx = { data, st: station(data), w: world, events: [] };
  for (let i = 0; i < minutes; i++) {
    tick(ctx);
    world.t++;
  }
  return ctx.events;
}

function tick(ctx: Ctx): void {
  runSchedule(ctx);
  const tenth = ctx.w.t % 10 === 0;
  if (tenth) driftRooms(ctx);
  const critical = ctx.data.needs.bladder.criticalBelow;
  const hour = ctx.w.t % 60 === 0;
  for (const c of ctx.w.contestants) {
    drainNeeds(ctx, c);
    drainMeter(ctx, c);
    soberMinute(ctx, c);
    runActivity(ctx, c);
    // Near zero, the bladder overrides everything, sleep included.
    if (c.activity && c.needs.bladder < critical && !onToilet(ctx, c)) endActivity(ctx, c, 'interrupted');
    if (!c.activity && !c.asleep) {
      decide(ctx, c);
      runActivity(ctx, c);
    }
    if (tenth) {
      followComfort(ctx, c, 10); // comfort moves slowly; every ten minutes is plenty
      expireThoughts(ctx, c);
      conditions(ctx, c);
      company(ctx, c);
      if (hour) {
        fearTheMeter(ctx, c);
        trappedHere(ctx, c);
        worries(ctx, c);
        maybeBreak(ctx, c);
        sleepwalk(ctx, c);
      }
      c.health = Math.min(100, c.health + ctx.data.social.health.recoverPerHour / 6);
    }
  }
  if (ctx.w.t % ctx.data.social.every === 0) socialRound(ctx);
}

export function save(world: World): string {
  return JSON.stringify(world);
}

export function load(data: GameData, saved: string): World {
  const w = JSON.parse(saved) as World;
  if (w.version !== 1) throw new Error(`Can't load a save of version ${String(w.version)}`);
  station(data);
  worldData.set(w, data);
  return w;
}
