import type { GameData } from "../../engine/gameState";

export const horimiyaItems: GameData["items"] = [
  { id: "horimiya-item-messages", kind: "common", name: "Messages échangés" },
  { id: "horimiya-item-photo-classe", kind: "common", name: "Photos de classe" },
  { id: "horimiya-item-chocolats", kind: "common", name: "Chocolats faits maison" },
  { id: "horimiya-item-ticket-festival", kind: "common", name: "Tickets du festival sportif" },
  { id: "horimiya-item-recette", kind: "common", name: "Recettes de la famille Hori" },
  { id: "horimiya-item-souvenir", kind: "common", name: "Souvenirs du lycée" },
  {
    id: "horimiya-item-piercings",
    kind: "unique",
    name: "Piercings de Miyamura",
    equippableBy: { characterIds: ["horimiya-miyamura"] },
    effects: [{ target: "clickPower", kind: "multiplier", value: 1.25 }],
  },
  {
    id: "horimiya-item-bracelet",
    kind: "unique",
    name: "Bracelet assorti",
    equippableBy: { tags: ["student"] },
    effects: [{ target: "teamDps", kind: "percent", value: 0.2 }],
  },
  {
    id: "horimiya-item-bonbon-remi",
    kind: "unique",
    name: "Bonbon de Remi",
    equippableBy: { tags: ["student-council"] },
    effects: [{ target: "teamDps", kind: "multiplier", value: 1.35 }],
  },
  {
    id: "horimiya-item-maillot",
    kind: "unique",
    name: "Maillot du festival sportif",
    equippableBy: { tags: ["student"] },
    effects: [{ target: "clickPower", kind: "multiplier", value: 1.4 }],
  },
  {
    id: "horimiya-item-tablier",
    kind: "unique",
    name: "Tablier de Hori",
    equippableBy: { tags: ["hori-family"] },
    effects: [{ target: "teamDps", kind: "multiplier", value: 1.45 }],
  },
  {
    id: "horimiya-item-diplome",
    kind: "unique",
    name: "Diplôme de Katagiri",
    equippableBy: { animeIds: ["horimiya"] },
    effects: [{ target: "teamDps", kind: "multiplier", value: 1.55 }],
  },
];
