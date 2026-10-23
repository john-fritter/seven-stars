# Design

How the death game simulator works. CONCEPT.md says what it is and why; DECISIONS.md records what John has settled. This file is the working design.

- **Part one, the game:** the full design, including the parts that come after slice one (AI, viewers, producer, clothing).
- **Part two, slice one:** the spec for the first prototype, with starting numbers. This is what gets built first.
- **Part three, building it:** architecture, token budget, build order, risks and open questions.

Labels in Part one: **decided** means John's call (also in DECISIONS.md); **proposed** means a suggestion that can change. Every number in Part two is a first guess meant to be tuned in data files, not code. When Part one and Part two disagree on a detail, Part two is newer.

# Part one: the game

## The station

A single deck seen from above, RimWorld-style, dressed as seventies sci-fi luxury: white molded plastic, orange carpet, a sunken conversation pit, glowing wall panels, a panoramic window, a Big Brother diary room. It should be somewhere contestants would enjoy living if it weren't so cramped and so deadly. The defining image is dinner in the lounge while an executed contestant drifts past the window.

**Rich but cramped.** There are enough beds, but some are much better than others. There is enough simple food, but not enough treats. Space, quiet, hot water and privacy are all in short supply, and species preferences clash, above all over the thermostat. Nobody works; days are filled with needs, activities and competing for comforts.

**Proposed floor plan (layout in Part two, The floor plan).** Every room should create opportunities, not just decoration.

| Room | What's in it | What it sets up |
| --- | --- | --- |
| Common room (center) | Couches, the ceremony and trial floor, the Wheel, the fishbowl | Ceremonies, trials, sentences; the bottom contestant sleeps on a couch here |
| Cafe | Breakfast and lunch at set times, served by robots by rank | Everyone eats together; status on every plate |
| Lounge | Dinner, bar, dance floor, karaoke stage, panoramic window | The evening social hub; the dead drift past the window. The bottom rank is locked out |
| Rec room | Bowling alley, arcade, booze and snacks | Recreation, rivalries, drinking. The bottom rank is locked out |
| Cage room | A fighting cage with seating around it | Cage matches with an audience |
| Spa | Hot tub | Top three ranks only; romance and a drowning risk |
| Public restroom (the "secret room") | Off the common room: sinks, lockable stalls, the paper-clothes wardrobe; no visible cameras (hidden ones only) | Everyone passes through several times a day, so it's a cover story and a place to be walked in on: hookups, deals, schemes, crying, murders. The bottom rank's only toilet and only place to wash |
| Suite | Double bed, private bathroom (toilet, sink, hot shower), its own thermostat, the best of everything | Rank 1; a guest has to be let in |
| Good room | Two big beds, bathroom (toilet, sink, hot shower), thermostat | Ranks 2–3; guests have to be let in |
| Basic dorm | Three beds, bathroom (toilet, sink, cold shower), thermostat | Ranks 4–6; crowding, modesty clashes, thermostat wars |
| Fishbowl | Glass cell in the common room, kept slightly too cold | Punishment, in full view |
| Confessional | Diary-room chair and camera | Talking to the audience |
| Medbay | Healing, drugs on shelves | Treatment, sedatives, poisons |
| Airlock | Window onto space | Executions |
| Garden | Plants, quiet corners | Calm; possibly a hidden still where the bottom rank makes rotgut |

**Perceived privacy (proposed).** There are no private areas, and viewers see everything. But each spot has an apparent-privacy value that contestants believe: no visible camera, low light, behind the plants. They act differently where they think nobody is watching, which is where secrets, hookups and murders happen. The irony: those private moments often make the best TV, so they score anyway. Contestants just don't know it.

**Bathrooms (decided).** Every bedroom has its own bathroom with a toilet, sink and shower: hot water in the suite and good room, cold in the dorm. So a better shower is one more reason to date up, but the person you're dating has to let you in. The bottom rank has no bedroom, so they use the public restroom and wash with sink baths. The restroom is unisex; gendered restrooms were considered and rejected.

**Temperature (decided; numbers proposed).** Every room has a temperature, always kept within a range where nobody is harmed, only uncomfortable. Each bedroom has its own thermostat that occupants can change, which others notice and resent; the suite's is rank 1's alone. The operator sets the rest: the common-room couch runs a little cool and the fishbowl deliberately cold. Species have slightly different comfort ranges, and clothing shifts them. "Cold station tonight" is a free collective punishment, and a warm night a free reward.

**Cooperation objects (proposed).** Things that need two people for a mutual benefit, with a chance to defect: a two-person game where either can cheat, a massage that can be skimped on, a duet, cooking together where one can take the better portion.

## The show

The show applies pressure through two numbers, a judge that listens to the audience, and a handful of secrets. It never decides outcomes.

**Two numbers (decided).**

- **The meter** keeps you alive. It drains with boredom and refills when the judge awards points. At zero you're on notice; still at zero at the evening ceremony, you're spaced.
- **Lifetime points** are prestige: a leaderboard, a hall of fame, and a rumored escape at some absurd total. They can't be spent.
- **Proposed link:** every award refills the meter and adds to lifetime points, but the meter caps. Once you're safe, extra entertainment only builds prestige, which gives top performers a reason to keep going.

**Privileges by rank (decided).** Rank, not thresholds, decides where you sleep, eat and wash and what you can drink. See Rank, rooms and rules.

**The misery loop (proposed).** Low rating means misery, misery means breakdowns and desperate moves, and those are entertaining, which can pull someone back up. High rating means comfort, comfort breeds complacency, and complacency drifts down. The leaderboard churns without tuning rules, and the judge's boredom stops anyone from crying their way to safety.

**The judge.** Viewers decide what's entertaining; the operator learns from them and otherwise falls back on its own taste.

- **Deterministic scoring for everything (proposed).** Hidden weights per event type, using state the engine already has: tension between the pair, witnesses, relationships involved, novelty, and boredom with repeats.
- **LLM scoring for scenes (decided).** Scenes are already transcripts, so judging one costs only the transcript plus a rubric. A fixed rubric with example scores keeps numbers comparable from day to day.
- **Viewer votes train both (decided, mechanism proposed).** Votes on scenes and events adjust the hidden weights, and the LLM judge sees recent votes as examples of what the audience loved and hated. Opinion is the share of up versus down votes, not the count, so one viewer counts as a whole audience. Votes on yesterday's scenes still count.
- **The operator's default taste (proposed).** Drawn from John's influences: Monokuma's love of despair, Running Man's cruelty played as comedy, Death Race's cheerful spectacle. It loves hope crushed, betrayal and desperation, and gets bored with niceness and repetition.
- **Feedback without the formula (proposed).** The announcer names what earned points ("+15, public argument with Leo") but never the rule, so contestants can form theories about the judge.

**Staged drama: rule of cool (decided).** Manufactured drama is judged by its effect, not its authenticity. If someone stages something and it's great, it scores; if it's lame or obvious, it doesn't.

**Announcer.** Template-driven, with an occasional LLM flourish. It announces rules, events, rewards and executions, and never answers questions.

**Ways to die.**

- The meter is at zero at the evening ceremony.
- The Wheel's spacing segment.
- Losing an accusation trial (see Murder, evidence and trials).
- Being murdered.

**Secrets (decided, details proposed).**

- **Secret immunities** such as extra lives. They can be found, won, given to a lover, stolen or bluffed about. What they protect against is open.
- **Secret murder points.** Proposed: hidden until the killer dies, then revealed in the hall of fame ("score revised: two kills"). Any meter refill stays visible, so a suspicious jump after a death is a clue.

**Events (proposed).** They set circumstances, never dialogue or outcomes: a couples quiz for immunity, Hot Seat (a confessional read aloud at dinner), banquets with assigned seating, talent night, a dinner where one dish is dangerous and one contestant knows which, and arrival day.

**The boycott answer.** LLM agents strongly tend to form "let's all refuse to play" pacts. The meter drains regardless, so a boycott means mass death: great TV once, then off the table.

## Rank, rooms and rules

The social order is visible at a glance: who sleeps where, who eats what, who showers in a glass box. Punishments are game-show cruelty, not prison cruelty: bright, public, humiliating and a little absurd, hurting dignity, comfort and standing, never bodies.

**Lifestyle by rank (rooms decided; food and booze proposed).** Exact numbers are in Part two.

| Rank | Sleeps | Washes | Eats | Booze |
| --- | --- | --- | --- | --- |
| 1 | The suite | Private bathroom, hot shower | Gourmet plates, plus treats | Fancy |
| 2–3 | The good room | The room's own bathroom, hot shower | Gourmet plates, while they last | Good |
| 4–6 | The basic dorm | The room's own bathroom (shared by three), cold shower | Plain plates | Cheap |
| 7 | A common-room couch | Sink baths in the public restroom | Leftovers | Rotgut |

**Getting let in (decided; odds proposed).** Bedrooms belong to their occupants. Anyone else can knock and ask to be let in; the occupant may say yes if they like the asker enough, or be annoyed by it. A guest who was let in is there legally and can use the bathroom and stay the night. Being inside without an invitation is entering above your rank.

Allowances become physical items once taken, so they can be carried, gifted, traded, hoarded or stolen. That creates favors, bribes and theft without any money.

**The rulebook (proposed, read on arrival).**

1. Never enter an area above your rank. Slipping in behind someone counts.
2. Never take what belongs to another.
3. Never damage the set.
4. Attend every ceremony and event.
5. Never interfere with the cameras (decided wording).

Killing isn't against the rules; getting caught is. The operator enforces selectively and may let a gloriously entertaining infraction slide.

**Enforcement (decided).** The station sees everything, but sentences come at the evening ceremony: "Tonight's infractions..." Robots escort the guilty to their sentence in front of everyone, and everyone learns who did what.

**Punishments.**

- **The fishbowl (decided).** A glass cell in the common room, overnight. The occupant hears every word said about them; others can tap the glass, talk, or pass food through a slot. It's kept slightly too cold and showers the occupant with cold water every hour. Aquatics mind it least.
- **Meter penalty (decided).** A cut to the meter that drops you down the ranks.
- **Collective punishment.** Cold water for everyone because of one person, which turns the station against them.
- **Exposure.** Your latest confessional plays at dinner.

**The daily order (decided).**

1. **Morning:** replacements arrive, then any pending trials are held immediately, so the newcomer is aboard to break ties. A tie that still happens breaks on ratings (the meter), then lifetime points.
2. **Evening ceremony:** anyone at zero is spaced, then ranks are assigned for the next 24 hours. The day's newcomers are ranked along with everyone else.
3. **Rank ties** break on lifetime points.

Because rooms are assigned at the ceremony, nobody needs a bed before then, newcomers included. The bottom contestant doesn't get to shower at all.

**Open.** A newcomer's access during their first day, before the ceremony ranks them, and whether the move to new rooms is a public ritual.

## The Wheel

Once a day the bottom-ranked contestant spins the Wheel (decided). Proposed timing: right after ranks are assigned at the evening ceremony, so every night ends on it. It's the one way to die besides the meter, a trial and murder. Segment weights are tunable; the spacing segment stays small.

John edited the segments on Oct 18. The current list, with proposed weights and slice-one effects, is in Part two under **The Wheel and the daily event**.

## Clothing

Clothing is decided as a feature, kept simple: clothes are a look, not inventory items (decided Oct 18).

- **Signature outfit (identity).** Each contestant gets an outfit generated on arrival from seventies sci-fi pieces (jumpsuits, capes, sequins, platform boots): silhouette, cut and colors, with the palette nudged by personality (loud for the vain and playful, muted for the reserved). It never changes, so viewers can always tell people apart.
- **Rank tier (status).** The same outfit is embellished by rank: richer fabric, trim, sparkle, accessories, and a cape or gold accents for rank 1. In layered sprites that's just an accessory layer chosen by rank.
- **Paper at the bottom.** Rank 7 loses their look and wears a paper jumpsuit; fresh ones come from the wardrobe in the public restroom. Climbing back out restores the look.
- **The show owns the clothes,** so nobody chooses to change. Robots deliver or repossess at the ceremony, along with room moves. A demotion to the bottom is a public repossession.
- **Simple effects by tier:** warmth (paper is cold), a small beauty bump, and a vanity thought ("dressed like nobody" hits the vain hardest).
- **Later, maybe:** event costumes from the operator, or lending someone your jacket (warmth plus a romance moment), without a real inventory.

## Confessionals (proposed)

The diary room is open at any time. Contestants go on their own, which is likelier when mood is low or after a big event, and the operator summons people after major moments ("Sola to the confessional, please"), a couple of times a day at most. Without AI a confession is a mood vent and an icon; with AI it becomes a monologue to camera, the audience's best window into motives. Confessions can be played at dinner as punishment.

## Booze

Booze is something contestants genuinely enjoy and something that reliably makes trouble (decided goal; the model below is proposed).

| Quality | Who gets it | Enjoyment per drink | Hangover |
| --- | --- | --- | --- |
| Fancy | Rank 1 | Big mood boost, fun, a "savored something special" thought | Mild |
| Good | Ranks 2–3 | Good mood boost and fun | Moderate |
| Cheap | Ranks 4–6 | Small boost | Bad |
| Rotgut | Rank 7, maybe from a hidden still | Barely a boost; it's about getting drunk | Brutal |

**Intoxication stages.** Each drink adds intoxication, modified by species and size, and it wears off over hours.

- **Tipsy:** social need fills faster, flirting odds up, mood up. Mostly fun.
- **Drunk:** inhibitions down, so insults, fights, confessions and secrets slipping out all get likelier.
- **Hammered:** stumbling, oversharing, and memory gaps: the character may not remember what they did, which breeds misunderstandings.
- **Hangover:** a bad thought the next morning, worse for cheap booze.

**Social drinking bonds.** Drinking together raises opinion, so the bar builds friendships and rivalries at once. Gifting good booze to someone stuck on cheap stuff is a strong favor.

**Appetite.** Some characters like drinking more than others, and a heavy drinker who goes without gets restless. Whether that becomes real dependency is open.

## The life simulation

Contestants pursue their own lives even when it isn't entertaining, and their needs constantly get in each other's way. Almost all of it runs as plain game code with no LLM.

**Needs and how they collide.**

| Need | How it's met | How contestants affect each other |
| --- | --- | --- |
| Rest | Beds of varied quality | Snorers (a trait), late-night noise and shared rooms disturb sleep |
| Hunger | Simple meals for all; treats for the highly rated | Binging can leave others short; treats breed envy |
| Social | Conversation, company | Some crave it, some are drained by it |
| Recreation | Several types (games, music, screens, the spa, the garden), each preferred differently | Contested equipment; two-person activities need a partner |
| Hygiene | Bedroom bathrooms by rank; sink baths for the bottom | Three people share the dorm's bathroom; modesty clashes; begging to be let in for a hot shower |
| Bladder | Bedroom toilets and the public restroom | Everyone ends up in the restroom at odd times, which makes chance meetings; booze makes it worse |
| Comfort | Good furniture, pleasant rooms, the right temperature | Species preferences clash over the thermostat and the best seats |
| Ratings | Being entertaining | Survival pressure, rising in priority as the meter falls |

**Modesty.** Characters have feelings about being seen naked, so shared bathrooms and shared sleeping are a constant source of small friction.

**Substances.** Drinks and other substances at the bar shift mood, lower inhibitions, and raise the odds of fights and confessions.

**Utility AI.** Objects advertise which needs they satisfy, as in The Sims. Each character scores the options by need urgency, personality, mood and current intentions. The engine decides whether an action is possible and how long it takes.

**Health (proposed, minimal).** One health bar plus a few conditions: injured, sick or poisoned, drunk or high, exhausted. Injuries slow people down and leave evidence. Hunger crashes mood but never kills; deaths come only from the show and from murder.

**Mood as a sum of reasons (RimWorld-style).** Mood is the total of active thoughts, each with a value and an expiry: slept badly, ate a treat, was insulted, saw an execution. It stays explainable to viewers and readable for the LLM.

**Mental breaks (RimWorld-style).** When mood falls below thresholds set by personality, characters break, and volatile ones break sooner. Show-flavored breaks: crying in the confessional, stealing and binging the treats, an insulting spree, refusing to leave their bunk, and at the extreme, violence. Breaks feed the misery loop.

**Tuning target (John).** The station should run hotter than a real reality show. Privileges and discomforts should be felt every hour, breakdowns should be common, and substances, hookups and the occasional murder should all be part of ordinary life, at a cute, pixelated PG-13. A stable, tidy day means the numbers are too gentle.

**Dread, mechanically (proposed).** Everyone carries a baseline "I'm trapped here" thought; each death leaves grief that lingers; fear rises when anyone's meter is low, not only your own; your own low meter adds "the show is going to kill me." A hookup on death row should feel different from a hookup on a dating show.

**Personality touches everything (decided goal, proposed mechanics).** Personality scales how fast needs drain and how much each action and each thought is worth to that person: outgoing people get lonely faster, volatile people's thoughts hit harder, vain people suffer more in a cramped bunk, modest people mind shared bathrooms, kind people suffer more watching cruelty. Getting the feel right is a tuning job for the prototype.

## Characters and species

Every contestant is a set of randomized numbers that the LLM interprets, never the other way around. That is what keeps the cast varied, cruelty included.

**The character sheet (agreed in discussion; axis names proposed).**

