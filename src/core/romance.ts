// Romance: kisses, lovin', labels, exclusivity, breakups and betrayal. DESIGN.md Part two,
// Social interactions and romance, and Part one, Attraction, relationships and lovin'.
//
// Labels are beliefs. Each contestant holds their own label for every relationship, and they
// only change through moves (a kiss, lovin', asking to be exclusive, a breakup). When someone
// sees their partner with someone else, their own label decides whether it's betrayal.
// Lovin' is always consensual and always offscreen: two people choose it, and the log says so.
import type { InteractionDef, Label } from '../data/schema.js';
import { begin, endActivity, LOVIN } from './actions.js';
import { axis, moveMult } from './booze.js';
import { canEnter, isNightFor, log, type Ctx } from './context.js';
import { feel, rel, relation } from './ledger.js';
import { axisFactor } from './needs.js';
import { between, chance } from './rng.js';
import { walkMinutes, type ObjectInstance } from './station.js';
import { interact, shareOdds } from './social.js';
import { think } from './thoughts.js';
import type { Contestant } from './types.js';

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const round2 = (x: number) => Math.round(x * 100) / 100;

const ATTACHED: readonly Label[] = ['dating', 'exclusive'];
const JEALOUS: readonly Label[] = ['flirting', 'fling', 'dating', 'ex'];

export function labelOf(a: Contestant, b: Contestant): Label {
  return rel(a, b)?.label ?? 'none';
}

/** Romance moves toward anyone but whoever they're dating are rarer for the loyal. */
export function attachedMult(ctx: Ctx, c: Contestant, o: Contestant): number {
  const attached = Object.entries(c.ledger).some(([id, r]) => id !== o.id && ATTACHED.includes(r.label));
  return attached ? Math.max(0, 1 - (ctx.data.romance.attachedK * c.personality.loyal) / 10) : 1;
}

/** Gates on a move beyond the interaction's own `needs`: privacy for lovin', a reason to break up. */
export function moveAllowed(ctx: Ctx, c: Contestant, o: Contestant, def: InteractionDef): boolean {
  const ro = ctx.data.romance;
  switch (def.move) {
    case 'proposition': {
      // Somewhere they believe is private, or their own bedroom.
      const room = ctx.st.room.get(c.room)!;
      return room.privacy >= ro.proposition.privacy || (room.access === 'occupants' && canEnter(ctx, c, room.id));
    }
    case 'invite':
      // Getting on for bedtime, with a bed for two to go to.
      return isNightFor(ctx, c, ctx.w.t + ro.invite.lead) && bedFor(ctx, c, o) !== null;
    case 'breakup': {
      const r = rel(c, o)!;
      return r.affection <= ro.breakup.affectionBelow || c.thoughts.some((x) => x.id === ro.betrayal.thought && x.about === o.id);
    }
    default:
      return true;
  }
}

/** Odds a kiss lands: their attraction back ÷ 10 × (1 + their affection ÷ 100). */
export function kissOdds(ctx: Ctx, target: Contestant, kisser: Contestant): number {
  const r = rel(target, kisser);
  if (!r) return 0;
  return clamp((r.attraction / 10) * (1 + r.affection / 100) * ctx.data.romance.kiss.successScale, 0, 1);
}

export function kiss(ctx: Ctx, c: Contestant, o: Contestant): void {
  const k = ctx.data.romance.kiss;
  const odds = kissOdds(ctx, o, c);
  if (!chance(ctx.w.rng, odds)) {
    think(ctx, c, k.rebuffed, o.id);
    log(ctx, 'kiss_rebuff', [c.id, o.id], c.room, { odds: round2(odds) });
    return;
  }
  for (const [a, b] of [[c, o], [o, c]] as const) {
    const r = relation(ctx, a, b);
    r.kisses++;
    if (r.label === 'none') r.label = k.label;
    // Enough kisses and the monogamous think they're seeing each other.
    if (r.label === 'flirting' && r.kisses >= k.datingAfter && a.monogamy >= ctx.data.romance.proposition.datingAt) r.label = 'dating';
    think(ctx, a, k.thought, b.id);
  }
  log(ctx, 'kiss', [c.id, o.id], c.room, { odds: round2(odds) });
  aftermath(ctx, c, o, 'kiss');
}

/** Whether the target says yes: they have to want it too. */
export function propositionOdds(ctx: Ctx, target: Contestant, asker: Contestant): number {
  const p = ctx.data.romance.proposition;
  const r = rel(target, asker);
  if (!r || r.attraction < p.attraction || r.affection < p.affection) return 0;
  return clamp((r.attraction / 10) * p.successScale * attachedMult(ctx, target, asker), 0, 1);
}

