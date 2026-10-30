import { describe, expect, it } from 'vitest';
import { begin, endActivity, runActivity } from '../src/core/actions.js';
import { callSummons, confessionalPull, exposure, playbackMinute, topicPoints, topics, watchMoments } from '../src/core/confessionals.js';
import { dayOf, log } from '../src/core/context.js';
import { relation } from '../src/core/ledger.js';
import { remember } from '../src/core/romance.js';
import { surpriseOf } from '../src/core/ratings.js';
import { think } from '../src/core/thoughts.js';
import { aboard, alone } from './helpers.js';

const flat = (x: number) => ({ outgoing: x, kind: x, honest: x, calm: x, loyal: x, brave: x, vain: x, playful: x });

function cast() {
  const { w, ctx, cast } = aboard();
  const [a, b, c] = cast as [typeof cast[0], typeof cast[0], typeof cast[0]];
  alone(w, a, b, c);
  for (const x of [a, b, c]) Object.assign(x, { personality: flat(5), traits: [], thoughts: [], seen: [], told: {}, room: 'common', asleep: false, rank: 4, activity: null, meter: 80 });
  w.show.pending = [];
  return { w, ctx, a, b, c };
}

const chairOf = (ctx: ReturnType<typeof cast>['ctx']) => ctx.st.objects.find((o) => o.actions.some((d) => d.id === ctx.data.confessionals.action))!;
const confessDef = (ctx: ReturnType<typeof cast>['ctx']) => chairOf(ctx).actions.find((d) => d.id === ctx.data.confessionals.action)!;

/** Sits `x` in the diary chair and runs the visit to the end. */
function visit(ctx: ReturnType<typeof cast>['ctx'], x: ReturnType<typeof cast>['a'], summoned?: string, about?: string) {
  const chair = chairOf(ctx);
  begin(ctx, x, { action: ctx.data.confessionals.action, object: chair.id, room: chair.room, minutes: 20, ...(summoned ? { summoned } : {}), ...(about ? { about } : {}) });
  for (let i = 0; i < 60 && x.activity; i++) {
    runActivity(ctx, x);
    ctx.w.t++;
  }
  return ctx.events.filter((e) => e.type === ctx.data.confessionals.event).at(-1)!;
}

