import { createMemo } from "solid-js";
import { challengeContributions } from "../challenges";
import { scaledUniqueEffect } from "../forge";
import { foldScopedStat, scopedBuffCap } from "../modifiers";
import { prestigeTreeContributions } from "../prestigeTree";
import { characterContributions } from "../synergy";
import type { ActiveModifier, Arc, Character, GameData, Item, SynergyConfig } from "../types";

export interface ModifierFoldDeps {
  data: GameData;
  itemOf: (id: string | undefined | null) => Item | null;
  now: () => number;
  /** The coarse display clock the per-character columns fold against — see `statClock`. */
  statClock: () => number;
  clearedArcIds: () => string[];
  activeArc: () => Arc | null;
  activeSynergyConfig: () => SynergyConfig;
  // --- the roster's half of a character's contribution ---
  ownedCharacters: () => Character[];
  levelsByCharacter: () => Record<string, number>;
  passiveRankOf: (character: Character) => number;
  evolutionStageOf: (character: Character) => number;
  duplicatesOf: (characterId: string) => number;
  catchUpOf: (character: Character) => number;
  awayCharacterIds: () => Set<string>;
  narratorBase: () => number;
  // --- the three team-wide sources ---
  characterEquipment: () => Record<string, string>;
  uniqueUpgradeLevelOf: (itemId: string) => number;
  achievementModifiers: () => ActiveModifier[];
  prestigeTreeRanks: () => Record<string, number[]>;
  completedChallengeIds: () => string[];
  /** The buffs currently running — the only timed source, owned by `store/abilityState.ts`. */
  temporaryModifiers: () => ActiveModifier[];
}

/**
 * The fold: every modifier the game can produce, grouped the way `modifiers.ts` wants them, and the
 * two numbers that come out of it — `clickPower` and `teamDps`.
 *
 * The order is the balance (`docs/modifiers.md`): `(base + flats) * (1 + Σpercents) * Πmultipliers`,
 * applied by `foldScopedStat` and nowhere else. Changing it rebalances the whole game, which is the
 * reason it has a file of its own rather than sitting in the middle of the store.
 *
 * The memo chain is also deliberately shaped, and each link is load-bearing for performance:
 *  - `permanentModifiers` is the expensive half (the whole roster back through
 *    `characterContributions`) and the half that changes least — a recruit, a level, a rank, an
 *    equip;
 *  - `allModifiers` is deliberately **not** a function of `now()`: expiry is applied where the
 *    arithmetic happens, so cutting the list here as well only rebuilt every group five times a
 *    second. The tick drops expired buffs from the signal itself;
 *  - `globalModifiers` / `teamWideScaling` / `modifiersByScope` are what `foldScopedStat` is handed,
 *    so `characterStatOf` does not re-derive them once per roster row.
 */
