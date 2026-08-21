// Placeholder fixtures used to exercise the engine logic. No real anime/character
// data yet — replace this file once licensed content is decided.
import type { GameData } from "../engine/gameState";

export const sampleData: GameData = {
  animes: [
    { id: "anime-a", name: "Anime A", unlockCost: 3 },
    { id: "anime-b", name: "Anime B", unlockCost: 5 },
  ],
  arcs: [
    { id: "anime-a-arc-1", animeId: "anime-a", name: "Anime A - Arc 1", order: 0, baseGoal: 250 },
    { id: "anime-a-arc-2", animeId: "anime-a", name: "Anime A - Arc 2", order: 1, baseGoal: 2_000 },
    { id: "anime-a-arc-3", animeId: "anime-a", name: "Anime A - Arc 3", order: 2, baseGoal: 15_000 },
    { id: "anime-b-arc-1", animeId: "anime-b", name: "Anime B - Arc 1", order: 0, baseGoal: 400 },
    { id: "anime-b-arc-2", animeId: "anime-b", name: "Anime B - Arc 2", order: 1, baseGoal: 3_000 },
    { id: "anime-b-arc-3", animeId: "anime-b", name: "Anime B - Arc 3", order: 2, baseGoal: 20_000 },
  ],
  characters: [
    {
      id: "char-a1",
      name: "Character A1",
      animeId: "anime-a",
      arcIds: ["anime-a-arc-1"],
      baseClickPower: 1,
      basePassiveIncome: 0,
      passive: { id: "char-a1-passive", target: "clickPower", kind: "percent", value: 0.1 },
    },
    {
      id: "char-a2",
      name: "Character A2",
      animeId: "anime-a",
      arcIds: ["anime-a-arc-2", "anime-a-arc-3"],
      baseClickPower: 0,
      basePassiveIncome: 2,
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
      name: "Character B1",
      animeId: "anime-b",
      arcIds: ["anime-b-arc-1", "anime-b-arc-2"],
      baseClickPower: 3,
      basePassiveIncome: 1,
    },
    {
      id: "char-b2",
      name: "Character B2",
      animeId: "anime-b",
      arcIds: ["anime-b-arc-3"],
      baseClickPower: 2,
      basePassiveIncome: 6,
      passive: { id: "char-b2-passive", target: "passiveIncome", kind: "percent", value: 0.25 },
    },
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
        effects: [{ id: "combo-overdrive-effect", target: "passiveIncome", kind: "multiplier", value: 2 }],
      },
    },
  ],
};
