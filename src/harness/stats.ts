// Turning event logs into numbers, and numbers into a report against the success targets.
import type { GameData } from '../data/schema.js';
import { createWorld, MINUTES_PER_DAY, step, type SimEvent, type World } from '../core/index.js';

/** Raw counts for one seed. Plain data so workers can send it back. */
export interface SeedStats {
  seed: number;
  days: number;
  contestantDays: number;
  events: Record<string, number>;
  deathsByCause: Record<string, number>;
  stays: number[]; // minutes aboard, for everyone who left
  minutesByRoom: Record<string, number>;
  minutesByAction: Record<string, number>;
  walkingMinutes: number;
  meals: Record<string, number>; // by food
  notableDays: number;
  sentenceDays: number;
  ceremonies: number;
  ceremoniesWithRankChange: number;
  needsAtNight: Record<string, number>; // summed at each day's end, averaged in the report
  moodAtNight: number;
  knocks: Record<string, number>; // by answer
  relations: Record<string, number>; // directed pairs at each day's end: pairs, friends, rivals, crushes, affection
  infractions: Record<string, number>; // by rule
  sentences: Record<string, number>; // by ladder step
  pointsByType: Record<string, number>; // points awarded, by event type
  meterAtNight: number; // summed at each day's end
  noticeAtNight: number; // contestants at zero at each day's end
  bottomStreaks: number[]; // consecutive ceremonies each rank-7 contestant spent on the couch
  breaks: Record<string, number>; // by kind
  breakLevels: Record<string, number>; // by level
  breakSources: Record<string, number>; // by the grievance that picked it
  desperateAttacks: number; // extreme breaks that only turned violent because the meter was under the doom line
  drinks: Record<string, number>; // by quality
  intoxMinutes: Record<string, number>; // contestant-minutes in each stage
  labels: Record<string, number>; // directed relationships by label at each day's end, plus couples
  couples: Record<string, number>; // nights with a couple aboard, couples formed, ended by breakup or death, lovin' within a couple
  coupleDays: number[]; // how many day-ends each couple lasted, for couples that ended inside the run
  wheel: Record<string, number>; // by segment
  formats: Record<string, number>; // daily events by format, plus booked (by the Wheel) and cancelled
  presses: number[]; // button presses at each Button
  murders: Record<string, number>; // witnessed, found (by someone), announced, accused, unaccused, trials, right, wrong, spared
  bodyMinutes: number[]; // how long an unwitnessed body lay before it was found
  fightsOutsideCage: number;
  beds: Record<string, number>; // lovin' by place and minutes, bed-share asks, nights, bedmates, noise
  wakeMinutes: Record<string, number[]>; // time of day of each morning wake after a night, night owls and others
  fearAtNight: number; // fear thoughts' total at each day's end (capped as mood counts it), summed
  traits: Record<string, { days: number; mood: number; deaths: number; arrivals: number }>; // by trait
  traitCounts: Record<string, number>; // arrivals by how many traits they rolled
  surprise: Record<string, number>; // acts that scored a surprise bonus, by type, and the extra points ("+type")
  people: Record<string, number>; // sampled hourly while awake: "hours", each people thought's value, and mood and hours by friends aboard ("mood.<band>", "hours.<band>")
  reactions: Record<string, number>; // reactions to deaths, by kind
}

function add(m: Record<string, number>, k: string, v = 1): void {
  m[k] = (m[k] ?? 0) + v;
}

