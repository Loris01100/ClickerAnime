import type { GameData } from "../../engine/gameState";


export const shippudenCombos: GameData["combos"] = [
  {
    id: "combo-akatsuki",
    name: "L'Akatsuki au complet",
    requiredCharacterIds: ["deidara", "sasori", "hidan", "kakuzu", "kisame", "itachi"],
    ability: {
      id: "ability-akatsuki",
      name: "Nuage Rouge",
      cooldownMs: 150_000,
      durationMs: 20_000,
      effects: [
        { target: "teamDps", kind: "multiplier", value: 3.5 },
        { target: "clickPower", kind: "multiplier", value: 2.25 },
      ],
    },
  },
  {
    id: "combo-taka",
    name: "Taka",
    requiredCharacterIds: ["suigetsu", "karin", "jugo"],
    ability: {
      id: "ability-taka",
      name: "Chasse en meute",
      cooldownMs: 70_000,
      durationMs: 10_000,
      effects: [
        { target: "teamDps", kind: "multiplier", value: 2 },
      ],
    },
  },
  {
    id: "combo-hokage",
    name: "Les Quatre Hokage",
    requiredCharacterIds: ["hashirama", "tobirama", "minato", "hiruzen"],
    ability: {
      id: "ability-hokage",
      name: "Volonté du Feu",
      cooldownMs: 160_000,
      durationMs: 20_000,
      effects: [
        { target: "teamDps", kind: "multiplier", value: 3.5 },
      ],
    },
  },
  {
    id: "combo-kage",
    name: "Le Sommet des Cinq Kage",
    requiredCharacterIds: ["ay", "mei", "onoki", "mifune", "gaara", "tsunade"],
    ability: {
      id: "ability-sommet",
      name: "Alliance Shinobi",
      cooldownMs: 180_000,
      durationMs: 25_000,
      effects: [
        { target: "teamDps", kind: "multiplier", value: 3.5 },
        { target: "clickPower", kind: "multiplier", value: 3 },
      ],
    },
  },
  {
    id: "combo-uchiwa",
    name: "Les Frères Uchiwa",
    requiredCharacterIds: ["itachi", "sasuke-uchiwa"],
    ability: {
      id: "ability-freres",
      name: "Poing contre poing",
      cooldownMs: 90_000,
      durationMs: 12_000,
      effects: [
        { target: "teamDps", kind: "multiplier", value: 2.25 },
      ],
    },
  },
  {
    id: "combo-crapauds",
    name: "Les Deux Sages des Crapauds",
    requiredCharacterIds: ["fukasaku", "shima"],
    ability: {
      id: "ability-crapauds",
      name: "Genjutsu des Ermites",
      cooldownMs: 80_000,
      durationMs: 10_000,
      effects: [
        { target: "teamDps", kind: "multiplier", value: 2 },
      ],
    },
  },
];
