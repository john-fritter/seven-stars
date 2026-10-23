# Seven Stars

A death-game reality show on a space station, simulated RimWorld/Sims-style. Start with
CONCEPT.md, then DECISIONS.md, then DESIGN.md. CLAUDE.md has the build rules.

## Running it

```
npm install
npm run sim -- run --days 30 --seeds 200          # summary against the success targets, full JSON in results/
npm run sim -- sweep --param actions.mealPull --from 1 --to 5 --step 1 --days 30 --seeds 50
npm run sim -- stories --days 30 --seeds 24       # story sampling: deaths, the ceremony, romance, cage reruns, murders
npm run sim -- season --seed 24 --days 30         # one season, day by day, with names
npm test
npm run typecheck
```

`--param` names any number in the data: the file name, then the path inside it.

## Layout

```
data/            every tunable number, as YAML, validated with zod on load
src/core/        the pure simulation (no I/O, no clock, one seeded RNG)
  world.ts         createWorld, step, save, load
  schedule.ts      arrivals, wake chime, meals, the ceremony
  actions.ts       choosing, running and ending actions
  social.ts        interactions, flirts, fights, knocking
  romance.ts       kisses, lovin', labels, exclusivity, breakups, betrayal
  booze.ts         drinks, intoxication, hangovers, gifts
  breaks.ts        mental breaks and crimes of passion
  ledger.ts        relationships and attraction
  thoughts.ts      thoughts, conditions and mood
  scoring.ts       the meter, awards and the judge's modifiers
  show.ts          infractions, sentences, the fishbowl and spacings
  wheel.ts         the Wheel and its station effects
  events.ts        the daily event: cage match, dance-off, The Button
  trials.ts        bodies, suspicion, accusations and trials
  needs.ts, temperature.ts, generator.ts, station.ts (derived indexes), derived.ts (per-contestant caches)
src/data/        loading and validating the YAML
src/harness/     the `sim` CLI; seeds run in parallel worker threads
test/            vitest
```

## Built so far

Slice one milestones 1–7: the skeleton and the life sim (clock, schedule, rooms, objects, needs,
temperature, bladder, action scoring, rank assignment at the ceremony), the debug view, the
social layer (interactions, the relationship ledger, attraction, flirts, fights, knocking to be let
into bedrooms, and the thoughts those produce), the show (the meter and its drain, scoring
with the judge's modifiers, infractions, sentences, the fishbowl and spacing at the ceremony),
the inner life (the full thought table, mental breaks and crimes of passion, booze and
intoxication, and romance with kisses, lovin', labels, exclusivity, breakups and betrayal), and
the game show proper (the Wheel, the daily event, bodies, accusations and trials; casting came in
milestone 2). Next: tuning against the success targets.