export function runSeed(data: GameData, seed: number, days: number): SeedStats {
  const s: SeedStats = {
    seed,
    days,
    contestantDays: 0,
    events: {},
    deathsByCause: {},
    stays: [],
    minutesByRoom: {},
    minutesByAction: {},
    walkingMinutes: 0,
    meals: {},
    notableDays: 0,
    sentenceDays: 0,
    ceremonies: 0,
    ceremoniesWithRankChange: 0,
    needsAtNight: {},
    moodAtNight: 0,
    knocks: {},
    relations: {},
    infractions: {},
    sentences: {},
    pointsByType: {},
    meterAtNight: 0,
    noticeAtNight: 0,
    bottomStreaks: [],
    breaks: {},
    breakLevels: {},
    breakSources: {},
    desperateAttacks: 0,
    drinks: {},
    intoxMinutes: {},
    labels: {},
    couples: {},
    coupleDays: [],
    wheel: {},
    formats: {},
    presses: [],
    murders: {},
    bodyMinutes: [],
    fightsOutsideCage: 0,
    beds: {},
    wakeMinutes: { owl: [], other: [] },
    fearAtNight: 0,
    traits: {},
    traitCounts: {},
    surprise: {},
    people: {},
    reactions: {},
  };
  const traitsOf = new Map<string, string[]>();
  const owls = new Set<string>();
  const wokeToday = new Set<string>();
  const stage = new Map<string, { stage: string; since: number }>();
  let bottom: string | null = null;
  let streak = 0;
  const notable = new Set(data.targets.notable);
  const together = new Map<string, number>(); // couple → day it was first seen
  const world = createWorld(data, seed);
  for (let d = 0; d < days; d++) {
    const events: SimEvent[] = [];
    for (let h = 0; h < 24; h++) {
      events.push(...step(world, 60));
      sampleHour(s, world, data);
    }
    wokeToday.clear();
    let isNotable = false;
    let sentenced = false;
    for (const e of events) {
      add(s.events, e.type);
      if (notable.has(e.type)) isNotable = true;
      if (e.type === 'sentence') sentenced = true;
      tally(s, e);
      if (e.type === 'arrive') {
        const ts = [...(e.data!.traits as string[])];
        traitsOf.set(e.actors[0]!, ts);
        add(s.traitCounts, String(ts.length));
        for (const id of ts) traitRow(s, id).arrivals++;
        // Outgoing bands ride along in the trait table: how the reserved fare.
        const c = world.contestants.find((x) => x.id === e.actors[0]);
        if (c) {
          const band = outgoingBand(c.personality.outgoing);
          ts.push(band);
          traitRow(s, band).arrivals++;
        }
        if (ts.some((id) => (data.traits.traits[id]?.nightShift ?? 0) > 0)) owls.add(e.actors[0]!);
      }
      if (e.type === 'death') for (const id of traitsOf.get(e.actors[0]!) ?? []) traitRow(s, id).deaths++;
      // The first wake after a night, each day: when do night owls get up?
      const m = e.t % MINUTES_PER_DAY;
      if (e.type === 'wake' && (e.data!.slept as number) >= data.thoughts.sleepMinutes && m >= 180 && m < 840 && !wokeToday.has(e.actors[0]!)) {
        wokeToday.add(e.actors[0]!);
        s.wakeMinutes[owls.has(e.actors[0]!) ? 'owl' : 'other']!.push(m);
      }
      if (e.type === 'intox') {
        const id = e.actors[0]!;
        const prev = stage.get(id);
        if (prev && prev.stage !== 'sober') add(s.intoxMinutes, prev.stage, e.t - prev.since);
        stage.set(id, { stage: e.data!.to as string, since: e.t });
      } else if (e.type === 'death') {
        const prev = stage.get(e.actors[0]!);
        if (prev && prev.stage !== 'sober') add(s.intoxMinutes, prev.stage, e.t - prev.since);
        stage.delete(e.actors[0]!);
      }
      if (e.type === 'ceremony') {
        const b = (e.data!.ranks as string[])[6] ?? null;
        if (b === bottom) streak++;
        else {
          if (bottom !== null) s.bottomStreaks.push(streak);
          [bottom, streak] = [b, 1];
        }
      }
    }
    if (isNotable) s.notableDays++;
    if (sentenced) s.sentenceDays++;
    endOfDay(s, world, data, d, together);
  }
  if (bottom !== null) s.bottomStreaks.push(streak);
  for (const prev of stage.values()) if (prev.stage !== 'sober') add(s.intoxMinutes, prev.stage, world.t - prev.since);
  return s;
}

/** A pseudo-trait for the trait table: reserved (0–3), middling (4–6) or outgoing (7–10). */
function outgoingBand(v: number): string {
  return v <= 3 ? '(outgoing 0-3)' : v >= 7 ? '(outgoing 7-10)' : '(outgoing 4-6)';
}

function traitRow(s: SeedStats, id: string) {
  return (s.traits[id] ??= { days: 0, mood: 0, deaths: 0, arrivals: 0 });
}

