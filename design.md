# design.md

Document de référence pour le design visuel et interactif de ClickerAnime. Il complète
`CLAUDE.md` (qui décrit l'architecture technique) sur tout ce qui touche à l'UI/UX : direction
artistique, système de composants visuels, animations, et l'arbre de prestige.

**Règle de maintenance : dès qu'une modification touche au design (nouveau panel, nouvelle
palette, nouvelle interaction, refonte de l'arbre de prestige, sourcing d'images...), ce fichier
doit être relu et mis à jour en conséquence.** Un design.md qui ment est pire que pas de
design.md.

---

## 1. Pilier : la densité à la PokéClicker

Le modèle avoué (voir `CLAUDE.md`) est [PokéClicker](https://pokeclicker.com/) : beaucoup de
petits panels empilés, tout est visible en permanence, aucune information n'est cachée derrière
un onglet si elle peut tenir sur l'écran. Conséquences concrètes déjà en place et à préserver :

- **Pas de modal pour le cœur du jeu.** Roster, combat et progression sont trois colonnes
  toujours visibles (`RosterPanel` / `ClickStage` + `WorldMap` / `ProgressPanel`). Les `.overlay`
  + `.modal` (`Codex`, `WorldPortal`, `PrestigeTree`) sont réservés à ce qui est consulté
  ponctuellement, jamais à une action qu'on répète en boucle.
- **Tableaux compacts, pas de cartes larges.** `.table-head` + lignes sur la même grille CSS
  (`member-grid`, `item-grid`) : chiffres alignés en colonnes, scannables d'un coup d'œil, comme
  l'écran d'équipe de PokéClicker.
- **Rien n'est jamais gratuitement gros.** Une icône, un chiffre, une barre — le seul élément qui
  a le droit à une grande taille visuelle est l'ennemi combattu (`.stage`), parce que c'est
  l'unique zone d'interaction directe (clic).
- **Densité mais pas de bruit** : chaque panel a un `.panel-head` (titre à gauche, compteur/chip/
  select à droite) qui donne un point d'ancrage visuel constant, quelle que soit la richesse du
  contenu en dessous.

Toute nouvelle vue doit d'abord se demander « est-ce que ça peut être un panel de plus dans une
colonne existante, ou une ligne de plus dans un tableau existant ? » avant d'envisager un nouvel
overlay.

---

## 2. Un seul squelette, une DA par anime

> « Les mondes et arcs ont tous la même base mais la DA change selon l'anime. »

C'est déjà à moitié vrai dans le code et le principe doit être renforcé, pas contourné :

- **La structure ne bouge jamais entre animes.** `WorldMap`, `WorldPortal`/`PortalDetail`,
  `ProgressPanel`, `Codex` sont des composants génériques pilotés uniquement par `GameData` — il
  n'existe et il ne doit jamais exister de composant `NarutoMap.tsx` ou de branchement
  `if (anime.id === "naruto")` dans `src/ui/`. Un nouveau monde s'ajoute en `src/data/`
  uniquement (déjà la règle documentée dans `CLAUDE.md`).
- **Ce qui change, c'est la teinte.** `spriteHue(anime.id)` (hash déterministe de l'id) alimente
  déjà le dégradé radial derrière la carte du monde (`WorldMap.tsx:59`). C'est le bon mécanisme :
  systématique, sans travail manuel, garanti unique par monde. Il faut l'étendre à *tout* ce qui
  représente visuellement un monde, pas seulement la carte :
  - le fond du `.portal-hero` dans `PortalDetail`,
  - la bordure/lueur de `.enemy` quand `isBoss()` est vrai (actuellement une seule couleur fixe,
    `--accent-2`, pour tous les boss de tous les mondes),
  - la teinte de la carte du monde dans `.portal-card`.
- **Hash pour la variété automatique, override pour les mondes qui comptent.** Un hash donne une
  teinte plausible mais peut tomber à côté de l'identité réelle de l'anime (Naruto = orange/roux,
  Shippūden = rouge plus sombre/violet). Proposition : ajouter un champ optionnel sur `Anime`
  dans `types.ts` :

  ```ts
  export interface Anime {
    // ...
    /** teinte HSL 0..360 pour la DA de ce monde ; absent = spriteHue(id) (auto, déterministe) */
    themeHue?: number;
  }
  ```

  `themeOf(anime) = anime.themeHue ?? spriteHue(anime.id)` devient le point d'entrée unique côté
  UI. Les mondes sans art dédié (prototypage, mondes générés) restent automatiquement distincts
  les uns des autres ; les mondes soignés (Naruto, Shippūden) reçoivent une teinte choisie à la
  main sans toucher à un seul composant.
