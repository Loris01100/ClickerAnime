import { createRoot } from "solid-js";
import { createGameStore } from "./src/engine/gameState";

(globalThis as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

const world = {
  animes: [{ id: "ta", name: "A", unlockCost: 0 }],
  arcs: [{
    id: "ta-arc", animeId: "ta", name: "Arc", order: 0, mobsToBoss: 0,
    mobs: [{ id: "mob", name: "Mob", baseHp: 1e9, reward: 1 }],
    boss: { id: "boss", name: "Boss", baseHp: 1e9, reward: 1,
      bossTrait: { kind: "click-resistance" as const, name: "Brume", description: "", multiplier: 0.5 } },
  }],
  characters: [{ id: "ca", name: "A", animeId: "ta", rarity: "main" as const, arcIds: ["ta-arc"],
    baseClickPower: 1000, baseDps: 500 }],
  items: [],
};
(globalThis as any).localStorage = {
  getItem: (k: string) => k.includes("save") ? JSON.stringify({
    currency: 0, ownedCharacterIds: ["ca"], activeArcId: "ta-arc", unlockedAnimeIds: ["ta"],
    lifetimeEarned: 0, prestigePoints: 0, arcKills: {}, clearedArcIds: [], characterXp: {},
    itemCounts: {}, passiveRanks: {}, evolvedCharacterIds: [], achievementCounts: {}, prestigeTreeRanks: {},
  }) : null,
  setItem: () => {}, removeItem: () => {},
};

createRoot(() => {
  const g = createGameStore(world);
  console.log("ennemi en face :", g.enemy()?.name, "| trait :", g.enemy()?.bossTrait?.name ?? "aucun");
  console.log("clickPower affiché :", g.clickPower().toFixed(0), "| teamDps affiché :", g.teamDps().toFixed(0));
  const before = g.enemyHpLeft();
  const { damage } = g.click();
  const removed = before - g.enemyHpLeft();
  console.log("PV réellement retirés par un clic :", removed.toFixed(0));
  console.log("dégâts annoncés par la pop-up      :", damage.toFixed(0));
  console.log("=> le trait s'applique :", removed < g.clickPower() ? "OUI" : "NON");
  console.log("time-to-kill tient compte du trait :", Number.isFinite(g.timeToKill()));
});