function tally(s: SeedStats, e: SimEvent): void {
  const d = e.data ?? {};
  if (e.points) add(s.pointsByType, e.type, e.points);
  if (typeof d.surprise === 'number') {
    const got = ((d.awards ?? {}) as Record<string, number>)[e.actors[0]!] ?? 0;
    add(s.surprise, e.type);
    add(s.surprise, `+${e.type}`, got * (1 - 1 / d.surprise));
  }
  switch (e.type) {
    case 'mourned':
      for (const [k, v] of Object.entries(d)) add(s.reactions, k, v as number);
      break;
    case 'infraction':
      add(s.infractions, d.rule as string);
      break;
    case 'sentence':
      add(s.sentences, String(d.step));
      break;
    case 'act.end':
      add(s.minutesByRoom, e.room ?? '?', d.minutes as number);
      add(s.minutesByAction, d.action as string, d.minutes as number);
      s.walkingMinutes += d.walk as number;
      break;
    case 'meal':
      add(s.meals, d.food as string);
      break;
    case 'knock':
      add(s.knocks, d.answer as string);
      break;
    case 'lovin':
      if (d.couple) add(s.couples, 'lovin');
      add(s.beds, `lovin_${d.where as string}`);
      add(s.beds, 'lovinMinutes', d.minutes as number);
      break;
    case 'share_ask':
      add(s.beds, `share_${d.answer as string}`);
      break;
    case 'kept_up':
      add(s.beds, 'keptUpWakings');
      break;
    case 'wake':
      if ((d.slept as number) < 180) break;
      add(s.beds, 'nights');
      if (d.bedmate) add(s.beds, d.glad ? 'sharedGlad' : 'sharedSorry');
      if (d.kept) add(s.beds, 'disturbedNights');
      break;
    case 'ceremony':
      s.ceremonies++;
      if ((d.changes as { from: number | null }[]).some((c) => c.from !== null)) s.ceremoniesWithRankChange++;
      break;
    case 'death':
      add(s.deathsByCause, (d.cause as string) ?? 'unknown');
      if (typeof d.stay === 'number') s.stays.push(d.stay);
      break;
    case 'break':
      add(s.breaks, d.kind as string);
      add(s.breakLevels, d.level as string);
      add(s.breakSources, d.source as string);
      if (d.desperate) s.desperateAttacks++;
      break;
    case 'drink':
      add(s.drinks, d.quality as string);
      break;
    case 'fight':
      if (d.outsideCage) s.fightsOutsideCage++;
      break;
    case 'wheel':
      add(s.wheel, d.segment as string);
      break;
    case 'event_start':
      add(s.formats, d.format as string);
      if (e.actors.length) add(s.formats, 'booked');
      break;
    case 'event_cancelled':
      add(s.formats, 'cancelled');
      break;
    case 'button':
      s.presses.push(d.presses as number);
      break;
    case 'murder':
      if ((d.witnesses as unknown[]).length) add(s.murders, 'witnessed');
      break;
    case 'body_found':
      add(s.murders, d.announced ? 'announced' : 'found');
      s.bodyMinutes.push(d.minutes as number);
      break;
    case 'accusation':
      add(s.murders, 'accused');
      add(s.murders, d.right ? 'accusedKiller' : 'accusedInnocent');
      break;
    case 'no_accusation':
      add(s.murders, 'unaccused');
      break;
    case 'trial':
      add(s.murders, 'trials');
      add(s.murders, d.right ? 'right' : 'wrong');
      break;
  }
}

/** A band for how many friends someone has aboard. */
function friendBand(n: number): string {
  return n === 0 ? '0' : n === 1 ? '1' : n <= 3 ? '2-3' : '4+';
}

/** On the hour, everyone awake: what the people thoughts are worth, and mood by friends aboard. */
function sampleHour(s: SeedStats, w: World, data: GameData): void {
  const p = data.social.people;
  const ids = new Set([p.friend.thought, p.partner.thought, p.enemy.thought, p.worry.thought, p.missing.thought, p.envy.thought]);
  const moments = new Set(Object.values(data.thoughts.moments).map((m) => m.thought));
  for (const c of w.contestants) {
    if (c.asleep) continue;
    add(s.people, 'hours');
    for (const x of c.thoughts) {
      if (ids.has(x.id)) add(s.people, x.id, x.value);
      else if (moments.has(x.id)) add(s.people, `moment.${x.id}`, x.value);
    }
    let friends = 0;
    for (const r of Object.values(c.ledger)) if (r.affection >= data.social.ledger.friendAt) friends++;
    const band = friendBand(friends);
    add(s.people, `hours.${band}`);
    add(s.people, `mood.${band}`, c.mood);
  }
}

