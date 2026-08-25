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
  uniquement (déjà la règle documentée dans `docs/ui.md`).
- **Ce qui change, c'est la teinte.** `spriteHue(anime.id)` (hash déterministe de l'id) alimente
  déjà le dégradé radial derrière la carte du monde (`WorldMap.tsx:59`). C'est le bon mécanisme :
  systématique, sans travail manuel, garanti unique par monde. Il faut l'étendre à *tout* ce qui
  représente visuellement un monde, pas seulement la carte :
  - le fond du `.portal-hero` dans `PortalDetail`,
  - la bordure/lueur de `.enemy` quand `isBoss()` est vrai (actuellement une seule couleur fixe,
    `--accent-2`, pour tous les boss de tous les mondes),
  - la teinte de la carte du monde dans `.portal-card`.
- **Hash pour la variété automatique, override pour les mondes qui comptent — fait.**
  `Anime.themeHue?: number` (`types.ts`) porte la teinte choisie à la main, et
  `themeOf(anime) = anime.themeHue ?? spriteHue(anime.id)` (`ui/hue.ts`) est le **point d'entrée
  unique** côté UI. Les mondes sans art dédié restent automatiquement distincts par le hash ; les
  mondes soignés reçoivent leur teinte sans toucher à un composant. Teintes retenues :
  **Naruto `28`** (l'orange de Konoha), **Shippūden `350`** (le rouge sombre de la guerre ninja).
  `engine.test.ts` vérifie que tout `themeHue` des données reste dans 0..360.
- **Le canal, c'est une custom property, pas une chaîne construite en JS.** Un composant ne
  fabrique jamais de `radial-gradient(...)` en inline style — c'était le cas de `WorldMap` avant.
  Il pose **`--world-hue`** sur son conteneur (`themeOf(...)`), et `styles.css` fait le reste avec
  `hsl(var(--world-hue) ... / var(--world-strength))`. Posée à trois endroits parce que le monde
  *affiché* n'est pas toujours le monde *actif* : `App.tsx` sur `.game` (monde de l'arc en cours),
  `WorldMap.tsx` sur `.map-canvas` (l'onglet de carte peut être épinglé ailleurs),
  `WorldPortal.tsx` sur `.portal-hero`/`.portal-card`. `--world-hue` a une valeur par défaut dans
  le `:root` clair, donc aucune règle ne casse hors de ces conteneurs.
  Consommée aujourd'hui par : le fond de `.stage`, le voile de `.stage-backdrop`, le halo de
  `.enemy`, l'aura de `.enemy.boss` (qui était un `--accent-2` fixe, identique pour tous les boss
  de tous les mondes), le fond de `.map-canvas` et celui de `.portal-hero`.
- **Le motif, pas seulement la couleur.** À terme, un second champ optionnel léger
  (`motif?: "leaf" | "cloud" | ...`, une icône SVG discrète répétée en filigrane sur le fond du
  `.map-canvas`) peut renforcer l'identité sans jamais devenir un jeu d'assets à maintenir par
  monde — un seul motif générique suffit tant qu'il est teinté par `themeOf`.

Le test : si on doit dupliquer un composant ou écrire une condition sur `animeId` pour qu'un
monde ait « son » look, c'est que le mécanisme de teinte/motif n'est pas assez exploité — pas
une raison d'ajouter du code spécifique.

---

## 3. Système de couleur

Le thème clair/sombre (`styles.css:1-71`, documenté dans `docs/ui.md`) reste la seule source de
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

Tokens ajoutés pour l'habillage (tous définis dans les **trois** blocs, §8) :

| Token | Rôle |
|---|---|
| `--stage-veil` / `--stage-veil-soft` | voile posé sur la bannière AniList pour garder le combat lisible |
| `--enemy-ground` | ombre au sol sous l'ennemi |
| `--world-strength` | à quel point `--world-hue` transparaît (0.2 en clair, 0.32 en sombre) |
| `--world-hue` | teinte du monde courant, posée par les composants — voir §2 |
| `--font-display` | police d'affichage des titres — voir §12 |

---

## 4. Mouvement et interactivité

Le jeu a aujourd'hui trois animations : le pop de dégâts (`rise`, `.pop`), les transitions de
largeur des barres (`.bar-fill`, `width 0.1–0.2s linear`), et le déplacement du marqueur de carte
(`left/top 0.3s ease`). C'est un bon socle à généraliser plutôt qu'à remplacer. Règle commune à
toute nouvelle animation : **respecter `prefers-reduced-motion`**, exactement comme `.pop` le
fait déjà (bascule vers un simple fade, `styles.css:463-472`) — c'est le patron à copier, pas à
réinventer.

**Fait** (tout dans `styles.css`, déclenché par des signaux locaux à `ClickStage.tsx` — aucun
changement moteur, rien dans le tick 200ms) :

| Effet | Où | Déclencheur |
|---|---|---|
| Impact de clic (secousse + flash `--gold`) | `.enemy.hit` | signal posé dans `handleClick`, levé sur `animationend` |
| Entrée de l'ennemi suivant (scale-in) | `.enemy.spawning` | `createEffect` sur l'id de `enemy()` |
| Respiration du sprite (±3px, 3.4s) | `.enemy .sprite` | permanent |
| Aura de boss qui pulse, teintée `--world-hue` | `.enemy.boss::before` | permanent |
| Fade d'overlay + scale-in de modale | `.overlay` / `.modal` | à l'ouverture |
| Notice qui glisse depuis la droite | `.notice` (`notice-in`) | à l'arrivée dans `game.notices()` |
| Coup critique agrandi et teinté `--accent-2` | `.pop.crit` | `game.click()` renvoie `{ damage, crit }` |
| Dégât d'auto-clic, plus discret et teinté `--blue` | `.pop.auto` | `createEffect` sur `game.autoClickPulse()` |

Les classes sont levées sur `animationend` plutôt que par un `setTimeout`, pour qu'un clic rapide
ne laisse jamais une classe collée.

**Nuance assumée sur la mort d'ennemi** : `combat.ts` remplace l'ennemi vaincu par le suivant sur
place, donc il n'y a plus d'ennemi sortant à animer au moment où le composant l'apprend. C'est
l'**arrivée** du remplaçant qui est animée, pas la disparition du précédent. Un vrai fondu de mort
demanderait que `ClickStage` retienne l'ennemi vaincu le temps de l'animation — un état d'affichage
en plus, non fait.

