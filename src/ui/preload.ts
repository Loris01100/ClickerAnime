import type { GameData } from "../engine/gameState";
import { asset } from "./asset";
import { itemImagePath } from "./ItemIcon";

export const STARTUP_IMAGE_PATHS = [
  "/resources/currency-gold.png",
  "/resources/prestige.png",
  "/resources/crossover-crystal.png",
  "/resources/pack-points.png",
];

/** The prestige panel is optional and heavy, so its art waits for the panel to open. */
export const PRESTIGE_IMAGE_PATHS = [
  "/prestige-tree-background.png",
  ...["narrator-click", "team-dps", "xp", "items", "destin", "automation"].flatMap((branch) =>
    [1, 2, 3, 4, 5].map((level) => `/prestige-nodes/${branch}-${level}.webp`)
  ),
];

/** Local item art is warmed only for the active world; AniList portraits stay on-demand. */
export function imagePathsForAnime(data: GameData, animeId: string) {
  const itemIds = new Set(
    data.arcs
      .filter((arc) => arc.animeId === animeId)
      .flatMap((arc) => [...arc.mobs, arc.boss].flatMap((enemy) => (enemy.itemId ? [enemy.itemId] : [])))
  );
  return [
    ...data.animes.filter((anime) => anime.id === animeId && anime.mapImage).map((anime) => anime.mapImage!),
    ...data.items.filter((item) => itemIds.has(item.id)).map((item) => itemImagePath(item.id, item.kind)),
  ];
}

export function preloadImages(paths: readonly string[]) {
  paths.forEach((path) => {
    const image = new Image();
    image.src = asset(path);
  });
}
