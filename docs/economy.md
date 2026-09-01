# Economy

Everything the player spends: item copies, prestige points, crossover crystals, pack points and
gold — and the two ladders (achievements, the prestige tree) that pay out across runs.

Enemy gold is paid at `CURRENCY_REWARD_MULTIPLIER` (**75%**) of the reward stored in the data.
`lifetimeEarned` receives that same reduced amount, while combat XP keeps using the raw reward so
an economy adjustment does not also slow character levels. « Sens du commerce » then adds **5% per
level** to this payout (25% at rank 5).

## Items and passives

Items deal no damage at all. They are the passive currency, hung off `Enemy.itemId` and separated by
`Item.kind`:

- **common** — carried by ordinary mobs with a `dropChance`, and they **stack**. Each arc has exactly
  one common, and it is the only thing that ranks up the passives of the characters *met in that arc*
  (`passiveItemOf` finds it by walking back to the arc whose mobs recruit the character). This is the
  whole point: deepening a passive means travelling back to that zone and farming it.
- **unique** — carried by bosses, guaranteed, one copy only. Each owned unique can be equipped on
  one character at a time (`characterEquipment` in the save). Equipped uniques grant permanent
  `ModifierTemplate` effects (`Item.effects`) that are merged into `characterContributions` and scaled
  by synergy just like base stats and passives. They are **scoped to the wearer**: a unique's percent
  or multiplier lifts that character's own damage only, never the rest of the team.

Who may wear a unique is decided by `canEquipOn` (`forge.ts`), and the first of its two rules is the
world: **an accessory never leaves its own universe.** An item carries no `animeId` — it is authored
in a world's directory and dropped by exactly one of that world's enemies, so `itemAnimeIndex(arcs)`
derives the origin from the drop rather than duplicating it into the content. Only a character that
world belongs to may wear it, through the same `isHomeAnime` test that decides whether a story
ability travels: a recruit of that world, someone who appears there, or someone whose evolution
grows into it. A Bleach zanpakutô on an Ôtsutsuki was never a build, only a collision between two
worlds' tags. The evolution's world counts *before* the evolution is reached — equipment isn't
re-checked every prestige, and an item that silently took itself off would be worse than one worn
early. An item no enemy drops has no world and stays unrestricted, so authoring one can't lock it.
On top of that, `Item.equippableBy` (character ids, anime ids, or character tags) narrows further,
and `validateGameData` refuses a unique the two rules together leave unwearable
(`unwearable-unique`). The same helper backs `sanitizedEquipment`, so an imported save cannot
smuggle a foreign accessory in.

Ranks are **bought, not derived**: `rankUpPassive(character)` spends `passiveRankCost(rank + 1)`
copies (geometric: 6, 9, 14, 21, 31, …) and stores the new rank in `passiveRanks`, so the player
chooses which character of an arc gets the copies. `passiveUpgradeOf` is what the UI reads — rank,
cost, copies held, affordable; `passiveGrowth(rank)` is the one place the "rank 1 = as printed, each
rank past it adds a `LEVEL_DAMAGE_STEP`" rule lives, shared by the pipeline and by the two screens
that preview a passive at rank 1 and at its cap. `rankUpPassive` refuses a character who isn't in the team: only
owned characters reach `characterContributions`, so the copies would be burnt for nothing (the item
Codex lists the whole cast, met or not). It refuses on the same grounds a character with **no
`passive` at all** — `Character.passive` stays optional in the type, and the item Codex used to
offer a rank-up on the whole cast of the arc, passive or not. **Every character in the shipped data
now carries a passive**: the thirty who had none were all ability-holders (Naruto, Gon, Ichigo,
Miyamura, …) authored back when a kit was read as *either* an ability *or* a passive, which left
their arc's commons with nothing to buy on the very characters the player recruits first. Shippûden
and Boruto had given both since they were written; the earlier worlds now match, each new passive
sized on its own cohort (a main between 0.2 and 0.4, a secondary between 0.1 and 0.2, on
`teamDps` or `clickPower` depending on how the character fights). It is not a rebalance: a passive
is scoped to its own character and starts locked at rank 0, and `npm run sim` reports the same run
— 14 arcs, 69 min, the same wall. Rank 0 means the passive is **locked** and contributes nothing, rank 1
is the passive as printed in the data, and every rank past it deepens it by `LEVEL_DAMAGE_STEP`.

