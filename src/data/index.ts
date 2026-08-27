// Les mondes, dans l'ordre où ils s'ouvrent. `unlockedAnimeIds` fige le tier à l'entrée, donc
// l'ordre de ce tableau ne fixe que l'ordre d'affichage — c'est le joueur qui choisit où aller.
import type { GameData } from "../engine/gameState";
import { narutoData } from "./naruto";
import { shippudenData } from "./shippuden";
import { borutoData } from "./boruto";

const worlds = [narutoData, shippudenData, borutoData];

export const gameData: GameData = {
  animes: worlds.flatMap((w) => w.animes),
  arcs: worlds.flatMap((w) => w.arcs),
  characters: worlds.flatMap((w) => w.characters),
  items: worlds.flatMap((w) => w.items),
  combos: worlds.flatMap((w) => w.combos),
  shop: [
    { id: "shop-pakkun", kind: "character", targetId: "pakkun", cost: 75_000, requiresAnimeId: "naruto" },
    { id: "shop-tonton", kind: "character", targetId: "tonton", cost: 100_000, requiresAnimeId: "naruto" },
    { id: "shop-gamakichi", kind: "character", targetId: "gamakichi", cost: 150_000, requiresAnimeId: "naruto" },
  ],
};
