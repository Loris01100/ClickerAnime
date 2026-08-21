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

**`src/ui/` — presentation only, no rules.** `App.tsx` is the 3-column shell modelled on
PokéClicker's density: many small stacked panels, everything visible at once, no modals. Left is the
roster (abilities, sortable team table, item table), middle is resources + the fight + the world
map, right is the arc lists per world plus travel and prestige. `Codex.tsx` is the one overlay: the
full character list, met or not, with stats, the passive at level 0 / at cap / right now, abilities
and combos. Each component takes `game: GameStore` as its only
prop. A panel is `.panel` + `.panel-head` (title left, a count/chip/select right); compact tables are
a `.table-head` row over rows sharing the same grid class, inside a `.scroll` box.

**Pixel art is generated, not authored — until a file says otherwise.** `ui/pixel.ts` turns any id
into a stable mirrored sprite (FNV-1a hash seeding an xorshift32 fill), rendered as SVG rects by
`ui/Sprite.tsx`. Same id always gives the same sprite, which is what makes it usable as an identity
— pass a character id, an enemy id or a boss id. `Sprite.tsx` checks `src/assets/sprites/<id>.*`
first (via `import.meta.glob`, eager) and only falls back to the generated grid when no file matches;
real art is scaled with `object-fit: contain` into the exact box the placeholder would have used, so
dropping a file in never shifts layout. Adding real art for an id is therefore just adding the file —
see `src/assets/sprites/README.md` for the naming rule. Note the filename casing: `pixel.ts` and
`Sprite.tsx` must not collide on case-insensitive filesystems.

**`ui/describe.ts`** turns a `ModifierTemplate` or `AbilityDefinition` into French prose. It lives in
`ui/`, not the engine — the engine has no user-facing strings.

**Theming.** Light and dark both ship, in the usual three states: bare `:root` holds the light
palette, and the dark palette is repeated twice — once under `prefers-color-scheme: dark` guarded by
`:root:not([data-theme="light"])`, once under `:root[data-theme="dark"]` — so the explicit toggle
wins in both directions. `ui/theme.ts` owns the `data-theme` attribute and remembers the choice in
`localStorage`; "system" stamps no attribute at all. Every colour must come from a token defined in
the bare `:root` block: gradients, the sticky topbar tint and the bar-label text-shadow are all
tokenised (`--stage-bg`, `--topbar-bg`, `--label-shadow`, `--active-tint`) precisely because they
have to flip. Never hard-code a colour in a rule. Components must never compute balance themselves — if a number needs deriving, it belongs in
the engine and gets exposed on the store (that is why `synergyOf`, `costOf` and `pendingPrestigeGain`
exist). Styling is one hand-written `src/styles.css` with CSS variables; no UI framework.

### The combat loop

An arc is a zone the player fights through. `combat.ts` is pure and decides who shows up next:
cycle `arc.mobs` in order until `mobsToBoss` kills, then `arc.boss`; once the arc is cleared the boss
stops appearing and the zone farms mobs forever. Mobs carrying a `characterId` are the anime's
characters — beating one adds them to the team for free, and they drop out of the pool afterwards.
Enemies carrying an `itemId` may hand it over — see the narrator's click below.

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
  (`levelGrowth(level) = 1 + level * LEVEL_DAMAGE_STEP` applied to `baseClickPower` and `baseDps`).
  Linear on purpose; `LEVEL_DAMAGE_STEP` is the pacing knob for how fast damage outruns enemy hp.
- **The passive has nothing to do with levels**: it is ranked up with items, see below.
  `PASSIVE_LEVEL_CAP` is the rank cap — 10 for `rarity: "main"`, 5 for `"secondary"`.

Levels come from **xp earned in combat**: every kill grants the whole team xp equal to the kill's
currency reward (one number to balance, and it already scales with the world). Only the xp total is
stored — `levelOf` derives the level from it via `levelFromXp`, so level and xp cannot drift apart.
Xp dies with the team on `prestigeReset`.

### The narrator's click

`narratorClickPower(allyCount)` is the *base* fed into the `clickPower` pipeline: it rises with the
number of allies in the team and with nothing else. The click is a **trigger, not a damage source** —
it is there to fire abilities; the team's `teamDps` is what kills things. Keep it that way when
tuning: character stats lean on `baseDps`, and abilities buff `teamDps`.

### Items and passives

Items deal no damage at all. They are the passive currency, hung off `Enemy.itemId` and separated by
`Item.kind`:

- **common** — carried by ordinary mobs with a `dropChance`, and they **stack**. Each arc has exactly
  one common, and it is the only thing that ranks up the passives of the characters *met in that arc*
  (`passiveItemOf` finds it by walking back to the arc whose mobs recruit the character). This is the
  whole point: deepening a passive means travelling back to that zone and farming it.
- **unique** — carried by bosses, guaranteed, one copy only. **On hold**: they drop and are listed,
  and do nothing until they get their own idea.

Ranks are **bought, not derived**: `rankUpPassive(character)` spends `passiveRankCost(rank + 1)`
copies (geometric: 6, 9, 14, 21, 31, …) and stores the new rank in `passiveRanks`, so the player
chooses which character of an arc gets the copies. `passiveUpgradeOf` is what the UI reads — rank,
cost, copies held, affordable. Rank 0 means the passive is **locked** and contributes nothing, rank 1
is the passive as printed in the data, and every rank past it deepens it by `LEVEL_DAMAGE_STEP`.
Ranks and the items that paid for them are run-scoped: `prestigeReset` wipes both.

`rollsDrop(enemy, roll)` takes the 0..1 draw as an argument; `Math.random()` is called only in
`gameState`, which keeps the odds testable.

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

`prestigeReset()` wipes everything but the prestige points: currency, roster, xp, items, passive
ranks, kills, cleared arcs and the worlds entered. Gain is `floor(sqrt(lifetimeEarned / scale))`,
zero below `scale`. Points are only spent on `unlockAnime`, the paid early entry, which now has to be
re-bought each run — the planned global skill tree is what they are meant to feed.

### Abilities

Unlocked two ways, both computed from the owned set in `getUnlockedAbilities`: a single character
that grants one, or owning *every* character a `ComboDefinition` requires. Cooldowns are tracked as
last-used timestamps in a record, not as counters.

## Content

`src/data/` holds the real content, one file per world plus `index.ts`, which is the only thing the
app imports (`gameData` = every world concatenated). Adding a world means adding a file and one entry
to the `worlds` array there.

- `naruto.ts` — **Naruto, partie 1**, 5 arcs, the starting world. Nothing from Shippūden or Boruto.
- `shippuden.ts` — **Naruto Shippūden**, 15 arcs, deliberately the long one: it is the climax of the
  Naruto worlds. Generated from a table, so its hp, rewards and recruit stats all ramp by the same
  ~1.85 per arc — keep that ratio when editing, it is what keeps the pace flat while the numbers
  explode. Boruto is meant to come last and hardest.

A character belongs to exactly one world and is recruitable in exactly one arc: Shippūden reuses no
one from part 1, it introduces new faces only (`engine.test.ts` enforces both rules, along with every
id being unique and every reference resolvable). Combos may still span worlds — the team only wipes
on prestige, not on travel — which is what makes "Le Sommet des Cinq Kage" (Gaara and Tsunade from
part 1, plus the Shippūden Kage) worth keeping a mixed team for.

UI strings are French. The player's click is **le Clic du Narrateur** — keep that name in the UI.