- **Le motif, pas seulement la couleur.** À terme, un second champ optionnel léger
  (`motif?: "leaf" | "cloud" | ...`, une icône SVG discrète répétée en filigrane sur le fond du
  `.map-canvas`) peut renforcer l'identité sans jamais devenir un jeu d'assets à maintenir par
  monde — un seul motif générique suffit tant qu'il est teinté par `themeOf`.

Le test : si on doit dupliquer un composant ou écrire une condition sur `animeId` pour qu'un
monde ait « son » look, c'est que le mécanisme de teinte/motif n'est pas assez exploité — pas
une raison d'ajouter du code spécifique.

---

## 3. Système de couleur

Le thème clair/sombre (`styles.css:1-71`, documenté dans `CLAUDE.md`) reste la seule source de
vérité pour les couleurs *fonctionnelles* (fond, texte, accent, bon/mauvais...). Aucune couleur
codée en dur en dehors de `:root` — règle déjà en place, à ne pas relâcher en ajoutant la DA par
anime : `themeOf(anime)` produit une **teinte** (nombre 0..360) combinée à `hsl()`, jamais une
couleur fixe indépendante du thème clair/sombre (la luminosité/saturation utilisées doivent
rester cohérentes avec `--panel-2`/`--line` du thème actif, comme le fait déjà
`spriteHue` + `hsl(... 70% 55% / 0.15)` dans `WorldMap`).

Palette fonctionnelle actuelle (rappel, ne pas dupliquer ailleurs) :

| Rôle | Token | Usage |
|---|---|---|
| Accent primaire | `--accent` | boutons primaires, bordures actives |
| Accent secondaire | `--accent-2` | dégradés, boss (à remplacer par teinte de monde, voir §2) |
| Positif | `--good` | synergie > 1, rang max |
| Négatif | `--bad` | synergie < 1, timer urgent |
| Or | `--gold` | dégâts, monnaie, objets uniques |
| Bleu | `--blue` | objets communs |

---

## 4. Mouvement et interactivité

Le jeu a aujourd'hui trois animations : le pop de dégâts (`rise`, `.pop`), les transitions de
largeur des barres (`.bar-fill`, `width 0.1–0.2s linear`), et le déplacement du marqueur de carte
(`left/top 0.3s ease`). C'est un bon socle à généraliser plutôt qu'à remplacer. Règle commune à
toute nouvelle animation : **respecter `prefers-reduced-motion`**, exactement comme `.pop` le
fait déjà (bascule vers un simple fade, `styles.css:463-472`) — c'est le patron à copier, pas à
réinventer.

Pistes concrètes, classées par impact / effort :

- **Impact de clic sur l'ennemi.** `.enemy` tremble et flashe brièvement (`animation: hit 0.15s`)
  à chaque `click()` réussi — feedback synchronisé avec le `.pop` existant, pas un nouveau
  système. Version réduite : juste le flash, pas le tremblement, sous `prefers-reduced-motion`.
- **Mort d'ennemi / de boss.** Un `.enemy` qui tombe à 0 PV doit disparaître par une courte
  animation (scale-down + fade, ~200ms) avant que le suivant apparaisse, plutôt qu'un
  remplacement instantané — surtout notable sur un boss (`isBoss()`), qui mérite un effet plus
  marqué (flash `--gold`, léger écran qui pulse) puisque c'est la récompense visible d'un arc
  entier.
- **Respiration des sprites.** Un `translateY` oscillant très léger (±1-2px, 2-3s ease-in-out
  infinite) sur `.sprite` en combat donne de la vie sans coût de lisibilité — désactivé sous
  `prefers-reduced-motion` (statique).
- **Compteurs qui roulent.** `fmt(props.game.currency())` change par à-coups aujourd'hui. Un
  utilitaire d'incrémentation animée (`ui/animatedNumber.ts`, un memo qui interpole vers la
  valeur cible sur ~300ms) au lieu de rendre la valeur brute, réutilisable partout où `fmt()`
  affiche une valeur qui grimpe (monnaie, xp, prestige).
