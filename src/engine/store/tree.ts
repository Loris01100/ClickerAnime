import { createMemo, createSignal } from "solid-js";
import { crossoverSynergyConfig } from "../crossover";
import type { SaveFile } from "../persistence";
import {
  autoAbilityIntervalMs,
  autoAdvanceDelayMs,
  autoClickIntervalMs,
  type AutomationKey,
  AUTOMATION_POSITIONS,
  autoRankSlots,
  autoRematchDelayMs,
  isNodeUnlocked,
  MIN_XP_GROWTH,
  nodeCost,
  nodeLevel,
  nodeLevels,
  PRESTIGE_TREE_CATEGORIES,
  type PrestigeTreeCategoryId,
  purchaseNodeLevel,
  scaledDiscount,
  SHOP_COST_DISCOUNT,
  softenedSynergyConfig,
  totalLevels,
  XP_GROWTH_REDUCTION,
} from "../prestigeTree";
import { defaultSynergyConfig } from "../synergy";
import { XP_GROWTH } from "../growth";
import type { SynergyConfig } from "../types";

export interface TreeStateDeps {
  saved: SaveFile | null;
  /** Points on the table right now — `purchaseLevel` is the only thing that spends them. */
  prestigePoints: () => number;
  setPrestigePoints: (points: number) => void;
  /** True while a bought crossover window is running — the one thing `activeSynergyConfig` needs. */
  crossoverActive: () => boolean;
}

/**
 * The prestige skill tree's bought levels, and every knob they turn.
 *
 * This is the store's dial panel: nothing here plays the game, it only answers "how far is node N
 * of branch B bought, and what does that make X worth right now". Almost every other slice reads
 * one of these — which is exactly why they live together and are created early, before anything
 * that could ask.
 *
 * The "Automatisation" switches sit here too rather than with the tick that fires them: a switch is
 * the player's half of the same node, and `automationRuns` — bought *and* switched on — is the
 * single condition every automation is gated behind (see `docs/economy.md`).
 */
