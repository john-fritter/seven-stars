// Turning event logs into numbers, and numbers into a report against the success targets.
import type { GameData } from '../data/schema.js';
import { createWorld, MINUTES_PER_DAY, step, type SimEvent, type World } from '../core/index.js';

/** Raw counts for one seed. Plain data so workers can send it back. */
export interface SeedStats {
  seed: number;
  days: number;
  contestantDays: number;
  events: Record<string, number>;
  deathsByCause: Record<string, number>;
  stays: number[]; // minutes aboard, for everyone who left
  minutesByRoom: Record<string, number>;
  minutesByAction: Record<string, number>;
  walkingMinutes: number;
  meals: Record<string, number>; // by food
  notableDays: number;
  sentenceDays: number;
  ceremonies: number;
  ceremoniesWithRankChange: number;
  needsAtNight: Record<string, number>; // summed at each day's end, averaged in the report
  moodAtNight: number;
  knocks: Record<string, number>; // by answer
  relations: Record<string, number>; // directed pairs at each day's end: pairs, friends, rivals, crushes, affection
}

function add(m: Record<string, number>, k: string, v = 1): void {
  m[k] = (m[k] ?? 0) + v;
}

export function runSeed(data: GameData, seed: number, days: number): SeedStats {
  const s: SeedStats = {
    seed,
    days,
    contestantDays: 0,
    events: {},
    deathsByCause: {},
    stays: [],
    minutesByRoom: {},
    minutesByAction: {},
    walkingMinutes: 0,
    meals: {},
    notableDays: 0,
    sentenceDays: 0,
    ceremonies: 0,
    ceremoniesWithRankChange: 0,
    needsAtNight: {},
    moodAtNight: 0,
    knocks: {},
    relations: {},
  };
  const notable = new Set(data.targets.notable);
  const world = createWorld(data, seed);
  for (let d = 0; d < days; d++) {
    const events = step(world, MINUTES_PER_DAY);
    let isNotable = false;
    let sentenced = false;
    for (const e of events) {
      add(s.events, e.type);
      if (notable.has(e.type)) isNotable = true;
      if (e.type === 'sentence') sentenced = true;
      tally(s, e);
    }
    if (isNotable) s.notableDays++;
    if (sentenced) s.sentenceDays++;
    endOfDay(s, world, data);
  }
  return s;
}

function tally(s: SeedStats, e: SimEvent): void {
  const d = e.data ?? {};
  switch (e.type) {
    case 'act.end':
      add(s.minutesByRoom, e.room ?? '?', d.minutes as number);
      add(s.minutesByAction, d.action as string, d.minutes as number);
      s.walkingMinutes += d.walk as number;
      break;
    case 'meal':
      add(s.meals, d.food as string);
      break;
    case 'knock':
      add(s.knocks, d.answer as string);
      break;
    case 'ceremony':
      s.ceremonies++;
      if ((d.changes as { from: number | null }[]).some((c) => c.from !== null)) s.ceremoniesWithRankChange++;
      break;
    case 'death':
      add(s.deathsByCause, (d.cause as string) ?? 'unknown');
      if (typeof d.stay === 'number') s.stays.push(d.stay);
      break;
  }
}

