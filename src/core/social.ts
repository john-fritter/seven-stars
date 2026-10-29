// Social interactions, flirting, fights and knocking. DESIGN.md Part two, Social interactions
// and romance, and Rank, privileges, rules and punishments (Getting let in).
import type { InteractionDef } from '../data/schema.js';
import { actionDef, bedmateFeeling, begin, boredom, endActivity, FIGHT } from './actions.js';
import { attractionNow, axis, giftDrink, grubbiness, moveMult, stageMult, stageOf } from './booze.js';
import { shareSnack, swipeSnack } from './pantry.js';
import { log, type Ctx } from './context.js';
import { askExclusive, attachedMult, breakUp, evidence, kiss, invite, looseLips, moveAllowed, piningMult, proposition } from './romance.js';
import { boldness, chanceBoost, interactionBoost } from './ratings.js';
import { witnessesOf } from './scoring.js';
import { infraction } from './show.js';
import { feel, meet, rel, relation, warm } from './ledger.js';
import { addNeed, axisFactor, companyWant, needUrgency } from './needs.js';
import { between, chance, next, weightedIndex } from './rng.js';
import { friction } from './people.js';
import { canSee } from './station.js';
import { think } from './thoughts.js';
import { traitFx } from './traits.js';
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
 * urgency), × 1.5 when tipsy or worse, and more as the meter falls (ratings.ts).
 */
export function interactionChance(ctx: Ctx, c: Contestant): number {
  // Lonely people reach out more; the worn out less (social.yaml company).
  const want = companyWant(ctx, c);
  const x = Math.max(0, want);
  const tired = 1 + Math.min(0, want);
  const bored = 1 + (ctx.data.needs.boredom?.chance ?? 0) * boredom(ctx, c);
  return (boldness(ctx, c) / 10) * (ctx.data.social.base + x * x) * tired * bored * stageMult(ctx, c, 'interaction') * chanceBoost(ctx, c);
}

/** In a conversation with someone here: who it's with. */
function talkingWith(ctx: Ctx, c: Contestant): Contestant | undefined {
  const a = c.activity;
  if (!a || a.action !== ctx.data.social.company.talk.action || a.phase !== 'do') return undefined;
  const p = ctx.w.contestants.find((o) => o.id === a.partner);
  return p && p.room === c.room && p.activity?.action === a.action && p.activity.partner === c.id && p.activity.phase === 'do' ? p : undefined;
}

/** Doing something with people (dancing, the bar, the hot tub, games): talk comes easily. */
function sociable(ctx: Ctx, c: Contestant): boolean {
  const def = c.activity ? actionDef(ctx, c.activity) : undefined;
  return !!def && (def.company || def.tags.includes('social') || def.tags.includes('crowd'));
}

/** Odds `o` says yes to a conversation with `c`: base + affection, less when they've had enough people. */
export function talkOdds(ctx: Ctx, o: Contestant, c: Contestant): number {
  const k = ctx.data.social.company.talk.odds;
  const aff = o.ledger[c.id]?.affection ?? 0;
  const tired = 1 + k.tired * Math.min(0, companyWant(ctx, o));
  return clamp((k.base + (aff / 100) * k.affection) * tired, k.min, 1);
}

/** The pull of one person: liking, attraction (more somewhere private when they fancy them), fear. */
export function personPull(ctx: Ctx, c: Contestant, o: Contestant, roomId: string): number {
  const r = c.ledger[o.id];
  if (!r) return 0;
  const k = ctx.data.social.companyPull;
  const up = r.attraction >= ctx.data.romance.proposition.attraction ? 1 + k.private * ctx.st.room.get(roomId)!.privacy : 1;
  const x = (r.affection / 100) * k.affection + (r.attraction / 10) * k.attraction * up;
  const clingy = traitFx(ctx.data, c).partnerPull;
  return (clingy !== 1 && ctx.data.needs.sleep.share.partners.includes(r.label) ? x * clingy : x) + (r.fear / 100) * k.fear;
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
  traitRound(ctx);
  friction(ctx);
  for (const c of cast) {
    if (!available(ctx, c)) continue;
    const others = cast.filter((o) => o !== c && (o.room === c.room || throughGlass(ctx, c, o)) && available(ctx, o));
    if (others.length === 0) continue;
    // In a conversation it's mostly with the partner and comes often; idle chatter elsewhere is rare.
    const mate = talkingWith(ctx, c);
    const k = ctx.data.social.company;
    const often = mate ? k.talk.chance : sociable(ctx, c) ? 1 : k.background;
    if (!chance(ctx.w.rng, interactionChance(ctx, c) * often)) continue;
    const o = mate && others.includes(mate) ? mate : others[weightedIndex(ctx.w.rng, partnerWeights(ctx, c, others))]!;
    const defs = interactionsFor(ctx, c, o);
    if (!defs.length) continue;
    const def = defs[weightedIndex(ctx.w.rng, defs.map((d) => interactionWeight(ctx, c, o, d)))]!;
    interact(ctx, c, o, def);
  }
}

