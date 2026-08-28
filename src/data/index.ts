// Les mondes, dans l'ordre où ils s'ouvrent. `unlockedAnimeIds` fige le tier à l'entrée, donc
// l'ordre de ce tableau ne fixe que l'ordre d'affichage — c'est le joueur qui choisit où aller.
import type { GameData } from "../engine/gameState";
import { narutoData } from "./naruto";
import { shippudenData } from "./shippuden";
import { borutoData } from "./boruto";
import { hunterXHunterData } from "./hunter-x-hunter";

// Independent entry worlds stay before sequel chains in the flattened data. Catch-up power is
// monotone across this authored order, while `requiresAnimeId` still decides the actual route.
const worlds = [narutoData, hunterXHunterData, shippudenData, borutoData];

export const gameData: GameData = {
  animes: worlds.flatMap((w) => w.animes),
  arcs: worlds.flatMap((w) => w.arcs),
  characters: worlds.flatMap((w) => w.characters),
  items: worlds.flatMap((w) => w.items),
  shop: [
    { id: "shop-pakkun", kind: "character", targetId: "pakkun", cost: 75_000, requiresAnimeId: "naruto" },
    { id: "shop-tonton", kind: "character", targetId: "tonton", cost: 100_000, requiresAnimeId: "naruto" },
    { id: "shop-gamakichi", kind: "character", targetId: "gamakichi", cost: 150_000, requiresAnimeId: "naruto" },
  ],
};
