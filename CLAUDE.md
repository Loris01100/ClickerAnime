# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

It is the **core**: the layer separation, the rules that must never be broken, and a map of where
each system is written up. Everything is loaded into every session, so it stays short on purpose —
the deep rationale per system lives in `docs/`, one file per area, read on demand.

## Commands

- `npm run dev` — Vite dev server
- `npm run build` — `tsc --noEmit` typecheck, then Vite build
- `npm test` — `vitest run` (node environment, only `src/**/*.test.ts`)
- `npm run test:e2e` — critical player journey in Playwright Firefox
- `npm run validate:data` — validates all authored ids, references, arcs and sequel presences
- `npm run check:worker` — dry-run the telemetry Worker and its Analytics Engine binding
- Single test: `npx vitest run src/engine/tests/modifiers.test.ts -t "applies flat, then percent"`
- `npm run sim` — plays a whole run headlessly and prints its pacing (`docs/simulator.md`)

## Keeping the docs true

Three reference files, three remits — keep whichever one a change touches in sync with it, the same
way this file is kept in sync with architecture changes:

- **`CLAUDE.md`** (this file) — layers, invariants, the system map. Update it when an invariant
  changes or a system is added, not for a detail inside one.
- **`design.md`** — visual/UX design intent: art direction per anime, the prestige tree, animation
  conventions, character-art sourcing. **Whenever a change touches design — new panel, palette,
  interaction pattern, the prestige tree, sprite sourcing — re-check it and update it.**
- **`docs/<area>.md`** — how one system actually works and why it was tuned that way. A change to a
  system belongs in its file below.
- `AGENTS.md` — conventions and workflow for an agent working here (commands, tests, the browser).

## Architecture

SolidJS + Vite + TypeScript idle/clicker prototype. Two layers, deliberately separated:

**`src/engine/` — pure logic, no Solid imports**, with exactly two exceptions: `gameState.ts` plus
its `store/` folder, the reactive seam, and `sim.ts`/`sim.cli.ts`, which drive that seam headlessly
and are tooling rather than game rules. Every other file exports plain functions over plain data,
which is why the tests in `src/engine/tests/` run in a node environment with no DOM. Keep new game
rules pure and here; keep them out of components.

