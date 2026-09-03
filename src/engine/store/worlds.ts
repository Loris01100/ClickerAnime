import { createMemo, createSignal } from "solid-js";
import { arcPowerTable, catchUpGrowth, reachedArcPower } from "../growth";
import type { SaveFile } from "../persistence";
import {
  animeTier,
  arcsOfAnime,
  arcWeight,
  BORDER_CLIFF,
  difficultyMultiplier,
  relevelledDifficulty,
  worldEntryDifficulty,
  worldEntryScale,
} from "../progression";
import type { Arc, Character, GameData } from "../types";
import type { ContentIndex } from "./content";

export interface WorldScalingDeps {
  data: GameData;
  content: ContentIndex;
  saved: SaveFile | null;
  /** Worlds entered, in entry order — the order *is* the tier (see `animeTier`). */
  unlockedAnimeIds: () => string[];
  clearedArcIds: () => string[];
  activeArcId: () => string | null;
}

/**
 * What every world and arc is played at: tiers, the power ramp, and the re-levelling a world gets
 * when the run reaches it far above what it was authored for.
 *
 * All of it turns on one rule, and the rule is why this lives apart from the fight it feeds:
 * **a world's scale is frozen the instant it is entered, and nothing may recompute it live
 * afterwards.** Tier is the entry order, `animeEntryDifficulties` the frozen anchor,
 * `animeEntryScales` the frozen rung shift; the only writer of the last two is `freezeEntryScale`,
 * called once per world by `travelTo`/`unlockAnime` *before* the player lands there. Everything
 * else in here reads them.
 *
 * The one exception is `entryDifficultyOf`'s preview, and it is fenced in: it answers only for a
 * world the run has **not** entered, so a portal can print the real number it would be entered at.
 * Letting it answer for an entered world made a world the player had already finished get harder
 * every time they grew (see there). The full rationale is in `docs/progression.md`.
 */
