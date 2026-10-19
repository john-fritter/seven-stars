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
