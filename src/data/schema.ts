// Zod schemas for every data file. Times written "HH:MM" become minutes after midnight.
import { z } from 'zod';

const clock = z
  .string()
  .regex(/^\d{2}:\d{2}$/, 'expected a time like "07:30"')
  .transform((s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5)));

const num = z.number();
const range = z.tuple([num, num]);
const unit = num.min(0).max(1);
const rankRange = z.tuple([z.number().int().min(1).max(7), z.number().int().min(1).max(7)]);

export const NEEDS = ['hunger', 'rest', 'hygiene', 'bladder', 'social', 'fun', 'comfort'] as const;
export type Need = (typeof NEEDS)[number];
const needEnum = z.enum(NEEDS);
const needMap = z.partialRecord(needEnum, num);

export const scheduleSchema = z.object({
  wakeChime: z.object({ at: clock, minRest: num }),
  arrivals: clock,
  arrivalRoom: z.string(),
  lightsDim: clock,
  meals: z.array(
    z.object({
      id: z.string(),
      group: z.string(),
      from: clock,
      to: clock,
      room: z.string(),
      ranks: rankRange.optional(),
    }),
  ),
  mealMinutes: z.number().int().positive(),
  // A meal opening wakes sleepers who haven't eaten it and are hungrier than this (proposal, Oct 29).
  dinnerBell: z.object({ hungerBelow: num }).optional(),
  ceremony: z.object({
    at: clock,
    minutes: z.number().int().positive(),
    resolveAfter: z.number().int().nonnegative(),
    wakeAbove: num,
    room: z.string(),
  }),
  // The daily event slot and the morning trials are gatherings like the ceremony.
  event: z.object({ at: clock, minutes: z.number().int().positive(), resolveAfter: z.number().int().nonnegative(), wakeAbove: num }),
  trials: z.object({
    at: clock,
    minutes: z.number().int().positive(),
    resolveAfter: z.number().int().nonnegative(),
    wakeAbove: num,
    room: z.string(),
  }),
});

export const roomsSchema = z.object({
  rooms: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      access: z.enum(['all', 'ranks', 'occupants', 'robots']),
      ranks: rankRange.optional(),
      privacy: num.min(0).max(1),
      temperature: num,
      comfort: num.min(0).max(100),
      objects: z.record(z.string(), z.number().int().positive()),
      glass: z.string().optional(),
    }),
  ),
});

// The floor plan (plans.yaml). Rectangles are [x, y, width, height] in tiles; an opening is the
// wall segment [x1, y1, x2, y2] it sits on.
const rect = z.tuple([num, num, num.positive(), num.positive()]);
const segment = z.tuple([num, num, num, num]);
const planSchema = z.object({
  size: z.tuple([num.positive(), num.positive()]),
  through: z.array(z.string()).default([]),
  windows: z.array(segment).default([]),
  rooms: z.record(z.string(), rect),
  corridors: z.array(z.object({ id: z.string(), name: z.string(), rect })).default([]),
  openings: z.array(z.object({ a: z.string(), b: z.string(), kind: z.enum(['door', 'arch', 'glass', 'bend']), at: segment })),
});
export const plansSchema = z.object({
  use: z.string(),
  walkSpeed: num.positive(),
  detour: num.min(1),
  corridor: z.object({ privacy: num.min(0).max(1), temperature: num, comfort: num.min(0).max(100) }),
  soundproof: z.array(z.string()).default([]),
  plans: z.record(z.string(), planSchema),
});
export type PlanDef = z.output<typeof planSchema>;

export const actionSchema = z.object({
  id: z.string(),
  label: z.string(),
  kind: z.enum(['timed', 'sleep', 'toilet', 'thermostat', 'drink']).default('timed'),
  minutes: z.number().int().positive().optional(),
  gains: needMap.default({}),
  speciesGains: z.record(z.string(), needMap).default({}),
  comfort: num.optional(),
  quality: num.optional(),
  recreation: z.string().optional(),
  company: z.boolean().default(false),
  loud: z.boolean().default(false),
  private: z.boolean().default(false),
  assigned: z.boolean().default(false),
  cost: num.default(0),
  speciesCost: z.record(z.string(), num).default({}),
  tags: z.array(z.string()).default([]),
  // Extra tags during the contestant's night (the hot tub after hours is risky).
  nightTags: z.array(z.string()).default([]),
  onlySpecies: z.array(z.string()).optional(),
  notSpecies: z.array(z.string()).optional(),
  ranks: rankRange.optional(),
  logs: z.string().optional(),
  thought: z.string().optional(),
  booze: z.string().optional(),
  when: z.string().optional(),
  unless: z.string().optional(),
  // Proposal (need sliders): uses up a snack from the machine's stock or from their own stash.
  takes: z.enum(['machine', 'stash']).optional(),
  // Proposals (Oct 30, wants and things to do: activities.yaml).
  trains: z.enum(['fight', 'dance']).optional(),
  forEvent: z.string().optional(),
  window: z.tuple([clock, clock]).optional(),
  players: z.number().int().min(2).optional(),
  primps: z.boolean().default(false),
});

