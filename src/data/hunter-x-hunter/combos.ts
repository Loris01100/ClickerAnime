import type { GameData } from "../../engine/gameState";

export const hunterXHunterCombos: GameData["combos"] = [
  {
    id: "hxh-combo-quatuor",
    name: "Les quatre candidats",
    requiredCharacterIds: ["hxh-gon", "hxh-kirua", "hxh-kurapika", "hxh-leolio"],
    ability: { id: "hxh-ability-quatuor", name: "Promesse de l'Examen", cooldownMs: 90_000, durationMs: 12_000, effects: [{ target: "clickPower", kind: "multiplier", value: 2.25 }, { target: "teamDps", kind: "multiplier", value: 2 }] },
  },
  {
    id: "hxh-combo-troupe",
    name: "La Brigade Fantôme",
    requiredCharacterIds: ["hxh-kuroro", "hxh-machi", "hxh-feitan", "hxh-uvogin"],
    ability: { id: "hxh-ability-troupe", name: "L'Araignée", cooldownMs: 110_000, durationMs: 14_000, effects: [{ target: "teamDps", kind: "multiplier", value: 3 }] },
  },
  {
    id: "hxh-combo-royal-guard",
    name: "La Garde Royale",
    requiredCharacterIds: ["hxh-neferpitou", "hxh-shaiapouf", "hxh-menthuthuyoupi"],
    ability: { id: "hxh-ability-royal-guard", name: "Dévotion au Roi", cooldownMs: 130_000, durationMs: 16_000, effects: [{ target: "teamDps", kind: "multiplier", value: 3.5 }] },
  },
  {
    id: "hxh-combo-zoldik",
    name: "La Famille Zoldik",
    requiredCharacterIds: ["hxh-kirua", "hxh-illumi", "hxh-alluka"],
    ability: { id: "hxh-ability-zoldik", name: "Secrets de famille", cooldownMs: 100_000, durationMs: 12_000, effects: [{ target: "clickPower", kind: "multiplier", value: 3.5 }] },
  },
];