export function createModifierFold(deps: ModifierFoldDeps) {
  const { data } = deps;

  /**
   * Everything the team permanently contributes **as if `arc` were the arc being fought** — the
   * characters' own damage, their passives, evolution bonuses and equipped uniques, all scaled by
   * that arc's synergy, plus the achievements and the prestige tree. No running buff: those are
   * timed, and the only caller that wants them is `allModifiers`, which adds them itself.
   *
   * Exposed as a function because `bossOutlookOf` needs the same sum against an arc that isn't the
   * active one, and rebuilding it by hand there left most of a grown team's dps out.
   */
  function permanentModifiersFor(arc: Arc | null): ActiveModifier[] {
    const config = deps.activeSynergyConfig();
    const equipment = deps.characterEquipment();
    const levels = deps.levelsByCharacter();
    const equipmentOf = (c: Character) => {
      const itemId = equipment[c.id];
      const item = deps.itemOf(itemId);
      return item && item.kind === "unique"
        ? [
            {
              ...item,
              effects: item.effects?.map((effect) => scaledUniqueEffect(effect, deps.uniqueUpgradeLevelOf(item.id))),
            },
          ]
        : [];
    };
    const fromCharacters = deps.ownedCharacters().flatMap((c) =>
      characterContributions(
        c,
        arc,
        config,
        levels[c.id] ?? 0,
        deps.passiveRankOf(c),
        deps.evolutionStageOf(c),
        equipmentOf(c),
        deps.duplicatesOf(c.id),
        deps.catchUpOf(c)
      )
    );
    return [
      ...fromCharacters,
      ...deps.achievementModifiers(),
      ...prestigeTreeContributions(deps.prestigeTreeRanks()),
      ...challengeContributions(deps.completedChallengeIds()),
    ];
  }

  const permanentModifiers = createMemo<ActiveModifier[]>(() => permanentModifiersFor(deps.activeArc()));

  const allModifiers = createMemo<ActiveModifier[]>(() => {
    const away = deps.awayCharacterIds();
    return [
      ...permanentModifiers(),
      // A buff whose character has left their world stops applying the moment they arrive, exactly
      // like their passive. Otherwise "a capacity doesn't travel" would be a rule you walk around:
      // fire everything at home, then step into the next world with the buffs still up.
      ...deps.temporaryModifiers().filter((m) => m.scope === undefined || !away.has(m.scope)),
    ];
  });

  /**
   * The unscoped modifiers, and the subset of them that scales every scoped group — achievements,
   * the prestige tree, challenge rewards, evolution bonuses.
   */
  const globalModifiers = createMemo(() => allModifiers().filter((m) => m.scope === undefined));
  const teamWideScaling = createMemo(() => globalModifiers().filter((m) => m.kind !== "flat"));

  /** The scoped modifiers of each character, grouped the way `foldScopedStat` wants them. */
  const modifiersByScope = createMemo(() => {
    const byScope = new Map<string, ActiveModifier[]>();
    for (const mod of allModifiers()) {
      if (mod.scope === undefined) continue;
      const group = byScope.get(mod.scope);
      if (group) group.push(mod);
      else byScope.set(mod.scope, [mod]);
    }
    return byScope;
  });

  /**
   * How far a buff may lift its own character right now: `SCOPED_BUFF_CAP_FLOOR` on the first arc,
   * the full `SCOPED_BUFF_CAP` once the run stands on the last one. Read off cleared arcs, so it
   * climbs with the story and `prestigeReset` walks it back to the floor with everything else.
   *
   * Denominator is `arcs.length - 1`, not `arcs.length`: the ceiling is meant to be reached *on*
   * the final arc, not one clear after the game has ended.
   */
  const buffCap = createMemo(() =>
    scopedBuffCap(data.arcs.length > 1 ? deps.clearedArcIds().length / (data.arcs.length - 1) : 1)
  );

  return {
    permanentModifiersFor,
    allModifiers,
    globalModifiers,
    teamWideScaling,
    modifiersByScope,
    buffCap,
    /** Damage of one narrator click. */
    clickPower: createMemo(() =>
      foldScopedStat(
        deps.narratorBase(),
        "clickPower",
        globalModifiers(),
        teamWideScaling(),
        modifiersByScope().values(),
        deps.now(),
        buffCap()
      )
    ),
    /** Damage the team deals on its own, per second. */
    teamDps: createMemo(() =>
      foldScopedStat(0, "teamDps", globalModifiers(), teamWideScaling(), modifiersByScope().values(), deps.now(), buffCap())
    ),

    /**
     * A character's actual contribution in the active arc, as the roster and Codex show it — the
     * very term `computeScopedStat` adds for them into `teamDps`/`clickPower`, so the column sums to
     * the team's total instead of a fraction of it.
     *
     * That is the whole point of routing it through `allModifiers` rather than rebuilding the
     * character's own contributions here: a scoped group is never folded alone in the team's stat,
     * it is folded *with* everything team-wide — achievements, the prestige tree, challenge rewards,
     * every evolution bonus — which is most of a grown team's damage. Leaving it out printed each
     * character at their bare damage while the team header showed the scaled sum, and a 40-strong
     * roster averaging 3k dps sat under a 240k total with no ability running.
     *
     * The same mastery cap as the team total still applies to temporary abilities, and a character
     * who isn't recruited has no group at all: they contribute nothing, and read as 0.
     */
    characterStatOf(character: Character, target: "teamDps" | "clickPower"): number {
      const own = modifiersByScope().get(character.id);
      if (!own) return 0;
      // The base term is 0 and the team-wide flats are deliberately left out: this column answers
      // "what does *this* character bring", and the flats belong to the team, not to a row.
      // `statClock`, not `now`: a display column, refolded when the buff list changes rather than
      // five times a second. See the signal for why that is exact and not just cheap.
      return foldScopedStat(0, target, teamWideScaling(), teamWideScaling(), [own], deps.statClock(), buffCap());
    },
  };
}
