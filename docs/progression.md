# Progression

How a character gets stronger and how the player moves through the worlds — levels, synergy,
evolutions, and the tier that freezes a world's difficulty at entry.

## Character growth (`growth.ts`)

Two knobs, deliberately decoupled — this is the main/secondary distinction:

- **The catch-up ramp** rescales the printed base damage by how far the story has moved since the
  character debuted — see below. It is a common factor on both damage stats, so it never changes two
  characters' relative strength within an arc.
- **Level is uncapped** and every level grants the *same* flat damage as the one before
  (`levelGrowth(level) = 1 + level * LEVEL_DAMAGE_STEP` applied to `baseClickPower` and `baseDps`).
  Linear on purpose; `LEVEL_DAMAGE_STEP` is the pacing knob for how fast damage outruns enemy hp.
- **The passive has nothing to do with levels**: it is ranked up with items, see below.
  `PASSIVE_LEVEL_CAP` is the rank cap — 10 for `rarity: "main"`, 5 for `"secondary"`.

Levels come from **xp earned in combat**: every kill grants the whole team xp equal to `XP_PER_KILL_REWARD`
times the enemy's raw reward, so it scales with the world independently of the currency payout. The
multiplier sits well above 1x on purpose — level has no cap, and a flat 1:1 income gets swallowed by
the xp curve (`XP_BASE`/`XP_GROWTH` in `growth.ts`) after a few dozen levels, stalling leveling out
and leaving a character's level worth nothing next to their ability. Only the xp total is stored —
`levelOf` derives the level from it via `levelFromXp`, so level and xp cannot drift apart. Xp dies
with the team on `prestigeReset`.

## The catch-up ramp (`CATCH_UP`)

A character's printed `baseDps` used to say two things at once: how strong the story is at that
point, and how strong that character is next to the ones they debut alongside. The first is a
generated ramp (~1.85x per arc, uniform across all 28 arcs — measured, not assumed), the second is
the only one that is a design statement. Conflated, the ramp won: arc 1's Naruto at 4 dps against
Isshiki at 15 200 000 is a 4-million-fold gap, and `levelGrowth` is linear, so nothing ever closes
it. Every recruit was dead weight two arcs after joining.

So the ramp is divided back out and re-applied where the player actually stands:

- `arcPowerTable` reads the ramp off the cast itself — each arc's power is the strongest `baseDps`
  debuting there. No new data, and it tracks the tables automatically when a world is added.
- `reachedArcPower` is the deepest rung the run has stood on (monotone: travelling back never nerfs
  anyone — the synergy malus already handles being away from home).
- `catchUpGrowth` multiplies the printed base damage by `(reached / debut) ** CATCH_UP`, folded into
  `damageGrowth` alongside levels and duplicates.

The ratio `baseDps / arcPower[debut arc]` is untouched by all of this, which is the whole point: two
characters debuting in the same arc keep their exact relative strength forever, and the "accentuate
by how strong the character is" part of the design survives intact. `CATCH_UP` is the single knob —
0 restores the old behaviour, 1 puts every recruit exactly on the current rung, and anything between
leaves the veterans a fixed distance behind.

**Tuned at 0.85** with `npm run sim`. What the sweep showed (seed 1, 4 clics/s, on the hp tables of
the time — the `run` column is what each value did *before* the tables were refit for it):

| `CATCH_UP` | run | veteran gap at the last arc |
|---|---|---|
| 0 (old) | **walls** in Shippūden, never finishes | 4 000 000x |
| 0.55 | 52 min | ~2 900x |
| 0.65 | 39 min | ~550x |
| 0.75 | 35 min | ~105x |
| **0.85** | **22 min** | **~20x** |

The run time barely moves between 0.65 and 0.85 because kills are capped by `MAX_KILLS_PER_SECOND`
(`docs/combat.md`): past the point where the team out-damages the hp, extra dps buys nothing. That
is what makes a high `CATCH_UP` nearly free — the relevance is bought, the pacing is not spent.
Re-run `npm run sim` if it changes.

**Why it moved from 0.75 to 0.85.** At 0.75 a veteran was left `(reached/debut)^0.25` behind, which
over the full 28 arcs is **61x** — so the entire Naruto part 1 cast, eighteen characters, was worth
**1.4%** of the team's dps. The comment on `catchUpGrowth` promises a recruit never becomes dead
weight; at 1.4% it plainly had. 0.85 cuts the exponent to 0.15: the roster-wide spread falls from
**213x to 20.6x** and part 1 lands at **4.6%** (Shippūden 33.7%, Boruto 61.8%). It costs ~1.58x team
dps, which is why **both generated hp tables were refit against it** — see `docs/combat.md`. It stays
below 1 for the reason below, and moving it again means paying that refit again.

