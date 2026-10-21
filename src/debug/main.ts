// The crude debug view: rooms as boxes, contestants as dots with tiny need bars, an event
// ticker and speed controls. It runs the core directly in the browser; all I/O lives here.
/// <reference types="vite/client" />
import { clockText, createWorld, setData, step, type Contestant, type SimEvent, type World } from '../core/index.js';
import { NEEDS, type GameData } from '../data/schema.js';
import { readData } from './data.js';

const SPEEDS = [0, 1, 60, 3600]; // station minutes per real minute; 0 is paused
const TICKER_KEEP = 400;
const RENDER_MS = 100; // redraw at most ten times a second so clicks land on stable elements
const MAX_STEP_PER_FRAME = 600; // after a backgrounded tab, catch up gently instead of all at once

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: unknown) => String(s).replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`);
const label = (id: string) => id.replace(/_/g, ' ');

let data: GameData;
let world: World;
let speed = 60;
let carry = 0;
let selected: string | null = null;
let ticker: SimEvent[] = [];
let names = new Map<string, string>(); // everyone who ever arrived, for the ticker
let dirty = true;

// ---------------------------------------------------------------------------------------------
// Setup

function seedFromUrl(): number {
  const s = Number(new URLSearchParams(location.search).get('seed'));
  return Number.isInteger(s) && s > 0 ? s : 1;
}

function showError(e: unknown): void {
  const el = $('error');
  el.hidden = false;
  el.textContent = e instanceof Error ? e.message : String(e);
}

function start(seed: number): void {
  world = createWorld(data, seed);
  ticker = [];
  names = new Map();
  selected = null;
  carry = 0;
  ($('seed') as HTMLInputElement).value = String(seed);
  dirty = true;
}

function advance(minutes: number): void {
  if (minutes <= 0) return;
  record(step(world, minutes));
  dirty = true;
}

function record(events: SimEvent[]): void {
  for (const e of events) if (e.type === 'arrive') names.set(e.actors[0]!, String(e.data?.name));
  ticker.push(...events);
  if (ticker.length > TICKER_KEEP * 2) ticker = ticker.slice(-TICKER_KEEP);
}

// ---------------------------------------------------------------------------------------------
// The station

function hubRoom(): string {
  const links = new Map<string, number>();
  for (const [a, b] of data.rooms.links) for (const r of [a, b]) links.set(r, (links.get(r) ?? 0) + 1);
  return [...links].sort((x, y) => y[1] - x[1])[0]?.[0] ?? '';
}

function accessText(r: GameData['rooms']['rooms'][number]): string {
  if (r.access === 'ranks') return `ranks ${r.ranks![0]}–${r.ranks![1]}`;
  if (r.access === 'occupants') return 'residents';
  return r.access === 'robots' ? 'robots only' : '';
}

function needClass(v: number): string {
  return v < 25 ? 'low' : v < 50 ? 'mid' : '';
}

function doingText(c: Contestant): string {
  if (c.asleep) return 'asleep';
  const a = c.activity;
  if (!a) return 'deciding';
  const brk = c.breakdown ? data.breaks.kinds[c.breakdown.kind] : undefined;
  const what = brk
    ? `BREAKDOWN: ${brk.label}${c.breakdown!.target ? ` (${who(c.breakdown!.target)})` : ''}`
    : a.action === 'meal' && a.food
      ? `${a.meal} (${a.food})`
      : a.action === 'lovin'
        ? `▇▇▇ lovin' ▇▇▇ with ${who(a.partner ?? '')}`
        : a.booze
          ? `${label(a.action)} (${a.booze})`
          : label(a.action);
  if (a.phase === 'walk') return `→ ${data.rooms.rooms.find((r) => r.id === a.room)?.name ?? a.room}: ${what}`;
  return what;
}

