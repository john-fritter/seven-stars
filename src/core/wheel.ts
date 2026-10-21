// The Wheel. DESIGN.md Part two, The Wheel and the daily event. Once a day, right after ranks are
// assigned at the ceremony, the new bottom rank spins it in front of everyone. Segments and what
// they do are rows in wheel.yaml.
import { dayOf, log, type Ctx } from './context.js';
import { evidence, labelOf } from './romance.js';
import { feel } from './ledger.js';
import { shuffle, weightedIndex } from './rng.js';
import { addMeter } from './scoring.js';
import { space } from './show.js';
import { think } from './thoughts.js';
import type { Contestant, Label } from './types.js';

type Segment = Ctx['data']['wheel']['segments'][number];

const ROMANTIC: readonly Label[] = ['flirting', 'fling', 'dating', 'exclusive'];

/**
 * The spinner spins. `order` is tonight's ranking, top first. Returns who goes to the fishbowl,
 * for the ceremony to escort in after the room moves.
 */
export function spinWheel(ctx: Ctx, spinner: Contestant, order: Contestant[]): { c: Contestant; kind: 'night' | 'day' }[] {
  const wh = ctx.data.wheel;
  const seg = wh.segments[weightedIndex(ctx.w.rng, wh.segments.map((s) => s.weight))]!;
  const room = ctx.data.schedule.ceremony.room;
  const others = order.filter((c) => c !== spinner);
  log(ctx, 'wheel', [spinner.id], room, { segment: seg.id, effect: seg.effect });
  if (wh.thought) think(ctx, spinner, wh.thought);
  const fishbowl = apply(ctx, seg, spinner, others, order);
  if (seg.thought && ctx.w.contestants.includes(spinner)) think(ctx, spinner, seg.thought);
  return fishbowl;
}

function apply(ctx: Ctx, seg: Segment, spinner: Contestant, others: Contestant[], order: Contestant[]): { c: Contestant; kind: 'night' | 'day' }[] {
  const show = ctx.w.show;
  const top = order[0] !== spinner ? order[0] : undefined;
  switch (seg.effect) {
    case 'space':
      space(ctx, spinner, 'wheel');
      break;
    case 'immunity':
      spinner.immunities++;
      break;
    case 'meter':
      addMeter(ctx, spinner, seg.to! - spinner.meter);
      break;
    case 'event': {
      const against = seg.against === 'top' ? top : shuffle(ctx.w.rng, [...others])[0];
      if (!against) break;
      show.booked = { format: seg.event!, actors: [spinner.id, against.id], sudden: seg.sudden, prize: seg.prize };
      log(ctx, 'booked', [spinner.id, against.id], undefined, { format: seg.event, day: dayOf(ctx.w.t) + 1 });
      break;
    }
    case 'swap_beds':
      if (!top) break;
      [spinner.bed, top.bed] = [top.bed, spinner.bed];
      show.bedSwap = [spinner.id, top.id];
      log(ctx, 'bed_swap', [spinner.id, top.id], undefined, { until: 'wake' });
      break;
    case 'fishbowl':
      return [{ c: spinner, kind: seg.fishbowl! }];
    case 'station': {
      const day = dayOf(ctx.w.t) + 1;
      for (const id of seg.station) show.effects[id] = day;
      for (const o of others) feel(ctx, o, spinner, 'affection', seg.blame, 'the wheel punished us');
      break;
    }
    case 'secrets':
      revealSecrets(ctx);
      break;
    case 'pick_two':
      pickTwo(ctx, spinner, others, seg.amount!);
      break;
    case 'nothing':
      break;
  }
  return [];
}

/**
 * The announcer reads out everyone's private labels. Anyone who believed they were exclusive with
 * someone who calls it less learns they won't commit, and everyone learns who's involved with whom,
 * which is evidence like catching them at it.
 */
export function revealSecrets(ctx: Ctx): void {
  const cast = ctx.w.contestants;
  const labels: [string, string, Label][] = [];
  for (const a of cast) for (const b of cast) if (a !== b && labelOf(a, b) !== 'none') labels.push([a.id, b.id, labelOf(a, b)]);
  log(ctx, 'secrets', [], ctx.data.schedule.ceremony.room, { labels });
  const notExclusive = ctx.data.romance.exclusive.refused; // "{who} won't commit"
  for (const [aId, bId, label] of labels) {
    if (!ROMANTIC.includes(label)) continue;
    const a = cast.find((c) => c.id === aId);
    const b = cast.find((c) => c.id === bId);
    if (!a || !b) continue;
    if (label !== 'exclusive' && labelOf(b, a) === 'exclusive') think(ctx, b, notExclusive, a.id);
    for (const x of cast) if (x !== a && x !== b) evidence(ctx, x, a, b, 'secrets');
  }
}

/** The spinner's favorite gains, their least favorite loses. */
function pickTwo(ctx: Ctx, spinner: Contestant, others: Contestant[], amount: number): void {
  if (others.length < 2) return;
  const aff = (o: Contestant) => spinner.ledger[o.id]?.affection ?? 0;
  const sorted = shuffle(ctx.w.rng, [...others]).sort((a, b) => aff(b) - aff(a));
  const fav = sorted[0]!;
  const foe = sorted[sorted.length - 1]!;
  addMeter(ctx, fav, amount);
  addMeter(ctx, foe, -amount);
  log(ctx, 'pick_two', [spinner.id, fav.id, foe.id], ctx.data.schedule.ceremony.room, { up: fav.id, down: foe.id, amount });
}

/** The suite night is over: everyone back in their own beds. */
export function unswapBeds(ctx: Ctx): void {
  const ids = ctx.w.show.bedSwap;
  ctx.w.show.bedSwap = null;
  if (!ids) return;
  for (const c of ctx.w.contestants) if (ids.includes(c.id) && c.rank !== null) c.bed = ctx.data.ranks.ranks[String(c.rank) as '1']!.bed;
}
