# UI

The shell, the panels, the art direction and the theming. `design.md` holds the visual/UX intent;
this file holds how it is wired.

## Browser journey test

`npm run test:e2e` starts the local app and runs `tests/e2e/critical-player-journey.spec.ts` in
Firefox. It selects a first world, fights through the visible click target, exports and imports a
real `.txt` save, boots a second tab from a deliberately damaged primary slot, performs prestige
through the confirmation UI, verifies the detailed report and permanent passive/forge mastery,
then restores the backup
from the menu. CI installs Playwright's Firefox build and runs this after unit tests and the
production build. This is deliberately one high-value journey rather than a duplicate browser test
for every engine rule; pure rules remain faster and more precise in Vitest.

**`src/ui/` — presentation only, no rules.** `App.tsx` is the 3-column shell modelled on
PokéClicker's density: many small stacked panels, every learned system visible at once. Left is the
roster (abilities, sortable team table with each character's worn unique — icon, name, forge badge
and its effect at the current forge level —, item table whose kind filter also has an «Équipés»
view showing the wearer's portrait), middle is resources + the fight + the world
map, right is the arc lists per world plus travel and prestige. Everything else is an overlay
(`.overlay` > `.modal`, closed by ✕/Escape/backdrop) owned by `App.tsx`: `Codex.tsx`,
`WorldPortal.tsx`, `ShopPanel.tsx`, `CrossoverPanel.tsx`, `AchievementsPanel.tsx`,
`PrestigeTree.tsx`, `PackPanel.tsx`, `CatalogPanel.tsx`, `ReflexPanel.tsx`, `PrestigeReportPanel.tsx`. The prestige report
is built from a frozen pre-reset snapshot: it shows the duration and completion of the adventure,
points banked, combat and economy actions, final power, worlds and arcs cleared, and the permanent
passive/forge mastery carried into the next run. It is transient — closing or reloading dismisses it
without adding presentation state to the save. `Notices.tsx` is the exception to the overlay rule: a fixed,
non-blocking stack of pop-ups fed by the store's `notices` queue, which `grantItem` and `defeat`
push to so that a drop, a recruit and a cleared arc stop happening in silence. The queue lives in
the store because those events are born in the engine, and it is expired by the existing 200ms tick
rather than a timer per notice, so nothing can outlive the store. `App.tsx` also owns the two
destructive actions, both behind a `confirm()`: the topbar's `hardReset` (there rather than in a
panel because it is the way out of an unrecoverable save, and the topbar shows in every state) and
`ProgressPanel`'s prestige. `CurrencyBar.tsx`'s four tiles are buttons, each opening the overlay where that
resource is spent (gold → shop, prestige → tree, crystals → crossover, pack points → packs), so no
counter is a dead end; the pack tile follows the active arc, since pack points are per world. `Codex.tsx` first presents one card per anime with local discovery counters; choosing one opens only that anime's
characters and objects, avoiding an ever-growing global list. A roster shortcut still opens directly
on its character and anime. The character tab shows stats, the passive at level 0 / at cap / right now, an `Équipement`
block for a recruited character (the unique worn, its effect at the current forge level, and that
level worded as the forge words it — «niveau n/5 · puissance x %»), abilities,
evolution and the translated character types used by equipment restrictions. Its second tab uses the same two-pane shell through `ItemCodex.tsx`: every
item from the selected anime, found or not, with where it drops and at what odds, whose passive a common ranks up, and a
unique's effects, restriction and current wearer. Both tabs carry the roster's `.rank-up` button, so
a passive can be bought from wherever it is read, not only from the team table. Two cues make that
purchase findable: a `.notice-dot` walks the whole chain — the `Menu` summary, its `Codex` entry, the
world card, then the character row — whenever the store's `rankablePassiveIds` is non-empty (the same
memo `ClickStage` and `ProgressPanel` use for their pre-boss advice), and a `.codex-travel` row under
the portrait turns every *reachable* arc of that character into a button that sets the active arc and
closes the Codex. Unreachable arcs stay plain text in the synergy block rather than dead buttons.