function whoHtml(c: Contestant): string {
  const hue = (Number(c.id.slice(1)) * 137) % 360;
  const bars = NEEDS.map((n) => {
    const v = Math.max(0, Math.min(100, c.needs[n]));
    return `<i class="${needClass(v)}" style="height:${Math.max(1, v)}%" title="${n} ${v.toFixed(0)}"></i>`;
  }).join('');
  const cls = ['who', c.id === selected ? 'sel' : '', c.asleep ? 'asleep' : '', c.activity?.phase === 'walk' ? 'walking' : '', c.breakdown ? 'broken' : ''].join(' ');
  return `<div class="${cls}" data-id="${c.id}">
    <div class="top"><span class="dot" style="background:hsl(${hue} 70% 60%)"></span><span class="name">${esc(c.name)}</span><small>${c.rank ?? 'new'}</small></div>
    <div class="doing">${esc(doingText(c))}</div>
    <div class="bars">${bars}</div>
  </div>`;
}

function renderStation(): void {
  const hub = hubRoom();
  const html = data.rooms.rooms.map((r) => {
    const here = world.contestants.filter((c) => c.room === r.id);
    const temp = world.rooms[r.id]?.temp;
    return `<div class="room${r.id === hub ? ' hub' : ''}">
      <h3><span>${esc(r.name)}</span><small>${esc(accessText(r))} ${temp === undefined ? '' : `${temp.toFixed(0)}°F`}</small></h3>
      <div class="dots">${here.map(whoHtml).join('')}</div>
    </div>`;
  });
  $('station').innerHTML = html.join('');
}

// ---------------------------------------------------------------------------------------------
// The contestant sheet

function row(k: string, v: string): string {
  return `<tr><td>${esc(k)}</td><td>${v}</td></tr>`;
}

function renderSheet(): void {
  const el = $('sheet');
  const c = world.contestants.find((x) => x.id === selected);
  if (!c) {
    el.innerHTML = `<p class="hint">${selected ? `${esc(names.get(selected) ?? selected)} is gone.` : 'Click a contestant for their sheet.'}</p>`;
    return;
  }
  const axes = (p: Record<string, number>) => Object.entries(p).map(([k, v]) => `${k} ${v}`).join(', ');
  const needs = NEEDS.map((n) => row(n, `${c.needs[n].toFixed(0)} <span class="meterbar" style="width:${c.needs[n]}px"></span>`)).join('');
  el.innerHTML = `<h2>${esc(c.name)} <small>(${esc(c.pronouns)}, ${esc(c.species)})</small></h2>
    <table>
      ${row('rank', c.rank === null ? 'newcomer' : String(c.rank))}
      ${row('meter', `${c.meter.toFixed(1)} <span class="meterbar" style="width:${c.meter}px"></span>${c.meter <= 0 ? ' <b>ON NOTICE</b>' : ''}`)}
      ${c.confined ? row('in the fishbowl', `until ${esc(clockText(c.confined.until))}`) : ''}
      ${row('awaiting sentence', esc(world.show.pending.filter((x) => x.who === c.id).map((x) => infractionLabel(x.rule)).join(', ') || 'nothing'))}
      ${row('lifetime points', c.lifetime.toFixed(0))}
      ${row('mood', `${c.mood.toFixed(0)} <small>(breaks below ${breakLine(c)})</small>`)}
      ${c.breakdown ? row('breakdown', `<b>${esc(data.breaks.kinds[c.breakdown.kind]?.label ?? c.breakdown.kind)}</b> (${c.breakdown.level}, over ${esc(c.breakdown.source)})`) : ''}
      ${row('intoxication', `${c.intox.toFixed(0)}${stageText(c)}${c.drinks ? ` <small>(hangover weight ${c.drinks.toFixed(1)})</small>` : ''}`)}
      ${c.inventory.length ? row('carrying', esc(c.inventory.join(', '))) : ''}
      ${c.immunities ? row('secret immunities', String(c.immunities)) : ''}
      ${c.secret ? row('secret points', `${c.secret.toFixed(0)} <small>(hidden until they die)</small>`) : ''}
      ${row('health', c.health.toFixed(0))}
      ${row('doing', esc(doingText(c)))}
      ${row('bed', esc(c.bed ?? 'none yet'))}
      ${c.guest ? row('guest of', `${esc(who(c.guest.host))} in the ${esc(roomName(c.guest.room))}`) : ''}
      ${row('arrived', esc(clockText(c.arrivedAt)))}
    </table>
    <h4>Needs</h4><table>${needs}</table>
    <h4>Sheet</h4>
    <table>
      ${row('strength / stamina / beauty', `${c.strength} / ${c.stamina} / ${c.beauty}`)}
      ${row('personality', esc(axes(c.personality)))}
      ${row('ideal partner', esc(axes(c.ideal)))}
      ${row('gender', `${c.gender} (0 feminine, 10 masculine)`)}
      ${row('drawn to', `feminine ${c.drawnToFeminine}, masculine ${c.drawnToMasculine}`)}
      ${row('monogamy', String(c.monogamy))}
      ${row('favorite recreation', esc(c.favoriteRecreation.join(', ')))}
      ${row('drinking / modesty', `${c.drinking} / ${c.modesty}`)}
      ${row('quirk', esc(c.quirk))}
    </table>
    <h4>Thoughts</h4>${thoughtsHtml(c)}
    <h4>Ledger</h4>${ledgerHtml(c)}`;
}

