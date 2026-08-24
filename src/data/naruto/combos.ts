import type { GameData } from "../../engine/gameState";


export const narutoCombos: GameData["combos"] = [
  {
    id: "combo-equipe-7",
    name: "Équipe 7",
    requiredCharacterIds: ["naruto-uzumaki", "sasuke-uchiwa", "sakura-haruno", "kakashi-hatake"],
    ability: {
      id: "ability-equipe-7",
      name: "Travail d'équipe",
      cooldownMs: 90_000,
      durationMs: 12_000,
      effects: [
        { target: "clickPower", kind: "multiplier", value: 3 },
        { target: "teamDps", kind: "multiplier", value: 2.5 },
      ],
    },
  },
  {
    id: "combo-gai",
    name: "Équipe de Maître Gaï",
    requiredCharacterIds: ["rock-lee", "neji-hyuga"],
    ability: {
      id: "ability-gai",
      name: "Fougue de la jeunesse",
      cooldownMs: 60_000,
      durationMs: 10_000,
      effects: [{ target: "teamDps", kind: "multiplier", value: 2 }],
    },
  },
  {
    id: "combo-sannin",
    name: "Les Sannin Légendaires",
    requiredCharacterIds: ["jiraya", "tsunade"],
    ability: {
      id: "ability-sannin",
      name: "Pacte des Sannin",
      cooldownMs: 120_000,
      durationMs: 15_000,
      effects: [
        { target: "clickPower", kind: "multiplier", value: 4 },
        { target: "teamDps", kind: "multiplier", value: 4 },
      ],
    },
  },
  {
    id: "combo-sable",
    name: "Fratrie du Sable",
    requiredCharacterIds: ["gaara", "temari", "kankuro"],
    ability: {
      id: "ability-fratrie",
      name: "Tempête de sable",
      cooldownMs: 75_000,
      durationMs: 10_000,
      effects: [{ target: "teamDps", kind: "multiplier", value: 3 }],
    },
  },
];