## The cohort floor on `baseDps`

`CATCH_UP` only compresses the gap *between* debut arcs. The gap *inside* one is the raw
`baseDps / arcPower[debut]` ratio, preserved forever by design — and it had drifted far: the opening
arc ran Sakura at 2 against Kakashi's 7, a permanent **3.5x** between two characters recruited in the
same five minutes, and every world had `secondary` recruits sitting at half their cohort's lead.

So the data now holds one rule: **no character sits below 0.6 of the strongest `baseDps` debuting in
their arc.** Thirty characters were raised to it, every one of them `rarity: "secondary"` — the floor
never touched a `main`, which is what keeps it a floor rather than a flattening. The opening trio is
now 1.00 / 0.57 / 0.57 instead of 1.00 / 0.57 / 0.29.

It is deliberately cheap: raising the *minimum* of a cohort never moves `arcPowerTable`, which reads
the **maximum**, so no `debutPower` moves, no catch-up exponent moves, and team dps rises only ~4%.
Keep new content on the same floor — and if you add a character stronger than their cohort's current
lead, remember that they redefine `arcPower` for that arc and quietly demote everyone debuting
beside them.

## Entry worlds all hand off at the same power

### Fresh-save pacing targets

Entry-world balance is measured against the same onboarding windows at 4 deliberate clicks per
second. These are review targets, not test assertions: a content retune may move a seed slightly,
but a whole world outside the window needs an explicit design reason.

| Milestone | Target from a fresh save | What counts |
| --- | --- | --- |
| First recruit | 0.3–1.0 min | The first character joins the team. |
| First arc | 0.8–2.0 min | The first boss falls and the next arc opens. |
| First useful item | 1.0–3.0 min | A unique is equipped or a passive rank is bought; a drop sitting in stock does not count. |
| First actionable prestige | 8–15 min | A reset would bank at least 2 points, enough for the cheapest tree level. |

The simulator also records the first pending point and the three-point world-unlock threshold for
diagnosis, but neither replaces the actionable target: one point has no sink, while three points is
a route choice rather than the first meta-progression purchase. Run `npm run sim:matrix` to compare
all entry worlds over the stable seed sample.

`reachedArcPower` is a **single scalar for the whole game**, not one per world: it is the deepest
`arcPower` rung the run has ever stood on, wherever that was. Which means the world a player *ends*
their first world at sets the difficulty of every world after it — and the tier ramp
(`difficultyMultiplier`, 2.5x per world entered) is nothing next to it.

So an entry point has a **budget**, not just a ramp. Naruto's five arcs end at **78**, Hunter x
Hunter's and Horimiya's six at **120**, and Shippūden — the first sequel world anyone reaches — opens at **130**:
whichever entry world you pick, you arrive at the second world at roughly the same height, which is
what makes the 2.5x tier step mean anything.

Bleach is where that stopped being free. Fifteen arcs at the story's usual ~1.85x would end near
**20 000**, 170x above the shorter entry points, and every world after it would fold — a Bleach
player would walk into a 2.5x-tier world with a team sized for a 39x one. Its debut-power ramp is
therefore deliberately flat, **~1.24x an arc, 6 → 125**, landing it beside Hunter x Hunter.

Nothing is lost by that, which is the part worth remembering: `baseDps` is only ever read
*relatively* — `catchUpGrowth` divides the ramp out and re-applies it at the arc reached, and
`arcPowerTable` reads a cohort's maximum. A flat ramp means a new recruit is not dramatically
stronger than the veteran beside them, and that is what `CATCH_UP` spends its whole existence
undoing anyway. What actually makes Bleach's fifteenth arc harder than its first is the hp table
(`docs/combat.md`), and *that* rises 1.6x an arc because the team's dps really does — from the
roster deepening, not from the printed numbers.

**A world added after this one has the same choice to make.** Long entry world: flatten the ramp to
fit the budget. Sequel world: keep 1.85x, because it starts where the previous world's budget left
off and the whole chain is already sized for it.

Algebraically the inflation is bounded and does **not** grow with roster size: summing
`D^(1-CATCH_UP)` over a geometric ramp converges for any `CATCH_UP < 1`, at roughly 3.3x the old
sum here. Do not set it to 1 — there the sum is linear in the number of characters owned, and a
90-character roster runs away.

## World progression

Animes are the worlds; arcs are the stages inside them. `progression.ts` holds it all, pure:

- An arc clears when its **boss** falls. Arcs open in `order`, one after the previous clears; an
  anime clears when all of its arcs do.