| Part | What it holds | What it drives |
| --- | --- | --- |
| Species | Look, comfort temperature, a couple of stat or need modifiers | Visual identity, clashing preferences |
| Physical | Strength, beauty, stamina | Fights, murder, attraction, endurance |
| Personality | Eight Sims-style sliders: outgoing–reserved, kind–cruel, honest–deceptive, calm–volatile, loyal–fickle, brave–timid, vain–modest, playful–serious | Utility weights, break thresholds, how the LLM plays them |
| Ideal personality | The same eight sliders, describing their type | Crushes |
| Gender | A feminine-to-masculine axis | Attraction |
| Orientation | Attraction to femininity and to masculinity (doubles as desire) | Who they fall for, and how much |
| Monogamy | How strongly monogamous they want to be | Jealousy, affairs, mismatched expectations |
| Tastes | Favorite recreation, food, modesty, reaction to substances | Daily choices and friction |
| Traits | One to three RimWorld-style named traits, each one strong rule; the old quirks (snores, hums, hoards, sleepwalks, night owl) become traits (D-108) | Readable character, behaviour the sliders can't give |
| Arrival drive | The strong want they wake up with | Stops the "where am I?" loop |
| Voice | An LLM-written persona and speech style, made once | Consistent dialogue |
| Live state | Needs, mood, health, meter, lifetime points, relationship ledger, beliefs, intentions, inventory, secret immunities | Everything else |

**Generator and casting (proposed).** Probability rolls the numbers first; then the LLM writes a persona that fits them. The casting step favors variety and friction, which is exactly what reality-show casting does. Slice one does it per empty slot: roll five candidates, keep the one furthest from the current cast's average personality.

**Species (decided Oct 18).** Sexy aliens, not monster aliens: attractive, visually recognizable humanoids a viewer can picture at a glance. They aren't very mechanically unique, and there are no species-only needs (no "wet" need) or species habits like snoring. Each gets a slightly different comfort temperature and a stat or need tweak or two; every individual still rolls their own stats. Visually they share one humanoid base, and species differ in overlay layers (ears, horns, tails, crests, gills, markings), height and palette ranges. Names are placeholders.

