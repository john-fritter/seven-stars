// The daily event: a cage match, a dance-off or The Button. DESIGN.md Part two, The Wheel and the
// daily event. The format rotates, never the same twice in a row, unless the Wheel booked a match.
// Everyone is summoned; whoever isn't taking part watches.
import { EVENT } from './actions.js';
import { axis } from './booze.js';
import { dayOf, log, type Ctx } from './context.js';
import { feel } from './ledger.js';
import { addNeed, axisFactor } from './needs.js';
import { between, chance, pick, shuffle } from './rng.js';
import { dress } from './schedule.js';
import { addMeter } from './scoring.js';
import { rollCall } from './show.js';
import { brawl } from './social.js';
import { think } from './thoughts.js';
import type { Booking, Contestant } from './types.js';
import { trainedEdge } from './wants.js';

const byId = (ctx: Ctx, id: string) => ctx.w.contestants.find((c) => c.id === id);
const round2 = (x: number) => Math.round(x * 100) / 100;
const alive = (ctx: Ctx, ids: string[]) => ids.map((id) => byId(ctx, id)).filter((c) => c !== undefined);

/** The slot opens: the Wheel's booking if both are still alive, otherwise the next format. */
export function openEvent(ctx: Ctx): void {
  const show = ctx.w.show;
  let b: Booking | null = show.booked;
  show.booked = null;
  if (b && !b.actors.every((id) => byId(ctx, id))) {
    log(ctx, 'booking_cancelled', b.actors.filter((id) => byId(ctx, id)), undefined, { format: b.format });
    b = null;
  }
  if (!b) {
    const formats = ctx.data.events.rotation.filter((f) => f !== show.lastFormat);
    b = { format: pick(ctx.w.rng, formats), actors: [], sudden: false, prize: false };
  }
  const room = ctx.data.events[b.format as 'cage_match'].room;
  show.event = { ...b, day: dayOf(ctx.w.t), room };
  show.lastFormat = b.format;
  log(ctx, 'event_start', [...b.actors], room, { format: b.format, ...(b.sudden ? { sudden: true } : {}), ...(b.prize ? { prize: true } : {}) });
}

/** Today's event, while its slot is open. */
export function eventToday(ctx: Ctx) {
  const ev = ctx.w.show.event;
  return ev && ev.day === dayOf(ctx.w.t) ? ev : null;
}

/** Whoever came is in the room for it now; anyone else skipped it. */
export function resolveEvent(ctx: Ctx): void {
  const ev = eventToday(ctx);
  if (!ev) return;
  const here = rollCall(ctx, EVENT, ev.room, 'skipped_event').filter((c) => !c.confined && !c.breakdown && c.room === ev.room);
  if (ev.format === 'cage_match') cageMatch(ctx, here);
  else if (ev.format === 'dance_off') danceOff(ctx, here);
  else button(ctx, here);
}

/** Watchers get fun. */
function watch(ctx: Ctx, here: Contestant[], taking: Contestant[], fun: number): void {
  for (const c of here) if (!taking.includes(c) && !c.asleep) addNeed(c, 'fun', fun);
}

