import { describe, expect, it } from 'vitest';
import { begin, endActivity, runActivity, usable } from '../src/core/actions.js';
import { cardsRound } from '../src/core/cards.js';
import { announceBill, danceScore } from '../src/core/events.js';
import { looks, relation } from '../src/core/ledger.js';
import { fightPower } from '../src/core/social.js';
import { think, updateMood } from '../src/core/thoughts.js';
import { fadeTraining, inTrouble, wantPull, wantsOf } from '../src/core/wants.js';
import { aboard, alone } from './helpers.js';

const flat = (x: number) => ({ outgoing: x, kind: x, honest: x, calm: x, loyal: x, brave: x, vain: x, playful: x });

function three() {
  const { w, ctx, cast } = aboard();
  const [a, b, c] = cast as [typeof cast[0], typeof cast[0], typeof cast[0]];
  alone(w, a, b, c);
  for (const x of [a, b, c]) Object.assign(x, { personality: flat(5), traits: [], thoughts: [], room: 'lounge', asleep: false, rank: 4, activity: null });
  return { w, ctx, a, b, c };
}

const personal = (ctx: ReturnType<typeof three>['ctx'], id: string) => ctx.st.personal.find((d) => d.id === id)!;
const action = (ctx: ReturnType<typeof three>['ctx'], type: string, id: string) => ctx.data.objects.types[type]!.actions.find((d) => d.id === id)!;

describe('wants', () => {
  it('a partner pulls toward talking with them, a crush less so, and only without a partner', () => {
    const { ctx, a, b, c } = three();
    relation(ctx, a, c).attraction = 8; // a crush
    let w = wantsOf(ctx, a);
    expect(w.partners.get(c.id)).toBeCloseTo(ctx.data.wants.partner.crush);
    relation(ctx, a, b).label = 'dating';
    w = wantsOf(ctx, a);
    expect(w.partners.get(b.id)).toBeCloseTo(1);
    expect(w.partners.has(c.id)).toBe(false);
    const talk = personal(ctx, 'talk');
    const pull = wantPull(ctx, a, w, talk, b.room, true, false, b.id);
    expect(pull.pull).toBeCloseTo(ctx.data.wants.partner.talk);
    expect(pull.why).toBe('partner');
  });

  it('the calm avoid a rival, the brave and volatile confront them', () => {
    const { ctx, a, b } = three();
    relation(ctx, a, b).affection = -50;
    a.personality = { ...flat(5), calm: 10, brave: 0 };
    const calm = wantsOf(ctx, a).rival!;
    a.personality = { ...flat(5), calm: 0, brave: 10, kind: 0 };
    const hot = wantsOf(ctx, a).rival!;
    expect(calm.avoid).toBeGreaterThan(hot.avoid);
    expect(hot.confront).toBeGreaterThan(calm.confront);
    // Avoiding: anything but a chore in their room costs.
    const sit = action(ctx, 'couch', 'sit');
    expect(wantPull(ctx, a, wantsOf(ctx, a), sit, b.room, false, false).pull).toBeLessThan(0);
    expect(wantPull(ctx, a, wantsOf(ctx, a), sit, b.room, false, true).pull).toBe(0);
  });

  it('confronting a rival: they walk over and have it out, and it is logged', () => {
    const { ctx, a, b } = three();
    relation(ctx, a, b).affection = -60;
    b.activity = { action: 'sit', object: null, room: b.room, phase: 'do', startedAt: ctx.w.t, arriveAt: ctx.w.t, minutes: 30, endAt: ctx.w.t + 30 };
    begin(ctx, a, { action: 'confront', object: null, room: b.room, minutes: 10, partner: b.id });
    const e = ctx.events.find((x) => x.type === 'confront');
    expect(e?.actors).toEqual([a.id, b.id]);
    expect(ctx.events.some((x) => x.type === (e!.data!.with as string) && x.actors[0] === a.id)).toBe(true);
    expect(a.tolerance[`confront:${b.id}`]).toBeCloseTo(ctx.data.wants.rival.confront.again);
  });

  it('a friend is in trouble only when they are down, and comforting them consoles them', () => {
    const { ctx, a, b } = three();
    relation(ctx, a, b).affection = 50;
    relation(ctx, b, a).affection = 50;
    think(ctx, b, 'dumped', a.id);
    think(ctx, b, 'rebuffed', a.id);
    b.mood = 80;
    expect(inTrouble(ctx, b)).toBe(false);
    b.meter = 5;
    updateMood(ctx, b);
    b.mood = 30;
    expect(inTrouble(ctx, b)).toBe(true);
    expect(wantsOf(ctx, a).troubled.has(b.id)).toBe(true);
  });

  it('a booked match pulls toward training, harder as it nears', () => {
    const { ctx, a, b } = three();
    ctx.w.show.booked = { format: 'cage_match', actors: [a.id, b.id], sudden: false, prize: false };
    const w = wantsOf(ctx, a);
    expect(w.match?.skill).toBe('fight');
    const workout = action(ctx, 'heavy_bag', 'workout');
    expect(wantPull(ctx, a, w, workout, 'cage', false, false).why).toBe('match');
    // Rehearsing is only for someone booked into a dance-off.
    expect(usable(ctx, a, personal(ctx, 'rehearse'))).toBe(false);
    ctx.w.show.booked = { format: 'dance_off', actors: [a.id, b.id], sudden: false, prize: false };
    expect(usable(ctx, a, personal(ctx, 'rehearse'))).toBe(true);
  });
});

