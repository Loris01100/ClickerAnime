import { portalIndexOf, portalWeights } from "../crossover";
import { itemAnimeIndex } from "../forge";
import type { Anime, Arc, Character, GameData, Item } from "../types";

/**
 * Everything derivable from `data` alone, built once when the store boots.
 *
 * `data` never changes at runtime, and almost every lookup in the store and in the UI used to be a
 * `data.<section>.find(...)` — a linear walk of 256 characters, 55 arcs' worth of enemies or 68
 * items, several of them per roster row and per kill. Same answers, built once instead of per call.
 *
 * Nothing here is reactive and nothing here may mutate: it is the content, indexed. That is what
 * makes it the one slice every other one can take as a plain dependency without ordering rules.
 */
export interface ContentIndex {
  /** O(1) content lookups by id — the UI reads these rather than re-scanning `data`. */
  characterOf: (id: string | undefined | null) => Character | null;
  itemOf: (id: string | undefined | null) => Item | null;
  arcOf: (id: string | undefined | null) => Arc | null;
  animeOf: (id: string | undefined | null) => Anime | null;
  /** The arc a character is first met in — the one whose common item feeds their passive. */
  originArcOf: (characterId: string) => Arc | null;
  /** Which arc each portal recruit is fought in, and how heavy their portal is. */
  portalIndex: Map<string, Arc>;
  portalWeightByArc: Record<string, number>;
  /** Which world each item comes from — its drop's arc. */
  itemAnimeIds: Record<string, string>;
  /** The world each arc belongs to, as a record — the power tables index by arc id. */
  animeIdOfArc: Record<string, string>;
  /**
   * La position de chaque arc dans `data.arcs`, c'est-à-dire l'ordre de l'histoire du jeu entier.
   * `Arc.order` ne dit qu'un rang *à l'intérieur* d'un monde, donc il ne sert à rien pour ordonner
   * une liste qui traverse les univers — celle des portails, par exemple.
   */
  arcRank: Record<string, number>;
}

export function createContentIndex(data: GameData): ContentIndex {
  const characterIndex = new Map(data.characters.map((c) => [c.id, c]));
  const itemIndex = new Map(data.items.map((i) => [i.id, i]));
  const arcIndex = new Map(data.arcs.map((a) => [a.id, a]));
  const animeIndex = new Map(data.animes.map((a) => [a.id, a]));

  /**
   * Arcs are walked in data order and the first one to name a character wins. It feeds
   * `passiveItemOf`, which the roster calls twice per row (directly, and again through
   * `passiveUpgradeOf`), each call otherwise walking every arc's boss and mob list.
   */
  const originArcIndex = new Map<string, Arc>();
  for (const arc of data.arcs) {
    // A boss recruit is met in its arc even though it only joins through a portal: this is where
    // the character's passive item and home arc come from, so the portal must not move it.
    const bossRecruitId = arc.boss.characterId ?? arc.boss.portalCharacterId;
    if (bossRecruitId && !originArcIndex.has(bossRecruitId)) {
      originArcIndex.set(bossRecruitId, arc);
    }
    for (const mob of arc.mobs) {
      if (mob.characterId && !originArcIndex.has(mob.characterId)) originArcIndex.set(mob.characterId, arc);
    }
  }

  return {
    characterOf: (id) => (id ? characterIndex.get(id) ?? null : null),
    itemOf: (id) => (id ? itemIndex.get(id) ?? null : null),
    arcOf: (id) => (id ? arcIndex.get(id) ?? null : null),
    animeOf: (id) => (id ? animeIndex.get(id) ?? null : null),
    originArcOf: (characterId) => originArcIndex.get(characterId) ?? null,
    portalIndex: portalIndexOf(data.arcs),
    portalWeightByArc: portalWeights(data.arcs),
    itemAnimeIds: itemAnimeIndex(data.arcs),
    animeIdOfArc: Object.fromEntries(data.arcs.map((arc) => [arc.id, arc.animeId])),
    arcRank: Object.fromEntries(data.arcs.map((arc, index) => [arc.id, index])),
  };
}