- Enemy hp and rewards scale by `2.5^tier`, where **tier = the anime's index in `unlockedAnimeIds`**. Entering
  a new world is only allowed once everything already entered is cleared, so that index equals the
  number of worlds already finished — the difficulty ramp the design calls for. Freezing the tier at
  entry is what stops a cleared anime from un-clearing itself when global difficulty rises; do not
  recompute a tier from the live completed-count or you reintroduce that circularity.
- A world the run has **outgrown** is re-levelled on top of that tier — see the section below.
- **Worlds of one universe are ordered.** `Anime.requiresAnimeId` names the world that must be
  *cleared* first, and `isAnimeAvailable` gates both routes into a world — free travel and the paid
  shortcut alike. Prestige buys an early entry, never a way to read a sequel first: Shippūden sits
  behind part 1, and Boruto is meant to sit behind Shippūden. An anime with no `requiresAnimeId` is
  an entry point, i.e. a world the player may start a run on. Naruto, Hunter x Hunter, Bleach and
  Horimiya are the current entry points; the latter three are each one continuous world because
  none has a sequel part in this data model — Bleach's Thousand-Year Blood War is a separate series on AniList
  but is this world's fifteenth arc here, not a world of its own.
- The player picks their first world freely among the entry points and travels freely after each
  clear (`travelTo`, free). `unlockAnime` is the paid shortcut: spend `Anime.unlockCost` prestige
  points to enter early — but only into a world whose prerequisite is already cleared.
- Meta-progression survives `prestigeReset`: prestige points, passive ranks, unique forge levels,
  achievements, tree levels, pack points and duplicates. Kill counts, cleared arcs, the worlds entered and the team all
  go, and the player picks an entry world again from scratch. Tier is the
  index in `unlockedAnimeIds`, so the difficulty ramp restarts with it.

## Re-levelling a world the run has outgrown

The tier ramp answers "how many worlds have you finished", and that is only the right question for a
**chain**: Shippūden opens at `arcPower` 130 where Naruto ends at 78, so 2.5x is the whole of the gap
and the world plays as authored. It is the wrong question for an **entry world reached late**. Hunter
x Hunter, Bleach and Horimiya all open at `arcPower` 6 with a ~600 hp boss, written for a fresh team;
a player walking in out of Boruto stands at 9.6e7 with trillions of dps. The tier hands them 15x
against a gap near 1e9. Before this was fixed the simulator cleared **24 of 55 arcs in 0.1-0.2 minutes
each** — three whole worlds scrolling past — and it was not a late-game problem either: Naruto entered
second, after Bleach, is just as free.

So a world entered from above itself is re-levelled, and three numbers do it. Two are frozen at entry,
in `SaveFile.animeEntryDifficulties` and `animeEntryScales`, for exactly the reason the tier is:
recomputed live against a `reachedArcPower` that keeps climbing, a world would keep getting harder
while you are standing in it.

| Number | What it does | Fitted to |
|---|---|---|
| `worldEntryDifficulty` | the scale the world's **opening arc** plays at | `WORLD_ENTRY_BREATHER` = 0.7 of the heaviest arc already cleared |
| `relevelledDifficulty` | re-profiles every later arc off that anchor | `RELEVEL_RAMP` = 1.1 per `arcPower` rung |
| `worldEntryScale` | shifts the world's `arcPower` rungs onto the player's | nothing — it is exactly `reached / opening rung` |

**The anchor is an arc, not a boss.** `arcWeight` is `mobsToBoss * mean mob hp + boss hp`: the mobs are
most of the clock, and two arcs sharing a boss are not the same fight when one runs 18 mobs to it and
the other 52. Anchoring on the boss alone put a world's opening arc anywhere between one and twenty
minutes depending on its mob count.

**The anchor is discounted by `BORDER_CLIFF` (12) when the arc it reads was cleared at home.** Crossing
out of the worlds you call home costs every carried character its passive, its ability and half its
damage — measured at 10.36T → 1.43T leaving Boruto. The heaviest arc cleared *before* that crossing was
beaten by a team that no longer exists, so calibrating a new world on it undiscounted walls the very
first arc; and a world cleared *after* it (i.e. one that was itself re-levelled) was already fought
abroad and needs no discount at all. That single distinction is what lets one breather constant serve
the first crossing and every crossing after it.

**A re-levelled world's climb is re-profiled, not scaled.** An entry world's authored hp table climbs
3.4-4x per rung because a fresh player's dps climbs with it — they are recruiting that world's entire
cast, passives included. A visitor arriving with a hundred characters gains none of that: their dps
climbs with the shifted rungs alone, i.e. at `CATCH_UP` (0.85). Scaling such a world by one constant
opens it fairly and walls it four arcs later, which is exactly what the first attempt at this did.
`RELEVEL_RAMP` = 1.1 sits just above `CATCH_UP`, so arcs still lengthen as the world goes on, at the
rate the late chain actually plays at (Boruto: 2.4 min an arc opening, 8 closing).

