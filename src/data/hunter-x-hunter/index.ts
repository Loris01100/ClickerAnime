// Hunter x Hunter (anime de 2011) est un univers indépendant et tient dans un seul monde. Il est
// donc un point d'entrée au même titre que Naruto, avec des valeurs de départ comparables. Les six
// arcs couvrent toute l'adaptation animée ; le Continent Caché reste hors jeu puisqu'il n'a pas été
// adapté en anime.
import type { GameData } from "../../engine/gameState";
import { hunterXHunterArcs } from "./arcs";
import { hunterXHunterCharacters } from "./characters";
import { hunterXHunterItems } from "./items";
import { hunterXHunterCombos } from "./combos";

export const hunterXHunterData: GameData = {
  animes: [
    {
      id: "hunter-x-hunter",
      name: "Hunter x Hunter",
      unlockCost: 3,
      themeHue: 142, // le vert de l'examen Hunter et de l'aventure
      mapImage: "/hunter-hunter-map.webp",
      description:
        "Gon quitte l'Île de la Baleine pour devenir Hunter et retrouver son père. De l'Examen " +
        "Hunter aux élections qui suivent la crise des Kimera Ants, toute l'adaptation de 2011 " +
        "forme un seul monde — sans le Continent Caché, encore inédit en anime.",
    },
  ],
  arcs: hunterXHunterArcs,
  characters: hunterXHunterCharacters,
  items: hunterXHunterItems,
  combos: hunterXHunterCombos,
};