**`src/engine/gameState.ts` + `src/engine/store/` — the only reactive seam.** `createGameStore(data)`
holds all signals, wires the pure functions into memos, runs the 200ms tick that accrues passive
income, and autosaves to `localStorage` every 5s plus on `pagehide` (`onCleanup` never runs on a
closed tab, and `beforeunload` doesn't fire on iOS). The tick's elapsed time is clamped to
`MAX_TICK_DELTA_MS`: a sleeping machine or a throttled tab would otherwise hand the first tick back
hours of damage and xp — offline progress by accident, which the game deliberately doesn't have.
Components call its returned actions (`click`, `activateAbility`, `prestigeReset`, …) and read its
accessors.

`gameState.ts` is the **assembler**: it creates the slices below in dependency order, keeps the
state that genuinely spans them (currency, the arc, the enemy on screen, the clock, the pause), owns
the combat loop and the two resets, and returns the one flat store the UI sees. Each slice under
`store/` is a `createX(deps)` taking an explicit dependency object — no slice imports another, so
the creation order below *is* the dependency graph. Where the game really is circular (a portal
respawns the arc's enemy, and `spawnNext` asks the portal first) the cycle is closed **in the
assembler**, by handing the slice a callback: that keeps every cycle in one file where it can be
read. **The store's public surface is unchanged by the split** — components and tests keep calling
`game.<thing>()`, never `game.roster.<thing>()`.

| Slice | Owns |
|---|---|
| `store/content.ts` | Every index derivable from `data` alone — id lookups, origin arcs, portal and item maps. Not reactive; the one slice everything else can take for free |
| `store/notices.ts` | The HUD's bounded pop-up queue, pruned by the tick |
| `store/achievements.ts` | The lifetime ladders and the modifiers they contribute. Created early: `bumpAchievement` is the call every slice makes |
| `store/tree.ts` | Prestige-tree levels and every knob they turn, the "Automatisation" switches included |
| `store/worlds.ts` | Tiers, the power ramp, and the frozen-at-entry re-levelling. Sole writer of `animeEntryDifficulties`/`animeEntryScales` |
| `store/inventory.ts` | Item copies, unique fragments, forge levels, equipment — three lifetimes side by side |
| `store/roster.ts` | The team and the five things that grow it: levels, passive ranks, evolutions, duplicates, catch-up. Plus `awayCharacterIds` |
| `store/abilityState.ts` | Buffs, cooldowns, firing plans. Sole owner of `temporaryModifiers`, the only timed modifier source |
| `store/modifiers.ts` | The fold and its two outputs, `clickPower` and `teamDps` — the balance itself |
| `store/portals.ts` | Crossover portals, with the four rules that keep them out of the balance |
| `store/tower.ts` | La Tour de l'Ascension: the climb, the squad of five, the reward claims, the 15-day cycle — and the only place its fight is resolved |
| `store/saveIO.ts` | When a save may be written, and the guard that makes an import stick. Owns no game state |

Adding state means picking the slice it belongs to, or adding one — not growing the assembler. A new
slice goes after everything it reads and before everything that reads it.

**`src/engine/persistence.ts` — the save trust boundary.** It owns the save shape, validation,
migrations, storage keys and backup recovery. `gameState.ts`'s `buildSaveFile` assembles live
signals into that shape and `store/saveIO.ts` decides when it is written; neither redefines the
format. `GameData` lives in `types.ts` (and is re-exported from `gameState.ts`, which is where the
data files ask for it) so a slice can take the content without importing the assembler.

**`src/ui/` — presentation only, no rules.** `App.tsx` is the 3-column shell modelled on
PokéClicker's density; everything else is an overlay it owns. Each component takes `game: GameStore`
as its only prop. Styling is hand-written CSS split by responsibility under `src/styles/`, imported
in cascade order by `src/styles.css`; no UI framework.
See `docs/ui.md`.

**`src/worker.ts` — one deliberately narrow edge endpoint.** Static assets still bypass code; only
`/api/*` runs the Worker. `/api/telemetry` validates the fixed anonymous event schema and writes
aggregate progression points to Cloudflare Analytics Engine. It owns no save or gameplay state.

## Invariants

These outrank convenience, and several were learned the hard way. Don't break one without saying so.

**Layers**

- Game rules are pure functions in `src/engine/`. Components never compute balance — if a number
  needs deriving, it belongs in the engine and gets exposed on the store (that is why `synergyOf`,
  `costOf`, `damageGrowthOf` and `pendingPrestigeGain` exist).
- `Math.random()` is called **only** in `gameState`. Pure functions take the 0..1 roll as an
  argument (`rollsDrop`, `drawPack`), which is what keeps the odds testable.
- The engine has no user-facing strings; `ui/describe.ts` turns data into French prose.

**Balance**

- The modifier fold order is `(base + flats) * (1 + Σpercents) * Πmultipliers`. Changing it
  rebalances the whole game.
- **A buff is scoped to the character it comes from.** An ability boosts its own character and
  nothing else — which is what lets every ability run at once. Don't make a buff team-wide again,
  and don't reintroduce a `STACK_FALLOFF`, and don't reintroduce combos: the combo mechanic was
  removed, an ability is granted by a character alone.
- **`SCOPED_BUFF_CAP` bounds what the buffs on one character are worth, and it ramps.** Stacked
  multipliers on the same character multiply into an overkill without it — and because it binds
  from arc 2 onward it *is* an ability's strength, not a safety net.
  `scopedBuffCap` climbs it from `SCOPED_BUFF_CAP_FLOOR` (12) on the first arc to the full 50 on the
  last, which is what makes abilities grow over a run instead of arriving at full power. **The
  ceiling stays 50** — raising it re-opens the overkill it exists to stop; the ramp only lowers the
  early game. Moving the floor rebalances the first two thirds of the game: re-run `npm run sim` and
  refit both hp tables (`docs/modifiers.md`).
- A `ModifierTemplate` carries **no id of its own**. Don't reintroduce a per-effect `id`.
- **The "Automatisation" branch automates, it never grants.** Every one of its nodes plays a move
  the player could play by hand — walk to the next arc, fire a ready ability, buy a passive rank,
  re-challenge a boss, open a crossover window — and not one of them hands out damage, currency or
  xp. That is what keeps it out of the balance: the rewards still come from the kills it leads to,
  under the same `MAX_KILLS_PER_SECOND` cap. Its levels buy **cadence or scope, never strength**.
  An automation that granted anything would have to be re-simulated; these don't (`npm run sim` is
  unchanged by the whole branch).
- **A chance node must still be a chance at level 5.** `scaledChance` clamps at 1; a base at or
  above 1/5 silently becomes a guarantee. `src/engine/tests/` guards every chance constant.
- A cleared arc remains a 50-mob boss cycle forever. `arcKills` resets on every boss victory; do not
  turn cleared arcs back into boss-free farms.
- **Boss traits are data, not component branches.** `Enemy.bossTrait` names one readable rule;
  `combat.ts` applies its hp or source-specific damage multiplier, and every estimate uses those
  same helpers. Every production boss has one: a bespoke authored trait wins, otherwise
  `data/bossTraits.ts` supplies a mild rotating preset. A trait must be announced before the boss
  spawns. Do not special-case a boss id in `gameState` or the UI.
- **A boss never recruits its character; a crossover portal does.** 52 of the 55 arcs name their
  boss's character in `Enemy.portalCharacterId`, and nothing in `defeat` reads it: felling the boss clears
  the arc and drops its unique, nothing more. The character is bought with crystals as a **portal** —
  the same boss, re-opened once its arc is cleared, sealed behind `PORTAL_TRAIT` (a 0.5
  `dps-resistance`, so only the click finishes it), with no clock, no payout but the recruit, and hp
  frozen at `PORTAL_SECONDS` of the team's dps *at the moment it was paid for*. Don't put
  `characterId` back on a boss, don't recompute a portal's hp live, and don't give a portal a
  reward: it is won once per character per run, which is the only reason it stays out of the
  balance. The crystals' own rule — a mixed team only — is what makes a first world
  boss-recruit-free by design (`docs/economy.md`).
- **A portal is a 30-second assault, and `PORTAL_SECONDS` is chained to that clock.** The seal only
  lets half the team's dps through, so a portal sized at `PORTAL_SECONDS` of raw dps really takes
  twice that: 12 → 24s inside a 30s window, with the narrator's click as the margin. Raising one
  without the other breaks the mode — at 30 it needed 60s of dps and no portal could be won at all,
  measured by `npm run sim`, which stalled at arc 18 of 55 for want of the recruits they hold.
  Timing out **closes** the portal (the crystals must be paid again) but keeps `portalDamage`, which
  the next opening carries over, clamped below the freshly photographed hp.
- **Only three bosses unlock nobody, and they cannot.** Orochimaru, Pain and Kabuto are each a boss
  in two different arcs; a character is recruitable exactly once, so their second appearance is
  represented by an `evolution`, not a second recruit. Don't "fix" it with a duplicate character.
- **A character's `baseDps` is a ramp times a strength, and only the strength is a design
  statement.** `catchUpGrowth` divides the story's ~1.85x-per-arc ramp back out and re-applies it at
  the arc the player has reached, so an early recruit never becomes dead weight. Two characters
  debuting in the same arc keep their exact ratio forever — that ratio is the only thing the data
  really says. `CATCH_UP` is **0.85** and must stay **below 1**: at 1 the team's dps grows with
  roster size instead of converging. Moving it means refitting both generated hp tables — re-run
  `npm run sim` and expect five passes (`docs/progression.md`).
- **No character's `baseDps` sits below 0.6 of the strongest one debuting in their arc.** That floor
  is what stops the preserved-forever cohort ratio from being a permanent 3.5x gap between two
  characters recruited five minutes apart. It only ever raises a `secondary`, and it is free:
  `arcPowerTable` reads a cohort's **maximum**, so raising a minimum moves no `debutPower`. Hold new
  content to it (`docs/progression.md`).
- **A story ability doesn't travel.** Outside every world a character calls home — their recruitment
  anime, a declared later appearance, or their evolution's once evolved, through the single
  `isHomeArc` test — their passive *and* their active
  ability shut off entirely rather than being malused. `getUnlockedAbilities` won't list the
  ability, so it can't be fired nor automated, and `allModifiers` filters out a buff of theirs still
  running on arrival. A crossover window buys the damage malus back and never these.
- The click is a **trigger, not a damage source**. Character stats lean on `baseDps`, abilities buff
  `teamDps`.
- Currency only ever comes from kills. There is no passive income and no offline progress.
- A pack only draws among characters already recruited in the current run; it never reveals a
  future story character. Existing duplicates still survive prestige while eligibility resets with the roster.
- **Duplicates stop at `MAX_DUPLICATES` (10), and the cap lives in `packPool`.** A character at ten
  copies leaves the pool, so the purchase closes itself — don't add a second check at `openPack` or
  in the panel, and don't uncap `duplicateGrowth`: the bonus is flat per copy and permanent.
- **An accessory never leaves its own universe.** A unique's world is derived from the enemy that
  drops it (`itemAnimeIndex`), never authored on the item, and `canEquipOn` only lets a character
  that world belongs to wear it — the same `isHomeAnime` test that decides whether a story ability
  travels. `Item.equippableBy` narrows on top of that; it never widens.
- Prestige points are only banked by `prestigeReset` (plus the "Destin" node 2 chance), and
  **nothing multiplies what a reset banks**: `applyPrestige` is `calculatePrestigeGain` and nothing
  else. A perk that scaled the whole gain (the old "Faveur du destin") multiplies the very number
  `PRESTIGE_EXPONENT` is tuned to keep flat — don't reintroduce one.
- **A challenge constraint is enforced, never watched.** Every rule in `challenges.ts` is something
  the engine *refuses to do* — no click damage, no ability, no drop, no recruit past the cap — and
  never a condition checked after the fact. There is no "challenge failed" state, and nothing to
  detect: a run under a rule cannot break it. Starting or abandoning a challenge goes through
  `prestigeReset`, so a run played under a rule never survives the rule being dropped.

**La Tour de l'Ascension**

- **The tower is fought by five characters, never by the team.** `towerSquadDps` is
  `characterStatOf` summed over the chosen five — the very column the roster prints — so the panel
  and the roster agree to the bit and there is no second damage model. Don't give the tower its own
  stat pipeline, and don't let it read `teamDps`.
- **Nothing is farmed inside a floor.** A tower kill pays no currency, no xp, no item, no crystal
  and no pack point: `towerEnemy` carries no `characterId`, no `itemId` and a zero `reward`. That is
  why the climb needs no `MAX_KILLS_PER_SECOND` — the cap bounds per-kill rewards, and there are
  none here. The whole payout is the reward floors, once per mode per cycle (`towerClaimKey`).
- **A reward floor never pays strength.** Gold, crossover crystals, pack points and forge fragments,
  all things the player already farms — and never prestige points, which nothing may multiply. A
  tower that granted damage would have to be re-simulated; this one doesn't.
- **The ladder's shape is Summoners War's**: 100 / 100 / 10 floors, three rounds of five, the last
  slot of the last round the boss. It is data (`TOWER_MODES`), so a mode opens by flipping
  `available`. Only `easy` is playable; the other two carry unplayed placeholder multipliers.
- **A floor's hp is an absolute table and its clock is what makes it losable.** Enemies deal no
  damage, so without a timer a floor is only ever "wait longer". There is exactly **one** clock and
  it covers the **whole floor**: `TOWER_FLOOR_TIMER_MS`, **30s** for all fifteen fights, boss
  included. No opponent carries a `timerMs` of its own and the boss re-arms nothing — don't give one
  a per-fight clock. Running out costs the attempt and nothing else; cleared floors stay cleared. It
  is also the mode's first balance knob: halving it doubles the dps every floor asks for.
- The climb is **meta-progression on a 15-day cycle**: `prestigeReset` leaves it alone (it only
  walks out of the floor, since it empties the roster), `hardReset` clears it, and `towerCycleOf` —
  the one place in the game that reads a wall clock — only ever moves forward by whole cycles.
- Its opponents are drawn **deterministically** from the whole cast (`hashSeed`), so floor 37 is the
  same floor for every player and on every attempt. No `Math.random()` here — that stays
  `gameState`'s alone, fragment rewards included.

**Progression**

- Tier is the anime's index in `unlockedAnimeIds`, **frozen at entry**. Never recompute a tier from
  the live completed-count — that is what stops a cleared anime from un-clearing itself.
- **A world the run has outgrown is re-levelled, and its scale is frozen at entry too.** `2.5^tier`
  only ever described a *chain*; an entry world reached late (Hunter x Hunter out of Boruto) is
  authored for a fresh team and the tier is nothing against that gap. `worldEntryDifficulty` anchors
  its opening arc on the heaviest arc already cleared, `relevelledDifficulty` re-profiles the arcs
  after it, `worldEntryScale` shifts its `arcPower` rungs. Three rules hold: the anchor is an
  `arcWeight` (mobs included, never the boss alone); it is discounted by `BORDER_CLIFF` when the arc
  it reads was cleared *at home*; and a re-levelled world's **own cast is never scaled** — scaling it
  runs away, since a visitor's recruit lands in an endgame stack of levels and passives. A world
  authored above the player comes out at exactly its tier, so the authored chain is untouched
  (`docs/progression.md`).
- **Every entry world ends at roughly the same `arcPower`.** `reachedArcPower` is one scalar for the
  whole game, so where a player's *first* world leaves them sets the difficulty of every world after
  it — Naruto ends at 78, Hunter x Hunter and Horimiya at 120, Bleach at 125, and Shippūden opens at 130. A long
  entry world flattens its debut-power ramp to stay inside that budget; a sequel world keeps ~1.85x
  because it starts where the previous one left off (`docs/progression.md`).
- Evolution stages only look **forward** in a universe's reading order: every entry in
  `evolutions` must target the direct sequel of the preceding stage and replace its ability.
- A character belongs to exactly one recruitment world. Later appearances never create another
  recruit. Regular characters are recruitable in exactly one arc — as a mob that joins when it
  falls, or, for a boss's character, through the one crossover portal that arc opens;
  shop-exclusive companions must have exactly one character offer instead.
- `prestigeReset` wipes the run but spares the meta-progression: prestige points, passive ranks,
  unique forge levels, achievement counts, prestige-tree levels, pack points and duplicates. Only
  `hardReset` clears those.

**Persistence**

- Bump `SAVE_KEY` only when the shape **breaks** — a new optional field is absorbed by the `?? []`
  defaults. Bumping wipes every existing player's save; treat it as a last resort.
- `importSave` is a real trust boundary: it runs a player-supplied file through `isValidSave` and
  writes it straight to `localStorage`.
- Every primary write rotates the previous valid save into `SAVE_BACKUP_KEY`. Invalid primary data
  falls back to that backup at boot; hard reset alone clears both slots.
- Combat state (current enemy, hp left, timer deadline) is deliberately **not** saved. The one
  exception is a crossover portal's `portalHp`/`portalDamage`: that is progress towards a recruit,
  not the enemy on screen, and a portal is meant to be fought in several sittings. Which portal was
  being fought is still transient.

**Telemetry**

- Nothing is sent until explicit consent. Never add a player, device, installation or session id.
- The schema is a fixed milestone allowlist. Reject unknown fields at the Worker boundary and never
  persist IP addresses, user agents, saves or free-form player text.
- Progression milestones carry accumulated active-play minutes from one local stopwatch. Closed,
  sleeping and hidden tabs do not advance it; only a half-minute bucket is sent, once per milestone,
  after consent.

**UI**

- Never hard-code a colour in a rule. Every colour comes from a token defined in the bare `:root`
  block, so the light/dark flip works.
- A component never builds a colour string: it sets `--world-hue` on a container and the imported
  CSS modules do the rest.
- UI strings are French. The player's click is **le Clic du Narrateur** — keep that name in the UI.
- **A pending `Sprite` portrait must never suspend its ancestor.** `App.tsx` has one `<Suspense>`
  around every deferred overlay, so reading the resource while it loads detached the whole overlay
  from the DOM — 43% of the time in the tower, which changes opponent every second or two. `Sprite`
  tests `portrait.state` before reading the value, and its `.sprite-empty` placeholder is the one
  thing a pending lookup may change on screen. Don't go back to a bare `portrait()`, and preload
  (`portraitUrl`) on any screen that runs through portraits quickly (`docs/ui.md`).

## The systems

One file per area under `docs/`. Each carries the full rationale and the tuning history.

| Area | File | What it covers |
|---|---|---|
| Combat | `docs/combat.md` | The arc loop, overkill carry-over, `MAX_KILLS_PER_SECOND`, boss timers, how steep a world's hp table has to be, the narrator's click |
| Progression | `docs/progression.md` | Levels and xp, world/arc unlocking and tiers, synergy, evolutions |
| Economy | `docs/economy.md` | Items and passive ranks, prestige, the 30-node prestige tree (automation included), run challenges, crossover crystals, packs and duplicates, achievements, the shop |

Every production character has at least one `tags` entry. These types are shown in the Codex and are
the shared vocabulary for equipment restrictions; add their French label in `ui/describe.ts`.
| Modifiers | `docs/modifiers.md` | The `ActiveModifier` pipeline and its three sources; abilities, cooldowns and the same-stat lock |
| UI | `docs/ui.md` | The 3-column shell and overlays, world maps, AniList portraits and banners, `Sprite`, per-world hue, theming |
| Persistence | `docs/persistence.md` | The `SaveFile` shape, versioning, export/import |
| Telemetry | `docs/telemetry.md` | Opt-in progression milestones, Worker validation, Analytics Engine schema and queries |
| Content validation | `docs/content-validation.md` | Semantic validation of ids, references, recruitment and sequel presence |
| Simulator | `docs/simulator.md` | `npm run sim`: playing a run headlessly to check a balance change |
| Tour de l'Ascension | `docs/tower.md` | The 100-floor climb beside the story: the ladder, the squad of five, the floor clock, the reward tiers, the 15-day cycle |

## Content

`src/data/` holds the real content, **one directory per world** plus `index.ts`, which is the only
thing the app imports (`gameData` = every world concatenated). Adding a world means adding a
directory and one entry to the `worlds` array there.

A world directory is always the same three files — `arcs.ts`, `characters.ts`, `items.ts` — each
exporting one `GameData["<section>"]` array, plus an `index.ts` that holds the short `animes` entry
and assembles them into the world's `GameData`. The layout is uniform on purpose, whatever a world's
size: a predictable path (`data/<world>/characters.ts`) is the point, and it matches how the content
is actually edited — you balance characters, or write arcs, rarely a whole world at once. Keep the
shape when adding a world; omit a file only when the world genuinely has no such section.

- `naruto/` — **Naruto, partie 1**, 5 arcs, the starting world. Nothing from Shippūden or Boruto.
- `hunter-x-hunter/` — **Hunter x Hunter (2011)**, 6 arcs and one independent entry world. It
  covers the animated story from the Hunter Exam through the Chairman Election; the unadapted Dark
  Continent is intentionally absent. Like Naruto, its opening-world balance is hand-authored.
- `bleach/` — **Bleach**, 15 arcs and the third independent entry world, and by far the longest of
  the three. It is the anime's full arc list in broadcast order, anime-original arcs included (the
  Bounts, captain Amagai, the Zanpakutô tales, the Gotei 13 Invading Army); the last arc, "la Guerre
  sanglante Millénaire", is the arc the manga calls "Arc Quincy" — the same story under two names,
  so it appears once. Hand-authored like the other entry worlds. **Its recruits' `baseDps` ramps
  only ~1.24x an arc where every other world runs ~1.85** — an entry world has a power *budget*, not
  just a ramp (`docs/progression.md`); don't "fix" it upward.

