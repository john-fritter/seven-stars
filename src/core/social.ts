// Social interactions, flirting, fights and knocking. DESIGN.md Part two, Social interactions
// and romance, and Rank, privileges, rules and punishments (Getting let in).
import type { InteractionDef } from '../data/schema.js';
import { actionDef, begin, endActivity, FIGHT } from './actions.js';
import { axis, giftDrink, moveMult, stageMult } from './booze.js';
import { log, type Ctx } from './context.js';
import { askExclusive, attachedMult, breakUp, evidence, kiss, moveAllowed, proposition } from './romance.js';
import { witnessesOf } from './scoring.js';
import { infraction } from './show.js';
import { feel, meet, rel, relation, warm } from './ledger.js';
import { addNeed, axisFactor } from './needs.js';
import { between, chance, next, weightedIndex } from './rng.js';
import { think } from './thoughts.js';
import type { Contestant } from './types.js';

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Free to talk: here, awake, and not in the middle of something absorbing. */
export function available(ctx: Ctx, c: Contestant): boolean {
  const a = c.activity;
  if (c.asleep || c.breakdown || !a || a.phase !== 'do') return false;
  const ab = ctx.data.social.absorbed;
  if (ab.actions.includes(a.action)) return false;
  const def = actionDef(ctx, a);
  return !def || (!ab.kinds.includes(def.kind) && !def.tags.some((t) => ab.tags.includes(t)));
}

/**
 * Chance that a contestant starts an interaction this round: outgoing ÷ 10 × (base + social
 * urgency), × 1.5 when tipsy or worse.
 */
export function interactionChance(ctx: Ctx, c: Contestant): number {
  const x = (100 - c.needs.social) / 100;
  return (c.personality.outgoing / 10) * (ctx.data.social.base + x * x) * stageMult(ctx, c, 'interaction');
}

/** Every few minutes: people who share a room meet, and each may start an interaction. */
export function socialRound(ctx: Ctx): void {
  const cast = ctx.w.contestants;
  for (let i = 0; i < cast.length; i++) {
    for (let j = i + 1; j < cast.length; j++) {
      const a = cast[i]!;
      const b = cast[j]!;
      if (a.room === b.room && !a.ledger[b.id] && !a.asleep && !b.asleep) meet(ctx, a, b);
    }
  }
  for (const c of cast) {
    if (!available(ctx, c)) continue;
    const others = cast.filter((o) => o !== c && (o.room === c.room || throughGlass(ctx, c, o)) && available(ctx, o));
    if (others.length === 0) continue;
    if (!chance(ctx.w.rng, interactionChance(ctx, c))) continue;
    const p = ctx.data.social.partner;
    const weights = others.map((o) => {
      const r = relation(ctx, c, o);
      return Math.max(p.min, 1 + (r.affection / 100) * p.affection + (r.attraction / 10) * p.attraction);
    });
    const o = others[weightedIndex(ctx.w.rng, weights)]!;
    const defs = interactionsFor(ctx, c, o);
    if (!defs.length) continue;
    const def = defs[weightedIndex(ctx.w.rng, defs.map((d) => interactionWeight(ctx, c, o, d)))]!;
    interact(ctx, c, o, def);
  }
}

/** One of them is in a glass cell inside the other's room: they can see and talk, nothing more. */
export function throughGlass(ctx: Ctx, a: Contestant, b: Contestant): boolean {
  return ctx.st.room.get(a.room)!.glass === b.room || ctx.st.room.get(b.room)!.glass === a.room;
}

/** Face to face, the ordinary interactions; through the glass, only the ones marked for it. */
function interactionsFor(ctx: Ctx, c: Contestant, o: Contestant): InteractionDef[] {
  const defs = ctx.data.social.interactions;
  if (o.room === c.room) return defs.filter((d) => !d.glass);
  const outside = !ctx.st.room.get(c.room)!.glass;
  return defs.filter((d) => d.glass === 'either' || (d.glass === 'outside' && outside));
}

/**
 * An interaction type's weight for this actor and target: its gates, its scale factors, the
 * actor's drunkenness, and for romance moves, whether they're already attached to someone else.
 */