function breakLine(c: Contestant): string {
  const l = data.breaks.lines;
  const minor = l.minorBase + l.minorPerVolatile * (10 - c.personality.calm);
  return `${minor.toFixed(0)} / ${(minor * l.majorShare).toFixed(0)} / ${(minor * l.extremeShare).toFixed(0)}`;
}

function stageText(c: Contestant): string {
  let best: { id: string; at: number } | undefined;
  for (const s of data.booze.stages) if (c.intox > 0 && c.intox >= s.at && (!best || s.at > best.at)) best = s;
  return best ? ` <b>${best.id}</b>` : '';
}

function thoughtsHtml(c: Contestant): string {
  if (!c.thoughts.length) return '<p class="hint">Nothing on their mind but the show.</p>';
  const rows = [...c.thoughts]
    .sort((a, b) => a.value - b.value)
    .map((x) => {
      const def = data.thoughts.thoughts[x.id];
      const text = (def?.label ?? x.id).replace('{who}', x.about ? who(x.about) : '');
      const left = Math.max(0, Math.round((x.until - world.t) / 60));
      return row(text, `${x.value > 0 ? '+' : ''}${x.value.toFixed(1)} <small>(${left}h left)</small>`);
    });
  return `<table>${rows.join('')}</table>`;
}

function ledgerHtml(c: Contestant): string {
  const l = data.social.ledger;
  const entries = Object.entries(c.ledger).sort((a, b) => b[1].affection - a[1].affection);
  if (!entries.length) return '<p class="hint">Hasn\'t met anyone yet.</p>';
  return entries
    .map(([id, r]) => {
      const back = world.contestants.find((o) => o.id === id)?.ledger[c.id]?.label;
      const labels = r.label !== 'none' || (back && back !== 'none') ? `${r.label} (they think: ${back ?? '?'})` : '';
      const tags = [labels, r.affection >= l.friendAt ? 'friend' : '', r.affection <= l.rivalAt ? 'rival' : '', r.attraction >= l.crushAt ? '♥ crush' : ''].filter(Boolean).join(', ');
      const gone = world.contestants.some((o) => o.id === id) ? '' : ' (gone)';
      const reasons = r.reasons
        .slice(-4)
        .reverse()
        .map((x) => `${label(x.why)}${x.times > 1 ? ` ×${x.times}` : ''} ${x.dim} ${x.amount > 0 ? '+' : ''}${x.amount.toFixed(1)}`)
        .join('; ');
      return `<div class="rel"><b>${esc(who(id))}${gone}</b> ${tags ? `<small>${esc(tags)}</small>` : ''}<br>
        affection ${r.affection.toFixed(0)}, attraction ${r.attraction.toFixed(1)}, trust ${r.trust.toFixed(0)}, fear ${r.fear.toFixed(0)}, knows ${(r.knows * 100).toFixed(0)}%<br>
        <small>${esc(reasons)}</small></div>`;
    })
    .join('');
}

// ---------------------------------------------------------------------------------------------
// The ticker

const ROUTINE = new Set(['act.start', 'act.end', 'meal', 'wake', 'meet', 'chitchat', 'guest_leave', 'douse', 'drink', 'intox', 'break_end']);

function who(id: string): string {
  return names.get(id) ?? id;
}

function roomName(id: string | undefined): string {
  return data.rooms.rooms.find((r) => r.id === id)?.name ?? id ?? '';
}

