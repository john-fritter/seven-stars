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
  links: z.array(z.tuple([z.string(), z.string(), z.number().positive()])),
});

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
    // Sharing a bed: how a contestant feels about a bedmate, and the thoughts it leaves.
    share: z.object({ neutral: num, pull: num, partners: z.array(z.string()).default([]), reluctant: unit, refused: z.string(), labels: z.record(z.string(), num).default({}), good: z.string(), bad: z.string() }),
    // Noisy people (traits with `noise`) disturb sleepers in the same room.
    noise: z.object({ restMult: num.min(0), wakeChance: unit, cost: num, thought: z.string(), affection: num }),
  }),
  bladder: z.object({ criticalBelow: num, waitMinutes: z.number().int().positive() }),
  comfortFollowPerHour: num,
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

const scaleBy = z.union([axisEnum, z.enum(['affection', 'attraction', 'chemistry', 'privacy', 'monogamy'])]);

export const MOVES = ['flirt', 'kiss', 'proposition', 'invite', 'exclusive', 'breakup', 'gift'] as const;
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
});

export const socialSchema = z.object({
  every: z.number().int().positive(),
  base: num,
  absorbed: z.object({ kinds: z.array(z.string()), tags: z.array(z.string()), actions: z.array(z.string()) }),
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
  companyPull: z.object({ affection: num, attraction: num, fear: num, private: num.default(0) }),
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
  needs: z.array(z.object({ need: needEnum, below: num.optional(), above: num.optional(), thought: z.string() }).refine((x) => (x.below === undefined) !== (x.above === undefined), 'give exactly one of below or above')),
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
});

export const boozeSchema = z.object({
  order: z.array(z.string()).min(1),
  byRank: z.record(rankKey, z.string()),
  qualities: z.record(z.string(), z.object({ fun: num, thought: z.string(), hangover: num.nonnegative() })),
  intoxication: z.object({ perDrink: num.positive(), fallPerHour: num.positive() }),
  bladderPerDrink: num,
  stages: z.array(stageSchema),
  blackout: unit,
  hangover: z.object({ thought: z.string(), min: num, from: num, to: num }),
  together: z.object({ affection: num }),
  pull: z.object({ taste: num, social: num, self: num, lowMood: num.positive(), selfVolatileK: num, soberAt: num.positive() }),
  carry: z.object({ chance: unit, kindK: num, max: z.number().int().nonnegative() }),
  gift: z.object({ affection: num, better: num, thought: z.string() }),
});

export const LEVELS = ['minor', 'major', 'extreme'] as const;
export type Level = (typeof LEVELS)[number];

const breakKind = z.object({
  label: z.string(),
  room: z.string(),
  target: z.enum(['about', 'top', 'feared']).optional(),
  minutes: z.number().int().positive(),
  gains: needMap.default({}),
  drinks: z.number().int().nonnegative().default(0),
  infraction: z.string().optional(),
  insults: z.number().int().positive().optional(),
  wreck: z.object({ thought: z.string(), affection: num }).optional(),
  attack: z.boolean().default(false),
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
    firstBlow: num,
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
  jealousy: z.object({ affection: num, thought: z.string() }),
  guilty: z.string(),
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

/** Every data file, by file name (without .yaml). */
export const fileSchemas = {
  schedule: scheduleSchema,
  rooms: roomsSchema,
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
} as const;

export type GameData = { [K in keyof typeof fileSchemas]: z.output<(typeof fileSchemas)[K]> };
export type ActionDef = z.output<typeof actionSchema>;
export type RoomDef = GameData['rooms']['rooms'][number];
export type MealDef = GameData['schedule']['meals'][number];
export type InteractionDef = z.output<typeof interactionSchema>;
export type TraitDef = z.output<typeof traitSchema>;