export function interactionWeight(ctx: Ctx, c: Contestant, o: Contestant, def: InteractionDef): number {
  const r = relation(ctx, c, o);
  const n = def.needs;
  if (n.attraction !== undefined && r.attraction < n.attraction) return 0;
  if (n.affection !== undefined && r.affection < n.affection) return 0;
  if (n.labels && !n.labels.includes(r.label)) return 0;
  if (n.flirted && r.flirts === 0) return 0;
  if (n.inventory && c.inventory.length === 0) return 0;
  if (!moveAllowed(ctx, c, o, def)) return 0;
  const [lo, hi] = ctx.data.social.factorRange;
  let w = def.weight * moveMult(ctx, c, def.id);
  if (def.move && def.move !== 'gift' && def.move !== 'breakup') w *= attachedMult(ctx, c, o);
  for (const s of def.scale) {
    const k = s.k ?? 1;
    let f: number;
    switch (s.by) {
      case 'affection':
        f = 1 + (k * r.affection) / 100;
        break;
      case 'attraction':
        f = r.attraction / 5;
        break;
      case 'chemistry':
        f = 1 + k * r.chemistry;
        break;
      case 'privacy':
        f = 1 + k * ctx.st.room.get(c.room)!.privacy;
        break;
      case 'monogamy':
        f = axisFactor(k, c.monogamy);
        break;
      default:
        f = axisFactor(k, axis(ctx, c, s.by));
    }
    w *= clamp(f, lo, hi);
  }
  return w;
}

export function interact(ctx: Ctx, c: Contestant, o: Contestant, def: InteractionDef): void {
  const rc = relation(ctx, c, o);
  const ro = relation(ctx, o, c);
  addNeed(c, 'social', def.social * stageMult(ctx, c, 'social'));
  addNeed(o, 'social', def.social * stageMult(ctx, o, 'social'));
  rc.knows = Math.min(1, rc.knows + def.knows);
  ro.knows = Math.min(1, ro.knows + def.knows);
  warm(ctx, c, o);
  warm(ctx, o, c);
  for (const [dim, v] of Object.entries(def.actor)) feel(ctx, c, o, dim as never, v, def.id);
  for (const [dim, v] of Object.entries(def.target)) feel(ctx, o, c, dim as never, v, def.id);
  for (const [n, v] of Object.entries(def.targetGains)) addNeed(o, n as never, v);
  if (def.thought) think(ctx, o, def.thought, c.id);

  switch (def.move) {
    case 'flirt':
      return flirt(ctx, c, o);
    case 'kiss':
      return kiss(ctx, c, o);
    case 'proposition':
      return proposition(ctx, c, o);
    case 'exclusive':
      return askExclusive(ctx, c, o);
    case 'breakup':
      return breakUp(ctx, c, o);
    case 'gift':
      return giftDrink(ctx, c, o);
  }
  const e = log(ctx, def.id, [c.id, o.id], c.room);
  if (def.witnessThought) for (const id of witnessesOf(ctx, e)) think(ctx, ctx.w.contestants.find((x) => x.id === id)!, def.witnessThought, c.id);
  if (def.fight && chance(ctx.w.rng, fightChance(ctx, o, c))) fight(ctx, c, o);
}

// ---------------------------------------------------------------------------------------------
// Flirting

/** Odds a flirt lands: the target's attraction back ÷ 10 × successScale. */
export function flirtOdds(ctx: Ctx, target: Contestant, flirter: Contestant): number {
  return clamp(((rel(target, flirter)?.attraction ?? 0) / 10) * ctx.data.social.flirt.successScale, 0, 1);
}

function flirt(ctx: Ctx, c: Contestant, o: Contestant): void {
  const f = ctx.data.social.flirt;
  const odds = flirtOdds(ctx, o, c);
  if (chance(ctx.w.rng, odds)) {
    for (const [a, b] of [[c, o], [o, c]] as const) {
      feel(ctx, a, b, 'affection', f.success.affection, 'flirt');
      feel(ctx, a, b, 'attraction', f.success.attraction, 'flirt');
      relation(ctx, a, b).flirts++;
    }
    log(ctx, 'flirt', [c.id, o.id], c.room, { odds: round2(odds) });
  } else {
    think(ctx, c, f.rebuffed, o.id);
    think(ctx, o, f.awkward, c.id);
    log(ctx, 'rebuff', [c.id, o.id], c.room, { odds: round2(odds) });
  }
}

