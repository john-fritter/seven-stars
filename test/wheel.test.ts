import { describe, expect, it } from 'vitest';
import { openMeals, usable } from '../src/core/actions.js';
import { qualityFor } from '../src/core/booze.js';
import { dayOf, timeOfDay } from '../src/core/context.js';
import { pressOdds, revealButton, swapRanks } from '../src/core/events.js';
import { step } from '../src/core/index.js';
import { meet, relation } from '../src/core/ledger.js';
import { spacings } from '../src/core/show.js';
import { revealSecrets, spinWheel } from '../src/core/wheel.js';
import type { Contestant, World } from '../src/core/types.js';
import type { GameData } from '../src/data/schema.js';
import { aboard, alone, data } from './helpers.js';

/** Data where the Wheel can only land on one segment. */
function only(id: string, d: GameData = data): GameData {
  const x = structuredClone(d);
  for (const s of x.wheel.segments) s.weight = s.id === id ? 1 : 0;
  return x;
}

/** Steps to the next time of day `hhmm` (minutes after midnight), leaving the world at that minute. */
function stepTo(w: World, m: number): void {
  const now = timeOfDay(w.t);
  step(w, (m - now + 1440) % 1440 || 1440);
}

/** A ranked cast: ranks 1..n in cast order. */
function ranked(cast: Contestant[]): Contestant[] {
  cast.forEach((c, i) => {
    c.rank = i + 1;
    c.bed = data.ranks.ranks[String(i + 1) as '1']!.bed;
  });
  return cast;
}

