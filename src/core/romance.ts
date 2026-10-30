// Romance: kisses, lovin', labels, exclusivity, breakups and betrayal. DESIGN.md Part two,
// Social interactions and romance, and Part one, Attraction, relationships and lovin'.
//
// Labels are beliefs. Each contestant holds their own label for every relationship, and they
// only change through moves (a kiss, lovin', asking to be exclusive, a breakup). When someone
// sees their partner with someone else, their own label decides whether it's betrayal.
// Lovin' is always consensual and always offscreen: two people choose it, and the log says so.
import type { InteractionDef, Label } from '../data/schema.js';
import { begin, endActivity, LOVIN } from './actions.js';
import { agreeMult, attractionNow, axis, moveMult, stageOf } from './booze.js';
import { canEnter, isNightFor, log, type Ctx } from './context.js';
import { feel, rel, relation } from './ledger.js';
import { axisFactor } from './needs.js';
import { between, chance, pick } from './rng.js';
import { canHear, canSee, nextDoor, walkMinutes, type ObjectInstance } from './station.js';
import { interact, shareOdds } from './social.js';
import { think } from './thoughts.js';
import { traitFx } from './traits.js';
import type { Contestant } from './types.js';

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const round2 = (x: number) => Math.round(x * 100) / 100;

const ATTACHED: readonly Label[] = ['dating', 'exclusive'];
const JEALOUS: readonly Label[] = ['flirting', 'fling', 'dating', 'ex'];

export function labelOf(a: Contestant, b: Contestant): Label {
  return rel(a, b)?.label ?? 'none';
}

/** Romance moves toward anyone but whoever they're dating are rarer for the loyal (less so for a Heartbreaker). */
export function attachedMult(ctx: Ctx, c: Contestant, o: Contestant): number {
  const attached = Object.entries(c.ledger).some(([id, r]) => id !== o.id && ATTACHED.includes(r.label));
  return attached ? Math.min(1, Math.max(0, 1 - (ctx.data.romance.attachedK * c.personality.loyal) / 10) * traitFx(ctx.data, c).attached) : 1;
}

/** Gates on a move beyond the interaction's own `needs`: privacy for lovin', a reason to break up. */
export function moveAllowed(ctx: Ctx, c: Contestant, o: Contestant, def: InteractionDef): boolean {
  const ro = ctx.data.romance;
  switch (def.move) {
    case 'proposition': {
      // Somewhere they believe is private, or their own bedroom, with a kiss or two behind them,
      // and not in the middle of the ceremony.
      const room = ctx.st.room.get(c.room)!;
      if (busy(ctx, c) || busy(ctx, o) || (rel(c, o)?.kisses ?? 0) < ro.proposition.kissesFirst) return false;
      return room.privacy >= ro.proposition.privacy || (room.access === 'occupants' && canEnter(ctx, c, room.id));
    }
    case 'invite':
      // Getting on for bedtime, with a bed for two to go to, once the ceremony is over.
      return !busy(ctx, c) && !busy(ctx, o) && isNightFor(ctx, c, ctx.w.t + ro.invite.lead) && bedFor(ctx, c, o) !== null;
    case 'breakup': {
      const r = rel(c, o)!;
      return r.affection <= ro.breakup.affectionBelow || c.thoughts.some((x) => x.id === ro.betrayal.thought && x.about === o.id);
    }
    default:
      return true;
  }
}

/** At something nobody slips away from to go to bed (romance.yaml notDuring): the ceremony, the daily event, a trial. */
function busy(ctx: Ctx, c: Contestant): boolean {
  return !!c.activity && ctx.data.romance.notDuring.includes(c.activity.action);
}