The first rank is a bounded onboarding exception, not a free reward. After the player's first arc
clear and only until one lifetime passive rank has been bought, every defeated enemy carrying the
compatible common drops it while the stack is below the next rank's cost. The player still repeats
the arc and sees six pickups, but a bad RNG seed cannot hide the farming loop. Normal drop chances
resume as soon as the stack is sufficient, even before the purchase.
The items that paid for ranks are run-scoped, but the ranks themselves are character mastery:
`prestigeReset` wipes the common-item stock and the roster, while keeping `passiveRanks`. When the
character is recruited again in a later adventure, their passive immediately returns at its former
rank. Only `hardReset` wipes that mastery.

`rollsDrop(enemy, roll)` takes the 0..1 draw as an argument; `Math.random()` is called only in
`gameState`, which keeps the odds testable.

## Forge

The pure forge and equipment rules live in `src/engine/forge.ts`; `gameState.ts` only wires them to
the reactive inventory. Every unique begins at forge rank 1 (50% of its former contribution). Ranks 2–5 contribute 67%,
84%, 100% and 116%; rank 4 is exactly the pre-forge power, so existing saves keep their balance.
After its first drop, defeating that arc's replayable boss awards one fragment of that unique instead
of another copy. The forge consumes 5, 10, 15 then 25 fragments for ranks 2–5 (rank 1 is granted
with the first unique). The unique itself and unspent fragments are run-scoped, but its forge rank
is permanent mastery: after prestige, the next copy found immediately recovers its former rank.
Only `hardReset` clears that rank.

`forgeableNowIds` is the store's one answer to «which unique can be forged right now», and it is what
the UI badges with the same `.notice-dot` a rankable passive uses — from the Forge entry down to the
picker row (`docs/ui.md`). A unique at rank 5 has no next cost, so it is never in that set.

**A chance node must still be a chance at level 5.** `scaledChance` clamps `base * level` at 1, so
any base at or above 1/5 silently becomes a guarantee at max level, and nothing in the UI says so.
Two constants were over that line and together took the effective common-drop rate from the printed
base (now 15%) to **0.73 copies per kill** back when the base was 12%: `DOUBLE_DROP_CHANCE` at 0.25
(a maxed node doubled *every* drop) and the old `DOUBLE_PRESTIGE_CHANCE` at 0.2 (a maxed node doubled
*every* prestige — that node has since been replaced, see "Destin" below). The pity timer was the
third amplifier — `PITY_REDUCTION_PER_LEVEL` at 3 forced a common every 3 kills at max level, a 33%
floor that made the printed chance meaningless. Retuned to 0.08 / 0.1 / 1 respectively, and the rule
now covers `FREE_PACK_CHANCE` too.
`src/engine/tests/` now asserts the rule for every chance constant and keeps the pity floor above the
base draw's own ~8-kill average, so this class of mistake can't come back.

## Prestige

Gain is deliberately driven by **completion, not by grinding**: `PRESTIGE_EXPONENT` is 0.16 and
`COMPLETION_GAIN_BONUS` is 9, so clearing one more arc is worth far more than farming the current
one for hours. Currency spans an enormous range between clearing the first world and the last, and
the old 0.65 exponent turned that span into a gain of thousands — a single full run banked ~6 600
points against a 775-point tree, buying the whole of the game's meta-progression the first time it
was reachable. At 0.16 a full run banks ~250 and the tree takes several. `src/engine/tests/` guards
the trio together rather than the individual constants.

**Adding a world only half self-balances, and the exponent is the other half.** `runCompletion` is a
share of *all* the game's arcs, so new content dilutes what a *partial* run banks — a Naruto +
Shippūden clear went from 100% to 20/28 when Boruto landed, and from 236 points to 201. But a *full*
clear is still 100% completion against a much bigger `lifetimeEarned`, and nothing dilutes that
half: Boruto multiplied a full run's earnings by ~366 (8.76B → 3.21T), which at 0.22 banked **866**
points — one run buying the whole tree. Dropping the exponent to 0.16 puts a full clear back at ~250
without moving the early game (a Naruto-only clear goes 5 points → 4). Re-run this arithmetic
whenever a world is added; `npm run sim` prints the banked total on every run.

