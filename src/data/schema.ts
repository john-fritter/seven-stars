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
  onlySpecies: z.array(z.string()).optional(),
  notSpecies: z.array(z.string()).optional(),
  ranks: rankRange.optional(),
  logs: z.string().optional(),
  thought: z.string().optional(),
  booze: z.string().optional(),
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
  sleep: z.object({ restPerHour: num }),
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
  mood: z.object({ base: num, lowBelow: num, multipliers: z.record(z.string(), num) }),
});

export const actionsSchema = z.object({
  noise: range,
  topChoices: z.number().int().positive(),
  walkCostPerMinute: num,
  modestyCost: num,
  recreationTaste: z.object({ favorite: num, other: num }),
  mealPull: num,
  nightSleepPull: num,
  idle: z.object({ minutes: z.number().int().positive(), score: num }),
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
  quirks: z.array(z.string()).min(1),
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
  }),
});

const sentenceSchema = z.object({ meter: num.optional(), fishbowl: z.enum(['night', 'day']).optional() });

export const rulesSchema = z.object({
  infractions: z.record(z.string(), z.object({ label: z.string(), step: z.number().int().positive() })),
  sentences: z.array(sentenceSchema).min(1),
  waiver: z.object({ minPoints: num, chance: unit }),
  sneak: z.object({ cost: num, honestK: num, braveK: num }),
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
  spacing: z.object({ watched: z.string(), died: z.string(), friend: z.string(), rival: z.string() }),
});


export const DIMS = ['affection', 'trust', 'fear', 'attraction'] as const;
export type Dim = (typeof DIMS)[number];
const dimMap = z.partialRecord(z.enum(DIMS), num);

const scaleBy = z.union([axisEnum, z.enum(['affection', 'attraction', 'chemistry', 'privacy', 'monogamy'])]);

export const MOVES = ['flirt', 'kiss', 'proposition', 'exclusive', 'breakup', 'gift'] as const;
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
    friendAt: num,
    rivalAt: num,
    crushAt: num,
  }),
  attraction: z.object({
    looks: num,
    personality: num,
    chemistrySd: num.nonnegative(),
    fitScale: num.positive(),
    deception: unit,
    firstImpression: unit,
    approach: unit,
  }),
  companyPull: z.object({ affection: num, attraction: num, fear: num, private: num.default(0) }),
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

const axisScale = z.array(z.object({ axis: axisEnum, k: num.default(0.5) })).default([]);

export const thoughtsSchema = z.object({
  volatileK: num,
  species: z.record(z.string(), z.record(z.string(), num)).default({}),
  sources: z.record(z.string(), axisScale).default({}),
  trapped: z.string(),
  needs: z.array(z.object({ need: needEnum, below: num, thought: z.string() })),
  temperature: z.object({ cold: z.string(), hot: z.string(), perDegree: num, max: num }),
  sleepMinutes: num.nonnegative(),
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
  carry: z.object({ chance: unit, kindK: num, quirks: z.record(z.string(), num).default({}), max: z.number().int().nonnegative() }),
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
  fallback: z.string(),
  kinds: z.record(z.string(), breakKind),
  passion: z.object({
    kindAtMost: num,
    calmAtMost: num,
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
  kiss: z.object({ successScale: num, label: z.enum(LABELS), thought: z.string(), rebuffed: z.string() }),
  proposition: z.object({
    attraction: num,
    affection: num,
    privacy: unit,
    successScale: num,
    turnedDown: z.string(),
    minutes: z.number().int().positive(),
    thought: z.string(),
    bond: num,
    disturbed: z.string(),
    datingAt: num,
  }),
  exclusive: z.object({ loyalK: num, thought: z.string(), refused: z.string() }),
  breakup: z.object({ affectionBelow: num, dumped: z.string() }),
  attachedK: num,
  betrayal: z.object({ affection: num, thought: z.string(), confront: unit }),
  jealousy: z.object({ affection: num, thought: z.string() }),
  guilty: z.string(),
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
} as const;

export type GameData = { [K in keyof typeof fileSchemas]: z.output<(typeof fileSchemas)[K]> };
export type ActionDef = z.output<typeof actionSchema>;
export type RoomDef = GameData['rooms']['rooms'][number];
export type MealDef = GameData['schedule']['meals'][number];
export type InteractionDef = z.output<typeof interactionSchema>;