- **Apparition des overlays.** `.overlay`/`.modal` (Codex, WorldPortal, PrestigeTree)
  apparaissent net aujourd'hui ; un fade sur `.overlay` + scale-in léger sur `.modal` (~150ms)
  suffit, c'est une transition d'état, pas une animation de contenu.
- **Nœud d'arbre qui se débloque.** Voir §5 — le seul endroit où une vraie « célébration »
  (particules courtes, pulse coloré) a un sens, parce que c'est un achat rare et définitif, pas
  un événement qui se répète 10 fois par seconde comme un clic.
- **Notification de recrutement / drop d'objet.** Aujourd'hui, recruter un personnage ou looter
  un objet unique n'a aucun accusé de réception visuel au-delà des chiffres qui changent dans les
  panels. Un toast discret en haut de l'écran (« ✦ Zabuza Momochi rejoint l'équipe », auto-dismiss
  ~3s, empilable) comblerait ce vide — cohérent avec la philosophie « tout visible » puisqu'il ne
  bloque rien, contrairement à un modal.

Ce qu'on **n'ajoute pas** : rien qui bloque l'input (pas d'animation qui empêche d'enchaîner les
clics), rien qui ralentisse la boucle de tick 200ms (`gameState.ts`), pas de dépendance externe —
tout en CSS/`@keyframes` ou signaux Solid, comme l'existant.

---

## 5. L'arbre de prestige

C'est la pièce manquante que ce document doit le plus détailler : `PrestigeTree.tsx` est
aujourd'hui un écran « bientôt disponible » assumé comme tel (voir son commentaire de tête). Le
schéma de référence donné (arbre à colonnes, nœuds ronds reliés par des lignes, rang `x/y` sous
chaque nœud, nœud final plus gros) se transpose directement sur les quatre familles de stats du
jeu.

### 5.1 Quatre branches, pas une par personnage