**A fresh save uses progressive disclosure.** `ui/disclosure.ts` is the presentation-only truth
table, fed by current state plus lifetime achievement counters in `App.tsx`. The fight, current arc,
map and local recruit list are the initial vocabulary. Gold appears after the first kill; team and
Codex after the first recruit; abilities when one is actually unlocked; items after the first drop
or boss; worlds and shop after the first cleared arc; prestige when a reset would bank a point;
packs only once the cheapest pack is affordable; crossover with a mixed team or crystals; and
challenges after the first prestige. Travel follows its real availability. Lifetime counters keep
a learned surface visible after a prestige reset, so disclosure teaches once rather than making the
dashboard flicker between runs. Newly mounted panels use `.progressive-reveal`, disabled under
`prefers-reduced-motion`.

`ObjectiveTrail.tsx` occupies one compact panel above combat during that same first learning pass.
It exposes exactly one contextual action at a time — recruit a character, clear the first arc,
collect six copies of that arc's common, then buy a passive rank — with real item/character names
and live progress. `ui/objective.ts` is the pure four-step state machine. Achievement counters make
the trail permanent across reloads and prestige without adding tutorial state to the save; after
the first passive rank it unmounts for good.

When that first rank becomes affordable, the team panel reopens if necessary, gains an accent
frame and labels itself `Passif prêt`; the compatible `+1` button is the only pulsing control and a
one-shot notice names the character to improve. The effect ends immediately after purchase and
respects `prefers-reduced-motion`.

`Notices.tsx` also announces newly disclosed systems (`Ressources`, `Équipe et Codex`, abilities,
items, worlds/shop, prestige, packs, crossover and challenges). `App.tsx` compares successive
`DisclosureState` values and never replays already-visible systems when loading a save. These
announcements reuse the bounded, dismissible notice queue used by drops and recruits.

`TelemetryConsent.tsx` is a fixed, compact consent banner shown once until the player chooses. It
states the aggregate milestones collected, the categories never sent, the three-month retention and
the permanent menu switch used to withdraw or grant consent later. The client does not contact the
telemetry endpoint while the state is pending or refused.

The ability bar keeps every owned ability visible. Disabled cards print their precise state rather
than an aggregate warning: character absent from the current anime plus the anime list where the
ability works, active challenge and its constraint, exact cooldown, or remaining active duration.
Ready cards remain first, followed by active, cooldown and blocked cards, without tick-by-tick
reordering within each group.

Resource tiles always print their names beside their art: Or, Points de prestige, Cristaux
crossover and Points de pack. Icons remain recognition shortcuts, never the only vocabulary.
`ui/advice.ts` similarly turns a boss that fails `bossOutlookOf` into the best immediate action the
current UI can offer (recruit, passive, equipment, ready ability, or farming). The arc row prints
that action; its tooltip retains the exact estimated kill time and timer. When the kill cap bites,
the stage tells the player to advance or deliberately stay for item farming instead of foregrounding
an abstract percentage of discarded DPS.

Boss traits are never surprise penalties. An open arc prints the trait name as a compact chip, and
`ClickStage` keeps a `Boss à venir` strip visible from the moment the arc is entered. It names the
boss, the trait and its exact consequence. Before combat it adds the trait-specific counter, the
automatic kill-time estimate against the timer and one concrete preparation action when needed;
then it contracts to `Trait actif` during the boss fight.
The Codex modal keeps the same fixed responsive frame on its anime picker, character tab and item
tab. Its grid has an explicit bounded row and overrides the shared `.scroll` height limit: each list
and detail page therefore uses and scrolls through all the remaining space inside that frame, while
the close, back and tab buttons never move when the amount of content changes.
`ShopPanel.tsx` presents companion and supply offers as compact cards rather than generic table
rows. Each card keeps its art, useful context, price and purchase state in a stable hierarchy;
locked companions still show both their prerequisite and future price. Supply lots share a grid
under an arc selector, with the current stock shown directly on every offer.
The tab strip is `.tabs`, shared with `WorldMap`. Each component takes `game: GameStore` as its only
prop. A panel is `.panel` + `.panel-head` (title left, a count/chip/select right); compact tables are
a `.table-head` row over rows sharing the same grid class, inside a `.scroll` box.
AniList name overrides may use a direct character search when the matching entry lies outside the
cached cast pages; ordinary names never leave their anime context.

