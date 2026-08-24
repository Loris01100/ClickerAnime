# Progression

How a character gets stronger and how the player moves through the worlds — levels, synergy,
evolutions, and the tier that freezes a world's difficulty at entry.

## Character growth (`growth.ts`)

Two knobs, deliberately decoupled — this is the main/secondary distinction:

- **Level is uncapped** and every level grants the *same* flat damage as the one before
  (`levelGrowth(level) = 1 + level * LEVEL_DAMAGE_STEP` applied to `baseClickPower` and `baseDps`).
  Linear on purpose; `LEVEL_DAMAGE_STEP` is the pacing knob for how fast damage outruns enemy hp.
- **The passive has nothing to do with levels**: it is ranked up with items, see below.
  `PASSIVE_LEVEL_CAP` is the rank cap — 10 for `rarity: "main"`, 5 for `"secondary"`.

Levels come from **xp earned in combat**: every kill grants the whole team xp equal to `XP_PER_KILL_REWARD`
times the kill's currency reward, so it scales with the world the same way currency does. The
multiplier sits well above 1x on purpose — level has no cap, and a flat 1:1 income gets swallowed by
the xp curve (`XP_BASE`/`XP_GROWTH` in `growth.ts`) after a few dozen levels, stalling leveling out
and leaving a character's level worth nothing next to their ability. Only the xp total is stored —
`levelOf` derives the level from it via `levelFromXp`, so level and xp cannot drift apart. Xp dies
with the team on `prestigeReset`.

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
  an entry point, i.e. a world the player may start a run on.
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
`animeId`, enforced in `engine.test.ts`) — evolutions only ever look forward in a universe's reading
order, never sideways or back.

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
