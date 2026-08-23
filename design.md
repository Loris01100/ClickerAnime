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

`prestigeTree.ts` porte la logique (types, coûts, effets, wiring dans `gameState.ts`) ;
`PrestigeTree.tsx` est la vue, construite en suivant cette section. Le schéma de référence donné
(arbre à colonnes, nœuds ronds reliés par des lignes, rang `x/y` sous chaque nœud, nœud final plus
gros) a inspiré l'anatomie d'un nœud (§5.2) et la technique de rendu (SVG + nœuds positionnés en
absolu, comme `WorldMap`'s `.map-links`) ; la disposition réelle a été simplifiée par rapport au
schéma — voir §5.3.

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
`ui/Sprite.tsx`, voir `CLAUDE.md`). Décision explicite de l'utilisateur : ni SVG dessiné à la main,
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
dans `CLAUDE.md`), cet appel se fait naturellement depuis le navigateur : pas de proxy à ajouter.

### 6.2 Comment c'est intégré

`ui/anilist.ts` (voir le détail dans `CLAUDE.md`) fait l'appel au moment de l'affichage, pas en
amont : `portraitUrl(name, kind)` interroge `Character(search:)`/`Media(search:type:ANIME)`,
déduplique les requêtes concurrentes en mémoire, et garde les portraits trouvés dans `localStorage`
pour ne jamais re-télécharger la même soixantaine de portraits à chaque rechargement (l'art d'un
personnage ne change pas, donc pas d'expiration). C'est délibérément un renversement du principe
« pas de dépendance réseau au runtime » tenu ailleurs dans ce document (§4) — accepté ici en échange
de portraits réels sans travail de contenu par personnage, et rendu supportable par le fait que
`Sprite.tsx` dégrade toujours proprement (`.sprite-empty`, jamais un layout cassé ni une exception)
si AniList est indisponible ou ne trouve rien.

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
- **Toute animation respecte `prefers-reduced-motion`.**
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
  abandonnée trop tôt.
- **Le bouton `Succès` de la topbar** utilise `IconTrophy` (déjà dans `icons.tsx`, jusque-là
  inutilisé) — même gabarit que les boutons `Codex`/`Mondes` voisins, aucun style de bouton dédié.
- **Exporter/Importer** sont des boutons texte sans icône ni mise en avant particulière dans la
  topbar, comme leurs voisins — l'export d'une sauvegarde n'est pas une action plus "importante"
  visuellement, seulement plus rare. L'input de fichier caché derrière `Importer` n'a pas de style
  propre (`display: none`), le `<button>` visible est ce qui capte le clic. La topbar n'a plus de
  bouton `Sauvegarder`/`Réinitialiser` : l'autosave (`gameState`, toutes les 5s) rend le premier
  redondant, et le hard reset reste une action du moteur (`game.hardReset`) sans point d'entrée UI
  pour l'instant plutôt qu'un bouton risquant un clic accidentel.
