import { describe, expect, it } from 'vitest';
import { log } from '../src/core/context.js';
import { actionPull, boldness, desperateEase, desperation, interactionBoost, interactionTaste } from '../src/core/ratings.js';
import type { Contestant } from '../src/core/types.js';
import { aboard, alone, data } from './helpers.js';

const flat = (x: number) => ({ outgoing: x, kind: x, honest: x, calm: x, loyal: x, brave: x, vain: x, playful: x });
const karaoke = data.objects.types.karaoke_stage!.actions.find((d) => d.logs === 'karaoke')!;
const inter = (id: string) => data.social.interactions.find((d) => d.id === id)!;

function plain(c: Contestant, ...traits: string[]): Contestant {
  c.personality = flat(5);
  c.traits = traits;
  c.ledger = {};
  return c;
}

describe('the ratings pull', () => {
  it('desperation runs from 0 at meter 50 to 1 at 0, squared', () => {
    const { ctx, cast } = aboard();
    const c = cast[0]!;
    c.meter = 60;
    expect(desperation(ctx, c)).toBe(0);
    c.meter = 25;
    expect(desperation(ctx, c)).toBeCloseTo(0.25);
    c.meter = 0;
    expect(desperation(ctx, c)).toBe(1);
  });

  it('pulls toward what pays, weighted by taste, only when the meter is low', () => {
    const { w, ctx, cast } = aboard();
    const c = plain(cast[0]!);
    const o = plain(cast[1]!);
    w.show.today = {};
    w.show.mine = {};
    c.meter = 80;
    expect(actionPull(ctx, c, karaoke)).toBe(0);
    expect(interactionBoost(ctx, c, o, inter('insult'))).toBe(1);
    c.meter = 0;
    // karaoke pays the actor 3: 10 × 1 × 3 ÷ 10 × taste 1
    expect(actionPull(ctx, c, karaoke)).toBeCloseTo(data.scoring.ratings.actions * 0.3);
    // an insult pays the insulter 4: × 1 + 5 × 4 ÷ 10
    expect(interactionBoost(ctx, c, o, inter('insult'))).toBeCloseTo(1 + data.scoring.ratings.interactions * 0.4);
    expect(interactionBoost(ctx, c, o, inter('chitchat'))).toBe(1); // pays nothing
    expect(interactionBoost(ctx, c, o, inter('breakup'))).toBe(1); // never for the cameras
    // The kind have no taste for it, and a Survivor plays harder.
    c.personality.kind = 10;
    expect(interactionTaste(ctx, c, o, inter('insult'))).toBeCloseTo(data.social.factorRange[0]);
    c.personality.kind = 5;
    c.traits = ['survivor'];
    expect(actionPull(ctx, c, karaoke)).toBeCloseTo(data.scoring.ratings.actions * 0.3 * 1.5);
  });

  it('an act gets old: their own repeats today pull less', () => {
    const { w, ctx, cast } = aboard();
    const c = plain(cast[0]!);
    alone(w, c);
    w.show.today = {};
    w.show.mine = {};
    c.meter = 0;
    const before = actionPull(ctx, c, karaoke);
    log(ctx, "karaoke", [c.id], c.room);
    c.meter = 0; // what it paid moved the meter; look at the pull from the same spot
    expect(actionPull(ctx, c, karaoke)).toBeCloseTo(before * (1 - data.scoring.modifiers.boredom) * data.scoring.modifiers.ownRepeat);
  });

  it('desperation overcomes shyness, and stage fright', () => {
    const { ctx, cast } = aboard();
    const c = plain(cast[0]!, 'stage_fright');
    c.personality.outgoing = 2;
    c.meter = 60;
    expect(boldness(ctx, c)).toBe(2);
    expect(desperateEase(ctx, c, karaoke)).toBe(1);
    c.meter = 0;
    expect(boldness(ctx, c)).toBeCloseTo(2 + 8 * data.scoring.ratings.shyness);
    expect(desperateEase(ctx, c, karaoke)).toBeCloseTo(data.traits.traits.stage_fright!.desperate.performing! / 0.2);
  });
});

describe('the surprise bonus', () => {
  it('pays an act against type up to × 1 + S, and nothing extra in character', () => {
    const { w, ctx, cast } = aboard();
    const [a, b] = cast as [Contestant, Contestant];
    plain(a);
    plain(b);
    alone(w, a, b);
    Object.assign(a, { room: 'cafe', meter: 50 });
    Object.assign(b, { room: 'cafe', meter: 50 });
    w.show.today = {};
    w.show.pairs = {};
    w.show.mine = {};
    const plainInsult = log(ctx, 'insult', [a.id, b.id], 'cafe');
    expect(plainInsult.data!.surprise).toBeUndefined();
    expect((plainInsult.data!.awards as Record<string, number>)[a.id]).toBe(4);
    // A saint's insult: taste 0.1, so × 1 + 1 × 0.9.
    b.personality.kind = 10;
    w.show.today = {};
    w.show.pairs = {};
    w.show.mine = {};
    const saint = log(ctx, 'insult', [b.id, a.id], 'cafe');
    expect(saint.data!.surprise).toBeCloseTo(1.9);
    expect((saint.data!.awards as Record<string, number>)[b.id]).toBeCloseTo(4 * 1.9);
  });
});
