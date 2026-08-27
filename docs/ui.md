# UI

The shell, the panels, the art direction and the theming. `design.md` holds the visual/UX intent;
this file holds how it is wired.

**`src/ui/` — presentation only, no rules.** `App.tsx` is the 3-column shell modelled on
PokéClicker's density: many small stacked panels, everything visible at once. Left is the
roster (abilities, sortable team table, item table), middle is resources + the fight + the world
map, right is the arc lists per world plus travel and prestige. Everything else is an overlay
(`.overlay` > `.modal`, closed by ✕/Escape/backdrop) owned by `App.tsx`: `Codex.tsx`,
`WorldPortal.tsx`, `ShopPanel.tsx`, `CrossoverPanel.tsx`, `AchievementsPanel.tsx`,
`PrestigeTree.tsx`, `PackPanel.tsx`, `ReflexPanel.tsx`. `Notices.tsx` is the exception to the overlay rule: a fixed,
non-blocking stack of pop-ups fed by the store's `notices` queue, which `grantItem` and `defeat`
push to so that a drop, a recruit and a cleared arc stop happening in silence. The queue lives in
the store because those events are born in the engine, and it is expired by the existing 200ms tick
rather than a timer per notice, so nothing can outlive the store. `App.tsx` also owns the two
destructive actions, both behind a `confirm()`: the topbar's `hardReset` (there rather than in a
panel because it is the way out of an unrecoverable save, and the topbar shows in every state) and
`ProgressPanel`'s prestige. `CurrencyBar.tsx`'s four tiles are buttons, each opening the overlay where that
resource is spent (gold → shop, prestige → tree, crystals → crossover, pack points → packs), so no
counter is a dead end; the pack tile follows the active arc, since pack points are per world. `Codex.tsx` is the largest: the
full character list, met or not, with stats, the passive at level 0 / at cap / right now, abilities,
evolution, combos and the translated character types used by equipment restrictions. It carries a second tab over the same two-pane shell, `ItemCodex.tsx`: every
item, found or not, with where it drops and at what odds, whose passive a common ranks up, and a
unique's effects, restriction and current wearer. Both tabs carry the roster's `.rank-up` button, so
a passive can be bought from wherever it is read, not only from the team table.
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

The site icon lives in `public/`: `favicon.png` is the lightweight 64px browser-tab asset and
`site-icon.png` is its 512px source for home-screen shortcuts. `index.html` references both with
relative paths so the GitHub Pages subdirectory deployment keeps working.

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

`bannerUrl(animeName)` is the same client's second lookup: a show's wide key art
(`Media.bannerImage`), used as the fight scene's backdrop. It reuses `resolveMediaId` (hence
`ANIME_ID_OVERRIDES` — a text search on this franchise lands on a similarly-titled movie often
enough to matter), `runQuery`, the `inFlight` dedupe and the same `localStorage` store under a
`banner:<name>` key, so adding it needed no second cache and no `CACHE_KEY` bump. Same contract as
`portraitUrl` — never rejects, `null` on any miss — and a show may legitimately have no banner at
all, so `ClickStage` renders the element only when the URL exists and otherwise falls through to the
plain `--stage-bg` gradient.

`AutomationBar.tsx` is the strip of switches under `ClickStage`'s arc stepper, one per node of the
prestige tree's "Automatisation" branch that is actually **bought** — an off switch for something
you don't own is noise, the same rule the autoclicker's toggle in the Combat panel head follows.
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
and `styles.css` does the rest with `hsl(var(--world-hue) … / var(--world-strength))`. It is set in
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
also include active abilities scoped to that character and update for activation and expiry, under
the same mastery cap as the team totals. Styling is one hand-written `src/styles.css` with CSS variables; no UI framework.

## L'écran de secours

`src/index.tsx` enveloppe `<App />` dans un `<ErrorBoundary>` de `solid-js`. Une exception dans un
composant donnait sinon une page blanche : plus de jeu, et surtout aucun moyen de sortir la
sauvegarde. Le fallback (`.crash` dans `styles.css`) affiche la pile et le contenu brut de
`localStorage[SAVE_KEY]` dans un `<textarea>` en lecture seule — le joueur copie, recharge, et peut
réimporter. C'est la seule raison pour laquelle `SAVE_KEY` est exporté par `gameState.ts`.

Le build de prod émet des sourcemaps (`build.sourcemap` dans `vite.config.ts`), sans quoi cette pile
pointerait sur du JS minifié.

## The topbar's start menu

The topbar is a centred title plus, anchored right, the theme toggle and one `<details class="startmenu">`
holding every entry point, text-only and a size up from the game's buttons — Codex, Mondes, Boutique,
Packs, Crossover, Défis, Succès, Prestige, then
Exporter / Importer / Tout effacer and the autosave line. It replaced a row of buttons that grew by one
every time a panel was added, and would eventually have collided with the title; PokéClicker's StartMenu
is the model.

It is a native `<details>` on purpose: open/close, keyboard and screen-reader semantics come for free, so
there is no dropdown state in `App.tsx` beyond the two lines that close it — `runFromMenu` (an entry that
opens a modal must not leave the menu open underneath it) and `onMenuFocusOut` (`<details>` does not close
on an outside click by itself). The world-dependent entries stay behind the same
`game.unlockedAnimes().length > 0` guard they had in the old bar.

## Paths into `public/`

Anything under `public/` is referenced by an absolute path in the source (`/portraits/x.webp`,
`/naruto-map.jpg`, `/resources/currency-gold.png`) and must go through `ui/asset.ts`'s `asset()`
before it reaches an `src`. The site is served from a sub-directory on GitHub Pages
(`/ClickerAnime/`), where a leading `/` points at the domain root instead; Vite rewrites `url()` in
CSS and static imports, but never a string built at runtime, so the `BASE_URL` prefix has to be
explicit. The two call sites are `WorldMap.tsx`'s `mapImage` and `CurrencyBar.tsx`'s four coins.

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
`Notices.tsx` keeps its SVG: a `Notice` carries a kind (`item`/`recruit`/`arc`) but no item, so the
pop-up cannot know whether the drop was common or unique, and showing the wrong one of the two marks
would be worse than a neutral glyph. So does `PrestigeTree`'s "Objets" branch, whose icon belongs to
a set of six branch glyphs rather than to the items themselves.
Identical notices share one queue entry with a `count`; each repeat refreshes its expiry and the HUD
adds `×N`, preventing rapid farming from filling the entire stack with the same drop.