| Species | Look | Mechanics |
| --- | --- | --- |
| Human | Familiar, varied, ordinary people; the baseline the others look exotic against | None |
| Elfin | Taller, slender, elongated ears, unusual eye and skin colors | Beauty bonus (kept small so it doesn't win every romance), strength penalty |
| Horned | Strongly built, horns, tails, unusual skin colors, maybe facial markings; imposing but with room for beauty | Strength bonus, hunger drains faster |
| Feline | Shorter, expressive, large eyes, pointed ears, tails; more humanoid than animal | Grooms instead of showering, fun drains faster |
| Aquatic | Sleek, smooth skin, striking eyes, delicate gills, maybe bioluminescent markings | Hygiene drains faster; any water refills it, cold included; prefers it cooler |
| Reptilian | Fine scales, angular features, unusual pupils, colorful crests or markings; sophisticated, not crocodile-headed | Prefers it warmer, sleeps more, less bothered by social hits (insults, rejection) |

The point of the tweaks is that rank lands differently on each species: the bottom rank's no-shower life barely touches a feline and tortures an aquatic; the dorm's cold water doesn't bother an aquatic; a reptilian in a cold dorm is miserable. Starting numbers are in Part two.

**New arrivals.** Each keeps personality, language, instincts and skills but no memories, and wakes with a strong drive so newcomers don't all open with the same confused monologue. Veterans decide what to tell them.

## Attraction, relationships and lovin'

Attraction is computed separately in each direction, and relationship status is something each character believes, not a shared fact. That is what makes one-sided crushes and "I thought we were exclusive" possible.

**Attraction (decided inputs, proposed formula).** How fast A grows attracted to B:

```math
\text{rate}_{A \to B} = \text{genderFit}(A, B) \times \big[\, w \cdot \text{beauty}(B) + (1 - w) \cdot \text{fit}(\text{ideal}_A, \text{perceived}_A(B)) + \text{chemistry}_{AB} \,\big]
```

- Gender fit is how strongly A's two attraction axes pull toward wherever B sits on the gender axis. High values on either axis also make A more drawn in general.
- The looks weight w is universal (decided), with personality able to matter more; a very beautiful contestant can turn everyone's head.
- Personality fit uses A's perception of B, not B's true stats. First impressions run on beauty, fit grows as they get to know each other, and a deceptive character can fake being someone's type.
- Chemistry is a hidden per-pair roll. No species preference.
- Crushes need no label inside the sim; they're attraction above a threshold. Viewers can see a small heart icon.

**The relationship ledger (proposed).** Each relationship is a list of dated reasons, RimWorld-style, across four dimensions to start: affection, attraction, trust, and fear or resentment.

**Relationship labels are beliefs (proposed).**

- Each character holds their own label for every relationship: nothing, flirting, fling, dating, exclusive, ex.
- Labels change through explicit moves (woo, ask out, propose exclusivity, break up), each with odds based on attraction and the ledger.
- After any romantic scene, each participant records separately what they took away from it. Vague conversations naturally produce two readings, and personality biases them: a romantic over-reads, a fickle character under-commits.
- A deceptive character can say yes to exclusivity out loud while privately keeping it a fling.
- Monogamy sets default expectations, so mismatches happen even without lying.
- The engine only checks when evidence arrives. When A sees or hears about B with C, A's label decides whether it's betrayal or mild jealousy, and B's label decides whether B feels guilty.
- Viewers see both labels side by side, so they see the disaster coming first.

**The arc this should produce on its own.** A couple's romance earns ratings, then the judge gets bored. One partner fakes jealousy for points; the other is genuinely hurt; the fake fight becomes a real crisis, which scores well. Now one contestant has learned that hurting someone they love helps them survive.

**Lovin' (decided).** Always consensual, never shown: lumps under the covers or censor bars, PG-13 and safe for work. It needs mutual attraction, a relationship above a threshold, and both characters choosing it. It boosts mood and the relationship, and ripples outward: roommates' sleep, exes' jealousy, the gossip network, a walk back to your own bed. The judge loves a first hookup and gets bored with the twentieth. Dialogue stays flirtatious and suggestive, and prompts specify fade-to-black. There are no coercion mechanics, no pregnancy and no births.

**Conversations, gossip and memory (proposed).**

- Most encounters are canned interactions. The gate escalates to an LLM scene for rare interaction types, triggered intentions, first meetings, confrontations, romance moves and arguments about the show.
- Agents know only what they saw or were told. A rumor is a data object (about whom, what it claims, how accurate it still is, who knows it), passed along cheaply and written out in prose only when spoken in a scene.
- Memory tiers: recent events, the ledger, key memories, beliefs including judge theories, active intentions. Older material is compressed at reflection time.
- The confessional is the audience's window into motives, and the announcer can read one aloud at dinner.

## What to borrow from RimWorld

RimWorld already generates friendships, feuds, affairs, breakdowns and murders with no AI at all, so it can be the blueprint for the free layer. What it lacks is words, plans and lies, which is exactly what the LLM adds. Its designer bills it as a [story generator](https://rimworldwiki.com/wiki/About_RimWorld), with an AI storyteller modeled on Left 4 Dead's AI Director; it leans on [apophenia](https://blog.habrador.com/2019/06/why-rimworld-sold-more-than-1-million.html), people's habit of seeing stories in simple systems.

| System | How RimWorld does it | What we take |
| --- | --- | --- |
| [Opinion ledger](https://rimworldwiki.com/wiki/Social) | Opinion of each person (−100 to +100) is the sum of dated social memories, each with a value, duration and stacking limit. A deep talk is +15 for 20 days; an insult is −15 for 20 days. Above +20 is a friend, below −20 a rival. | Store relationships as a ledger of reasons, not a slider. The LLM reads the top entries as context and writes new ones after scenes. |
| [Random interactions](https://rimworldwiki.com/wiki/Social) | Nearby pawns interact by weighted pick: chitchat weight 1 (+0.66 opinion), deep talk 0.075, slight 0.02, insult 0.007. Insult odds scale from ×6 at −100 opinion to ×0 at +100; abrasive pawns ×2.3. | This is our canned-interaction layer. Most encounters are cheap chitchat; the rare types (deep talk, insult, romance attempt) are what the gate escalates into LLM scenes. |
| [Hidden compatibility](https://rimworldwiki.com/wiki/Social) | Each pair gets a hidden pseudo-random compatibility value (average 0.3) plus an age term. It scales deep-talk and insult odds. | Roll a hidden chemistry value per pair on arrival, with species modifiers. Some pairs just click or grate, with no one deciding it. |
| [Escalation](https://rimworldwiki.com/wiki/Social) | Each insult has a 4% chance to start a fistfight (slights 0.5%), multiplied by drunkenness (up to ×5) or hunger (up to ×3). Afterward a coin flip makes the fight cathartic (+38 opinion) or angering (−22) for 20 days. | Probability chains with multipliers. The bar becomes a conflict multiplier. Coin-flip outcomes create reversals, like enemies who become friends after a brawl. |
| [Romance](https://rimworldwiki.com/wiki/Social) | Attempts need the target to like you. Success depends on opinion, attractiveness, and how the target feels about their current partner. Rebuffed: −10 and −15. Breakup: −50 to the dumped. Affair: −70 to the cheated partner. Lovers start at +35. | Romance as gated attempts with odds. Failures and affairs leave long-lived ledger entries. Affairs start when opinion of a partner sinks while opinion of someone else rises. |
| [Mood and mental breaks](https://rimworldwiki.com/wiki/Mental_break) | Below 35% mood, minor breaks average one per 4 days; below 20%, major breaks every 0.8 days; below 5%, extreme breaks every 0.5 days, including berserk and murderous rage. A break ends with a +40 catharsis boost for 3 days to prevent spirals. | Free drama from mood alone. Murderous rage gives crimes of passion alongside LLM-planned murders. A catharsis-style bounce keeps the meter from triggering death spirals. |
| [Death ripples](https://rimworldwiki.com/wiki/Thoughts) | A friend's death is −10 mood for 20 days; a rival's death is +10 for 10 days; witnessing a death −5; seeing a corpse −4. | Every execution or murder automatically shifts everyone's mood by relationship. Rivals gloat, friends grieve, no LLM needed. |
| [Trait opinion offsets](https://rimworldwiki.com/wiki/Social) | Some traits shift everyone's opinion permanently, such as an annoying voice (−25 from others) or a teetotaler's dislike of drug users (−20 to −30). | Possibly small species-level offsets for built-in inter-species friction (not planned; species are kept mechanically light). |
| [Storyteller pacing](https://rimworldwiki.com/wiki/Cassandra_Classic) | Events are chosen with colony wealth, population, recent deaths and time since the last major event in mind. Cassandra alternates 4.6-day "on" phases (1–2 major threats, at least 1.9 days apart) with 6-day "off" phases. | The operator's event scheduler: on/off pacing, backing off after deaths. Like RimWorld's storyteller, it picks circumstances, never outcomes. |

**What the LLM adds that RimWorld can't.**

- **Words.** RimWorld logs "X insulted Y." We can generate the actual argument for the encounters that matter.
- **Intentions.** RimWorld pawns react; they never plan a confrontation or a betrayal. Standing intentions add plans.
- **Interpretation.** The LLM decides what an event means to a character and writes it into the ledger, such as "Jonas lied to me: trust −20 for 10 days."
- **Lies and secrets.** RimWorld has no deception. Gossip, alibis and manipulation are LLM territory.

**The big lesson.** Simple systems plus viewers' imagination carry most of the story. Let the free layer carry volume, dozens of small interactions per contestant per day, and spend tokens on fewer, better scenes.

## The AI's role

The simulation decides what happens; the AI interprets it, nudges it, and writes it. Characters are not independent agents talking to each other: each is a sheet of numbers and memories that a model reads when it needs to speak or think for them.

**Three levels.**

1. **The simulation (no LLM):** movement, needs, routines, social rolls, mental breaks, outcomes of interactions.
2. **Reflections (LLM, one call per character):** on a schedule or after a big event, a short private call reviews what happened to this one character and updates priorities, attitudes, beliefs and standing intentions. This is the one place a character's own perspective gets its own call.
3. **Scenes (LLM, one call per scene, decided):** when the gate decides a moment matters, one model gets both characters' sheets, what each knows, the situation and the mechanical outcome, and writes the whole exchange. It also returns structured takeaways, such as what each character believes was agreed. Instructions keep each character to what they know, so secrets don't leak into dialogue.

**Standing intentions with triggers.** Example: Zara is exhausted, her ratings are low, and she suspects her boyfriend Jonas is lying. Her reflection sets a standing intention to confront Jonas, triggered when she is alone with him and rested. The engine walks her to bed, wakes her, feeds her, and only calls the LLM again when the trigger fires.

- Triggers come from a small fixed vocabulary the engine can check: alone with X, X nearby, in room Y, energy above a level, ratings below a level, witnessed X doing Y, received a piece of gossip, holding an object, a scheduled time.
- Every intention has an expiry and interruption conditions, so plans don't go stale. Emergencies override everything.

**Attitudes become weights.** Reflection sets a demeanor toward each person (friendly, hostile, attracted, afraid). The engine turns those into utility weights and interaction odds, so hallway behavior has personality with no extra calls.

**Judge theories become weights (proposed).** Ratings are a need, but utility AI can only satisfy a need when something advertises it, and the judge is secret. The bridge: each agent's theories about the judge. If Zara's reflection concludes "public arguments score well," her weight for arguing in public rises. Learning the judge then shapes everyday behavior, theories can be shared, traded or used to manipulate, and wrong theories get people killed.

**The ledger is the memory.** Reflections and scenes read the opinion ledger and recent thoughts as context, and write new entries back as structured output. Both the free layer and the LLM layer act on the same record.

## Murder, evidence and trials

The operator rewards murder, but murder should be hard, so it stays rare without any lockdown rule. "The point is drama, not bloodsport."

**Means come from everyday life (proposed).** No suits, no exits, and probably no dedicated weapons: the life sim already contains enough.

- **Substances:** a spiked drink, an overdose from the bar or the medbay shelf.
- **The spa:** drowning in the hot tub.
- **The galley:** knives and heavy objects, counted, so one going missing is noticed.
- **Strength:** bare hands, which makes the strong species dangerous.

Whether the operator should also occasionally gift something more dangerous is open.

**Why it stays rare.** It needs the victim alone, a believed-private spot, the right object, and a victim who doesn't see it coming. Victims can resist or flee, and a failed attempt someone witnesses is its own huge story. Killing also hits most characters' mood hard, unless their traits say otherwise.

**Two routes.** Planned: a reflection sets an intention to kill and the engine waits for the opportunity. Passion: an extreme mental break turns violent.

**Crimes of passion come from the sim (decided).** Certain mental breaks can end in murder, and the break type follows from its trigger, so rage aimed at a particular person comes from grievances against that person. The AI doesn't need to decide anyone attempts murder; a planned murder through AI intentions remains a possible addition.

**Evidence comes from the engine, never the LLM.** Door logs, who was where, what went missing (a knife, a vial), a wet floor, bruises from a struggle, when the body was found. The killer keeps a private alibi sheet so its lies hold up across conversations.

**No investigation (decided).** Contestants don't gather or present evidence; trials run on testimony. The engine's record still matters: it's the truth viewers see, and the announcer can divulge pieces of it, since the whole station is observed. How and when it leaks is open.

**Rewards (decided, details proposed).** Killing earns secret points, revealed in the hall of fame when the killer dies. A visible meter jump after a death is a clue.

**Accusation trials (decided).** After a death, anyone can accuse anyone. The accuser lays out the case, the accused defends, and the contestants vote. The loser, accuser or accused, is spaced. It is emergent (agents start it), self-limiting (a false accusation is deadly), a weapon (the real killer can frame someone), and rare enough to afford the most expensive scene in the game.

- Proposed: accusations only after an actual death, so there is a body.
- Decided: replacements arrive each morning and pending trials are held right after, so the newcomer is aboard to break a tie; a remaining tie breaks on ratings, then lifetime points. Open: whether the accuser and accused vote.

**Executions.** Robot stagehands, the same ones that serve drinks, seize the condemned and push them through the airlock, visible from the lounge. Varied stylized methods, Danganronpa-style, remain an option. Deaths ripple RimWorld-style: friends grieve, rivals gloat, witnesses are shaken.

## Weird station features (floated)

John's instinct is to go weird with it, which fits Running Man and Danganronpa. Each feature is just another object or event that the existing systems know how to use.

- **The arena.** Contestants can challenge each other, for a privilege or a grudge. Strength finally matters, and the crowd loves it.
- **Trial by combat.** An accused contestant can demand a fight instead of the vote.
- **Punishments that cost comfort, not life.** Losing your bed, cold water for everyone, a confessional broadcast at dinner.
- **The stockade** was floated and rejected (wrong vibe); the fishbowl replaced it.

## Viewers

Viewers watch, react and vote, and their reactions steer the operator's taste, but they never control anyone directly. It has to be fun with exactly one viewer.

**Three levels of watching.**

1. **The terrarium.** A top-down view of the station: characters moving, eating, flirting, arguing, with speech bubbles, icons and a ratings bar over each head. It should look good with zero reading.
2. **A character.** Click for species, stats, current activity, needs and mood (with the reasons), meter and lifetime points, relationships with both sides' labels, goals, intentions, recent conversations and confessionals.
3. **The data.** Relationship networks, ratings history, the leaderboard and hall of fame, deaths and arrivals, the event log.

**Voting and comments (decided).** Upvote or downvote almost anything (scenes, events, characters, moments) and leave comments. Votes train the judge rather than acting directly; see The show. Votes cast after the fact still count, since viewers won't be watching live.

**Comments need care (proposed).** If the station is public, anything a stranger types that reaches an LLM's context is an attack surface. Comments should become structured signals (sentiment per character or scene) or be filtered before the announcer reads any out, and never enter agent prompts raw.

**Event feed and replay.** A feed of significant moments lets a returning viewer catch up on the day. Any narrative layer that titles storylines must summarize what actually happened.

**Dramatic irony.** Viewers see what contestants can't: the true evidence record, who the killer is, both sides of every relationship label, and the moments contestants believe are private.

## The producer: recaps and storylines

You can't watch everything live, so a producer layer tells the story of the station to whoever logs in, and then they can look around and watch people. It is editorial presentation of what the simulation actually generated, never invented content.

- **"Previously on" recap (decided direction).** When a viewer arrives, they get the last day or two as storyline cards: a headline, a two-sentence summary, the day and number of significant scenes, and links into the underlying events.
- **Storylines as threads (proposed).** The producer groups events into ongoing storylines by the people involved and the ledger changes between them, such as "The collapse of Mars and Sola" or "Who killed Sola?". Each storyline page has its history, the relevant conversations, relationship changes, and links to the raw events.
- **Honesty rule.** Every claim in a recap must trace to logged events or scene transcripts. Headlines can be dramatic; facts can't be invented.
- **The operator's own broadcast (proposed).** In the fiction, the recap is the show's edit, voiced like the announcer. Viewer votes on storylines tell the judge which arcs the audience wants more of.
- **Cost (proposed).** One or two LLM calls a day at ceremony time, reading the event log and scene summaries rather than full transcripts.

# Part two: slice one

The first playable prototype: the death-game simulation with no AI, no art and no viewers, built to be run fast-forward and tuned. Every number here is a first guess, meant to be changed in data files, not code. Decisions are recorded in DECISIONS.md; anything not there is a proposal.

## Scope and success

Slice one answers one question: does the mechanical station, left alone, produce a death game worth watching? It runs headless at any speed and reports numbers.

**In:**

- Seven contestants and replacements, with stats, personality, the six species and attraction.
- The full station layout as rooms and objects, with access by rank.
- Needs, action scoring, social interactions, romance and lovin'.
- The relationship ledger, thoughts, mood and mental breaks, including crimes of passion.
- Booze and intoxication.
- Temperature, thermostats, bladder, the public restroom and sink baths, and clothing as a tier number by rank.
- The meter, deterministic scoring, lifetime points and the daily schedule.
- Ranks, privileges, rules, infractions and punishments, including knocking to be let in.
- The Wheel and a daily event slot.
- Arrivals, deaths and placeholder trials.
- The fast-forward harness and a crude debug view.

**Out:** AI of any kind, art, viewers and votes, the producer, clothing visuals, planned murders, confession content. See the last section.

**Success targets for a tuned run (first guesses):**

| Measure | Target |
| --- | --- |
| Deaths per week, all causes | 2–3 |
| Average stay | 2–4 weeks |
| Mental breaks, whole station | At least 1 a day |
| Fights, cage matches included | 3+ a week |
| Brawls (fights outside the cage) | No more than hookups |
| Hookups | 2+ a week |
| Nights with a couple aboard (proposal) | At least half over a run; most from week two |
| Hookups within a couple (proposal) | At least half |
| Infractions sentenced | Most days at least one |
| Rank changes at the ceremony | Most nights at least one |
| Days with nothing notable | Under 10% |

## Clock and daily schedule

One tick is one station minute. In live running a station day is a real day; the harness runs as fast as the machine allows. All randomness comes from one seeded generator, so any run can be replayed exactly.

| Time | Event | Notes |
| --- | --- | --- |
| 07:00 | Wake chime | Sleepers with rest above 40 wake; others may keep sleeping |
| 07:30 | Arrivals | Fill empty slots back to seven |
| 07:45 | Pending trials | Held only if a murder needs answering |
| 09:00–10:00 | Breakfast, cafe | Robots serve by rank; skipped when the Wheel says no breakfast |
| 13:00–14:00 | Lunch, cafe | Same |
| 15:00–16:00 | Daily event | A cage match, dance-off or The Button |
| 19:00–20:30 | Dinner, lounge | The bottom rank gets leftovers in the common room at 20:30 |
| 21:00 | Ceremony | Sentences, spacings, ranks, the Wheel, room moves |
| 23:00 | Lights dim | Bedtime isn't forced |

Schedule events override the action scoring: everyone attends ceremonies, trials and their meals unless broken down, sentenced or asleep through it. Missing a meal or event is a choice the sim can make, and skipping the ceremony is an infraction.

## Rooms, objects and access

The station is a graph of rooms with walking times between them; a real floor plan is designed below (The floor plan: the next pass) and not built yet. Each room has an access rule and an apparent-privacy value that contestants believe.

| Room | Access | Apparent privacy | Key objects |
| --- | --- | --- | --- |
| Common room | All | Low | Couches, the Wheel, the fishbowl, ceremony floor |
| Cafe | All | Low | Tables, serving counter |
| Lounge | Ranks 1–6 | Low | Bar, dance floor, karaoke stage, window seats |
| Rec room | Ranks 1–6 | Low | Bowling lane, arcade cabinets, snack and booze vending |
| Cage room | All | Low | The cage, seating |
| Spa | Ranks 1–3 | Medium | Hot tub (seats 4) |
| Public restroom (the "secret room") | All | Stalls high (believed); sinks medium | Three lockable stalls, three sinks, the paper-clothes wardrobe |
| Garden | All | Medium | Plants, benches, the hidden still |
| Confessional | All | High (believed) | Diary chair |
| Medbay | All | Medium | Bed, drug shelf (counted) |
| Suite | Rank 1, plus whoever they let in | High | Double bed, thermostat; private bathroom with toilet, sink, hot shower |
| Good room | Ranks 2–3, plus whoever they let in | Medium | Two big beds, thermostat; bathroom with toilet, sink, hot shower |
| Basic dorm | Ranks 4–6, plus whoever they let in | Low | Three beds, thermostat; bathroom with toilet, sink, cold shower |
| Airlock | Robots only | — | Executions |

**Objects advertise** what they offer, how long it takes, and how many can use them at once. A sample:

| Object | Uses at once | Offers | Duration |
| --- | --- | --- | --- |
| Bed (by quality) | 2: every bed sleeps two (D-104) | Rest, comfort | Until rested |
| Couch | 1 | Rest at 0.6 quality, comfort | Until rested |
| Shower, hot | 1 | Hygiene +60, comfort | 15 min |
| Shower, cold | 1 | Hygiene +40, "cold shower" thought (not aquatics) | 10 min |
| Toilet (bathroom or stall) | 1 | Bladder to 100; a stall is believed private | 3 min |
| Sink | 1 | Wash up; for rank 7, a sink bath: hygiene +15, "sink bath" thought | 2 min; sink bath 15 min |
| Paper wardrobe | 1 | A fresh paper jumpsuit (rank 7) | 2 min |
| Thermostat | 1 | Set the room's target temperature | 1 min |
| Grooming (felines, no object) | 1 | Hygiene +20, anywhere | 15 min |
| Bar | 4 | Booze by rank, social | 15 min a drink |
| Hot tub | 4 | Comfort, fun; hygiene +30 for aquatics | 30 min |
| Arcade, bowling | 2 each | Fun, social, rivalry | 30 min |
| Karaoke stage | 1 performer | Fun, performing, a small score | 10 min |
| Dance floor | 8 | Fun, social, flirting odds up | 30 min |
| Window seat | 2 | Comfort, the view | 30 min |
| Garden bench | 2 | Comfort, calm, believed privacy | 30 min |
| Hidden still | 1 | Rotgut | 20 min |
| Vending (snacks) | 1 | Hunger +20, fun | 5 min |
| Diary chair | 1 | Venting: halves one bad thought | 20 min |
| Drug shelf | 1 | Sedatives (taken items) | 2 min |

Using an object in a room above your rank is an infraction, whether you walked in or slipped in behind someone, unless an occupant let you in (see Rank, privileges, rules and punishments).

## The floor plan: the next pass

*Decided direction (john, Oct 23: D-114): the station gets a real floor plan with corridors, sight lines and distances, designed and reviewed before it's built. Nothing below is built yet; the shape is john's call (Open) and every number is a proposal for data. The plan drawn out: https://claude.ai/artifact/FXjEnuCALv94igW9Y1RQdA*

**Why.** Today the station is a hub graph: every room hangs off the common room, 1 to 3 minutes away, and walking is a timer. While someone walks they stay in the room they left until the minute they arrive, so nobody is ever in a corridor, nobody passes anyone, and nobody sees who went where. Witnessing is the same room or the fishbowl's glass, and noise never goes through a wall. So the layout decides nothing a viewer would notice: who walks past whom, who sees what through a doorway, where you can slip off unseen, whose bedroom is next to the party. Those are the things a floor plan is for.

**What it doesn't explain: the morning drinking.** 51% of drinks come before noon and 23% between 07:00 and 09:00 (12 seeds × 20 days). Tripling every walking time leaves that at 50 to 52%, so distance to the bar isn't it. Two things are:

- **The evening is half asleep.** Between 17:00 and 21:00, 41 to 58% of contestants are napping. Fun and social sit at 94 to 99 all day, so by late afternoon a nap (rest is down to about 68) outscores everything else. The evening, which should be the lounge's prime time, is half empty, and the drinks happen when everyone is up: the long free stretches from 07:00 to 09:00 and 10:00 to 13:00.
- **Nobody drinks for the fun.** Fun at the moment someone picks a drink averages 93 to 99, so drinks are chosen on the personality pulls and the lounge's comfort, which don't care what time it is.

That's a needs problem (nothing is ever short), not a layout one, and it belongs in its own thread. The floor plan can make the evening worth staying up for, but it won't stop the naps by itself.

### The shape (proposed: a ring)

One deck, seen from above, about 60 × 50 tiles (a tile is a metre). A corridor, **the Promenade**, three tiles wide, runs in a ring around the middle. The public rooms sit inside the ring, everything else opens off its outside, and the space-side hull runs along the north.

| Where | Rooms | Why there |
| --- | --- | --- |
| Inside the ring | Common room (center, fishbowl in its corner), Cafe (open to the common room through a wide arch), Public restroom and Confessional (doors only into the common room) | Everyone comes through the common room several times a day: meals, the restroom, the diary room, the ceremony. Rank 7 sleeps on its couches, beside the restroom door |
| North, on the space hull | Lounge (panoramic window along the whole north wall, wide arch onto the ring), Spa (reached only through the lounge, with a glass wall onto it) | The evening hub faces space. The top three soak in full view of the bar; rank 7 can look in from the corridor at a party they're locked out of |
| West | Garden (a dead end, one door, the still at the back behind the plants), Airlock, Suite | The quiet side. The garden is the one place off the beaten path. The suite has nobody through the wall |
| East | Cage room (open to the ring, so passers-by watch), Medbay (next to the cage), Rec room | The loud side |
| South, inner hull | Good room, Basic dorm | The dorm shares a wall with the rec room and the good room. The suite is soundproofed, so nothing carries through its walls |

Rough walking times at 25 tiles a minute (computed from the plan, not typed in): next door 1 minute, across the station 2 to 3, the dorm to the bar about 2.5. That's close to today's 1 to 3, so the clock and tuning don't move much.

**Alternatives** for john to weigh: **a spine**, one long corridor with rooms on both sides like a cruise ship deck (one choke point, so everyone passes everyone, and no long way round); **the hub made real**, the common room as the only corridor with every door opening off it (closest to today, everything witnessed, nowhere to sneak). The ring is the middle: busy enough to bump into people, with two ways round anything and a quiet far side.

### What the sim does with it

All of it is data in `data/rooms.yaml`: each room gets a rectangle on the grid, corridors become rooms of their own (`kind: corridor`, access all, apparent privacy 0.3, no objects), and `links` is replaced by a list of openings between two spaces, each one a **door**, an **arch** or **glass**. Walking times come from the geometry. Loading checks that rectangles don't overlap, every opening sits on a shared wall, and every room can be reached by everyone who's allowed in.

1. **Walking is through spaces.** A trip is a path along the plan at 25 tiles a minute, and each minute a walker is in whichever space their tile is in. So a walker is in the corridor, then the common room, then the cafe, and can be seen in each. Paths only cross spaces the walker may enter (corridors, the common room, the cafe; never a bedroom or the lounge on the way somewhere else). Paths are precomputed per pair of spaces, so this stays cheap.
2. **Sight lines.** Seeing reaches your own space plus any space joined to it by an arch or glass, and a corridor segment sees its whole length but not round a corner. Hearing reaches your own space and through arches, not glass. Everything that today reads "awake in the same room" (witness counts for scoring, "watched them throw up", murder witnesses, seeing a kiss) reads "can see" instead; gossip that's overheard needs hearing. Proposed openings: common ↔ cafe arch, common ↔ fishbowl glass (as now), lounge ↔ north Promenade arch, lounge ↔ spa glass, cage ↔ east Promenade arch. Every other opening is a door, and a door blocks both.
3. **Noise through walls.** A noisy room keeps sleepers next door awake at a fraction of the same-room cost (proposal 0.5): the rec room in use, snorers, and lovin', which also gives the neighbours "heard them through the wall" and files it in their gossip memory as something seen. The suite has no bedroom neighbours; the dorm has two.
4. **Passing in the corridor.** Two people awake in the same corridor minute can have a short interaction without stopping: a hello, a slight, a flirt, or spilled gossip (a `passing` list in `data/social.yaml`). It's the hallway run-in reality TV runs on.
5. **Seen going in together.** When two people go through the same closed door within two minutes (the restroom, a bedroom, the garden) and someone sees it, the watcher remembers "went in together" as a gossip item that counts like a seen flirt: spillable, and grounds for jealousy for a partner. The restroom's cover story finally has something to cover.
6. **The discreet way round.** Someone sneaking above their rank, or heading somewhere with a person they're cheating with, picks the route that passes the fewest watchers, weighted by deceit (each person they'd pass costs walking minutes × deceptive ÷ 10). The cameras still log the infraction; this is about the other contestants.
7. **The dead drift past the window.** After a spacing, the robots walk the condemned from the common room round the Promenade to the airlock in front of anyone on the way, and about 15 minutes later the body drifts past the lounge window: everyone in the lounge gets "{who} drifted past the window" (fear −4, a day). It's the show's defining image and it costs one thought row.

**The debug view** draws the plan from the same data: rooms and corridors as their rectangles, doors as gaps, arches dashed, glass in blue, the window on the north hull. Dots move along their paths instead of jumping, and clicking a room lights up what it can see and hear. The Phaser client later draws art over the same grid; whether it's authored in Tiled and converted is a question for then.

### Build order

One PR each, tuned back to all targets before the next:

1. The plan in data, walking through spaces, and the debug view drawing it.
2. Sight lines and noise through walls.
3. Passing in the corridor, seen going in together, the discreet way round, and the drifting dead.

## Contestants, species and the generator

**The sheet.** All stats run 0–10 unless noted.

| Field | Values | Notes |
| --- | --- | --- |
| Name, pronouns | Generated | Pronouns follow gender with some randomness |
| Species | One of six | See below |
| Strength, stamina, beauty | 0–10 | Rolled, then species modifiers |
| Personality | Eight axes, 0–10 | Outgoing, kind, honest, calm, loyal, brave, vain, playful |
| Ideal personality | Eight axes, 0–10 | Their type |
| Gender | 0 (feminine) to 10 (masculine) |  |
| Drawn to femininity, to masculinity | 0–10 each | Also stands in for desire |
| Monogamy | 0–10 | Default expectation of exclusivity |
| Tastes | Favorite recreation types, drinking appetite 0–10, modesty 0–10 |  |
| Traits | One to three named traits (D-108) | From `data/traits.yaml`; the old quirks (snores, hums, hoards, sleepwalks, night owl) are traits now. See Personality, traits and mood: the next pass |
| Live state | Needs, mood, thoughts, health, intoxication, meter, lifetime points, rank, ledger, labels, inventory, immunity |  |

**Species.** Mechanics are deliberately light; looks are in Part one. Comfort ranges are in °F before clothing.

| Species | Stat and need modifiers | Comfort range | Size (for booze) |
| --- | --- | --- | --- |
| Human | None | 66–76 | 1.0 |
| Elfin | Beauty +1.5 to the roll's average, strength −2 | 64–74 | 0.9 |
| Horned | Strength +3, hunger drains 1.5× | 62–72 | 1.3 |
| Feline | Grooms anywhere instead of showering (hygiene still drains); fun drains 1.5× | 68–78 | 0.8 |
| Aquatic | Hygiene drains 2×; any shower, the hot tub or a sink bath refills it, with no cold-shower thought | 60–70 | 1.0 |
| Reptilian | Prefers heat; rest drains 1.25× (sleeps more); social thoughts (person and rejection sources) ×0.7 | 74–84 | 1.0 |

**Generator and casting.** Roll stats from bell curves (most people near 5, some extremes), apply species modifiers, roll one to three named traits. For each empty slot, generate five candidates and pick the one whose personality is furthest from the current cast's average, which favors friction and variety. Names aren't reused within a season (a station run) until the list of 60 runs out, so recaps never have two Odiles (proposed, Oct 23).

## Needs

Needs run 0 (desperate) to 100 (satisfied).

| Need | Drain per hour | Urgency weight | Main refills |
| --- | --- | --- | --- |
| Hunger | 6 (horned 9) | 1.2 | Meal +70; leftovers +50; snack +20 |
| Rest | 4 while awake (reptilian 5) | 1.0 | Sleep +12 an hour × bed quality: suite 1.2, good 1.0, dorm 0.8, couch 0.6 |
| Hygiene | 3 (aquatic 6) | 0.6 | Hot shower +60; cold +40; sink bath +15; feline grooming +20. The bottom rank can't shower |
| Bladder | 15; +15 per drink | 1.5 | Toilet to 100. Near zero it overrides everything and they go to the nearest toilet they can use. No accidents |
| Social | 5 × outgoing factor | 0.8 | Conversation about +8 per 15 minutes |
| Fun | 4 × playful factor (feline ×1.5) | 0.7 | Activities +10 to +20 per 30 minutes × taste |
| Comfort | No drain; set by surroundings | 0.5 | Good furniture, quiet, the right temperature |

Low needs add bad thoughts (hungry, exhausted, filthy, lonely, bored), which is how they reach mood. Hunger never kills.

**Beds and sleep, as built (proposed; `data/needs.yaml` sleep, `data/traits.yaml` for the sleep traits).**

- **Every bed sleeps two** (the couch and the fishbowl floor don't count). How someone feels about a bedmate is 3 × (attraction − 5) ÷ 10, plus 1 for a fling, 3 dating, 4 exclusive (tuned up from 0.5, 1 and 1.5 so couples sleep together): welcome with a crush, unwelcome otherwise. When choosing where to spend the night (not a nap), that feeling adds to the bed's score for whoever's in it or heading there, and for a bed's owner if it isn't theirs, unless the owner is already in or heading for another bed (otherwise two partners each head for the other's bed and sleep apart).
- **Getting in** takes asking: knocking from outside (Getting let in) or asking a roommate, or an invitation to spend the night (Romance). Knocking for a bed asks that bed's owner (other actions in the room ask the most promising occupant). All use the knock odds, × 0.3 when the host would rather not have them beside them, × the attached factor when the host is seeing someone else (Romance). A host lets in someone they're dating or exclusive with even if it means being woken. A no gives "wouldn't share a bed" (−3, 12 hours). At the wake chime a roommate who shared goes back to their own bunk.
- **Waking** after three hours or more beside someone leaves "slept beside them" (+4) if the feeling came out at 0 or more, otherwise "had to share a bed with them" (−5).
- **Noise:** a snorer asleep or a hummer awake in the room cuts other sleepers' rest gain to 70% and wakes them with a 0.3% chance a minute. A bed in a room with someone noisy in it right now costs 1 in scoring. Waking leaves "they kept me up" (−4) and affection −3 toward the culprit.
- **Night owls** (a trait, about one contestant in forty) have a night 2.5 hours later than everyone's, 01:30 to 09:30: their sleep pull, when they stop sleeping, and the wake chime, which doesn't wake them. Summonses still do. **Early birds** are the opposite: their night runs 21:30 to 05:30 and their own chime wakes them at 05:30.
- **Sleepwalkers** (a trait) have a 4% chance each hour asleep of getting up and wandering for 20 minutes to another room they're allowed in (about one night in four), logged as "sleepwalk". Then they find their way back to bed like anyone else.

## Temperature

Every room has a temperature in °F, clamped to 60–85 so nobody is ever harmed. Rooms drift toward their setting by about 2°F every 10 minutes.

- **Operator-set rooms:** common room 66 (the couch runs cool), fishbowl 61, spa 76, lounge, cafe and the rest 70.
- **Bedroom thermostats:** any occupant (not a guest) can change the setting, except in the suite, where only rank 1 can. Anyone present who ends up less comfortable gets an affection −3 entry toward whoever changed it.
- **Felt temperature** = room temperature + clothing warmth. Warmth by rank tier: rank 1 +3, ranks 2–3 +2, ranks 4–6 +1, rank 7 (paper) −1.
- **Outside your comfort range,** you get a "too cold" or "too hot" thought: −1 per 2°F outside, up to −8, while it lasts. Source: discomfort.
- **Show levers:** "cold station" (every operator-set room −6 for a day) is available as a punishment; a warm night as a reward.

## Clothing in slice one

No visuals yet, only a tier by rank:

| Rank | Warmth | Beauty | Thought |
| --- | --- | --- | --- |
| 1 | +3 | +1 | "Dressed like a star" +3 (vain ×) |
| 2–3 | +2 | +0.5 | — |
| 4–6 | +1 | 0 | — |
| 7 (paper jumpsuit) | −1 | −0.5 | "Dressed like nobody" −3 (vain ×) |

Clothes change at the ceremony with room moves.

## Personality grid

Personality has to touch everything, so every axis scales needs, pulls toward actions, and how hard thoughts hit. Each effect is a multiplier: an axis at 5 changes nothing, and at 0 or 10 it scales by 1 − k or 1 + k, with k per effect in the data files (about 0.5 to start).

| Axis (0 → 10) | Needs | Pulls toward actions | Thoughts and social |
| --- | --- | --- | --- |
| Reserved → outgoing | Social drains faster | Crowded rooms, dance floor, karaoke; reserved people prefer quiet spots | Starts more interactions |
| Cruel → kind | — | Gifts, sharing, comforting, feeding the fishbowl prisoner; cruel people mock, steal, hoard | Insults and slights rarer; witnessing cruelty hurts more |
| Deceptive → honest | — | Theft, sneaking above rank and lying about exclusivity get rarer | Guilt after infractions; passes gossip on more accurately |
| Volatile → calm | — | Volatile people drink more when unhappy | Break lines lower; every thought hits harder when volatile (up to 1.4×); fights likelier |
| Fickle → loyal | — | Flirting while attached gets rarer | Affection fades slower; betrayal hurts more |
| Timid → brave | — | Flirting, challenges, the Wheel's dares, sneaking off to the restroom stalls | Fear hits less; accepts cage matches |
| Modest → vain | Status matters more | Spa, karaoke, being seen | Rank thoughts amplified: the couch and rotgut hurt more, the suite and fancy booze please more |
| Serious → playful | Fun drains faster | Games, dancing, karaoke | Boredom hits harder |

**Why people drink.** Three pulls stack, so drinking looks different in different people:

- **Taste:** drinking appetite from 0 to 10 sets the base.
- **Social:** outgoing and playful people drink more when others are around.
- **Self-medication:** a bad mood raises the pull, doubled for volatile people.

A sober loner, a party animal and an unhappy hothead all reach for the bar for different reasons, at different times.

## Choosing actions

A contestant re-decides when an action ends, every 30 minutes during long ones, or when interrupted (spoken to, a schedule event, a need going critical).

```math
\text{score} = \Big( \sum_{\text{needs}} u(n) \cdot \frac{\text{gain}_n}{10} + \text{pulls} - \text{costs} \Big) \times \text{personality} \times \text{mood} \times \text{noise}, \qquad u(n) = w_n \left( \frac{100 - n}{100} \right)^2
```

- **Pulls:** people present whom they like or are attracted to (negative for people they avoid or fear), a believed-private spot when they're up to something, the bar's drinking pull.
- **Costs:** walking time, a queue or a full object, a cold shower, modesty in a public bathroom, the risk of an infraction (scaled by honesty and bravery).
- **Privacy:** an exposed action (a shower, an open toilet, a sink bath) with others in the room costs modesty ÷ 10 in scoring. Finishing one with someone awake watching leaves "no privacy" (−3 × modesty ÷ 5, 6 hours); a lockable stall doesn't count.
- **Personality:** the grid's multipliers for that action's tags.
- **Mood:** below 40, solitary and comforting actions ×1.3, social ones ×0.7.
- **Noise:** ×0.85 to 1.15, then a weighted pick among the top three.

Every action carries tags (social, solitary, comforting, risky, romantic, performing, drinking, illicit) so the personality grid and mood modifier can apply generically.

## Social interactions and romance

Every 10 minutes that two contestants share a room and aren't absorbed in something, each may start an interaction. Chance: outgoing ÷ 10 × (0.5 + social urgency), × 1.5 if tipsy or drunk. The type is a weighted pick.

| Interaction | Base weight | Scaled by | Result |
| --- | --- | --- | --- |
| Chitchat | 1 | — | Social +8; affection +0.25 (tuned from +0.5) |
| Deep talk | 0.075 | Hidden chemistry | Affection +10; learns the other's personality better |
| Gossip | 0.05 | Only when holding a rumor | Passes a rumor on; may garble it |
| Gift | 0.03 | Kindness, affection, having something to give | Affection +5 to +15 by value |
| Kind words | 0.02 | Kindness | Target's mood +5 |
| Flirt | 0.02 | Attraction, privacy, bravery, drunkenness | See romance below |
| Slight | 0.02 | Low affection, cruelty | Affection −5; small bad thought |
| Insult | 0.007 | Low affection, cruelty, drunkenness (up to ×5) | Affection −15; bad thought; fight chance |

**Fights.** Each insult has a 4% chance of a fight (×2 drunk, ×3 hammered, ×1.5 when volatile). A fight lasts a few minutes: strength, stamina and a die roll decide who's hurt. The loser loses 10–30 health; a serious injury is rare. Afterward a coin flip makes it cathartic (+20 affection) or angering (−20). Fights outside the cage are an infraction.

**Attraction.** Each direction is computed separately: gender fit from the two attraction axes × \[beauty × 0.4 + perceived personality fit × 0.6 + chemistry\]. Perceived fit starts from appearance and improves with each deep talk.

**Romance moves**, each a weighted social choice once attraction is high enough:

| Move | Needs | Success odds from | On success | On failure |
| --- | --- | --- | --- | --- |
| Flirt | Attraction 4+ | Target's attraction back | Both affection +5; attraction grows | Rebuffed: flirter −8 mood, target "awkward" |
| Kiss | Attraction 6+, flirted before | Target's attraction and affection | Labels move to flirting | Rebuffed hard: −12 mood, gossip-worthy |
| Proposition (lovin') | Both attraction 6+, affection 20+, a believed-private spot | Both choose it | Lovin', censored: mood +10 for a day, affection +10, roommates disturbed | Turned down: −10 mood |
| Ask to be exclusive | Labels at dating | Target's attraction, loyalty, monogamy | Labels update separately (below) | Hurt: −10 mood |
| Break up | Low affection or a betrayal | — | Ex labels; the dumped one −20 mood | — |

**Labels without AI.** Each character holds their own label. When exclusivity is asked and accepted, a deceptive, low-monogamy character records "fling" privately with odds of (10 − honesty) × (10 − monogamy) ÷ 100. When A sees or hears of B with C, A's label decides betrayal (affection −40, a long bad thought, a likely confrontation) or mild jealousy.

**How the build does it (proposed; all numbers in `data/social.yaml`).**

- **Rounds.** Every 10 minutes, each contestant who is awake, has arrived and isn't walking, asleep, on the toilet, showering or fighting rolls the chance above once (social urgency here is ((100 − social) ÷ 100)², 0 to 1). The partner is a weighted pick among the others in the room, favoring those they like or fancy. Interactions are instant; both sides gain the social amount (chitchat 8, deep talk 12, others 4).
- **Scaling.** "Scaled by" in the table is a multiplier per factor, each kept between 0.1 and 5: an axis is 1 + k × (axis − 5) ÷ 5; affection is 1 + k × affection ÷ 100 (k −2 for slights and insults, so dislike doubles them at −50); attraction is attraction ÷ 5; chemistry is 1 + 5 × chemistry; privacy is 1 + the room's apparent privacy. Flirts need attraction 4+. Gifts wait for inventory and gossip for rumors.
- **The ledger** holds affection (−100 to 100), trust and fear (0 to 100) and attraction (0 to 10) per direction, plus the last 12 dated reasons (repeats merge, "chitchat ×14"). Deep talk adds trust +3, an insult adds fear +3, losing a fight fear +10. Once a day at the wake chime affection fades 10% toward zero (× 1 − 0.5 × (loyal − 5) ÷ 5, so loyal people hold on; × 0.5 again toward someone they believe they're dating or exclusive with), trust 2% and fear 10%.
- **Attraction** is the formula above with beauty and fit on 0–1 and the result × 16 (tuned up from × 10, which left mutual attraction 6+ too rare for lovin'), capped at 10. Fit is 1 − the mean gap between ideal and personality ÷ 5. Perceived fit is (1 − knows) × beauty + knows × the fit they show, where a deceptive person shows fit + (1 − fit) × 0.5 × (10 − honest) ÷ 10. Knows grows 0.02 per chitchat and 0.25 per deep talk. Chemistry is a per-pair roll with a 0.15 spread. On meeting, attraction starts at 0.6 × its target, and every interaction moves it 10% of the rest of the way.
- **Flirts** land with the target's attraction back ÷ 10. Success: both affection +5 and attraction +0.5. A rebuff gives the flirter "rebuffed" (−8) and the target "awkward" (−3, 12 hours). Kisses, lovin' and labels come with romance.
- **Fights** start from insults: the insulted one swings. Power is strength + stamina × 0.5 + a d6; the loser takes 10–30 (a 5% serious injury adds 20) but never drops below 10 health from a fight; health recovers 2 an hour. Both stop for 3 minutes. Then the coin flip, ±20 affection both ways, "won a fight" +3 and "lost a fight" −8. The event records the witnesses and whether it was outside the cage, for the show milestone to sentence.
- **Company** pulls on action scoring: per person in the room, + 0.3 × affection ÷ 100 + 0.3 × attraction ÷ 10 − 0.3 × fear ÷ 100 (not for sleeping or the toilet).
- **Thermostat** changes give everyone they made less comfortable affection −3 toward the changer.

**Romance, as built (proposed; outcomes in `data/romance.yaml`, the moves' weights and gates in `data/social.yaml`).**

- **The moves are interactions** with a `move`: flirt, kiss (weight 0.03, tuned from 0.02; attraction 6+ and a landed flirt between them before), proposition (0.12, tuned from 0.03 to 0.2 and back down once bedtime lovin' took over; attraction and affection 20+, at least one landed kiss between them, only in a room of apparent privacy 0.5 or more or in their own bedroom), spend the night (2, attraction 6+, from two hours before lights dim through the night, with a bed for two to go to; see Bedtime), ask to be exclusive (0.05, tuned from 0.02; the asker's label at dating) and break up (0.05, a label of flirting or beyond and either affection at 0 or below or a "betrayed" thought about them). Drunkenness multiplies them (Booze). Toward anyone but whoever they're dating or exclusive with, romance moves are × 1 − 0.8 × loyal ÷ 10.
- **Kiss** odds are the target's attraction ÷ 10 × (1 + their affection ÷ 100). A kiss gives both "kissed" (+6, a day) and moves a label of none to flirting; from the second landed kiss between them, someone flirting with monogamy 4 or more (5 until Oct 23) thinks they're dating (a showmance). A rebuff gives the kisser "kiss rebuffed" (−12).
- **Proposition:** the target says yes with odds of their attraction ÷ 10, only if they're at attraction 6+ and affection 20+ themselves, × the attached factor above if they're seeing someone. On a yes they head for a bed (D-105): whichever of their two beds scores best on privacy − 0.05 × walk minutes − 0.3 × anyone else there, and the visitor is let in as a guest. Sometimes they don't bother: right here, with odds 10% × both partners' boldness, where boldness is (1 − (modesty − 5) ÷ 5) × (1 + 0.5 × (brave − 5) ÷ 5), × 2 drunk and × 3 hammered, so a fully modest partner never does. With no bed to go to the base is 50%, and a no is a rain check. Lovin' starts once both are there and lasts 5–30 minutes; if either is called away first, it's off for both. Lumps under the covers: "lovin'" +10 for a day, affection +10 both ways, and anyone asleep in the room gets "kept up by the roommates" (−3). Outside a bedroom, everyone awake who sees it also gets "saw them going at it in public" (−4 × modesty ÷ 5, so nothing for the shameless and −8 for the most modest). It moves a label of none, flirting or ex to dating for someone with monogamy 4 or more (5 until Oct 23), otherwise to fling, so expectations can mismatch without anyone lying. Each earlier lovin' with the same person counts as 1.5 more monogamy, and a fling that clears the bar that way becomes dating too, so a fling that keeps happening turns into a relationship. A no gives "turned down" (−10).
- **Bedtime** (john, Oct 21: couples share beds and hook up mostly in bed at night). *Spend the night?* is answered with the bed-share odds (Beds and sleep); on a yes both head for the bed lovin' would pick and go to sleep there. Whenever someone gets into a bed at night with someone already settled in it, if they're at the proposition's bars toward them (attraction 6+, affection 20+) they ask with odds 0.9 (× 0.5 if the other has been in bed 20 minutes and dropped off; × drunkenness as for a proposition), and the other answers as to a proposition. Waking after a night with someone still in the bed, the same with odds 0.5. A pair who have never kissed get a goodnight kiss attempt instead of the ask (the kiss's own odds), so romance starts with a kiss however it comes about (proposed, Oct 23: half of first hookups had come before any kiss). A yes is lovin' right there; at night they sleep in that bed afterwards, and that sleep remembers it, so it doesn't happen twice in a night. A no is "turned down" as usual.
- **Not during the ceremony.** Nobody propositions or invites anyone to bed while either of them is at the ceremony, the daily event or a trial (proposed, Oct 23: every skipped-ceremony fine was a pair who'd gone to bed together ten minutes into the ceremony, and they slept through the roll call).
- **Exclusivity** odds are the target's attraction ÷ 10 × (0.5 + monogamy ÷ 10) × (1 + 0.5 × (loyal − 5) ÷ 5). A yes makes the asker's label exclusive; the target's too, unless the deceptive-fling roll in the table above comes up, in which case they privately record a fling. A no gives "won't commit" (−10).
- **Break up:** both labels go to ex; the dumped one gets "dumped" (−20, three days).
- **Evidence:** everyone awake in the room sees a kiss or lovin', and a knocker who finds someone else in the host's room sees that. If A's label for B is exclusive, it's a betrayal: affection −40, "betrayed" (−20 for a week, loyal people feel it more), 10 points each to A, B and the third party, and a 50% chance A confronts B on the spot with an insult. A label of flirting, fling, dating or ex makes it jealousy instead, but only if A still cares (affection 15+ and attraction 5+ toward B), and not again for the same rival within 12 hours. Jealousy costs B affection −5. Either way A turns on the rival, C: "jealous of C" (−6 for two days, a person grievance, so A's breaks aim at C) and affection toward C −20 × (1 − 0.5 × (kind − 5) ÷ 5), from −30 for the cruelest to −10 for the kindest. A jealous A also pines: "wants B back" (−3, rejection, two days), and while it lasts who A seeks out and every romance move toward B are × 1 + 2 × (1 + (monogamy − 5) ÷ 5), so × 5 for monogamy 10 and × 1 for monogamy 0: the monogamous fight to win them back, the rest mostly resent (proposed, Oct 23; john: both). Whoever kisses or beds someone while believing they're exclusive with someone else gets "cheating on them" (−5).
- **Company pull** for anyone they fancy past the proposition bar is × 1 + 2 × the room's privacy, so crushes drift toward believed-private spots.

## Thoughts, mood and breaks

Mood starts at 50 and adds every active thought. Each thought has a value, a duration, a stacking limit, and a source category used to pick breaks. Personality scales the values.

| Thought (sample) | Value | Lasts | Source |
| --- | --- | --- | --- |
| Trapped here (everyone, always) | −5, easing to −2 over the first week (fear tuning) | Permanent | Fear |
| Someone died (per death) | −6 − 0.1 × affection; friend −12; disliked +3; rival +6 | 3 days, friend 7, disliked 2 | Fear, grief or person X |
| Watched an execution | −8 | 2 days | Fear |
| The show is going to kill me (own meter under 30) | −4 to −15 | While low | Fear |
| Slept on the couch / in the dorm / in the suite | −6 / −2 / +6 | 1 day | Discomfort |
| Ate gourmet / plain / leftovers | +6 / 0 / −4 | 1 day | Hunger |
| Cold shower / sink bath / couldn't wash | −4 / −4 / −6 | 1 day | Discomfort |
| Too cold / too hot | −1 per 2°F outside range, up to −8 | While outside | Discomfort |
| Turned away at the door by X | −5 | 1 day | Rejection |
| Rank went up / down | +5 / −8 | 1 day (tuned from 2) | Status |
| Insulted by X | −6 | 2 days | Person X |
| Rebuffed by X | −8 | 2 days | Rejection |
| Betrayed by X | −20 | 7 days | Person X |
| Lovin' with X | +10 | 1 day | Romance |
| Sentenced in public | −10 | 1 day (tuned from 2) | Humiliation |
| Fishbowl night | −12 (aquatic −4) | 1 day | Humiliation |

**Break lines** come from calmness: minor = 30 + 1.5 × (10 − calm); major = minor × 4/7; extreme = minor ÷ 7. Below each line, an hourly chance: 4% minor, 10% major, 20% extreme. Every break ends with catharsis, +15 for a day.

**The biggest grievance picks the break.**

| Source | Minor | Major | Extreme |
| --- | --- | --- | --- |
| Hunger, envy | Binge | Steal food or treats | — |
| Discomfort | Sulk in bed | Tantrum: damage the set | — |
| Status, humiliation | Cry in the confessional | Drink binge | Attack whoever outranks them most |
| Rejection | Hide | Drink binge | Attack the rejecter |
| A specific person | Insulting spree at them | Wreck their things | Attack them |
| Fear, grief | Hide | Panic | Lash out at the feared person |

**Crimes of passion.** An extreme attack turns violent only if kindness is 4 or under or calm is 4 or under (tuned Oct 23 from 3 and 2); otherwise it collapses (by grievance, below). The attack is a fight in which the attacker gets the first blow. The chance it kills: 60% + 5% × strength advantage (the 60% base is a proposal, Oct 23), ×4 with a knife from the cafe, ×3 at the hot tub. One mystery at a time (D-050): while a body lies unfound or a trial is pending, an attack can hurt but not kill. A kill is a murder, scored like any other.

**How the build does it (proposed; numbers in `data/thoughts.yaml` and `data/breaks.yaml`).**

- **Thoughts** carry a value, hours, a stacking limit and a source. Personality scales them: volatility as before, a per-thought `scale` (vain for the couch, the suite, clothes and fancy booze; kind for watching cruelty; loyal for betrayal; playful for boredom) and a per-source one (fear × 1 − 0.5 × (brave − 5) ÷ 5; status and humiliation × vanity; grief × loyalty and × kindness at 0.3; rejection, loneliness included, × outgoing; guilt × honesty and × kindness). **The misery cap:** each source's bad thoughts add up to at most −20 (`sourceCap`; per-source caps in `caps` can replace it, none set yet), so a week of executions, sentences and doom can't pin someone at zero by itself; good thoughts aren't capped, and the grievance that picks a break still reads the uncapped totals. A thought that works out to zero (an aquatic's cold shower) isn't added.
- **Where they come from:** "trapped here" from arrival, forever: −5 on arrival, easing to −2 by the end of their first week (fear tuning, D-110). Low needs, refreshed every ten minutes while under the line: hungry (hunger under 20, −4), exhausted (rest under 15, −6), couldn't wash (hygiene under 20, −6), lonely (social under 20, −4), bored (fun under 20, −4). Well-met needs lift it the same way (tuning): good company (social over 80, +6), having a good time (fun over 80, +6, × playful) and comfortable (comfort over 70, +3); without them almost nothing good reached mood.  Too cold or too hot, −0.5 per °F felt outside the range up to −8. Sleep leaves its thought on waking if it lasted three hours. Meals leave gourmet +6 or leftovers −4 (plain nothing). A cold shower and a sink bath leave theirs when finished. Clothes leave "dressed like a star" (+3, rank 1) or "dressed like nobody" (−3, rank 7) from one ceremony to the next. Witnesses of an insult, a mocking or a fight get "watched them be cruel" (−2, × kindness).
- **Break checks** run on the hour for anyone awake and not asleep, fighting, in lovin' or on the toilet. They roll the chance of the deepest line their mood is under. The biggest grievance is the source whose bad thoughts add up to the most, among the sources in the table (guilt, romance and booze never pick a break); for a break aimed at someone, the target is whoever those thoughts are most about.
- **The breaks:** binge (the cafe, 30 minutes, hunger +40), steal food (the cafe, hunger +50, theft), sulk in bed (two hours), tantrum (where they are, damaging the set), cry in the confessional (30 minutes), drink binge (the best bar they can enter, four drinks in an hour), hide (a restroom stall, an hour), panic (30 minutes), insulting spree (follows the target, an insult every 10 minutes for an hour), wreck their things (the target's bedroom, damage; the target gets "wrecked my things" −8 and affection −15), and the attacks. "Attack whoever outranks them most" goes for rank 1; "lash out at the feared person" goes for whoever they fear most (fear 10+). An attacker chases a target who moved on up to three times. Anything with no possible target, or that would need to leave the fishbowl, becomes an hour of moping instead. Broken contestants skip meals and are excused from the ceremony.
- **Catharsis** comes when the break ends, however it ends: +25 for a day and a half (tuned Oct 23 from +15 for a day; john: catharsis, not a cooldown, is what keeps someone from breaking again straight away).
- **Breaks that reach people** (proposed, Oct 23): minor fear, grief and rejection pour it out to their best friend (affection 30+): a deep talk, and the latest thing they know about someone else spills (gossip, below); with no friend to find, they hide. Minor discomfort rants at the room, a slight at someone every 10 minutes.
- **Heartbreak** (proposed, Oct 23): betrayal and jealousy are their own grievance. Its minor break is a scene, yelling and crying at whoever the worst of it is about (the cheating partner or the rival); its major break a half-hour blowup with insults every 6 minutes; both air what that person did to everyone in the room, which counts as evidence. Its extreme break is an attack.
- **Collapse by grievance** (proposed, Oct 23): an extreme attack by someone who isn't violent collapses by its grievance: rage at a person becomes an insulting spree at them, rejection, humiliation and status a bender, and only fear and grief freeze someone catatonic. An attack with nobody to attack smashes the set (a tantrum), and terror with nobody to lash out at is a panic, instead of an hour of moping.
- **The attack** adds +3 to the attacker's fight roll. Only an attacker who wins can kill. The victim isn't charged with fighting. A murder pays the killer 40 to the meter only and 100 hidden lifetime points, revealed when they die; witnesses fear the killer +30 and get "saw them kill someone" (−12). The body, its discovery and the trial come with trials.

## Personality, traits and mood: the next pass

*Decided direction (john, Oct 22: D-108 to D-113). Step 1 (named traits and the "trapped here" easing) is built, with the lower fear cap held back (john, Oct 22). Step 2 (the ratings pull, personal boredom, the surprise bonus and deep talk) is built. Step 3 is built: people as mood, grudges, friction, envy, mood both ways, joys and pains, and the murder nudge. Every number below is a proposal set in data and tuned.*

**Why.** A review on Oct 22 (160 seeds × 30 days, 2,791 contestants, main after the dread tuning) found:

- **Outgoing is the only strong trait.** It moved 26 of 31 measured behaviours: reserved contestants started 5 interactions a day and outgoing ones 28, earned 35 vs 52 points a day, and stayed 7 vs 17 days. Vain moved 8, playful 6, kind and calm 4, brave 2, honest and monogamy 1, loyal and modesty none.
- **Mood barely depends on who you are.** No trait moved average mood more than 4 points (playful, 36 vs 40). Fear took about 16 points off everyone alike.
- **Relationships barely move mood.** No friends: mood 40; four or more: 43. A couple: 1 to 3 points.
- **Hate is rare.** 27% of directed feelings were +30 or more; 2% were −30 or worse.
- **Nobody plays the game.** A falling meter adds "the show is going to kill me" and changes no choice.
- **Dead hooks.** No action is tagged risky, so bravery's pull never applies; no thought feeds the envy grievance, so envy breaks never happen. (Both fixed in step 3.)

**The rule for all of it: no buckets.** Nobody is assigned an archetype or a game plan. Every choice stays a blend of all eight sliders, the tastes and the traits, picked with noise, so a very kind, moderately deceptive contestant is mostly kind and schemes now and then. Joys and pains also come from the whole blend, not one per trait.

### Named traits (replacing quirks)

Each contestant rolls one to three named traits (proposal: 50% one, 35% two, 15% three) from a list of about 30, RimWorld-style: each is one strong, readable rule a viewer can see on the sheet and the AI can play later. Some come in opposites that can't roll together. Sliders tilt the odds without deciding them: a trait's roll weight is × 1 + k × (axis − 5) ÷ 5 for the slider it leans on (Hothead leans on volatility, Charmer on outgoing). The five quirks become traits on the list with their current hooks. Traits live in data (`data/traits.yaml`), each as a row of effects on existing systems: multipliers on tags, thoughts, sources, drains and odds, plus a few special hooks.

A starting list (proposal; john to edit):

| Group | Trait | Its rule |
| --- | --- | --- |
| Temper | Hothead | Slights can start fights too; fight chance × 2 |
| Temper | Peacemaker | Steps in to break up fights in the room; insults near them rarer |
| Temper | Drama queen | Break lines 10 higher; breaks score × 1.5 |
| Temper | Ice cold | Death and grief thoughts × 0.3; never comforts anyone |
| Temper | Worrier | Fear × 1.5; worry about friends × 2 |
| Temper | Sunny / Gloomy | A permanent +4 / −4 |
| Social | Charmer | Affection from interactions they start × 1.5 |
| Social | Abrasive | Slights × 2; people sharing a room with them slowly like them less |
| Social | Grudge-holder / Forgiving | Dislike never fades / fades twice as fast |
| Social | Clingy | "Missing them" × 2; strong pull toward a partner's room |
| Social | Loner | Social drains at half; a crowd of four or more is a small bad thought |
| Social | Gossip | Passes rumors twice as often (hook arrives with rumors) |
| Show | Show-off | Performing scores × 1.5 for them; "everyone was watching" joy |
| Show | Stage fright | Avoids karaoke and dance-offs unless desperate; when they do perform it's a big surprise (below) |
| Show | Survivor | Doom thought × 0.5; ratings pull × 1.5 |
| Romance | Romantic | Attraction grows faster; reads every second kiss as dating |
| Romance | Heartbreaker | Romance moves while attached × 2; no guilt |
| Romance | Jealous | Jealousy and betrayal × 2; always confronts |
| Romance | Prude / Exhibitionist | Modesty acts as 10 / 0; the exhibitionist enjoys being seen |
| Appetite | Party animal / Teetotaler | Drink pull × 2 with company and half hangovers / never drinks, mildly dislikes drunks |
| Appetite | Lightweight | Intoxication per drink × 1.5 |
| Appetite | Glutton | Hunger drains × 1.3; gourmet × 2, leftovers × 2 |
| Appetite | Neat freak / Slob | Hygiene thoughts × 2 and dislikes slobs in the room / × 0.3 |
| Body | Snores, Hums, Hoards, Night owl | As the quirks today |
| Body | Early bird | The night owl's opposite: up 90 minutes before the chime |
| Body | Sleepwalks | Wanders to another room once some nights (finally a hook) |

**How the build does it (step 1, built; numbers in `data/traits.yaml`, all proposals).**

- **Rolling.** One, two or three traits at 50 / 35 / 15. Each pick weighs every trait by its weight × 1 + 0.8 × (value − 5) ÷ 5 for what it leans on (a slider, or modesty, drinking or monogamy; a negative lean for the opposite end), never below 0, skipping anything excluded by a trait already rolled. So a fully volatile contestant rolls Hothead about nine times as often as a fully calm one, and a calm Hothead can still happen. Gossip has weight 0 until rumors exist. Night owl and Early bird weigh half (the occasional one).
- **Opposites** that can't roll together: Hothead / Peacemaker, Sunny / Gloomy, Charmer / Abrasive, Grudge-holder / Forgiving, Clingy / Loner, Show-off / Stage fright, Romantic / Heartbreaker, Prude / Exhibitionist, Party animal / Teetotaler, Teetotaler / Lightweight, Neat freak / Slob, Ice cold / Worrier, Night owl / Early bird.
- **Effects are data.** Each trait is a row of effects on systems that already exist; a contestant's rows are merged (multipliers multiply, offsets add). The kinds: action tags, the interactions they start, interactions anyone starts near them, thoughts, thought sources, need drain, what an event pays them, a thought carried from arrival, the break line, fight odds and what can start a fight, the affection their interactions give, an aura on whoever shares the room, how fast dislike fades, the pull of a partner, a crowd thought, an audience thought, attraction speed, kisses to dating, the attached factor, confronting, modesty, a thought when seen exposed, drink pull, hangovers, intoxication, carrying drinks, disliking drunks or the filthy, noise, a night shift, sleepwalking and breaking up fights.
- **The rows as built:**
  - Hothead: fight chance × 2 when insulted, and a slight can start a fight at the insult's odds.
  - Peacemaker: in the room when an insult's fight is about to start, a 50% chance they step in ("broke_up_fight", no fight); insults and slights by anyone in the room with them × 0.5. Cage matches and attacks aren't stopped.
  - Drama queen: the minor break line 10 higher (major and extreme follow from it); breaks pay × 1.5.
  - Ice cold: grief × 0.3, and "someone died", "watched an execution", "saw them kill" and "found the body" × 0.3; never starts kind words, a gift or passing food.
  - Worrier: fear × 1.5. Sunny / Gloomy: a permanent +4 / −4 ("sunny / gloomy disposition", scaled by volatility like any thought).
  - Charmer: positive affection from interactions they start × 1.5. Abrasive: slights × 2; everyone awake in the room with them loses 0.1 affection for them every social round (10 minutes), about a point every 100 minutes, fading like any affection.
  - Grudge-holder: negative affection never fades. Forgiving: it fades twice as fast.
  - Clingy: the company pull of someone they're dating or exclusive with × 3. Loner: social drains at half; "too many people" (−2) while four or more others share the room.
  - Show-off: karaoke and the dance-off pay × 1.5, and "everyone was watching" (+4, 3 hours) after either with an audience. Stage fright: performing actions score × 0.2, easing to × 3 as their meter falls to zero (step 2; at meter 25 it's about × 0.9), and their performance is close to the biggest surprise there is. Survivor: the doom thought × 0.5, and the ratings pull × 1.5 (step 2).
  - Romantic: attraction moves toward its target twice as fast; the second landed kiss means dating, whatever their monogamy. Heartbreaker: the attached factor × 2 (never above 1); no guilt. Jealous: jealousy and betrayal thoughts × 2, and they confront (an insult to the face) every time, over jealousy too.
  - Prude / Exhibitionist: modesty set to 10 / 0 at the roll; an exhibitionist seen in the shower gets "enjoyed the attention" (+3).
  - Party animal: the company pull to drink × 2, hangover weight × 0.5. Teetotaler: drinks score 0, a bender becomes moping, and −0.2 affection a social round toward anyone drunk in the room. Lightweight: intoxication per drink × 1.5. Glutton: hunger drains × 1.3, gourmet and leftovers thoughts × 2. Neat freak: "couldn't wash" × 2, and −0.2 affection a social round toward anyone in the room with hygiene under 20. Slob: "couldn't wash" × 0.3.
  - Snores, Hums, Hoards (carrying a drink × 3) and Night owl as before; Early bird and Sleepwalks as in Beds and sleep.
- **Step 3 hooks:** Worrier's worry about friends × 2 and Clingy's "missing them" × 2 (thought multipliers in their rows). **Waiting:** Gossip (rumors).
- **The sheet and the log.** Traits show on the debug view's sheet with their rules and are in the "arrive" event. The harness reports each trait's share of arrivals, mood at night and contestant-weeks aboard per death.

### The ratings pull

As a contestant's meter falls, anything that scores gets an extra pull when they choose actions and interactions: pull = R × desperation × the act's usual points ÷ 10 × their taste for it. Desperation runs from 0 at meter 50 to 1 at 0 (squared, so it bites late). Taste is the multiplier their sliders and traits already give that act's tags or interaction (the kind like kind words, the cruel like slights). Because it's added to every scoring option and the pick stays noisy among the best few, each person's mix shifts toward what suits them without locking in.

**Their act gets old.** On top of the station-wide boredom in scoring, each contestant's own repeats of an event type within a day score × 0.7 each time, so a karaoke regular drifts to a flirt or a fight. The performance itself gets old too: choosing a performance (an action that logs a scoring event, today karaoke) scores × 0.6 for each time they've already done it that day (proposed, Oct 23: one singer had done a quarter of a season's karaoke).

### Surprise pays, and the quiet get a way in

**Surprise bonus:** an act scores × 1 + S × max(0, 1 − taste), where taste is the same multiplier as above (0.5 to 1.5 from the sliders, more with traits). A reserved contestant's karaoke, a sweetheart's insult or a loyal partner's cheating scores up to about × 1.5 (S = 1 proposed). This is the main route for reserved characters to be surprisingly interesting.

Also: deep talk scores more (proposal 2 → 4 each), and reserved contestants' interaction choice depends less on outgoing (outgoing sets how often they start one, but no longer squeezes out the types the other sliders favour).

**How the build does it (step 2, built; numbers in `data/scoring.yaml` and `data/traits.yaml`, all proposals; the code is `src/core/ratings.ts`).**

- **Desperation** = max(0, 1 − meter ÷ 50)², so 0 at 50 or above, 0.25 at 25 and 1 at zero.
- **Points** are what the act would pay them right now as its starter: the actor's share in the scoring table (each + actor), after the judge's boredom today, their own repeats today and their trait multipliers. A proposition pays nothing of its own and isn't pulled (pointing it at lovin' would have desperate singles hooking up for the cameras, against the couple targets; it can be switched on in data).
- **Actions:** only actions that log a scoring event are pulled; today that's karaoke. The pull, 10 × desperation × points ÷ 10 × taste, is added after the personality and mood multipliers, so taste counts once. At zero a middling contestant's karaoke gets +3.
- **Interactions:** the pick among interaction types is a weighted draw, not a score, so the pull multiplies the type's weight by 1 + 5 × desperation × points ÷ 10 × taste. At zero, a middling contestant's insult is × 3, deep talk × 3, a flirt × 3, kind words × 1.5, chitchat unchanged. Breakups are never pulled (nobody dumps someone for the cameras).
- **Starting interactions:** desperation also makes them start more: the chance × 1 + desperation, and **desperation overcomes shyness**: outgoing counts as outgoing + (10 − outgoing) × 0.5 × desperation, so at zero a reserved 2 starts interactions like a 6. This is what actually gave the reserved a way back (see the numbers below); the surprise bonus alone barely moved them.
- **Taste** is the multiplier their sliders and traits already give the act: for an action, the personality grid for its tags with trait tag multipliers; for an interaction, its slider scale factors (each kept within 0.1 to 5) and trait interaction multipliers, not the relationship, and for a romance move while attached to someone else, the attached factor (a loyal partner's flirt is out of character).
- **Reserved interaction choice** already didn't depend on outgoing: outgoing only sets how often they start one, and no interaction type scales by it. Nothing to change.
- **Their act gets old:** each time a contestant has already scored an event type today as an actor (not as a witness), it pays × 0.7 more, on top of the judge's boredom, resetting at midnight. The pull sees it too, so a karaoke regular's pull fades over the day.
- **Surprise:** the first actor's award × 1 + 1 × max(0, 1 − taste), logged on the event as `surprise`. A rebuffed flirt counts as a flirt. A saint's insult (kind 10) pays × 1.9; a reserved, plain contestant's karaoke about × 1.3; a Stage fright contestant's about × 1.9.
- **The harness** now shows stay and mood by outgoing band (0–3, 4–6, 7–10) in the trait table, and surprise bonuses a week by act with their share of all points.

**Step 2 numbers** (200 seeds × 30 days, before → after, all 11 targets hit both times): deaths 2.39 → 2.41 a week, average stay 2.79 → 2.77 weeks. Contestant-weeks per death: reserved (outgoing 0–3) 1.37 → 1.58, middling 2.78 → 2.79, outgoing (7–10) 6.96 → 5.26, so the outgoing advantage went from about 5× to 3.3×. Stage fright 1.72 → 1.84, now a little better than other reserved contestants but still well under average; Survivor 3.0 → 3.3. Points per contestant-day 29.9 → 33.7. A week, station-wide: karaoke 97 → 128, deep talk 60 → 75, insults 6.9 → 9.7, slights 8.0 → 10.3, kind words 12.9 → 16.0, flirts 7.6 → 10.0, kisses 6.2 → 8.4, fights 3.4 → 3.9, breaks 17 → 21. Surprise bonuses fire about 64 times a week (36 of them karaoke) and add 2.5% of all points.

What it cost: with everyone earning more, the drain went 0.9 → 1.15 an hour to keep deaths in range, and because the desperate claw their way back up, the meter sits lower on average (58 → 47.5 at night). More time under the doom line means more fear (−10.9 → −11.2), more breaks (2.4 → 3.0 a day) and average mood 41 → 38. Lower moods and more outgoing deaths thinned couples, so hookups within a couple fell to 0.48; a fling now reads as dating sooner (each earlier lovin' counts as 3.5 monogamy, was 1.5), bringing it back to 0.53.

### Fear tuned down

- "Trapped here" eases from −5 to −2 over a contestant's first seven days aboard (built: refreshed hourly, `thoughts.yaml` trapped).
- The fear cap drops from −20 to about −12. *Held back for now (john, Oct 22): fear keeps −20 until the later steps. The build supports per-source caps (`thoughts.yaml` caps), left empty.*
- Tuned against the 11 targets with harness numbers before and after. As built (traits and the easing, fear cap still −20), average fear at night went from about −12.8 to −10.9 and average mood from 38 to 41. Less fear means fewer breaks (2.9 a day to 2.4) and fewer break points, so the meter drain went from 0.95 to 0.9 an hour; deaths are 2.39 a week and the average stay 2.79 weeks, both mid-range.

### People as mood, grudges and friction

- **Company:** "with a friend" or "with my partner" (+) while sharing a room with someone at +30 or more; "stuck with someone I can't stand" (−) at −30 or worse.
- **Worry and missing:** "my friend is on the chopping block" while a friend's meter is under the doom line; "missing them" when a partner has been out of sight for a day.
- **Envy:** "they've got it better" toward a disliked contestant ranked above you, feeding the envy grievance (binge, steal food).
- **Grudges stick:** dislike fades at half the rate of liking, slower still for the volatile and the loyal (and never for Grudge-holders).
- **Friction:** contestants who share a room drift apart a little when their personalities clash (opposite ends of honest, calm, kind and playful) and together when they match.
- **Mood changes behaviour both ways:** today only a mood under 40 changes choices. A good mood also makes kind acts and gifts likelier; a bad one makes slights likelier.
- **Joys and pains from the blend:** helped someone (kind, loyal), a thrill after something risky (brave), being watched while performing (vain, Show-off), guilt after sneaking or stealing (honest), seeing someone break down (kind). Risky gets tagged on the still, the hot tub after hours and sneaking above rank.
- **Target:** rivals in about 5 to 10% of directed pairs (2% today), so gloating, insult sprees, wrecked rooms and attacks on someone in particular actually happen.

**How the build does it (step 3, people as mood; numbers in `data/social.yaml` people and ledger, `data/thoughts.yaml` and `data/personality.yaml` mood, all proposals; the code is `src/core/people.ts`).**

- **Company,** every ten minutes while awake: the best-liked person in the room at +30 or more gives "hanging out with them" (+6, × outgoing); someone they believe they're dating or exclusive with gives "with them" (+6, × loyal) instead; the most disliked person in the room at −30 or worse gives "stuck with them" (−6, more for the volatile, source person). One of each at most, about that person, gone when they part or fall asleep. Because "stuck with" is about someone, a person-source break (an insult spree, wrecking their things, an attack) goes for them.
- **Worry,** hourly while awake: "they're on the chopping block" (−2, × loyal, source grief) about the lowest-metered friend (+30) under the doom line (meter 30). Worrier × 2.
- **Missing them,** hourly while awake: a partner (dating or exclusive) they haven't shared a room with for 24 hours, "missing them" (−4, × loyal, source rejection). Clingy × 2. Each relation now remembers when they last shared a room.
- **Envy,** hourly while awake: "they've got it better" (−3, × vain, source envy) about the most disliked contestant (−15 or worse) ranked above them. Envy picks the binge and food-theft breaks when it's the biggest grievance.
- **Grudges stick:** dislike fades at half the rate of liking, × 1 + 0.5 × (calm − 5) ÷ 5, so the fully volatile hold it twice as long again and the fully calm let it go half again as fast; loyalty slows all fading as before, and the traits still apply on top.
- **Friction,** every social round: two awake people in the same room each move 0.09 × (2.5 − d) affection toward the other, where d is how far apart they are on honest, calm, kind and playful, on average. Casting spreads people out, so a typical pair is about 2.8 apart and drifts apart very slightly (about 0.15 an hour together); the closest tenth (1.5 or less) warm by about 0.5 an hour and the furthest tenth (4 or more) cool by about 0.8; opposite ends (d = 10) would lose about 4 an hour. The ledger keeps one running "clash" or "click" reason rather than one per round.
- **Mood both ways:** under mood 40, slights, insults and mocking through the glass × 1.5 (as well as the old action multipliers); over 60, kind words, gifts and passing food × 1.5.
- **Deaths are logged** with how the station took it ("mourned": grief, gloat, relief, shaken).
- **The harness** samples every awake hour: what each people thought is worth on average, mood by friends aboard, mood while awake, and reactions to deaths a week.

**Step 3 numbers** (200 seeds × 30 days, before → after, all 11 targets hit both times; no meter change needed): rivals 2.6% → 7.7% of directed pairs, friends 30.9% → 27.5%, average affection 22 → 15. Gloats at a death 0.2 → 0.7 a week, "can't say I'll miss them" 0.3 → 0.8, grief 4.4 → 3.8. On an average awake hour a contestant carries +3.0 from a friend in the room, +1.0 from a partner, −1.0 from someone they can't stand, −0.9 envy, −0.7 worry, and almost nothing from missing someone (partners are rarely apart a whole day). Mood while awake 38.6 → 40.6; at night (mostly asleep, so no company) 38 → 37. Mood by friends aboard (0 / 1 / 2–3 / 4+) went from 41 / 37 / 37 / 41, flat, to 40 / 39 / 41 / 45. A week: slights 10.3 → 13.9, insults 9.7 → 11.5, kind words 16.0 → 16.5, breaks 20.7 → 19.2 (2.96 → 2.74 a day), fights 3.9 either way. Deaths 2.41 → 2.37 a week, stay 2.77 → 2.81 weeks, hookups 2.76 → 2.77, hookups within a couple 0.53 → 0.58, nights with a couple 0.57 → 0.54. Envy was never the biggest grievance (fear and person thoughts outweighed it), so envy breaks didn't happen; fixed with joys and pains below.

**How the build does it (step 3, joys and pains; numbers in `data/thoughts.yaml` moments and thoughts, `data/breaks.yaml` weights and `data/objects.yaml`, all proposals).**

- **From the blend, not per trait.** Each moment leaves one thought, and the thought's scale reads the sliders with k = 1, so the bottom of the slider feels nothing and the top about double. Traits touch them only through the usual thought and source multipliers.
- **Helped them** (+3, 12 hours, × kind and × loyal at half strength): whoever gives kind words, a gift or food through the glass.
- **What a rush** (+4, 6 hours, × brave): finishing something tagged risky, or sneaking into a room above their rank (on the infraction, so once per room between ceremonies). Risky is tagged on the still and, through a new `nightTags` on actions, on the hot tub during the contestant's night; the personality grid already pulls the brave toward risky.
- **All eyes on me** (+3, 3 hours, × vain): after karaoke or a dance-off that paid them, with an audience (karaoke always counts as watched). A Show-off's "everyone was watching" still comes on top.
- **Guilty conscience** (−3, 24 hours, × honest, source guilt, which also scales by honest and kind): caught sneaking in or stealing from the cafe.
- **Watched them fall apart** (−2, 12 hours, × kind, about the one breaking): everyone awake in the room when a break starts. Its source, sympathy, picks no break.
- **Envy burns:** when picking the biggest grievance, envy's bad thoughts count × 5 (mood is unchanged). At × 3 envy picked 0.1 breaks a week, at × 5 1.1, at × 8 4.8.
- **The harness** reports each moment's average value per awake hour next to the people thoughts, and how many breaks a week turned violent only because of the murder nudge.

**Joys and pains numbers** (200 seeds × 30 days, before → after, all 11 targets hit both times; no meter change needed): on an average awake hour a contestant carries +1.3 from all eyes on them, +1.1 from helping someone, +1.0 from a rush, −0.9 from a guilty conscience and −1.0 from watching someone fall apart. Mood while awake 40.6 → 41.7; at night 37 either way. Envy breaks 0 → 1.1 a week (binges 0.44, cafe raids 0.64), so theft infractions, and the cold water and lost breakfast everyone pays for them, now happen about 0.6 times a week; fishbowl nights 3.5 → 3.8. Breaks 2.74 → 2.71 a day, deaths 2.37 → 2.30 a week, stay 2.81 → 2.90 weeks, rivals 7.7% → 8.8%, hookups 2.77 → 2.67, hookups within a couple 0.58 → 0.55, kind words 16.5 → 16.8 a week. Rotgut and the hot tub barely moved (the risky pull is the grid's brave × 0.5).

### Murder

Murder stays a crime of passion in slice one (planned murders are out of scope). One nudge: below the doom line, the violent-break cutoffs loosen by one point for that contestant (kind 4 or under, calm 3 or under), so a desperate, cruel or brave contestant is a little likelier to turn a break violent; the existing 40-point meter award does the rest. Killing deliberately for ratings waits for planned murders.

**Tuned Oct 23** (john: a murder about every two weeks). With the old numbers there was one murder every 180 station days: 130 attacks in 24 seasons, 86 won by the attacker, 4 kills, because the kill chance needed the attacker to be stronger and half the winners weren't. Now the cutoffs are kind 4 and calm 4, the kill chance has a 60% base, attacks don't kill while another murder is unresolved, and jealousy aims person breaks at rivals. A 200-seed run has 0.44 murders a week (one every 16 days) and 0.38 trial deaths.

**As built** (`data/breaks.yaml` passion.desperate, proposal): under the meter's doom line (30), both cutoffs rise by 1. Only kind and calm are read, as the rule says; bravery doesn't enter. A break that turned violent only because of it is logged with `desperate`. About 0.12 breaks a week turn violent this way (violent breaks overall 0.78 → 0.80 a week, since fewer breaks reached the extreme this run); murders stay at about 0.04 a week, since most attacks don't kill.

### Build order

One PR per step, each tuned back to all targets before the next:

1. Named traits replacing quirks, and the fear tuning.
2. The ratings pull, personal act boredom, the surprise bonus and the deep-talk change.
3. People as mood, grudges, friction, envy, joys and pains, and the murder nudge. (Built.)

## Booze

| Quality | Rank | Enjoyment per drink | Where |
| --- | --- | --- | --- |
| Fancy | 1 | Mood +6, fun +15, "savored something special" | Lounge bar |
| Good | 2–3 | Mood +4, fun +12 | Lounge bar, rec room |
| Cheap | 4–6 | Mood +2, fun +8 | Lounge bar, rec room |
| Rotgut | 7 | Mood +1, fun +4 | The hidden still |

The enjoyment thought lasts 3 hours and stacks to three drinks. Drinks can be carried and gifted; a better drink given to someone on worse booze is a strong favor (affection +10).

**Intoxication** rises per drink by 25 ÷ species size factor (felines and elfins get drunk faster, horned slower) and falls 8 an hour.

| Stage | Level | Effects |
| --- | --- | --- |
| Tipsy | 25–49 | Social refills faster; interaction chance ×1.5; flirting ×1.5 |
| Drunk | 50–79 | Insults ×3, fights ×2, flirting ×2; calm acts 2 lower; beer goggles; secrets slip in gossip |
| Hammered | 80+ | Fights ×3; calm acts 3 lower; stumbling; puking, passing out; afterward 30% chance of a memory gap (they don't record what they did) |
| Hangover | Next morning | −3 to −10 by amount drunk; cheap and rotgut worst |

**Drinking together** gives both affection +2 per shared drink.

**How the build does it (proposed; numbers in `data/booze.yaml` and `data/objects.yaml`).**

- **Where it pours:** the lounge bar (four at a time, 15 minutes, up to fancy, social with company), the rec room machine (one at a time, up to good) and the hidden still in the garden (20 minutes, rotgut). You get your rank's quality or the place's best, whichever is worse. Rank 7 is locked out of the lounge and rec room, so the still is theirs.
- **Choosing a drink** scores the quality's fun like any other gain, plus the three pulls: 0.15 × drinking ÷ 10, 0.1 × (outgoing + playful) ÷ 20 when anyone else is in the room, and 0.25 × (50 − mood) ÷ 50 when mood is under 50, × 1 − (calm − 5) ÷ 5 (doubled for the fully volatile). The drink's whole score is × 1 − intoxication ÷ 100, so people slow down as they get drunk.
- **A drink** adds intoxication, bladder −15, the enjoyment thought, and a hangover weight (fancy 1, good 1.5, cheap 2.5, rotgut 3.5). At the wake chime, a weight of 3 or more becomes a hangover of that size, between −3 and −10, for 8 hours.
- **Stages** multiply the drinker's interaction chance and social gains by 1.5 from tipsy up; flirts, kisses and propositions × 1.5 tipsy and × 2 drunk or hammered; insults × 3 drunk or hammered; an insult's fight chance × the drunker person's 2 (drunk) or 3 (hammered); calm acts 2 lower drunk and 3 lower hammered (tuned Oct 23 from honesty and kindness 2 lower; john: drink is a volatility thing), wherever calm is read (break lines, violent breaks, fights, how hard thoughts hit); walking takes 1.5× as long when hammered. Drink also makes people agreeable: attraction counts +1 drunk and +2 hammered, and their odds of saying yes to a kiss or a proposition are × 1.2 tipsy, × 1.5 drunk and × 2 hammered, so drunk hookups come out of impulsiveness and agreeableness rather than a rule of their own. Getting hammered is logged once per time ("hammered antics", 4 points). Sobering up past hammered has a 30% chance of a blackout: they lose the ledger reasons from that stretch but keep the feelings.
- **Drinking together:** finishing a drink while others in the room are drinking gives +2 affection toward each of them; they get theirs when they finish.
- **Self-control** (proposed, Oct 23; john: day drinking is fine, but nobody hammered and passed out at noon): the drink's score is × (1 − intoxication ÷ limit), where the limit is 35 + 5 × drinking, plus up to 30 more for the miserable (× (50 − mood) ÷ 50 under mood 50). Most people stop around tipsy; heavy drinkers and the miserable get hammered.
- **Hammered effects** (proposed, Oct 23): every hour while hammered, 25% they throw up (hygiene −40; "threw up in front of everyone" −8 if anyone saw; witnesses get "watched them throw up" −2), else 30% they pass out where they are for one to three hours ("passed out in front of everyone" −6). The ceremony's summons doesn't rouse them, so passing out anywhere but the common room at 21:00 is a skipped ceremony.
- **Gossip and loose lips** (proposed, Oct 23): everyone remembers the last six kisses and hookups they saw, took part in or heard about, for a week. After a chat, a deep talk or a word through the glass, they may spill one to someone who doesn't know it yet, the juiciest first (about someone the listener is involved with): sober 5% × (1 + playful ÷ 10 − honest ÷ 10), tipsy 15%, drunk 40%, hammered 60%. Hearing it counts as seeing it, so it's betrayal or jealousy as usual. Drunken confessions: chatting with the one they're cheating on, they confess it (tipsy 15%, drunk 50%, hammered 80%), which is evidence for the listener and ends the guilt. Scores: spilling 3 (1 to the listener), a confession 10 each, throwing up 4, passing out 3.
- **Carrying and gifts:** after a drink, a 10% chance (× kindness, × 3 for hoarders) of taking one along, up to two. A gift is an interaction (weight 0.03, × kindness and affection) that needs a carried drink: the best one is handed over and downed on the spot, affection +5, or +15 when it's better than the target's own rank pours, "brought me a drink" (+4), and 2 points to the giver.

## The meter and scoring

**The meter** runs 0–100. Newcomers start at 60. It drains 1.2 per hour (tuned from 1, then 0.95 and 0.9, then up to 1.15 for the ratings pull, then 1.4 once sneaking stopped killing people, then 1.2 once murders came every two weeks, Oct 23), day and night. Awards refill it, capped at 100. At zero a contestant is on notice; if they're still at zero at the ceremony, they're spaced, unless they hold an immunity, which is spent instead.

**Lifetime points** collect every award, uncapped, for the leaderboard and hall of fame. Murder awards are hidden until the killer dies.

**Scoring (deterministic, slice one's stand-in for the judge).** Awards go to the meter and lifetime points together.

| Event | Points |
| --- | --- |
| Deep talk | 4 each (was 2; personality step 2) |
| Gift; kind words | 2 giver; 1 |
| Slight; insult | 2 each; 4 instigator, 2 target |
| Fight outside the cage | 12 each, +6 winner |
| Flirt succeeds; rebuffed | 4 each; 3 flirter |
| Kiss | 6 each |
| Lovin', first time with that person; again | 12 each; 3 each |
| Betrayal discovered | 10 to everyone involved |
| Breakup | 8 each |
| Mental break: minor, major, extreme | 5, 10, 15 |
| Hammered antics | 4 |
| Infraction; sentenced | 4; 6 |
| Fishbowl night | 8 |
| Karaoke performance | 3 |
| Dance-off: win, lose | 20, 5 |
| Cage match: win, lose | 25, 10 |
| Trial survived (accuser or accused) | 15 |
| Witnessed a death | 3 |
| Murder | 40 to the meter (visible), 100 hidden lifetime |

**Modifiers.** Witnesses multiply an award by 1 + 0.15 each (up to ×2). The same event between the same pair within three days is worth half each repeat. Each event type loses 10% of its value every time it happens station-wide that day, recovering overnight: the judge's boredom. A contestant's own repeats of a type that day, as an actor, pay × 0.7 more each time, and an act against their type pays a surprise bonus (Personality, traits and mood: the next pass).

**The ceremony, in order:** today's infractions and sentences, meter penalties applied, anyone at zero spaced, ranks assigned, the Wheel spun by the new bottom rank, room moves.

**How the build does it (proposed; numbers in `data/meter.yaml` and `data/scoring.yaml`).**

- **Drain** is continuous, 1/60 a minute. Crossing zero logs "on notice" once.
- **Awards** are scored as events are logged, from a table keyed by event type: each actor, the first actor, the second, the winner or loser, and witnesses. The award lands on the event (its points, and each contestant's share), so the log is the record. A row can pick its amounts by a field of the event (lovin' the first time, a break's level), go to the meter only (murder), and add hidden lifetime points that are revealed when the contestant dies.
- **Witnesses** are everyone awake in the room who isn't taking part. Infractions, sentences, the fishbowl release and deaths skip the witness multiplier, since everyone is always watching the ceremony.
- **Repeats** only count for events between two people: × 0.5 per time that pair scored the same type in the last 3 days, in either order.
- **Boredom** counts each event type station-wide per day and resets at midnight. An event that doesn't score (a fight in the cage) doesn't bore the judge.
- **The dread thought** "the show is going to kill me" is refreshed hourly while the meter is under 30, from −4 just under the line to −15 at zero.
- **The ceremony** also takes a roll call first: anyone not there (asleep included) has skipped it. The ceremony chime wakes sleepers with rest above 40, so only the exhausted sleep through it. Rank changes give "rank went up" (+5) or "down" (−8) thoughts.
- **Spacing** takes everyone at zero at once, decided before anyone goes, so the points for watching one spacing can't save the next person. Everyone at the ceremony gets "witnessed a death" (3 points) and "watched an execution"; everyone gets "my friend died" (affection 30+), "can't say I'll miss them" (+3, affection −15 to −30), "got what was coming" (+6, affection −30 or less), or else "someone died" at −6 − 0.1 × affection (−9 for someone they nearly called a friend, −3 for someone they nearly couldn't stand). Relief and gloating scale with cruelty (× 1 − 0.8 × (kind − 5) ÷ 5), and anyone with kindness 8 or more (drunk kindness counts) feels a death they would have welcomed as a plain "someone died". A dead contestant leaves the world: their guests are shown out and others' ledger entries about them go.

## Rank, privileges, rules and punishments

Ranks are assigned at the ceremony by meter, ties broken by lifetime points, and hold for 24 hours. Newcomers are treated as rank 4 for access until their first ceremony (proposed).

| Rank | Sleeps | Washes | Eats | Booze | Locked out of |
| --- | --- | --- | --- | --- | --- |
| 1 | Suite | Private, hot | Gourmet, plus treats | Fancy | — |
| 2–3 | Good room | Hot | Gourmet, while it lasts | Good | — |
| 4–6 | Basic dorm | Cold only | Plain | Cheap | Spa, rooms above |
| 7 | A common-room couch | Sink baths in the public restroom | Leftovers | Rotgut | Lounge, rec room, spa, all bedrooms |

**Getting let in.** Bedrooms belong to their occupants, and anyone of any rank can host.

- **Knock:** a non-occupant knocks, which buzzes one occupant they choose, wherever that occupant is.
- **Odds of yes:** based on affection and attraction toward the knocker, scaled by kindness; ×0.3 if asleep.
- **Already hosting:** an occupant can host one guest at a time. If they're inside with someone else, it's a no, and the knocker learns who's in there, which counts as evidence for relationship labels.
- **Pestering:** knocking on the same person again within 3 hours costs affection −3 per repeat; being refused gives "turned away at the door" (−5).
- **Guests** are there legally: bathroom, shower and bed included, overnight too. Guest status ends when the guest leaves, or at 07:00 after a night.
- Being inside without an invitation is entering above your rank. Slipping in behind someone still counts.
- **How the build does it (proposed, `data/social.yaml`).** Odds of yes = (0.15 + 0.01 × affection + 0.04 × attraction) × (1 + 0.5 × (kind − 5) ÷ 5), × 0.3 if asleep. Contestants knock only for a shower, a cold shower or a bed (their host's; every bed sleeps two, and a host who'd rather not share says yes × 0.3 as often). When scoring, a knock option is the action's score × the odds the knocker expects (they assume the host feels about them as they feel about the host; × 0.25 for someone they knocked on in the last 3 hours) − 0.6 for the awkwardness of asking. A refused knocker stands at the door for 2 minutes. At 07:00 any guest still inside is shown out to the common room.

**Rules.** Never enter an area above your rank; never take what belongs to another; never damage the set; attend every ceremony and event; never interfere with the cameras. Killing isn't against the rules.

**Detection is total; sentencing waits for the ceremony.** If an infraction itself scored 10 or more, there's a 30% chance it's waived: rule of cool.

| Infraction | Default sentence |
| --- | --- |
| Entering above rank, including sneaking a night | Meter −20 (tuned from −10) |
| Skipping a ceremony or event | Meter −20 (tuned from −10) |
| Fighting outside the cage | Meter −25 (tuned from −15) |
| Theft | Fishbowl overnight; theft from shared food also costs everyone cold water and breakfast tomorrow |
| Damaging the set | Fishbowl overnight |
| Interfering with the cameras | Fishbowl 24 hours and meter −30 (tuned from −20) |

A second infraction the same day bumps the sentence up a step.

**How the build does it (proposed; numbers in `data/rules.yaml`).**

- **The sentence ladder** is the table's four sentences in order: meter −20, meter −25, fishbowl overnight, fishbowl 24 hours and meter −30. (Tuning: at −10 and −15 the infraction and sentence awards, 4 + 6, cancelled the mildest penalty, so sneaking cost nothing on the meter.) Each infraction starts at its row's step. Each contestant gets one sentence per ceremony, at the step of their worst infraction plus one for each extra infraction since the last ceremony, capped at the top.
- **Sneaking in.** Actions in rooms above a contestant's rank (not the airlock or the fishbowl) are scored like any other, minus a risk of 1.5 × (1 + 0.5 × (honest − 5) ÷ 5) × (1 − 0.5 × (brave − 5) ÷ 5) × (1 + 3 × max(0, 1 − meter ÷ 40)): under 40 on the meter a fine could finish them, so the risk weighs up to four times as much at zero (proposed, Oct 23: before it, 70% of deaths came the night of a fine for sneaking in, mostly for a shower or the toilet in the suite or good room). Walking in logs an "entering above rank" infraction, once per room per contestant between ceremonies. Nobody sneaks when the bladder is critical. Anyone still above their rank at the ceremony is escorted out with the room moves.
- **Fights outside the cage** give both fighters the infraction. What the fight paid each of them decides the rule-of-cool waiver, rolled at the ceremony.
- **Sentencing** logs the sentence (6 points), gives "sentenced in public" (−10), then applies the meter penalty, so a penalty can put someone at zero in time for the spacing.
- **The fishbowl** is a glass cell inside the common room with a hard floor to sleep on (rest × 0.5) and a toilet in full view. The sentenced are escorted in after the room moves and can't leave; an overnight stay ends at 07:00, a day stay after 24 hours, with "fishbowl night" (8 points) paid on release. Every hour a cold dousing adds hygiene +10 (aquatics +30) and doesn't wake a sleeper. People on either side of the glass can only use the glass interactions: talk (either side), and mock or pass food (from outside). Passing food gives the prisoner hunger +20.

**The fishbowl.** The occupant stays from the ceremony until 07:00 (or 24 hours), sits at 61°F with a cold shower every hour (aquatics don't mind), and hears everything. Passers-by get special interactions: mock (cruel), talk (social), pass food (kind).

## The Wheel and the daily event

**The Wheel** is spun once a day at the ceremony by the newly ranked bottom contestant. Segments are John's, weights proposed. With these weights the spacing segment comes up about one day in 22, a third of a death a week.

| Segment | Weight | Effect in slice one |
| --- | --- | --- |
| Spaced | 1 | The robots take the spinner to the airlock now |
| One immunity | 1 | A secret immunity: cancels the next spacing of any kind |
| Meter to full | 2 | Meter set to 100 |
| Cage match | 2 | Fight rank 1 at tomorrow's event; the winner takes the higher rank and room until the next ceremony |
| Dance-off | 2 | Sudden death against a random contestant tomorrow; the loser drops to zero |
| Suite night | 2 | Swap beds with rank 1 tonight |
| Fishbowl | 2 | 24 hours in it |
| Punish everyone | 2 | Cold water and no breakfast for all tomorrow |
| Party | 2 | Top-shelf booze for everyone tomorrow |
| Secrets revealed | 1 | Full version: the announcer reveals everyone's latest confession. Without AI: the announcer reveals everyone's private labels and today's hidden infractions |
| Pick two | 2 | The spinner picks two others: the least liked loses 50, the most liked gains 50 |
| Nothing | 3 | Nothing happens |

**The daily event at 15:00** rotates through three formats, never the same twice in a row. A Wheel-scheduled match takes the slot.

- **Cage match:** two contestants (from the Wheel, or the pair with the lowest mutual affection). A fight in the cage isn't an infraction; watchers get fun. Non-lethal in slice one.
- **Dance-off:** two to four contestants. Score = playful + stamina + beauty ÷ 2 + the crowd's affection + a die roll. Sudden death when the Wheel set it up.
- **The Button:** everyone secretly chooses. Each presser gains 20; everyone else loses 5 per press. Pressing is likelier for cruel, fickle, brave or desperate (low meter) contestants. Revealed at dinner: non-pressers' affection for each presser −10.

**How the build does it (proposed; numbers in `data/wheel.yaml` and `data/events.yaml`).**

- **The spin** comes right after ranks are assigned, before the room moves, so a fishbowl or a bed swap lands with them. The spinner gets "had to spin the Wheel" (−5). Each segment is a row with an effect kind, so new segments are data.
- **Station effects** (cold water, no breakfast, top-shelf booze) last one station day, midnight to midnight. "Tomorrow" means the day after the ceremony. Actions opt in or out with `when:` and `unless:`; on a cold-water day the hot showers run cold (the cold-shower action and its thought). Punish everyone also costs the spinner 5 affection from everyone else.
- **Collective punishment** uses the same effects: a theft sentence (the only theft is raiding the cafe's food) means cold water and no breakfast for everyone the next day, and everyone else's affection for the thief −5.
- **Cage match and dance-off from the Wheel** book tomorrow's event: the cage match against rank 1, the dance-off against a random contestant. If either dies first, the booking is off and the rotation picks. A no-show forfeits. A spinner who wins the cage match swaps rank, bed and clothes with rank 1 until the next ceremony ("rank went up/down" thoughts).
- **Suite night** swaps the two beds until the next wake chime.
- **Secrets revealed** reads out every label everyone holds. Anyone who believed "exclusive" with someone who calls it less gets "{who} won't commit", and everyone learns who's involved with whom, which counts as evidence (betrayal for an exclusive partner, jealousy for the rest). Slice one has no hidden infractions to reveal: detection is total and every infraction is sentenced in public.
- **Pick two:** the spinner's favorite (highest affection) gains 50 and their least favorite loses 50.
- **The event slot** is a gathering like the ceremony: everyone is summoned at 15:00 (sleepers with rest above 40 woken), it resolves 20 minutes in, and anyone not there skipped an event (an infraction; the fishbowl and breakdowns are excused). Cage matches are held in the cage room; the dance-off and the Button in the common room, so rank 7 can come.
- **Cage match** pairs are the two present with the lowest mutual affection when the Wheel didn't book it, counting each cage match a pair has already fought this season as +80 (proposed, Oct 23: a third of cage matches were reruns, one pair five times in a month; a deep feud still comes back). The fight is an ordinary brawl (no infraction, never lethal), then "cage match" pays 25 and 10. Watchers get fun +20.
- **Dance-off** without the Wheel: 2–4 dancers at random. Score = playful + stamina + beauty × 0.5 + 0.05 × the watchers' average affection for them + a roll of 0–6. It pays 5 to every dancer and 15 more to the winner; "won the dance-off" +5, "lost" −4. Watchers get fun +15.
- **The Button** odds = 0.3 × (1 − 0.5 (kind − 5) ÷ 5) × (1 − 0.5 (loyal − 5) ÷ 5) × (1 + 0.5 (brave − 5) ÷ 5) × (1 + (1 − meter ÷ 100)). Gains and losses go to the meter only, not lifetime points. The reveal is at 19:00.
- **Scoring** for events and trials skips the witness multiplier, since everyone is watching.

## Arrivals, deaths and trials

**Arrivals.** At 07:30, empty slots refill to seven through the casting step.

**Ways to die in slice one:** at zero at the ceremony; the Wheel's spacing segment; losing a trial; a crime of passion. Planned murders wait for the AI.

**After a death.** Everyone gets thoughts by relationship (friends grieve, rivals gloat, witnesses are shaken). A murder victim stays where they fell until someone finds them; the finder gets "found a body" (−10), the announcer declares it, and robots collect the body.

**Placeholder trials.** In slice one they run on knowledge and feelings, not speech.

1. After a murder is discovered, each contestant scores suspicion of each other: certainty if they witnessed it; otherwise low affection, fear, the victim's known enemies, and who they saw near the victim.
2. The contestant with the highest suspicion × bravery accuses their top suspect. The trial is held the next morning after arrivals.
3. Voters are everyone except the accuser and accused (proposed default). Witnesses vote the truth; everyone else votes against whichever party they like less, nudged toward condemning someone they fear.
4. Ties break on the meter, then lifetime points. The loser is spaced on the spot, unless they hold an immunity.

A killer who accuses an innocent and wins walks free; the engine keeps the truth for viewers.

**How the build does it (proposed; numbers in `data/trials.yaml`, times in `data/schedule.yaml`).**

- **Bodies.** A crime of passion nobody saw leaves a body. The first awake contestant other than the killer to be in that room finds it ("found a body" −10). Anything still unfound at the ceremony is announced first thing. The death is logged when it happens; the grief thoughts wait until it's known.
- **Seen near the victim:** in the murder room within the hour before. The station keeps when each contestant last left each room.
- **Suspicion,** 0–100: a witness is certain (100) about the killer and suspects nobody else. Otherwise 0.3 × −affection (when negative) + 0.3 × fear, +30 if the suspect and victim were rivals either way, +40 if the suspector and the suspect were both seen near the victim. It tops out at 99.
- **The accusation** comes as soon as the murder is known: the highest suspicion × brave ÷ 10, if it reaches 15. The killer weighs everyone else like anyone would, so they can accuse an innocent. The accused gets "accused of murder by {who}" (−15) and affection −30 toward the accuser. Below the line, nobody dares and there's no trial.
- **The trial** is a gathering at 07:45 (after arrivals), resolved 15 minutes in. Voters are everyone there except the two. Witnesses vote against the killer if the killer is on trial. An accuser who witnessed the murder testifies: each voter holds the accused 20 + 0.5 × their trust in the accuser lower (tuning: without testimony about 40% of trials spaced the wrong person, mostly eyewitnesses the room happened to like less than the killer). Everyone else condemns the side with the lower affection − 0.5 × fear; a voter with no feelings either way condemns the lower meter. A tied vote goes against the lower meter, then lifetime points, then a coin. The loser is spaced on the spot unless they hold an immunity; the winner gets 15 and "survived a trial" (+10).
- **Remembering a killer** (proposed, Oct 23: after a killer walked free nobody treated them differently). Someone comes to believe a contestant is a killer when they witness the murder, or at a trial that contestant survives as the accused (cleared, or saved by an immunity): the accuser and everyone who voted to space them. It's a belief, so an innocent who survives an accusation can be shunned too. Each believer takes it once: affection −30 and fear +20 toward them, −30 more if the victim was their friend, down to −30 (a rival) at least, and "{who} is a killer and still here" (−8 fear, three days). That dislike never fades past −30, so it keeps feeding the cage, envy, attack breaks and the next trial's votes, and sharing a room with them is "in a room with a killer" (−5 fear). Logged as `killer_known`.

## Data files and the core API

The core is a TypeScript library with no I/O, no clock and no global randomness. Everything tunable lives in YAML data files, hot-reloaded by the harness and debug view.

**Data files:** schedule, rooms (including temperatures), objects, species, clothing, generator, traits, needs, personality, actions, social (interactions, the ledger, attraction, fights, knocking), romance, thoughts, breaks, booze, scoring, ranks, rules, wheel, events, trials.

**Core API (sketch):**

```ts
createWorld(data: GameData, seed: number): World
step(world: World, minutes: number): SimEvent[]
save(world: World): string
load(data: GameData, saved: string): World
```

**Every event is logged** with its station time, type, actors, room, data and points awarded. The event log is the source for the harness's stats, the debug view's ticker, and later the producer, the AI worker and viewers.

**Determinism.** One seeded generator is passed explicitly everywhere, so a run with the same seed and data replays exactly. That makes bugs reproducible and tuning comparisons fair.

## Fast-forward harness and debug view

**The harness** is a command-line tool: run D days across N seeds with a given data folder, then print a summary and save the full results as JSON.

```
sim run --days 30 --seeds 200 --data ./data
sim sweep --param meter.drain --from 0.8 --to 1.4 --step 0.1 --days 30 --seeds 100
sim stories --days 30 --seeds 24
sim season --seed 24 --days 30
```

`run` and `stories` take `--set file.path=value` to try a value without editing the data.

**Story sampling** (Oct 23) reads the log the way a daily viewer would, and is meant to be repeated after any change to the show. `stories` counts what makes or breaks a season: how people die and whether a fine came first, what the ceremony reads out and what people sneak in for, who sleeps through the ceremony, first hookups without a kiss, cage reruns, breakdowns, murders and what happens to a killer afterwards, what a daily check-in sees, repeated names and karaoke hogging. `season` prints one season day by day with names (arrivals, first kisses, hookups, betrayals, fights, events, breaks, murders, trials, sentences, the Wheel, deaths), for reading.

**It reports:**

- deaths per week by cause, and average stay (contestant-weeks aboard per death, since in a 30-day run only short stays get to finish; the plain average of finished stays is printed alongside)
- breaks per contestant-day by type
- fights, flirts, kisses, hookups, breakups and betrayals per week
- lovin' by place (a bed, a bedroom, in public) and its average length; asks to share a bed; the share of nights spent beside someone, and with someone they'd rather not; nights disturbed by noise; when night owls get up
- infractions and sentences per day; the Wheel's outcomes
- rank changes per ceremony, and how long people stay on the couch
- drinks per day by quality, and time spent tipsy, drunk and hammered
- where time goes, by room and activity
- the share of days with nothing notable
- each measure against the success targets, flagged when outside them

The sweep mode tries a range of values for one setting and shows which lands the targets.

**The debug view** is a plain web page running the core directly: rooms as labeled boxes, contestants as colored dots with names and tiny need bars, an event ticker, and speed controls (pause, 1×, 60×, 3600×). Clicking a contestant shows their sheet, thoughts, mood, meter and ledger. Speeds are multiples of real time, so 60× is one station minute a second and 3600× is one station hour a second. Run it with `npm run debug`; it reads `data/` directly and swaps edited YAML into the running station.

## Out of scope and open choices

**Out of slice one:** AI (scenes, reflections, the LLM judge, confession content, the announcer's lines), art and the Phaser client, viewers and votes, the producer and recaps, clothing visuals (slice one uses a tier number per rank), planned murders, the arena beyond cage matches, and the hidden still's raiding rules.

**Choices to confirm (proposed defaults in the sections above):**

- [ ] Newcomers count as rank 4 until their first ceremony.
- [ ] Accuser and accused don't vote at trials.
- [ ] One immunity cancels a spacing of any kind.
- [ ] Cage matches are non-lethal for now.
- [ ] The Wheel's weights, especially spacing at 1 in 22.
- [ ] Meter: start at 60, drain 1 an hour, the scoring table as drafted.
- [ ] Crimes of passion: the kindness and calm cutoffs and the lethality odds.

After slice one runs, the first tuning job is the meter: drain against awards, until deaths land at two or three a week.

# Part three: building it

## Architecture and budget

The simulation runs as ordinary game code and costs no tokens. The LLM is called only for reflections and scenes that matter, which is why the budget works.

```
 Viewer side:  Phaser client  <-- WebSocket -->  Node server (SQLite: events, ledgers, votes, recaps)
                                                      |
 World engine (pure TS core, no LLM)  -- jobs -->  The gate  -->  AI worker (NanoGPT)
   needs, moods, utility AI, social rolls,           decides which      reflections, scenes,
   breaks, ledger, meter, judge, event log           moments get tokens judge, recap
```

Most of what viewers watch never touches the LLM; the gate decides which moments are worth tokens.

- **World engine:** positions, rooms, objects, needs, moods, utility AI, canned interactions, mental breaks, the opinion ledger, intention triggers, the ratings meter, the deterministic judge, health and death, and the authoritative event record.
- **Agent cognition:** per-agent persistent state, periodic reflection and LLM scenes. Agents propose actions; the engine validates them.
- **Show machinery:** the announcer (templates plus occasional LLM flavor) and the event scheduler with RimWorld-style on/off pacing.
- **History:** conversations, actions, ledger changes, ratings changes, deaths and arrivals, with agent memory compressed to save tokens.
- **Visual client:** animates world state; no LLM decides how anything moves.

**Rough daily budget at 1M input tokens with seven contestants (estimates, not measurements):**

| Use | Math | Input tokens a day |
| --- | --- | --- |
| Reflections | 7 contestants × 2 a day × about 4k | about 55k |
| Scenes | one call each, about 5k, 80–100 a day | 400k–500k |
| LLM judge on scenes | scene summary plus rubric, about 1.5k each | 120k–150k |
| Announcer, recap, memory compression, trials | remainder | about 100k |

**Sim speed is the real tradeoff.** If one sim-day equals one real day, the budget is generous. Compressing a sim-day into 2 real hours cuts the budget per sim-day twelvefold. One option is two clocks: social life near real time, longer arcs on a faster calendar.

**Stack (decided direction).**

- **Sim core in TypeScript, as a pure library** with no graphics or network, so it can run headless at high speed. Fast-forward batches (a simulated month in about a second, by estimate) report deaths per week, breaks per day, hookups and fights for tuning.
- **Content as data files** (needs, objects, interactions, thoughts, break tables, species, privileges), hot-reloadable, so tuning means editing numbers, not code.
- **A Node server on John's box** runs the live sim, stores the event log, ledgers, votes and recaps in SQLite, and pushes updates over WebSockets.
- **A Phaser web client** for the top-down station, with the floor plan drawn in the Tiled map editor and HTML panels on top. It works on a phone with nothing to install.
- **An AI worker, added last.** The sim emits jobs (reflection, scene, judge, recap); the worker calls NanoGPT, enforces the daily budget and writes results back. If it's down, the station keeps running without words.
- **Rust considered, set aside.** At seven contestants speed isn't the bottleneck; changing rules is. A stable hot spot can be ported later.

**Build order:** the headless sim with a crude debug view (dots in boxes), fast-forward tuning, then art and the viewer interface, then the AI worker.

## Next steps

Planning has reached its limit; the rest has to be found by building and tuning. The path from here:

1. **Answer the few blocking questions** (see Open questions: those marked blocking).
2. **Write a spec for prototype slice one:** done; it is Part two of this file.
3. **Build the headless sim and the fast-forward harness,** no art and no AI.
4. **Add a crude debug view** and watch it.
5. **Tune** until a simulated week feels like the show.
6. **Then** species art, the real floor plan, the viewer interface, and finally the AI worker.

The paper playtests (a sample day and one contestant's day) live in the original design doc; the prototype replaces them.

## Risks

The biggest risk is building too much before anything is fun; the rest have known mitigations.

| Risk | Mitigation |
| --- | --- |
| Too much is built before anything is fun | Design on paper first; build the station and life sim before the show |
| Open models are agreeable and avoid conflict | Incentives that reward betrayal; numbers that are canon; casting for friction |
| The LLM softens generated characters | Roll stats first and have the LLM interpret them, cruelty included |
| Agents collectively boycott the show | The meter drains regardless |
| Some models refuse to plan a fictional murder | Test candidate models early; mental breaks provide crimes of passion anyway |
| Romance drifts past PG-13 | Fade-to-black instructions in prompts; censor the visuals, not the logic |
| Every newcomer repeats the same confused monologue | Strong arrival drives; veterans brief newcomers |
| Killers' stories fall apart | Private alibi sheet in the killer's state |
| Agents farm cheap drama | Hidden weights, boredom with repeats, novelty bonuses |
| The judge feels random | Slow-drifting weights; a fixed rubric for the LLM judge; the announcer names what scored |
| Murder becomes the dominant strategy | Murder is physically hard; conviction risk grows with the payout |
| The show swallows ordinary life | Privileges and wants beyond survival; the misery loop |
| Too many deaths to get attached | Tune drain and awards for two or three deaths a week |
| Trials end in ties | Pick a tie rule before the first trial |
| Public comments inject instructions | Comments become structured signals; never raw in prompts |
| An empty audience | Every mechanic works with zero or one viewer |
| Token costs creep up | Gate scenes by importance; compress memory; monitor per call type |

## Open questions

The meter's numbers (size, drain, award sizes) are the most important unanswered values. Items also tracked in DECISIONS.md under Open.

**The show**

- [ ] Meter size, drain rate and award sizes for two or three deaths a week.
- [ ] Privilege thresholds, and which prizes go by rank.
- [x] What happens at the evening ceremony (see Part two).
- [ ] How and when does the announcer divulge information?
- [ ] Can contestants see each other's meters? (John: try both.)
- [ ] What do extra lives protect against: the meter, a trial, murder, or all three?
- [ ] Is the escape real, even if nearly impossible?

**Murder and trials**

- [ ] Should the operator ever gift a dangerous object?
- [ ] Do the accuser and accused vote? (Ties: the morning's newcomer breaks them.)

**The judge and audience**

- [ ] Starting event types, weights and boredom rates.
- [ ] How heavily votes shift the weights, and how fast the judge's taste drifts.

**Characters and station**

- [x] The species roster (six, decided Oct 18). Still open: real names and the art.
- [ ] The floor plan (designed in Part two, The floor plan: the next pass), bed qualities and perceived-privacy spots.
- [ ] Final names for the eight personality sliders, and whether traits or quirks sit on top.

**Engine and presentation**

- [x] One station day equals one real day, with fast-forward for testing.
- [x] Zero puts you on notice; you're spaced at the evening ceremony unless you recover first.
- [x] Slice one as specified in Part two.
- [ ] Top-down or isometric, and the art pipeline.
- [ ] Which NanoGPT models, and the current subscription limits.
- [ ] A real name.

**Rules and weird features**

- [x] What rules does the operator enforce, and what are the punishments? (See Rank, rooms and rules, and Part two.)
- [ ] Arena challenges and trial by combat: in or out?

## Sources

- [Social — RimWorld Wiki](https://rimworldwiki.com/wiki/Social): opinions, interactions, compatibility, social fights, romance
- [Mental break — RimWorld Wiki](https://rimworldwiki.com/wiki/Mental_break): thresholds, break frequency, catharsis
- [Thoughts — RimWorld Wiki](https://rimworldwiki.com/wiki/Thoughts): mood thoughts, death and witness effects
- [Cassandra Classic — RimWorld Wiki](https://rimworldwiki.com/wiki/Cassandra_Classic): storyteller pacing
- [AI Storytellers — RimWorld Wiki](https://rimworldwiki.com/wiki/AI_Storytellers): what storytellers consider
- [About RimWorld — RimWorld Wiki](https://rimworldwiki.com/wiki/About_RimWorld): story generator, AI Director inspiration
- [Why RimWorld sold more than 1 million copies](https://blog.habrador.com/2019/06/why-rimworld-sold-more-than-1-million.html): apophenia
- [NanoGPT subscription usage docs](https://docs.nano-gpt.com/api-reference/endpoint/subscription-usage): daily and monthly limits

RimWorld wiki pages were read on October 14, 2026; values are as documented there and may differ by game version.