Restent des pistes, non faites :

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
### 4.1 Les notices du HUD (`ui/Notices.tsx`)

Un drop, un recrutement et un arc terminé se produisaient en silence : le seul accusé de réception
était un compteur qui bougeait tout seul dans un panel. `Notices.tsx` est la pile flottante en bas
à droite qui comble ce vide — trois `kind` (`item`, `recruit`, `arc`), chacun reconnaissable à la
couleur de sa bordure gauche (`--blue`, `--gold`, `--good`) et à son icône d'`icons.tsx`. Elle ne
bloque rien et ne se ferme pas : cohérent avec « tout visible », contrairement à une modale.

La file vit dans le store (`gameState`'s `notices`), pas dans le composant, parce que les trois
événements naissent dans le moteur (`grantItem`, `defeat`) et qu'un composant n'a aucun moyen de
les observer autrement. Elle est **purgée par le tick 200ms existant**, pas par un `setTimeout` par
notice — aucun timer ne peut survivre au store — et plafonnée à `MAX_NOTICES` (4), la plus vieille
tombant en premier. Un clic sur une notice la retire tout de suite (`dismissNotice`).

Le clavier compte aussi : `.stage` porte `role="button"` + `tabindex="0"` et répond à espace/entrée
(`ClickStage`'s `handleKey`), le Clic du Narrateur étant le verbe central du jeu. Le pop naît alors
au centre de la scène faute de coordonnées de pointeur, et `.stage:focus-visible` donne l'anneau de
focus qu'un `<div>` cliquable n'a pas.

L'auto-clic frappe à **pleine puissance de clic** ; ce que ses niveaux achètent, c'est la *cadence*
(2s → 0,8s), pas la force. C'est ce qui en fait un effet qu'on voit et qu'on entend battre, au lieu
d'un pourcentage invisible. Il suit la même règle que le reste : **ce qui frappe doit se voir**.
Il produit donc son propre pop de dégâts, volontairement distinct de celui du joueur (plus petit,
`--blue`, sans le `!` du critique) et posé près de l'ennemi avec une légère dispersion — il n'a
aucun curseur derrière lui. L'interrupteur `.auto-toggle` vit dans le `panel-head` du Combat,
c'est-à-dire là où l'effet se produit, et n'apparaît qu'une fois le nœud acheté : un interrupteur
pour quelque chose qu'on ne possède pas est du bruit.

### 4.2 Lire sa progression d'un coup d'œil

Quatre lectures manquaient, toutes ajoutées sans nouveau vocabulaire visuel :

- **Temps de mise à mort** collé au label de la barre de PV (`ClickStage`) — c'est déjà là que
  l'œil va pour juger si un combat avance. `∞` quand l'équipe ne fait aucun DPS.
- **Marqueur « trop dur »** (`.arc-hard`, fond `--bad`) sur un arc ouvert dont le boss dépasse son
  propre chrono, plus le détail en `title` : le chrono du boss est le seul mur du jeu, donc la
  seule chose qui mérite un avertissement. Voir `bossOutlookOf` dans `docs/combat.md`.
- **Tuile de crossover qui pulse** (`.currency.advised`) quand dépenser des cristaux paierait
  vraiment — l'équipe combat hors de son monde. Sans ça le stock ne bougeait jamais.
- **État de la sauvegarde** dans la topbar (`.save-state`) : un autosave silencieux est
  indiscernable d'un autosave cassé.

Et la barre de capacités distingue enfin trois états au lieu d'un seul gris : `actif`
(`.ability.running`, bordure `--good`), `bloquée Ns` (`.ability.blocked`, bordure tiretée, texte
`--bad`) et la recharge normale. Deux capacités ne peuvent pas booster la même statistique en même
temps — c'est voulu, le cumul a été essayé et rejeté comme trop puissant — donc le `title` nomme la
coupable : « Bloquée par « X » (12s) ». Le tri « prêtes d'abord » est **binaire** et pas par temps
restant, sinon les boutons glissent sous le curseur à chaque tick de 200ms.

Ce qu'on **n'ajoute pas** : rien qui bloque l'input (pas d'animation qui empêche d'enchaîner les
clics), rien qui ralentisse la boucle de tick 200ms (`gameState.ts`), pas de dépendance externe —
tout en CSS/`@keyframes` ou signaux Solid, comme l'existant.

---

## 5. L'arbre de prestige

`prestigeTree.ts` porte la logique (types, coûts, effets, wiring dans `gameState.ts`) ;
`PrestigeTree.tsx` est la vue, construite en suivant cette section. Le schéma de référence donné
(arbre à colonnes, nœuds ronds reliés par des lignes, rang `x/y` sous chaque nœud, nœud final plus
gros) a inspiré l'anatomie d'un nœud (§5.2) et la technique de rendu (SVG + nœuds positionnés en
absolu, comme `WorldMap`'s `.map-links`) ; la disposition réelle a été simplifiée par rapport au
schéma — voir §5.3.

### 5.0 La porte d'entrée : le bouton « Arbre de prestige »

Dans le panneau Prestige, deux boutons se suivent, et ils ne jouent pas le même rôle : le CTA
`Prestige (+N)` est l'action **destructrice et rare** (elle efface la run), l'arbre est la vue
**qu'on ouvre souvent**. D'où le contraste assumé — un seul bouton plein a le droit au dégradé, et
c'est le CTA ; `.tree-open` est un bouton à contour (`--accent`, fond transparent, fond `--active-tint`
au survol). Deux remplissages côte à côte se disputeraient l'œil et rendraient le reset trop facile
à cliquer par réflexe.

Il est en **pleine largeur comme le CTA** : les deux forment une paire alignée au lieu d'une grosse
barre suivie d'une pastille orpheline. Il porte à gauche l'étincelle des points de prestige — le même
glyphe que le compteur du `.panel-head` juste au-dessus, pour que le lien « voilà où ces points se
dépensent » soit visible sans le lire — et à droite un chevron, qui signale une vue qui s'ouvre et
non une action qui s'exécute. Même logique que les tuiles de `CurrencyBar` : aucun compteur n'est un
cul-de-sac.

### 5.1 Cinq branches, pas une par personnage

Une branche par cible de progression, chacune avec sa teinte propre (dérivée de la palette
fonctionnelle, pas de la DA par anime — l'arbre de prestige est un système méta, hors monde) :

| Branche | Icône | Teinte | Ce qu'elle améliore |
|---|---|---|---|
| **Clic du Narrateur** | curseur/étincelle | violet (`--accent`) | `clickPower`, autoclicker, critiques, cooldown des actifs |
| **DPS Équipe** | épée/éclair | rouge (`--accent-2`) | `teamDps`, dégâts et durée des actifs, malus de synergie, timer boss |
| **XP** | étoile/livre | or (`--gold`) | gain d'xp, courbe de niveau, bonus de recrutement |
| **Objets** | coffre/marque-page | bleu (`--blue`) | drop d'objets, coût des rangs de passif, pity timer |
| **Ressource** | pièce/balance | vert (`--good`) | monnaie gagnée, palier de prestige, coût de déblocage d'anime |

Chaque branche a son propre en-tête façon `.panel-head` : nom, icône, et le total de niveaux
achetés sur 25 (`branchLevelsOf`, affichage seulement — 5 nœuds × 5 niveaux, voir §5.2). La liste
exacte des 5 nœuds par branche vit dans `prestigeTree.ts` (`PRESTIGE_TREE_CATEGORIES`) — ne pas la
dupliquer ici, ce tableau ne donne que l'intention de chaque branche.

### 5.2 Anatomie d'un nœud : rachetable, pas un achat unique

Chaque nœud n'est plus un achat one-shot : il se rachète jusqu'à 5 fois, et chaque niveau ajoute
exactement le même effet que le précédent (ex. "+8% de dégâts au clic" à chaque niveau — niveau 5
= +40%). Reprend le vocabulaire déjà utilisé pour les rangs de passif (`RosterPanel`'s `.rank-up`,
`passiveUpgradeOf`) plutôt que d'inventer un second système d'amélioration :

- **Cercle** avec icône, taille standard pour un nœud normal, plus grand (~1.4×) pour le 5ᵉ nœud
  de chaque branche (le « keystone » — le nœud le plus fort et le plus cher à maxer de la chaîne,
  comme le grand cercle en bas de chaque colonne du schéma de référence).
- **Deux badges** sur le nœud actif (celui en cours de montée) : le niveau atteint au-dessus
  (`${level}/5`), le coût du prochain niveau en dessous — même position que le badge de coût des
  nœuds verrouillés, qui n'affichent que celui-là.
- **Trois états visuels**, par bordure + remplissage (pas par une couleur totalement différente —
  la teinte de la branche reste identifiable dans les trois états) :
  - *verrouillé* (le nœud précédent de la branche n'a encore aucun niveau acheté — voir §5.3) :
    contour gris `--line`, icône à `opacity: 0.35` (même traitement que `Sprite`'s `.dim` /
    `IconLock` déjà utilisé partout ailleurs) ;
  - *actif* (le nœud précédent a au moins 1 niveau, celui-ci est entre 0 et 4 sur 5) : contour
    coloré de la branche, non rempli, cliquable — plusieurs nœuds d'une même branche peuvent être
    actifs en même temps ;
  - *maxé* (niveau 5/5) : contour + fond pleins, plus un léger halo (`box-shadow`), comme
    `.enemy.boss` aujourd'hui.
- **Interaction** : clic sur un nœud actif = achète son niveau suivant, bouton identique dans
  l'esprit à `.rank-up` (`+1 · coût`), désactivé si le solde de prestige est insuffisant
  (`purchaseTreeLevel(branche, position)`/`nodeCostOf`). Chaque nœud actif ajoute une ligne de
  légende sous sa colonne — "Niveau X/5 — {description}" — pas de tooltip caché au survol pour
  l'info principale, cohérent avec §1 (rien de crucial derrière un hover) ; `title` sur le nœud
  reste un bonus pour la souris. La description vient telle quelle de `PrestigeTreeNode.description`
  (`prestigeTree.ts`) — l'arbre ne doit pas inventer une deuxième façon de décrire un effet.

### 5.3 Disposition, déblocage et monnaie

- **Une seule monnaie** : `PrestigeState.prestigePoints` reste le seul solde (✦), déjà affiché
  dans `CurrencyBar`. Pas de sous-monnaie par branche.
- **Chaîne, pas un arbre ramifié — mais un seul niveau suffit à ouvrir le nœud suivant.**
  Contrairement au schéma de référence (tronc commun, fourche, reconvergence), chaque branche
  reste une colonne de 5 nœuds ; la différence avec une vraie chaîne stricte est que le nœud N+1
  s'ouvre dès que le nœud N a **au moins 1 niveau** acheté (`isNodeUnlocked`), pas besoin de le
  maxer à 5/5. Ça laisse le joueur étaler ses points sur toute une branche avant de revenir maxer
  un nœud précis — le choix se fait autant *entre* les 5 branches qu'*à l'intérieur* de chacune.
  Une colonne par branche, un nœud par position, reliés par une ligne verticale unique
  (`WorldMap`'s `.map-links`, ligne `unlocked`/`locked` selon `isNodeUnlockedFor`), sans fonction
  de layout dédiée : la position d'un nœud est directement `(colonne = index de branche, ligne =
  position - 1)`.
- **Le coût se réinitialise à chaque nœud** (pas la formule de `passiveRankCost`, dont la base
  6/×1.5 est pensée pour une monnaie de run — objets — pas la monnaie de prestige, beaucoup plus
  rare) : chaque nœud a ses 5 niveaux à `2, 3, 5, 8, 13` points — même ratio de croissance (~×1.6)
  que `passiveRankCost`, mais réutilisé identiquement à l'intérieur de *chaque* nœud plutôt qu'une
  seule fois pour toute la branche. Un nœud entièrement maxé coûte 31 points ; une branche entière
  (5 nœuds), 155 ; les 5 branches, 775 — un objectif de très nombreux cycles de prestige, pas d'un
  seul run.
- **Le contenu de `.prestige-tree` défile dans son propre scroll** (`overflow-y: auto`,
  `max-height: 78vh`, sous le `.panel-head` fixe de la modale) : avec le déblocage à 1 niveau, une
  branche peut avoir jusqu'à 5 nœuds actifs à la fois, donc jusqu'à 5 lignes de légende empilées
  sous chaque colonne — sans ce scroll interne, `.modal`'s `overflow: hidden` (§8) rendait le bas
  de l'arbre invisible et inatteignable dès que plusieurs branches étaient ouvertes en parallèle.

### 5.4 Ce que ça implique côté moteur (fait)

- `ModifierTarget` (`types.ts:4`) est resté `"clickPower" | "teamDps"` — **non élargi**. Sur les
  25 nœuds de l'arbre, seuls deux (le nœud 1 de Clic du Narrateur et de DPS Équipe, un simple
  pourcentage permanent qui se multiplie par le niveau atteint) passent par `computeEffectiveStat`
  via `prestigeTreeContributions`, exactement comme `achievementContributions`. Le reste
  (autoclicker, critique, réduction de cooldown au clic, actif gratuit, adoucissement de synergie,
  durée/dégâts d'actif, timer boss, xp passive, courbe d'xp, bonus de recrutement, xp de boss,
  taux de drop, double drop, pity timer, butin fantôme, coût de rang de passif, gain de monnaie,
  palier de prestige, bonus d'arc nettoyé, remise de déblocage, doublement de prestige) est un
  événement ou un multiplicateur lu directement au point d'usage (`gameState.ts`, `growth.ts`,
  `prestige.ts`), sa magnitude multipliée par `nodeLevelOf(branche, position)` — ces effets n'ont
  pas de notion de `base` sur laquelle `computeEffectiveStat` pourrait s'appuyer (un intervalle
  d'autoclicker ou une chance de critique n'est pas un flat/percent/multiplier). Les effets à
  pourcentage/remise sont bornés (`scaledChance`, `scaledDiscount` dans `prestigeTree.ts`) pour
  qu'un niveau élevé ne pousse jamais une chance au-delà de 100% ni un coût à zéro ; la courbe d'xp
  a son propre plancher (`MIN_XP_GROWTH`) pour ne jamais casser la formule géométrique.
- **`prestigeTreeRanks` est un signal séparé dans `gameState.ts`** (`Record<string, number[]>`,
  clé = id de branche, valeur = les 5 niveaux du nœud 1 à 5 de cette branche), pas un champ sur
  `PrestigeState` (`prestige.ts` reste une structure pure `{ prestigePoints, unlockedAnimeIds }`,
  testable sans connaître l'arbre). Un tableau par branche plutôt qu'un seul nombre plat, parce que
  le déblocage à 1 niveau (§5.3) permet à plusieurs nœuds d'avancer indépendamment — un flat
  `0..25` ne peut représenter que « les N premiers niveaux dans l'ordre », pas « nœud 1 à 2/5,
  nœud 3 à 1/5, le reste à 0 ». Même patron que `achievementCounts` : une progression méta de plus,
  à côté de `PrestigeState` plutôt que dedans.
- **Persistance : l'arbre survit à `prestigeReset`.** Contrairement à la monnaie dépensée sur
  `unlockAnime` (qui rouvre au monde de départ à chaque run), les niveaux achetés dans l'arbre sont
  la progression permanente que le prestige est censé nourrir. Seul `hardReset` l'efface, comme
  `achievementCounts`. La forme de `prestigeTreeRanks` a changé deux fois de suite en construisant
  cette fonctionnalité (nœuds bought booléens → total plat 0..25 → tableau de 5 niveaux) ; la clé
  de sauvegarde a suivi chaque fois (`v7` → `v8` → `v9`) plutôt que de laisser une ancienne
  sauvegarde mal réinterpréter des valeurs qui ne veulent plus dire la même chose.
- **Piège trouvé en construisant la vue** : `icons.tsx`'s `icon()` évaluait son JSX une seule fois
  au chargement du module — en SolidJS ça matérialise un vrai nœud DOM partagé, donc afficher la
  même icône à plusieurs endroits en même temps (25 nœuds réutilisant 5 icônes) ne montrait que la
  dernière instance montée. Corrigé en passant `body` comme fabrique (`() => JSX.Element`) appelée
  à chaque rendu plutôt qu'une valeur JSX capturée une fois — vaut pour toute future icône.

---

## 6. Sourcing d'images (personnages, mondes)

Portraits fetchés en direct depuis AniList, **dans le navigateur du joueur** (`ui/anilist.ts` +
`ui/Sprite.tsx`, voir `docs/ui.md`). Décision explicite de l'utilisateur : ni SVG dessiné à la main,
ni pixel-art généré, ni fichier custom déposé dans le repo — chaque `Character`/`Enemy`/`Anime` a
déjà un `.name` lisible, une recherche AniList par nom suffit, pas besoin de gérer des fichiers
d'assets du tout.

### 6.1 APIs disponibles

| API | Couverture | Clé requise | CORS navigateur | Limite |
|---|---|---|---|---|
| **AniList GraphQL** | anime + personnages, données très riches | non | **oui, depuis le navigateur d'un joueur** — voir note ci-dessous | ~90 req/min |
| **Jikan v4** (proxy non officiel de MyAnimeList) | anime (jaquette/bannière) + personnages (portrait) | non | oui, appelable directement en `fetch()` | ~60 req/min, 3 req/s |
| **Kitsu** | anime + personnages | non | partiel, à revérifier au cas par cas | non documentée précisément |

[Jikan v4 Docs](https://docs.api.jikan.moe/), [AniList API Docs](https://docs.anilist.co/) —
sources consultées pour ce tableau.

**Correction par rapport à une version précédente de ce document** : AniList avait été écarté ici
comme "nécessite un proxy/backend, pas de CORS navigateur". C'était faux, ou du moins incomplet —
confirmé par le projet sœur [Rasengames](https://github.com/Loris01100/Rasengames), qui appelait
AniList *depuis son Cloudflare Worker* et se faisait bannir (`403 "You have been manually
blocked"`) : les quelques IP de sortie partagées par les Workers sont blacklistées par AniList, peu
importe le débit. Un appel direct **depuis le navigateur de chaque joueur** fonctionne, chaque
joueur utilisant sa propre IP — c'est exactement l'usage que le CORS d'AniList autorise. Puisque
ClickerAnime est déjà une SPA statique sans serveur (`Vite` + `localStorage`, voir « Persistence »
dans `docs/ui.md`), cet appel se fait naturellement depuis le navigateur : pas de proxy à ajouter.

### 6.2 Comment c'est intégré

`ui/anilist.ts` (voir le détail dans `docs/ui.md`) fait l'appel au moment de l'affichage, pas en
amont : `portraitUrl(name, kind)` interroge `Character(search:)`/`Media(search:type:ANIME)`,
déduplique les requêtes concurrentes en mémoire, et garde les portraits trouvés dans `localStorage`
pour ne jamais re-télécharger la même soixantaine de portraits à chaque rechargement (l'art d'un
personnage ne change pas, donc pas d'expiration). C'est délibérément un renversement du principe
« pas de dépendance réseau au runtime » tenu ailleurs dans ce document (§4) — accepté ici en échange
de portraits réels sans travail de contenu par personnage, et rendu supportable par le fait que
`Sprite.tsx` dégrade toujours proprement (`.sprite-empty`, jamais un layout cassé ni une exception)
si AniList est indisponible ou ne trouve rien. Ce repli n'est pas une case vide : il porte une
silhouette (`IconSilhouette`) teintée en `--world-hue`, parce qu'un bon quart des ennemis d'arc sont
anonymes par construction (« Garde de Kiri », « Voie de l'Insecte ») et n'auront jamais de fiche
AniList — une ombre générique se lit comme un figurant, un carré gris se lit comme un bug.

**La bannière d'un monde, en plus des portraits.** `bannerUrl(nomDeLAnime)` récupère la clé d'art
large d'un show (`Media.bannerImage`) et sert de décor à la scène de combat — l'équivalent de la vue
de ville de PokéClicker (§1, §2). Elle **réutilise toute la mécanique existante** plutôt que d'en
ouvrir une seconde : `resolveMediaId()` (donc `ANIME_ID_OVERRIDES`, indispensable — une recherche
texte sur cette franchise tombe régulièrement sur un film au titre voisin), `runQuery`, la map
`inFlight` et le même store `localStorage`, sous la clé `banner:<nom>`. Pas de bump de `CACHE_KEY` :
une clé nouvelle rate simplement au premier accès. Même contrat que `portraitUrl` — ne rejette
jamais, `null` sur tout échec, **et un show peut légitimement n'avoir aucune bannière**. `ClickStage`
ne rend l'élément que quand l'URL existe, donc l'absence retombe silencieusement sur le dégradé
`--stage-bg` teinté par le monde.

**Piège d'orthographe à surveiller** : le nom canonique AniList d'un personnage peut différer du nom
localisé en français des données du jeu (AniList connaît « Sasuke Uchiha », les données du jeu
disent « Sasuke Uchiwa » — ancien doublage FR). Corrigé au cas par cas via `NAME_OVERRIDES` dans
`anilist.ts`, à étendre quand un nouveau personnage ne matche pas.

**Amélioration future documentée, pas un blocage actuel** : la recherche par nom peut se tromper
sur un homonyme (Rasengames a eu le cas avec « King » qui renvoyait Lelouch, alias « Black King »).
Rasengames corrige ça en résolvant une fois l'id numérique AniList de chaque entrée et en
interrogeant `Character(id:)` ensuite. Le casting de ce jeu est assez connu pour que ce risque soit
faible en pratique ; si un mauvais match apparaît, la même solution (stocker un `anilistId` optionnel
sur `Character`/`Enemy`/`Anime`, résolu une fois à la main) s'applique directement.

### 6.3 Point d'attention légal

Les images servies par Jikan/AniList sont les jaquettes et artworks officiels de MyAnimeList —
donc du contenu sous droit d'auteur des ayants droit de chaque anime, pas du contenu libre de
droits. Acceptable pour un prototype personnel/non-commercial comme celui-ci ; à re-vérifier
avant toute mise en ligne publique ou monétisation. Ce n'est pas un frein technique mais une
décision produit — à trancher par l'utilisateur, pas par ce document.

---

## 7. Outils MCP externes pour accélérer le design

Deux serveurs MCP sont disponibles côté Claude Code (`.mcp.json`, scope projet) pour accélérer la
production visuelle. Ce sont des outils de session de dev, pas des dépendances du jeu — tout ce
qu'ils produisent est revu, éventuellement retravaillé, puis committé comme fichier statique ou
code écrit à la main.

- **Higgsfield MCP** (`higgsfield`, https://mcp.higgsfield.ai, OAuth) — génération d'images/vidéos
  custom. **Sans point d'intégration actuel** : son usage prévu ici (générer un artwork original
  pour un id sans équivalent exploitable — boss inventé, monde sans licence — et le déposer sous
  `src/assets/sprites/<id>.<ext>`) dépendait du mécanisme de surcharge locale que §6 vient de
  retirer entièrement au profit du fetch AniList direct. Pour `naruto.ts`, le besoin a été couvert
  autrement (les ennemis inventés ont été renommés en vrais personnages mineurs de l'anime, pour
  qu'AniList ait quelque chose à renvoyer). S'il faut un jour de l'art pour quelque chose qui n'a
  vraiment aucun équivalent réel (un monde sans licence, par exemple), Higgsfield reste l'outil
  approprié, mais ça demandera de redonner à `Sprite.tsx` un point d'entrée pour de l'art déposé à
  la main — à concevoir à ce moment-là plutôt que maintenu ici en l'air.
- **21st.dev** — catalogue de composants React avec, pour chacun, un prompt prêt à coller dans un
  agent IA pour le reconstruire. Utile comme **point de départ visuel/structurel** pour un panel
  qu'on peine à esquisser (disposition d'un tableau, d'un tooltip, d'un toast — voir §4 « Notification
  de recrutement »), jamais comme source à copier telle quelle : le projet n'a pas de dépendance UI
  (`CLAUDE.md` : « un `src/styles.css` écrit à la main, pas de framework UI ») et toute vue générée
  via un prompt 21st.dev doit être retraduite en `.panel`/`.panel-head`/tokens CSS du thème (§3, §7)
  avant d'entrer dans le repo — pas de classes Tailwind ni de palette propre au composant copié.

---

## 8. Conventions UI/UX à respecter pour toute nouvelle vue

- **Un panel = `.panel` + `.panel-head`.** Titre à gauche, info secondaire (compteur, select,
  chip) à droite. Ne jamais empiler un titre au-dessus d'un tableau sans cet en-tête.
- **Tout panel est repliable**, sans exception : le `<span>` du titre est remplacé par
  `<PanelTitle>` (`ui/PanelTitle.tsx`) — même position à gauche du `.panel-head`, un `IconChevron`
  qui pivote à -90° replié (`.panel-title .icon.collapsed`) devant le libellé — et le corps du
  panel va dans un `<Show when={open()}>` juste en dessous. L'état est un signal local au
  composant (pas de partage entre panels, pas de persistance — replier est une commodité
  d'affichage, pas un réglage à sauvegarder) ; un panel généré par un `<For>` (un par monde
  débloqué dans `ProgressPanel.tsx`) garde un état par instance via un `Record<id, boolean>`
  plutôt qu'un signal booléen unique. L'info secondaire à droite du header (compteur, select,
  difficulté) reste toujours visible, seul le corps se replie. Tout nouveau panel doit suivre ce
  patron dès sa création — ne pas en ajouter un en `<span>` nu qu'il faudrait reconvertir plus
  tard.
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
- **Un badge collé à un texte de longueur libre est un bloc atomique.** Une pastille multi-mots
  (`.arc-hard` « trop dur », et toute future du même genre) se met en `inline-block` +
  `white-space: nowrap`, jamais en `inline` : sinon le navigateur a le droit de couper *à
  l'intérieur*, et le fond coloré se peint en deux morceaux sur deux lignes. Le bon comportement est
  que le badge bascule entier à la ligne suivante. `.portal-badge` est déjà couvert par son
  `inline-flex`. Un badge d'un seul mot ne risque rien, mais autant appliquer la règle partout.
- **Un nom de monde ne se fait jamais tronquer.** La colonne de gauche du portail
  (`.portal` `grid-template-columns`) est dimensionnée pour que le nom tienne en entier à côté de
  son badge de statut, pas pour être serrée : elle est passée de 240px à **280px** quand
  « Naruto Shippūden » s'est retrouvé coupé en plein mot, sans ellipse (le nom réclamait 107px pour
  96px disponibles). Le choix assumé est d'élargir la colonne plutôt que d'ajouter une ellipse —
  un monde s'identifie par son nom complet. À revoir si un titre bien plus long arrive (un
  « Boruto : Naruto Next Generations » ne tiendra dans aucune largeur raisonnable, et demandera
  alors un vrai arbitrage : ellipse, passage sur deux lignes, ou nom court dans les données).
  **Arbitrage rendu quand Boruto est arrivé : c'est le nom court dans les données.** Le monde
  s'appelle « Boruto », point. Ni champ `shortName` de plus sur `Anime`, ni cas particulier dans le
  CSS, ni ellipse — et la règle du dessus tient toujours telle quelle : un nom de monde ne se fait
  jamais tronquer, parce qu'aucun nom de monde n'est trop long. Un futur monde au titre à rallonge
  se règle pareil, dans les données, pas dans la mise en page.
- **Toute animation respecte `prefers-reduced-motion`.**
- **En dessous de 1100px les trois colonnes s'empilent, et le combat passe en premier.**
  `.game > .column:nth-child(2) { order: -1 }` : dans l'ordre du DOM, la colonne du milieu arrive
  après tout le roster (capacités + tableau d'équipe + objets), ce qui enterrerait la seule chose
  que le joueur regarde. Une colonne ajoutée un jour doit reprendre cet arbitrage, pas l'ordre du
  DOM.
- **Une action destructive porte `button.danger`** (bordure et texte `--bad`) **et demande une
  confirmation** : le prestige (`ProgressPanel`) comme le « Tout effacer » de la topbar. Le second
  vit dans la topbar plutôt que dans un panel parce qu'il est aussi la sortie de secours d'une save
  cassée, et la topbar est le seul élément affiché dans tous les états, portail des mondes compris.
- **Une préférence d'affichage ne va pas dans la save.** Le tri et le filtre par monde de l'équipe
  vivent sous leur propre clé `localStorage` (`clicker-anime:roster-view:v1`, lecture et écriture
  dans un `try`), pas dans `SaveFile` : elles survivent au rechargement et au prestige sans imposer
  un champ de plus au format de sauvegarde, et une valeur illisible retombe simplement sur le
  défaut.
- **Le texte visible est en français**, y compris les nouveaux tooltips/labels de l'arbre de
  prestige — l'engine, lui, reste en anglais (identifiants, commentaires).

---

## 9. Écran Succès et export/import de save

Deux ajouts récents, tous deux volontairement sans nouveau vocabulaire visuel — la preuve que la
densité PokéClicker (§1) et le principe de réutilisation (§8) tiennent même pour un système inédit.

- **`AchievementsPanel.tsx` réutilise le patron de `Codex.tsx` à l'identique** : `.overlay` +
  `.modal`, contenu dans `.codex-detail.scroll` (pas de nouvelle classe de conteneur scrollable),
  chaque catégorie un `.codex-block` (titre + séparateur), chaque palier une `.codex-row` — le même
  vocabulaire que les rangs de passif du Codex. La barre de progression vers le prochain palier est
  `.bar.xp-bar`, la même barre fine déjà utilisée pour l'xp des personnages. Aucune couleur, classe
  ou animation n'a été ajoutée pour cet écran ; c'est le test du §2 appliqué à un système au lieu
  d'un monde : si l'écran a besoin d'inventer sa propre DA, c'est que la réutilisation a été
  abandonnée trop tôt. Passer de 5 à 13 échelles n'a rien changé à l'écran : la liste vient de
  `ACHIEVEMENT_CATEGORIES` et la ligne de palier lit `category.target` pour dire quelle stat le
  bonus alimente (clic ou dps d'équipe), via `describeModifier` — aucun style par catégorie.
- **Le bouton `Succès` de la topbar** utilise `IconTrophy` (déjà dans `icons.tsx`, jusque-là
  inutilisé) — même gabarit que les boutons `Codex`/`Mondes` voisins, aucun style de bouton dédié.
- **Exporter/Importer** sont des boutons texte sans icône ni mise en avant particulière dans la
  topbar, comme leurs voisins — l'export d'une sauvegarde n'est pas une action plus "importante"
  visuellement, seulement plus rare. L'input de fichier caché derrière `Importer` n'a pas de style
  propre (`display: none`), le `<button>` visible est ce qui capte le clic. La topbar n'a plus de
  bouton `Sauvegarder`/`Réinitialiser` : l'autosave (`gameState`, toutes les 5s) rend le premier
  redondant, et le hard reset reste une action du moteur (`game.hardReset`) sans point d'entrée UI
  pour l'instant plutôt qu'un bouton risquant un clic accidentel.

---

## 10. Aucun glyphe unicode nu — tout passe par icons.tsx

Ancienne dette réglée en une passe : `◆`, `✦`, `★`/`☆`, `⏱`, `‹`/`›` et `✓` vivaient encore en
texte brut dans plusieurs vues alors que `icons.tsx` existe précisément pour éviter ça (§0 de ce
fichier, et le commentaire en tête d'`icons.tsx` : « remplaçant l'emoji de plateforme, pour que
chaque glyphe s'affiche identiquement »). Tous remplacés par des SVG du même style (`viewBox`
24×24, `currentColor`, un seul `<path>` ou `<g>` simple) : `IconDiamond` (monnaie principale),
`IconSparkle` (points de prestige — quatre branches, volontairement distinct de la rareté à cinq
branches), `IconStarOutline` (rareté secondaire, à côté de l'`IconStar` déjà plein pour les
personnages principaux), `IconClock` (minuteur de boss), `IconChevronLeft`/`IconChevronRight`
(stepper d'arc), `IconCheck` (monde/arc terminé). Coloration par classe utilitaire sur l'icône
elle-même (`.icon.gold`, `.icon.blue`, `.icon.good` — même patron que `.coin.gold`/`.coin.violet`
déjà en place pour la ligne de ressources), jamais de couleur câblée dans le SVG. Toute nouvelle
vue qui a besoin d'un symbole (monnaie, statut, direction, coche) doit chercher d'abord dans
`icons.tsx` avant d'écrire un caractère unicode — c'est la règle que ce ménage vient de faire
respecter partout.

## 11. Boutique et cristaux de crossover (overlays)

Les deux se lancent depuis la barre **Ressources** : chaque tuile de `CurrencyBar` est un
`<button class="currency">` qui ouvre l'endroit où cette ressource se dépense (or → Boutique,
prestige → Arbre, cristaux → Crossover, points de pack → Packs). C'est la seule navigation qu'a le
joueur entre une monnaie et son puits, donc aucune tuile ne doit rester inerte. La quatrième tuile
affichait avant le nombre de mondes terminés — un compteur inerte, doublon du bouton « Mondes » de
la topbar ; elle porte maintenant les points de pack (§11.2).

`ShopPanel.tsx` est un **overlay** (`.overlay` > `.modal`, fermé par ✕/Échap/clic dehors) comme le
portail des mondes, plus un bouton `<IconShop /> Boutique` dans la topbar — la colonne de droite
était déjà pleine et le tiroir laisse la place de lister de vraies offres. Le contenu garde le
vocabulaire du reste de l'app plutôt qu'un système dédié :

- **Une ligne = `.row` + `.name`**, le patron déjà utilisé par « À battre ici » et « Voyager » :
  sprite ou `IconBookmark` à gauche, coût à droite dans un `<button>` (`{cout} <IconDiamond
  class="coin gold" />`), ou un `<IconLock />` + le nom du monde requis quand l'offre est encore
  verrouillée — même widget que les nœuds d'arc verrouillés de `ProgressPanel`/`WorldMap`.
- **Rien à vendre = une ligne muette** dans l'overlay : un tiroir ouvert exprès par le joueur ne
  doit jamais être vide sans explication (contrairement à l'ancienne version en colonne, qui se
  cachait entièrement).
- **Une offre personnage achetée disparaît** de la liste affichée (filtrée sur `owned` côté UI) ;
  une offre objet reste affichée indéfiniment puisque les objets s'empilent. `game.shopOffers()`
  lui-même ne filtre rien — il renvoie l'état complet (`locked`/`owned`/`affordable`) pour que le
  composant décide de l'affichage, même patron que `passiveUpgradeOf`.
- **Contenu actuel = placeholder.** `data/index.ts` ne définit que deux offres d'exemple pour
  prouver le mécanisme (une copie d'objet sans condition, un personnage de Shippûden débloqué une
  fois Naruto terminé) — le vrai contenu (quels personnages, quels objets, quels coûts) reste à
  concevoir. Un personnage acheté doit malgré tout rester recrutable au combat quelque part :
  `engine.test.ts` impose qu'aucun personnage ne soit "recrutable nulle part", donc une offre
  boutique est un raccourci payant vers quelqu'un qu'on peut aussi obtenir en jouant, jamais un
  recrutement exclusif à la boutique.

### 11.1 Cristaux de crossover

`CrossoverPanel.tsx`, même coque d'overlay, ouvert par la tuile bleue (qui remplace l'ancien compteur
d'objets — les objets se lisent déjà dans le panneau « Objets » de la colonne de gauche). Trois blocs
`.codex-block`, dans l'ordre où la question se pose :

1. **La réserve** et d'où elle vient (12% par mob, 5 par boss, uniquement en équipe multi-mondes).
2. **L'équipe**, un `.codex-row` par monde représenté — c'est le diagnostic : si un seul monde est
   listé, la ligne muette explique que la source est coupée.
3. **Fusion des mondes**, le bouton `.primary` d'activation (coût + durée), remplacé pendant la
   fenêtre par le décompte en secondes.

La tuile Ressources prend `.currency.active` (fond `--active-tint`) tant que la fenêtre est ouverte :
c'est un buff temporaire, il doit se voir sans ouvrir le tiroir.

### 11.2 Packs et doublons

`PackPanel.tsx`, même coque d'overlay, ouvert par la tuile verte. C'est la réponse au « mes premiers
personnages ne servent plus à rien » : un personnage ne se recrute qu'une fois (refaire son arc ne
le redonne jamais), donc les **doublons** ne s'obtiennent que là.

- **Une monnaie par monde**, +1 par combat gagné dans ce monde. La tuile Ressources suit l'arc actif
  et affiche donc le solde du monde où on se bat — elle change de valeur en voyageant, c'est voulu.
- **Deux packs par monde** : cast principal (500) ou secondaire (250), tirage uniforme dans le cast
  de ce monde à cette rareté. Pas d'animation d'ouverture : juste la carte du résultat (`.pack-result`,
  bordure et fond teintés par `--world-hue` du monde du personnage tiré) avec son portrait `Sprite`
  et son total de copies. Une pioche est instantanée, l'attente n'ajouterait rien.
- **Chaque doublon = +25% des dégâts de base** du personnage (clic et DPS), sans plafond, empilé
  multiplicativement avec les niveaux. C'est ce qui garde un personnage de départ pertinent tard.
- **Méta-progression** : points et doublons survivent au prestige (seul `hardReset` les efface), au
  même titre que les succès et l'arbre. Un doublon tiré sur un personnage pas encore rencontré n'est
  donc jamais perdu — il l'attend au recrutement suivant.
- **Liste des doublons** en bas du tiroir, triée par nombre de copies, avec le bonus cumulé en clair.

### 11.3 Codex des objets

Deuxième onglet du Codex (`.tabs`, la même bande que les onglets de la carte), pas un overlay de
plus : la coque à deux volets et les classes `.codex-*` sont réutilisées telles quelles, seul le
contenu change. `ItemCodex.tsx` rend directement les deux volets, sans wrapper, pour que la grille
`.codex` garde ses deux colonnes.

- **Liste groupée par monde** (l'arc d'où l'objet tombe), les objets sans source dans un groupe
  « Hors monde » en fin de liste. Un objet jamais trouvé est `.unmet` comme un personnage jamais
  rencontré ; sinon la colonne de droite affiche le nombre de copies.
- **Pas de portrait** : les objets n'existent pas sur AniList. Un glyphe tient lieu d'illustration
  (`IconBookmark` bleu pour un commun, `IconStar` doré pour un unique), agrandi à 40px dans le hero.
- **Le détail répond aux questions du joueur dans l'ordre où il se les pose** : d'où ça tombe (arc,
  ennemi, chance), puis à quoi ça sert — les passifs qu'un commun monte avec leur rang actuel, ou
  pour un unique ses effets, son porteur du moment et sa restriction éventuelle.
- **Le bouton `.rank-up` du roster est repris à l'identique** (« +1 · copies/coût »), ici sur chaque
  ligne de passif et dans le bloc Passif de l'onglet Personnages : là où un rang se lit en entier,
  il doit pouvoir s'acheter, sans repasser par le tableau de l'équipe. Une `.codex-row` qui porte une
  action prend `.with-action` : trois colonnes (libellé / valeur / bouton) au lieu du
  `space-between` à deux, sinon les rangs se décalent au gré de la longueur des noms.

## 12. Typographie

`system-ui` partout donnait au jeu un air de tableau de bord plutôt que d'anime. Une **seule** police
d'affichage a été ajoutée, `Zen Kaku Gothic New` (token `--font-display`), et **uniquement sur les
titres** : `.topbar h1`, `.panel-head`, `.arc-current`, `.enemy-name`, `.stage-hint`, `.map-name`,
`.modal h3`. Le corps de texte, les tableaux compacts et tous les chiffres restent en `system-ui` —
la lisibilité des colonnes alignées du §1 prime sur la couleur locale.

Choix d'une famille japonaise plutôt qu'une display latine à fort caractère (type Bebas Neue) parce
que les `.panel-head` tournent à 0.85rem : une display condensée en capitales y détruirait la
densité, là où Zen Kaku Gothic New reste lisible en petit tout en changeant le ton.

**Piège trouvé en l'intégrant, à ne pas refaire** : les entrées CSS par sous-ensemble de
`@fontsource` (`latin-700.css`, `latin-ext-700.css`, …) **n'ont pas de `unicode-range`**. Importer
`latin-700` puis `latin-ext-700` produit donc deux `@font-face` aux descripteurs identiques, et le
dernier gagne pour *tous* les caractères — le poids 700 se retrouvait servi par le sous-ensemble
latin-ext, qui ne contient aucun caractère ASCII. Les quatre `@font-face` sont donc écrits à la main
en tête de `styles.css`, avec leur `unicode-range` explicite, ce qui laisse le navigateur combiner
les deux sous-ensembles et ne télécharger que ce dont la page a besoin. Vite résout les `url()` qui
pointent vers le paquet (`@fontsource/.../files/*.woff2`) et inline les plus petits fichiers.

Sous-ensembles latins seulement : les sous-ensembles japonais de cette famille pèsent des Mo pour des
glyphes que le jeu ne rend jamais. **latin-ext n'est pas optionnel** — « Naruto Shippūden » a besoin
de U+016B, que le sous-ensemble latin de base ne couvre pas.

## 13. Ossature « anime » des surfaces

Le squelette de §2 restait lisible mais fade : des panneaux gris, des boutons plats. Quatre règles,
toutes tokenisées, lui donnent le poids d'une case de manga sans toucher à la densité de §1 :

- **`--ink-shadow`** — bordures de 2px et ombre portée en deux temps (une arête franche + un halo
  diffus). Sur `.panel` et `.primary`. Une surface doit sembler posée sur la page, pas peinte
  dessus.
- **`--speedlines`** — trame diagonale à 115°, portée par les seuls `.panel-head` et `.topbar`.
  C'est une *texture*, jamais une couleur : elle passe donc par un token comme le reste (§3), et
  se retourne en clair/sombre.
- **En-tête de panneau** — dégradé sur `--world-hue`, liseré d'accent en `inset box-shadow` à
  gauche, titre en capitales sur `--font-display` (§12). C'est la seule surface du châssis qui
  affiche la DA du monde en cours.
- **Boutons** — le geste se voit : `translateY(-1px)` + anneau d'accent au survol, `+1px` au clic.
  L'onglet actif est *rempli* du dégradé accent → accent-2, pas seulement souligné.

Ne pas étendre les trames aux corps de panneau ni aux tableaux : elles rendraient illisibles les
chiffres alignés qui font tout l'intérêt de §1.