function endOfDay(s: SeedStats, w: World, data: GameData, day: number, together: Map<string, number>): void {
  const now = new Set<string>();
  s.contestantDays += w.contestants.length;
  const l = data.social.ledger;
  for (const c of w.contestants) {
    for (const [k, v] of Object.entries(c.needs)) add(s.needsAtNight, k, v);
    s.moodAtNight += c.mood;
    for (const id of [...c.traits, outgoingBand(c.personality.outgoing)]) {
      const t = traitRow(s, id);
      t.days++;
      t.mood += c.mood;
    }
    let fear = 0;
    for (const x of c.thoughts) if (x.value < 0 && data.thoughts.thoughts[x.id]!.source === 'fear') fear += x.value;
    s.fearAtNight += Math.max(fear, -(data.thoughts.caps.fear ?? data.thoughts.sourceCap));
    s.meterAtNight += c.meter;
    if (c.meter <= 0) s.noticeAtNight++;
    for (const r of Object.values(c.ledger)) {
      add(s.relations, 'pairs');
      add(s.relations, 'affection', r.affection);
      if (r.affection >= l.friendAt) add(s.relations, 'friends');
      if (r.affection <= l.rivalAt) add(s.relations, 'rivals');
      if (r.attraction >= l.crushAt) add(s.relations, 'crushes');
      add(s.labels, r.label);
    }
    // A couple: both believe they're dating or exclusive. Mismatched: they believe different things.
    for (const o of w.contestants) {
      if (o.id <= c.id) continue;
      const a = c.ledger[o.id]?.label ?? 'none';
      const b = o.ledger[c.id]?.label ?? 'none';
      const together = (x: string) => x === 'dating' || x === 'exclusive';
      if (together(a) && together(b)) {
        add(s.labels, 'couples');
        now.add(`${c.id}|${o.id}`);
      }
      if (a !== b && (a !== 'none' || b !== 'none')) add(s.labels, 'mismatched');
    }
  }
  // Couples, sampled at day's end: formed, and how long the ones that ended lasted.
  if (now.size) {
    add(s.couples, 'nights');
    add(s.couples, `nights.week${Math.floor(day / 7) + 1}`);
  }
  for (const k of now) if (!together.has(k)) {
    together.set(k, day);
    add(s.couples, 'formed');
  }
  const alive = new Set(w.contestants.map((c) => c.id));
  for (const [k, since] of together) {
    if (now.has(k)) continue;
    together.delete(k);
    s.coupleDays.push(day - since);
    add(s.couples, k.split('|').every((id) => alive.has(id)) ? 'brokeUp' : 'death');
  }
}

// ---------------------------------------------------------------------------------------------
// Report

export interface Metric {
  id: string;
  label: string;
  value: number | null;
  min?: number;
  max?: number;
  ok: boolean | null; // null: nothing to measure yet
}

