# Concept

*Working title: Death Game Simulator. "Agent Terrarium" was a placeholder and is retired.*

## The pitch

Seven amnesiac contestants of different humanoid species are teleported onto a space station that is the set of a game show run by an unknown operator. The one rule is **be entertaining or die**. There is no way out, deaths are unmistakable, and new contestants arrive every morning to replace the dead.

Underneath the death game is a real Sims-style life simulation. Contestants eat, sleep, drink, flirt, hook up, make friends, hold grudges and break down. The station is rich but cramped, and rank decides everything: the top contestant sleeps in the suite and drinks the fancy stuff; the bottom one sleeps on a couch in the common room, can't shower, and drinks rotgut.

The core tension: **they have lives they want to live, and the show pays them to turn those lives into spectacle.**

- The life sim gives them something to live for.
- The AI gives them words and the intelligence to pursue it.
- The show gives them a reason to compromise everything they care about.

## What it is

A **death-game simulator that uses AI**, not a society of autonomous agents. Characters are simulated mechanically, RimWorld-style: needs, moods, personalities, relationships and mental breaks run as ordinary game code. An LLM interprets and guides them and writes what they say. When two characters interact, one model gets both characters, the situation and the mechanical outcome, and writes the whole scene.

Nothing is scripted. Drama comes from systems colliding: discomfort, envy, booze, attraction, rank and the ever-draining ratings meter.

## What it is not

- An AI chatroom with avatars.
- A strategy game where everyone optimizes a score.
- A scripted drama, or a Danganronpa clone with authored trials.
- A game the viewer controls.
- Mind: the Singularity with a new skin. That project is a society of separate agents; this one is a simulation with AI on top.

## Tone

Twisted, morbid, funny and fun to watch. Seventies sci-fi luxury (2001: A Space Odyssey, Star Trek, Starbound, Big Brother) over a premise that never explains itself. Influences: Running Man, Danganronpa, Death Race 2000, Battle Royale, The Hunger Games, MTV's The Real World, The Sims Online, and RimWorld.

- **Dread is the constant backdrop.** Nobody is here by choice, someone died recently, and who's next is always the question.
- **Game-show cruelty, not prison cruelty.** Punishments are bright, public, humiliating and a little absurd. They hurt dignity and comfort, not bodies.
- **Death is always obviously death**, dramatic but not gory. The default is getting spaced by robot stagehands, the same robots that serve the drinks.
- **PG-13 and safe for work.** Hookups happen (consensual, offscreen: lumps under the covers or censor bars). Booze flows. Murders happen. No pregnancy, no children.
- **Run hotter than a real reality show.** Breakdowns, substances, hookups and the occasional murder are part of ordinary life. A tidy, stable day means the numbers are too gentle.

## The audience

The first audience is John and his wife. It must be fun with exactly one viewer.

- **Three levels of watching:** a top-down view a layperson can enjoy with zero reading; click a character to see their needs, mood, relationships and conversations; dig into the numbers and logs.
- **Viewers vote** on what's entertaining, and the operator listens. They never control anyone directly.
- **A producer** writes "Previously on" recaps from what actually happened, so someone checking in once a day can catch up.

## Constraints

- AI runs on NanoGPT subscription models, within about 1M input tokens a day to start (up to about 5M if it's good).
- Runs on John's own server.
- One station day equals one real day in normal running, with fast-forward for testing and tuning.
- The simulation must stand on its own with no AI. It's built first, tuned first, and the AI is added on top.