export const objectsSchema = z.object({
  types: z.record(
    z.string(),
    z.object({ capacity: z.number().int().positive(), actions: z.array(actionSchema) }),
  ),
  personal: z.array(actionSchema),
});

export const needsSchema = z.object({
  needs: z.record(needEnum, z.object({ drainPerHour: num.min(0), weight: num, start: range })),
  asleepDrain: z.record(needEnum, num),
  sleep: z.object({
    restPerHour: num,
    // The body clock (proposal, Oct 29): through the day, the rest below which they can fall asleep,
    // as points on the clock, straight lines between them. They wake once rest is `margin` above it.
    clock: z.object({
      sleepLine: z.array(z.object({ at: clock, rest: num.min(0).max(100) })).min(2),
      margin: num.min(0),
      // From this line up, a bed of their own pulls like at night (their real bedtime).
      bedtime: num,
      // Sleeping somewhere uncomfortable (a spot's comfort under `below`): a chance an hour of waking.
      restless: z.object({ below: num, perHour: unit }),
    }),
    // Sharing a bed: how a contestant feels about a bedmate, and the thoughts it leaves.
    share: z.object({ neutral: num, pull: num, partners: z.array(z.string()).default([]), reluctant: unit, refused: z.string(), labels: z.record(z.string(), num).default({}), good: z.string(), bad: z.string() }),
    // Noisy people (traits with `noise`) disturb sleepers in the same room.
    noise: z.object({ restMult: num.min(0), wakeChance: unit, cost: num, thought: z.string(), affection: num, throughWall: unit, lieAwake: z.number().int().nonnegative().default(0) }),
  }),
  bladder: z.object({ criticalBelow: num, waitMinutes: z.number().int().positive() }),
  // Proposal (fun and social, Oct 27): drain multipliers in the wrong places, and recreation
  // wearing thin when repeated.
  situational: z.object({
    alone: z.partialRecord(needEnum, num.min(0)).default({}),
    idle: z.object({ actions: z.array(z.string()), drain: z.partialRecord(needEnum, num.min(0)) }),
    confined: z.partialRecord(needEnum, num.min(0)).default({}),
  }),
  tolerance: z.object({ needs: z.array(needEnum), perUse: num.min(0), recoverPerHour: num.min(0), floor: unit, appealFloor: unit.default(1) }),
  // Proposal (boredom, Oct 29): the bored stir things up. b = (below − fun) ÷ below, 0..1.
  boredom: z.object({
    below: num.positive(),
    chance: num.min(0),                          // interaction chance × 1 + chance × b
    interactions: z.record(z.string(), num),     // an interaction's weight × 1 + this × b
    tags: z.record(z.string(), num),             // an action with this tag scores × 1 + this × b
  }).optional(),
  comfortFollowPerHour: num,
  // Proposal (need sliders, Oct 28): what people do wears on them. By action id: extra drain an
  // hour while doing it (negative eases it), and a cost once it's done.
  exertion: z.record(z.string(), z.object({ perHour: needMap.default({}), cost: needMap.default({}) })).default({}),
  // Tired people have a shorter fuse; the grubby are less attractive to everyone nearby.
  fuse: z.object({ restBelow: num, breakLines: num, fight: num.min(0) }).optional(),
  grubby: z.object({ below: num, attraction: num }).optional(),
});

export const speciesSchema = z.object({
  species: z.record(
    z.string(),
    z.object({
      weight: num.positive(),
      comfort: range,
      size: num.positive(),
      statMean: z.record(z.string(), num).default({}),
      statShift: z.record(z.string(), num).default({}),
      drain: needMap.default({}),
    }),
  ),
});

const rankKey = z.enum(['1', '2', '3', '4', '5', '6', '7']);

export const clothingSchema = z.object({
  byRank: z.record(rankKey, z.object({ warmth: num, beauty: num, thought: z.string().optional() })),
});

export const ranksSchema = z.object({
  newcomerRank: z.number().int().min(1).max(7),
  thoughts: z.object({ up: z.string(), down: z.string() }),
  ranks: z.record(rankKey, z.object({ bed: z.string(), food: z.string() })),
  food: z.record(z.string(), z.object({ hunger: num, thought: z.string().optional() })),
  // Proposal (need sliders, Oct 28): each meal group puts out a spread, served in rank order.
  spread: z.object({ perEater: num.positive(), last: z.array(z.string()).default([]), secondsBelow: num, greed: unit, minPortion: unit, secondsMinutes: z.number().int().positive(), empty: z.string() }).optional(),
  // The snack machine holds a day's stock, restocked at `restock`; hoarders stash extras.
  snacks: z
    .object({
      stock: z.number().int().nonnegative(),
      restock: clock,
      hunger: num,
      carry: unit,
      max: z.number().int().nonnegative(),
      empty: z.string(),
      share: z.object({ affection: num, thought: z.string() }),
      swipe: z.object({ noticed: unit, affection: num, thought: z.string() }),
    })
    .optional(),
});