The three-column shell grows up to 1800px: flexible side columns leave most extra room to combat,
then stack below 1200px with the middle column first. The combat stage scales from 320px to 430px
high and uses larger enemy portraits. In `ProgressPanel`, cleared worlds start collapsed; cleared
arcs in the current world remain selectable but lose their full progress bar and render as compact,
muted rows. Manually reopening or collapsing a world still wins for the rest of the session.

**A world can carry a real map.** `Anime.mapImage` names art under `public/`, and each arc places
itself on it with `Arc.mapX`/`mapY` (0..1 fractions of the image). `layoutArcs` falls back to the
generated snake cell per arc, so a world with no art — or an arc not yet placed — still lays out on
its own. Naruto and Shippûden share `public/naruto-map.jpg` — one ninja world, one map — and every arc of
both is placed on it. The coordinates are eyeballed from the named villages and landmarks and are
meant to be tuned by hand; the Fourth War arcs are spread along the northern band rather than
stacked on the one battlefield, since a node is a labelled card and they would cover each other.
Maps start at 80% of their full width so combat remains the main visual mass; the panel header's
`Agrandir` button restores the full map without cropping or moving its percentage-based markers.
The toggle disappears below 700px, where the map already uses the available mobile width.

**A world can also carry presentation vocabulary.** Optional `Anime.presentation` labels the stage,
health bar, boss, click power, team DPS and encounters. `ui/presentation.ts` supplies the combat
defaults and merges overrides, so Horimiya can display Liens, Tension, Épreuve, Courage and Soutien
without an `anime.id` branch, a second rules engine, or any save-format field.

**And a map need not be a route.** Bleach's is the series' cosmology rather than a journey — the
Garganta with the worlds it links, legended 1 to 9 — so its fifteen arcs are pinned on *where each
one happens* (six in the Soul Society, four in Karakura, three in Hueco Mundo) instead of trailing
one after the other. Nothing in `WorldMap` had to change for that: the linking line follows arc
order, the pins follow the data, and the two are allowed to disagree. What it does need is
discipline about crowding, since six pins on one circle is a very different problem from fifteen
along a road — `src/engine/tests/` holds the placement to three rules: inside the drawn circle,
clear of the legend down the right-hand third, and no two pins closer than 0.07, the tightest pair
Shippūden's map already carries.

The site icon lives in `public/`: `favicon.png` is the lightweight 64px browser-tab asset and
`site-icon.png` is its 512px source for home-screen shortcuts. `index.html` references both with
absolute paths from the site root, which is where Cloudflare serves it.

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
canonical spelling (the old dub's "Uchiwa" vs AniList's "Uchiha", or Hunter x Hunter's French
"Melody"/"Zoldik" vs AniList's "Senritsu"/"Zoldyck") — corrected via `NAME_OVERRIDES`
in `anilist.ts`, not by changing the name shown in the UI.

The Codex only starts portrait requests for the anime of the selected character; other groups keep
their normal silhouette until selected. This keeps the AniList cast lookup below its rate limit while
leaving the full list immediately usable. Startup preloads the four currency images and the active
world's local art; the prestige tree's background and nodes wait until its panel is opened.

`bannerUrl(animeName)` is the same client's second lookup: a show's wide key art
(`Media.bannerImage`), used as the fight scene's backdrop. It reuses `resolveMediaId` (hence
`ANIME_ID_OVERRIDES` — a text search on this franchise lands on a similarly-titled movie often
enough to matter), `runQuery`, the `inFlight` dedupe and the same `localStorage` store under a
`banner:<name>` key, so adding it needed no second cache and no `CACHE_KEY` bump. Same contract as
`portraitUrl` — never rejects, `null` on any miss — and a show may legitimately have no banner at
all, so `ClickStage` renders the element only when the URL exists and otherwise falls through to the
plain `--stage-bg` gradient.

