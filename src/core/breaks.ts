// Mental breaks and crimes of passion. DESIGN.md Part two, Thoughts, mood and breaks.
//
// Below a break line, an hourly chance of breaking. The biggest grievance (the source whose bad
// thoughts weigh most) picks what kind, the line picks how bad. A break is an activity of its own:
// they go where it takes them, do it, and come out of it with catharsis. At the extreme, the
// volatile or cruel attack someone, and an attack can kill.
import type { Level } from '../data/schema.js';
import { begin, endActivity, onToilet } from './actions.js';
import { axis, drink, qualityFor } from './booze.js';
import { accessRank, canEnter, log, type Ctx } from './context.js';
import { feel } from './ledger.js';
import { addNeed } from './needs.js';
import { chance } from './rng.js';
import { infraction, kill } from './show.js';
import { brawl, interact } from './social.js';
import { grievance, think } from './thoughts.js';
import type { Contestant } from './types.js';

type Kind = Ctx['data']['breaks']['kinds'][string];

/** The three break lines for a calmness: minor = 30 + 1.5 × (10 − calm), major and extreme below it. */
export function breakLines(ctx: Ctx, calm: number): Record<Level, number> {
  const l = ctx.data.breaks.lines;
  const minor = l.minorBase + l.minorPerVolatile * (10 - calm);
  return { minor, major: minor * l.majorShare, extreme: minor * l.extremeShare };
}

/** The deepest line their mood is under, if any. */
export function breakLevel(ctx: Ctx, c: Contestant): Level | null {
  const lines = breakLines(ctx, c.personality.calm);
  if (c.mood < lines.extreme) return 'extreme';
  if (c.mood < lines.major) return 'major';
  if (c.mood < lines.minor) return 'minor';
  return null;
}

/** Every hour: anyone awake under a line may break. */
export function maybeBreak(ctx: Ctx, c: Contestant): void {
  if (c.asleep || c.breakdown || !c.activity || c.activity.action === 'fight' || c.activity.action === 'lovin' || onToilet(ctx, c)) return;
  const level = breakLevel(ctx, c);
  if (!level || !chance(ctx.w.rng, ctx.data.breaks.chance[level])) return;
  const b = ctx.data.breaks;
  const g = grievance(ctx, c, b.sources) ?? { source: 'fear', about: null };
  startBreak(ctx, c, level, g.source, b.sources[g.source]?.[level] ?? b.fallback, g.about);
}

/** Whoever outranks them most, whoever they fear most, or whoever the grievance is about. */
function targetFor(ctx: Ctx, c: Contestant, kind: Kind, about: string | null): Contestant | null {
  const others = ctx.w.contestants.filter((o) => o !== c);
  switch (kind.target) {
    case undefined:
      return null;
    case 'about':
      return others.find((o) => o.id === about) ?? null;
    case 'top': {
      const mine = accessRank(ctx, c);
      const above = others.filter((o) => accessRank(ctx, o) < mine).sort((a, b) => accessRank(ctx, a) - accessRank(ctx, b));
      return above[0] ?? null;
    }
    case 'feared': {
      let best: Contestant | null = null;
      let fear = ctx.data.breaks.passion.feared;
      for (const o of others) {
        const f = c.ledger[o.id]?.fear ?? 0;
        if (f >= fear) [best, fear] = [o, f];
      }
      return best ?? others.find((o) => o.id === about) ?? null;
    }
  }
}

/** Where the break takes them, or null if they can't get there. */
function roomFor(ctx: Ctx, c: Contestant, kind: Kind, target: Contestant | null): string | null {
  switch (kind.room) {
    case 'here':
      return c.room;
    case 'bed':
      return c.bed ? ctx.st.object.get(c.bed)!.room : c.room;
    case 'target':
      return target ? target.room : null;
    case 'target_bed':
      return target?.bed ? ctx.st.object.get(target.bed)!.room : null;
    case 'bar': {
      // The best place that pours that they can walk into.
      const b = ctx.data.booze;
      let best: string | null = null;
      let rank = Infinity;
      for (const o of ctx.st.objects) {
        const def = o.actions.find((d) => d.kind === 'drink');
        if (!def || !canEnter(ctx, c, o.room)) continue;
        const q = b.order.indexOf(qualityFor(ctx, c, def.booze!));
        if (q < rank) [best, rank] = [o.room, q];
      }
      return best;
    }
    default:
      return kind.room;
  }
}

