# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Vite dev server
- `npm run build` — `tsc --noEmit` typecheck, then Vite build
- `npm test` — `vitest run` (node environment, only `src/**/*.test.ts`)
- Single test: `npx vitest run src/engine/engine.test.ts -t "applies flat, then percent"`

## Architecture

SolidJS + Vite + TypeScript idle/clicker prototype. Two layers, deliberately separated:

**`src/engine/` — pure logic, no Solid imports** (except `gameState.ts`). Every file here exports
plain functions over plain data, which is why `engine.test.ts` can run in a node environment with no
DOM. Keep new game rules pure and here; keep them out of components.

**`src/engine/gameState.ts` — the only reactive seam.** `createGameStore(data)` holds all signals,
wires the pure functions into memos, runs the 200ms tick that accrues passive income, and autosaves
to `localStorage` every 5s. Components call its returned actions (`click`, `recruitCharacter`,
`activateAbility`, `prestigeReset`, …) and read its accessors.

**`src/ui/` — presentation only, no rules.** `App.tsx` is the 3-column shell (roster left, click
stage centre, progression right); each column is one component taking `game: GameStore` as its only
prop. Components must never compute balance themselves — if a number needs deriving, it belongs in
the engine and gets exposed on the store (that is why `synergyOf`, `costOf` and `pendingPrestigeGain`
exist). Styling is one hand-written `src/styles.css` with CSS variables; no UI framework.

### The combat loop

An arc is a zone the player fights through. `combat.ts` is pure and decides who shows up next:
cycle `arc.mobs` in order until `mobsToBoss` kills, then `arc.boss`; once the arc is cleared the boss
stops appearing and the zone farms mobs forever. Mobs carrying a `characterId` are the anime's
characters — beating one adds them to the team for free, and they drop out of the pool afterwards.
Enemies carrying an `itemId` hand over that item, once.

Enemies never deal damage. The only pressure is `Enemy.timerMs`: run out and the enemy respawns at
full hp, nothing else. It sits on `Enemy`, not on a boss-only type, so making mobs timed is a data
change — by default only bosses carry one, because timed mobs would break idling.

Damage has two sources, both modifier-driven: `clickPower` (one narrator click, based on
`narratorClickPower`) and `teamDps` (applied every tick as `dps * delta`). Currency only ever comes from kills — there is no passive
income any more, and `lifetimeEarned` is what feeds prestige.

Combat state (current enemy, hp left, timer deadline) is deliberately **not** saved: a reload
restarts the current fight. Only kill counts and cleared arcs persist.

### Character growth (`growth.ts`)

Two knobs, deliberately decoupled — this is the main/secondary distinction:

- **Level is uncapped** and every level grants the *same* flat damage as the one before
  (`levelGrowth(level) = 1 + level` applied to `baseClickPower` and `baseDps`). Linear on purpose.
- **The passive stops at a cap**: `PASSIVE_LEVEL_CAP` is 10 for `rarity: "main"`, 5 for
  `"secondary"`. Levels past it still buy damage; they just stop deepening the passive.

Levels are bought with currency (`levelUpCost`, geometric, dearer for the main cast) — that is the
only currency sink in the game. Levels die with the team on `prestigeReset`.

### The narrator's click

`narratorClickPower(allyCount, foundItems)` is the *base* fed into the `clickPower` pipeline, not a
constant: it rises with the number of allies in the team and with every item ever found. Items are
granted by beating the enemy holding them (`Enemy.itemId`, one per boss, no RNG) and are never lost
— not on prestige, not on travel — so this floor only ever rises.

### The modifier pipeline

Everything that affects a stat becomes an `ActiveModifier`, and `computeEffectiveStat` folds them:
`(base + flats) * (1 + Σpercents) * Πmultipliers`. That order is a balance decision — changing it
rebalances the whole game. Modifiers come from two sources, merged in `allModifiers`:

1. **Owned characters** → `characterContributions` converts base stats + innate passive into
   modifiers, each pre-scaled by the character's synergy with the active arc.
2. **Activated abilities** → temporary modifiers stamped with `expiresAt`, pruned on every tick.

Expiry is checked both in `pruneExpired` and again inside `computeEffectiveStat`, so a stale list
can never inflate a stat.

### World progression

Animes are the worlds; arcs are the stages inside them. `progression.ts` holds it all, pure:

- An arc clears when its **boss** falls. Arcs open in `order`, one after the previous clears; an
  anime clears when all of its arcs do.
- Enemy hp and rewards scale by `2.5^tier`, where **tier = the anime's index in `unlockedAnimeIds`**. Entering
  a new world is only allowed once everything already entered is cleared, so that index equals the
  number of worlds already finished — the difficulty ramp the design calls for. Freezing the tier at
  entry is what stops a cleared anime from un-clearing itself when global difficulty rises; do not
  recompute a tier from the live completed-count or you reintroduce that circularity.
- The player picks their first world freely and travels freely after each clear (`travelTo`, free).
  `unlockAnime` is the paid shortcut: spend `Anime.unlockCost` prestige points to enter early.
- Kill counts and cleared arcs survive `prestigeReset` — worlds are meta-progression, not a run.
  The team does **not**: a prestige wipes it, and characters must be beaten again.

### Synergy

`synergyMultiplier` is the core mechanic and the "characters weaken outside their world" rule. It
scales both `clickPower` and `teamDps` contributions: a character is strong in their own arcs
(`matchingArcMultiplier`), weaker in other arcs of their own anime (`sameAnimeMalus`), weakest in
another anime's arc (`otherAnimeMalus`). Tuning `defaultSynergyConfig` is the main balance knob.

### Persistence

The save is a flat `SaveFile` in `localStorage` under a versioned key. `readSave` shape-checks it and
falls back to a fresh run rather than throwing, so an old save can never brick the boot. Bump the key
version when the shape changes. There is no offline-progress catch-up.

### Prestige

`prestigeReset()` wipes the run (currency, roster, temp buffs, cooldowns) but keeps `PrestigeState`.
Gain is `floor(sqrt(lifetimeEarned / scale))`, zero below `scale`. Prestige points unlock anime
rosters permanently and in any order the player can afford — no forced progression sequence.

### Abilities

Unlocked two ways, both computed from the owned set in `getUnlockedAbilities`: a single character
that grants one, or owning *every* character a `ComboDefinition` requires. Cooldowns are tracked as
last-used timestamps in a record, not as counters.

## Content

`src/data/sample.ts` is placeholder fixture data (Anime A/B, Character A1…) shaped as `GameData`,
not real content. Real content replaces this file; the engine reads only from the `GameData` passed
into `createGameStore`, so nothing else needs to change.

UI strings are French. The player's click is **le Clic du Narrateur** — keep that name in the UI.
