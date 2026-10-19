# CLAUDE.md

Guidance for Claude Code working in this repo.

## What this is

A death-game reality show on a space station, simulated RimWorld/Sims-style, with AI added on top later. Seven amnesiac contestants; the rule is "be entertaining or die." John is the designer and, for now, the only audience.

## Read first, in this order

1. **CONCEPT.md**: what the project is, its tone, and what it isn't.
2. **DECISIONS.md**: what John has decided. These are fixed unless John changes them.
3. **DESIGN.md**: how it works. **Part two (slice one)** is the current build target and has all the starting numbers.

## Current phase: slice one

Build the **headless mechanical simulation**, with no AI, no art and no viewers. It has to answer one question: does the station, left alone, produce a death game worth watching? The full scope, numbers and success targets are in DESIGN.md Part two.

Out of scope for now, so don't build hooks or abstractions for these yet: LLM calls of any kind, the Phaser client, the Node server and SQLite, viewers and votes, the producer, clothing visuals (slice one only has a clothing tier number per rank), planned murders, confession content.

## Architecture rules

- **The core is a pure TypeScript library.** No I/O, no `Date.now()`, no timers, no DOM, no network, no file access. The harness and debug view do all I/O.
- **No `Math.random` in the core.** One seeded RNG is created in `createWorld` and passed explicitly to everything that needs randomness. The same seed plus the same data must replay byte-for-byte.
- **Every tunable number lives in YAML under `data/`,** never in code. If you need a number that isn't in DESIGN.md, add it to a data file with a comment and log it as a proposal (see Working agreements).
- **Validate data with zod** at load time, with clear error messages naming the file and field. Bad data should fail loudly.
- **Every meaningful thing that happens is a logged `SimEvent`:** station time, type, actors, room, data and points awarded. The harness stats, the debug ticker, and later the producer and AI all read the log. If something isn't in the log, it didn't happen.
- **Data-driven over special-cased.** Objects advertise what they offer, actions carry tags, thoughts and breaks are table rows. Adding a new object, thought or Wheel segment should usually mean editing YAML, not code.
- **One tick is one station minute.** The schedule is in station time.
- Keep the core fast enough that `sim run --days 30 --seeds 200` finishes in well under a minute.

## Core API

```ts
createWorld(data: GameData, seed: number): World
step(world: World, minutes: number): SimEvent[]
save(world: World): string
load(data: GameData, saved: string): World
```

`World` is plain serializable data. `save` then `load` then `step` must produce the same events as stepping the original.

## Proposed layout

```
data/            YAML: schedule, rooms, objects, species, clothing, generator, needs, personality,
                 actions, interactions, romance, thoughts, breaks, booze, scoring,
                 ranks, rules, wheel, events
src/core/        the pure sim library (world, rng, needs, actions, social, romance,
                 thoughts, breaks, booze, meter, ceremony, wheel, events, trials)
src/data/        loading YAML and the zod schemas (I/O lives here, not in core)
src/harness/     the `sim` CLI: run and sweep
src/debug/       the crude web debug view (vite)
test/            vitest
```

This is a proposal; adjust it if something works better, and say so.

## Tooling

TypeScript (strict), vitest, tsx for running the CLI, vite for the debug view, `yaml` for parsing, zod for validation. Use npm. Ask before adding other runtime dependencies.

## Harness

```
sim run --days 30 --seeds 200 --data ./data
sim sweep --param meter.drain --from 0.8 --to 1.4 --step 0.1 --days 30 --seeds 100
```

`run` prints a summary against the success targets in DESIGN.md Part two (flagging misses) and writes full results as JSON. `sweep` varies one data value and shows which settings land the targets. The report contents are listed under **Fast-forward harness and debug view** in DESIGN.md.

## Debug view

A plain web page running the core in the browser: rooms as labeled boxes, contestants as colored dots with names and tiny need bars, an event ticker, speed controls (pause, 1×, 60×, 3600×), and click a contestant for their sheet, thoughts, mood, meter and ledger. Crude is fine; it's for John to watch, not to ship. Run it with `npm run debug` (vite; the code is in `src/debug/`).

## Testing

- **Determinism:** the same seed and data give identical event logs; save/load round-trips mid-run.
- **Unit tests** for the formulas in DESIGN.md Part two (urgency, break lines, attraction, scoring modifiers, ceremony order, tie-breaks).
- **Invariants** checked every step in tests: never more than seven contestants, needs and the meter stay in range, nobody is in a room above their rank without either an invitation or a logged infraction, the dead don't act.
- Run `npm test` and typecheck before calling something done.

## Working agreements

- **Don't invent design decisions.** If DESIGN.md is silent or ambiguous, pick the simplest reasonable option, put it in data where possible, and add it to the **Open** list in DECISIONS.md marked as a proposal. Never add it to the decided sections; only John decides.
- **Keep DESIGN.md in sync.** When the implementation changes a mechanic or a number's meaning, update DESIGN.md in the same change.
- **Tune in data, not code.** If the success targets are off, change YAML values and report what you changed and why, with harness numbers before and after.
- **Report with numbers.** When you finish a chunk of work, give the harness summary, not just "it works."
- Work in small, runnable steps: the clock and schedule first, then needs and actions, then social, then the show (meter, ceremony, ranks), then breaks, booze, romance, the Wheel, events and trials. Get `sim run` working early and keep it working.
- Commit or push only when John asks.

## Content rules

The tone is twisted and morbid but PG-13 and safe for work.

- Lovin' is always consensual and always offscreen (lumps under the covers, censor bars). No coercion mechanics of any kind.
- No pregnancy, no children.
- Deaths are obvious and dramatic but not gory; the default is being spaced by robots.
- Punishments are game-show cruelty: public, humiliating, uncomfortable. They hurt dignity and comfort, not bodies.
- Event names, logs and debug text should read in the show's voice where it's cheap to do so, but clarity comes first.
