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
};