const round2 = (x: number) => Math.round(x * 100) / 100;

// ---------------------------------------------------------------------------------------------
// Fights

/**
 * Chance an insult turns into a fight: chance × the insulted person's volatility, × the drunker
 * of the two's stage.
 */
export function fightChance(ctx: Ctx, insulted: Contestant, insulter?: Contestant): number {
  const f = ctx.data.social.fight;
  const drunk = Math.max(stageMult(ctx, insulted, 'fight'), insulter ? stageMult(ctx, insulter, 'fight') : 1);
  return clamp(f.chance * axisFactor(f.calmK, insulted.personality.calm) * drunk, 0, 1);
}

/** Fighting power without the die: strength and stamina. */
export function fightPower(ctx: Ctx, c: Contestant): number {
  const p = ctx.data.social.fight.power;
  return c.strength * p.strength + c.stamina * p.stamina;
}

/** The insulted one swings. Strength, stamina and a die roll decide who gets hurt. */
export function fight(ctx: Ctx, insulter: Contestant, insulted: Contestant): void {
  brawl(ctx, insulted, insulter, {});
}

export interface BrawlOptions {
  firstBlow?: number; // added to the swinger's roll: a crime of passion's attacker strikes first
  lethal?: (winner: Contestant, loser: Contestant) => boolean; // whether the loser dies of it
}

/**
 * A fight: `swinger` throws the first punch. Strength, stamina and a die roll decide who gets
 * hurt. Ordinary fights never take health below the floor; a lethal one can kill. Returns the loser
 * if they were killed.
 */
export function brawl(ctx: Ctx, swinger: Contestant, other: Contestant, opts: BrawlOptions): Contestant | null {
  const insulted = swinger;
  const insulter = other;
  const f = ctx.data.social.fight;
  const rng = ctx.w.rng;
  const a = fightPower(ctx, insulted) + next(rng) * f.power.die + (opts.firstBlow ?? 0);
  const b = fightPower(ctx, insulter) + next(rng) * f.power.die;
  const [winner, loser] = a >= b ? [insulted, insulter] : [insulter, insulted];
  const serious = chance(rng, f.serious.chance);
  const damage = Math.round(between(rng, f.damage[0], f.damage[1]) + (serious ? f.serious.extra : 0));
  const killed = opts.lethal?.(winner, loser) ?? false;
  loser.health = killed ? 0 : Math.max(Math.min(loser.health, f.healthFloor), loser.health - damage);
  const cathartic = chance(rng, f.cathartic);
  for (const [x, y] of [[winner, loser], [loser, winner]] as const) feel(ctx, x, y, 'affection', cathartic ? f.affection : -f.affection, 'fight');
  feel(ctx, loser, winner, 'fear', f.loserFear, 'fight');
  think(ctx, winner, f.won, loser.id);
  think(ctx, loser, f.lost, winner.id);

  const room = insulted.room;
  const witnesses = ctx.w.contestants.filter((w) => w !== insulter && w !== insulted && w.room === room && !w.asleep).map((w) => w.id);
  for (const c of [insulter, insulted]) {
    endActivity(ctx, c, 'interrupted');
    if (!(killed && c === loser)) begin(ctx, c, { action: FIGHT, object: null, room, minutes: f.minutes });
  }
  const outsideCage = room !== f.cageRoom;
  const e = log(ctx, 'fight', [insulted.id, insulter.id], room, {
    winner: winner.id,
    loser: loser.id,
    damage,
    serious,
    after: cathartic ? 'cathartic' : 'angering',
    witnesses,
    outsideCage,
    ...(opts.firstBlow ? { attack: true } : {}),
    ...(killed ? { killed: true } : {}),
  });
  if (f.witnessThought) for (const id of witnesses) think(ctx, ctx.w.contestants.find((x) => x.id === id)!, f.witnessThought, insulted.id);
  if (outsideCage) {
    // Fighting outside the cage is an infraction; what the fight scored can earn a rule-of-cool
    // waiver. An attacker's victim was only defending themselves.
    const awards = (e.data?.awards ?? {}) as Record<string, number>;
    const guilty = ctx.data.rules.fighting === 'both' && !opts.firstBlow ? [insulted, insulter] : [insulted];
    for (const c of guilty) infraction(ctx, c, 'fighting', room, awards[c.id] ?? 0);
  }
  return killed ? loser : null;
}

