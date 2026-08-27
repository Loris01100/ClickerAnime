import type { GameData } from "../../engine/gameState";


export const borutoCombos: GameData["combos"] = [
  {
    id: "combo-nouvelle-equipe-7",
    name: "La Nouvelle Équipe 7",
    requiredCharacterIds: ["boruto", "sarada", "mitsuki"],
    ability: {
      id: "ability-nouvelle-equipe-7",
      name: "Relève de Konoha",
      cooldownMs: 80_000,
      durationMs: 12_000,
      effects: [
        { target: "teamDps", kind: "multiplier", value: 3 },
      ],
    },
  },
  {
    id: "combo-ino-shika-cho-nouvelle",
    name: "Ino-Shika-Chô, nouvelle génération",
    requiredCharacterIds: ["shikadai", "inojin", "chocho"],
    ability: {
      id: "ability-ino-shika-cho-nouvelle",
      name: "Formation héritée",
      cooldownMs: 75_000,
      durationMs: 10_000,
      effects: [
        { target: "teamDps", kind: "multiplier", value: 2.5 },
      ],
    },
  },
  {
    id: "combo-kara",
    name: "Kara au complet",
    requiredCharacterIds: ["jigen", "delta", "boro", "code", "koji", "deepa"],
    ability: {
      id: "ability-kara",
      name: "Les Intérieurs",
      cooldownMs: 170_000,
      durationMs: 22_000,
      effects: [
        { target: "teamDps", kind: "multiplier", value: 3.5 },
        { target: "clickPower", kind: "multiplier", value: 3 },
      ],
    },
  },
  {
    id: "combo-otsutsuki",
    name: "Le Clan Ôtsutsuki",
    requiredCharacterIds: ["momoshiki", "kinshiki", "urashiki", "isshiki"],
    ability: {
      id: "ability-otsutsuki",
      name: "Moisson du Shinjû",
      cooldownMs: 180_000,
      durationMs: 22_000,
      effects: [
        { target: "teamDps", kind: "multiplier", value: 3.5 },
      ],
    },
  },
  {
    id: "combo-karma",
    name: "Le Sceau du Karma",
    requiredCharacterIds: ["boruto", "kawaki", "code"],
    ability: {
      id: "ability-karma",
      name: "Karma Éveillé",
      cooldownMs: 130_000,
      durationMs: 16_000,
      effects: [
        { target: "clickPower", kind: "multiplier", value: 3.5 },
      ],
    },
  },
  // Le combo qui justifie de traîner une équipe mixte jusqu'au bout : deux mondes, deux générations.
  // L'équipe ne se vide qu'au prestige, pas au voyage — voir `docs/progression.md`.
  {
    id: "combo-heritage",
    name: "L'Héritage du Septième",
    requiredCharacterIds: ["naruto-uzumaki", "sasuke-uchiwa", "boruto", "sarada"],
    ability: {
      id: "ability-heritage",
      name: "Deux Générations",
      cooldownMs: 190_000,
      durationMs: 24_000,
      effects: [
        { target: "teamDps", kind: "multiplier", value: 3.5 },
        { target: "clickPower", kind: "multiplier", value: 3.5 },
      ],
    },
  },
];
