import { describe, expect, it } from 'vitest';
import { begin, endActivity } from '../src/core/actions.js';
import { startBreak } from '../src/core/breaks.js';
import { log } from '../src/core/context.js';
import { infraction } from '../src/core/show.js';
import { interact } from '../src/core/social.js';
import { grievance, think } from '../src/core/thoughts.js';
import { aboard, alone, data } from './helpers.js';

const flat = (x: number) => ({ outgoing: x, kind: x, honest: x, calm: x, loyal: x, brave: x, vain: x, playful: x });
const has = (c: { thoughts: { id: string; about: string | null; value: number }[] }, id: string) => c.thoughts.find((x) => x.id === id);

function three() {
  const { w, ctx, cast } = aboard();
  const [a, b, c] = cast as [typeof cast[0], typeof cast[0], typeof cast[0]];
  alone(w, a, b, c);
  for (const x of [a, b, c]) Object.assign(x, { personality: flat(5), traits: [], thoughts: [], room: 'lounge', asleep: false, rank: 4, meter: 80, breakdown: null, activity: null });
  return { w, ctx, a, b, c };
}

describe('joys and pains from the blend', () => {
  it('helping someone feels good to the kind, and not at all to the cruelest', () => {
    const { ctx, a, b } = three();
    const kindWords = data.social.interactions.find((d) => d.id === 'kind_words')!;
    a.personality.kind = 10;
    interact(ctx, a, b, kindWords);
    expect(has(a, 'helped')?.about).toBe(b.id);
    expect(has(a, 'helped')!.value).toBeGreaterThan(data.thoughts.thoughts.helped!.value);
    b.personality.kind = 0;
    interact(ctx, b, a, kindWords);
    expect(has(b, 'helped')).toBeUndefined();
  });

  it('sneaking in: a rush for the brave, guilt for the honest; stealing is only guilt', () => {
    const { ctx, a, b } = three();
    a.personality = { ...flat(5), brave: 10, honest: 0, kind: 0 };
    b.personality = { ...flat(5), brave: 0, honest: 10, kind: 10 };
    infraction(ctx, a, 'above_rank', 'spa');
    infraction(ctx, b, 'above_rank', 'spa');
    expect(has(a, 'thrill')!.value).toBeGreaterThan(0);
    expect(has(b, 'thrill')).toBeUndefined();
    expect(Math.abs(has(b, 'guilty_conscience')!.value)).toBeGreaterThan(Math.abs(has(a, 'guilty_conscience')!.value) * 5);
    a.thoughts = [];
    infraction(ctx, a, 'theft', 'cafe');
    expect(has(a, 'thrill')).toBeUndefined();
    expect(has(a, 'guilty_conscience')).toBeDefined();
  });

  it('a nip from the still is a rush for the brave', () => {
    const { ctx, a } = three();
    a.personality.brave = 9;
    a.room = 'garden';
    const still = ctx.st.objects.find((o) => o.type === 'still')!;
    begin(ctx, a, { action: 'drink', object: still.id, room: 'garden', minutes: 20 });
    endActivity(ctx, a, 'done');
    expect(has(a, 'thrill')).toBeDefined();
  });

  it('all eyes on the performer: the vain love it, the modest feel nothing', () => {
    const { ctx, a, b } = three();
    a.personality.vain = 10;
    b.personality.vain = 0;
    log(ctx, 'karaoke', [a.id], 'lounge');
    log(ctx, 'karaoke', [b.id], 'lounge');
    expect(has(a, 'watched_performing')!.value).toBeGreaterThan(0);
    expect(has(b, 'watched_performing')).toBeUndefined();
  });

  it('watching someone fall apart hurts the kind, about them; the cruel shrug', () => {
    const { ctx, a, b, c } = three();
    b.personality.kind = 10;
    c.personality.kind = 0;
    startBreak(ctx, a, 'minor', 'discomfort', 'sulk', null);
    expect(has(b, 'saw_breakdown')?.about).toBe(a.id);
    expect(has(b, 'saw_breakdown')!.value).toBeLessThan(0);
    expect(has(c, 'saw_breakdown')).toBeUndefined();
    expect(has(a, 'saw_breakdown')).toBeUndefined();
  });
});

describe('the murder nudge', () => {
  it('below the doom line the violent cutoffs loosen by a point', () => {
    const { ctx, a, b } = three();
    const p = data.breaks.passion;
    a.personality = { ...flat(5), kind: p.kindAtMost + p.desperate, calm: 9 };
    startBreak(ctx, a, 'extreme', 'person', 'attack', b.id);
    expect(a.breakdown!.kind).toBe(p.otherwise);
    a.breakdown = null;
    a.activity = null;
    a.meter = data.meter.doomed.below - 1;
    startBreak(ctx, a, 'extreme', 'person', 'attack', b.id);
    // Same room: the attack happens at once, so read the logged break.
    const brk = ctx.events.filter((e) => e.type === 'break').at(-1)!;
    expect(brk.data).toMatchObject({ kind: 'attack', desperate: true });
    // Kinder than that, desperation isn't enough.
    a.breakdown = null;
    a.activity = null;
    a.personality.kind = p.kindAtMost + p.desperate + 1;
    startBreak(ctx, a, 'extreme', 'person', 'attack', b.id);
    expect(a.breakdown!.kind).toBe(p.otherwise);
  });
});

describe('envy as a grievance', () => {
  it('weighted, a few points of envy outweigh a bigger fear', () => {
    const { ctx, a, b } = three();
    think(ctx, a, 'envy', b.id);
    think(ctx, a, 'spun_wheel');
    const envy = has(a, 'envy')!.value;
    const fear = has(a, 'spun_wheel')!.value;
    expect(fear).toBeLessThan(envy);
    expect(grievance(ctx, a, data.breaks.sources)?.source).toBe('fear');
    const w = data.breaks.weights.envy!;
    expect(envy * w).toBeLessThan(fear);
    expect(grievance(ctx, a, data.breaks.sources, data.breaks.weights)).toEqual({ source: 'envy', about: b.id });
  });
});
