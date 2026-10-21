// The `sim` command line: run and sweep. All I/O lives here, never in the core.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { DataError, loadGameData } from '../data/load.js';
import { runJob } from './pool.js';
import { report, type Metric, type Report } from './stats.js';

const USAGE = `Usage:
  sim run   --days 30 --seeds 200 [--data ./data] [--out results/run.json] [--threads N]
  sim sweep --param meter.start --from 40 --to 80 --step 10 --days 30 --seeds 100 [--data ./data]

--param names a number in the data: the file, then the path inside it (e.g. needs.needs.hunger.drainPerHour).`;

function args(argv: string[]): { cmd: string; opts: Record<string, string> } {
  const [cmd = '', ...rest] = argv;
  const opts: Record<string, string> = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (!a.startsWith('--')) throw new Error(`Unexpected argument "${a}"`);
    opts[a.slice(2)] = rest[++i] ?? '';
  }
  return { cmd, opts };
}

function num(opts: Record<string, string>, k: string, fallback?: number): number {
  const v = opts[k];
  if (v === undefined) {
    if (fallback === undefined) throw new Error(`--${k} is required`);
    return fallback;
  }
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`--${k} must be a number, got "${v}"`);
  return n;
}

const seedList = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
const fmt = (v: number | null, d = 2) => (v === null ? '—' : v.toFixed(d));
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

function targetText(m: Metric): string {
  if (m.min !== undefined && m.max !== undefined) return `${m.min}–${m.max}`;
  if (m.min !== undefined) return `≥ ${m.min}`;
  return `≤ ${m.max}`;
}

function status(m: Metric): string {
  return m.ok === null ? 'n/a' : m.ok ? 'ok' : 'MISS';
}

function table(rows: string[][]): string {
  const w = rows[0]!.map((_, i) => Math.max(...rows.map((r) => r[i]!.length)));
  return rows.map((r) => r.map((c, i) => c.padEnd(w[i]!)).join('  ')).join('\n');
}

function top(m: Record<string, number>, n: number, f: (v: number) => string): string {
  return Object.entries(m)
    .slice(0, n)
    .map(([k, v]) => `  ${k.padEnd(16)} ${f(v)}`)
    .join('\n');
}