**Every world gets one, and none of them ship the art.** The six shows all have a banner on
AniList, so a new world needs nothing beyond an `ANIME_ID_OVERRIDES` entry pinning its id — pinning
is what stops a franchise's similarly-titled movie from supplying the backdrop. Resist the
temptation to add a local override field for it: the one time it looked necessary (Bleach), the
banner was already resolving and the field only got in its way.

Under the fight, `ClickStage`'s four-tile `.stat-grid` is followed by one full-width `.kill-rate`
line: the cadence the fight is actually resolving at, against `MAX_KILLS_PER_SECOND`. It exists
because "DPS équipe" alone is a half-truth on an outgrown arc — past 5 kills/s the surplus is thrown
away, and nothing on screen said so (`docs/combat.md`). It reads as a plain muted measurement while
the cadence passes and turns `--gold` on a `--panel-2` band the moment the cap starts eating damage,
naming the share lost; the tooltip carries the "go somewhere harder" reading in both states. It is a
separate line rather than a fifth tile so the grid keeps its four even columns, and it renders only
where the store hands it a value — never on a boss.

`AutomationBar.tsx` is the strip of switches under `ClickStage`'s arc stepper, one per node of the
prestige tree's "Automatisation" branch that is actually **bought** — an off switch for something
you don't own is noise. It also holds the Echo click toggle once bought and the always-available
pause control, keeping every automatic/combat-flow switch on the same line.
Each chip reads its label straight out of `PRESTIGE_TREE_CATEGORIES` so a switch and its tree node
can't drift apart, and its tooltip states what the automation is doing *at the level bought right
now* (`autoAdvanceDelay()`, `autoAbilityInterval()`, …) rather than repeating the node's generic
per-level wording. The one automation that needs more than a switch is "Intendance", which has to
know *whose* passive to rank: `RosterPanel` grows an `.auto-rank` cog next to each character's
rank-up button, and `toggleAutoRank` refuses past `autoRankCapacity()` (one slot per node level)
rather than accepting a character it would silently never get to.

The other one is "Réflexe", which needs to know *quand* dépenser chaque capacité: the main menu grows a
`Plans` entry (only once the node is bought) opening **`ReflexPanel.tsx`**, one row per unlocked
ability with its three plans as segments — `Auto` / `Boss` / `Groupe`, greyed out until the node's
level opens them (`abilityPolicyChoices`). It is deliberately *not* in the abilities panel: that bar
is the "fire now" gesture and already runs to forty buttons, while a plan is set once and read as a
whole — the rows sort grouped-first so the screen reads like the plan itself. Manual firing ignores
plans entirely, which the panel says in its intro.

The right column places a compact **Forge** entry directly below Prestige whenever the run owns a
unique. It opens `ForgePanel.tsx` over a dedicated forge illustration. The workbench starts with two
empty slots rather than listing every recipe. Clicking the left slot opens a compact picker containing
the owned uniques; choosing one fills that slot with its boss-earned fragments and previews the forged
unique in the right slot. Once filled, either slot or the explicit `Changer` action reopens the picker,
so another unique can be selected without closing the forge. The central action upgrades only that
selection. The centered workbench leaves the smiths and heated metal visible, and stacks vertically
on narrow viewports.

`ChallengePanel.tsx` is the overlay for the run challenges, opened from `ProgressPanel`'s Prestige
section — next to the tree button, because a challenge starts from a reset just like a prestige
does, and both `confirm()` say so. It renders each challenge's rule, goal, reward (through
`describeModifier`, so a reward is worded exactly like an item's effect) and state. The constraint
itself also shows **during the fight**: `ClickStage` draws a `.challenge-banner` above the
automation strip, because a click that suddenly deals nothing — in a game whose central gesture it
is — has to say why without the player going looking for a panel.