function endOfDay(s: SeedStats, w: World, data: GameData): void {
  s.contestantDays += w.contestants.length;
  const l = data.social.ledger;
  for (const c of w.contestants) {
    for (const [k, v] of Object.entries(c.needs)) add(s.needsAtNight, k, v);
    s.moodAtNight += c.mood;
    for (const r of Object.values(c.ledger)) {
      add(s.relations, 'pairs');
      add(s.relations, 'affection', r.affection);
      if (r.affection >= l.friendAt) add(s.relations, 'friends');
      if (r.affection <= l.rivalAt) add(s.relations, 'rivals');
      if (r.attraction >= l.crushAt) add(s.relations, 'crushes');
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Report

export interface Metric {
  id: string;
  label: string;
  value: number | null;
  min?: number;
  max?: number;
  ok: boolean | null; // null: nothing to measure yet
}

export interface Report {
  seeds: number;
  days: number;
  metrics: Metric[];
  perWeek: Record<string, number>;
  deathsByCausePerWeek: Record<string, number>;
  timeByRoom: Record<string, number>; // share of contestant time
  timeByAction: Record<string, number>;
  walkingShare: number;
  mealsPerContestantDay: Record<string, number>;
  needsAtNight: Record<string, number>;
  moodAtNight: number;
  knockYesShare: number | null;
  /** Shares of directed relationships at the end of each day, and the average affection. */
  relations: { friends: number; rivals: number; crushes: number; affection: number } | null;
}

export function report(data: GameData, seeds: SeedStats[]): Report {
  const days = seeds.reduce((a, s) => a + s.days, 0);
  const cDays = seeds.reduce((a, s) => a + s.contestantDays, 0);
  const sum = (f: (s: SeedStats) => Record<string, number>) => {
    const out: Record<string, number> = {};
    for (const s of seeds) for (const [k, v] of Object.entries(f(s))) add(out, k, v);
    return out;
  };
  const events = sum((s) => s.events);
  const perWeek = (n: number) => (n / days) * 7;
  const stays = seeds.flatMap((s) => s.stays);

  const value: Record<string, number | null> = {
    deathsPerWeek: perWeek(events.death ?? 0),
    averageStayWeeks: stays.length ? stays.reduce((a, b) => a + b, 0) / stays.length / (MINUTES_PER_DAY * 7) : null,
    breaksPerDay: (events.break ?? 0) / days,
    fightsPerWeek: perWeek(events.fight ?? 0),
    hookupsPerWeek: perWeek(events.lovin ?? 0),
    sentenceDayShare: seeds.reduce((a, s) => a + s.sentenceDays, 0) / days,
    rankChangeShare: ratio(seeds.reduce((a, s) => a + s.ceremoniesWithRankChange, 0), seeds.reduce((a, s) => a + s.ceremonies, 0)),
    quietDayShare: 1 - seeds.reduce((a, s) => a + s.notableDays, 0) / days,
  };
  const metrics = data.targets.targets.map((t): Metric => {
    const v = value[t.id] ?? null;
    const ok = v === null ? null : (t.min === undefined || v >= t.min) && (t.max === undefined || v <= t.max);
    return { id: t.id, label: t.label, value: v, ...(t.min !== undefined ? { min: t.min } : {}), ...(t.max !== undefined ? { max: t.max } : {}), ok };
  });

  const byRoom = sum((s) => s.minutesByRoom);
  const byAction = sum((s) => s.minutesByAction);
  const walking = seeds.reduce((a, s) => a + s.walkingMinutes, 0);
  const total = cDays * MINUTES_PER_DAY;
  const share = (m: Record<string, number>) => sortDesc(Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v / total])));
  const needs = sum((s) => s.needsAtNight);
  const knocks = sum((s) => s.knocks);
  const rel = sum((s) => s.relations);

  return {
    seeds: seeds.length,
    days: days / Math.max(1, seeds.length),
    metrics,
    perWeek: sortDesc(Object.fromEntries(Object.entries(events).filter(([k]) => !k.startsWith('act.')).map(([k, v]) => [k, perWeek(v)]))),
    deathsByCausePerWeek: Object.fromEntries(Object.entries(sum((s) => s.deathsByCause)).map(([k, v]) => [k, perWeek(v)])),
    timeByRoom: share(byRoom),
    timeByAction: share(byAction),
    walkingShare: walking / total,
    mealsPerContestantDay: Object.fromEntries(Object.entries(sum((s) => s.meals)).map(([k, v]) => [k, v / cDays])),
    needsAtNight: Object.fromEntries(Object.entries(needs).map(([k, v]) => [k, v / cDays])),
    moodAtNight: seeds.reduce((a, s) => a + s.moodAtNight, 0) / cDays,
    knockYesShare: ratio(knocks.yes ?? 0, (knocks.yes ?? 0) + (knocks.no ?? 0)),
    relations: rel.pairs ? { friends: (rel.friends ?? 0) / rel.pairs, rivals: (rel.rivals ?? 0) / rel.pairs, crushes: (rel.crushes ?? 0) / rel.pairs, affection: (rel.affection ?? 0) / rel.pairs } : null,
  };
}

const ratio = (a: number, b: number) => (b ? a / b : null);

function sortDesc(m: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]));
}