**Bleach was re-checked and needed nothing.** Its fifteen arcs take the game from 34 to 49, so the
dilution half bit as designed — a Naruto + Shippūden clear falls from 20/28 to 20/49, and the
simulator's seed-1 run drops from 26 banked points to 20. The other half barely moved: Bleach earns
**4.45e8** over a whole world at tier 0, which even entered last (tier 4, ×39) is ~1.7e10 against a
full clear's 3.21e12 — **+0.5%**, i.e. ×1.008 through a 0.16 exponent. That is the shape to look for
when the next world lands: an entry world sits at the *bottom* of the difficulty ramp, so its
earnings are noise next to the last world's, and only the arc count really moves.

`prestigeReset()` wipes everything but the prestige points, passive ranks, unique forge levels,
achievement counts, the prestige tree ranks (see below) and the pack points and duplicates: currency, roster, xp, items, equipment, kills, cleared arcs
and the worlds entered. Gain is `floor((lifetimeEarned / scale) ** PRESTIGE_EXPONENT * (1 + COMPLETION_GAIN_BONUS * completion))`,
zero below `scale` (`PRESTIGE_SCALE`, **5 000**), where `completion` is the share of the game's arcs
cleared this run (`runCompletion` in `gameState`) — resetting deep into the game banks up to 10x what
the same earnings bank early. The exponent is deliberately *low* (0.16, see above): completion has to
dominate, or farming one arc for hours outpaces clearing the next one. **Nothing multiplies that
gain from outside**: the tree's "Destin" branch used to end on a rolled 2x (`applyPrestige`'s old
`gainMultiplier`), which is exactly the term this exponent is tuned to hold flat — see the branch
below for what replaced it. Points are spent two ways:
`unlockAnime`, the paid early entry which has to be re-bought each run, and the prestige tree, which
is permanent.

Immediately before wiping the run, `buildPrestigeReport` freezes a plain snapshot: duration,
completion, points gained and new total, final click/DPS, recruited character levels, worlds and
arcs cleared, items, per-run achievement deltas, and the passive/unique mastery that survives. The
store resets only after this snapshot exists, then exposes it transiently to the UI. Starting or
abandoning a challenge uses the same reset mechanics with report display disabled; only the
player's explicit prestige produces the recap.

## The prestige tree (`prestigeTree.ts`)

