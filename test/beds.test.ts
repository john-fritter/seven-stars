import { describe, expect, it } from 'vitest';
import { actionDef, bedmateFeeling, begin, decide, endActivity, runActivity } from '../src/core/actions.js';
import { isNightFor } from '../src/core/context.js';
import { createWorld, step } from '../src/core/index.js';
import { meet, rel } from '../src/core/ledger.js';
import { bedFor, boldness, hereOdds, invite, lovin, moveAllowed, proposition } from '../src/core/romance.js';
import { shareOdds } from '../src/core/social.js';
import type { Contestant } from '../src/core/types.js';
import { aboard, alone, data } from './helpers.js';

const at = (h: number, m = 0) => h * 60 + m;
const ids = (c: Contestant) => c.thoughts.map((t) => t.id);

/** Ranked, bedded and awake, at `t` on day 2. */
function ready(t = at(14)) {
  const { w, ctx, cast } = aboard();
  step(w, 1440 + t - w.t);
  cast.forEach((c, i) => {
    c.rank = i + 1;
    c.bed = data.ranks.ranks[String(i + 1) as '1']!.bed;
  });
  return { w, ctx, cast };
}

describe('naps', () => {
  /** How many of `n` fresh choices at 14:00, alone with every other need met, are a sleep. */
  function sleeps(rest: number, n = 40) {
    const { w, ctx, cast } = ready();
    const c = cast[0]!;
    alone(w, c);
    let k = 0;
    for (let i = 0; i < n; i++) {
      endActivity(ctx, c, 'interrupted');
      Object.assign(c.needs, { hunger: 100, hygiene: 100, bladder: 100, social: 100, fun: 100, rest });
      c.mood = 60;
      decide(ctx, c);
      if (c.activity && actionDef(ctx, c.activity)?.kind === 'sleep') k++;
    }
    return k;
  }

  it('only happen by day once someone is actually tired', () => {
    expect(sleeps(data.needs.sleep.napBelow + 5)).toBe(0);
    expect(sleeps(5)).toBeGreaterThan(0);
  });
});

describe('sharing a bed', () => {
  it('is welcome with someone they fancy and unwelcome otherwise', () => {
    const { ctx, cast } = ready();
    const [a, b] = cast as [Contestant, Contestant];
    meet(ctx, a, b);
    const s = data.needs.sleep.share;
    Object.assign(rel(a, b)!, { attraction: s.neutral, label: 'none' });
    expect(bedmateFeeling(ctx, a, b)).toBeCloseTo(0);
    rel(a, b)!.attraction = 9;
    expect(bedmateFeeling(ctx, a, b)).toBeGreaterThan(0);
    rel(a, b)!.attraction = 1;
    expect(bedmateFeeling(ctx, a, b)).toBeLessThan(0);
    rel(a, b)!.label = 'exclusive';
    expect(bedmateFeeling(ctx, a, b)).toBeCloseTo((s.pull * (1 - s.neutral)) / 10 + s.labels.exclusive!);
  });

  it('makes a host who would rather not far less willing to say yes', () => {
    const { ctx, cast } = ready();
    const [host, c] = cast as [Contestant, Contestant];
    meet(ctx, host, c);
    Object.assign(rel(host, c)!, { affection: 50, attraction: 8 });
    const keen = shareOdds(ctx, host, c);
    rel(host, c)!.attraction = 1;
    const knockOddsNow = shareOdds(ctx, host, c) / data.needs.sleep.share.reluctant;
    expect(shareOdds(ctx, host, c)).toBeLessThan(keen);
    expect(knockOddsNow).toBeGreaterThan(0);
  });

  it('leaves a thought about the bedmate after a night beside them', () => {
    const { w, ctx, cast } = ready(at(23));
    const [a, b] = cast as [Contestant, Contestant]; // ranks 1 and 2: the suite's owner and a guest
    alone(w, a, b);
    meet(ctx, a, b);
    Object.assign(rel(a, b)!, { attraction: 9, affection: 40 });
    Object.assign(rel(b, a)!, { attraction: 1, affection: 40 });
    for (const c of [a, b]) {
      endActivity(ctx, c, 'interrupted');
      c.room = 'suite';
      c.needs.rest = 20;
    }
    b.guest = { room: 'suite', host: a.id, since: w.t };
    for (const c of [a, b]) begin(ctx, c, { action: 'sleep', object: a.bed, room: 'suite' });
    w.t += data.thoughts.sleepMinutes;
    for (const c of [a, b]) runActivity(ctx, c);
    expect(a.activity?.bedmate).toBe(b.id);
    expect(b.activity?.bedmate).toBe(a.id);
    for (const c of [a, b]) endActivity(ctx, c, 'woke');
    expect(ids(a)).toContain(data.needs.sleep.share.good);
    expect(ids(b)).toContain(data.needs.sleep.share.bad);
  });
});