/** Who they turn to, × (1 + affection and attraction), and more toward someone they're pining for. */
function partnerWeights(ctx: Ctx, c: Contestant, others: Contestant[]): number[] {
  const p = ctx.data.social.partner;
  return others.map((o) => {
    const r = relation(ctx, c, o);
    return Math.max(p.min, 1 + (r.affection / 100) * p.affection + (r.attraction / 10) * p.attraction) * piningMult(ctx, c, o);
  });
}

/**
 * Walking into a corridor or the common room: a word in passing with someone there (another
 * walker, or someone free to talk), from the interactions marked `passing`, without stopping.
 */
export function inPassing(ctx: Ctx, c: Contestant): void {
  if (c.asleep || c.breakdown) return;
  const others = ctx.w.contestants.filter((o) => o !== c && o.room === c.room && !o.asleep && !o.breakdown && (o.activity?.phase === 'walk' || available(ctx, o)));
  if (!others.length || !chance(ctx.w.rng, interactionChance(ctx, c) * ctx.data.social.passing)) return;
  const o = others[weightedIndex(ctx.w.rng, partnerWeights(ctx, c, others))]!;
  if (!c.ledger[o.id]) meet(ctx, c, o);
  const defs = ctx.data.social.interactions.filter((d) => d.passing && !d.glass);
  const weights = defs.map((d) => interactionWeight(ctx, c, o, d));
  if (!weights.some((w) => w > 0)) return;
  interact(ctx, c, o, defs[weightedIndex(ctx.w.rng, weights)]!);
}

/**
 * Traits that work on whoever shares a room, every social round: an Abrasive contestant wears
 * on people; a Teetotaler sours on drunks and a Neat freak on the filthy.
 */