export function proposition(ctx: Ctx, c: Contestant, o: Contestant): void {
  const p = ctx.data.romance.proposition;
  const odds = propositionOdds(ctx, o, c);
  if (!chance(ctx.w.rng, odds)) {
    think(ctx, c, p.turnedDown, o.id);
    log(ctx, 'turned_down', [c.id, o.id], c.room, { odds: round2(odds) });
    return;
  }
  // The bed is the default; the bold (or drunk) sometimes don't bother.
  const bed = bedFor(ctx, c, o);
  const here = chance(ctx.w.rng, hereOdds(ctx, c, o, !!bed));
  if (here || !bed) {
    if (here) lovin(ctx, c, o);
    else log(ctx, 'rain_check', [c.id, o.id], c.room); // nowhere to go
    return;
  }
  lovin(ctx, c, o, bed);
}

/** How ready someone is to skip the bed: shameless, brave and drunk help. */
export function boldness(ctx: Ctx, c: Contestant): number {
  const h = ctx.data.romance.proposition.here;
  return Math.max(0, axisFactor(h.modestyK, c.modesty)) * Math.max(0, axisFactor(h.braveK, axis(ctx, c, 'brave'))) * moveMult(ctx, c, 'here');
}

/** The odds a couple with a yes do it right where they are: both have to be up for it. */
export function hereOdds(ctx: Ctx, c: Contestant, o: Contestant, bedToGo: boolean): number {
  const h = ctx.data.romance.proposition.here;
  return clamp((bedToGo ? h.chance : h.noBed) * boldness(ctx, c) * boldness(ctx, o), 0, 1);
}

/**
 * The bed they head for: either one's, if it has room for two and nobody else in it, picked by
 * the room's privacy, the walk and who else is there. Null when neither has a bed to go to.
 */
export function bedFor(ctx: Ctx, c: Contestant, o: Contestant): ObjectInstance | null {
  const b = ctx.data.romance.proposition.bed;
  if (c.confined || o.confined) return null;
  let best: ObjectInstance | null = null;
  let score = -Infinity;
  for (const owner of [c, o]) {
    if (owner.bed === null || (owner === o && c.bed === o.bed)) continue;
    const bed = ctx.st.object.get(owner.bed)!;
    if (bed.capacity < 2 || ctx.w.objects[bed.id]!.some((id) => id !== c.id && id !== o.id)) continue; // not the couch
    const room = ctx.st.room.get(bed.room)!;
    const crowd = ctx.w.contestants.filter((x) => x !== c && x !== o && (x.activity?.room ?? x.room) === bed.room).length;
    const s = room.privacy - b.walkCost * (walkMinutes(ctx.st, c.room, bed.room) + walkMinutes(ctx.st, o.room, bed.room)) - b.crowd * crowd;
    if (s > score) [best, score] = [bed, s];
  }
  return best;
}

/**
 * Lumps under the covers. Both stop what they're doing and head for the bed (whoever's bed it
 * isn't is let in as a guest), or start right here. It begins when both are there (lovinArrive).
 */
export function lovin(ctx: Ctx, c: Contestant, o: Contestant, bed: ObjectInstance | null = null): void {
  const [lo, hi] = ctx.data.romance.proposition.minutes;
  const length = Math.round(between(ctx.w.rng, lo, hi));
  const room = bed ? bed.room : c.room;
  for (const a of [c, o]) endActivity(ctx, a, 'interrupted');
  if (bed) {
    const owner = c.bed === bed.id ? c : o;
    const other = owner === c ? o : c;
    if (!canEnter(ctx, other, room)) other.guest = { room, host: owner.id, since: ctx.w.t };
    log(ctx, 'off_to_bed', [c.id, o.id], c.room, { bed: bed.id, to: room });
  }
  for (const [a, b] of [[c, o], [o, c]] as const) begin(ctx, a, { action: LOVIN, object: bed?.id ?? null, room, partner: b.id, length });
}

/**
 * Getting into a bed at night with someone already in it: before they sleep, one may turn to the
 * other. Someone who wants them too (the proposition's bars) asks with odds bedtime.chance, × asleep
 * if the other has dropped off, and the other answers as to a proposition. On a yes it's lovin'
 * right there, then sleep. Not twice in a night: a sleep after lovin' remembers the partner.
 */
