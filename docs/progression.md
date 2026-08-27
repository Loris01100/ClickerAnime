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
- **Worlds of one universe are ordered.** `Anime.requiresAnimeId` names the world that must be
  *cleared* first, and `isAnimeAvailable` gates both routes into a world — free travel and the paid
  shortcut alike. Prestige buys an early entry, never a way to read a sequel first: Shippūden sits
  behind part 1, and Boruto is meant to sit behind Shippūden. An anime with no `requiresAnimeId` is
  an entry point, i.e. a world the player may start a run on. Naruto and Hunter x Hunter are the
  current entry points; Hunter x Hunter is one continuous world because the anime has no sequel
  part in this data model.
- The player picks their first world freely among the entry points and travels freely after each
  clear (`travelTo`, free). `unlockAnime` is the paid shortcut: spend `Anime.unlockCost` prestige
  points to enter early — but only into a world whose prerequisite is already cleared.
- Nothing survives `prestigeReset` except the prestige points: kill counts, cleared arcs, the worlds
  entered and the team all go, and the player picks an entry world again from scratch. Tier is the
  index in `unlockedAnimeIds`, so the difficulty ramp restarts with it.

## Synergy

`synergyMultiplier` is the core mechanic and the "characters weaken outside their world" rule. It
scales both `clickPower` and `teamDps` contributions: a character deals full damage in their own arcs
(`matchingArcMultiplier`, 1.0), weaker in other arcs of their own anime (`sameAnimeMalus`, 0.85),
weakest in another anime's arc (`otherAnimeMalus`, 0.5). Tuning `defaultSynergyConfig` is the main
balance knob. Outside their own anime entirely, `characterContributions` also drops the passive
altogether (not just malused) — it's a story ability, it doesn't travel to another anime's arc. An
evolved character is the one exception — see below.

## Evolutions

A character can grow into a stronger self later in their own story without becoming a second Codex
entry — `Character.evolution` (`animeId`, `label`, `bonus` modifiers, an optional `ability`).
`evolution.animeId` must be a sequel anime (`requiresAnimeId` pointing back at the character's own
`animeId`, enforced in `src/engine/tests/`) — evolutions only ever look forward in a universe's reading
order, never sideways or back.

The Naruto universe uses this twice, one link per world border: part 1's mains grow when they reach
Shippūden, and Shippūden's mains who are still standing in Boruto (Saï, Yamato, Ônoki, Killer Bee,
Mei) grow again there. A character has exactly one `evolution` field, so a given entry evolves at
most once — Naruto's own evolution fires at Shippūden and that is the end of it, which is why the
Boruto set is drawn from characters introduced *in* Shippūden rather than from part 1's cast.

Unlocking is permanent, not location-gated: the first time an owned character fights in
`evolution.animeId`, `gameState`'s `maybeEvolve` (called from `spawnNext`, so on every recruit and
arc switch) adds their id to `evolvedCharacterIds` for the rest of the run, and it never re-locks —
not even back in their original world. `prestigeReset`/`hardReset` wipe it like the rest of the
run-scoped state.

Once evolved, `synergyMultiplier` treats `evolution.animeId` as home too (the `sameAnimeMalus` tier,
same as any other arc of their own anime), so the passive stops shutting off there and
`evolution.bonus` — extra modifiers, scaled by that same synergy value — stacks in on top of it via
`characterContributions`. If `evolution.ability` is set, it replaces `character.ability` outright in
`getUnlockedAbilities` once evolved — a character never has both at once. `Codex.tsx` shows the
live ability (base or evolved) plus a dedicated "Évolution" block previewing the trigger world, the
bonus and (once owned) whether it has fired yet, independent of whether the character is met.