describe('lovin\' in bed', () => {
  it('heads for a bed, lets the other in as a guest, and starts when both are there', () => {
    const { w, ctx, cast } = ready();
    const [a, b] = cast as [Contestant, Contestant]; // a has the suite
    alone(w, a, b);
    for (const c of [a, b]) Object.assign(c, { room: 'garden', asleep: false, activity: null });
    meet(ctx, a, b);
    const bed = bedFor(ctx, a, b)!;
    expect([a.bed, b.bed]).toContain(bed.id);
    lovin(ctx, b, a, bed);
    const [owner, other] = bed.id === a.bed ? [a, b] : [b, a];
    expect(other.guest).toMatchObject({ room: bed.room, host: owner.id });
    expect(ctx.events.some((e) => e.type === 'off_to_bed')).toBe(true);
    expect(ctx.events.some((e) => e.type === 'lovin')).toBe(false); // still walking
    for (let i = 0; i < 10 && !ctx.events.some((e) => e.type === 'lovin'); i++) {
      w.t++;
      for (const c of [a, b]) runActivity(ctx, c);
    }
    const e = ctx.events.find((x) => x.type === 'lovin')!;
    expect(e.room).toBe(bed.room);
    expect(e.data!.where).toBe('bed');
    const [lo, hi] = data.romance.proposition.minutes;
    expect(e.data!.minutes).toBeGreaterThanOrEqual(lo);
    expect(e.data!.minutes).toBeLessThanOrEqual(hi);
    expect(a.activity!.endAt).toBe(b.activity!.endAt);
  });

  it('is off for both when one of them is called away', () => {
    const { w, ctx, cast } = ready();
    const [a, b] = cast as [Contestant, Contestant];
    alone(w, a, b);
    for (const c of [a, b]) Object.assign(c, { room: 'garden', asleep: false, activity: null });
    meet(ctx, a, b);
    lovin(ctx, a, b, bedFor(ctx, a, b));
    endActivity(ctx, a, 'interrupted');
    expect(b.activity).toBeNull();
  });

  it('never happens right here with a fully modest partner; boldness grows with drink', () => {
    const { ctx, cast } = ready();
    const [a, b] = cast as [Contestant, Contestant];
    a.modesty = 10;
    b.modesty = 0;
    expect(hereOdds(ctx, a, b, true)).toBe(0);
    a.modesty = 5;
    a.intox = 0;
    const sober = boldness(ctx, a);
    a.intox = 60;
    expect(boldness(ctx, a)).toBeGreaterThan(sober);
  });

  it('in public, upsets the modest who see it and not the shameless', () => {
    const { w, ctx, cast } = ready();
    const [a, b, prude, rake] = cast as [Contestant, Contestant, Contestant, Contestant];
    alone(w, a, b, prude, rake);
    for (const c of [a, b, prude, rake]) Object.assign(c, { room: 'garden', asleep: false, activity: null });
    prude.modesty = 10;
    rake.modesty = 0;
    meet(ctx, a, b);
    lovin(ctx, a, b); // right here
    const e = ctx.events.find((x) => x.type === 'lovin')!;
    expect(e.data!.where).toBe('public');
    expect(ids(prude)).toContain(data.romance.proposition.here.witnessThought);
    expect(ids(rake)).not.toContain(data.romance.proposition.here.witnessThought);
  });

  it('can be proposed in their own bedroom, however low its privacy', () => {
    const { w, ctx, cast } = ready();
    const dorm = cast.find((c) => c.bed?.startsWith('dorm'))!;
    const other = cast.find((c) => c !== dorm)!;
    alone(w, dorm, other);
    Object.assign(dorm, { room: 'dorm', asleep: false });
    Object.assign(other, { room: 'dorm', asleep: false });
    meet(ctx, dorm, other);
    Object.assign(rel(other, dorm)!, { attraction: 10, affection: 100 });
    proposition(ctx, dorm, other);
    expect(ctx.events.some((e) => e.type === 'off_to_bed' || e.type === 'lovin')).toBe(true);
  });
});