export const temperatureSchema = z.object({
  clamp: range,
  driftPerTenMinutes: num.positive(),
  comfortPerDegree: num,
  botheredAffection: num,
});

export const AXES = ['outgoing', 'kind', 'honest', 'calm', 'loyal', 'brave', 'vain', 'playful'] as const;
export type Axis = (typeof AXES)[number];
const axisEnum = z.enum(AXES);

export const personalitySchema = z.object({
  axes: z.array(axisEnum),
  k: num,
  needDrain: z.partialRecord(needEnum, axisEnum),
  tags: z.record(z.string(), z.array(z.object({ axis: axisEnum, k: num.optional() }))),
  mood: z.object({
    base: num,
    lowBelow: num,
    multipliers: z.record(z.string(), num),
    // People as mood: a good mood makes kind acts likelier, a bad one slights (interaction weights).
    highAbove: num.default(101),
    interactions: z.object({ low: z.record(z.string(), num).default({}), high: z.record(z.string(), num).default({}) }).default({ low: {}, high: {} }),
  }),
});

export const actionsSchema = z.object({
  noise: range,
  topChoices: z.number().int().positive(),
  walkCostPerMinute: num,
  // Actions with this tag are done for themselves: the people in the room add no pull (proposal, Oct 29).
  choreTag: z.string().default('chore'),
  withinOfBest: unit.default(0),
  modestyCost: num,
  modestyThought: z.string(), // finishing an exposed action with someone watching
  recreationTaste: z.object({ favorite: num, other: num }),
  mealPull: num,
  nightSleepPull: num,
  idle: z.object({ minutes: z.number().int().positive(), score: num }),
  encore: unit,
});

const bell = z.object({ mean: num, sd: num.nonnegative() });

export const generatorSchema = z.object({
  stat: bell,
  candidatesPerSlot: z.number().int().positive(),
  gender: z.array(bell.extend({ weight: num.positive() })).min(1),
  attraction: bell,
  pronouns: z.object({
    sheBelow: num,
    heAbove: num,
    randomChance: num.min(0).max(1),
    options: z.array(z.string()).length(3),
  }),
  recreation: z.array(z.string()).min(1),
  favoriteRecreations: z.number().int().nonnegative(),
  names: z.array(z.string()).min(14),
});

export const targetsSchema = z.object({
  targets: z.array(
    z.object({ id: z.string(), label: z.string(), min: num.optional(), max: num.optional() }),
  ),
  notable: z.array(z.string()),
});

export const meterSchema = z.object({
  start: num,
  max: num.positive(),
  drainPerHour: num.nonnegative(),
  doomed: z.object({ thought: z.string(), below: num, from: num, to: num }),
});

const amounts = z.object({
  each: num.optional(),
  actor: num.optional(),
  target: num.optional(),
  winner: num.optional(),
  loser: num.optional(),
  witnesses: num.optional(),
});

const awardSchema = amounts.extend({
  only: z.string().optional(),
  witnessed: z.boolean().default(true),
  by: z.string().optional(),
  cases: z.record(z.string(), amounts).default({}),
  meterOnly: z.boolean().default(false),
  secret: num.optional(),
});

export const scoringSchema = z.object({
  awards: z.record(z.string(), awardSchema),
  modifiers: z.object({
    witnessEach: num,
    witnessMax: num,
    repeatDays: num.nonnegative(),
    repeatFactor: unit,
    boredom: unit,
    ownRepeat: unit,
  }),
  ratings: z.object({
    from: num.positive(),
    power: num.positive(),
    actions: num.nonnegative(),
    interactions: num.nonnegative(),
    chance: num.nonnegative(),
    shyness: unit.default(0),
    pays: z.record(z.string(), z.string()).default({}),
    ignore: z.array(z.string()).default([]),
  }),
  surprise: z.object({
    bonus: num.nonnegative(),
    acts: z.record(z.string(), z.string()).default({}),
  }),
});

const sentenceSchema = z.object({ meter: num.optional(), fishbowl: z.enum(['night', 'day']).optional() });