export function bedtime(ctx: Ctx, c: Contestant): void {
  const a = c.activity!;
  if (!a.object || a.partner || !isNightFor(ctx, c, ctx.w.t)) return;
  const bt = ctx.data.romance.bedtime;
  const mate = bedmate(ctx, c, a.object);
  if (!mate || mate.activity!.partner) return;
  const dozed = mate.asleep && ctx.w.t - mate.activity!.arriveAt >= bt.doze;
  inBed(ctx, c, mate, a.object, bt.chance * (dozed ? bt.asleep : 1));
}

/**
 * Waking up after a night beside someone still in the bed: the same again, with odds
 * bedtime.morning. Then they get up.
 */
export function morning(ctx: Ctx, c: Contestant, bed: string): void {
  const mate = bedmate(ctx, c, bed);
  if (mate) inBed(ctx, c, mate, bed, ctx.data.romance.bedtime.morning);
}

/** Whoever else is in this bed, settled in (not walking over, not mid-lovin'). */
function bedmate(ctx: Ctx, c: Contestant, bed: string): Contestant | undefined {
  return ctx.w.contestants.find((o) => o !== c && o.activity?.object === bed && o.activity.phase === 'do' && o.activity.action !== LOVIN);
}

/** In a bed together: someone who wants them (the proposition's bars) asks with odds `ask`. */
function inBed(ctx: Ctx, c: Contestant, mate: Contestant, bed: string, ask: number): void {
  const p = ctx.data.romance.proposition;
  const r = rel(c, mate);
  if (!r || r.attraction < p.attraction || r.affection < p.affection) return;
  if (!chance(ctx.w.rng, ask * moveMult(ctx, c, 'proposition'))) return;
  const odds = propositionOdds(ctx, mate, c);
  if (!chance(ctx.w.rng, odds)) {
    think(ctx, c, p.turnedDown, mate.id);
    log(ctx, 'turned_down', [c.id, mate.id], c.room, { odds: round2(odds), where: 'bed' });
    return;
  }
  lovin(ctx, c, mate, ctx.st.object.get(bed)!);
}

/**
 * Spend the night? Near bedtime, asking someone to come to bed: the best bed for two, as for lovin'.
 * They answer as to a request to share a bed. On a yes both head there to sleep (whoever's bed it
 * isn't is let in as a guest), and getting in together is where bedtime lovin' happens.
 */
export function invite(ctx: Ctx, c: Contestant, o: Contestant): void {
  const bed = bedFor(ctx, c, o)!;
  const odds = shareOdds(ctx, o, c);
  if (!chance(ctx.w.rng, odds)) {
    think(ctx, c, ctx.data.needs.sleep.share.refused, o.id);
    log(ctx, 'invite', [c.id, o.id], c.room, { odds: round2(odds), answer: 'no' });
    return;
  }
  const owner = c.bed === bed.id ? c : o;
  const other = owner === c ? o : c;
  for (const a of [c, o]) endActivity(ctx, a, 'interrupted');
  if (!canEnter(ctx, other, bed.room)) other.guest = { room: bed.room, host: owner.id, since: ctx.w.t };
  log(ctx, 'invite', [c.id, o.id], c.room, { odds: round2(odds), answer: 'yes', bed: bed.id, to: bed.room });
  const sleep = bed.actions.find((d) => d.kind === 'sleep')!;
  for (const a of [c, o]) begin(ctx, a, { action: sleep.id, object: bed.id, room: bed.room });
}

/** Arriving for lovin': once both are there, it starts. */
export function lovinArrive(ctx: Ctx, c: Contestant): void {
  const a = c.activity!;
  const o = ctx.w.contestants.find((x) => x.id === a.partner);
  const b = o?.activity;
  if (!o || b?.action !== LOVIN || b.partner !== c.id || b.phase !== 'do') return;
  const end = ctx.w.t + Math.max(a.length ?? 0, b.length ?? 0);
  a.endAt = end;
  b.endAt = end;
  consummate(ctx, o, c);
}