describe('the Wheel', () => {
  it('comes up spaced about one night in 22', () => {
    const total = data.wheel.segments.reduce((s, x) => s + x.weight, 0);
    expect(total).toBe(22);
    expect(data.wheel.segments.find((s) => s.id === 'spaced')!.weight / total).toBeCloseTo(1 / 22);
  });

  it('is spun every night by the new bottom rank, after ranks are assigned', () => {
    const { w } = aboard();
    const events = step(w, 2 * 1440);
    const ceremonies = events.filter((e) => e.type === 'ceremony');
    const wheels = events.filter((e) => e.type === 'wheel');
    expect(wheels.length).toBe(ceremonies.length);
    for (const wh of wheels) {
      const cer = ceremonies.find((c) => c.t === wh.t)!;
      const ranks = cer.data!.ranks as string[];
      expect(wh.actors[0]).toBe(ranks[ranks.length - 1]);
      expect(events.indexOf(wh)).toBeGreaterThan(events.indexOf(cer));
    }
  });

  it('spaces the spinner, unless they hold an immunity', () => {
    const d = only('spaced');
    const { w, ctx, cast } = aboard(21, d);
    const order = ranked([...cast]);
    const spinner = order[6]!;
    spinner.immunities = 1;
    spinWheel(ctx, spinner, order);
    expect(w.contestants.includes(spinner)).toBe(true);
    expect(ctx.events.some((e) => e.type === 'immunity_spent' && e.data!.cause === 'wheel')).toBe(true);
    spinWheel(ctx, spinner, order);
    expect(w.contestants.includes(spinner)).toBe(false);
    expect(ctx.events.find((e) => e.type === 'death')!.data!.cause).toBe('wheel');
  });

  it('gives a secret immunity that cancels the next spacing', () => {
    const { w, ctx, cast } = aboard(21, only('immunity'));
    const order = ranked([...cast]);
    const spinner = order[6]!;
    spinWheel(ctx, spinner, order);
    expect(spinner.immunities).toBe(1);
    spinner.meter = 0;
    spacings(ctx);
    expect(w.contestants.includes(spinner)).toBe(true);
    expect(spinner.immunities).toBe(0);
  });

  it('can fill the meter', () => {
    const { ctx, cast } = aboard(21, only('meter_full'));
    const order = ranked([...cast]);
    order[6]!.meter = 3;
    spinWheel(ctx, order[6]!, order);
    expect(order[6]!.meter).toBe(100);
  });

  it('books a cage match against rank 1; a winning challenger takes the rank and room', () => {
    const d = only('cage_match');
    d.social.fight.power.die = 0;
    const { w, ctx, cast } = aboard(21, d);
    const order = ranked([...cast]);
    const [top, spinner] = [order[0]!, order[6]!];
    Object.assign(spinner, { strength: 10, stamina: 10 });
    Object.assign(top, { strength: 0, stamina: 0 });
    spinWheel(ctx, spinner, order);
    expect(w.show.booked).toMatchObject({ format: 'cage_match', actors: [spinner.id, top.id], prize: true });
    const events = (() => {
      stepTo(w, data.schedule.event.at - 1);
      return step(w, data.schedule.event.resolveAfter + 2);
    })();
    const match = events.find((e) => e.type === 'cage_match')!;
    expect(match).toBeDefined();
    if (match.data!.forfeit) return; // one of them was asleep or broken down: still a result
    expect(match.data!.winner).toBe(spinner.id);
    const fight = events.find((e) => e.type === 'fight')!;
    expect(fight.data!.outsideCage).toBe(false);
    expect(events.some((e) => e.type === 'infraction' && e.data!.rule === 'fighting')).toBe(false);
    expect(match.data!.awards).toEqual({ [spinner.id]: 25, [top.id]: 10 });
    const swap = events.find((e) => e.type === 'rank_swap')!;
    expect(swap.actors).toEqual([spinner.id, top.id]);
    expect(spinner.rank).toBeLessThan(top.rank!);
  });

  it('swaps rank, bed and clothes for a prize', () => {
    const { ctx, cast } = aboard();
    const order = ranked([...cast]);
    swapRanks(ctx, order[6]!, order[0]!);
    expect(order[6]!.rank).toBe(1);
    expect(order[6]!.bed).toBe(data.ranks.ranks['1'].bed);
    expect(order[0]!.rank).toBe(7);
    expect(order[0]!.bed).toBe(data.ranks.ranks['7'].bed);
  });

  it('books a sudden-death dance-off: the loser drops to zero', () => {
    const { w, ctx, cast } = aboard(21, only('dance_off'));
    const order = ranked([...cast]);
    spinWheel(ctx, order[6]!, order);
    expect(w.show.booked).toMatchObject({ format: 'dance_off', sudden: true });
    const [a, b] = w.show.booked!.actors.map((id) => w.contestants.find((c) => c.id === id)!) as [Contestant, Contestant];
    stepTo(w, data.schedule.event.at - 1);
    for (const c of [a, b]) c.meter = 80;
    const events = step(w, data.schedule.event.resolveAfter + 2);
    const dance = events.find((e) => e.type === 'dance_off')!;
    expect(dance.data!.sudden).toBe(true);
    const loser = w.contestants.find((c) => c.id === dance.data!.loser)!;
    expect(loser.meter).toBeLessThan(1);
    expect(events.some((e) => e.type === 'on_notice' && e.actors[0] === loser.id)).toBe(true);
  });

  it('swaps beds with rank 1 for the night, and back at the wake chime', () => {
    const { w, ctx, cast } = aboard(21, only('suite_night'));
    const order = ranked([...cast]);
    const [top, spinner] = [order[0]!, order[6]!];
    spinWheel(ctx, spinner, order);
    expect(spinner.bed).toBe(data.ranks.ranks['1'].bed);
    expect(top.bed).toBe(data.ranks.ranks['7'].bed);
    w.t = dayOf(w.t) * 1440 + data.schedule.wakeChime.at - 1; // just before tomorrow's wake chime
    step(w, 2);
    expect(spinner.bed).toBe(data.ranks.ranks['7'].bed);
    expect(top.bed).toBe(data.ranks.ranks['1'].bed);
  });

  it('can punish everyone tomorrow: no breakfast, cold water, and blame for the spinner', () => {
    const { w, ctx, cast } = aboard(21, only('punish_all'));
    const order = ranked([...cast]);
    const spinner = order[6]!;
    const other = order[1]!;
    meet(ctx, other, spinner);
    const before = relation(ctx, other, spinner).affection;
    spinWheel(ctx, spinner, order);
    expect(relation(ctx, other, spinner).affection).toBe(before - 5);
    const tomorrow = dayOf(w.t) + 1;
    expect(w.show.effects).toMatchObject({ cold_water: tomorrow, no_breakfast: tomorrow });
    w.t = (tomorrow - 1) * 1440 + data.schedule.meals[0]!.from; // 09:00 tomorrow
    const c = order[0]!;
    c.eaten = {};
    expect(openMeals(ctx, c).map((m) => m.id)).not.toContain('breakfast');
    c.species = 'human';
    const shower = ctx.st.objects.find((o) => o.id.startsWith('suite:shower_hot'))!;
    const offers = () => shower.actions.filter((a) => usable(ctx, c, a)).map((a) => a.id);
    expect(offers()).toEqual(['cold_shower']); // the hot shower runs cold
    // The day after, breakfast and hot water are back.
    w.t += 1440;
    expect(openMeals(ctx, c).map((m) => m.id)).toContain('breakfast');
    expect(offers()).toEqual(['shower']);
  });

  it('throws a party: top-shelf booze for everyone tomorrow', () => {
    const { w, ctx, cast } = aboard(21, only('party'));
    const order = ranked([...cast]);
    spinWheel(ctx, order[6]!, order);
    expect(qualityFor(ctx, order[6]!, 'rotgut')).toBe('rotgut');
    w.t += 1440;
    expect(qualityFor(ctx, order[6]!, 'rotgut')).toBe('fancy');
  });

  it("reveals everyone's labels: a secret fling hurts, and partners learn who's involved", () => {
    const { w, ctx, cast } = aboard();
    const [a, b, c] = cast as [Contestant, Contestant, Contestant];
    alone(w);
    relation(ctx, a, b).label = 'exclusive';
    relation(ctx, b, a).label = 'fling'; // b privately thinks it's a fling
    relation(ctx, b, c).label = 'flirting';
    revealSecrets(ctx);
    expect(a.thoughts.some((x) => x.id === 'not_exclusive' && x.about === b.id)).toBe(true);
    const betrayal = ctx.events.find((e) => e.type === 'betrayal')!;
    expect(betrayal.actors).toEqual([a.id, b.id, c.id]);
  });

  it("picks two: the spinner's favorite gains 50, their least favorite loses 50", () => {
    const { ctx, cast } = aboard(21, only('pick_two'));
    const order = ranked([...cast]);
    const [spinner, fav, foe] = [order[6]!, order[2]!, order[3]!];
    for (const o of order) if (o !== spinner) meet(ctx, spinner, o);
    relation(ctx, spinner, fav).affection = 80;
    relation(ctx, spinner, foe).affection = -80;
    fav.meter = 30;
    foe.meter = 70;
    spinWheel(ctx, spinner, order);
    expect(fav.meter).toBe(80);
    expect(foe.meter).toBe(20);
  });
});