export const rulesSchema = z.object({
  infractions: z.record(
    z.string(),
    z.object({
      label: z.string(),
      step: z.number().int().positive(),
      collective: z.array(z.string()).default([]),
      blame: num.default(0),
    }),
  ),
  sentences: z.array(sentenceSchema).min(1),
  waiver: z.object({ minPoints: num, chance: unit }),
  sneak: z.object({ cost: num, honestK: num, braveK: num, peril: z.object({ below: num.positive(), k: num.nonnegative() }) }),
  fighting: z.enum(['both', 'swinger']),
  sentencedThought: z.string(),
  fishbowl: z.object({
    room: z.string(),
    release: clock,
    dayHours: num.positive(),
    douseEvery: z.number().int().positive(),
    douseHygiene: num,
    douseSpecies: z.record(z.string(), num).default({}),
    thought: z.string(),
  }),
  spacing: z.object({
    watched: z.string(),
    died: z.string(),
    friend: z.string(),
    rival: z.string(),
    diedPerAffection: num,
    dislikedAt: num,
    disliked: z.string(),
    kindForgives: num,
  }),
});


export const DIMS = ['affection', 'trust', 'fear', 'attraction'] as const;
export type Dim = (typeof DIMS)[number];
const dimMap = z.partialRecord(z.enum(DIMS), num);

const scaleBy = z.union([axisEnum, z.enum(['affection', 'attraction', 'chemistry', 'privacy', 'monogamy', 'hungry', 'targetHungry'])]);

export const MOVES = ['flirt', 'kiss', 'proposition', 'invite', 'exclusive', 'breakup', 'gift', 'share_snack', 'swipe_snack'] as const;
export type Move = (typeof MOVES)[number];
export const LABELS = ['none', 'flirting', 'fling', 'dating', 'exclusive', 'ex'] as const;
export type Label = (typeof LABELS)[number];

export const interactionSchema = z.object({
  id: z.string(),
  weight: num.nonnegative(),
  scale: z.array(z.object({ by: scaleBy, k: num.optional() })).default([]),
  needs: z
    .object({
      attraction: num.optional(),
      affection: num.optional(),
      labels: z.array(z.enum(LABELS)).optional(),
      flirted: z.boolean().optional(),
      inventory: z.boolean().optional(),
      stash: z.boolean().optional(), // they have a snack stashed
      theirStash: z.boolean().optional(), // the target has one
    })
    .default({}),
  move: z.enum(MOVES).optional(),
  witnessThought: z.string().optional(),
  social: num.default(0),
  knows: num.default(0),
  actor: dimMap.default({}),
  target: dimMap.default({}),
  thought: z.string().optional(),
  fight: z.boolean().default(false),
  targetGains: needMap.default({}),
  glass: z.enum(['outside', 'either']).optional(),
  passing: z.boolean().default(false),
});

export const socialSchema = z.object({
  every: z.number().int().positive(),
  base: num,
  absorbed: z.object({ kinds: z.array(z.string()), tags: z.array(z.string()), actions: z.array(z.string()) }),
  passing: unit,
  partner: z.object({ affection: num, attraction: num, min: num.positive() }),
  factorRange: range,
  interactions: z.array(interactionSchema).min(1),
  flirt: z.object({
    successScale: num,
    success: z.object({ affection: num, attraction: num }),
    rebuffed: z.string(),
    awkward: z.string(),
  }),
  fight: z.object({
    chance: unit,
    calmK: num,
    minutes: z.number().int().positive(),
    power: z.object({ strength: num, stamina: num, die: num.nonnegative() }),
    damage: range,
    serious: z.object({ chance: unit, extra: num }),
    healthFloor: num,
    cathartic: unit,
    affection: num,
    loserFear: num,
    won: z.string(),
    lost: z.string(),
    cageRoom: z.string(),
    witnessThought: z.string().optional(),
  }),
  health: z.object({ recoverPerHour: num.nonnegative() }),
  ledger: z.object({
    keepReasons: z.number().int().positive(),
    fadePerDay: z.object({ affection: unit, trust: unit, fear: unit }),
    loyalK: num,
    loverFade: num.nonnegative(),
    // People as mood (step 3): dislike fades at this share of the usual rate, × 1 + calmK × (calm − 5) ÷ 5.
    dislikeFade: num.min(0).default(1),
    dislikeCalmK: num.default(0),
    friendAt: num,
    rivalAt: num,
    crushAt: num,
  }),
  attraction: z.object({
    looks: num,
    personality: num,
    chemistrySd: num.nonnegative(),
    fitScale: num.positive(),
    scale: num.positive(),
    deception: unit,
    firstImpression: unit,
    approach: unit,
  }),
  companyPull: z.object({ affection: num, attraction: num, fear: num, private: num.default(0), lonely: num }),
  // Company (proposal, Oct 29): how much company feels right is personal. `company` is how much
  // they've had lately; their social need is how close that is to their own comfortable point.
  company: z.object({
    point: z.tuple([num, num]),             // their comfortable level at outgoing 0 and at 10
    width: num.positive(),                  // social = 100 − |company − point| × 100 ÷ width
    levels: z.array(num).min(2),            // where company heads with 0, 1, 2… others awake in the room (the last for more)
    talkLevel: num,                         // and this much higher in a conversation
    followPerHour: num,                     // how fast it moves there
    asleepPerHour: num,                     // asleep it falls this (they wake wanting company)
    fit: num,                               // score weight of an option's company fit
    background: unit,                       // interaction chance × this outside a conversation or a social activity
    talk: z.object({
      action: z.string(),                   // the personal action that is a conversation
      chance: num,                          // interaction chance × this in a conversation (with the partner)
      pull: num,                            // base appeal of a conversation
      odds: z.object({ base: unit, affection: num, min: unit, tired: unit }), // their yes: (base + affection ÷ 100 × affection) × (1 − tired × how worn out they are)
      refused: z.string(),                  // the asker's thought on a no
      within: z.number().int().nonnegative(), // only people this many minutes' walk away or less
      weights: z.record(z.string(), num).default({}), // in a conversation, these interactions with the partner × this
    }),
  }),
  // People as mood (DESIGN.md Part two, Personality, traits and mood: People as mood, grudges and friction).
  people: z.object({
    friend: z.object({ thought: z.string(), at: num }),
    partner: z.object({ thought: z.string(), labels: z.array(z.enum(LABELS)) }),
    enemy: z.object({ thought: z.string(), at: num }),
    worry: z.object({ thought: z.string(), at: num }),
    missing: z.object({ thought: z.string(), labels: z.array(z.enum(LABELS)), hours: num.positive() }),
    envy: z.object({ thought: z.string(), at: num }),
    friction: z.object({ axes: z.array(axisEnum).min(1), pivot: num.positive(), rate: num.nonnegative() }),
  }),
  knock: z.object({
    actions: z.array(z.string()),
    base: num,
    affection: num,
    attraction: num,
    kindK: num,
    asleep: unit,
    pesterHours: num.nonnegative(),
    pesterAffection: num,
    turnedAway: z.string(),
    waitMinutes: z.number().int().positive(),
    cost: num,
    repeat: num.nonnegative(),
  }),
});

