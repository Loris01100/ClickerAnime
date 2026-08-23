// Les mondes, dans l'ordre où ils s'ouvrent. `unlockedAnimeIds` fige le tier à l'entrée, donc
// l'ordre de ce tableau ne fixe que l'ordre d'affichage — c'est le joueur qui choisit où aller.
import type { GameData } from "../engine/gameState";
import { narutoData } from "./naruto";
import { shippudenData } from "./shippuden";

const worlds = [narutoData, shippudenData];

export const gameData: GameData = {
  animes: worlds.flatMap((w) => w.animes),
  arcs: worlds.flatMap((w) => w.arcs),
  characters: worlds.flatMap((w) => w.characters),
  items: worlds.flatMap((w) => w.items),
  combos: worlds.flatMap((w) => w.combos),
  // Placeholder boutique content — proves the mechanic (currency purchase, optional world-cleared
  // gate) end to end. Every character still has to stay recruitable in combat too (engine.test.ts
  // enforces "recrutable nulle part"), so a shop character offer is a paid shortcut to someone you
  // could also fight for, not an exclusive recruit; swap targetId/cost/requiresAnimeId for real
  // content whenever it's designed.
  shop: [
    { id: "shop-shuriken", kind: "item", targetId: "item-shuriken", cost: 50, amount: 3 },
    { id: "shop-chiyo", kind: "character", targetId: "chiyo", cost: 500, requiresAnimeId: "naruto" },
  ],
};