/** It's happening: labels, bonds and thoughts; sleepers kept up; anyone watching sees it. */
function consummate(ctx: Ctx, c: Contestant, o: Contestant): void {
  const p = ctx.data.romance.proposition;
  const room = c.room;
  const first = relation(ctx, c, o).lovin === 0;
  const couple = ATTACHED.includes(labelOf(c, o)) && ATTACHED.includes(labelOf(o, c));
  for (const [a, b] of [[c, o], [o, c]] as const) {
    const r = relation(ctx, a, b);
    // Each time before counts toward thinking it's more than a fling.
    const dating = a.monogamy + r.lovin * p.datingPerLovin >= p.datingAt;
    r.lovin++;
    if (r.label === 'none' || r.label === 'flirting' || r.label === 'ex' || (r.label === 'fling' && dating)) r.label = dating ? 'dating' : 'fling';
    feel(ctx, a, b, 'affection', p.bond, 'lovin');
    think(ctx, a, p.thought, b.id);
  }
  for (const x of ctx.w.contestants) if (x !== c && x !== o && x.room === room && x.asleep) think(ctx, x, p.disturbed);
  const inBed = c.activity?.object != null;
  const exposed = ctx.st.room.get(room)!.access !== 'occupants'; // outside a bedroom: a show
  log(ctx, 'lovin', [c.id, o.id], room, { first, couple, minutes: (c.activity?.endAt ?? ctx.w.t) - ctx.w.t, where: inBed ? 'bed' : exposed ? 'public' : 'bedroom' });
  if (exposed) for (const x of ctx.w.contestants) if (x !== c && x !== o && x.room === room && !x.asleep) think(ctx, x, p.here.witnessThought, c.id);
  aftermath(ctx, c, o, 'lovin');
}

/** After a kiss or lovin': guilt for anyone cheating, and evidence for anyone who saw. */
function aftermath(ctx: Ctx, b: Contestant, c: Contestant, what: string): void {
  const ro = ctx.data.romance;
  for (const [x, partner] of [[b, c], [c, b]] as const) {
    for (const [id, r] of Object.entries(x.ledger)) if (id !== partner.id && r.label === 'exclusive') think(ctx, x, ro.guilty, id);
  }
  for (const a of ctx.w.contestants) {
    if (a === b || a === c || a.room !== b.room || a.asleep) continue;
    evidence(ctx, a, b, c, what);
    evidence(ctx, a, c, b, what);
  }
}

/** A sees B with C. A's label for B decides: betrayal if A believed they were exclusive, else jealousy. */
export function evidence(ctx: Ctx, a: Contestant, b: Contestant, c: Contestant, what: string): void {
  const ro = ctx.data.romance;
  const label = labelOf(a, b);
  if (label === 'exclusive') {
    feel(ctx, a, b, 'affection', ro.betrayal.affection, 'betrayal');
    think(ctx, a, ro.betrayal.thought, b.id);
    log(ctx, 'betrayal', [a.id, b.id, c.id], a.room, { what });
    const sm = ctx.data.social.interactions.find((d) => d.id === 'insult');
    if (sm && a.room === b.room && !b.asleep && chance(ctx.w.rng, ro.betrayal.confront)) interact(ctx, a, b, sm);
  } else if (JEALOUS.includes(label)) {
    feel(ctx, a, b, 'affection', ro.jealousy.affection, 'jealousy');
    think(ctx, a, ro.jealousy.thought, b.id);
    log(ctx, 'jealous', [a.id, b.id, c.id], a.room, { what, label });
  }
}

/** Odds of a yes to exclusivity: their attraction, monogamy and loyalty. */
export function exclusiveOdds(ctx: Ctx, target: Contestant, asker: Contestant): number {
  const r = rel(target, asker);
  if (!r) return 0;
  return clamp((r.attraction / 10) * (0.5 + target.monogamy / 10) * axisFactor(ctx.data.romance.exclusive.loyalK, target.personality.loyal), 0, 1);
}

/** The chance a yes is privately a fling: (10 − honest) × (10 − monogamy) ÷ 100. */
export function secretFlingOdds(target: Contestant): number {
  return ((10 - target.personality.honest) * (10 - target.monogamy)) / 100;
}

export function askExclusive(ctx: Ctx, c: Contestant, o: Contestant): void {
  const ex = ctx.data.romance.exclusive;
  const odds = exclusiveOdds(ctx, o, c);
  if (!chance(ctx.w.rng, odds)) {
    think(ctx, c, ex.refused, o.id);
    log(ctx, 'exclusive_refused', [c.id, o.id], c.room, { odds: round2(odds) });
    return;
  }
  const secretly = chance(ctx.w.rng, secretFlingOdds(o));
  relation(ctx, c, o).label = 'exclusive';
  relation(ctx, o, c).label = secretly ? 'fling' : 'exclusive';
  think(ctx, c, ex.thought, o.id);
  if (!secretly) think(ctx, o, ex.thought, c.id);
  log(ctx, 'exclusive', [c.id, o.id], c.room, { odds: round2(odds), secretly });
}

export function breakUp(ctx: Ctx, c: Contestant, o: Contestant): void {
  const from = labelOf(c, o);
  relation(ctx, c, o).label = 'ex';
  relation(ctx, o, c).label = 'ex';
  think(ctx, o, ctx.data.romance.breakup.dumped, c.id);
  log(ctx, 'breakup', [c.id, o.id], c.room, { from });
}
