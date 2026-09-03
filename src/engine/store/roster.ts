import { createMemo, createSignal } from "solid-js";
import { achievementCount, type AchievementId } from "../achievements";
import { isMixedTeam } from "../crossover";
import { activeEvolution, evolutionKey, evolutionStage } from "../evolutions";
import {
  levelFromXp,
  levelGrowth,
  narratorClickPower,
  PASSIVE_LEVEL_CAP,
  passiveUpgrade,
  xpProgress,
} from "../growth";
import { duplicateGrowth, MAX_DUPLICATES } from "../packs";
import type { SaveFile } from "../persistence";
import { PASSIVE_RANK_DISCOUNT, type PrestigeTreeCategoryId, scaledDiscount, XP_GAIN_PERCENT } from "../prestigeTree";
import { isHomeArc, synergyMultiplier } from "../synergy";
import type { Arc, Character, GameData, Item, SynergyConfig } from "../types";
import type { ContentIndex } from "./content";

/**
 * Shallow value equality over two `Record<string, number>` — the `equals` of `levelsByCharacter`.
 * Solid keys a memo on reference by default, so a record rebuilt from a signal that changes every
 * tick invalidates every consumer even when not one number in it moved.
 */
function sameNumbers(a: Record<string, number>, b: Record<string, number>): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  for (const key of keys) if (a[key] !== b[key]) return false;
  return true;
}

export interface RosterDeps {
  data: GameData;
  content: ContentIndex;
  saved: SaveFile | null;
  nodeLevelOf: (categoryId: PrestigeTreeCategoryId, position: number) => number;
  /** The xp curve as the "XP" node 3 has flattened it — levels are read off it, never stored. */
  effectiveXpGrowth: () => number;
  activeArc: () => Arc | null;
  activeSynergyConfig: () => SynergyConfig;
  /** How much of the story's ramp an early recruit gets handed back — see `catchUpGrowth`. */
  catchUpOf: (character: Character) => number;
  achievementCounts: () => Record<string, number>;
  bumpAchievement: (categoryId: AchievementId, amount?: number) => void;
  /** The origin common a passive rank is paid in, and the stock of it — owned by the inventory. */
  passiveItemOf: (character: Character) => Item | null;
  passiveCopiesOf: (character: Character) => number;
  spendCopies: (itemId: string, amount: number) => void;
}

/**
 * The team: who is in it, how far each member has come, and what that is worth.
 *
 * It gathers the five things that grow a character — xp levels, passive ranks, evolution stages,
 * pack duplicates and the catch-up ramp — because they are only meaningful together:
 * `damageGrowthOf` multiplies three of them in exactly the order `characterContributions` does, and
 * a component printing its own product of two of them is how the roster and the Codex end up
 * disagreeing about the same character.
 *
 * `awayCharacterIds` lives here rather than with the abilities it silences, because being abroad is
 * a fact about the *character* — the same `isHomeArc` test that shuts their passive off is what
 * puts their ability out of reach (`docs/modifiers.md`).
 */