// A thought can also scale by modesty (a taste, not a personality axis): minding being seen.
const axisScale = z.array(z.object({ axis: z.union([axisEnum, z.literal('modesty')]), k: num.default(0.5) })).default([]);

export const thoughtsSchema = z.object({
  volatileK: num,
  species: z.record(z.string(), z.record(z.string(), num)).default({}),
  sources: z.record(z.string(), axisScale).default({}),
  sourceCap: num.min(0),
  // Per-source caps that replace sourceCap (proposal, fear tuning: fear's is lower).
  caps: z.record(z.string(), num.min(0)).default({}),
  // "Trapped here" from arrival, easing from `from` to `to` over their first `days` aboard.
  trapped: z.object({ thought: z.string(), from: num, to: num, days: num.positive() }),
  // `side` (social only): the row applies only below (`under`) or above (`over`) their comfortable company point.
  needs: z.array(z.object({ need: needEnum, below: num.optional(), above: num.optional(), thought: z.string(), side: z.enum(['under', 'over']).optional() }).refine((x) => (x.below === undefined) !== (x.above === undefined), 'give exactly one of below or above')),
  temperature: z.object({ cold: z.string(), hot: z.string(), perDegree: num, max: num }),
  sleepMinutes: num.nonnegative(),
  // Joys and pains from the blend: moments that leave a thought, its scale reading the sliders.
  moments: z.object({
    helped: z.object({ thought: z.string(), interactions: z.array(z.string()) }),
    risky: z.object({ thought: z.string(), tag: z.string(), infractions: z.array(z.string()).default([]) }),
    guilt: z.object({ thought: z.string(), infractions: z.array(z.string()) }),
    watched: z.object({ thought: z.string(), events: z.array(z.string()) }),
    breakdown: z.object({ thought: z.string() }),
  }),
  thoughts: z.record(
    z.string(),
    z.object({
      label: z.string(),
      value: num,
      species: z.record(z.string(), num).default({}),
      hours: num.positive(),
      stack: z.number().int().positive(),
      source: z.string(),
      scale: axisScale,
      // Proposal (fun and social, Oct 27): needs it knocks down (or tops up) when it happens.
      needs: z.partialRecord(needEnum, num).default({}),
    }),
  ),
});

const stageSchema = z.object({
  id: z.string(),
  at: num,
  interaction: num.default(1),
  social: num.default(1),
  fight: num.default(1),
  walk: num.default(1),
  moves: z.record(z.string(), num).default({}),
  axes: z.partialRecord(axisEnum, num).default({}),
  // Beer goggles: attraction points added whenever they judge someone (gates and odds).
  goggles: num.default(0),
  // Their odds of saying yes to a kiss or a proposition, ×.
  agree: num.default(1),
  // Loose lips: per chat (romance.yaml gossip.interactions), the chance they blurt something they
  // know; and the chance they confess their own cheating to the one they're cheating on.
  lips: unit.default(0),
  confess: unit.default(0),
});

