import type { GameData } from "../../engine/gameState";
import { horimiyaArcs } from "./arcs";
import { horimiyaCharacters } from "./characters";
import { horimiyaItems } from "./items";

/** Horimiya and The Missing Pieces share one chronological entry world. */
export const horimiyaData: GameData = {
  animes: [
    {
      id: "horimiya",
      name: "Horimiya",
      unlockCost: 3,
      themeHue: 338,
      mapImage: "/horimiya-map.png",
      alpha: true,
      description:
        "Kyoko Hori et Izumi Miyamura découvrent les facettes qu’ils cachent au lycée. Leur " +
        "rencontre transforme peu à peu leurs amitiés, leurs familles et leur quotidien, jusqu’à " +
        "la remise des diplômes. Les épisodes de The Missing Pieces rejoignent ici la chronologie.",
      presentation: {
        stageLabel: "Liens",
        healthLabel: "Tension",
        bossLabel: "Épreuve",
        clickPowerLabel: "Courage",
        teamDpsLabel: "Soutien",
        encounterSingular: "moment",
        encounterPlural: "moments",
      },
    },
  ],
  arcs: horimiyaArcs,
  characters: horimiyaCharacters,
  items: horimiyaItems,
};