export function createRoster(deps: RosterDeps) {
  const { data, content, saved } = deps;

  const [ownedCharacterIds, setOwnedCharacterIds] = createSignal<string[]>(saved?.ownedCharacterIds ?? []);
  const [characterXp, setCharacterXp] = createSignal<Record<string, number>>(saved?.characterXp ?? {});
  // Passive ranks are permanent mastery: a prestige removes the team and its item stock, but a
  // character recovers every bought rank when recruited again. Only hardReset wipes them.
  const [passiveRanks, setPassiveRanks] = createSignal<Record<string, number>>(saved?.passiveRanks ?? {});
  const [evolvedCharacterIds, setEvolvedCharacterIds] = createSignal<string[]>(saved?.evolvedCharacterIds ?? []);
  // Clamped on the way in, once: a save written before `MAX_DUPLICATES` existed (or an imported
  // one) can hold more copies than a pack will ever sell again, and `duplicateGrowth` is linear in
  // that number. One truth, here, rather than a cap re-applied at every read.
  const [characterDuplicates, setCharacterDuplicates] = createSignal<Record<string, number>>(
    Object.fromEntries(
      Object.entries(saved?.characterDuplicates ?? {}).map(([id, copies]) => [
        id,
        Math.min(MAX_DUPLICATES, copies),
      ])
    )
  );

  const ownedCharacters = createMemo(() => {
    // A Set, not `ownedCharacterIds().includes`: that was a walk of the id list per character, i.e.
    // the whole cast times the roster, on a memo the entire UI hangs off.
    const ids = new Set(ownedCharacterIds());
    return data.characters.filter((c) => ids.has(c.id));
  });

  /** Number of successive forms reached by this character in the current run. */
  const evolutionStageOf = (character: Character) => evolutionStage(character, evolvedCharacterIds());

  const xpOf = (characterId: string) => characterXp()[characterId] ?? 0;
  /** Levels are read off accumulated xp rather than stored, so the two can never drift apart. */
  const levelOf = (characterId: string) => levelFromXp(xpOf(characterId), deps.effectiveXpGrowth());

  /**
   * Every owned character's level, as one record — and, crucially, a memo that only changes when a
   * level actually does.
   *
   * `permanentModifiersFor` needs a level per character, and reading it off `characterXp()` made
   * the whole roster fold depend on the xp signal — which `grantXp` rewrites on *every kill*, five
   * times a second. A level, though, moves a few dozen times in a whole run. The custom `equals`
   * below is what turns "the xp changed" back into "a level changed": on a tick where nobody
   * levelled, the memo keeps its previous object, `permanentModifiers` never sees a new value, and
   * neither do `allModifiers`, `modifiersByScope` or the per-arc `bossOutlookOf` memos.
   */
  const levelsByCharacter = createMemo(
    () => {
      const growth = deps.effectiveXpGrowth();
      const xp = characterXp();
      const levels: Record<string, number> = {};
      for (const id of ownedCharacterIds()) levels[id] = levelFromXp(xp[id] ?? 0, growth);
      return levels;
    },
    undefined,
    { equals: sameNumbers }
  );

  /** Rank the passive runs at (0 = still locked). */
  const passiveRankOf = (character: Character) => passiveRanks()[character.id] ?? 0;

  /** What the next rank costs and whether the copies held cover it — the "Objets" node 2 discount included. */
  function passiveUpgradeOf(character: Character) {
    const level = deps.nodeLevelOf("items", 2);
    const discount = level > 0 ? scaledDiscount(PASSIVE_RANK_DISCOUNT, level) : 0;
    return passiveUpgrade(passiveRankOf(character), character.rarity, deps.passiveCopiesOf(character), discount);
  }

  /** Pack copies held of a character. */
  const duplicatesOf = (characterId: string) => characterDuplicates()[characterId] ?? 0;

  return {
    ownedCharacterIds,
    ownedCharacters,
    characterXp,
    passiveRanks,
    evolvedCharacterIds,
    characterDuplicates,
    xpOf,
    levelOf,
    levelsByCharacter,
    passiveRankOf,
    passiveUpgradeOf,
    duplicatesOf,
    evolutionStageOf,
    progressOf: (characterId: string) => xpProgress(xpOf(characterId), deps.effectiveXpGrowth()),
    isEvolved: (character: Character) => evolutionStageOf(character) > 0,
    activeEvolutionOf: (character: Character) => activeEvolution(character, evolutionStageOf(character)),
    isEvolutionUnlocked: (character: Character, animeId: string) =>
      evolvedCharacterIds().includes(evolutionKey(character.id, animeId)) ||
      (character.evolutions?.[0]?.animeId === animeId && evolvedCharacterIds().includes(character.id)),
    passiveCapOf: (character: Character) => PASSIVE_LEVEL_CAP[character.rarity],
    /** What one narrator click is worth before any modifier: just the allies standing at their side. */
    narratorBase: createMemo(() => narratorClickPower(ownedCharacterIds().length)),
    /** Only a two-world team earns crystals, so the panel can say why the drip stopped. */
    teamIsMixed: () => isMixedTeam(ownedCharacters()),

    /**
     * Who is currently abroad: the active arc belongs to no world they call home. It is the same
     * `isHomeArc` test that already shuts their passive off, and it is what puts their ability out
     * of reach too — a story ability doesn't travel. Empty between arcs, when there is no world to
     * be foreign to.
     */
    awayCharacterIds: createMemo<Set<string>>(() => {
      const arc = deps.activeArc();
      if (!arc) return new Set<string>();
      return new Set(ownedCharacters().filter((c) => !isHomeArc(c, arc, evolutionStageOf(c))).map((c) => c.id));
    }),

    /** Synergy multiplier a character gets from the active arc (1 when no arc is selected). */
    synergyOf(character: Character): number {
      const arc = deps.activeArc();
      return arc ? synergyMultiplier(character, arc, deps.activeSynergyConfig(), evolutionStageOf(character)) : 1;
    },

    /**
     * What multiplies a character's printed base damage right now: levels, pack duplicates and the
     * catch-up ramp, stacked exactly as `characterContributions` does it. Lives here rather than in
     * a component so the roster and the Codex can never print two different numbers for the same
     * character.
     */
    damageGrowthOf(characterId: string): number {
      const character = content.characterOf(characterId);
      return (
        levelGrowth(levelOf(characterId)) *
        duplicateGrowth(duplicatesOf(characterId)) *
        (character ? deps.catchUpOf(character) : 1)
      );
    },

    /**
     * Every kill trains the whole team equally; levels are uncapped so this never stops paying.
     * Boosted by "XP" node 1's level — a flat percent on every grant, whatever its source.
     */
    grantXp(amount: number) {
      if (amount <= 0) return;
      const xpGainLevel = deps.nodeLevelOf("xp", 1);
      const boosted = xpGainLevel > 0 ? amount * (1 + XP_GAIN_PERCENT * xpGainLevel) : amount;
      setCharacterXp((xp) => {
        const next = { ...xp };
        for (const id of ownedCharacterIds()) next[id] = (next[id] ?? 0) + boosted;
        return next;
      });
    },

    /** One-off xp grant to a single character — the "XP" tree tier 4 recruit bonus. */
    grantXpTo(characterId: string, amount: number) {
      if (amount <= 0) return;
      setCharacterXp((xp) => ({ ...xp, [characterId]: (xp[characterId] ?? 0) + amount }));
    },

    /**
     * Every owned character whose passive can be ranked up right now. One memo rather than the same
     * `some(...)` scan copied into each component: the Codex needs it per character *and* per
     * world, and the menu only needs to know whether to badge its Codex entry.
     */
    rankablePassiveIds: createMemo(
      () =>
        new Set(
          ownedCharacters()
            .filter((character) => character.passive && passiveUpgradeOf(character).affordable)
            .map((character) => character.id)
        )
    ),

    /**
     * The first character whose passive is affordable *and* never yet ranked this save — the
     * tutorial's payoff. `null` the moment any rank has ever been bought, so it only ever fires
     * once. Lives here rather than in two components: `App` announces it and `RosterPanel` unfolds
     * the team on it, and they must agree on which character that is.
     */
    firstAffordablePassive: createMemo<Character | null>(() => {
      const ranksBought = achievementCount(
        deps.achievementCounts(),
        "passiveRanksBought",
        ownedCharacters().reduce((sum, character) => sum + passiveRankOf(character), 0)
      );
      if (ranksBought > 0) return null;
      return ownedCharacters().find((c) => c.passive && passiveUpgradeOf(c).affordable) ?? null;
    }),

    /**
     * Spends the origin item to buy the next rank of a character's passive. Refuses on a character
     * who isn't in the team: `characterContributions` only ever runs on owned characters, so the
     * copies would be burnt for nothing (the item Codex lists the whole cast, met or not). Refuses
     * the same way on a character with no `passive` at all — a rank on nothing is copies burnt for
     * nothing too, and `passive` stays optional in the type even though the whole production cast
     * carries one.
     */
    rankUpPassive(character: Character): boolean {
      if (!character.passive) return false;
      if (!ownedCharacterIds().includes(character.id)) return false;
      const item = deps.passiveItemOf(character);
      const upgrade = passiveUpgradeOf(character);
      if (!item || !upgrade.affordable) return false;
      deps.spendCopies(item.id, upgrade.cost);
      setPassiveRanks((ranks) => ({ ...ranks, [character.id]: upgrade.rank + 1 }));
      deps.bumpAchievement("passiveRanksBought");
      return true;
    },

    /** The three ways someone joins: a mob that fell, a shop offer, a crossover portal. */
    recruit(characterId: string) {
      setOwnedCharacterIds((ids) => (ids.includes(characterId) ? ids : [...ids, characterId]));
    },
    /** Unlocks the forms whose world is the one now active — `maybeEvolve`'s write half. */
    markEvolved(keys: string[]) {
      setEvolvedCharacterIds((ids) => [...ids, ...keys]);
    },
    /** One more pack copy of a character — the only thing that moves the duplicate count up. */
    addDuplicate(characterId: string) {
      setCharacterDuplicates((copies) => ({ ...copies, [characterId]: (copies[characterId] ?? 0) + 1 }));
    },

    /** A prestige takes the team, its xp and the forms it had reached; the ranks it leaves. */
    resetRun() {
      setOwnedCharacterIds([]);
      setCharacterXp({});
      setEvolvedCharacterIds([]);
    },
    /** Only a hard reset also gives back the passive ranks and the duplicates bought with points. */
    resetAll() {
      this.resetRun();
      setPassiveRanks({});
      setCharacterDuplicates({});
    },
  };
}