function describe(e: SimEvent): string | null {
  const d = e.data ?? {};
  const a = e.actors.map(who);
  switch (e.type) {
    case 'arrive':
      return `${a[0]} the ${d.species} (${d.pronouns}) wakes up on the station with no memory. Welcome to paradise!`;
    case 'wake_chime':
      return 'Ding ding! Rise and shine, stars.';
    case 'lights_dim':
      return 'Lights dim. Beauty sleep is a privilege.';
    case 'ceremony': {
      const changes = (d.changes as { id: string; from: number | null; to: number }[]).map(
        (x) => `${who(x.id)} ${x.from === null ? 'debuts at' : x.to < x.from ? 'climbs to' : 'drops to'} #${x.to}`,
      );
      const order = (d.ranks as string[]).map((id, i) => `${i + 1}. ${who(id)}`).join(', ');
      return `Ceremony, day ${d.day}: ${order}.${changes.length ? ` ${changes.join('; ')}.` : ' No changes.'}`;
    }
    case 'escorted':
      if (d.to) return `Robots march ${a[0]} into ${roomName(d.to as string).toLowerCase()} until ${clockText(Number(d.until))}. Tap the glass!`;
      return `Robots escort ${a[0]} out of the ${roomName(d.from as string)}.`;
    case 'infraction':
      return `The cameras saw that: ${a[0]}, ${infractionLabel(d.rule)}${e.room ? ` (${roomName(e.room)})` : ''}.`;
    case 'waived':
      return `Tonight's infractions... ${a[0]}'s ${infractionLabel(d.rule).toLowerCase()} was too good to punish. Waived!`;
    case 'sentence': {
      const what = [d.meter ? `meter ${d.meter}` : '', d.fishbowl ? (d.fishbowl === 'day' ? '24 hours in the fishbowl' : 'a night in the fishbowl') : ''].filter(Boolean).join(' and ');
      return `Tonight's infractions... ${a[0]}: ${(d.infractions as string[]).map(infractionLabel).join(', ').toLowerCase()}. Sentence: ${what}.`;
    }
    case 'on_notice':
      return `${a[0]}'s meter hits zero. ${a[0]} is ON NOTICE.`;
    case 'death':
      if (d.cause === 'murder') return `☠ ${d.name} is dead, killed by ${who(String(d.killer))} in the ${roomName(e.room)} (aboard ${(Number(d.stay) / 1440).toFixed(1)} days).${(d.witnesses as unknown[]).length ? '' : ' Nobody knows yet.'}`;
      if (d.cause === 'wheel') return `☠ The Wheel has spoken. ${d.name} is spaced (aboard ${(Number(d.stay) / 1440).toFixed(1)} days).`;
      if (d.cause === 'trial') return `☠ ${d.name} loses the trial and is spaced (aboard ${(Number(d.stay) / 1440).toFixed(1)} days).`;
      return `☠ ${d.name} is spaced. The robots wave goodbye at the airlock (meter ${Number(d.meter).toFixed(0)}, aboard ${(Number(d.stay) / 1440).toFixed(1)} days).`;
    case 'murder':
      return `MURDER. ${a[0]} kills ${a[1]}${d.weapon ? ` (${d.weapon === 'cafe' ? 'with a cafe knife' : 'in the hot tub'})` : ''}. ${(d.witnesses as unknown[]).length ? 'Someone saw.' : 'Nobody saw. The cameras did.'}`;
    case 'secret_revealed':
      return `${a[0]}'s secret points come out: +${d.points} lifetime.`;
    case 'break': {
      const k = data.breaks.kinds[String(d.kind)];
      return `${a[0]} snaps (${d.level} break, over ${d.source}) and ${k?.label ?? d.kind}${a[1] ? `: ${a[1]}` : ''}.`;
    }
    case 'break_end':
      return `${a[0]} comes out of it`;
    case 'drink':
      return a[1] ? `${a[0]} downs the ${d.quality} drink ${a[1]} brought` : `${a[0]} has a ${d.quality} drink`;
    case 'intox':
      return `${a[0]} is ${d.to === 'sober' ? 'sober again' : `now ${d.to}`}`;
    case 'hammered':
      return `${a[0]} is HAMMERED`;
    case 'blackout':
      return `${a[0]} sobers up with no memory of the last few hours`;
    case 'hangover':
      return `${a[0]} wakes up hungover`;
    case 'gift':
      return `${a[0]} brings ${a[1]} a ${d.quality} drink${d.better ? ', way better than their usual' : ''}`;
    case 'kiss':
      return `${a[0]} kisses ${a[1]}! ♥`;
    case 'kiss_rebuff':
      return `${a[0]} goes in for a kiss and ${a[1]} pulls away. Ouch.`;
    case 'lovin':
      return `▇▇▇ ${a[0]} and ${a[1]} disappear under the covers ▇▇▇${d.first ? ' (a first!)' : ''}`;
    case 'turned_down':
      return `${a[0]} propositions ${a[1]}: not tonight`;
    case 'exclusive':
      return `${a[0]} asks ${a[1]} to be exclusive: yes!${d.secretly ? ' (privately, it\'s a fling)' : ''}`;
    case 'exclusive_refused':
      return `${a[0]} asks ${a[1]} to be exclusive: no`;
    case 'breakup':
      return `${a[0]} dumps ${a[1]}`;
    case 'betrayal':
      return `BETRAYAL! ${a[0]} sees ${a[1]} with ${a[2]} (${d.what})`;
    case 'jealous':
      return `${a[0]} sees ${a[1]} with ${a[2]} and stews`;
    case 'immunity_spent':
      return `${a[0]} should be spaced, but plays a secret immunity!`;
    case 'fishbowl_night':
      return `${a[0]} is let out of the fishbowl after ${d.hours} hours, damp and famous.`;
    case 'douse':
      return `The fishbowl showers ${a[0]} with cold water`;
    case 'karaoke':
      return `${a[0]} belts out a karaoke number`;
    case 'glass_talk':
      return `${a[0]} talks to ${a[1]} through the fishbowl glass`;
    case 'glass_mock':
      return `${a[0]} taps the fishbowl glass and mocks ${a[1]}`;
    case 'pass_food':
      return `${a[0]} slips ${a[1]} some food through the fishbowl slot`;
    case 'thermostat':
      return `${a[0]} sets the ${roomName(e.room)} thermostat from ${d.from}° to ${d.to}°${(d.bothered as unknown[] | undefined)?.length ? ', to some grumbling' : ''}.`;
    case 'act.start':
      return `${a[0]} heads for ${label(String(d.action))} in the ${roomName(e.room)}${d.walk ? ` (${d.walk} min walk)` : ''}`;
    case 'act.end':
      return d.how === 'done' ? null : `${a[0]} stops ${label(String(d.action))} (${d.how})`;
    case 'meal':
      return `${a[0]} eats ${d.food} at ${d.meal}`;
    case 'wake':
      return `${a[0]} wakes up (rest ${d.rest})`;
    case 'meet':
      return `${a[0]} and ${a[1]} size each other up`;
    case 'chitchat':
      return `${a[0]} chats with ${a[1]}`;
    case 'deep_talk':
      return `${a[0]} and ${a[1]} have a real heart-to-heart`;
    case 'kind_words':
      return `${a[0]} says something kind to ${a[1]}`;
    case 'slight':
      return `${a[0]} throws shade at ${a[1]}`;
    case 'insult':
      return `${a[0]} insults ${a[1]}. Ooh!`;
    case 'flirt':
      return `${a[0]} flirts with ${a[1]}, and it lands`;
    case 'rebuff':
      return `${a[0]} flirts with ${a[1]} and gets shot down`;
    case 'fight': {
      const how = d.after === 'cathartic' ? 'They hug it out after.' : 'Nobody is over it.';
      return `FIGHT in the ${roomName(e.room)}! ${a[0]} swings at ${a[1]}. ${who(String(d.winner))} wins; ${who(String(d.loser))} takes ${d.damage} damage${d.serious ? ', badly hurt' : ''}. ${how}`;
    }
    case 'knock': {
      if (d.hosting) return `${a[0]} knocks for ${a[1]} at the ${roomName(e.room)}: no, ${a[1]} already has company${d.saw ? ` (${who(String(d.saw))})` : ''}`;
      return `${a[0]} knocks for ${a[1]} at the ${roomName(e.room)}${d.asleep ? ' (asleep)' : ''}: ${d.answer === 'yes' ? 'come on in' : 'go away'}${d.pestering ? ', and that was pestering' : ''}`;
    }
    case 'guest_leave':
      return `${a[0]} leaves ${a[1]}'s ${roomName(e.room)}`;
    case 'guest_out':
      return `Morning: robots show ${a[0]} out of ${a[1]}'s ${roomName(e.room)}`;
    // The Wheel
    case 'wheel': {
      const seg = data.wheel.segments.find((s) => s.id === d.segment);
      return `🎡 ${a[0]}, our lowest star, spins the Wheel... ${(seg?.label ?? String(d.segment)).toUpperCase()}!`;
    }
    case 'booked':
      return `Tomorrow's event is booked: ${a[0]} vs ${a[1]}, ${label(String(d.format))}.`;
    case 'bed_swap':
      return `${a[0]} gets the suite tonight. ${a[1]} gets the couch.`;
    case 'pick_two':
      return `${a[0]} picks: ${a[1]} gains ${d.amount}, ${a[2]} loses ${d.amount}.`;
    case 'secrets': {
      const ls = (d.labels as [string, string, string][]).map(([x, y, l]) => `${who(x)} calls ${who(y)} "${l}"`);
      return `SECRETS REVEALED: ${ls.length ? ls.join('; ') : 'nobody has any. How boring.'}`;
    }
    case 'effects':
      return `Today: ${(d.effects as string[]).map((id) => data.wheel.effects[id]?.label ?? id).join(', ')}.`;
    case 'collective':
      return `Because of ${a[0]}, tomorrow everyone gets: ${(d.effects as string[]).map((id) => (data.wheel.effects[id]?.label ?? id).toLowerCase()).join(', ')}. Thank ${a[0]}!`;
    // The daily event
    case 'event_start':
      return `Today's event: ${label(String(d.format)).toUpperCase()}${a.length ? ` (${a.join(' vs ')}${d.sudden ? ', sudden death' : ''}${d.prize ? ', for the rank' : ''})` : ''}! Everyone to the ${roomName(e.room)}.`;
    case 'event_cancelled':
      return `The ${label(String(d.format))} is off: not enough contestants showed up.`;
    case 'booking_cancelled':
      return `The booked ${label(String(d.format))} is off: someone isn't with us any more.`;
    case 'cage_match':
      return `CAGE MATCH: ${a[0]} beats ${a[1]}${d.forfeit ? ' (a no-show forfeits)' : ''}!`;
    case 'rank_swap':
      return `${a[0]} takes ${a[1]}'s rank (#${d.up}) and room until the next ceremony.`;
    case 'dance_off': {
      const sc = d.scores as Record<string, number>;
      return `DANCE-OFF: ${Object.entries(sc).map(([id, s]) => `${who(id)} ${s.toFixed(1)}`).join(', ')}. ${who(String(d.winner))} wins${d.sudden ? `; ${who(String(d.loser))} drops to ZERO` : ''}.`;
    }
    case 'button':
      return `THE BUTTON: everyone chooses in secret... ${d.presses} pressed. (Pressers: ${(d.pressers as string[]).map(who).join(', ') || 'nobody'}; revealed at dinner.)`;
    case 'button_reveal':
      return `Dinner reveal: ${a.length ? `${a.join(', ')} pressed the button` : 'nobody pressed the button'}.`;
    // Murders and trials
    case 'body_found':
      return d.announced ? `The announcer regrets to inform you that ${d.name} is dead (${roomName(e.room)}). The robots collect.` : `${a[0]} finds ${d.name}'s body in the ${roomName(e.room)}!`;
    case 'accusation':
      return `J'ACCUSE: ${a[0]} accuses ${a[1]} of murdering ${d.name}. Trial ${d.day === Math.floor(e.t / 1440) + 1 ? 'this' : 'tomorrow'} morning.${d.right ? '' : ' (They didn\'t do it.)'}`;
    case 'no_accusation':
      return `Nobody dares accuse anyone of killing ${d.name}.`;
    case 'trial_called':
      return 'All rise: a trial. Everyone to the common room.';
    case 'trial': {
      const votes = Object.values(d.votes as Record<string, string>);
      return `TRIAL for ${d.name}: ${a[0]} vs ${a[1]}. Votes: ${a[0]} ${votes.filter((v) => v === e.actors[0]).length}, ${a[1]} ${votes.filter((v) => v === e.actors[1]).length}. ${who(String(d.loser))} is condemned${d.right ? '.' : `, and ${who(String(d.killer))} did it.`}`;
    }
    case 'trial_cancelled':
      return `The trial for ${d.name} is off: someone isn't with us any more.`;
    default:
      return `${e.type} ${a.join(', ')} ${e.room ?? ''} ${JSON.stringify(d)}`;
  }
}