**What is deliberately *not* re-levelled is the world's own cast.** Scaling their `baseDps` up to the
enemies was tried, and it runs away: a fresh player's arc-1 recruit is level 12 with no passive, while
a visitor's lands straight into an endgame stack of levels, passives, achievements and items worth a
thousandfold — the same printed number is not the same character. The simulator's answer was blunt, a
full 55-arc run in **41 minutes**. So a re-levelled world's recruits stay what they are, the carried
roster stays the backbone, and the ramp is profiled for that team rather than for the one the world
was written for.

**The boss timer is the binding constraint on how hard entry can be.** Timers are authored per arc for
the world's own player, and re-levelling does not move them; push `WORLD_ENTRY_BREATHER` up and the
opening boss stops falling inside its clock. 0.8 walls on Hunter x Hunter's first arc, 0.7 does not.

Measured over the default route (seeds 1, 2, 3, 7 — identical, the economy is seed-stable): worlds 4-6
went from 0.1-0.2 minutes an arc to **1.5-2.1 (Hunter x Hunter), 1.8-2.5 (Bleach), 1.8-3.1 (Horimiya)**,
55/55 arcs, 117 → 152 minutes, no boss timeout anywhere. The authored chain is untouched — every scale
in Naruto, Shippūden and Boruto comes out at 1 and the run is byte-identical through Boruto's last arc.
Starting on Bleach now *clears* the game (55/55, 132 min) where it used to wall in Shippūden.

Two walls this did **not** fix, both pre-existing and reproducible on the parent commit: Hunter x Hunter
as an *entry* world walls on its own third arc ("York Shin City"), and the Horimiya route walls in
Shippūden ("Quatrième Guerre : Confrontation"). Those are authored-table problems, not re-levelling.

## Synergy

`synergyMultiplier` is the core mechanic and the "characters weaken outside their world" rule. It
scales both `clickPower` and `teamDps` contributions: a character deals full damage in their own arcs
(`matchingArcMultiplier`, 1.0), weaker in other arcs of their own anime (`sameAnimeMalus`, 0.85),
weakest in another anime's arc (`otherAnimeMalus`, 0.5). Tuning `defaultSynergyConfig` is the main
balance knob.

Outside every anime in which they are present, two things stop rather than shrink, because both are story
abilities and neither travels:

- the **passive** — `characterContributions` drops it altogether, not just malused;
- the **active ability** — `getUnlockedAbilities` refuses to list it, so it can't be fired, doesn't
  reach the "Réflexe" automation, and any buff of it still running is filtered back out of
  `allModifiers` on arrival (`awayCharacterIds`). Walk home and the buff resumes for whatever is
  left of its duration: travelling suspends an ability, it never spends one.

Presence is independent from recruitment. `Character.animeId` remains the one world where the
character is recruited; `appearanceAnimeIds` lists later anime where the same Codex entry remains
part of the cast, so its passive and active ability stay available there. This prevents a Naruto
part-1 recruit such as Rock Lee from becoming falsely "foreign" on entering Shippūden. The narrower
`arcIds` still grants 1.0 only in the character's strongest story arcs, while other arcs of a
declared appearance anime use the usual 0.85 tier. `fullSynergyAnimeIds` is the explicit exception
for a recurring lead whose story spans a later anime end to end; Naruto receives 1.0 throughout
Shippūden and Boruto.

All three rules read the same `isHomeArc` test, deliberately one function — a character weakened
for being abroad has to be exactly the character whose story abilities stayed behind. None is
lifted by a crossover window, which buys damage back and nothing else. An evolution remains another
route into a home anime — see below — but is no longer used as the complete cast-presence model.

## Evolutions

A character can grow through several stronger selves without becoming another Codex entry —
`Character.evolutions`, an ordered list of `animeId`, `label`, `bonus` modifiers and a replacement
`ability`. Each target anime must directly follow the preceding stage in the universe's reading
order. Every recurring Naruto-universe character gets one stage per later series in which they
appear; a part-1 character present in Shippūden and Boruto therefore has two.

Unlocking is permanent, not location-gated: the first time an owned character fights in
an evolution's `animeId`, `gameState`'s `maybeEvolve` (called from `spawnNext`, so on every recruit
and arc switch) adds its stable `character@anime` key to `evolvedCharacterIds`, and it never re-locks —
not even back in their original world. `prestigeReset`/`hardReset` wipe it like the rest of the
run-scoped state. Bare character ids from older saves still unlock the first stage.

Unlocked bonuses stack in `characterContributions`; the latest unlocked stage supplies the active
ability and replaces the earlier one outright. `Codex.tsx` lists every stage, its trigger world,
bonus and individual acquired state while showing the currently active ability.
