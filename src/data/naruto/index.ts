// Naruto (partie 1 uniquement — ni Shippûden ni Boruto). Noms de la VF française.

import type { GameData } from "../../engine/gameState";
import { narutoArcs } from "./arcs";
import { narutoCharacters } from "./characters";
import { narutoItems } from "./items";

export const narutoData: GameData = {
  animes: [
    {
      id: "naruto",
      name: "Naruto",
      mapImage: "/naruto-map.jpg",
      unlockCost: 3,
      themeHue: 28, // l'orange de Konoha

      description:
        "Un jeune ninja rejeté de Konoha rêve de devenir Hokage. Des missions de rang C au Pays des " +
        "Vagues jusqu'à la course-poursuite pour ramener Sasuke, la première partie forme l'Équipe 7 " +
        "et pose les bases de tout ce qui suit.",
    },
  ],

  arcs: narutoArcs,
  characters: narutoCharacters,
  items: narutoItems,
};
