# UI

The shell, the panels, the art direction and the theming. `design.md` holds the visual/UX intent;
this file holds how it is wired.

**`src/ui/` — presentation only, no rules.** `App.tsx` is the 3-column shell modelled on
PokéClicker's density: many small stacked panels, everything visible at once. Left is the
roster (abilities, sortable team table, item table), middle is resources + the fight + the world
map, right is the arc lists per world plus travel and prestige. Everything else is an overlay
(`.overlay` > `.modal`, closed by ✕/Escape/backdrop) owned by `App.tsx`: `Codex.tsx`,
`WorldPortal.tsx`, `ShopPanel.tsx`, `CrossoverPanel.tsx`, `AchievementsPanel.tsx`,
`PrestigeTree.tsx`, `PackPanel.tsx`. `Notices.tsx` is the exception to the overlay rule: a fixed,
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
evolution and combos. It carries a second tab over the same two-pane shell, `ItemCodex.tsx`: every
item, found or not, with where it drops and at what odds, whose passive a common ranks up, and a
unique's effects, restriction and current wearer. Both tabs carry the roster's `.rank-up` button, so
a passive can be bought from wherever it is read, not only from the team table.
The tab strip is `.tabs`, shared with `WorldMap`. Each component takes `game: GameStore` as its only
prop. A panel is `.panel` + `.panel-head` (title left, a count/chip/select right); compact tables are
a `.table-head` row over rows sharing the same grid class, inside a `.scroll` box.

**A world can carry a real map.** `Anime.mapImage` names art under `public/`, and each arc places
itself on it with `Arc.mapX`/`mapY` (0..1 fractions of the image). `layoutArcs` falls back to the
generated snake cell per arc, so a world with no art — or an arc not yet placed — still lays out on
its own. Naruto and Shippûden share `public/naruto-map.jpg` — one ninja world, one map — and every arc of
both is placed on it. The coordinates are eyeballed from the named villages and landmarks and are
meant to be tuned by hand; the Fourth War arcs are spread along the northern band rather than
stacked on the one battlefield, since a node is a labelled card and they would cover each other.

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

`ui/Sprite.tsx` wraps portraits in a `createResource` keyed on `kind:name`; its `SCALE` constant
multiplies every call site's `px`, so the whole game's portraits are resized from one number; `<Show>` renders the
resolved `<img>` (scaled with `object-fit: contain` into a box sized by `px`) or, while pending or
once resolved to nothing, a `.sprite-empty` box of the same size holding `IconSilhouette` tinted with
`--world-hue` — never a layout shift, never a broken image, and never a blank hole. The placeholder
carries a silhouette rather than nothing because a good ~quarter of the arc enemies are anonymous by
design ("Garde de Kiri", "Voie de l'Insecte"): AniList has no card for them, so no `NAME_OVERRIDES`
entry can ever fill those boxes. Pour en habiller un à la main : `LOCAL_PORTRAITS` dans
`anilist.ts` associe un nom de `src/data/` à un fichier sous `public/portraits/` (png, svg, webp —
aucune étape de build), consulté avant le réseau et jamais mis en cache, donc remplacer le fichier
suffit à changer l'art. Une image locale porte `.sprite.local` et passe en `object-fit: cover` : un
screenshot large serait sinon letterboxé au tiers de la boîte là où les portraits AniList (~2:3) la
remplissent presque — recadrer le fait lire à la même taille que les autres.

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
from printing two different damage numbers for the same character). Styling is one hand-written `src/styles.css` with CSS variables; no UI framework.