`ui/Sprite.tsx` wraps portraits in a `createResource` keyed on `kind:name`; its `SCALE` constant
multiplies every call site's `px`, so the whole game's portraits are resized from one number; `<Show>` renders the
resolved `<img>` (scaled with `object-fit: contain` into a box sized by `px`) or, while pending or
once resolved to nothing, a `.sprite-empty` box of the same size holding `IconSilhouette` tinted with
`--world-hue` — never a layout shift, never a broken image, and never a blank hole. The placeholder
carries a silhouette rather than nothing because a lookup can still miss — un nom qu'AniList
orthographie autrement et qu'aucune entrée `NAME_OVERRIDES` ne couvre encore, ou une requête qui
échoue. Tous les ennemis d'arc sont désormais des personnages nommés présents dans le casting
AniList de leur anime : ils se résolvent comme une recrue, et il n'y a plus d'art local sous
`public/portraits/` — en ajouter un demande de choisir un ennemi qu'AniList référence.

**`ui/describe.ts`** turns a `ModifierTemplate` or `AbilityDefinition` into French prose. It lives in
`ui/`, not the engine — the engine has no user-facing strings.

**Per-world art direction.** `ui/hue.ts` owns it: `spriteHue(seed)` is a deterministic hash, and
`themeOf(anime)` — `anime.themeHue ?? spriteHue(anime.id)` — is the single entry point, so a world
with a hand-picked `Anime.themeHue` gets it and any other world stays automatically distinct. A
component never builds a colour string: it sets the **`--world-hue`** custom property on a container
and the modules imported by `styles.css` do the rest with `hsl(var(--world-hue) … / var(--world-strength))`. It is set in
three places because the world being *shown* is not always the one being *fought*: `App.tsx` on
`.game`, `WorldMap.tsx` on `.map-canvas` (its tab can be pinned to another world),
`WorldPortal.tsx` on `.portal-hero`/`.portal-card`. A default in the bare `:root` keeps any rule
reading it safe outside those containers. See `design.md` §2.

**Theming.** Light and dark both ship, in the usual three states: bare `:root` holds the light
palette, and the dark palette is repeated twice — once under `prefers-color-scheme: dark` guarded by
`:root:not([data-theme="light"])`, once under `:root[data-theme="dark"]` — so the explicit toggle
wins in both directions. `ui/theme.ts` owns the `data-theme` attribute and remembers the choice in
`localStorage`; "system" stamps no attribute at all. Every colour must come from a token defined in
the bare `:root` block: gradients, the sticky topbar tint and the bar-label text-shadow are all
tokenised (`--stage-bg`, `--topbar-bg`, `--label-shadow`, `--active-tint`) precisely because they
have to flip. Never hard-code a colour in a rule. Components must never compute balance themselves — if a number needs deriving, it belongs in
the engine and gets exposed on the store (that is why `synergyOf`, `costOf`, `damageGrowthOf` and
`pendingPrestigeGain` exist — `damageGrowthOf` in particular is what stops the roster and the Codex
from printing two different damage numbers for the same character). The roster's Clic/DPS cells
show that character's effective contribution in the active arc: they include the current synergy
malus, suppress a passive outside its home anime, and update for scoped ability activation and
expiry under the same mastery cap as the team totals. The ability bar drops the buttons of every
character who is abroad for the same reason, and prints `sleepingAbilityCount` under the grid so a
world change reads as a rule rather than as a bug. The separate Syn. column keeps the multiplier
visible so the reason for the drop is explicit. Styling stays hand-written and framework-free:
`src/styles.css` is the ordered manifest, while `src/styles/` groups rules by responsibility.

## L'écran de secours

`src/index.tsx` enveloppe `<App />` dans un `<ErrorBoundary>` de `solid-js`. Une exception dans un
composant donnait sinon une page blanche : plus de jeu, et surtout aucun moyen de sortir la
sauvegarde. Le fallback (`.crash` dans `styles/feedback-and-automation.css`) affiche la pile et le contenu brut de
`localStorage[SAVE_KEY]` dans un `<textarea>` en lecture seule — le joueur copie, recharge, et peut
réimporter. C'est la seule raison pour laquelle `SAVE_KEY` est exporté par `gameState.ts`.

Le build de prod émet des sourcemaps (`build.sourcemap` dans `vite.config.ts`), sans quoi cette pile
pointerait sur du JS minifié.

## The topbar's start menu