describe('privacy', () => {
  it('a modest person minds being seen in the shower; nobody minds a stall', () => {
    const { w, ctx, cast } = ready(at(10));
    const dorm = cast.filter((c) => c.bed?.startsWith('dorm'));
    const [bather, watcher] = dorm as [Contestant, Contestant];
    alone(w, bather, watcher);
    for (const c of [bather, watcher]) Object.assign(c, { room: 'dorm', asleep: false });
    bather.modesty = 10;
    begin(ctx, bather, { action: 'cold_shower', object: 'dorm:shower_cold:1', room: 'dorm', minutes: 10 });
    endActivity(ctx, bather, 'done');
    expect(ids(bather)).toContain(data.actions.modestyThought);

    const { w: w2, ctx: ctx2, cast: cast2 } = ready(at(10));
    const [x, y] = cast2 as [Contestant, Contestant];
    alone(w2, x, y);
    for (const c of [x, y]) Object.assign(c, { room: 'restroom', asleep: false, activity: null, thoughts: [] });
    x.modesty = 10;
    begin(ctx2, x, { action: 'toilet', object: 'restroom:stall_toilet:1', room: 'restroom', minutes: 3 });
    endActivity(ctx2, x, 'done');
    expect(ids(x)).not.toContain(data.actions.modestyThought);
  });
});

describe('sleep disturbance', () => {
  it('a snorer in the room cuts into rest and leaves a grudge on waking', () => {
    const { w, ctx, cast } = ready(at(23));
    const dorm = cast.filter((c) => c.bed?.startsWith('dorm'));
    const [sleeper, snorer] = dorm as [Contestant, Contestant];
    alone(w, sleeper, snorer);
    sleeper.traits = ['hoards'];
    snorer.traits = ['snores'];
    for (const c of [sleeper, snorer]) {
      endActivity(ctx, c, 'interrupted');
      Object.assign(c, { room: 'dorm' });
      c.needs.rest = 20;
      begin(ctx, c, { action: 'sleep', object: c.bed, room: 'dorm' });
    }
    const before = sleeper.needs.rest;
    meet(ctx, sleeper, snorer);
    const fondness = rel(sleeper, snorer)!.affection;
    w.t++;
    runActivity(ctx, snorer);
    runActivity(ctx, sleeper);
    if (sleeper.activity) {
      const full = (data.needs.sleep.restPerHour * 0.8) / 60;
      expect(sleeper.needs.rest - before).toBeCloseTo(full * data.needs.sleep.noise.restMult);
      endActivity(ctx, sleeper, 'woke');
    }
    expect(ids(sleeper)).toContain(data.needs.sleep.noise.thought);
    expect(rel(sleeper, snorer)!.affection).toBeLessThan(fondness);
  });
});

