// What every system gets while the world steps: the data, its derived indexes, the world and
// the event log being written. Also the small shared helpers: clock, access, logging.
import type { GameData } from '../data/schema.js';
import type { Station } from './station.js';
import type { Contestant, SimEvent, World } from './types.js';

export interface Ctx {
  data: GameData;
  st: Station;
  w: World;
  events: SimEvent[];
}

export const MINUTES_PER_DAY = 1440;

/** Station day, starting at 1. */
export const dayOf = (t: number) => Math.floor(t / MINUTES_PER_DAY) + 1;
/** Minutes after midnight. */
export const timeOfDay = (t: number) => t % MINUTES_PER_DAY;

export function clockText(t: number): string {
  const m = timeOfDay(t);
  return `day ${dayOf(t)} ${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Between lights-dim and the wake chime. */
export function isNight(ctx: Ctx, t: number): boolean {
  const m = timeOfDay(t);
  const s = ctx.data.schedule;
  return s.lightsDim > s.wakeChime.at ? m >= s.lightsDim || m < s.wakeChime.at : m >= s.lightsDim && m < s.wakeChime.at;
}

export function log(ctx: Ctx, type: string, actors: string[], room?: string, data?: Record<string, unknown>): SimEvent {
  const e: SimEvent = { t: ctx.w.t, type, actors };
  if (room !== undefined) e.room = room;
  if (data !== undefined) e.data = data;
  ctx.events.push(e);
  return e;
}

/** The rank a contestant is treated as for access, food and clothing. */
export function accessRank(ctx: Ctx, c: Contestant): number {
  return c.rank ?? ctx.data.ranks.newcomerRank;
}

export function canEnter(ctx: Ctx, c: Contestant, roomId: string): boolean {
  const room = ctx.st.room.get(roomId)!;
  switch (room.access) {
    case 'all':
      return true;
    case 'ranks': {
      const r = accessRank(ctx, c);
      return r >= room.ranks![0] && r <= room.ranks![1];
    }
    case 'occupants':
      return (c.bed !== null && ctx.st.object.get(c.bed)!.room === roomId) || validGuest(ctx, c, roomId);
    case 'robots':
      return false;
  }
}

/** Let in by someone who still has a bed in that room. */
export function validGuest(ctx: Ctx, c: Contestant, roomId: string): boolean {
  const g = c.guest;
  if (!g || g.room !== roomId) return false;
  const host = ctx.w.contestants.find((o) => o.id === g.host);
  return !!host && host.bed !== null && ctx.st.object.get(host.bed)!.room === roomId;
}

export function inRanks(r: number, ranks: readonly [number, number] | undefined): boolean {
  return !ranks || (r >= ranks[0] && r <= ranks[1]);
}