export interface Report {
  seeds: number;
  days: number;
  metrics: Metric[];
  perWeek: Record<string, number>;
  deathsByCausePerWeek: Record<string, number>;
  finishedStayWeeks: number | null; // the plain average of stays that ended inside the run (biased short)
  timeByRoom: Record<string, number>; // share of contestant time
  timeByAction: Record<string, number>;
  walkingShare: number;
  mealsPerContestantDay: Record<string, number>;
  needsAtNight: Record<string, number>;
  moodAtNight: number;
  fearAtNight: number; // average fear thoughts' total, as mood counts it
  /** By trait: share of arrivals with it, mood at night with it, contestant-weeks aboard per death. */
  traits: { shareOfArrivals: Record<string, number>; mood: Record<string, number>; stayWeeks: Record<string, number | null>; perContestant: Record<string, number> };
  knockYesShare: number | null;
  /** Shares of directed relationships at the end of each day, and the average affection. */
  relations: { friends: number; rivals: number; crushes: number; affection: number } | null;
  /** People as mood, sampled hourly while awake. */
  people: {
    thoughts: Record<string, number>; // each people thought's average value per awake hour
    moments: Record<string, number>; // each joy and pain's average value per awake hour (thoughts.yaml moments)
    moodAwake: number; // average mood over awake hours
    moodByFriends: Record<string, { share: number; mood: number }>; // by friends aboard: share of awake hours, average mood
    reactionsPerWeek: Record<string, number>; // to deaths: grief, gloat, relief, shaken
  };
  show: {
    infractionsPerDay: Record<string, number>; // by rule
    sentencesPerDay: Record<string, number>; // by ladder step
    waivedPerWeek: number;
    fishbowlNightsPerWeek: number;
    pointsPerContestantDay: Record<string, number>; // by event type, with a total
    /** Acts that scored a surprise bonus, a week by type, and the share of all points it added. */
    surprise: { perWeek: Record<string, number>; pointsShare: number };
    meterAtNight: number;
    onNoticeAtNight: number; // share of contestants at zero at day's end
    couchStreak: number | null; // average ceremonies in a row on the couch
  };
  breaks: {
    perContestantDay: number;
    byKind: Record<string, number>; // per week
    byLevel: Record<string, number>; // per week
    bySource: Record<string, number>; // per week
    desperateAttacksPerWeek: number; // violent only because of the murder nudge
  };
  booze: {
    drinksPerContestantDay: Record<string, number>; // by quality, with a total
    stageShare: Record<string, number>; // share of contestant time tipsy, drunk, hammered
  };
  romance: {
    perWeek: Record<string, number>; // flirts, kisses, hookups, exclusives, breakups, betrayals, jealousy
    labelsAtNight: Record<string, number>; // directed relationships by label, per contestant
    couplesAtNight: number; // pairs who both believe they're together, on average
    couples: {
      formedPerWeek: number;
      endedPerWeek: { brokeUp: number; death: number }; // brokeUp: no longer both together, both alive
      lastedDays: number | null; // average, for couples that ended inside the run
      nightShareByWeek: number[]; // share of nights with a couple aboard, week by week
    };
    mismatchedAtNight: number; // pairs whose labels disagree, on average
  };
  wheel: Record<string, number>; // spins landing on each segment, per week
  events: {
    perWeek: Record<string, number>; // by format, plus booked and cancelled
    fightsOutsideCagePerWeek: number; // the fights target counts cage matches too
    pressesPerButton: number | null;
    buttonShare: number | null; // share of Buttons where anyone pressed
  };
  murders: {
    perWeek: Record<string, number>; // what happens after a murder
    bodyHours: number | null; // average hours an unwitnessed body lay before anyone knew
  };
  beds: {
    lovinPerWeek: Record<string, number>; // by where: bed, bedroom (not in a bed), public
    lovinMinutes: number | null; // average length
    offToBedPerWeek: number;
    rainChecksPerWeek: number;
    shareAsks: { perWeek: number; yesShare: number | null };
    sharedNightShare: number | null; // nights (3h+ of sleep) spent beside someone
    sorryShare: number | null; // of those, the share where they'd rather not have
    disturbedNightShare: number | null; // nights cut into by a snorer or hummer
    keptUpWakingsPerWeek: number;
    wakeTime: { owl: number | null; other: number | null }; // average minute of day of the first wake after a night
  };
}