describe('night owls', () => {
  it('keep a later night and sleep through the wake chime', () => {
    const w = createWorld(data, 5);
    step(w, 1440 + at(6, 59));
    // Not anyone on a Wheel suite night, who's moved along at the chime.
    const owl = w.contestants.find((c) => c.asleep && c.activity?.object === c.bed && !c.guest && !w.show.bedSwap?.includes(c.id))!;
    const lark = w.contestants.find((c) => c.asleep && c !== owl);
    owl.traits = ['night_owl'];
    owl.needs.rest = 60;
    owl.needs.bladder = 100;
    for (const c of w.contestants) if (c !== owl) c.traits = ['hoards']; // nobody snoring them awake
    const ctx = { data, st: undefined as never, w, events: [] };
    expect(isNightFor(ctx as never, owl, w.t + 1)).toBe(true);
    step(w, 2);
    expect(owl.asleep).toBe(true);
    if (lark && !lark.traits.includes('night_owl') && lark.needs.rest > data.schedule.wakeChime.minRest) expect(lark.asleep).toBe(false);
  });
});

describe('bedtime', () => {
  /** a (rank 1, the suite) and b, keen on each other, drunk enough that asking is certain. */
  function keen(t: number) {
    const { w, ctx, cast } = ready(t);
    const [a, b] = cast as [Contestant, Contestant];
    alone(w, a, b);
    meet(ctx, a, b);
    for (const [x, y] of [[a, b], [b, a]] as const) {
      Object.assign(rel(x, y)!, { attraction: 10, affection: 100, label: 'dating', kisses: 1 });
      endActivity(ctx, x, 'interrupted');
      Object.assign(x, { room: 'suite', intox: 60, traits: ['hoards'], personality: { ...x.personality, kind: 10, loyal: 5 } });
    }
    b.guest = { room: 'suite', host: a.id, since: w.t };
    return { w, ctx, a, b };
  }
  const lovins = (ctx: { events: { type: string }[] }) => ctx.events.filter((e) => e.type === 'lovin').length;

  it('turns getting into bed together into lovin\', then sleep, and not twice in a night', () => {
    const { w, ctx, a, b } = keen(at(23));
    begin(ctx, b, { action: 'sleep', object: a.bed, room: 'suite' });
    expect(lovins(ctx)).toBe(0); // nobody else in the bed yet
    begin(ctx, a, { action: 'sleep', object: a.bed, room: 'suite' });
    expect(lovins(ctx)).toBe(1);
    expect(a.activity?.action).toBe('lovin');
    for (let i = 0; i < 40 && a.activity?.action === 'lovin'; i++) {
      w.t++;
      for (const c of [a, b]) runActivity(ctx, c);
    }
    for (const c of [a, b]) {
      expect(c.activity?.action).toBe('sleep');
      expect(c.activity?.object).toBe(a.bed);
    }
    expect(lovins(ctx)).toBe(1);
  });

  it('can happen again on waking up beside them', () => {
    const { w, ctx, a, b } = keen(at(23));
    for (const c of [a, b]) begin(ctx, c, { action: 'sleep', object: a.bed, room: 'suite', partner: c === a ? b.id : a.id });
    expect(lovins(ctx)).toBe(0); // they just had it (the sleep remembers)
    w.t += data.thoughts.sleepMinutes;
    endActivity(ctx, a, 'woke');
    expect(lovins(ctx)).toBe(1);
  });

  it('starts with an invitation near bedtime, and both go to bed together', () => {
    const { w, ctx, a, b } = keen(at(14));
    for (const c of [a, b]) c.room = 'common';
    b.guest = null;
    const def = data.social.interactions.find((d) => d.id === 'invite')!;
    expect(moveAllowed(ctx, a, b, def)).toBe(false);
    w.t += at(22) - at(14);
    expect(moveAllowed(ctx, a, b, def)).toBe(true);
    invite(ctx, b, a);
    expect(ctx.events.find((e) => e.type === 'invite')!.data!.answer).toBe('yes');
    const bed = bedFor(ctx, a, b) ?? ctx.st.object.get(a.bed!)!;
    for (const c of [a, b]) expect(c.activity).toMatchObject({ action: 'sleep', object: bed.id });
  });

  it('lets a partner in even if it means being woken', () => {
    const { ctx, a, b } = keen(at(23));
    a.asleep = true;
    const partner = shareOdds(ctx, a, b);
    rel(a, b)!.label = 'none';
    expect(shareOdds(ctx, a, b)).toBeLessThan(partner);
  });
});