export function createWorldScaling(deps: WorldScalingDeps) {
  const { data, content, saved } = deps;
  const { arcOf, animeIdOfArc } = content;

  /**
   * The scale each entered world is played at, frozen the moment it was entered — its enemies, its
   * rewards and its own cast all ride it (`worldEntryDifficulty`). Run state like the worlds
   * entered themselves: `prestigeReset` wipes it with them.
   */
  const [animeEntryDifficulties, setAnimeEntryDifficulties] = createSignal<Record<string, number>>(
    saved?.animeEntryDifficulties ?? {}
  );
  /** How far each entered world's `arcPower` rungs are shifted — see `worldEntryScale`. */
  const [animeEntryScales, setAnimeEntryScales] = createSignal<Record<string, number>>(
    saved?.animeEntryScales ?? {}
  );

  /**
   * The story's power ramp, read off the cast once (the data never changes at runtime), and how far
   * up it this run has climbed. Feeds `catchUpGrowth`, which is what keeps an early recruit from
   * falling millions of dps behind the ramp baked into later worlds' `baseDps` — see growth.ts.
   */
  const authoredArcPower = arcPowerTable(data.characters);

  /**
   * Every arc's authored rung, gaps filled forward. `arcPowerTable` only knows the arcs somebody
   * debuts in; the re-levelling ramp needs one for every arc, and the nearest earlier rung is the
   * same approximation `reachedArcPower` already makes by skipping them.
   */
  const authoredRungs: Record<string, number> = (() => {
    const rungs: Record<string, number> = {};
    for (const anime of data.animes) {
      let last = 0;
      for (const arc of arcsOfAnime(data.arcs, anime.id)) {
        last = authoredArcPower[arc.id] ?? last;
        rungs[arc.id] = last;
      }
    }
    return rungs;
  })();

  /**
   * The authored rungs, each shifted by its world's `worldEntryScale`, so a re-levelled world opens
   * on the rung the player already stands at and climbs from there. Deliberately not the world's
   * difficulty — see `worldEntryScale` for why that would make a re-levelled world *easier*.
   */
  const arcPower = createMemo(() => {
    const scales = animeEntryScales();
    if (Object.values(scales).every((scale) => scale === 1)) return authoredArcPower;
    const table: Record<string, number> = {};
    for (const [arcId, power] of Object.entries(authoredArcPower)) {
      table[arcId] = power * (scales[animeIdOfArc[arcId] ?? ""] ?? 1);
    }
    return table;
  });

  const reachedPower = createMemo(() =>
    reachedArcPower(arcPower(), [deps.activeArcId(), ...deps.clearedArcIds()])
  );

  const tierOf = (animeId: string) => animeTier(deps.unlockedAnimeIds(), animeId);
  const arcsOf = (animeId: string) => arcsOfAnime(data.arcs, animeId);

  /** The authored anchors a world's re-levelling ramp is built off: its first arc. */
  const firstArcOf = (animeId: string) => arcsOf(animeId)[0] ?? null;

  const firstArcWeightOf = (animeId: string) => {
    const first = firstArcOf(animeId);
    return first ? arcWeight(first) : 0;
  };

  /** Puts one arc on its world's re-levelling ramp, anchored at the world's opening arc. */
  function relevelArc(arc: Arc, entryDifficulty: number): number {
    const first = firstArcOf(arc.animeId);
    if (!first) return entryDifficulty;
    return relevelledDifficulty(
      entryDifficulty,
      { weight: arcWeight(first), power: authoredRungs[first.id] ?? 0 },
      { weight: arcWeight(arc), power: authoredRungs[arc.id] ?? 0 }
    );
  }

  /**
   * What an arc is played at according to what was **frozen** when its world was entered — never the
   * preview below. The anchor is built out of these, and the preview is built out of the anchor: let
   * the preview back in here and a world not yet entered would be asking what it is worth in order
   * to answer what it is worth.
   */
  function frozenArcDifficulty(arc: Arc): number {
    const tierDifficulty = difficultyMultiplier(tierOf(arc.animeId));
    const entryDifficulty = animeEntryDifficulties()[arc.animeId];
    if (entryDifficulty === undefined || entryDifficulty <= tierDifficulty) return tierDifficulty;
    return relevelArc(arc, entryDifficulty);
  }

  /**
   * The heaviest arc the run has actually cleared, in effective hp. This is the anchor a new world is
   * re-levelled onto — a number the game has already calibrated against this player, which is what
   * spares `worldEntryDifficulty` an exponent fitted per crossing.
   */
  const hardestClearedWeight = createMemo(() => {
    const relevelled = animeEntryDifficulties();
    let hardest = 0;
    for (const arcId of deps.clearedArcIds()) {
      const arc = arcOf(arcId);
      if (!arc) continue;
      // An arc cleared at home was fought by a team that still had its passives and its abilities;
      // the one about to cross the border is worth `BORDER_CLIFF` less than that. An arc cleared in
      // a world that was itself re-levelled was already fought abroad, and needs no discount.
      const tierDifficulty = difficultyMultiplier(tierOf(arc.animeId));
      const cliff = (relevelled[arc.animeId] ?? 0) > tierDifficulty ? 1 : BORDER_CLIFF;
      hardest = Math.max(hardest, (arcWeight(arc) * frozenArcDifficulty(arc)) / cliff);
    }
    return hardest;
  });

  /**
   * The scale a world's **opening** arc is played at: the one frozen when it was entered, or — for a
   * world not entered yet — what entering it right now would freeze, so a portal previews the real
   * number.
   *
   * The preview is for worlds the run has **not** entered, and only for those. A world already
   * entered with nothing frozen is a save written before re-levelling existed, and it reads back at
   * its tier ramp alone — which is exactly what those saves were played at. Letting the preview
   * answer for it instead made a world the player had already *finished* get harder every time they
   * grew: `hardestClearedWeight` climbs all run, the first arc's weight is the smallest number in
   * the game, and the entry world came out at six figures of difficulty (x7.7M on a mid-run save).
   * A world's scale is frozen at entry, full stop; nothing may recompute it live afterwards.
   */
  const entryDifficultyOf = (animeId: string): number => {
    const frozen = animeEntryDifficulties()[animeId];
    if (frozen !== undefined) return frozen;
    if (deps.unlockedAnimeIds().includes(animeId)) return difficultyMultiplier(tierOf(animeId));
    return worldEntryDifficulty(tierOf(animeId), firstArcWeightOf(animeId), hardestClearedWeight());
  };

  /**
   * What one arc is played at — the only number `enemyHp` and `enemyReward` ever take. A world that
   * was not re-levelled comes out flat at its tier difficulty, exactly as it always did; that covers
   * the whole authored chain.
   */
  function difficultyOfArc(arc: Arc): number {
    const tierDifficulty = difficultyMultiplier(tierOf(arc.animeId));
    const entryDifficulty = entryDifficultyOf(arc.animeId);
    if (entryDifficulty <= tierDifficulty) return tierDifficulty;
    return relevelArc(arc, entryDifficulty);
  }

  /**
   * How hard a world reads at a glance — its opening arc, the one a portal is offering. Combat
   * itself always asks `difficultyOfArc`, since a re-levelled world ramps arc by arc.
   */
  const difficultyOf = (animeId: string): number => {
    const first = firstArcOf(animeId);
    return first ? difficultyOfArc(first) : difficultyMultiplier(tierOf(animeId));
  };

  return {
    animeEntryDifficulties,
    animeEntryScales,
    arcPower,
    reachedPower,
    /** How much of the story's ramp an early recruit gets handed back — see `catchUpGrowth`. */
    catchUpOf: (character: Character) => catchUpGrowth(arcPower(), character, reachedPower()),
    tierOf,
    arcsOf,
    difficultyOf,
    difficultyOfArc,
    /**
     * Freezes what a world is played at, at the instant it is entered. Must run *before* the player
     * lands there: both anchors are read off where the run already stands, and would otherwise
     * start measuring the new world against itself.
     */
    freezeEntryScale(animeId: string) {
      const difficulty = worldEntryDifficulty(tierOf(animeId), firstArcWeightOf(animeId), hardestClearedWeight());
      const rungShift = worldEntryScale(authoredRungs[firstArcOf(animeId)?.id ?? ""] ?? 0, reachedPower());
      setAnimeEntryDifficulties((scales) => ({ ...scales, [animeId]: difficulty }));
      setAnimeEntryScales((scales) => ({ ...scales, [animeId]: rungShift }));
    },
    /** A prestige gives back every world entered, so it gives back every scale frozen with them. */
    reset() {
      setAnimeEntryDifficulties({});
      setAnimeEntryScales({});
    },
  };
}
