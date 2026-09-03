# La Tour de l'Ascension

Un mode à part, joué **à côté** de l'histoire : cent étages à grimper avec **cinq personnages**, sur
un cycle de quinze jours. Il est modelé sur le *Trial of Ascension* de Summoners War, dont il reprend
la forme exacte du barreau, et il répond à une question que le reste du jeu ne pose jamais — non pas
« quelle est la puissance de ton équipe », mais « quels sont tes cinq meilleurs, et sont-ils les
bons ? ».

Le code : `src/engine/tower.ts` (tout le pur), `src/engine/store/tower.ts` (l'état et le combat),
`src/ui/TowerPanel.tsx` (l'overlay), `src/styles/tower.css` (dont le fond infini).

## La forme

| | Normal | Difficile | Enfer |
|---|---|---|---|
| Étages | 100 | 100 | 10 |
| Récompense | tous les 10 étages | tous les 10 étages | **chaque** étage |
| Ouvert | oui | pas encore | pas encore |

Ces chiffres sont ceux de Summoners War et le restent. Ils sont **des données**
(`TOWER_MODES` dans `tower.ts`) et non trois constantes éparpillées : ouvrir un mode, c'est basculer
son `available`, exactement comme un monde quitte l'alpha en basculant `Anime.alpha`. Les deux modes
fermés sont quand même listés dans le panneau, cadenassés : le joueur voit la hauteur totale du
barreau avant d'y poser le pied.

Un étage, c'est **trois manches de cinq adversaires**, et le tout dernier de la troisième manche est
le boss (`isTowerBoss`) — quinze combats par étage. Aucune manche n'est une pause : la difficulté
monte à l'intérieur de l'étage (`TOWER_ROUND_HP_STEP`, 1.35x par manche) autant qu'entre les étages.

## Ce qu'on y affronte

Les adversaires sont **des personnages du jeu, tous univers mélangés** : la tour est un crossover
permanent, et c'est sa seule fiction. Ils sont tirés de façon déterministe des coordonnées de la case
(`towerOpponent`, via `hashSeed`) : l'étage 37 est le même étage 37 pour tout le monde et à chaque
tentative, ce qui en fait une épreuve comparable plutôt qu'une loterie. La case du boss tire dans le
casting `main`, pour qu'un étage se termine sur un nom qui porte.

L'ennemi sorti par `towerEnemy` ne porte **ni `characterId`, ni `itemId`, ni `timerMs`, et un
`reward` nul** : aucune des machineries de l'arc — recrutement, drop, crossover, xp, points de pack —
ne peut se déclencher par accident sur un kill de tour.

## La difficulté

Le mur d'un étage est une table **absolue**, comme les PV écrits à la main dans un arc, et non un
pourcentage du DPS du joueur :

```
PV = TOWER_BASE_HP (50) × 1.30^(étage-1) × 1.35^(manche) × (12 si boss)
```

Soit un étage 1 à ~2 000 PV au total et un étage 100 à ~3.9e14. Rapporté à l'horloge de l'étage, cela
demande **11 DPS d'escouade à l'étage 1** et **~2.2e12 à l'étage 100** — c'est-à-dire un jeu entier de
progression, cinq personnages de fin de partie compris. Le panneau imprime toujours ce chiffre
(`towerRequiredDps`) à côté du DPS réel de l'escouade : la tour ne cache jamais son mur.

**Cette courbe est un premier réglage, pas un réglage simulé.** `npm run sim` joue une run d'arcs et
ne monte pas dans la tour ; les deux nombres à bouger si elle se révèle trop raide ou trop molle sont
`TOWER_BASE_HP` (le bas de l'échelle) et `TOWER_FLOOR_HP_RAMP` (sa pente), et rien d'autre — le pas
par manche et le poids du boss ne décrivent que la forme *interne* d'un étage.

### L'horloge, et pourquoi il en faut une

Un ennemi n'inflige jamais de dégâts dans ce jeu. Un mur de PV tout seul n'est donc jamais une
défaite, seulement une attente : sans horloge, les cent étages se franchiraient en laissant l'onglet
ouvert. `TOWER_FLOOR_TIMER_MS` (**180 s**) rend l'étage réellement perdable — le temps écoulé remet la
tentative à la manche 1, et **rien d'autre n'est perdu** : les étages déjà franchis restent acquis, et
on peut recommencer immédiatement. C'est la seule sanction du mode, et elle est volontairement douce.

## Les cinq

L'escouade est de **cinq personnages exactement** (`TOWER_SQUAD_SIZE`), choisis parmi ceux que la run
**possède** — pas parmi tout le Codex. C'est la contrainte qui fait le mode : une équipe de quarante
gagne l'arc par accumulation, cinq personnages se choisissent.

Ils frappent avec leur puissance réelle : `towerSquadDps` est la somme de `characterStatOf(c,
"teamDps")` sur les cinq, c'est-à-dire **exactement la colonne que le roster imprime déjà** — niveaux,
passifs, objets équipés, évolutions, succès, arbre de prestige et synergie compris. Le panneau et le
roster affichent donc le même nombre, au bit près, et il n'y a pas un second modèle de dégâts à
maintenir.

Deux conséquences assumées :

- la **synergie** est celle de l'arc où le joueur se trouve, puisque c'est ce que mesure
  `characterStatOf`. Grimper depuis son propre monde est donc un peu plus fort que grimper depuis un
  monde étranger — cohérent avec le reste du jeu, et une raison de plus de choisir *quand* on monte ;
- le **Clic du Narrateur** frappe dans la tour aussi fort que dans un arc, crit, réduction de
  cooldown et déclenchement gratuit compris : c'est le même geste, simplement dirigé vers l'ennemi qui
  est à l'écran. L'autoclic du prestige suit la même route.

## Ce que ça paie

Un palier (tous les 10 étages ; chaque étage en Enfer) paie **quatre monnaies, et pas une seule ne
donne de la puissance** : de l'or, des cristaux de crossover, des points de pack et des fragments de
forge. C'est ce qui garde la tour hors de l'équilibre, exactement comme la branche « Automatisation »
en est tenue hors : elle accélère ce que le joueur farme déjà, elle n'invente pas une force qui n'a
jamais été chiffrée. En particulier elle ne donne **aucun point de prestige** — rien ne multiplie ce
que `calculatePrestigeGain` rend.

Les fragments vont à l'unique **déjà trouvé** qui en a le moins (départage par id) : déterministe,
parce que `Math.random()` n'est appelé que dans `gameState` (invariant), et sauté quand la run n'a
encore trouvé aucun unique. La tour ne crée donc jamais un objet, elle accélère la forge de ceux
qu'on possède.

Un palier est payé **une fois par mode et par cycle**, la clé étant `mode:étage` (`towerClaimKey`).
Rejouer un étage déjà franchi ne repaie rien : c'est ce qui empêche l'étage 10 de devenir une ferme.
À l'intérieur d'un étage, **rien ne tombe** — ni or, ni objet, ni xp, ni cristal, ni point de pack.
C'est aussi pourquoi le combat de la tour n'a pas besoin du plafond `MAX_KILLS_PER_SECOND` de l'arc :
ce plafond existe pour borner les gains *au kill*, et un kill de tour ne gagne rien.

## Le cycle de 15 jours

`TOWER_CYCLE_MS` remet la grimpe et les paliers à zéro tous les quinze jours : la tour est un
événement récurrent, pas un barreau qu'on solde une fois. C'est **le seul endroit du jeu qui lise une
date réelle**, et `towerCycleOf` est écrit pour ne jamais rendre du temps que le joueur n'a pas vécu :
`startedAt` n'avance que par cycles entiers, si bien qu'une horloge qui recule (fuseau, machine mal
réglée) ne peut pas offrir une réinitialisation de plus, et qu'une sauvegarde laissée fermée un mois
se réinitialise une fois, pas deux.

L'escouade, elle, traverse le cycle : c'est une préférence, pas une progression.

`refreshCycle` est appelé au démarrage du store **et** à chaque tick — au démarrage parce qu'une
partie rouverte après trois semaines doit s'ouvrir sur une tour déjà réinitialisée, et non sur
l'ancienne grimpe qui disparaît 200 ms plus tard sous les yeux du joueur.

## Ce qui est sauvegardé

Quatre champs, tous optionnels, donc **sans changement de `SAVE_KEY`** : `towerFloors` (l'étage le
plus haut franchi par mode), `towerSquadIds`, `towerClaimed` et `towerCycleStartedAt`.

La tentative en cours — l'étage, la manche, les PV de l'adversaire, l'échéance — n'est **pas**
sauvegardée : c'est de l'état de combat, et il suit la même règle que le reste (voir
`docs/persistence.md`). Recharger repose le joueur dans son arc, la grimpe intacte.

C'est de la **méta-progression** : `prestigeReset` ne touche à rien de tout cela, seul `hardReset`
efface. Le prestige fait quand même sortir de l'étage en cours (`leaveTower`), parce qu'il vide le
roster : rester dans un combat avec une escouade qui n'existe plus laisserait un DPS de 0 à l'écran.
`towerSquad` filtre déjà sur les personnages possédés, donc une escouade d'après-prestige se lit vide
plutôt que fantôme.

## L'écran

Un overlay plein écran (`TowerPanel`), et non une prise en main du `ClickStage` comme les portails de
crossover. La raison est la frontière elle-même : ce n'est pas l'équipe qui frappe, l'ennemi n'a pas
de monde, rien de ce qui tombe dans un arc ne tombe ici — un écran à part rend tout cela lisible sans
une phrase d'explication. Pendant qu'on y grimpe, le combat d'arc est **suspendu** et son ennemi reste
exactement où il était ; en sortir n'a donc rien à remettre en place.

Le fond est une image **répétée verticalement et défilant en boucle** : la tour n'a pas de fin, et le
décor ne doit jamais dire où il s'arrête. Toute l'habillage tient dans un jeton CSS,
`--tower-backdrop-image` (`src/styles/tower.css`) — poser l'illustration définitive, c'est déposer le
fichier dans `public/tower/` et changer cette ligne. La seule contrainte est dure : **l'image doit se
raccorder verticalement à elle-même**, sinon la couture passe à l'écran à chaque tour de boucle, et
`--tower-backdrop-height` doit valoir la hauteur à laquelle elle est dessinée. En attendant, le motif
par défaut est un mur de briques dégradé, qui tuile par construction et laisse la boucle vérifiable.

## Ce qui reste à faire

- **Les modes Difficile et Enfer.** Leurs `hpMultiplier` / `rewardMultiplier` sont posés (60x / 8x et
  4 000x / 40x) mais n'ont **jamais été joués** : ce sont des points de départ, à refaire une fois que
  le mode Normal aura été mesuré sur une vraie partie.
- **Une passe de simulation.** `npm run sim` ignore la tour ; la courbe ci-dessus est fittée à la main
  contre l'échelle de PV des mondes existants.
- **L'illustration de fond**, et le réglage de `--tower-backdrop-height` avec elle.
