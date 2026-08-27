import type { GameData } from "../../engine/gameState";

export const hunterXHunterItems: GameData["items"] = [
  { id: "hxh-item-carte-joker", kind: "unique", name: "Carte du Joker", effects: [{ target: "clickPower", kind: "multiplier", value: 1.25 }] },
  { id: "hxh-item-fil-nen", kind: "unique", name: "Fil de Nen", effects: [{ target: "teamDps", kind: "percent", value: 0.2 }] },
  { id: "hxh-item-skill-hunter", kind: "unique", name: "Skill Hunter", equippableBy: { tags: ["specialist"] }, effects: [{ target: "teamDps", kind: "multiplier", value: 1.4 }] },
  { id: "hxh-item-blue-planet", kind: "unique", name: "Carte Blue Planet", equippableBy: { tags: ["greed-island"] }, effects: [{ target: "clickPower", kind: "multiplier", value: 1.45 }] },
  { id: "hxh-item-rose", kind: "unique", name: "Rose du Pauvre", effects: [{ target: "teamDps", kind: "multiplier", value: 1.5 }] },
  { id: "hxh-item-licence-triple", kind: "unique", name: "Licence Hunter triple étoile", equippableBy: { tags: ["hunter"] }, effects: [{ target: "teamDps", kind: "multiplier", value: 1.6 }] },
  { id: "hxh-item-badge", kind: "common", name: "Badge de candidat" },
  { id: "hxh-item-ticket", kind: "common", name: "Ticket de la Tour Céleste" },
  { id: "hxh-item-catalogue", kind: "common", name: "Catalogue des enchères" },
  { id: "hxh-item-carte-sort", kind: "common", name: "Carte de sort" },
  { id: "hxh-item-ecaille", kind: "common", name: "Écaille de Kimera Ant" },
  { id: "hxh-item-bulletin", kind: "common", name: "Bulletin de vote" },
];