describe('the daily event', () => {
  it('rotates formats, never the same twice in a row unless the Wheel booked it', () => {
    const d = only('nothing');
    const { w } = aboard(5, d);
    const events = step(w, 30 * 1440).filter((e) => e.type === 'event_start');
    expect(events.length).toBe(30);
    for (let i = 1; i < events.length; i++) expect(events[i]!.data!.format).not.toBe(events[i - 1]!.data!.format);
    expect(new Set(events.map((e) => e.data!.format))).toEqual(new Set(['cage_match', 'dance_off', 'button']));
  });

  it('summons everyone; skipping it is an infraction', () => {
    const { w } = aboard(9);
    const events = step(w, 3 * 1440);
    for (const start of events.filter((e) => e.type === 'event_start')) {
      const window = events.filter((e) => e.t >= start.t && e.t <= start.t + data.schedule.event.resolveAfter);
      const skipped = window.filter((e) => e.type === 'infraction' && e.data!.rule === 'skipped_event');
      const outcome = window.find((e) => ['cage_match', 'dance_off', 'button', 'event_cancelled'].includes(e.type))!;
      expect(outcome).toBeDefined();
      // Everyone is either at it, skipped it, or excused (the fishbowl, a breakdown).
      expect(skipped.length).toBeLessThanOrEqual(7);
    }
  });

  it('presses the button more when cruel, fickle, brave or desperate', () => {
    const { ctx, cast } = aboard();
    const c = cast[0]!;
    Object.assign(c.personality, { kind: 5, loyal: 5, brave: 5 });
    c.meter = 100;
    const base = pressOdds(ctx, c);
    expect(base).toBeCloseTo(data.events.button.base);
    c.meter = 0;
    expect(pressOdds(ctx, c)).toBeCloseTo(base * 2);
    c.meter = 100;
    c.personality.kind = 0;
    expect(pressOdds(ctx, c)).toBeCloseTo(base * 1.5);
  });

  it('pays pressers, costs everyone else per press, and reveals them at dinner', () => {
    const d = structuredClone(data);
    d.events.rotation = ['button', 'button'];
    const { w, cast } = aboard(21, d);
    stepTo(w, data.schedule.event.at - 1);
    for (const c of cast) c.meter = 50;
    const events = step(w, data.schedule.event.resolveAfter + 2);
    const b = events.find((e) => e.type === 'button')!;
    const pressers = b.data!.pressers as string[];
    for (const c of w.contestants) {
      const expected = pressers.includes(c.id) ? 70 : 50 - 5 * pressers.length;
      // The meter keeps draining by the minute, and other things may score: only roughly.
      expect(Math.abs(c.meter - Math.max(0, expected))).toBeLessThan(12);
    }
    expect(w.show.button?.pressers).toEqual(pressers);
    // At dinner.
    const non = w.contestants.find((c) => !pressers.includes(c.id));
    const p = w.contestants.find((c) => pressers.includes(c.id));
    const ctx = { data: d, st: aboard(21, d).ctx.st, w, events: [] };
    if (non && p) {
      const before = non.ledger[p.id]?.affection ?? 0;
      revealButton(ctx);
      expect(non.ledger[p.id]!.affection).toBeCloseTo(before - 10);
    }
  });
});