// ---------------------------------------------------------------------------------------------
// Knocking (D-096)

/** Odds a host lets the knocker in, from the host's feelings and kindness; ×asleep if asleep. */
export function knockOdds(ctx: Ctx, host: Contestant, knocker: Contestant, asleep = host.asleep): number {
  const k = ctx.data.social.knock;
  const r = rel(host, knocker);
  const p = (k.base + (r?.affection ?? 0) * k.affection + (r?.attraction ?? 0) * k.attraction) * axisFactor(k.kindK, host.personality.kind);
  return clamp(p * (asleep ? k.asleep : 1), 0, 1);
}

/** What the knocker expects: they guess the host feels about them as they feel about the host. */
export function expectedKnockOdds(ctx: Ctx, knocker: Contestant, host: Contestant): number {
  const k = ctx.data.social.knock;
  const r = rel(knocker, host);
  const p = (k.base + (r?.affection ?? 0) * k.affection + (r?.attraction ?? 0) * k.attraction) * axisFactor(k.kindK, host.personality.kind);
  const recent = knocker.knocked[host.id];
  const repeat = recent !== undefined && ctx.w.t - recent < k.pesterHours * 60 ? k.repeat : 1;
  return clamp(p, 0, 1) * repeat;
}

/** Whoever has a bed in a room, other than `c`. */
export function occupants(ctx: Ctx, roomId: string, c: Contestant): Contestant[] {
  return ctx.w.contestants.filter((o) => o !== c && o.bed !== null && ctx.st.object.get(o.bed)!.room === roomId);
}

/** The guest a host currently has, if any. */
function guestOf(ctx: Ctx, host: Contestant): Contestant | undefined {
  return ctx.w.contestants.find((g) => g.guest?.host === host.id);
}

/** Buzzes a host. Returns whether the knocker is let in; if so they're now a legal guest. */
export function knock(ctx: Ctx, c: Contestant, host: Contestant, roomId: string): boolean {
  const k = ctx.data.social.knock;
  const t = ctx.w.t;
  relation(ctx, host, c);
  const last = c.knocked[host.id];
  const pestering = last !== undefined && t - last < k.pesterHours * 60;
  if (pestering) feel(ctx, host, c, 'affection', k.pesterAffection, 'pestered');
  c.knocked[host.id] = t;

  const other = guestOf(ctx, host);
  let yes: boolean;
  let odds = 0;
  const data: Record<string, unknown> = { host: host.id, asleep: host.asleep, pestering };
  if (other) {
    yes = false;
    data.hosting = other.id;
    // Seeing who's in there is evidence for whatever the knocker believes about the host.
    if (other.room === roomId && host.room === roomId) data.saw = other.id;
  } else {
    odds = knockOdds(ctx, host, c);
    yes = chance(ctx.w.rng, odds);
  }
  data.odds = round2(odds);
  data.answer = yes ? 'yes' : 'no';
  log(ctx, 'knock', [c.id, host.id], roomId, data);
  if (other && data.saw) evidence(ctx, c, host, other, 'guest');
  if (yes) c.guest = { room: roomId, host: host.id, since: t };
  else think(ctx, c, k.turnedAway, host.id);
  return yes;
}

/** The pull of the people in a room on someone deciding where to go. */
export function companyPull(ctx: Ctx, c: Contestant, roomId: string): number {
  const k = ctx.data.social.companyPull;
  const fancy = ctx.data.romance.proposition.attraction;
  const privacy = ctx.st.room.get(roomId)!.privacy;
  let p = 0;
  for (const o of ctx.w.contestants) {
    if (o === c || (o.activity?.room ?? o.room) !== roomId) continue;
    const r = c.ledger[o.id];
    if (!r) continue;
    const up = r.attraction >= fancy ? 1 + k.private * privacy : 1; // up to something
    p += (r.affection / 100) * k.affection + (r.attraction / 10) * k.attraction * up + (r.fear / 100) * k.fear;
  }
  return p;
}