function printReport(r: Report, ms: number): void {
  console.log(`\n${r.seeds} seeds × ${r.days} days in ${(ms / 1000).toFixed(1)}s\n`);
  console.log('Success targets');
  console.log(table([['measure', 'target', 'value', ''], ...r.metrics.map((m) => [m.label, targetText(m), fmt(m.value), status(m)])]));
  const misses = r.metrics.filter((m) => m.ok === false).length;
  console.log(`\n${misses} of ${r.metrics.length} targets missed\n`);
  console.log('Events per week (whole station)');
  console.log(top(r.perWeek, 20, (v) => v.toFixed(1)));
  if (Object.keys(r.deathsByCausePerWeek).length) {
    console.log('\nDeaths per week by cause');
    console.log(top(r.deathsByCausePerWeek, 10, (v) => v.toFixed(2)));
    console.log(`  stays that ended inside the run averaged ${fmt(r.finishedStayWeeks)} weeks (the target uses contestant-weeks per death)`);
  }
  console.log('\nWhere time goes, by room (share of all contestant time)');
  console.log(top(r.timeByRoom, 20, pct));
  console.log(`  ${'(walking)'.padEnd(16)} ${pct(r.walkingShare)}`);
  console.log('\nWhere time goes, by activity');
  console.log(top(r.timeByAction, 25, pct));
  console.log('\nMeals per contestant-day');
  console.log(top(r.mealsPerContestantDay, 10, (v) => v.toFixed(2)));
  console.log('\nAverage needs at the end of each day');
  console.log(top(r.needsAtNight, 10, (v) => v.toFixed(0)));
  console.log(`  ${'(mood)'.padEnd(16)} ${r.moodAtNight.toFixed(0)}`);
  if (r.relations) {
    console.log('\nRelationships at the end of each day (share of who-feels-what-about-whom)');
    console.log(`  ${'friends'.padEnd(16)} ${pct(r.relations.friends)}`);
    console.log(`  ${'rivals'.padEnd(16)} ${pct(r.relations.rivals)}`);
    console.log(`  ${'crushes'.padEnd(16)} ${pct(r.relations.crushes)}`);
    console.log(`  ${'avg affection'.padEnd(16)} ${r.relations.affection.toFixed(1)}`);
  }
  if (r.knockYesShare !== null) console.log(`\nKnocks answered yes: ${pct(r.knockYesShare)}`);
  const sh = r.show;
  console.log('\nThe show');
  console.log(`  ${'meter at night'.padEnd(22)} ${sh.meterAtNight.toFixed(1)} average; ${pct(sh.onNoticeAtNight)} on notice (at zero)`);
  console.log(`  ${'couch streak'.padEnd(22)} ${fmt(sh.couchStreak, 1)} nights in a row at rank 7, on average`);
  console.log(`  ${'waived (rule of cool)'.padEnd(22)} ${sh.waivedPerWeek.toFixed(2)} a week`);
  console.log(`  ${'fishbowl nights'.padEnd(22)} ${sh.fishbowlNightsPerWeek.toFixed(2)} a week`);
  console.log('Infractions per day, by rule');
  console.log(top(sh.infractionsPerDay, 10, (v) => v.toFixed(2)));
  console.log('Sentences per day, by ladder step');
  console.log(top(sh.sentencesPerDay, 10, (v) => v.toFixed(2)));
  console.log('Points per contestant-day, by event');
  console.log(top(sh.pointsPerContestantDay, 14, (v) => v.toFixed(2)));
  const br = r.breaks;
  console.log(`\nMental breaks: ${br.perContestantDay.toFixed(2)} per contestant-day`);
  console.log(`  by level (a week)     ${Object.entries(br.byLevel).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(', ')}`);
  console.log(`  by grievance (a week) ${Object.entries(br.bySource).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(', ')}`);
  console.log('By kind, a week');
  console.log(top(br.byKind, 20, (v) => v.toFixed(2)));
  const bz = r.booze;
  console.log('\nBooze: drinks per contestant-day, by quality');
  console.log(top(bz.drinksPerContestantDay, 6, (v) => v.toFixed(2)));
  console.log(`  time spent         ${Object.entries(bz.stageShare).map(([k, v]) => `${k} ${pct(v)}`).join(', ')}`);
  const ro = r.romance;
  console.log('\nRomance, a week');
  console.log(top(ro.perWeek, 12, (v) => v.toFixed(2)));
  console.log(`  ${'couples'.padEnd(16)} ${ro.couplesAtNight.toFixed(2)} at the end of an average day; ${ro.mismatchedAtNight.toFixed(2)} pairs whose labels disagree`);
  console.log(`  labels held, per contestant: ${Object.entries(ro.labelsAtNight).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(', ') || 'none'}`);
  console.log('\nThe Wheel, spins a week by segment');
  console.log(top(r.wheel, 12, (v) => v.toFixed(2)));
  const ev = r.events;
  console.log(`\nDaily events, a week: ${Object.entries(ev.perWeek).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(', ')}`);
  console.log(`  fights outside the cage: ${ev.fightsOutsideCagePerWeek.toFixed(2)} a week (the fights target counts cage matches too)`);
  console.log(`  The Button: ${fmt(ev.pressesPerButton)} presses on average; someone pressed ${ev.buttonShare === null ? '—' : pct(ev.buttonShare)} of the time`);
  const mu = r.murders;
  const mw = Object.entries(mu.perWeek).map(([k, v]) => `${k} ${v.toFixed(3)}`).join(', ');
  console.log(`\nMurders and trials, a week: ${mw || 'none'}`);
  if (mu.bodyHours !== null) console.log(`  unwitnessed bodies lay ${mu.bodyHours.toFixed(1)} hours on average before anyone knew`);
}

async function main(): Promise<void> {
  const { cmd, opts } = args(process.argv.slice(2));
  const dataDir = opts.data ?? './data';
  loadGameData(dataDir); // fail fast, with a clear message, before starting workers
  const days = num(opts, 'days', 30);
  const seeds = seedList(num(opts, 'seeds', 200));
  const threads = opts.threads ? num(opts, 'threads') : undefined;

  if (cmd === 'run') {
    const t0 = performance.now();
    const stats = await runJob({ dataDir, overrides: {}, seeds, days }, threads);
    const data = loadGameData(dataDir);
    const r = report(data, stats);
    printReport(r, performance.now() - t0);
    const out = opts.out ?? `results/run-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify({ args: { dataDir, days, seeds: seeds.length }, report: r, seeds: stats }, null, 1));
    console.log(`\nFull results: ${out}`);
  } else if (cmd === 'sweep') {
    const param = opts.param;
    if (!param) throw new Error('--param is required');
    const from = num(opts, 'from');
    const to = num(opts, 'to');
    const stepBy = num(opts, 'step');
    if (stepBy <= 0) throw new Error('--step must be positive');
    const data = loadGameData(dataDir);
    const rows: string[][] = [];
    for (let v = from; v <= to + stepBy / 1e6; v += stepBy) {
      const value = Math.round(v * 1e6) / 1e6;
      const r = report(data, await runJob({ dataDir, overrides: { [param]: value }, seeds, days }, threads));
      const hits = r.metrics.filter((m) => m.ok).length;
      rows.push([String(value), `${hits}/${r.metrics.length}`, ...r.metrics.map((m) => `${fmt(m.value)}${m.ok === false ? '!' : ''}`)]);
      console.error(`  ${param} = ${value}: ${hits} targets hit`);
    }
    const header = [param, 'hits', ...data.targets.targets.map((t) => t.id)];
    console.log(`\n${table([header, ...rows])}\n\n"!" marks a missed target.`);
  } else {
    console.log(USAGE);
    process.exitCode = cmd ? 1 : 0;
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof DataError ? e.message : e instanceof Error ? `${e.message}\n\n${USAGE}` : e);
  process.exitCode = 1;
});
