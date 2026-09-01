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

**`src/engine/` — pure logic, no Solid imports**, with exactly two exceptions: `gameState.ts`, the
reactive seam, and `sim.ts`/`sim.cli.ts`, which drive that seam headlessly and are tooling rather
than game rules. Every other file exports plain functions over plain data, which is why
the tests in `src/engine/tests/` run in a node environment with no DOM. Keep new game rules pure and here; keep
them out of components.

**`src/engine/gameState.ts` — the only reactive seam.** `createGameStore(data)` holds all signals,
wires the pure functions into memos, runs the 200ms tick that accrues passive income, and autosaves
to `localStorage` every 5s plus on `pagehide` (`onCleanup` never runs on a closed tab, and
`beforeunload` doesn't fire on iOS). The tick's elapsed time is clamped to `MAX_TICK_DELTA_MS`: a
sleeping machine or a throttled tab would otherwise hand the first tick back hours of damage and xp
— offline progress by accident, which the game deliberately doesn't have. Components call its
returned actions (`click`, `recruitCharacter`, `activateAbility`, `prestigeReset`, …) and read its
accessors.

**`src/engine/persistence.ts` — the save trust boundary.** It owns the save shape, validation,
migrations, storage keys and backup recovery. `gameState.ts` assembles live signals into that shape
but does not redefine the format.

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
- Prestige points are only banked by `prestigeReset` (plus the "Destin" node 2 chance).
- **A challenge constraint is enforced, never watched.** Every rule in `challenges.ts` is something
  the engine *refuses to do* — no click damage, no ability, no drop, no recruit past the cap — and
  never a condition checked after the fact. There is no "challenge failed" state, and nothing to
  detect: a run under a rule cannot break it. Starting or abandoning a challenge goes through
  `prestigeReset`, so a run played under a rule never survives the rule being dropped.

**Progression**

- Tier is the anime's index in `unlockedAnimeIds`, **frozen at entry**. Never recompute a tier from
  the live completed-count — that is what stops a cleared anime from un-clearing itself.
- **Every entry world ends at roughly the same `arcPower`.** `reachedArcPower` is one scalar for the
  whole game, so where a player's *first* world leaves them sets the difficulty of every world after
  it — Naruto ends at 78, Hunter x Hunter and Horimiya at 120, Bleach at 125, and Shippūden opens at 130. A long
  entry world flattens its debut-power ramp to stay inside that budget; a sequel world keeps ~1.85x
  because it starts where the previous one left off (`docs/progression.md`).
- Evolutions only ever look **forward** in a universe's reading order: `evolution.animeId` must be a
  sequel anime, enforced in `src/engine/tests/`.
- A character belongs to exactly one recruitment world. Later appearances never create another
  recruit. Regular characters are recruitable in exactly one arc;
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
- Combat state (current enemy, hp left, timer deadline) is deliberately **not** saved.

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
character who spans a later anime strongly enough to receive 1.0 throughout it. Regular characters are recruitable in exactly one arc;
shop-exclusive companions are instead covered by one character offer (`src/engine/tests/` enforces
those entry paths, along with every
id being unique and every reference resolvable). A mixed team still spans worlds — the team only
wipes on prestige, not on travel. Every part-1 `rarity: "main"`
character who is still part of the Shippūden cast (Naruto, Kakashi, Sasuke, Neji, Jiraiya, Tsunade,
Gaara) gets stronger once fought alongside there — see `docs/progression.md` — but that's the same
Codex entry growing, never a new recruit. Secondary-rarity part-1 characters get no evolution even
when they do appear in Shippūden (Rock Lee, Shikamaru, Hinata, Temari, Kankurô, Shizune, Chôji,
Kiba), and Sakura is the one secondary-rarity exception, kept from an earlier pass. Kimimaro, also
`"main"`, is excluded on purpose: he dies at the end of part 1 and is never part of the Shippūden
cast.