/** Odds a kiss lands: their attraction back ÷ 10 × (1 + their affection ÷ 100). */
export function kissOdds(ctx: Ctx, target: Contestant, kisser: Contestant): number {
  const r = rel(target, kisser);
  if (!r) return 0;
  return clamp((attractionNow(ctx, target, r.attraction, kisser) / 10) * (1 + r.affection / 100) * ctx.data.romance.kiss.successScale * agreeMult(ctx, target), 0, 1);
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
    // Enough kisses and the monogamous think they're seeing each other; a Romantic always does.
    const romantic = traitFx(ctx.data, a).datingAfter;
    const dating = romantic !== undefined ? r.kisses >= romantic : r.kisses >= k.datingAfter && a.monogamy >= ctx.data.romance.proposition.datingAt;
    if (r.label === 'flirting' && dating) r.label = 'dating';
    think(ctx, a, k.thought, b.id);
  }
  log(ctx, 'kiss', [c.id, o.id], c.room, { odds: round2(odds) });
  aftermath(ctx, c, o, 'kiss');
}

/** Whether the target says yes: they have to want it too. */
export function propositionOdds(ctx: Ctx, target: Contestant, asker: Contestant): number {
  const p = ctx.data.romance.proposition;
  const r = rel(target, asker);
  const attraction = r ? attractionNow(ctx, target, r.attraction, asker) : 0;
  if (!r || attraction < p.attraction || r.affection < p.affection) return 0;
  return clamp((attraction / 10) * p.successScale * attachedMult(ctx, target, asker) * agreeMult(ctx, target), 0, 1);
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

/**
 * In a bed together: someone who wants them (the proposition's bars) asks with odds `ask`. A pair
 * who haven't kissed yet (romance.yaml proposition.kissesFirst) get a goodnight kiss attempt instead.
 */
function inBed(ctx: Ctx, c: Contestant, mate: Contestant, bed: string, ask: number): void {
  const p = ctx.data.romance.proposition;
  const r = rel(c, mate);
  if (!r || r.attraction < p.attraction || r.affection < p.affection) return;
  if (!chance(ctx.w.rng, ask * moveMult(ctx, c, 'proposition'))) return;
  if (r.kisses < p.kissesFirst) {
    kiss(ctx, c, mate);
    return;
  }
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
  // Asleep in the room or next door, it keeps them up; awake next door, they hear it, and know.
  const walls = nextDoor(ctx.st, room);
  for (const x of ctx.w.contestants) {
    if (x === c || x === o) continue;
    if (x.asleep && (x.room === room || walls.includes(x.room))) think(ctx, x, p.disturbed);
    else if (!x.asleep && walls.includes(x.room)) {
      think(ctx, x, p.heard, c.id);
      log(ctx, 'overheard', [x.id, c.id, o.id], x.room, { from: room });
      remember(ctx, x, c, o, 'lovin');
      evidence(ctx, x, c, o, 'lovin');
      evidence(ctx, x, o, c, 'lovin');
    }
  }
  const inBed = c.activity?.object != null;
  const exposed = ctx.st.room.get(room)!.access !== 'occupants'; // outside a bedroom: a show
  log(ctx, 'lovin', [c.id, o.id], room, { first, couple, minutes: (c.activity?.endAt ?? ctx.w.t) - ctx.w.t, where: inBed ? 'bed' : exposed ? 'public' : 'bedroom' });
  if (exposed) for (const x of ctx.w.contestants) if (x !== c && x !== o && canSee(ctx.st, x.room, room) && !x.asleep) think(ctx, x, p.here.witnessThought, c.id);
  aftermath(ctx, c, o, 'lovin');
}

/** After a kiss or lovin': guilt for anyone cheating, and evidence for anyone who saw. */
function aftermath(ctx: Ctx, b: Contestant, c: Contestant, what: string): void {
  const ro = ctx.data.romance;
  for (const [x, partner] of [[b, c], [c, b]] as const) {
    for (const [id, r] of Object.entries(x.ledger)) if (id !== partner.id && r.label === 'exclusive') think(ctx, x, ro.guilty, id);
  }
  remember(ctx, b, b, c, what);
  remember(ctx, c, b, c, what);
  for (const a of ctx.w.contestants) {
    if (a === b || a === c || !canSee(ctx.st, a.room, b.room) || a.asleep) continue;
    remember(ctx, a, b, c, what);
    evidence(ctx, a, b, c, what);
    evidence(ctx, a, c, b, what);
  }
}

/** `x` now knows that `who` and `other` got together (romance.yaml gossip): the last few things, for a while. */
export function remember(ctx: Ctx, x: Contestant, who: Contestant, other: Contestant, what: string): void {
  const g = ctx.data.romance.gossip;
  const t = ctx.w.t;
  x.seen = x.seen.filter((s) => s.t > t - g.hours * 60 && !((s.who === who.id && s.with === other.id) || (s.who === other.id && s.with === who.id)));
  x.seen.push({ who: who.id, with: other.id, what, t });
  if (x.seen.length > g.remember) x.seen.shift();
}

/** Hearing it counts as seeing it: `x` learns about the pair, both ways round. */
export function tell(ctx: Ctx, x: Contestant, who: Contestant, other: Contestant, what: string): void {
  remember(ctx, x, who, other, what);
  evidence(ctx, x, who, other, what);
  evidence(ctx, x, other, who, what);
}

/** Whether `x` already knows about this pair. */
export function knows(x: Contestant, a: string, b: string): boolean {
  return x.seen.some((s) => (s.who === a && s.with === b) || (s.who === b && s.with === a));
}

/** The latest thing `c` knows about `target` and someone else, if they're still aboard. */
export function latestAbout(ctx: Ctx, c: Contestant, target: Contestant): [Contestant, Contestant] | null {
  for (let i = c.seen.length - 1; i >= 0; i--) {
    const s = c.seen[i]!;
    if (s.who !== target.id && s.with !== target.id) continue;
    const other = ctx.w.contestants.find((o) => o.id === (s.who === target.id ? s.with : s.who));
    if (other && other !== c) return [target, other];
  }
  return null;
}

/**
 * Loose lips, after a chat (romance.yaml gossip.interactions): drink makes them confess their own
 * cheating to the one they're cheating on, or blurt something they know about someone else,
 * the juiciest first (about someone the listener is involved with). Sober, the playful and the
 * dishonest gossip a little too.
 */
export function looseLips(ctx: Ctx, c: Contestant, o: Contestant, id: string): void {
  const ro = ctx.data.romance;
  if (!ro.gossip.interactions.includes(id)) return;
  const st = stageOf(ctx, c) ?? { id: 'sober', lips: ro.gossip.sober * Math.max(0, 1 + c.personality.playful / 10 - c.personality.honest / 10), confess: 0 };
  const alive = (x: string) => ctx.w.contestants.find((k) => k.id === x);
  if (st.confess && c.thoughts.some((x) => x.id === ro.guilty && x.about === o.id) && chance(ctx.w.rng, st.confess)) {
    const mine = [...c.seen].reverse().find((s) => (s.who === c.id || s.with === c.id) && s.who !== o.id && s.with !== o.id && !knows(o, s.who, s.with) && alive(s.who === c.id ? s.with : s.who));
    if (mine) {
      const other = alive(mine.who === c.id ? mine.with : mine.who)!;
      c.thoughts = c.thoughts.filter((x) => !(x.id === ro.guilty && x.about === o.id));
      log(ctx, 'confession', [c.id, o.id, other.id], c.room, { stage: st.id });
      tell(ctx, o, c, other, 'confession');
      return;
    }
  }
  if (!st.lips || !chance(ctx.w.rng, st.lips)) return;
  const known = c.seen.filter((s) => s.who !== c.id && s.with !== c.id && s.who !== o.id && s.with !== o.id && !knows(o, s.who, s.with) && alive(s.who) && alive(s.with));
  if (!known.length) return;
  const juicy = known.filter((s) => labelOf(o, alive(s.who)!) !== 'none' || labelOf(o, alive(s.with)!) !== 'none');
  const s = pick(ctx.w.rng, juicy.length ? juicy : known);
  const [who, other] = [alive(s.who)!, alive(s.with)!];
  log(ctx, 'blab', [c.id, o.id, who.id, other.id], c.room, { stage: st.id, juicy: juicy.length > 0 });
  tell(ctx, o, who, other, 'gossip');
}

/** A scene: everyone here hears what `target` did, from someone falling apart in front of them. */
export function airIt(ctx: Ctx, c: Contestant, target: Contestant): void {
  const known = latestAbout(ctx, c, target);
  if (!known) return;
  const [who, other] = known;
  const heard = ctx.w.contestants.filter((x) => x !== c && x !== who && x !== other && canHear(ctx.st, x.room, c.room) && !x.asleep);
  log(ctx, 'scene', [c.id, who.id, other.id], c.room, { heard: heard.map((x) => x.id) });
  for (const x of heard) tell(ctx, x, who, other, 'scene');
}

/** Pouring it all out to a friend: the latest thing they know about someone else spills too. */
export function pourOut(ctx: Ctx, c: Contestant, friend: Contestant): void {
  const known = c.seen.filter((s) => s.who !== c.id && s.with !== c.id && s.who !== friend.id && s.with !== friend.id && !knows(friend, s.who, s.with));
  if (!known.length) return;
  const s = known[known.length - 1]!;
  const who = ctx.w.contestants.find((k) => k.id === s.who);
  const other = ctx.w.contestants.find((k) => k.id === s.with);
  if (!who || !other) return;
  log(ctx, 'blab', [c.id, friend.id, who.id, other.id], c.room, { venting: true });
  tell(ctx, friend, who, other, 'gossip');
}

/**
 * A sees B with C. A's label for B decides: betrayal if A believed they were exclusive, else
 * jealousy, if A still cares about B. Either way A turns on the rival, C; a jealous A also pines
 * for B and goes after them harder.
 */
export function evidence(ctx: Ctx, a: Contestant, b: Contestant, c: Contestant, what: string): void {
  const ro = ctx.data.romance;
  const j = ro.jealousy;
  const label = labelOf(a, b);
  if (label === 'exclusive') {
    feel(ctx, a, b, 'affection', ro.betrayal.affection, 'betrayal');
    think(ctx, a, ro.betrayal.thought, b.id);
    log(ctx, 'betrayal', [a.id, b.id, c.id], a.room, { what });
    resent(ctx, a, c);
    confront(ctx, a, b, traitFx(ctx.data, a).confront ?? ro.betrayal.confront);
  } else if (JEALOUS.includes(label)) {
    const r = rel(a, b)!;
    if (r.affection < j.cares.affection || r.attraction < j.cares.attraction) return;
    // Seeing it again soon after doesn't start it over.
    const hours = ctx.data.thoughts.thoughts[j.thought]!.hours;
    if (a.thoughts.some((x) => x.id === j.thought && x.about === c.id && x.until - hours * 60 > ctx.w.t - j.again * 60)) return;
    feel(ctx, a, b, 'affection', j.affection, 'jealousy');
    resent(ctx, a, c);
    think(ctx, a, j.pining.thought, b.id);
    log(ctx, 'jealous', [a.id, b.id, c.id], a.room, { what, label });
    // Only the Jealous confront over mere jealousy.
    const always = traitFx(ctx.data, a).confront;
    if (always) confront(ctx, a, b, always);
  }
}

/** A turns on the rival: a grudge (the jealous thought, about them) that hits harder the less kind A is. */
function resent(ctx: Ctx, a: Contestant, rival: Contestant): void {
  const j = ctx.data.romance.jealousy;
  think(ctx, a, j.thought, rival.id);
  feel(ctx, a, rival, 'affection', j.rival.affection * Math.max(0, axisFactor(j.rival.kindK, axis(ctx, a, 'kind'))), 'rival');
}

/**
 * How much harder A goes after B while pining for them (romance.yaml jealousy.pining): × boost,
 * scaled by monogamy, so the monogamous fight to win them back and the rest mostly resent.
 */
export function piningMult(ctx: Ctx, a: Contestant, b: Contestant): number {
  const p = ctx.data.romance.jealousy.pining;
  if (!a.thoughts.some((x) => x.id === p.thought && x.about === b.id)) return 1;
  return Math.max(1, 1 + (p.boost - 1) * axisFactor(p.monogamyK, a.monogamy));
}

/** Having it out: an insult to their face, if they're both here and awake. */
function confront(ctx: Ctx, a: Contestant, b: Contestant, odds: number): void {
  const sm = ctx.data.social.interactions.find((d) => d.id === 'insult');
  if (sm && a.room === b.room && !b.asleep && chance(ctx.w.rng, odds)) interact(ctx, a, b, sm);
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
