// Cards at the cafe table. DESIGN.md Part two, How contestants choose: wants and things to do.
// Every few minutes a table with two or more players in their seats plays a hand: small stakes
// (a snack from each loser's stash), a winner, sore losers, and the odd cheat called out.
import { axis } from './booze.js';
import { log, type Ctx } from './context.js';
import { feel } from './ledger.js';
import { between, chance } from './rng.js';
import { interact } from './social.js';
import { think } from './thoughts.js';
import type { Contestant } from './types.js';

/** Every `hand` minutes: each table with two or more seated players plays a hand. */
export function cardsRound(ctx: Ctx): void {
  const k = ctx.data.activities.cards;
  if (ctx.w.t % k.hand !== 0) return;
  for (const o of ctx.st.objects) {
    const def = o.actions.find((d) => d.players);
    if (!def) continue;
    const players = ctx.w.objects[o.id]!.map((id) => ctx.w.contestants.find((c) => c.id === id)!).filter((c) => c.activity?.action === def.id && c.activity.phase === 'do' && !c.asleep);
    if (players.length >= def.players!) hand(ctx, players, o.room);
  }
}

/**
 * One hand: a die + a poker face (calm). The dishonest may cheat for an edge; anyone else at the
 * table may spot it and call them on it. The winner takes a snack from each loser who has one.
 */
function hand(ctx: Ctx, players: Contestant[], room: string): void {
  const k = ctx.data.activities.cards;
  const rng = ctx.w.rng;
  const cheats = players.filter((c) => chance(rng, (k.cheat * (10 - c.personality.honest)) / 10));
  const score = new Map(players.map((c) => [c, between(rng, 0, k.die) + k.face * axis(ctx, c, 'calm') + (cheats.includes(c) ? k.cheatBonus : 0)]));
  const ranked = [...players].sort((a, b) => score.get(b)! - score.get(a)!);
  const winner = ranked[0]!;
  const losers = ranked.slice(1);
  let pot = 0;
  for (const l of losers) {
    if (l.snacks <= 0) continue;
    l.snacks--;
    winner.snacks++;
    pot++;
  }
  log(ctx, 'cards', [winner.id, ...losers.map((c) => c.id)], room, { winner: winner.id, pot, ...(cheats.length ? { cheats: cheats.map((c) => c.id) } : {}) });
  think(ctx, winner, k.won);
  for (const l of losers) {
    // The volatile take it badly.
    if (axis(ctx, l, 'calm') < k.soreBelow) {
      think(ctx, l, k.lost, winner.id);
      feel(ctx, l, winner, 'affection', k.sore, 'cards');
    }
  }
  for (const cheat of cheats) {
    for (const o of players) {
      if (o === cheat || !chance(rng, k.spot * (o.personality.honest / 10 + 0.5))) continue;
      log(ctx, 'caught_cheating', [o.id, cheat.id], room);
      think(ctx, o, k.cheated, cheat.id);
      interact(ctx, o, cheat, ctx.data.social.interactions.find((d) => d.id === 'insult')!);
      break; // one is enough: the game's over for them
    }
  }
}