export function report(data: GameData, seeds: SeedStats[]): Report {
  const days = seeds.reduce((a, s) => a + s.days, 0);
  const cDays = seeds.reduce((a, s) => a + s.contestantDays, 0);
  const sum = (f: (s: SeedStats) => Record<string, number>) => {
    const out: Record<string, number> = {};
    for (const s of seeds) for (const [k, v] of Object.entries(f(s))) add(out, k, v);
    return out;
  };
  const events = sum((s) => s.events);
  const perWeek = (n: number) => (n / days) * 7;
  const stays = seeds.flatMap((s) => s.stays);

  const value: Record<string, number | null> = {
    deathsPerWeek: perWeek(events.death ?? 0),
    // Contestant-weeks aboard per departure. Averaging only the stays that ended inside the run
    // would undercount: in a 30-day run only short stays get to finish.
    averageStayWeeks: events.death ? cDays / events.death / 7 : null,
    breaksPerDay: (events.break ?? 0) / days,
    fightsPerWeek: perWeek(events.fight ?? 0),
    brawlsPerHookup: events.lovin ? seeds.reduce((a, s) => a + s.fightsOutsideCage, 0) / events.lovin : null,
    hookupsPerWeek: perWeek(events.lovin ?? 0),
    coupleNightShare: seeds.reduce((a, s) => a + (s.couples.nights ?? 0), 0) / days,
    coupleHookupShare: ratio(seeds.reduce((a, s) => a + (s.couples.lovin ?? 0), 0), events.lovin ?? 0),
    sentenceDayShare: seeds.reduce((a, s) => a + s.sentenceDays, 0) / days,
    rankChangeShare: ratio(seeds.reduce((a, s) => a + s.ceremoniesWithRankChange, 0), seeds.reduce((a, s) => a + s.ceremonies, 0)),
    quietDayShare: 1 - seeds.reduce((a, s) => a + s.notableDays, 0) / days,
  };
  const metrics = data.targets.targets.map((t): Metric => {
    const v = value[t.id] ?? null;
    const ok = v === null ? null : (t.min === undefined || v >= t.min) && (t.max === undefined || v <= t.max);
    return { id: t.id, label: t.label, value: v, ...(t.min !== undefined ? { min: t.min } : {}), ...(t.max !== undefined ? { max: t.max } : {}), ok };
  });

  const byRoom = sum((s) => s.minutesByRoom);
  const byAction = sum((s) => s.minutesByAction);
  const walking = seeds.reduce((a, s) => a + s.walkingMinutes, 0);
  const total = cDays * MINUTES_PER_DAY;
  const share = (m: Record<string, number>) => sortDesc(Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v / total])));
  const needs = sum((s) => s.needsAtNight);
  const knocks = sum((s) => s.knocks);
  const rel = sum((s) => s.relations);
  const perDay = (m: Record<string, number>) => sortDesc(Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v / days])));

  return {
    seeds: seeds.length,
    days: days / Math.max(1, seeds.length),
    metrics,
    perWeek: sortDesc(Object.fromEntries(Object.entries(events).filter(([k]) => !k.startsWith('act.')).map(([k, v]) => [k, perWeek(v)]))),
    finishedStayWeeks: stays.length ? stays.reduce((a, b) => a + b, 0) / stays.length / (MINUTES_PER_DAY * 7) : null,
    deathsByCausePerWeek: Object.fromEntries(Object.entries(sum((s) => s.deathsByCause)).map(([k, v]) => [k, perWeek(v)])),
    timeByRoom: share(byRoom),
    timeByAction: share(byAction),
    walkingShare: walking / total,
    mealsPerContestantDay: Object.fromEntries(Object.entries(sum((s) => s.meals)).map(([k, v]) => [k, v / cDays])),
    needsAtNight: Object.fromEntries(Object.entries(needs).map(([k, v]) => [k, v / cDays])),
    moodAtNight: seeds.reduce((a, s) => a + s.moodAtNight, 0) / cDays,
    fearAtNight: seeds.reduce((a, s) => a + s.fearAtNight, 0) / cDays,
    traits: (() => {
      const rows: Record<string, { days: number; mood: number; deaths: number; arrivals: number }> = {};
      for (const s of seeds) {
        for (const [id, t] of Object.entries(s.traits)) {
          const r = (rows[id] ??= { days: 0, mood: 0, deaths: 0, arrivals: 0 });
          r.days += t.days;
          r.mood += t.mood;
          r.deaths += t.deaths;
          r.arrivals += t.arrivals;
        }
      }
      const counts = sum((s) => s.traitCounts);
      const arrivals = Object.values(counts).reduce((a, b) => a + b, 0);
      const ids = Object.keys(rows).sort((a, b) => rows[b]!.arrivals - rows[a]!.arrivals);
      return {
        shareOfArrivals: Object.fromEntries(ids.map((id) => [id, rows[id]!.arrivals / Math.max(1, arrivals)])),
        mood: Object.fromEntries(ids.map((id) => [id, rows[id]!.days ? rows[id]!.mood / rows[id]!.days : 0])),
        stayWeeks: Object.fromEntries(ids.map((id) => [id, rows[id]!.deaths ? rows[id]!.days / rows[id]!.deaths / 7 : null])),
        perContestant: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v / Math.max(1, arrivals)])),
      };
    })(),
    knockYesShare: ratio(knocks.yes ?? 0, (knocks.yes ?? 0) + (knocks.no ?? 0)),
    show: {
      infractionsPerDay: perDay(sum((s) => s.infractions)),
      sentencesPerDay: perDay(sum((s) => s.sentences)),
      waivedPerWeek: perWeek(events.waived ?? 0),
      fishbowlNightsPerWeek: perWeek(events.fishbowl_night ?? 0),
      pointsPerContestantDay: (() => {
        const p = sum((s) => s.pointsByType);
        const total = Object.values(p).reduce((a, b) => a + b, 0);
        return { total: total / cDays, ...sortDesc(Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v / cDays]))) };
      })(),
      surprise: (() => {
        const x = sum((s) => s.surprise);
        const total = Object.values(sum((s) => s.pointsByType)).reduce((a, b) => a + b, 0);
        const extra = Object.entries(x).filter(([k]) => k.startsWith('+')).reduce((a, [, v]) => a + v, 0);
        return { perWeek: sortDesc(Object.fromEntries(Object.entries(x).filter(([k]) => !k.startsWith('+')).map(([k, v]) => [k, perWeek(v)]))), pointsShare: total ? extra / total : 0 };
      })(),
      meterAtNight: seeds.reduce((a, s) => a + s.meterAtNight, 0) / cDays,
      onNoticeAtNight: seeds.reduce((a, s) => a + s.noticeAtNight, 0) / cDays,
      couchStreak: (() => {
        const st = seeds.flatMap((s) => s.bottomStreaks);
        return st.length ? st.reduce((a, b) => a + b, 0) / st.length : null;
      })(),
    },
    breaks: {
      perContestantDay: (events.break ?? 0) / cDays,
      byKind: sortDesc(Object.fromEntries(Object.entries(sum((s) => s.breaks)).map(([k, v]) => [k, perWeek(v)]))),
      byLevel: Object.fromEntries(Object.entries(sum((s) => s.breakLevels)).map(([k, v]) => [k, perWeek(v)])),
      bySource: sortDesc(Object.fromEntries(Object.entries(sum((s) => s.breakSources)).map(([k, v]) => [k, perWeek(v)]))),
      desperateAttacksPerWeek: perWeek(seeds.reduce((a, s) => a + s.desperateAttacks, 0)),
    },
    booze: (() => {
      const dr = sum((s) => s.drinks);
      const all = Object.values(dr).reduce((a, b) => a + b, 0);
      return {
        drinksPerContestantDay: { total: all / cDays, ...sortDesc(Object.fromEntries(Object.entries(dr).map(([k, v]) => [k, v / cDays]))) },
        stageShare: Object.fromEntries(Object.entries(sum((s) => s.intoxMinutes)).map(([k, v]) => [k, v / total])),
      };
    })(),
    romance: (() => {
      const lb = sum((s) => s.labels);
      const { couples = 0, mismatched = 0, ...labels } = lb;
      const ids = ['flirt', 'rebuff', 'kiss', 'kiss_rebuff', 'invite', 'lovin', 'turned_down', 'exclusive', 'exclusive_refused', 'breakup', 'betrayal', 'jealous'];
      return {
        perWeek: Object.fromEntries(ids.map((k) => [k, perWeek(events[k] ?? 0)])),
        labelsAtNight: sortDesc(Object.fromEntries(Object.entries(labels).filter(([k]) => k !== 'none').map(([k, v]) => [k, v / cDays]))),
        couplesAtNight: couples / days,
        couples: (() => {
          const cp = sum((s) => s.couples);
          const lasted = seeds.flatMap((s) => s.coupleDays);
          return {
            formedPerWeek: perWeek(cp.formed ?? 0),
            endedPerWeek: { brokeUp: perWeek(cp.brokeUp ?? 0), death: perWeek(cp.death ?? 0) },
            lastedDays: lasted.length ? lasted.reduce((a, b) => a + b, 0) / lasted.length : null,
            nightShareByWeek: Array.from({ length: Math.ceil(days / seeds.length / 7) }, (_, i) => {
              const nights = seeds.reduce((a, s) => a + Math.max(0, Math.min(7, s.days - i * 7)), 0);
              return (cp[`nights.week${i + 1}`] ?? 0) / nights;
            }),
          };
        })(),
        mismatchedAtNight: mismatched / days,
      };
    })(),
    wheel: sortDesc(Object.fromEntries(Object.entries(sum((s) => s.wheel)).map(([k, v]) => [k, perWeek(v)]))),
    events: (() => {
      const presses = seeds.flatMap((s) => s.presses);
      return {
        perWeek: Object.fromEntries(Object.entries(sum((s) => s.formats)).map(([k, v]) => [k, perWeek(v)])),
        fightsOutsideCagePerWeek: perWeek(seeds.reduce((a, s) => a + s.fightsOutsideCage, 0)),
        pressesPerButton: presses.length ? presses.reduce((a, b) => a + b, 0) / presses.length : null,
        buttonShare: presses.length ? presses.filter((x) => x > 0).length / presses.length : null,
      };
    })(),
    murders: (() => {
      const mins = seeds.flatMap((s) => s.bodyMinutes);
      return {
        perWeek: Object.fromEntries(Object.entries(sum((s) => s.murders)).map(([k, v]) => [k, perWeek(v)])),
        bodyHours: mins.length ? mins.reduce((a, b) => a + b, 0) / mins.length / 60 : null,
      };
    })(),
    beds: (() => {
      const b = sum((s) => s.beds);
      const lovins = (b.lovin_bed ?? 0) + (b.lovin_bedroom ?? 0) + (b.lovin_public ?? 0);
      const shared = (b.sharedGlad ?? 0) + (b.sharedSorry ?? 0);
      const avg = (xs: number[]) => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : null);
      return {
        lovinPerWeek: { bed: perWeek(b.lovin_bed ?? 0), bedroom: perWeek(b.lovin_bedroom ?? 0), public: perWeek(b.lovin_public ?? 0) },
        lovinMinutes: lovins ? (b.lovinMinutes ?? 0) / lovins : null,
        offToBedPerWeek: perWeek(events.off_to_bed ?? 0),
        rainChecksPerWeek: perWeek(events.rain_check ?? 0),
        shareAsks: { perWeek: perWeek((b.share_yes ?? 0) + (b.share_no ?? 0)), yesShare: ratio(b.share_yes ?? 0, (b.share_yes ?? 0) + (b.share_no ?? 0)) },
        sharedNightShare: ratio(shared, b.nights ?? 0),
        sorryShare: ratio(b.sharedSorry ?? 0, shared),
        disturbedNightShare: ratio(b.disturbedNights ?? 0, b.nights ?? 0),
        keptUpWakingsPerWeek: perWeek(b.keptUpWakings ?? 0),
        wakeTime: { owl: avg(seeds.flatMap((s) => s.wakeMinutes.owl!)), other: avg(seeds.flatMap((s) => s.wakeMinutes.other!)) },
      };
    })(),
    people: (() => {
      const p = sum((s) => s.people);
      const hours = p.hours ?? 0;
      const thoughts: Record<string, number> = {};
      const moments: Record<string, number> = {};
      const moodByFriends: Record<string, { share: number; mood: number }> = {};
      for (const [k, v] of Object.entries(p)) {
        if (k.startsWith('hours.')) {
          const band = k.slice(6);
          moodByFriends[band] = { share: hours ? v / hours : 0, mood: v ? (p[`mood.${band}`] ?? 0) / v : 0 };
        } else if (k.startsWith('moment.')) moments[k.slice(7)] = hours ? v / hours : 0;
        else if (k !== 'hours' && !k.startsWith('mood.')) thoughts[k] = hours ? v / hours : 0;
      }
      const order = ['0', '1', '2-3', '4+'];
      const moodAwake = Object.entries(p).filter(([k]) => k.startsWith('mood.')).reduce((a, [, v]) => a + v, 0) / Math.max(1, hours);
      return {
        thoughts: sortDesc(thoughts),
        moments: sortDesc(moments),
        moodAwake,
        moodByFriends: Object.fromEntries(order.filter((b) => moodByFriends[b]).map((b) => [b, moodByFriends[b]!])),
        reactionsPerWeek: Object.fromEntries(Object.entries(sum((s) => s.reactions)).map(([k, v]) => [k, perWeek(v)])),
      };
    })(),
    relations: rel.pairs ? { friends: (rel.friends ?? 0) / rel.pairs, rivals: (rel.rivals ?? 0) / rel.pairs, crushes: (rel.crushes ?? 0) / rel.pairs, affection: (rel.affection ?? 0) / rel.pairs } : null,
  };
}

const ratio = (a: number, b: number) => (b ? a / b : null);

function sortDesc(m: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]));
}