Six independent branches — Clic du Narrateur, DPS Équipe, XP, Objets, Destin, Automatisation —
each a column of 5 nodes, and **each node is rebuyable up to 5 levels**, every level repeating the exact same effect
(e.g. node 1's "+8% click damage" stacks to +40% at level 5). A node unlocks as soon as its
predecessor has **just one level** bought (`isNodeUnlocked`), not once it's maxed — so several
nodes of a branch are often purchasable, and levelling, at the same time; only a node's own 5
levels are strictly sequential (`purchaseNodeLevel` refuses to skip one). Every level, of every
node, costs `2, 3, 5, 8, 13` prestige points depending only on its position *within its node*
(~×1.6 growth, the same ratio as `passiveRankCost` but reset at the start of each node rather than
escalating across the whole branch) — a maxed node costs 31 points, a maxed branch 155, all six
**930** (it was 775 before "Automatisation" landed). The extra 155 is a sink, not a payout: nothing
in that branch multiplies anything, so it changes what points are *spent on*, never what a run
earns — `PRESTIGE_EXPONENT` and its arithmetic above are untouched.

`gameState` keeps one 5-entry level array per branch in `prestigeTreeRanks`
(`Record<categoryId, number[]>`, index = position - 1) — a signal of its own, not a field on
`PrestigeState`: `prestige.ts` stays a pure `{ prestigePoints, unlockedAnimeIds }` testable without
knowing the tree exists. A flat single number per branch can't represent "node 1 at 2/5, node 3 at
1/5, the rest at 0" once a node unlocks the next at just 1 level, hence the array. `nodeLevel(levels,
position)` reads one node's level (0..5); `nodeLevelOf(categoryId, position)` is `gameState`'s
wrapper over it, `isNodeUnlockedFor`/`nodeCostOf` the equivalents for a node's unlock state and
next-level price. `prestigeTreeRanks` survives `prestigeReset` exactly like `achievementCounts`
does, wiped only by `hardReset`.

Only two of the 30 nodes are `ActiveModifier`s: node 1 of Clic du Narrateur and of DPS Équipe, a
flat `clickPower`/`teamDps` percent multiplied by the node's level, folded into `allModifiers` via
`prestigeTreeContributions` next to `achievementContributions`. Every other node is read directly
at its point of use, its magnitude scaled by `nodeLevelOf(...)` — `ModifierTarget` was deliberately
**not** widened to cover them, since things like an autoclick interval, a crit chance or a
pity-timer threshold have no `base` for `computeEffectiveStat` to operate on. Chance- and
discount-style effects are clamped (`scaledChance`, `scaledDiscount`) so a high level can never
push a chance past 100% or a cost to zero; the xp curve has its own floor (`MIN_XP_GROWTH`) so it
can never stop being geometric:

- **Clic du Narrateur** — click percent (node 1); an automatic click at **full** click power
  (node 2, driven by the main tick's `autoClickAccumMs`), whose levels buy **cadence, not strength**:
  `autoClickIntervalMs(level)` is 2s at level 1 down to 0.8s at level 5, shaving
  `AUTOCLICK_INTERVAL_REDUCTION_MS` each. (It used to be the reverse — a fixed 2s at a level-scaled
  *fraction* of click power — which made the first level feel like nothing and never changed the
  rhythm of the fight.) It **announces** every hit
  through `autoClickPulse` (`{ id, damage }`, the id bumped so two identical hits in a row are still
  two events) — a perk that lands in silence is indistinguishable from one that isn't working, and
  `ClickStage` turns each pulse into a damage pop of its own (`.pop.auto`, dimmer than a manual
  one). It can also be switched off: `autoClickEnabled` is a saved optional field defaulting to on,
  toggled from the Combat panel head, which only shows the switch once the node is bought. The perk
  is a convenience, not an obligation — and its pop-ups are noise for a player who wants to feel
  their own clicks land; crit chance (node 3);
  shaves time off every unlocked ability's cooldown on each click, scaled by level — only those
  still on cooldown, so a ready ability's timestamp never drifts without bound (node 4); a
  chance to fire a random unlocked ability for free, via `triggerAbilityEffects` (node 5, shared
  with abilities' normal activation path). Node 5 draws from any ability that isn't
  already running: buffs are scoped and stack freely, so the only pick that would waste the proc is
  one whose buff the player already has.
- **DPS Équipe** — teamDps percent (node 1); boosts an activated ability's percent/multiplier
  effects, via `buildAbilityModifiers` (node 2); softens the active arc's synergy malus further per
  level, via `softenedSynergyConfig` wrapping `defaultSynergyConfig` (node 3); stretches an
  ability's buff duration (node 4); extends a boss's `timerMs` (node 5). Node 5 is the one node the
  base tables are tuned *around*: boss clocks are fit at ~1.5x a fight's time-to-kill precisely so
  its +30%/level buys a real margin rather than padding one the base clock already gave away — see
  `docs/combat.md`. Widening the base timers again would quietly delete it.
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
- **Destin** — currency-per-kill percent (node 1); a small chance per kill to gain 1 prestige point
  outright (node 2); a chance at a bonus copy of a common drop (node 3); a shop discount (node 4);
  **« Carte blanche »**, a chance that an opened pack is on the house — its `worldPoints` are simply
  not spent (node 5, `FREE_PACK_CHANCE`, rolled in `openPack`). The branch is the economy one, and
  pack points were the only currency the whole tree ignored; the node reaches them the same way node
  4 reaches the shop. It cannot raise a ceiling either: the pack still has to be affordable to be
  opened, so the perk never buys a draw the player couldn't, and `MAX_DUPLICATES` still closes the
  pool. **It replaced "Faveur du destin"**, a chance to double the points a `prestigeReset` banked.
  That one resolved a coin flip once per run, at the one moment the player has no move left to make
  — pure variance, unreadable in play — and it multiplied the one number `PRESTIGE_EXPONENT` exists
  to keep flat (a maxed node was worth an extra full run every ten resets). Its `gainMultiplier`
  plumbing through `applyPrestige` and `PrestigeReport` went with it; `prestige.ts` is now free of
  randomness because nothing rolls there at all, rather than by convention.
- **Automatisation** — the branch that plays the parts of the loop that aren't decisions, and
  **only** those: see the invariant in `CLAUDE.md`. "Relève" walks the team to the next arc once it
  clears the one it's in (node 1); "Réflexe" fires every ability that is off cooldown, exactly what
  `activateReadyAbilities` already does from the roster's button (node 2) — filtered by each
  ability's **plan** (`AbilityPolicy`, réglé dans l'écran « Plans du Réflexe », `ui/ReflexPanel.tsx`,
  ouvert depuis la barre d'automatisation) : `"always"` par défaut, `"boss"` ne la lance que face au
  boss de l'arc, `"sync"` fait attendre chaque capacité du groupe que *toutes* soient prêtes, puis
  les lance ensemble (c'est ce qui couvre « ne lance A que si B est disponible » sans éditeur de
  règles). Ce sont les **niveaux du nœud** qui ouvrent les plans, `abilityPolicyChoices` : rien au
  niveau 1, « Boss » au 2, « Groupe » au 3 — de la portée, comme partout dans la branche. Un plan
  est une préférence : il survit au prestige, ne s'applique jamais au clic manuel, et ne peut que
  retarder une capacité — jamais la renforcer, donc la branche reste hors du balancing. Un plan
  stocké que le nœud n'ouvre plus (une sauvegarde qui traverse un rééquilibrage) relit `"always"`; "Intendance" buys passive
  ranks for the characters the player hands it (node 3); "Second souffle" asks for the boss rematch
  after a timeout, through `challengeBoss`, **and only once `bossOutlookOf(arc).winnable` says the
  boss is actually within reach** (node 4); "Instinct de crossover" opens a window as soon
  as `crossoverAdvised` says one would pay (node 5).

  Three things make the branch behave:

  - **Levels buy cadence or scope.** `autoAdvanceDelayMs`, `autoAbilityIntervalMs` and
    `autoRematchDelayMs` all share `cadenceMs(base, reduction, level)` with the autoclicker — the
    same trap applies, a reduction that ate the whole base would make a maxed node fire *every
    tick*, so `reduction * (LEVELS_PER_NODE - 1)` must stay under `base` and `src/engine/tests/`
    asserts it for all of them, the way it asserts `scaledChance` for every chance constant.
    "Intendance" scales by scope instead (`autoRankSlots`: one character per level), and "Instinct
    de crossover" by how much of the crystal stock it refuses to touch (`autoCrossoverReserve`:
    four activations held back at level 1, none at level 5).
  - **"Second souffle" waits for the team, not for the clock.** Its first version simply re-challenged
    after the delay, which turned a boss the team could not fell into a treadmill: timeout, a few
    seconds of mobs, the boss back at full hp, forever — and from the stage that reads as a fight
    restarting on its own, which is exactly how it was reported. It now re-checks every delay and
    only fires once `bossOutlookOf` calls the boss winnable, the same test the arc list turns into
    its "trop dur" marker, so the automation and the UI agree on what "too hard" means. The waiting
    is the point: the mobs it farms in the meantime are what makes the boss beatable.
  - **The two timed ones are armed by an event, never derived from state.** "Relève" is armed by
    the kill that *clears* an arc and "Second souffle" by the boss timing out; both are cleared by
    any manual arc change (`cancelPendingAutomation`). Deriving "Relève" from "this arc is cleared"
    instead would have dragged the player straight back out of a cleared arc they deliberately
    returned to — which is exactly the common-farming loop the passive-item design asks for.
  - **Each one has its own off switch**, saved in `automationOff` (the *off* set, so an absent
    entry — every older save — reads as on). Switching one off is a real choice, not a downgrade,
    and the UI only offers the switch for a node actually bought, like the autoclicker's.

  `autoRankCharacterIds` is the one piece of automation state that is run-scoped: it names
  characters, so `prestigeReset` empties it while the switches, a preference, survive.

Prestige points are **only** banked by `prestigeReset` (plus the "Destin" node 2 chance, itself
bought with points): clearing an arc grants none, so a player has zero points until their first
prestige.

`PrestigeTree.tsx` is the built UI — see `design.md` §5 for its node anatomy and layout. Its
`icon()` helper in `ui/icons.tsx` needed a fix while building it: `body` must be a factory
(`() => JSX.Element`), not a materialized JSX value — Solid's JSX makes real DOM nodes, so a value
evaluated once at module load is one shared node that only the last simultaneous on-screen instance
keeps (30 nodes reusing 6 icons made this obvious, but any icon rendered more than once at a time,
e.g. `IconLock` on several locked map nodes, was equally affected).

## Défis de run (`challenges.ts`)

A challenge is the same game with a rule taken away. It is deliberately **not** new content: the
roster, the arcs and the balance are untouched, and what changes is only what the run is allowed to
lean on — which is what makes the whole existing game worth replaying without writing a world.

Four constraints, one per thing the game leans on: the click ("Le Narrateur muet"), the abilities
("Le Silence des héros"), the roster size ("En petit comité", capped at 6) and the items ("À mains
nues"). Each names a `goal` in arcs cleared and a `reward` of `ModifierTemplate`s.

- **Goals are sized by how much the rule actually hurts**, not by a round number. Losing the click
  is the mildest of the four — it is a *trigger, not a damage source* (`CLAUDE.md`) — so it asks for
  the longest run at 10 arcs; losing items costs passive ranks, uniques *and* the farming loop at
  once, so it asks for 6.
- **A challenge takes a source of damage away, never the last one.** "Le Narrateur muet" shipped
  absolute and was unplayable: a run starts with an empty roster, so `teamDps` is 0 and the click is
  the only damage in the game — the first encounter couldn't be beaten, the first character never
  joined, and the run sat at ∞ time-to-kill forever. `clickIsMuted` keeps the click alive while the
  team is empty (the narrator sets the scene, then goes quiet), which is the whole of the exception.
  Any future rule that touches damage has to keep that floor.
- **The rules are enforced at the source**, never watched: `click` returns zero damage (and doesn't
  count as a click for the achievement ladder), `unlockedAbilities` returns an empty list,
  `maybeDropItem` returns before rolling anything, and
  `canRecruitUnder` gates both ways into the roster (the kill in `defeat` and the shop's character
  offers). See the invariant in `CLAUDE.md`. A refused recruit stays in the arc's pool as an
  ordinary fight, which is exactly what "reste sur le carreau" means.
- **Starting and abandoning both go through `prestigeReset`.** Starting must, because the goal
  counts the *run's own* cleared arcs and a run in progress would already be most of the way there;
  abandoning must, or every challenge would be worth taking and dropping one arc from the goal.
  Starting resets rather than refusing when points are pending: the reset banks them like any other.
- **Completion pays and lifts the rule** (`maybeCompleteChallenge`, called from the kill that clears
  an arc): the reward joins `completedChallengeIds`, the challenge stops being active, and the run
  carries on unconstrained. The constraint bought what it was there to buy; keeping it on would only
  tax a run already won.
- A `prestigeReset` **during** a challenge keeps it active and restarts its progress, since progress
  is the run's cleared arcs. That is the honest reading of "play a run under this rule", and it needs
  no special code.

`challengeContributions` folds a cleared challenge's reward into `permanentModifiersFor` next to
`achievementContributions` — same shape, same pipeline, one `sourceId` per effect
(`challenge:<id>:<index>`) so two effects of one challenge can't overwrite each other. The four
rewards together are worth +37% teamDps and +30% clickPower, in the register of a few prestige-tree
nodes, for four full runs played handicapped. They are the one part of the system that touches
balance, so they are percents on the two existing `ModifierTarget`s and nothing more exotic;
`npm run sim` is unchanged, since a simulated run clears no challenge.

## Crossover crystals (`crossover.ts`)

The one resource that exists because the game is inter-anime. Crystals only drop while
`isMixedTeam(ownedCharacters())` — the team spans two worlds — at `CROSSOVER_MOB_CHANCE` per mob and
`CROSSOVER_BOSS_REWARD` flat per boss, granted in `defeat`. **A boss pays that flat reward once**:
only the win that clears its arc counts, so re-farming a cleared arc's 50-fight boss cycle earns
nothing from the boss itself (the mobs of that cycle still roll). Without it the crystal stock was
best farmed by re-killing an easy cleared boss instead of playing forward, which is the opposite of
what the resource rewards. `activateCrossover()` spends
`CROSSOVER_COST` for a `CROSSOVER_DURATION_MS` window during which `activeSynergyConfig` is wrapped
in `crossoverSynergyConfig` — every malus flattened to `matchingArcMultiplier`, so the whole team
fights at full power anywhere. Damage only: a passive and an active ability are still story
abilities and stay shut off outside their own anime (`characterContributions` and
`getUnlockedAbilities` decide that from the arc, not from the config).
The stock is saved and run-scoped (`prestigeReset` wipes it, like items); the window's deadline is
transient like combat state, so a reload drops an active buff. `crossoverAdvised` is the nudge the
resource never had — true only while the player is fighting somewhere at least one team member sits
at the steep other-anime malus, which is exactly the "come back and farm an old world's common"
case; `CurrencyBar` pulses the tile on it.

## Packs and duplicates (`packs.ts`)

A character is recruited exactly once — refighting their arc never gives them again — so packs are
the only source of **duplicates**, and each duplicate multiplies that character's base click damage
and dps by `DUPLICATE_DAMAGE_STEP`, folded into `characterContributions` next to `levelGrowth`. That
is what keeps a starting character worth having late.

The copies stop at `MAX_DUPLICATES` (**10**, i.e. +250% base damage on that character). The bonus is
flat per copy and permanent, so with no ceiling one world's points eventually buy an unbounded
multiplier on a single character, and the pack points a cleared world keeps handing out have nothing
else to be spent on. The cap is enforced in `packPool`, not at the purchase: a character at ten
copies simply **leaves the pool**, so `openPack` returns null of its own accord and `PackPanel`'s
button disappears with the pool — one rule, no second check to keep in sync. Duplicates read from a
save are clamped once on the way in, so a save written before the cap (or an imported one) can't
sit above it.

The currency is **one bucket per world** (`worldPoints` in `gameState`), `POINTS_PER_KILL` per fight
won in that world, spent on that world's own packs: `PACK_COST.main` (500) draws uniformly from the
world's `rarity: "main"` cast, `PACK_COST.secondary` (250) from its secondary cast. `packPool` and
`drawPack` are pure and take the 0..1 roll as an argument, like `rollsDrop`; `openPack` in
`gameState` is the only caller of `Math.random()` and returns a `PackDraw` — the character drawn, so
`PackPanel` can show it, plus whether "Destin" node 5 (« Carte blanche ») waived the price. The
waiver is applied *after* affordability: the points must be in the bucket either way, so a free pack
is a refund, never a purchase the player could not have made. `PackPanel` prints the price of what
the points actually buy (`affordableCount`, capped by the x1–x10 selector) rather than
`PACK_COST × qty` — the same "one number, shown and charged" rule `shopOffers` follows — while the
buy loop still runs to the full `qty`, since a waived pack pays for one more.

The pool is filtered by the current roster: only characters already recruited in this adventure are
eligible. This prevents a pack from revealing or strengthening a character before
their story encounter. After prestige, a character becomes eligible again when recruited again;
duplicates already held remain banked meanwhile.

`PackPanel` is the buying screen and stops there; the collection is read in **`CatalogPanel.tsx`**,
the catalogue — one card per recruited character, grouped by world, showing the copies held, the
progress bar toward `MAX_DUPLICATES` and what the copies are worth in damage, with a tab to widen
the view from the characters holding duplicates to the whole roster. It computes nothing of its own:
`duplicatesOf` and `ownedCharacters` come from the store, and `DUPLICATE_DAMAGE_STEP` from here. The
split is deliberate — the packs panel would otherwise grow a second, longer list under its buttons —
and both share the same `packs` disclosure gate, so the catalogue appears with the packs themselves.

Points and duplicates are meta-progression like `achievementCounts` and `prestigeTreeRanks` —
`prestigeReset` spares both, only `hardReset` wipes them. Both are optional save fields, so no
`SAVE_KEY` bump was needed.

## Achievements (`achievements.ts`)

Thirteen countable actions, each with its own ladder of tiers (`ACHIEVEMENT_CATEGORIES`): mobs
killed, bosses killed, characters recruited, arcs cleared, evolutions unlocked, crossovers
activated, uniques equipped, prestiges, clicks, common items collected, abilities activated, passive
ranks bought, packs opened. `gameState` keeps one lifetime counter per category
(`achievementCounts`, bumped by `bumpAchievement` at the point of the event, in the function that
owns it — `defeat` for kills/recruits/arcs, `maybeDropItem` for commons only since uniques don't
count, `click` plus the tick's autoclick, which lands at full click power and so counts like a manual
one, `maybeEvolve`, `activateCrossover`, `equipItem`, `rankUpPassive`, `openPack`,
`activateAbility`, `prestigeReset`). Counts only ever go up, even when the thing counted can later
be spent (a common item collected still counts once it's spent ranking up a passive), because the
achievement is about the action having happened, not a stock still held. `equipItem` is the one that
needs a guard: it bumps only for an item not already worn by someone, so shuffling one unique
between characters isn't a free ladder.

Each completed tier folds into `allModifiers` as a permanent percent bonus
(`achievementTierBonus`, geometric growth — early tiers are a taste, late ones matter), through
`achievementContributions` exactly like any other modifier source. **The stat it pays into is per
category** (`AchievementCategory.target`): the click is a trigger, not a damage source, so only five
ladders — the ones the player does *with* the click or with what it drops (clicks, commons,
abilities, passive ranks, packs) — pay `clickPower`, exactly as many as before the list was
extended; the other eight, all about what the team kills, clears and becomes, pay `teamDps`.
`src/engine/tests/` guards that split so a new ladder can't quietly be dumped onto the click. Unlike almost everything else,
achievement counts are **not** wiped by `prestigeReset` — they are meta-progression in the same spirit
as prestige points, meant to keep paying off across runs. Only `hardReset`, the full-wipe button,
clears them.

## Shop (`shop.ts`)

`ShopOffer`s spend the main currency (never prestige points) on either copies of an item or a
character not yet owned — `data.shop`, an optional `GameData` field so older test fixtures don't
need one. `shopOfferUnlocked`/`canBuyShopOffer` are pure; `gameState`'s `shopOffers()` folds in the
live item/character lookup plus `locked`/`owned`/`affordable` for the panel to read, and
`buyShopOffer` is the only place currency actually changes hands. An offer's `requiresAnimeId` is
the only gate (an anime already **cleared** — `animeCleared`, same as everywhere else); with none
set, a high `cost` is the only barrier. Buying a character just calls the same `setOwnedCharacterIds`
path `defeat` uses, so it is run-scoped exactly like a combat recruit: wiped by `prestigeReset` along
with the currency that paid for it, same as the rest of a run. The three Naruto companions are
shop-exclusive; the data test requires every character to have either one combat encounter or one
character offer, so nobody can become unobtainable.

Three repeatable supply offers are generated for every accessible arc rather than duplicated in
`data.shop`: 1, 5 or 25 copies of its common item. The shop selects the active arc initially, then
lets the player browse every other accessible arc without travelling. One copy costs the currency payout of
`SUPPLY_KILLS_PER_COPY` (**15**) average common-dropping mobs at the current difficulty. Prices thus
follow the world's economy automatically, and the existing geometric passive costs provide the
long-term sink without another scaling system.

The generated list is a memo (`availableShopOffers`), not a function: pricing a copy walks every
playable arc and reduces over its farm mobs, and none of that moves during a fight. It used to be
rebuilt on every read — the panel hid that behind its own memo, but `buyShopOffer` still paid for it
twice per purchase, once to find the offer and once inside `canBuyShopOffer`.
