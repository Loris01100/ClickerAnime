// Bleach — un univers indépendant, donc un monde d'entrée au même titre que Naruto et
// Hunter x Hunter, mais de loin le plus long des trois : 15 arcs, la liste complète des arcs
// narratifs de l'anime dans l'ordre de diffusion, arcs hors-manga compris (les Bounts, le
// capitaine Amagai, le Conte inconnu des Zanpakutôs, l'Armée envahissante du Gotei 13). Le dernier,
// « Arc de la Guerre sanglante Millénaire », est l'arc que le manga appelle « Arc Quincy » : c'est
// le même, listé deux fois côté anime/manga, il n'apparaît donc qu'une fois ici.
//
// **La rampe de puissance des recrues est volontairement plate (~1,24x/arc, 6 → 125) là où les
// autres mondes montent de ~1,85x.** Ce n'est pas un oubli : `reachedArcPower` est un seul scalaire
// partagé par tous les mondes (`docs/progression.md`), et un monde d'entrée doit rendre la main au
// suivant à la même hauteur que les autres points d'entrée — Naruto finit à 78, Hunter x Hunter à
// 120, et Shippûden ouvre à 130. Quinze arcs à 1,85x finiraient à ~20 000, soit 170x au-dessus des
// deux autres : le monde suivant, entré au palier 2,5x seulement, deviendrait une formalité pour
// qui aurait commencé par Bleach. C'est donc le nombre d'arcs qui fait la longueur du monde, pas la
// puissance de ses recrues — et `catchUpGrowth` continue de faire le reste.
//
// Les pv, eux, montent bien plus vite que ça (mobs ~2,1x/arc, boss ~2,3x après l'ouverture) : ils
// suivent la vitesse à laquelle le **dps d'équipe** grimpe, et celle-ci vient surtout de la
// profondeur du roster — 111 recrues sur 15 arcs — pas du `baseDps` imprimé. Les récompenses
// gardent la courbe commune aux deux autres mondes d'entrée sur les cinq premiers arcs
// (130 / 700 / 3 000 / 14 000 / 90 000) puis montent de ~2,6x. Voir `docs/combat.md`.
import type { GameData } from "../../engine/gameState";
import { bleachArcs } from "./arcs";
import { bleachCharacters } from "./characters";
import { bleachItems } from "./items";

export const bleachData: GameData = {
  animes: [
    {
      id: "bleach",
      name: "Bleach",
      unlockCost: 3,
      themeHue: 268, // le violet spirituel du Hueco Mundo et des portes du Seireitei
      // La carte n'est pas un itinéraire mais la cosmologie de Bleach — la Garganta et les mondes
      // qu'elle relie. Chaque arc est donc épinglé sur le **lieu où il se joue** plutôt qu'à la
      // suite du précédent : six en Soul Society, quatre à Karakura, trois au Hueco Mundo, un au
      // Dangai, un au Palais Royal, un dans la Vallée des Cris.
      mapImage: "/bleach-map.jpg",

      description:
        "Ichigo Kurosaki hérite des pouvoirs d'un Shinigami et se retrouve chargé d'escorter les " +
        "âmes et d'abattre les Hollows. De la première nuit à Karakura jusqu'à la Guerre sanglante " +
        "Millénaire, quinze arcs — toute l'histoire portée à l'écran, arcs hors-manga compris.",
    },
  ],

  arcs: bleachArcs,
  characters: bleachCharacters,
  items: bleachItems,
};