export const boozeSchema = z.object({
  order: z.array(z.string()).min(1),
  byRank: z.record(rankKey, z.string()),
  qualities: z.record(z.string(), z.object({ fun: num, thought: z.string(), hangover: num.nonnegative() })),
  intoxication: z.object({ perDrink: num.positive(), fallPerHour: num.positive() }),
  bladderPerDrink: num,
  stages: z.array(stageSchema),
  blackout: unit,
  hangover: z.object({ thought: z.string(), min: num, from: num, to: num, drinkMult: unit }),
  together: z.object({ affection: num }),
  pull: z.object({
    taste: num,
    social: num,
    self: num,
    lowMood: num.positive(),
    selfVolatileK: num,
    // Self-control: a drink scores × (1 − intoxication ÷ limit), never below 0, where
    // limit = base + perDrinking × drinking + miserable × (lowMood − mood) ÷ lowMood.
    limit: z.object({ base: num.positive(), perDrinking: num.nonnegative(), miserable: num.nonnegative() }),
  }),
  carry: z.object({ chance: unit, kindK: num, max: z.number().int().nonnegative() }),
  gift: z.object({ affection: num, better: num, thought: z.string() }),
  // Hammered, every hour: the chance they throw up (hygiene, their thought if anyone saw, the
  // witnesses' thought) and the chance they pass out where they are.
  puke: z.object({ perHour: unit, hygiene: num, thought: z.string(), witnessThought: z.string() }),
  passOut: z.object({ perHour: unit, minutes: z.tuple([z.number().int().positive(), z.number().int().positive()]), thought: z.string() }),
});

export const LEVELS = ['minor', 'major', 'extreme'] as const;
export type Level = (typeof LEVELS)[number];

const breakKind = z.object({
  label: z.string(),
  room: z.string(),
  target: z.enum(['about', 'top', 'feared', 'friend']).optional(),
  minutes: z.number().int().positive(),
  gains: needMap.default({}),
  drinks: z.number().int().nonnegative().default(0),
  infraction: z.string().optional(),
  insults: z.number().int().positive().optional(),
  wreck: z.object({ thought: z.string(), affection: num }).optional(),
  attack: z.boolean().default(false),
  // On arrival, tells the whole room what the target did (the latest romance they know of).
  airs: z.boolean().default(false),
  // On arrival, pours it all out to the target: a deep talk, and whatever they know spills.
  vent: z.boolean().default(false),
  // Every this many minutes, a slight at whoever's here.
  rant: z.number().int().positive().optional(),
  // What it becomes when it can't happen (no target, or somewhere they can't go), before `fallback`.
  orElse: z.string().optional(),
});

export const breaksSchema = z.object({
  lines: z.object({ minorBase: num, minorPerVolatile: num, majorShare: unit, extremeShare: unit }),
  chance: z.object({ minor: unit, major: unit, extreme: unit }),
  catharsis: z.string(),
  sources: z.record(z.string(), z.object({ minor: z.string(), major: z.string(), extreme: z.string() })),
  // A source's bad thoughts count × this when picking the biggest grievance (mood is unchanged).
  weights: z.record(z.string(), num.positive()).default({}),
  fallback: z.string(),
  kinds: z.record(z.string(), breakKind),
  passion: z.object({
    kindAtMost: num,
    calmAtMost: num,
    // The murder nudge: below the meter's doom line both cutoffs loosen by this much.
    desperate: num.nonnegative().default(0),
    otherwise: z.string(),
    // A non-violent collapse by grievance (a source not listed collapses into `otherwise`).
    collapse: z.record(z.string(), z.string()).default({}),
    firstBlow: num,
    base: unit.default(0),
    // While a body lies unfound or a trial is pending, attacks don't kill.
    oneAtATime: z.boolean().default(false),
    perStrength: num.nonnegative(),
    weapons: z.record(z.string(), num).default({}),
    follow: z.number().int().nonnegative(),
    witnessFear: num,
    witnessThought: z.string(),
    feared: num,
  }),
});

