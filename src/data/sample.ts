// Placeholder fixtures used to exercise the engine logic. No real anime/character
// data yet — replace this file once licensed content is decided.
import type { GameData } from "../engine/gameState";

const BOSS_TIMER_MS = 30_000;

export const sampleData: GameData = {
  animes: [
    { id: "anime-a", name: "Anime A", unlockCost: 3 },
    { id: "anime-b", name: "Anime B", unlockCost: 5 },
  ],

  arcs: [
    {
      id: "anime-a-arc-1",
      animeId: "anime-a",
      name: "Anime A - Arc 1",
      order: 0,
      mobsToBoss: 8,
      mobs: [
        { id: "a1-mob-1", name: "Sbire A", baseHp: 10, reward: 4 },
        { id: "a1-mob-2", name: "Sbire A+", baseHp: 14, reward: 6 },
        { id: "a1-rival", name: "Character A1", baseHp: 45, reward: 25, characterId: "char-a1" },
      ],
      boss: { id: "a1-boss", itemId: "item-a1", name: "Boss de l'Arc 1", baseHp: 140, reward: 90, timerMs: BOSS_TIMER_MS },
    },
    {
      id: "anime-a-arc-2",
      animeId: "anime-a",
      name: "Anime A - Arc 2",
      order: 1,
      mobsToBoss: 12,
      mobs: [
        { id: "a2-mob-1", name: "Soldat A", baseHp: 70, reward: 25 },
        { id: "a2-mob-2", name: "Soldat A+", baseHp: 90, reward: 32 },
        { id: "a2-rival", name: "Character A2", baseHp: 300, reward: 150, characterId: "char-a2" },
      ],
      boss: { id: "a2-boss", itemId: "item-a2", name: "Boss de l'Arc 2", baseHp: 1_100, reward: 600, timerMs: BOSS_TIMER_MS },
    },
    {
      id: "anime-a-arc-3",
      animeId: "anime-a",
      name: "Anime A - Arc 3",
      order: 2,
      mobsToBoss: 15,
      mobs: [
        { id: "a3-mob-1", name: "Élite A", baseHp: 500, reward: 180 },
        { id: "a3-mob-2", name: "Élite A+", baseHp: 620, reward: 230 },
      ],
      boss: { id: "a3-boss", itemId: "item-a3", name: "Boss final - Anime A", baseHp: 7_000, reward: 3_500, timerMs: 45_000 },
    },

    {
      id: "anime-b-arc-1",
      animeId: "anime-b",
      name: "Anime B - Arc 1",
      order: 0,
      mobsToBoss: 8,
      mobs: [
        { id: "b1-mob-1", name: "Sbire B", baseHp: 12, reward: 5 },
        { id: "b1-mob-2", name: "Sbire B+", baseHp: 16, reward: 7 },
        { id: "b1-rival", name: "Character B1", baseHp: 55, reward: 30, characterId: "char-b1" },
      ],
      boss: { id: "b1-boss", itemId: "item-b1", name: "Boss de l'Arc 1", baseHp: 170, reward: 110, timerMs: BOSS_TIMER_MS },
    },
    {
      id: "anime-b-arc-2",
      animeId: "anime-b",
      name: "Anime B - Arc 2",
      order: 1,
      mobsToBoss: 12,
      mobs: [
        { id: "b2-mob-1", name: "Soldat B", baseHp: 85, reward: 30 },
        { id: "b2-mob-2", name: "Soldat B+", baseHp: 105, reward: 38 },
        { id: "b2-rival", name: "Character B2", baseHp: 360, reward: 180, characterId: "char-b2" },
      ],
      boss: { id: "b2-boss", itemId: "item-b2", name: "Boss de l'Arc 2", baseHp: 1_300, reward: 700, timerMs: BOSS_TIMER_MS },
    },
    {
      id: "anime-b-arc-3",
      animeId: "anime-b",
      name: "Anime B - Arc 3",
      order: 2,
      mobsToBoss: 15,
      mobs: [
        { id: "b3-mob-1", name: "Élite B", baseHp: 600, reward: 220 },
        { id: "b3-mob-2", name: "Élite B+", baseHp: 740, reward: 270 },
      ],
      boss: { id: "b3-boss", itemId: "item-b3", name: "Boss final - Anime B", baseHp: 8_500, reward: 4_200, timerMs: 45_000 },
    },
  ],

  characters: [
    {
      id: "char-a1",
      rarity: "secondary",
      name: "Character A1",
      animeId: "anime-a",
      arcIds: ["anime-a-arc-1"],
      baseClickPower: 2,
      baseDps: 1,
      passive: { id: "char-a1-passive", target: "clickPower", kind: "percent", value: 0.1 },
    },
    {
      id: "char-a2",
      rarity: "main",
      name: "Character A2",
      animeId: "anime-a",
      arcIds: ["anime-a-arc-2", "anime-a-arc-3"],
      baseClickPower: 1,
      baseDps: 6,
      ability: {
        id: "ability-a2-burst",
        name: "A2 Burst",
        cooldownMs: 30_000,
        durationMs: 5_000,
        effects: [{ id: "a2-burst-effect", target: "clickPower", kind: "multiplier", value: 3 }],
      },
    },
    {
      id: "char-b1",
      rarity: "secondary",
      name: "Character B1",
      animeId: "anime-b",
      arcIds: ["anime-b-arc-1", "anime-b-arc-2"],
      baseClickPower: 4,
      baseDps: 3,
    },
    {
      id: "char-b2",
      rarity: "main",
      name: "Character B2",
      animeId: "anime-b",
      arcIds: ["anime-b-arc-3"],
      baseClickPower: 3,
      baseDps: 12,
      passive: { id: "char-b2-passive", target: "teamDps", kind: "percent", value: 0.25 },
    },
  ],

  items: [
    { id: "item-a1", name: "Carnet du Narrateur", clickBonus: 2 },
    { id: "item-a2", name: "Plume d'Encre", clickBonus: 8 },
    { id: "item-a3", name: "Manuscrit Perdu", clickBonus: 30 },
    { id: "item-b1", name: "Marque-page Scellé", clickBonus: 4 },
    { id: "item-b2", name: "Encrier Sans Fond", clickBonus: 14 },
    { id: "item-b3", name: "Dernier Chapitre", clickBonus: 50 },
  ],

  combos: [
    {
      id: "combo-a1-b1",
      name: "A1 + B1 combo",
      requiredCharacterIds: ["char-a1", "char-b1"],
      ability: {
        id: "ability-combo-overdrive",
        name: "Overdrive",
        cooldownMs: 60_000,
        durationMs: 10_000,
        effects: [{ id: "combo-overdrive-effect", target: "teamDps", kind: "multiplier", value: 2 }],
      },
    },
  ],
};