describe('confessionals', () => {
  it('they have something to say: a grudge, a crush, a romance they saw, their own cheating, a killer', () => {
    const { ctx, a, b, c } = cast();
    expect(topics(ctx, a)).toEqual([]);
    relation(ctx, a, b).affection = -50;
    relation(ctx, a, c).attraction = 8;
    remember(ctx, a, b, c, 'kiss');
    const kinds = topics(ctx, a).map((t) => t.kind).sort();
    expect(kinds).toEqual(['crush', 'grudge', 'spill']);
    relation(ctx, a, b).killer = 'Someone';
    expect(topics(ctx, a).map((t) => t.kind)).toContain('suspicion');
    // Their own fling with c, behind b's back.
    a.seen = [];
    remember(ctx, a, a, c, 'kiss');
    think(ctx, a, ctx.data.romance.guilty, b.id);
    const cheat = topics(ctx, a).find((t) => t.kind === 'cheating')!;
    expect(cheat.about).toEqual([c.id, b.id]);
  });

  it('every visit vents the worst of it, and what they say is remembered so it is not said twice', () => {
    const { ctx, a, b, c } = cast();
    think(ctx, a, 'sentenced');
    const before = a.thoughts.find((x) => x.id === 'sentenced')!.value;
    remember(ctx, a, b, c, 'kiss');
    const e = visit(ctx, a);
    expect(e.data!.kind).toBe('spill');
    expect(e.data!.about).toEqual([b.id, c.id]);
    expect(a.thoughts.find((x) => x.id === 'sentenced')!.value).toBeCloseTo(before * ctx.data.confessionals.vent.share);
    expect(e.points).toBeGreaterThan(0);
    // Nothing new to tell, and nothing left to vent: it's just a vent, and the thought eases once.
    const again = visit(ctx, a);
    expect(again.data!.kind).toBe('vent');
    expect(a.thoughts.find((x) => x.id === 'sentenced')!.value).toBeCloseTo(before * ctx.data.confessionals.vent.share);
    expect(ctx.w.show.tapes[a.id]!.kind).toBe('vent');
  });

  it('a quiet one saying something loud pays more than a show-off saying the same', () => {
    const { ctx, a, b } = cast();
    a.personality = flat(0);
    b.personality = flat(10);
    const loud = { t: 0, type: ctx.data.confessionals.event, actors: [a.id], data: { kind: 'spill', loud: true } };
    expect(surpriseOf(ctx, a, loud)).toBeGreaterThan(1.5);
    expect(surpriseOf(ctx, b, { ...loud, actors: [b.id] })).toBe(1);
    expect(surpriseOf(ctx, a, { ...loud, data: { kind: 'vent', loud: false } })).toBe(1);
    expect(topicPoints(ctx, a, 'spill')).toBeGreaterThan(topicPoints(ctx, b, 'spill'));
  });

  it('the pull grows with a bad mood, a secret and a low meter, and a coming sentence makes them careful', () => {
    const { ctx, a, b, c } = cast();
    const def = confessDef(ctx);
    const calm = confessionalPull(ctx, a, def);
    think(ctx, a, 'sentenced');
    const upset = confessionalPull(ctx, a, def);
    expect(upset).toBeGreaterThan(calm);
    remember(ctx, a, b, c, 'lovin');
    const secret = confessionalPull(ctx, a, def);
    expect(secret).toBeGreaterThan(upset);
    a.meter = 10;
    const desperate = confessionalPull(ctx, a, def);
    expect(desperate).toBeGreaterThan(secret);
    ctx.w.show.pending.push({ who: a.id, rule: 'above_rank', t: ctx.w.t, room: 'suite', scored: 0 });
    expect(confessionalPull(ctx, a, def)).toBeLessThan(desperate);
  });

  it('the operator summons the actors of a big moment, at most a couple a day, once they are free', () => {
    const { ctx, a, b, c } = cast();
    const from = ctx.events.length;
    log(ctx, 'betrayal', [a.id, b.id, c.id], 'common');
    watchMoments(ctx, from);
    expect(ctx.w.show.summons.map((x) => x.who)).toEqual([a.id, b.id]);
    a.asleep = true;
    callSummons(ctx);
    const called = ctx.events.find((e) => e.type === 'summoned')!;
    expect(called.actors).toEqual([b.id]); // a is asleep: b goes first
    expect(b.activity!.summoned).toBe('betrayal');
    expect(b.activity!.about).toBe(a.id);
    // The chair is taken: nobody else is called until it's free.
    a.asleep = false;
    callSummons(ctx);
    expect(ctx.events.filter((e) => e.type === 'summoned')).toHaveLength(1);
    endActivity(ctx, b, 'interrupted');
    callSummons(ctx);
    expect(ctx.events.filter((e) => e.type === 'summoned').map((e) => e.actors[0])).toEqual([b.id, a.id]);
    // Two a day: a third moment waits for tomorrow.
    endActivity(ctx, a, 'interrupted');
    const next = ctx.events.length;
    log(ctx, 'breakup', [c.id, a.id], 'common');
    watchMoments(ctx, next);
    callSummons(ctx);
    expect(ctx.events.filter((e) => e.type === 'summoned')).toHaveLength(2);
    expect(ctx.w.show.called.day).toBe(dayOf(ctx.w.t));
  });

  it('summoned with nothing else to say, they give their take on the moment', () => {
    const { ctx, a, b } = cast();
    const e = visit(ctx, a, 'fight', b.id);
    expect(e.data!.kind).toBe('take');
    expect(e.data!.about).toEqual([b.id]);
    expect(e.data!.summoned).toBe('fight');
  });

  it('a sentence can air the latest confessional at the next dinner, and everyone in earshot hears it', () => {
    const { w, ctx, a, b, c } = cast();
    remember(ctx, a, b, c, 'lovin');
    visit(ctx, a);
    const p = ctx.data.confessionals.playback;
    let aired = false;
    for (let i = 0; i < 50 && !aired; i++) aired = exposure(ctx, a);
    expect(aired).toBe(true);
    const x = w.contestants.find((o) => o !== a && o !== b && o !== c)!;
    Object.assign(x, { asleep: false, room: p.room, seen: [] });
    const fondB = relation(ctx, b, a).affection;
    // Dinner tomorrow, at the playback time.
    w.t = (dayOf(w.t)) * 1440 + p.at;
    playbackMinute(ctx);
    const e = ctx.events.find((ev) => ev.type === 'playback')!;
    expect(e.actors).toEqual([a.id]);
    expect(e.data!.kind).toBe('spill');
    expect(e.data!.heard).toContain(x.id);
    expect(a.thoughts.some((t) => t.id === p.speaker)).toBe(true);
    expect(relation(ctx, b, a).affection).toBeLessThan(fondB);
    expect(x.seen.some((s) => (s.who === b.id && s.with === c.id) || (s.who === c.id && s.with === b.id))).toBe(true);
    expect(w.show.tapes[a.id]).toBeUndefined();
  });
});