export const romanceSchema = z.object({
  kiss: z.object({ successScale: num, label: z.enum(LABELS), datingAfter: z.number().int().positive(), thought: z.string(), rebuffed: z.string() }),
  proposition: z.object({
    attraction: num,
    affection: num,
    privacy: unit,
    successScale: num,
    turnedDown: z.string(),
    minutes: z.tuple([z.number().int().positive(), z.number().int().positive()]),
    thought: z.string(),
    bond: num,
    disturbed: z.string(),
    heard: z.string(),
    datingAt: num,
    datingPerLovin: num.nonnegative(),
    // Where: a bed by default; sometimes right here, which is a show for anyone watching.
    bed: z.object({ walkCost: num, crowd: num }),
    here: z.object({ chance: unit, noBed: unit, modestyK: num, braveK: num, witnessThought: z.string() }),
    kissesFirst: z.number().int().nonnegative(),
  }),
  notDuring: z.array(z.string()),
  bedtime: z.object({ chance: unit, asleep: unit, doze: num.nonnegative(), morning: unit }),
  invite: z.object({ lead: num.nonnegative() }),
  exclusive: z.object({ loyalK: num, thought: z.string(), refused: z.string() }),
  breakup: z.object({ affectionBelow: num, dumped: z.string() }),
  attachedK: num,
  betrayal: z.object({ affection: num, thought: z.string(), confront: unit }),
  jealousy: z.object({
    affection: num,
    thought: z.string(),
    // Only someone who still cares is jealous: affection and attraction for the partner at least this.
    cares: z.object({ affection: num, attraction: num }),
    // Hours before seeing the same rival again makes them jealous all over again.
    again: num.nonnegative().default(0),
    // The grudge against the rival: affection × 1 + kindK × (kind − 5) ÷ 5.
    rival: z.object({ affection: num, kindK: num }),
    // Pining: romance toward the partner × 1 + (boost − 1) × (1 + monogamyK × (monogamy − 5) ÷ 5) while it lasts.
    pining: z.object({ thought: z.string(), boost: num.positive(), monogamyK: num }),
  }),
  guilty: z.string(),
  // What people know about who's been with whom: the last `remember` things, for `hours`.
  gossip: z.object({ remember: z.number().int().positive(), hours: num.positive(), interactions: z.array(z.string()), sober: unit.default(0) }),
});

export const wheelSchema = z.object({
  thought: z.string().optional(),
  segments: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        weight: num.nonnegative(),
        effect: z.enum(['space', 'immunity', 'meter', 'event', 'swap_beds', 'fishbowl', 'station', 'secrets', 'pick_two', 'nothing']),
        thought: z.string().optional(),
        to: num.optional(),
        event: z.string().optional(),
        against: z.enum(['top', 'random']).optional(),
        sudden: z.boolean().default(false),
        prize: z.boolean().default(false),
        fishbowl: z.enum(['night', 'day']).optional(),
        station: z.array(z.string()).default([]),
        blame: num.default(0),
        amount: num.optional(),
      }),
    )
    .min(1),
  effects: z.record(
    z.string(),
    z.object({ label: z.string(), meals: z.array(z.string()).default([]), booze: z.string().optional() }),
  ),
});

export const FORMATS = ['cage_match', 'dance_off', 'button'] as const;
export type Format = (typeof FORMATS)[number];

export const eventsSchema = z.object({
  rotation: z.array(z.enum(FORMATS)).min(2),
  cage_match: z.object({ room: z.string(), watchFun: num, rematch: num.nonnegative(), prizeThoughts: z.boolean().default(true) }),
  dance_off: z.object({
    room: z.string(),
    dancers: z.tuple([z.number().int().min(2), z.number().int().min(2)]),
    playful: num,
    stamina: num,
    beauty: num,
    crowd: num,
    die: num.nonnegative(),
    watchFun: num,
    won: z.string(),
    lost: z.string(),
  }),
  button: z.object({
    room: z.string(),
    base: unit,
    kindK: num,
    loyalK: num,
    braveK: num,
    desperateK: num,
    gain: num,
    loss: num,
    revealAt: clock,
    affection: num,
  }),
});

export const trialsSchema = z.object({
  foundThought: z.string(),
  nearMinutes: num.nonnegative(),
  suspicion: z.object({ witnessed: num, dislike: num, fear: num, enemy: num, near: num }),
  accuseAt: num,
  accused: z.object({ thought: z.string(), affection: num }),
  fearNudge: num,
  testimony: z.object({ base: num, trust: num }),
  survivedThought: z.string(),
  memory: z.object({ affection: num, fear: num, friend: num, floor: num, thought: z.string(), near: z.string() }),
});

const leanBy = z.union([axisEnum, z.enum(['modesty', 'drinking', 'monogamy'])]);
const mults = z.record(z.string(), num.min(0)).default({});