const pairKey = (a: Contestant, b: Contestant) => (a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`);

/**
 * The booked pair, whoever of them turned up; or the two who like each other least, counting
 * each cage match they've already fought this season as `rematch` more affection, so the cage
 * doesn't rerun the same feud every few days.
 */
export function cagePair(ctx: Ctx, here: Contestant[]): Contestant[] {
  const ev = ctx.w.show.event!;
  if (ev.actors.length) return alive(ctx, ev.actors); // one of them may have died since the slot opened
  return leastFond(ctx, here);
}

/** The two who like each other least, a past cage match counting as `rematch` more affection. */
function leastFond(ctx: Ctx, here: Contestant[]): Contestant[] {
  const rematch = ctx.data.events.cage_match.rematch;
  let best: Contestant[] = [];
  let low = Infinity;
  for (const a of shuffle(ctx.w.rng, [...here])) {
    for (const b of here) {
      if (a.id >= b.id) continue;
      const mutual = (a.ledger[b.id]?.affection ?? 0) + (b.ledger[a.id]?.affection ?? 0) + rematch * (ctx.w.show.cage[pairKey(a, b)] ?? 0);
      if (mutual < low) [best, low] = [[a, b], mutual];
    }
  }
  return best;
}

/**
 * Tomorrow's bill (activities.yaml bill), announced at the ceremony when the Wheel hasn't booked
 * the slot: the next format and who's in it, so the booked can train or rehearse.
 */
export function announceBill(ctx: Ctx): void {
  const show = ctx.w.show;
  if (show.booked) return;
  const format = pick(ctx.w.rng, ctx.data.events.rotation.filter((f) => f !== show.lastFormat));
  const pool = ctx.w.contestants.filter((c) => !c.confined);
  let actors: Contestant[] = [];
  if (format === 'cage_match') actors = leastFond(ctx, pool);
  else if (format === 'dance_off') {
    const [lo, hi] = ctx.data.events.dance_off.dancers;
    const n = Math.min(pool.length, lo + Math.floor(between(ctx.w.rng, 0, hi - lo + 1)));
    actors = shuffle(ctx.w.rng, [...pool]).slice(0, n);
  }
  if (format !== 'button' && actors.length < 2) return; // not enough people; the slot is drawn on the day
  show.booked = { format, actors: actors.map((c) => c.id), sudden: false, prize: false };
  log(ctx, 'bill', show.booked.actors, undefined, { format, day: dayOf(ctx.w.t) + 1 });
}

/** Two contestants fight in the cage: no infraction, nobody dies. A winning challenger takes the prize. */
function cageMatch(ctx: Ctx, here: Contestant[]): void {
  const ev = ctx.w.show.event!;
  const e = ctx.data.events.cage_match;
  const pair = cagePair(ctx, here);
  if (pair.length < 2) {
    log(ctx, 'event_cancelled', pair.map((c) => c.id), ev.room, { format: ev.format });
    return;
  }
  const [a, b] = pair as [Contestant, Contestant];
  const showed = (c: Contestant) => here.includes(c);
  let winner: Contestant;
  let loser: Contestant;
  if (showed(a) && showed(b)) {
    ({ winner, loser } = brawl(ctx, a, b, {}));
  } else if (showed(a) || showed(b)) {
    [winner, loser] = showed(a) ? [a, b] : [b, a]; // a no-show forfeits
  } else {
    log(ctx, 'event_cancelled', [a.id, b.id], ev.room, { format: ev.format });
    return;
  }
  log(ctx, 'cage_match', [winner.id, loser.id], ev.room, { winner: winner.id, loser: loser.id, forfeit: !(showed(a) && showed(b)) });
  const k = pairKey(a, b);
  ctx.w.show.cage[k] = (ctx.w.show.cage[k] ?? 0) + 1;
  watch(ctx, here, [a, b], e.watchFun);
  // The Wheel's prize: a challenger who beats a higher rank takes their rank and room.
  if (ev.prize && winner.id === ev.actors[0] && winner.rank !== null && loser.rank !== null && winner.rank > loser.rank) swapRanks(ctx, winner, loser);
}

/** Two contestants trade rank, bed and clothes until the next ceremony. */
export function swapRanks(ctx: Ctx, up: Contestant, down: Contestant): void {
  const t = ctx.data.ranks.thoughts;
  [up.rank, down.rank] = [down.rank, up.rank];
  [up.bed, down.bed] = [down.bed, up.bed];
  for (const c of [up, down]) dress(ctx, c);
  think(ctx, up, t.up);
  think(ctx, down, t.down);
  log(ctx, 'rank_swap', [up.id, down.id], up.room, { up: up.rank, down: down.rank });
}

/** Dance score: playful + stamina + beauty ÷ 2 + the crowd's affection + rehearsal + a die roll. */
export function danceScore(ctx: Ctx, c: Contestant, crowd: Contestant[]): number {
  const d = ctx.data.events.dance_off;
  const love = crowd.length ? crowd.reduce((s, o) => s + (o.ledger[c.id]?.affection ?? 0), 0) / crowd.length : 0;
  return d.playful * axis(ctx, c, 'playful') + d.stamina * c.stamina + d.beauty * c.beauty + d.crowd * love + trainedEdge(ctx, c, 'dance') + between(ctx.w.rng, 0, d.die);
}

function danceOff(ctx: Ctx, here: Contestant[]): void {
  const ev = ctx.w.show.event!;
  const d = ctx.data.events.dance_off;
  let dancers: Contestant[];
  if (ev.actors.length) {
    dancers = alive(ctx, ev.actors).filter((c) => here.includes(c));
  } else {
    const [lo, hi] = d.dancers;
    const n = Math.min(here.length, lo + Math.floor(between(ctx.w.rng, 0, hi - lo + 1)));
    dancers = shuffle(ctx.w.rng, [...here]).slice(0, n);
  }
  // A booked dancer who didn't come loses by default.
  const noShow = alive(ctx, ev.actors).filter((c) => !here.includes(c));
  if (dancers.length + noShow.length < 2 || dancers.length === 0) {
    log(ctx, 'event_cancelled', [...dancers, ...noShow].map((c) => c.id), ev.room, { format: ev.format });
    return;
  }
  const crowd = here.filter((c) => !dancers.includes(c));
  const scores = new Map(dancers.map((c) => [c, danceScore(ctx, c, crowd)]));
  const ranked = [...dancers].sort((a, b) => scores.get(b)! - scores.get(a)!);
  const winner = ranked[0]!;
  const loser = noShow[0] ?? ranked[ranked.length - 1]!;
  log(ctx, 'dance_off', [...ranked, ...noShow].map((c) => c.id), ev.room, {
    winner: winner.id,
    loser: loser.id,
    scores: Object.fromEntries(ranked.map((c) => [c.id, round2(scores.get(c)!)])),
    ...(ev.sudden ? { sudden: true } : {}),
  });
  think(ctx, winner, d.won);
  for (const c of [...ranked.slice(1), ...noShow]) think(ctx, c, d.lost);
  watch(ctx, here, dancers, d.watchFun);
  // Sudden death: the loser drops to zero, to be spaced at the ceremony unless they climb back.
  if (ev.sudden) addMeter(ctx, loser, -loser.meter);
}

/** Odds of pressing: likelier for the cruel, the fickle, the brave and the desperate. */
export function pressOdds(ctx: Ctx, c: Contestant): number {
  const b = ctx.data.events.button;
  const p = b.base * axisFactor(b.kindK, axis(ctx, c, 'kind')) * axisFactor(b.loyalK, c.personality.loyal) * axisFactor(b.braveK, c.personality.brave) * (1 + b.desperateK * (1 - c.meter / ctx.data.meter.max));
  return Math.min(1, Math.max(0, p));
}

/** Everyone there secretly chooses. Pressers gain; everyone else pays for every press. */
function button(ctx: Ctx, here: Contestant[]): void {
  const ev = ctx.w.show.event!;
  const b = ctx.data.events.button;
  const pressers = here.filter((c) => chance(ctx.w.rng, pressOdds(ctx, c)));
  log(ctx, 'button', here.map((c) => c.id), ev.room, { pressers: pressers.map((c) => c.id), presses: pressers.length });
  for (const c of ctx.w.contestants) addMeter(ctx, c, pressers.includes(c) ? b.gain : -b.loss * pressers.length);
  ctx.w.show.button = { day: dayOf(ctx.w.t), pressers: pressers.map((c) => c.id) };
}

/** At dinner the announcer reveals who pressed. Everyone who didn't takes it personally. */
export function revealButton(ctx: Ctx): void {
  const bt = ctx.w.show.button;
  ctx.w.show.button = null;
  if (!bt) return;
  const pressers = bt.pressers.map((id) => byId(ctx, id)).filter((c) => c !== undefined);
  log(ctx, 'button_reveal', pressers.map((c) => c.id), undefined, { presses: bt.pressers.length });
  const a = ctx.data.events.button.affection;
  for (const o of ctx.w.contestants) {
    if (bt.pressers.includes(o.id)) continue;
    for (const p of pressers) feel(ctx, o, p, 'affection', a, 'pressed the button');
  }
}