/** Breaks down: logs it (the show pays for it) and sets off to do it. */
export function startBreak(ctx: Ctx, c: Contestant, level: Level, source: string, kindId: string, about: string | null): void {
  const b = ctx.data.breaks;
  let id = kindId;
  let kind = b.kinds[id]!;
  // At the extreme, only the cruel or the volatile turn violent; the rest collapse.
  if (kind.attack && axis(ctx, c, 'kind') > b.passion.kindAtMost && c.personality.calm > b.passion.calmAtMost) {
    id = b.passion.otherwise;
    kind = b.kinds[id]!;
  }
  let target = targetFor(ctx, c, kind, about);
  let room = roomFor(ctx, c, kind, target);
  // In the fishbowl, or with nobody to take it out on, it becomes the fallback.
  if ((kind.target && !target) || room === null || (c.confined && room !== c.room)) {
    id = b.fallback;
    kind = b.kinds[id]!;
    target = null;
    room = c.room;
  }
  endActivity(ctx, c, 'interrupted');
  c.breakdown = { kind: id, level, source, target: target?.id ?? null, since: ctx.w.t, follows: 0, next: 0 };
  log(ctx, 'break', [c.id, ...(target ? [target.id] : [])], c.room, { level, kind: id, source, mood: Math.round(c.mood) });
  begin(ctx, c, { action: id, object: null, room, minutes: kind.minutes });
}

/** Arriving where the break was headed. */
export function breakArrive(ctx: Ctx, c: Contestant): void {
  const bd = c.breakdown!;
  const kind = ctx.data.breaks.kinds[bd.kind]!;
  const target = bd.target ? ctx.w.contestants.find((o) => o.id === bd.target) : undefined;
  if (kind.infraction) infraction(ctx, c, kind.infraction, c.room);
  if (kind.wreck && target) {
    think(ctx, target, kind.wreck.thought, c.id);
    feel(ctx, target, c, 'affection', kind.wreck.affection, 'wrecked my things');
  }
  bd.next = kind.insults || kind.drinks ? ctx.w.t : Number.MAX_SAFE_INTEGER; // never: nothing recurring
  if (kind.attack && target) {
    if (target.room === c.room) attack(ctx, c, target);
    else if (bd.follows < ctx.data.breaks.passion.follow) chase(ctx, c, target);
  }
}

/** The target moved on: follow them. */
function chase(ctx: Ctx, c: Contestant, target: Contestant): void {
  const a = c.activity!;
  c.breakdown!.follows++;
  if (target.confined) return;
  const t = ctx.w.t;
  a.room = target.activity?.room ?? target.room;
  a.phase = 'walk';
  a.startedAt = t;
  a.arriveAt = t + Math.max(1, ctx.st.walk[ctx.st.roomIndex.get(c.room)!]![ctx.st.roomIndex.get(a.room)!]!);
  a.endAt = null;
}

/** One minute of a break: the spree's insults, the bender's drinks. */
export function breakMinute(ctx: Ctx, c: Contestant): void {
  const bd = c.breakdown;
  const a = c.activity;
  if (!bd || !a || a.phase !== 'do') return;
  const kind = ctx.data.breaks.kinds[bd.kind]!;
  for (const [n, g] of Object.entries(kind.gains)) addNeed(c, n as never, g / kind.minutes);
  if (ctx.w.t < bd.next) return;
  if (kind.insults) {
    const target = ctx.w.contestants.find((o) => o.id === bd.target);
    const insult = ctx.data.social.interactions.find((d) => d.id === 'insult');
    if (target && insult && target.room === c.room && !target.asleep) interact(ctx, c, target, insult);
    bd.next = ctx.w.t + kind.insults;
    return;
  }
  if (kind.drinks) {
    // A bender pours whatever's here, at their rank.
    const def = ctx.st.objectsInRoom.get(c.room)!.flatMap((o) => o.actions).find((d) => d.kind === 'drink');
    if (def) drink(ctx, c, qualityFor(ctx, c, def.booze!), c.room);
    bd.next = ctx.w.t + Math.floor(kind.minutes / kind.drinks);
  }
}

/** The break is over, however it ended: catharsis. */
export function endBreak(ctx: Ctx, c: Contestant): void {
  const bd = c.breakdown;
  if (!bd) return;
  c.breakdown = null;
  think(ctx, c, ctx.data.breaks.catharsis);
  log(ctx, 'break_end', [c.id], c.room, { kind: bd.kind, minutes: ctx.w.t - bd.since });
}

/**
 * A crime of passion: a fight where the attacker strikes first. If the attacker wins, the chance it
 * kills is perStrength × their strength advantage × the room's weapon.
 */
export function attack(ctx: Ctx, c: Contestant, target: Contestant): void {
  const p = ctx.data.breaks.passion;
  const room = c.room;
  const killChance = p.perStrength * Math.max(0, c.strength - target.strength) * (p.weapons[room] ?? 1);
  const fight = brawl(ctx, c, target, {
    firstBlow: p.firstBlow,
    lethal: (winner) => winner === c && chance(ctx.w.rng, killChance),
  });
  if (!fight.killed) return;
  const dead = fight.loser;
  const witnesses = ctx.w.contestants.filter((o) => o !== c && o !== dead && o.room === room && !o.asleep);
  log(ctx, 'murder', [c.id, dead.id], room, { name: dead.name, weapon: p.weapons[room] ? room : null, witnesses: witnesses.map((w) => w.id) });
  for (const w of witnesses) {
    feel(ctx, w, c, 'fear', p.witnessFear, 'saw a murder');
    think(ctx, w, p.witnessThought, c.id);
  }
  kill(ctx, dead, 'murder', room, witnesses.map((w) => w.id), c.id);
}