export function createTreeState(deps: TreeStateDeps) {
  const saved = deps.saved;

  // Levels bought per node of the prestige skill tree (see prestigeTree.ts) — meta-progression like
  // prestige points themselves: survives prestigeReset, only hardReset wipes it.
  const [prestigeTreeRanks, setPrestigeTreeRanks] = createSignal<Record<string, number[]>>(
    saved?.prestigeTreeRanks ?? {}
  );

  /** Total levels bought in one prestige-tree branch (0..25) — see prestigeTree.ts for the model. */
  const branchLevelsOf = (categoryId: PrestigeTreeCategoryId) =>
    totalLevels(nodeLevels(prestigeTreeRanks(), categoryId));

  /** How many of a specific node's 5 levels are bought (0..5) — see prestigeTree.ts's `nodeLevel`. */
  const nodeLevelOf = (categoryId: PrestigeTreeCategoryId, position: number) =>
    nodeLevel(nodeLevels(prestigeTreeRanks(), categoryId), position);

  /** A node unlocks once its predecessor has ≥ 1 level; node 1 is always unlocked. */
  const isNodeUnlockedFor = (categoryId: PrestigeTreeCategoryId, position: number) =>
    isNodeUnlocked(nodeLevels(prestigeTreeRanks(), categoryId), position);

  /** What the next level of a specific node costs, or null if it's locked or already maxed. */
  const nodeCostOf = (categoryId: PrestigeTreeCategoryId, position: number) =>
    nodeCost(nodeLevels(prestigeTreeRanks(), categoryId), position);

  /** Buys the next level of one specific node, if it's unlocked, not maxed, and affordable. */
  function purchaseLevel(categoryId: PrestigeTreeCategoryId, position: number): boolean {
    const category = PRESTIGE_TREE_CATEGORIES.find((c) => c.id === categoryId);
    if (!category) return false;
    const result = purchaseNodeLevel(deps.prestigePoints(), prestigeTreeRanks(), category, position);
    if (!result) return false;
    deps.setPrestigePoints(result.prestigePoints);
    setPrestigeTreeRanks(result.ranks);
    return true;
  }

  // --- automation: one node of the "Automatisation" branch behind each switch ---

  /**
   * The "Automatisation" branch's five switches, keyed by `AutomationKey` and holding the ones
   * turned **off** — see `SaveFile.automationOff`. Every one of them automates something already
   * reachable by hand, so switching one off is a real choice, not a downgrade: "Relève" would drag
   * a player out of the cleared arc they came back to farm the common of.
   */
  const [automationOff, setAutomationOff] = createSignal<Record<string, boolean>>(saved?.automationOff ?? {});

  /** Level of the node behind one automation — 0 means unbought, and the UI hides its switch. */
  const automationLevelOf = (key: AutomationKey) => nodeLevelOf("automation", AUTOMATION_POSITIONS[key]);
  /** The player's switch alone, ignoring whether the node is bought — what the toggle renders. */
  const automationEnabled = (key: AutomationKey) => !automationOff()[key];
  /** Bought *and* switched on: the single condition every automation is gated behind. */
  const automationRuns = (key: AutomationKey) => automationLevelOf(key) > 0 && automationEnabled(key);

  /**
   * Whether the bought autoclicker actually runs. It is a perk, not an obligation: some players
   * want to feel their own clicks land, and the pop-ups it draws are noise if you don't. Saved,
   * because a preference that resets on every reload is worse than no preference at all.
   */
  const [autoClickEnabled, setAutoClickEnabled] = createSignal(saved?.autoClickEnabled ?? true);
  /** Level of the autoclicker node — 0 means it isn't bought, so the UI hides the toggle entirely. */
  const autoClickLevel = () => nodeLevelOf("narratorClick", 2);

  const effectiveXpGrowth = createMemo(() => {
    const level = nodeLevelOf("xp", 3);
    return level > 0 ? Math.max(MIN_XP_GROWTH, XP_GROWTH - XP_GROWTH_REDUCTION * level) : XP_GROWTH;
  });

  /**
   * Synergy malus softened by "DPS Équipe" node 3's level — see softenedSynergyConfig.
   *
   * Split in three on purpose, and the split is load-bearing for performance. `crossoverActive()`
   * reads `now()`, so the config below re-runs five times a second forever; `softenedSynergyConfig`
   * builds a **fresh object** at any level above 0, so once that node was bought the memo handed
   * back a new reference every tick. Every consumer is keyed on reference: `permanentModifiers`,
   * and through it `allModifiers`, `modifiersByScope`, `globalModifiers`, `teamWideScaling` — plus
   * every per-arc `bossOutlookOf` memo the progress panel holds, each of which folds the whole
   * roster again. Measured on a 21-strong roster, that doubled the roster fold from one rebuild a
   * tick to two, and it scales with the roster times the arcs on screen.
   *
   * The two branches are memos of their own, so each is a stable reference that only changes when
   * the node level does. The ternary still re-runs every tick — it just returns one of two objects
   * Solid already knows, and the `===` check downstream stops there.
   */
  const softenedConfig = createMemo<SynergyConfig>(() =>
    softenedSynergyConfig(defaultSynergyConfig, nodeLevelOf("teamDps", 3))
  );
  const crossoverConfig = createMemo<SynergyConfig>(() => crossoverSynergyConfig(softenedConfig()));
  const activeSynergyConfig = createMemo<SynergyConfig>(() =>
    deps.crossoverActive() ? crossoverConfig() : softenedConfig()
  );

  return {
    prestigeTreeRanks,
    branchLevelsOf,
    nodeLevelOf,
    isNodeUnlockedFor,
    nodeCostOf,
    purchaseLevel,
    automationOff,
    automationLevelOf,
    automationEnabled,
    automationRuns,
    setAutomationEnabled: (key: AutomationKey, on: boolean) =>
      setAutomationOff((off) => ({ ...off, [key]: !on })),
    autoClickEnabled,
    setAutoClickEnabled,
    autoClickLevel,
    /** Milliseconds between two automatic clicks at the level currently bought; 0 when unbought. */
    autoClickInterval: () => autoClickIntervalMs(autoClickLevel()),
    autoAdvanceDelay: () => autoAdvanceDelayMs(automationLevelOf("advance")),
    autoAbilityInterval: () => autoAbilityIntervalMs(automationLevelOf("ability")),
    autoRematchDelay: () => autoRematchDelayMs(automationLevelOf("rematch")),
    /** How many characters the intendance may look after right now — one slot per node level. */
    autoRankCapacity: () => autoRankSlots(automationLevelOf("rank")),
    effectiveXpGrowth,
    /**
     * The "Destin" node 4 discount, as one number both the display and the till read — the panel
     * printing one price while `buyShopOffer` charged another is exactly the bug this shape
     * prevents. `scaledDiscount` already answers 0 at level 0, so no branch is needed.
     */
    shopDiscount: createMemo(() => scaledDiscount(SHOP_COST_DISCOUNT, nodeLevelOf("destin", 4))),
    activeSynergyConfig,
    /** Only `hardReset` walks the tree back — a prestige spares every level bought. */
    reset() {
      setPrestigeTreeRanks({});
      setAutomationOff({});
    },
  };
}