The topbar is a centred title plus, anchored right, the theme toggle and one `<details class="startmenu">`
holding every entry point, text-only and a size up from the game's buttons — Codex, Mondes, Boutique,
Packs, Catalogue, Crossover, Défis, Succès, Prestige, then
Exporter / Importer / Tout effacer and the autosave line. It replaced a row of buttons that grew by one
every time a panel was added, and would eventually have collided with the title; PokéClicker's StartMenu
is the model.

It is a native `<details>` on purpose: open/close, keyboard and screen-reader semantics come for free, so
there is no dropdown state in `App.tsx` beyond the two lines that close it — `runFromMenu` (an entry that
opens a modal must not leave the menu open underneath it) and `onMenuFocusOut` (`<details>` does not close
on an outside click by itself). The world-dependent entries stay behind the same
`game.unlockedAnimes().length > 0` guard they had in the old bar.

## Paths into `public/`

Anything under `public/` is referenced by an absolute path in the source (`/bleach-map.jpg`,
`/naruto-map.jpg`, `/resources/currency-gold.png`) and goes through `ui/asset.ts`'s `asset()` before
it reaches an `src`. Four call sites: `WorldMap.tsx`'s `mapImage`, `Coin.tsx`'s four coins,
`ItemIcon.tsx`'s item art and `preload.ts`'s warming pass.

`asset()` is the identity function today, and deliberately kept anyway. It exists because Vite
rewrites `url()` in CSS and static imports but **never a string built at runtime**, so a site served
from a sub-directory needs the `BASE_URL` prefix spelled out — which is what GitHub Pages required
under `/ClickerAnime/`. Cloudflare serves the game at the root of `clickeranime.reesch.com`, so
`base` is back to `/` and the prefix is empty; the indirection stays so that moving under a
sub-path again is one line in `vite.config.ts` rather than a hunt for broken `src` attributes.

The same reasoning is why `index.html` links its favicon as `/favicon.png` rather than
`./favicon.png`: Cloudflare's SPA fallback answers *any* unmatched route with `index.html`, and a
relative path in it would resolve against that route's directory instead of the site root.

## Coins

The four currencies are drawn by `Coin.tsx` — a PNG from `public/resources/`, not an SVG from
`icons.tsx` — and **every** place a currency is named goes through it: `CurrencyBar`'s totals, a
shop price, an unlock cost in `ProgressPanel` and `WorldPortal`, the balances at the head of
`PrestigeTree`, `CrossoverPanel` and `PackPanel`. One component rather than a `<img>` per call site
because a currency has to be recognisable by the same drawing everywhere; a price marked with a
different glyph than the counter it draws from is how a player loses track of what they are
spending. `IconDiamond`, `IconCrystal` and `IconPack` were deleted with the last of their uses.

`.coin` sizes in `em` so the mark follows the price it annotates; the three balances where the mark
is the subject rather than an annotation pass `px` instead.

`ItemIcon.tsx` is the same idea for items, split on the only thing that separates two of them at a
glance — common (a passive to stack) or unique (an equippable) — and drawn from `public/items/`. It
covers `ItemCodex` (list and detail hero), `RosterPanel`'s item rows and `ShopPanel`'s item offers.
Hunter x Hunter's six common items have bespoke art under their `hxh-item-*` ids, so they keep the
same icon in each of those views instead of falling back to the generic common-loot image. The
Triple-Star Hunter License, Poor Man's Rose, Blue Planet card, Skill Hunter book, Scarlet Eyes
reliquary and Joker card also have their own isolated art instead of the generic unique-loot image.
`Notices.tsx` keeps its SVG: a `Notice` carries a kind (`item`/`recruit`/`arc`) but no item, so the
pop-up cannot know whether the drop was common or unique, and showing the wrong one of the two marks
would be worse than a neutral glyph. So does `PrestigeTree`'s "Objets" branch, whose icon belongs to
a set of six branch glyphs rather than to the items themselves.
Identical notices share one queue entry with a `count`; each repeat refreshes its expiry and the HUD
adds `×N`, preventing rapid farming from filling the entire stack with the same drop.