function traitRound(ctx: Ctx): void {
  const tr = ctx.data.traits;
  const drunkAt = ctx.data.booze.stages.find((x) => x.id === tr.drunkFrom)?.at ?? Infinity;
  for (const c of ctx.w.contestants) {
    if (c.asleep) continue;
    const fx = traitFx(ctx.data, c);
    if (!fx.aura && !fx.dislikesDrunk && !fx.dislikesFilthy) continue;
    for (const o of ctx.w.contestants) {
      if (o === c || o.room !== c.room || o.asleep) continue;
      if (fx.aura) feel(ctx, o, c, 'affection', fx.aura, 'grating');
      if (fx.dislikesDrunk && (stageOf(ctx, o)?.at ?? 0) >= drunkAt) feel(ctx, c, o, 'affection', fx.dislikesDrunk, 'drunk');
      if (fx.dislikesFilthy && o.needs.hygiene < tr.filthyBelow) feel(ctx, c, o, 'affection', fx.dislikesFilthy, 'filthy');
    }
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
  if (n.attraction !== undefined && attractionNow(ctx, c, r.attraction, o) < n.attraction) return 0;
  if (n.affection !== undefined && r.affection < n.affection) return 0;
  if (n.labels && !n.labels.includes(r.label)) return 0;
  if (n.flirted && r.flirts === 0) return 0;
  if (n.inventory && c.inventory.length === 0) return 0;
  if ((n.stash && c.snacks <= 0) || (n.theirStash && o.snacks <= 0)) return 0;
  if (!moveAllowed(ctx, c, o, def)) return 0;
  const [lo, hi] = ctx.data.social.factorRange;
  const spice = ctx.data.needs.boredom?.interactions[def.id];
  const deep = talkingWith(ctx, c) === o ? (ctx.data.social.company.talk.weights[def.id] ?? 1) : 1;
  let w = def.weight * deep * (spice ? 1 + spice * boredom(ctx, c) : 1) * moveMult(ctx, c, def.id) * (traitFx(ctx.data, c).interactions[def.id] ?? 1) * moodInteraction(ctx, c, def.id);
  // Some traits change what others do around them (a Peacemaker in the room makes insults rarer).
  for (const x of ctx.w.contestants) {
    if (x !== c && x.room === c.room && !x.asleep) w *= traitFx(ctx.data, x).nearby[def.id] ?? 1;
  }
  if (def.move && def.move !== 'gift' && def.move !== 'breakup') w *= attachedMult(ctx, c, o) * piningMult(ctx, c, o);
  w *= interactionBoost(ctx, c, o, def); // what it would pay, as the meter falls
  for (const s of def.scale) {
    const k = s.k ?? 1;
    let f: number;
    switch (s.by) {
      case 'affection':
        f = 1 + (k * r.affection) / 100;
        break;
      case 'attraction':
        f = attractionNow(ctx, c, r.attraction, o) / 5;
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
      case 'hungry': // ×1 at hunger 50, up to 1 + k when starving
        f = 1 + (k * (50 - c.needs.hunger)) / 50;
        break;
      case 'targetHungry':
        f = 1 + (k * (50 - o.needs.hunger)) / 50;
        break;
      default:
        f = axisFactor(k, axis(ctx, c, s.by));
    }
    w *= clamp(f, lo, hi);
  }
  return w;
}

/** Mood changes how they treat people, both ways: kinder in a good mood, pettier in a bad one. */
export function moodInteraction(ctx: Ctx, c: Contestant, id: string): number {
  const m = ctx.data.personality.mood;
  if (c.mood < m.lowBelow) return m.interactions.low[id] ?? 1;
  if (c.mood > m.highAbove) return m.interactions.high[id] ?? 1;
  return 1;
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
  // A Charmer's warmth lands harder.
  const charm = traitFx(ctx.data, c).charm;
  for (const [dim, v] of Object.entries(def.target)) feel(ctx, o, c, dim as never, dim === 'affection' && v > 0 ? v * charm : v, def.id);
  for (const [n, v] of Object.entries(def.targetGains)) addNeed(o, n as never, v);
  if (def.thought) think(ctx, o, def.thought, c.id);
  // Helping someone feels good, to the kind and the loyal.
  const helped = ctx.data.thoughts.moments.helped;
  if (helped.interactions.includes(def.id)) think(ctx, c, helped.thought, o.id);

  switch (def.move) {
    case 'flirt':
      return flirt(ctx, c, o);
    case 'kiss':
      return kiss(ctx, c, o);
    case 'proposition':
      return proposition(ctx, c, o);
    case 'invite':
      return invite(ctx, c, o);
    case 'exclusive':
      return askExclusive(ctx, c, o);
    case 'breakup':
      return breakUp(ctx, c, o);
    case 'gift':
      return giftDrink(ctx, c, o);
    case 'share_snack':
      return shareSnack(ctx, c, o);
    case 'swipe_snack':
      return swipeSnack(ctx, c, o);
  }
  const e = log(ctx, def.id, [c.id, o.id], c.room);
  looseLips(ctx, c, o, def.id);
  if (def.witnessThought) for (const id of witnessesOf(ctx, e)) think(ctx, ctx.w.contestants.find((x) => x.id === id)!, def.witnessThought, c.id);
  // A Hothead can come out swinging over less than an insult.
  if ((def.fight || traitFx(ctx.data, o).fightOn.includes(def.id)) && chance(ctx.w.rng, fightChance(ctx, o, c)) && !brokenUp(ctx, c, o)) fight(ctx, c, o);
}

/** A Peacemaker in the room may step in before the first punch. Returns whether they did. */
function brokenUp(ctx: Ctx, a: Contestant, b: Contestant): boolean {
  for (const p of ctx.w.contestants) {
    if (p === a || p === b || p.room !== a.room || p.asleep || p.breakdown) continue;
    const odds = traitFx(ctx.data, p).peacemaker;
    if (odds && chance(ctx.w.rng, odds)) {
      log(ctx, 'broke_up_fight', [p.id, a.id, b.id], a.room);
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------------------------
// Flirting

/** Odds a flirt lands: the target's attraction back ÷ 10 × successScale. */
export function flirtOdds(ctx: Ctx, target: Contestant, flirter: Contestant): number {
  return clamp((((rel(target, flirter)?.attraction ?? 0) - grubbiness(ctx, flirter)) / 10) * ctx.data.social.flirt.successScale, 0, 1);
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
 * Chance an insult turns into a fight: chance × the insulted person's volatility and traits
 * (a Hothead's × 2), × the drunker of the two's stage.
 */
export function fightChance(ctx: Ctx, insulted: Contestant, insulter?: Contestant): number {
  const f = ctx.data.social.fight;
  const drunk = Math.max(stageMult(ctx, insulted, 'fight'), insulter ? stageMult(ctx, insulter, 'fight') : 1);
  const fuse = ctx.data.needs.fuse;
  const tired = fuse && insulted.needs.rest < fuse.restBelow ? fuse.fight : 1; // short of sleep, short of temper
  return clamp(f.chance * axisFactor(f.calmK, axis(ctx, insulted, 'calm')) * traitFx(ctx.data, insulted).fight * drunk * tired, 0, 1);
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
 * hurt. Ordinary fights never take health below the floor; a lethal one can kill.
 */
export function brawl(ctx: Ctx, swinger: Contestant, other: Contestant, opts: BrawlOptions): { winner: Contestant; loser: Contestant; killed: boolean } {
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
  const witnesses = ctx.w.contestants.filter((w) => w !== insulter && w !== insulted && canSee(ctx.st, w.room, room) && !w.asleep).map((w) => w.id);
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
  return { winner, loser, killed };
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
export function guestOf(ctx: Ctx, host: Contestant): Contestant | undefined {
  return ctx.w.contestants.find((g) => g.guest?.host === host.id);
}

/**
 * A host asked to share their bed is far less willing with someone they'd rather not sleep beside,
 * and the loyal keep it for whoever they're seeing (the attached factor, as for romance moves).
 * Someone they're seeing (share.partners) is let in even if it means being woken.
 */
export function shareOdds(ctx: Ctx, host: Contestant, c: Contestant): number {
  const partner = ctx.data.needs.sleep.share.partners.includes(rel(host, c)?.label ?? 'none');
  const odds = knockOdds(ctx, host, c, host.asleep && !partner) * attachedMult(ctx, host, c);
  return bedmateFeeling(ctx, host, c) < 0 ? odds * ctx.data.needs.sleep.share.reluctant : odds;
}

/** Buzzes a host. Returns whether the knocker is let in; if so they're now a legal guest. */
export function knock(ctx: Ctx, c: Contestant, host: Contestant, roomId: string, forBed = false): boolean {
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
    odds = forBed ? shareOdds(ctx, host, c) : knockOdds(ctx, host, c);
    yes = chance(ctx.w.rng, odds);
  }
  data.odds = round2(odds);
  data.answer = yes ? 'yes' : 'no';
  log(ctx, 'knock', [c.id, host.id], roomId, data);
  if (other && data.saw) evidence(ctx, c, host, other, 'guest');
  if (yes) c.guest = { room: roomId, host: host.id, since: t };
  else think(ctx, c, forBed && !other ? ctx.data.needs.sleep.share.refused : k.turnedAway, host.id);
  return yes;
}

/**
 * Asks a roommate to share their bed. Odds as for a knock. On a yes they're the roommate's guest
 * for the night (shown back to their own bunk at the wake chime).
 */
export function askToShare(ctx: Ctx, c: Contestant, host: Contestant, roomId: string): boolean {
  const k = ctx.data.social.knock;
  relation(ctx, host, c);
  const last = c.knocked[host.id];
  const pestering = last !== undefined && ctx.w.t - last < k.pesterHours * 60;
  if (pestering) feel(ctx, host, c, 'affection', k.pesterAffection, 'pestered');
  c.knocked[host.id] = ctx.w.t;
  const odds = shareOdds(ctx, host, c);
  const yes = chance(ctx.w.rng, odds);
  log(ctx, 'share_ask', [c.id, host.id], roomId, { odds: round2(odds), asleep: host.asleep, answer: yes ? 'yes' : 'no' });
  if (yes) c.guest = { room: roomId, host: host.id, since: ctx.w.t };
  else think(ctx, c, ctx.data.needs.sleep.share.refused, host.id);
  return yes;
}

/** The pull of the people in a room on someone deciding where to go. */
export function companyPull(ctx: Ctx, c: Contestant, roomId: string): number {
  const k = ctx.data.social.companyPull;
  const fancy = ctx.data.romance.proposition.attraction;
  const privacy = ctx.st.room.get(roomId)!.privacy;
  const clingy = traitFx(ctx.data, c).partnerPull;
  const partners = ctx.data.needs.sleep.share.partners;
  let p = 0;
  let anyone = false;
  for (const o of ctx.w.contestants) {
    if (o === c || (o.activity?.room ?? o.room) !== roomId) continue;
    if (!o.asleep) anyone = true;
    const r = c.ledger[o.id];
    if (!r) continue;
    const up = r.attraction >= fancy ? 1 + k.private * privacy : 1; // up to something
    const x = (r.affection / 100) * k.affection + (r.attraction / 10) * k.attraction * up;
    p += (clingy !== 1 && partners.includes(r.label) ? x * clingy : x) + (r.fear / 100) * k.fear;
  }
  // The lonely go where people are, whoever they are (proposal, fun and social).
  if (anyone) p += k.lonely * needUrgency(ctx.data, c, 'social');
  return p;
}
