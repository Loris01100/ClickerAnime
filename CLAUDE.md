# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Vite dev server
- `npm run build` — `tsc --noEmit` typecheck, then Vite build
- `npm test` — `vitest run` (node environment, only `src/**/*.test.ts`)
- Single test: `npx vitest run src/engine/engine.test.ts -t "applies flat, then percent"`

## Design

`design.md` is the reference for visual/UX design intent (art direction per anime, the prestige
tree, animation conventions, character-art sourcing). **Whenever a change touches design — new
panel, palette, interaction pattern, the prestige tree, sprite sourcing — re-check `design.md`
and update it**, the same way this file is kept in sync with architecture changes.

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
full character list, met or not, with stats, the passive at level 0 / at cap / right now, abilities,
evolution and combos. Each component takes `game: GameStore` as its only
prop. A panel is `.panel` + `.panel-head` (title left, a count/chip/select right); compact tables are
a `.table-head` row over rows sharing the same grid class, inside a `.scroll` box.

**Portraits are fetched live from AniList, in the player's own browser.** `ui/anilist.ts` is a
small best-effort client: `portraitUrl(name, kind)` queries `graphql.anilist.co` by character or
anime *name* (not id — every `Character`/`Enemy`/`Anime` already carries a human-readable `.name`,
which is what an AniList search needs), deduping concurrent lookups in memory and persisting hits to
`localStorage` (`clicker-anime:portraits:v1`) so a returning player isn't re-fetching the same
portraits every reload — character art never changes, so entries never expire. Calling AniList from
a server/Worker gets a `403` (shared cloud egress IPs are blacklisted); calling from each player's
own browser is exactly what AniList's CORS is for, confirmed against the sibling project
[Rasengames](https://github.com/Loris01100/Rasengames)'s `public/js/anilist.js`, which hit that wall
first. `portraitUrl` never rejects — network error, timeout, AniList's 404-on-no-match, malformed
JSON and a full `localStorage` all resolve to `null`, since there is no `<ErrorBoundary>` anywhere
to catch a rejected `createResource`. A handful of in-game French names don't match AniList's
canonical spelling (the old dub's "Uchiwa" vs AniList's "Uchiha") — corrected via `NAME_OVERRIDES`
in `anilist.ts`, not by changing the name shown in the UI.

`ui/Sprite.tsx` wraps this in a `createResource` keyed on `kind:name`; `<Show>` renders the resolved
`<img>` (scaled with `object-fit: contain` into a box sized by `px`) or, while pending or once
resolved to nothing, an empty `.sprite-empty` placeholder of the same size — never a layout shift,
never a broken image. `ui/hue.ts` holds the unrelated `spriteHue(seed)` used to tint `WorldMap.tsx`'s
background per world — it has nothing to do with portraits, kept separate on purpose.

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

Levels come from **xp earned in combat**: every kill grants the whole team xp equal to `XP_PER_KILL_REWARD`
times the kill's currency reward, so it scales with the world the same way currency does. The
multiplier sits well above 1x on purpose — level has no cap, and a flat 1:1 income gets swallowed by
the xp curve (`XP_BASE`/`XP_GROWTH` in `growth.ts`) after a few dozen levels, stalling leveling out
and leaving a character's level worth nothing next to their ability. Only the xp total is stored —
`levelOf` derives the level from it via `levelFromXp`, so level and xp cannot drift apart. Xp dies
with the team on `prestigeReset`.

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
- **unique** — carried by bosses, guaranteed, one copy only. Each owned unique can be equipped on
  one character at a time (`characterEquipment` in the save). Equipped uniques grant permanent
  `ModifierTemplate` effects (`Item.effects`) that are merged into `characterContributions` and scaled
  by synergy just like base stats and passives. An item may restrict who can wear it via
  `Item.equippableBy` (character ids, anime ids, or character tags).

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
rebalances the whole game. Modifiers come from three sources, merged in `allModifiers`:

1. **Owned characters** → `characterContributions` converts base stats + innate passive + any
   equipped unique item (`Item.effects`) into modifiers, each pre-scaled by the character's synergy
   with the active arc.
2. **Activated abilities** → temporary modifiers stamped with `expiresAt`, pruned on every tick.
3. **Equipped unique items** → permanent modifiers contributed by `characterContributions`; the
   equipment mapping lives in `gameState` (`equipItem`, `unequipItem`, `equippedItemOf`).

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
scales both `clickPower` and `teamDps` contributions: a character deals full damage in their own arcs
(`matchingArcMultiplier`, 1.0), weaker in other arcs of their own anime (`sameAnimeMalus`, 0.85),
weakest in another anime's arc (`otherAnimeMalus`, 0.5). Tuning `defaultSynergyConfig` is the main
balance knob. Outside their own anime entirely, `characterContributions` also drops the passive
altogether (not just malused) — it's a story ability, it doesn't travel to another anime's arc. An
evolved character is the one exception — see below.

### Evolutions

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

### Persistence

The save is a flat `SaveFile` in `localStorage` under the key `clicker-anime:save:v10`.
`readSave` shape-checks it
(via `isValidSave`) and falls back to a fresh run rather than throwing, so an old save can never
brick the boot. Bump the key version when the shape *breaks* — an old field renamed or retyped, not a
new optional field, which `?? {}`/`?? []` defaults already absorb without a bump; bumping wipes every
existing player's save (a new key means the old one is never read again), so treat it as a last
resort. `gameState`'s `buildSaveFile` is the one place the on-disk shape is assembled, shared by
`save`, `exportSave` and `importSave` so they can never drift apart. `exportSave` base64-encodes the
same `SaveFile` into a portable blob (`App.tsx` hands it to the browser as a `.txt` download);
`importSave` decodes and shape-checks it exactly like `readSave`, then writes straight to
`localStorage` and reloads the page — simplest way to get every signal back in sync without exposing
a setter per field. There is no offline-progress catch-up.

### Prestige

`prestigeReset()` wipes everything but the prestige points, the achievement counts and the prestige
tree ranks (see below): currency, roster, xp, items, equipment, passive ranks, kills, cleared arcs
and the worlds entered. Gain is `floor(sqrt(lifetimeEarned / scale))`, zero below `scale`; both `scale` and a
double-gain chance are perks of the tree's "Ressource" branch, see below. Points are spent two ways:
`unlockAnime`, the paid early entry which has to be re-bought each run, and the prestige tree, which
is permanent.

### The prestige tree (`prestigeTree.ts`)

Five independent branches — Clic du Narrateur, DPS Équipe, XP, Objets, Ressource — each a column of
5 nodes, and **each node is rebuyable up to 5 levels**, every level repeating the exact same effect
(e.g. node 1's "+8% click damage" stacks to +40% at level 5). A node unlocks as soon as its
predecessor has **just one level** bought (`isNodeUnlocked`), not once it's maxed — so several
nodes of a branch are often purchasable, and levelling, at the same time; only a node's own 5
levels are strictly sequential (`purchaseNodeLevel` refuses to skip one). Every level, of every
node, costs `2, 3, 5, 8, 13` prestige points depending only on its position *within its node*
(~×1.6 growth, the same ratio as `passiveRankCost` but reset at the start of each node rather than
escalating across the whole branch) — a maxed node costs 31 points, a maxed branch 155, all five
775.

`gameState` keeps one 5-entry level array per branch in `prestigeTreeRanks`
(`Record<categoryId, number[]>`, index = position - 1) — a signal of its own, not a field on
`PrestigeState`: `prestige.ts` stays a pure `{ prestigePoints, unlockedAnimeIds }` testable without
knowing the tree exists. A flat single number per branch can't represent "node 1 at 2/5, node 3 at
1/5, the rest at 0" once a node unlocks the next at just 1 level, hence the array. `nodeLevel(levels,
position)` reads one node's level (0..5); `nodeLevelOf(categoryId, position)` is `gameState`'s
wrapper over it, `isNodeUnlockedFor`/`nodeCostOf` the equivalents for a node's unlock state and
next-level price. `prestigeTreeRanks` survives `prestigeReset` exactly like `achievementCounts`
does, wiped only by `hardReset`.

Only two of the 25 nodes are `ActiveModifier`s: node 1 of Clic du Narrateur and of DPS Équipe, a
flat `clickPower`/`teamDps` percent multiplied by the node's level, folded into `allModifiers` via
`prestigeTreeContributions` next to `achievementContributions`. Every other node is read directly
at its point of use, its magnitude scaled by `nodeLevelOf(...)` — `ModifierTarget` was deliberately
**not** widened to cover them, since things like an autoclick interval, a crit chance or a
pity-timer threshold have no `base` for `computeEffectiveStat` to operate on. Chance- and
discount-style effects are clamped (`scaledChance`, `scaledDiscount`) so a high level can never
push a chance past 100% or a cost to zero; the xp curve has its own floor (`MIN_XP_GROWTH`) so it
can never stop being geometric:

- **Clic du Narrateur** — click percent (node 1); an autoclick every 2s, at a level-scaled fraction
  of click power (node 2, driven by the main tick's `autoClickAccumMs`); crit chance (node 3);
  shaves time off every unlocked ability's cooldown on each click, scaled by level (node 4); a
  chance to fire a random unlocked ability for free, via `triggerAbilityEffects` (node 5, shared
  with abilities' normal activation path).
- **DPS Équipe** — teamDps percent (node 1); boosts an activated ability's percent/multiplier
  effects, via `buildAbilityModifiers` (node 2); softens the active arc's synergy malus further per
  level, via `softenedSynergyConfig` wrapping `defaultSynergyConfig` (node 3); stretches an
  ability's buff duration (node 4); extends a boss's `timerMs` (node 5).
- **XP** — xp-per-grant percent, applied inside `grantXp` so every source benefits (node 1); a
  passive xp trickle each tick regardless of combat (node 2); flattens the level curve further per
  level by handing a reduced growth constant into `levelFromXp`/`xpProgress` (node 3, see
  `growth.ts`'s optional `growth` param); a newly recruited character gets a flat xp head start,
  via `grantXpTo` (node 4); boss kills grant extra xp on top of the usual multiple of their reward
  (node 5).
- **Objets** — boosts the effective `dropChance` passed into `rollsDrop` (node 1); discounts
  `passiveRankCost` (node 2, see its optional `discount` param); a chance at a bonus copy on top of
  a successful common drop (node 3); a pity timer — `killsSinceDrop` per arc forces a common after
  a streak that shortens by a fixed amount per level (node 4); a small chance an item-less enemy
  hands over the arc's common anyway (node 5).
- **Ressource** — currency-per-kill percent (node 1); lowers the `scale` `calculatePrestigeGain`
  uses, further per level (node 2); adds to `PRESTIGE_PER_ARC_CLEAR` per level (node 3); discounts
  an anime's `unlockCost` (node 4); a chance to double the points a `prestigeReset` banks, rolled
  in `gameState` and passed as `applyPrestige`'s `gainMultiplier` so `prestige.ts` itself stays
  free of randomness (node 5).

`PrestigeTree.tsx` is the built UI — see `design.md` §5 for its node anatomy and layout. Its
`icon()` helper in `ui/icons.tsx` needed a fix while building it: `body` must be a factory
(`() => JSX.Element`), not a materialized JSX value — Solid's JSX makes real DOM nodes, so a value
evaluated once at module load is one shared node that only the last simultaneous on-screen instance
keeps (25 nodes reusing 5 icons made this obvious, but any icon rendered more than once at a time,
e.g. `IconLock` on several locked map nodes, was equally affected).

### Abilities

Unlocked two ways, both computed from the owned set in `getUnlockedAbilities`: a single character
that grants one, or owning *every* character a `ComboDefinition` requires. Cooldowns are tracked as
last-used timestamps in a record, not as counters.

### Achievements (`achievements.ts`)

Five countable actions — mobs killed, bosses killed, characters recruited, common items collected,
abilities activated — each with its own ladder of tiers (`ACHIEVEMENT_CATEGORIES`). `gameState` keeps
one lifetime counter per category (`achievementCounts`, bumped by `bumpAchievement` at the point of
the event: `defeat` for kills and recruits, `maybeDropItem` for commons only — uniques don't count,
`activateAbility` for activations). Counts only ever go up, even when the thing counted can later be
spent (a common item collected still counts once it's spent ranking up a passive), because the
achievement is about the action having happened, not a stock still held.

Each completed tier folds into `allModifiers` as a permanent `clickPower` percent bonus
(`achievementTierBonus`, geometric growth — early tiers are a taste, late ones matter), through
`achievementContributions` exactly like any other modifier source. Unlike almost everything else,
achievement counts are **not** wiped by `prestigeReset` — they are meta-progression in the same spirit
as prestige points, meant to keep paying off across runs. Only `hardReset`, the full-wipe button,
clears them.

### Shop (`shop.ts`)

`ShopOffer`s spend the main currency (never prestige points) on either copies of an item or a
character not yet owned — `data.shop`, an optional `GameData` field so older test fixtures don't
need one. `shopOfferUnlocked`/`canBuyShopOffer` are pure; `gameState`'s `shopOffers()` folds in the
live item/character lookup plus `locked`/`owned`/`affordable` for the panel to read, and
`buyShopOffer` is the only place currency actually changes hands. An offer's `requiresAnimeId` is
the only gate (an anime already **cleared** — `animeCleared`, same as everywhere else); with none
set, a high `cost` is the only barrier. Buying a character just calls the same `setOwnedCharacterIds`
path `defeat` uses, so it is run-scoped exactly like a combat recruit: wiped by `prestigeReset` along
with the currency that paid for it, same as the rest of a run. A character bought here must still be
recruitable in a fight somewhere — `engine.test.ts`'s "recrutable nulle part" check covers
`gameData.characters` regardless of a shop offer existing, so a shop character is always a paid
shortcut to someone reachable in combat too, never an exclusive recruit.

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
part 1, plus the Shippūden Kage) worth keeping a mixed team for. Every part-1 `rarity: "main"`
character who is still part of the Shippūden cast (Naruto, Kakashi, Sasuke, Neji, Jiraiya, Tsunade,
Gaara) gets stronger once fought alongside there — see [Evolutions](#evolutions) — but that's the
same Codex entry growing, never a new recruit. Secondary-rarity part-1 characters get no evolution
even when they do appear in Shippūden (Rock Lee, Shikamaru, Hinata, Temari, Kankurô, Shizune, Chôji,
Kiba), and Sakura is the one secondary-rarity exception, kept from an earlier pass. Kimimaro, also
`"main"`, is excluded on purpose: he dies at the end of part 1 and is never part of the Shippūden
cast.

UI strings are French. The player's click is **le Clic du Narrateur** — keep that name in the UI.