Une branche par cible de progression, chacune avec sa teinte propre (dérivée de la palette
fonctionnelle, pas de la DA par anime — l'arbre de prestige est un système méta, hors monde) :

| Branche | Icône | Teinte | Ce qu'elle améliore |
|---|---|---|---|
| **Clic du Narrateur** | curseur/étincelle | violet (`--accent`) | `clickPower` : dégâts au clic |
| **DPS Équipe** | épée/éclair | rouge (`--accent-2`) | `teamDps` : dégâts passifs de l'équipe |
| **Objets** | coffre/marque-page | bleu (`--blue`) | drop d'objets, coût des rangs de passif |
| **Bonus XP** | étoile/livre | or/vert (`--gold`/`--good`) | gain d'xp, donc vitesse de niveau |

Chaque branche a son propre en-tête façon `.panel-head` : nom, icône, et le total de points de
prestige investis dans *cette* branche (affichage seulement — voir §5.3, la monnaie reste
unique).

### 5.2 Anatomie d'un nœud

Reprend le vocabulaire déjà utilisé pour les rangs de passif (`RosterPanel`'s `.rank-up`,
`passiveUpgradeOf`) plutôt que d'inventer un second système d'amélioration :

- **Cercle** avec icône, taille standard pour un nœud normal, plus grand (~1.6×) pour le nœud
  final de chaque branche (le « keystone », comme le grand cercle vert/jaune/rouge en bas de
  chaque colonne du schéma de référence).
- **Rang affiché sous le nœud** : `rang / rang max` (ex. `2/5`), identique au patron
  `${rank}/${cap}` déjà utilisé dans `RosterPanel.tsx:109`.
- **Trois états visuels**, par bordure + remplissage (pas par une couleur totalement différente —
  la teinte de la branche reste identifiable dans les trois états) :
  - *verrouillé* (parent pas encore au rang 1) : contour gris `--line`, icône à `opacity: 0.35`
    (même traitement que `Sprite`'s `.dim` / `IconLock` déjà utilisé partout ailleurs) ;
  - *disponible / partiellement rangé* (0 < rang < max) : contour coloré de la branche, non
    rempli ;
  - *au maximum* : contour + fond pleins, plus un léger halo (`box-shadow`), comme `.enemy.boss`
    aujourd'hui.
- **Interaction** : clic sur un nœud disponible = achat d'un rang, bouton identique dans l'esprit
  à `.rank-up` (`+1 · coût`), désactivé si le solde de prestige est insuffisant. Survol/tap
  affiche un tooltip avec l'effet au rang actuel et au rang suivant, généré par le même utilitaire
  que `describeModifier` (`ui/describe.ts`) — l'arbre ne doit pas inventer une deuxième façon de
  décrire un modificateur.

### 5.3 Disposition et monnaie

- **Une seule monnaie** : `PrestigeState.prestigePoints` reste le seul solde (✦), déjà affiché
  dans `CurrencyBar`. Pas de sous-monnaie par branche — le total « points investis » affiché en
  en-tête de branche est dérivé (`sum(rank * costs)`), jamais stocké séparément, pour ne pas
  dupliquer une source de vérité (même logique que `levelFromXp` dérivant le niveau de l'xp
  totale).
- **Positions générées, pas dessinées à la main.** Même patron que `mapLayout.ts` : un graphe
  authored en donnée (liste de nœuds avec un ou deux parents, une colonne = une branche, une
  ligne = un palier) transformé par une fonction pure `layoutPrestigeTree()` en coordonnées 0..1,
  et des lignes SVG entre nœuds parent/enfant exactement comme `WorldMap`'s `.map-links` (ligne
  `done`/pas encore, ici `unlocked`/`locked`). Réutiliser ce patron plutôt qu'un CSS Grid à la
  main garde l'arbre maintenable si des nœuds sont ajoutés plus tard.
- **Ramification, pas une simple chaîne.** Comme le schéma de référence : un tronc commun bon
  marché (1 point), qui se divise en deux sous-chemins vers le milieu, qui reconvergent sur le
  nœud final. Ça donne des choix (« je monte plutôt la branche gauche ou droite d'abord ? ») sans
  complexifier le calcul de coût (géométrique par nœud, même formule que
  `passiveRankCost` — `6, 9, 14, 21, 31...` — réutilisable telle quelle ou adaptée).

### 5.4 Ce que ça implique côté moteur (à faire au moment de l'implémentation, pas maintenant)

- `ModifierTarget` (`types.ts:4`) n'a que `"clickPower" | "teamDps"` — les branches Objets et
  Bonus XP touchent des systèmes hors du pipeline de modificateurs actuel (`rollsDrop`,
  `passiveRankCost`, `XP_PER_KILL_REWARD`/`growth.ts`). Deux options à trancher au moment du
  code : élargir `ModifierTarget` (`"dropChance" | "xpGain"`) et les faire transiter par
  `computeEffectiveStat` comme le reste, ou les traiter comme des multiplicateurs simples lus
  directement par `rollsDrop`/`grantXp`. La première option est plus cohérente avec « tout
  modificateur devient un `ActiveModifier` » (`CLAUDE.md`), à privilégier sauf si ça force
  `computeEffectiveStat` à gérer des cibles qui n'ont pas de notion de `base`.
- **Persistance : l'arbre survit à `prestigeReset`.** Contrairement à la monnaie dépensée sur
  `unlockAnime` (qui rouvre au monde de départ à chaque run), les rangs achetés dans l'arbre sont
  la progression permanente que le prestige est censé nourrir (« le futur arbre de compétences
  global que ces points sont censés alimenter », `prestige.ts:37`). Nouveau champ
  `prestigeTreeRanks: Record<string, number>` sur `PrestigeState`, absent de la liste de ce que
  `prestigeReset` efface.

---

## 6. Sourcing d'images (personnages, mondes)

Aujourd'hui : sprites générés (`ui/pixel.ts`, hash → grille de pixels colorée) avec un mécanisme
de surcharge déjà prévu et non contraignant (`Sprite.tsx` : dépose un fichier
`src/assets/sprites/<id>.png` et il remplace le sprite généré partout, sans toucher au code —
voir `src/assets/sprites/README.md`). Le sourcing d'API vient *nourrir ce mécanisme existant*, il
ne le remplace pas.

### 6.1 APIs disponibles

| API | Couverture | Clé requise | CORS navigateur | Limite |
|---|---|---|---|---|
| **Jikan v4** (proxy non officiel de MyAnimeList) | anime (jaquette/bannière) + personnages (portrait) | non | **oui**, appelable directement en `fetch()` | ~60 req/min, 3 req/s |
| **AniList GraphQL** | anime + personnages, données très riches | non | **non** — nécessite un proxy/backend | ~90 req/min |
| **Kitsu** | anime + personnages | non | partiel, à revérifier au cas par cas | non documentée précisément |

[Jikan v4 Docs](https://docs.api.jikan.moe/), [AniList API Docs](https://docs.anilist.co/) —
sources consultées pour ce tableau.

Le projet est une SPA statique sans backend (`Vite` + `localStorage`, pas de serveur — voir
« Persistence » dans `CLAUDE.md`). Ça élimine AniList comme option d'appel direct : il faudrait
soit un serveur relais (hors scope d'un prototype sans backend), soit un proxy CORS tiers (fragile,
pas fiable pour un usage durable). **Jikan est donc la seule option directement exploitable en
l'état de l'architecture.**

### 6.2 Comment l'intégrer sans dépendre du réseau au runtime

Appeler Jikan à chaque affichage de sprite serait fragile : rate limit partagé par tous les
joueurs, indisponibilité qui casse le fallback (`Sprite.tsx` suppose que l'artwork custom, s'il
existe, est disponible immédiatement via `import.meta.glob`), et hotlinking direct vers le CDN de
MyAnimeList sans garantie de stabilité.

**Recommandation : un script dev-time, pas un appel runtime.** Un script (`scripts/fetch-art.ts`
ou équivalent, exécuté à la main, jamais dans le build ni au chargement du jeu) qui :

1. prend la liste des `id`/`name` depuis `src/data/*.ts` (personnages, animes) ;
2. interroge Jikan (`/characters?q=<name>`, `/anime?q=<name>`) pour trouver l'image correspondante ;
3. télécharge le fichier et l'enregistre sous `src/assets/sprites/<id>.<ext>` — exactement la
   convention déjà documentée dans `src/assets/sprites/README.md`, aucun changement de
   `Sprite.tsx` nécessaire.

Ça garde le jeu 100% autonome au runtime (le principe « pas de dépendance externe » du §4 tient
aussi ici), et ça garde le contrôle humain sur quelle image est retenue pour quel id — un match
automatique par nom peut se tromper de personnage (homonymes), une revue manuelle avant commit
reste nécessaire.

### 6.3 Point d'attention légal

Les images servies par Jikan/AniList sont les jaquettes et artworks officiels de MyAnimeList —
donc du contenu sous droit d'auteur des ayants droit de chaque anime, pas du contenu libre de
droits. Acceptable pour un prototype personnel/non-commercial comme celui-ci ; à re-vérifier
avant toute mise en ligne publique ou monétisation. Ce n'est pas un frein technique mais une
décision produit — à trancher par l'utilisateur, pas par ce document.

---

## 7. Conventions UI/UX à respecter pour toute nouvelle vue

- **Un panel = `.panel` + `.panel-head`.** Titre à gauche, info secondaire (compteur, select,
  chip) à droite. Ne jamais empiler un titre au-dessus d'un tableau sans cet en-tête.
- **Un tableau compact = `.table-head` + lignes sur la même classe de grille**, dans un `.scroll`.
  Pas de tableau HTML natif, pas de pagination — le scroll interne au panel est le seul mécanisme
  de dépassement.
- **Overlay = Escape pour fermer, clic sur le fond pour fermer, clic dans le contenu ne
  propage pas.** Patron `onKeyDown` + `stopPropagation()` déjà répété trois fois
  (`Codex`, `WorldPortal`, `PrestigeTree`) — toute nouvelle vue plein écran le copie à l'identique.
- **Aucun calcul de solde/valeur dans un composant.** Si un nombre affiché est dérivé d'autre
  chose qu'un accessor déjà exposé par `GameStore`, il manque une fonction dans `engine/` — pas
  une raison de faire le calcul dans le `.tsx` (règle déjà énoncée dans `CLAUDE.md`, qui vaut
  aussi pour tout ce que ce document ajoute : coût d'un nœud d'arbre, teinte d'un monde, etc.).
  Ces fonctions doivent rester pures, testables sans DOM.
- **Toute couleur vient d'un token.** Un nouveau token va dans le bloc `:root` clair, et dans les
  deux blocs sombres — jamais une seule des trois définitions.
- **Toute animation respecte `prefers-reduced-motion`.**
- **Le texte visible est en français**, y compris les nouveaux tooltips/labels de l'arbre de
  prestige — l'engine, lui, reste en anglais (identifiants, commentaires).