- `horimiya/` — **Horimiya**, 6 arcs and an independent entry world. The 2021 adaptation and
  **The Missing Pieces** share one chronological route; its abstract social encounters use
  `Anime.presentation` to change UI vocabulary without changing combat rules or save data.
  **This world is in alpha and still under test**: its arcs, recruits, items and encounter
  vocabulary are provisional and may still move or be pulled. Don't take its numbers as a
  reference when balancing another world, and expect its content to change. The player is told —
  `Anime.alpha` (data, never an id check) paints an "Alpha" pill wherever the world is named and a
  warning line in its portal dossier; clearing the flag is what ships the world (`docs/ui.md`).
- `boruto/` — **Boruto**, 8 arcs, the last world and the hardest: ~5.4 minutes an arc against
  Shippūden's ~2.3. Generated from a table like Shippūden, on the **same** ramps (boss hp ~2.31,
  mob hp ~2.17, rewards and recruit stats ~1.85) — it needed its own steeper table only before
  `CATCH_UP` stopped the dps ramp depending on how deep the roster is.
  Its `name` is deliberately the short one — see `design.md`. Only new faces are recruitable here:
  the new generation, Kara and the Ôtsutsuki.
- `shippuden/` — **Naruto Shippūden**, 15 arcs, deliberately the long one: it is the climax of the
  Naruto worlds. Generated from a table, on **three ramps per arc**: boss hp ~2.34, mob hp ~2.18,
  rewards and recruit stats ~1.85. Keep all three when editing — the hp ones track how fast the
  team's dps actually grows (measured, not guessed: `docs/combat.md`), and the reward one is what
  keeps the economy where it was. A world added after this one needs its own ramps **measured
  again** rather than copied from here — and sized against the dps the team has *after* crossing the
  border, which is far below what it ends the previous world with (`docs/combat.md`).

A character belongs to exactly one recruitment world. `appearanceAnimeIds` keeps story abilities
active in later series without duplicating the recruit; `fullSynergyAnimeIds` is reserved for a
character who spans a later anime strongly enough to receive 1.0 throughout it. Regular characters are recruitable in exactly one arc — a mob recruits on defeat, a boss only through its crossover portal;
shop-exclusive companions are instead covered by one character offer (`src/engine/tests/` enforces
those entry paths, along with every
id being unique and every reference resolvable). A mixed team still spans worlds — the team only
wipes on prestige, not on travel. Every Naruto-universe character declared in
`appearanceAnimeIds` receives one successive evolution per later series, regardless of rarity. A
character present in all three series therefore unlocks two stages while remaining one recruit and
one Codex entry; see `docs/progression.md`. Characters without a declared later appearance, such as
Kimimaro, do not evolve.
