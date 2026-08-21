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

### The modifier pipeline

Everything that affects a stat becomes an `ActiveModifier`, and `computeEffectiveStat` folds them:
`(base + flats) * (1 + Σpercents) * Πmultipliers`. That order is a balance decision — changing it
rebalances the whole game. Modifiers come from two sources, merged in `allModifiers`:

1. **Owned characters** → `characterContributions` converts base stats + innate passive into
   modifiers, each pre-scaled by the character's synergy with the active arc.
2. **Activated abilities** → temporary modifiers stamped with `expiresAt`, pruned on every tick.

Expiry is checked both in `pruneExpired` and again inside `computeEffectiveStat`, so a stale list
can never inflate a stat.

### Synergy

`synergyMultiplier` is the core mechanic: a character is strong in their own arcs
(`matchingArcMultiplier`), weaker in other arcs of their own anime (`sameAnimeMalus`), weakest in
another anime's arc (`otherAnimeMalus`). Tuning `defaultSynergyConfig` is the main balance knob.

### Economy & persistence

`recruitCost(character, ownedCount)` derives a price from the character's raw worth then scales it
`1.35^ownedCount`, so each recruit costs more than the last — the main pacing knob. Costs are never
passed in from the UI; `recruitCharacter(id)` computes and charges them itself.

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

UI strings in `App.tsx` are French.