function infractionLabel(rule: unknown): string {
  return data.rules.infractions[String(rule)]?.label ?? String(rule);
}

function renderTicker(): void {
  const routine = ($('routine') as HTMLInputElement).checked;
  const lines: string[] = [];
  for (let i = ticker.length - 1; i >= 0 && lines.length < 200; i--) {
    const e = ticker[i]!;
    const isRoutine = ROUTINE.has(e.type);
    if (isRoutine && !routine) continue;
    if (selected && e.actors.length && !e.actors.includes(selected)) continue;
    let text = describe(e);
    if (text === null) continue;
    if (e.points) text += `  [${Object.entries(e.data!.awards as Record<string, number>).map(([id, p]) => `${who(id)} +${p}`).join(', ')}]`;
    lines.push(`<li class="${isRoutine ? 'routine' : 'show'}"><span class="t">${esc(clockText(e.t))}</span>${esc(text)}</li>`);
  }
  $('ticker').innerHTML = lines.join('');
}

function render(): void {
  const fx = Object.entries(world.show.effects).filter(([, day]) => day === Math.floor(world.t / 1440) + 1).map(([id]) => data.wheel.effects[id]?.label ?? id);
  $('clock').textContent = clockText(world.t) + (fx.length ? ` · ${fx.join(', ')}` : '');
  renderStation();
  renderSheet();
  renderTicker();
  dirty = false;
}