describe('things to do', () => {
  it('training sharpens a fight and fades by the hour', () => {
    const { ctx, a } = three();
    const before = fightPower(ctx, a);
    a.room = 'cage';
    begin(ctx, a, { action: 'workout', object: 'cage:heavy_bag:1', room: 'cage', minutes: 30 });
    for (let i = 0; i < 30; i++) runActivity(ctx, a);
    expect(a.trained.fight).toBeCloseTo(ctx.data.activities.training.perHour / 2);
    expect(fightPower(ctx, a)).toBeCloseTo(before + a.trained.fight! * ctx.data.activities.training.fight);
    a.trained.dance = 0.5;
    const d = danceScore(ctx, a, []);
    expect(d).toBeGreaterThan(0);
    fadeTraining(ctx, a);
    expect(a.trained.fight).toBeCloseTo(ctx.data.activities.training.perHour / 2 - ctx.data.activities.training.fadePerHour);
  });

  it('getting ready only before the ceremony, and it shows', () => {
    const { ctx, a } = three();
    const ready = action(ctx, 'mirror', 'get_ready');
    expect(usable(ctx, a, ready)).toBe(false); // 08:00
    ctx.w.t += 11 * 60; // 19:00
    expect(usable(ctx, a, ready)).toBe(true);
    a.beauty = 4;
    const plain = looks(ctx, a);
    a.room = 'restroom';
    begin(ctx, a, { action: 'get_ready', object: 'restroom:mirror:1', room: 'restroom', minutes: 0 });
    endActivity(ctx, a, 'done');
    expect(looks(ctx, a)).toBeCloseTo(plain + ctx.data.activities.ready.beauty / 10);
    expect(a.primped).toBeGreaterThan(ctx.w.t);
    expect(a.thoughts.some((t) => t.id === 'looking_good')).toBe(true);
    expect(usable(ctx, a, ready)).toBe(false); // already looking their best
  });

  it('a card table with two players plays a hand; the winner takes a snack from each loser who has one', () => {
    const { ctx, a, b } = three();
    a.snacks = 0;
    b.snacks = 1;
    for (const x of [a, b]) {
      x.room = 'cafe';
      begin(ctx, x, { action: 'cards', object: 'cafe:card_table:1', room: 'cafe', minutes: 30 });
    }
    ctx.w.t += ctx.data.activities.cards.hand - (ctx.w.t % ctx.data.activities.cards.hand);
    cardsRound(ctx);
    const e = ctx.events.find((x) => x.type === 'cards')!;
    expect(e.actors.sort()).toEqual([a.id, b.id].sort());
    expect(a.snacks + b.snacks).toBe(1);
    if (e.data!.winner === a.id) expect(a.snacks).toBe(1);
  });

  it('tomorrow is on the bill after the ceremony, unless the Wheel booked it', () => {
    const { ctx } = three();
    ctx.w.show.lastFormat = 'button';
    announceBill(ctx);
    const b = ctx.w.show.booked!;
    expect(['cage_match', 'dance_off']).toContain(b.format);
    expect(b.actors.length).toBeGreaterThanOrEqual(2);
    expect(ctx.events.some((e) => e.type === 'bill')).toBe(true);
    const wheel = { format: 'cage_match', actors: ['x', 'y'], sudden: true, prize: false };
    ctx.w.show.booked = wheel;
    announceBill(ctx);
    expect(ctx.w.show.booked).toBe(wheel);
  });
});
