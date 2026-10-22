import { describe, expect, it } from 'vitest';
import { fadeLedger, relation } from '../src/core/ledger.js';
import { company, friction, worries } from '../src/core/people.js';
import { moodInteraction } from '../src/core/social.js';
import { updateMood } from '../src/core/thoughts.js';
import { aboard, alone, data } from './helpers.js';

const flat = (x: number) => ({ outgoing: x, kind: x, honest: x, calm: x, loyal: x, brave: x, vain: x, playful: x });
const has = (c: { thoughts: { id: string; about: string | null; value: number }[] }, id: string) => c.thoughts.find((x) => x.id === id);

function three() {
  const { w, ctx, cast } = aboard();
  const [a, b, c] = cast as [typeof cast[0], typeof cast[0], typeof cast[0]];
  alone(w, a, b, c);
  for (const x of [a, b, c]) Object.assign(x, { personality: flat(5), traits: [], thoughts: [], room: 'lounge', asleep: false, rank: 4 });
  return { w, ctx, a, b, c };
}

describe('people as mood', () => {
  it('a friend in the room lifts mood and someone they can’t stand drags it down, about that person', () => {
    const { ctx, a, b, c } = three();
    relation(ctx, a, b).affection = 50;
    relation(ctx, a, c).affection = -40;
    updateMood(ctx, a);
    const before = a.mood;
    company(ctx, a);
    expect(has(a, 'with_friend')?.about).toBe(b.id);
    expect(has(a, 'stuck_with')?.about).toBe(c.id);
    expect(a.mood).toBeCloseTo(before + 6 - 6);
    // They leave: the thoughts go with them.
    b.room = c.room = 'cafe';
    company(ctx, a);
    expect(has(a, 'with_friend')).toBeUndefined();
    expect(has(a, 'stuck_with')).toBeUndefined();
  });

  it('a partner counts as a partner, not a friend; asleep, nobody counts', () => {
    const { ctx, a, b } = three();
    const r = relation(ctx, a, b);
    r.affection = 60;
    r.label = 'dating';
    company(ctx, a);
    expect(has(a, 'with_partner')?.about).toBe(b.id);
    expect(has(a, 'with_friend')).toBeUndefined();
    a.asleep = true;
    company(ctx, a);
    expect(has(a, 'with_partner')).toBeUndefined();
  });

  it('worry for a doomed friend (twice as much for a Worrier), missing a partner, envy of a disliked higher-up', () => {
    const { w, ctx, a, b, c } = three();
    relation(ctx, a, b).affection = 50;
    b.meter = 10;
    relation(ctx, a, c).affection = -20;
    c.rank = 2;
    worries(ctx, a);
    const worry = { ...has(a, 'friend_doomed')! };
    expect(worry.about).toBe(b.id);
    expect(has(a, 'envy')?.about).toBe(c.id);
    a.traits = ['worrier'];
    worries(ctx, a);
    expect(has(a, 'friend_doomed')!.value).toBeCloseTo(worry.value * 2);
    // A partner unseen for a day.
    const r = relation(ctx, a, c);
    r.label = 'exclusive';
    r.seen = w.t - data.social.people.missing.hours * 60;
    worries(ctx, a);
    expect(has(a, 'missing_them')?.about).toBe(c.id);
    c.rank = 6; // no longer above them
    worries(ctx, a);
    expect(has(a, 'envy')).toBeUndefined();
  });

  it('friction: clashing personalities drift apart, matching ones together', () => {
    const { ctx, a, b, c } = three();
    a.personality = flat(5);
    b.personality = { ...flat(5), honest: 0, calm: 10, kind: 0, playful: 10 };
    c.personality = flat(5);
    a.personality.honest = 10;
    a.personality.calm = 0;
    a.personality.kind = 10;
    a.personality.playful = 0;
    c.personality = { ...a.personality };
    for (const [x, y] of [[a, b], [a, c], [b, c]] as const) {
      Object.assign(relation(ctx, x, y), { affection: 0, reasons: [] });
      Object.assign(relation(ctx, y, x), { affection: 0, reasons: [] });
    }
    friction(ctx);
    const f = data.social.people.friction;
    expect(relation(ctx, a, b).affection).toBeCloseTo(f.rate * (f.pivot - 10));
    expect(relation(ctx, b, a).affection).toBeCloseTo(f.rate * (f.pivot - 10));
    expect(relation(ctx, a, c).affection).toBeCloseTo(f.rate * f.pivot);
    // One running reason, not one per round.
    friction(ctx);
    expect(relation(ctx, a, b).reasons.filter((x) => x.why === 'clash')).toHaveLength(1);
  });

  it('grudges stick: dislike fades slower than liking, slower still for the volatile', () => {
    const { ctx, a, b, c } = three();
    relation(ctx, a, b).affection = 50;
    relation(ctx, a, c).affection = -50;
    fadeLedger(ctx, a);
    const liked = 50 - relation(ctx, a, b).affection;
    const disliked = -50 - relation(ctx, a, c).affection;
    expect(-disliked).toBeCloseTo(liked * data.social.ledger.dislikeFade);
    a.personality.calm = 0;
    relation(ctx, a, c).affection = -50;
    fadeLedger(ctx, a);
    expect(-(-50 - relation(ctx, a, c).affection)).toBeLessThan(-disliked);
  });

  it('mood changes how they treat people both ways', () => {
    const { ctx, a } = three();
    const m = data.personality.mood;
    a.mood = m.lowBelow - 1;
    expect(moodInteraction(ctx, a, 'slight')).toBe(m.interactions.low.slight);
    expect(moodInteraction(ctx, a, 'kind_words')).toBe(1);
    a.mood = m.highAbove + 1;
    expect(moodInteraction(ctx, a, 'kind_words')).toBe(m.interactions.high.kind_words);
    expect(moodInteraction(ctx, a, 'slight')).toBe(1);
  });
});