export const traitSchema = z.object({
  label: z.string(),
  group: z.string(),
  rule: z.string(),
  weight: num.nonnegative(),
  lean: z.object({ by: leanBy, k: num.optional() }).optional(),
  excludes: z.array(z.string()).default([]),
  tags: mults,
  desperate: mults,
  interactions: mults,
  nearby: mults,
  thoughts: mults,
  sources: mults,
  drain: z.partialRecord(needEnum, num.min(0)).default({}),
  scores: mults,
  thought: z.string().optional(),
  breakLine: num.default(0),
  fight: num.min(0).default(1),
  fightOn: z.array(z.string()).default([]),
  charm: num.min(0).default(1),
  aura: num.default(0),
  dislikeFade: num.min(0).default(1),
  partnerPull: num.min(0).default(1),
  crowd: z.object({ at: z.number().int().positive(), thought: z.string() }).optional(),
  // Proposal (company, Oct 29): their comfortable company point moves this much (Loner −20).
  companyPoint: num.default(0),
  watched: z.object({ events: z.array(z.string()), thought: z.string() }).optional(),
  attraction: num.min(0).default(1),
  datingAfter: z.number().int().positive().optional(),
  attached: num.min(0).default(1),
  confront: unit.optional(),
  modesty: num.min(0).max(10).optional(),
  exposedThought: z.string().optional(),
  drink: num.min(0).default(1),
  drinkCompany: num.min(0).default(1),
  hangover: num.min(0).default(1),
  intox: num.min(0).default(1),
  carry: num.min(0).default(1),
  dislikes: z.object({ drunk: num.optional(), filthy: num.optional() }).default({}),
  noise: z.enum(['asleep', 'awake']).optional(),
  nightShift: num.default(0),
  sleepwalk: z.object({ perHour: unit, minutes: z.number().int().positive() }).optional(),
  peacemaker: unit.default(0),
  ratingsPull: num.min(0).default(1),
});

export const traitsSchema = z.object({
  count: z.array(num.nonnegative()).min(1),
  leanK: num,
  drunkFrom: z.string(),
  filthyBelow: num,
  traits: z.record(z.string(), traitSchema).refine((t) => Object.values(t).some((x) => x.weight > 0), 'needs at least one trait with weight above 0'),
});

const wantScale = z.array(z.object({ axis: axisEnum, k: num.default(0.5) })).default([]);

export const wantsSchema = z.object({
  partner: z.object({ labels: z.array(z.string()), crushAt: num, crush: num, talk: num, near: num, ready: num, scale: wantScale }),
  rival: z.object({
    below: num,
    avoid: z.object({ base: num, scale: wantScale }),
    confront: z.object({ base: num, scale: wantScale, action: z.string(), within: num, insult: unit, again: unit }),
  }),
  friend: z.object({
    friendAt: num,
    moodBelow: num,
    meterBelow: num,
    sources: z.array(z.string()),
    thoughts: num,
    talk: num,
    scale: wantScale,
    comfort: z.record(z.string(), num),
    consoled: z.string(),
    consoledBy: z.array(z.string()),
  }),
  match: z.object({
    base: num,
    soon: num,
    hours: num.positive(),
    skills: z.record(z.string(), z.enum(['fight', 'dance'])),
    scale: z.record(z.string(), wantScale),
    sudden: num,
  }),
  status: z.object({ base: num, meterK: num, scale: wantScale }),
});

export const activitiesSchema = z.object({
  training: z.object({ perHour: num.min(0), fadePerHour: num.min(0), fight: num, dance: num }),
  bill: z.boolean(),
  cards: z.object({
    hand: z.number().int().positive(),
    die: num.min(0),
    face: num,
    cheat: unit,
    cheatBonus: num,
    spot: unit,
    won: z.string(),
    lost: z.string(),
    soreBelow: num,
    sore: num,
    cheated: z.string(),
    alone: unit,
  }),
  ready: z.object({ until: clock, beauty: num }),
});

/** Every data file, by file name (without .yaml). */
export const fileSchemas = {
  schedule: scheduleSchema,
  rooms: roomsSchema,
  plans: plansSchema,
  objects: objectsSchema,
  needs: needsSchema,
  species: speciesSchema,
  clothing: clothingSchema,
  ranks: ranksSchema,
  temperature: temperatureSchema,
  personality: personalitySchema,
  actions: actionsSchema,
  generator: generatorSchema,
  targets: targetsSchema,
  meter: meterSchema,
  social: socialSchema,
  thoughts: thoughtsSchema,
  scoring: scoringSchema,
  rules: rulesSchema,
  booze: boozeSchema,
  breaks: breaksSchema,
  romance: romanceSchema,
  wheel: wheelSchema,
  events: eventsSchema,
  trials: trialsSchema,
  traits: traitsSchema,
  wants: wantsSchema,
  activities: activitiesSchema,
} as const;

export type GameData = { [K in keyof typeof fileSchemas]: z.output<(typeof fileSchemas)[K]> };
export type ActionDef = z.output<typeof actionSchema>;
export type RoomDef = GameData['rooms']['rooms'][number];
export type MealDef = GameData['schedule']['meals'][number];
export type InteractionDef = z.output<typeof interactionSchema>;
export type TraitDef = z.output<typeof traitSchema>;