// ---------------------------------------------------------------------------------------------
// Controls and the loop

function renderSpeeds(): void {
  $('speeds').innerHTML = SPEEDS.map((s) => `<button data-speed="${s}" class="${s === speed ? 'on' : ''}">${s === 0 ? 'pause' : `${s}×`}</button>`).join(' ');
}

function wire(): void {
  renderSpeeds();
  $('speeds').addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-speed]');
    if (!b) return;
    speed = Number(b.dataset.speed);
    carry = 0;
    renderSpeeds();
  });
  $('step1').addEventListener('click', () => advance(1));
  $('step60').addEventListener('click', () => advance(60));
  $('restart').addEventListener('click', () => {
    const seed = Math.max(1, Math.floor(Number(($('seed') as HTMLInputElement).value)) || 1);
    history.replaceState(null, '', `?seed=${seed}`);
    start(seed);
  });
  $('routine').addEventListener('change', () => (dirty = true));
  // mousedown, not click: the station redraws often and a click can straddle two redraws.
  $('station').addEventListener('mousedown', (ev) => {
    const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-id]');
    selected = el && el.dataset.id !== selected ? el.dataset.id! : null;
    dirty = true;
  });
}

let last = performance.now();
let lastRender = 0;
function frame(now: number): void {
  const dt = now - last;
  last = now;
  if (speed > 0) {
    carry += (dt / 60000) * speed;
    const n = Math.min(MAX_STEP_PER_FRAME, Math.floor(carry));
    carry = Math.min(carry - n, MAX_STEP_PER_FRAME);
    advance(n);
  }
  if (dirty && now - lastRender >= RENDER_MS) {
    render();
    lastRender = now;
  }
  requestAnimationFrame(frame);
}

try {
  data = readData();
  wire();
  start(seedFromUrl());
  requestAnimationFrame(frame);
} catch (e) {
  showError(e);
}

// Editing a YAML file swaps the new data into the running world. Bad data shows an error and
// the station keeps running on the old data.
if (import.meta.hot) {
  import.meta.hot.accept('./data.ts', (mod) => {
    if (!mod || !world) return;
    try {
      const next = (mod as unknown as typeof import('./data.js')).readData();
      setData(world, next);
      data = next;
      $('error').hidden = true;
      dirty = true;
    } catch (e) {
      showError(e);
    }
  });
}
