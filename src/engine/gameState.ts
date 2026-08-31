import { batch, createMemo, createSignal, onCleanup } from "solid-js";
import { achievementContributions } from "./achievements";
import { computeScopedStat, foldScopedStat, pruneExpired, scopedBuffCap } from "./modifiers";
import {
  applyPrestige,
  PRESTIGE_SCALE,
  calculatePrestigeGain,
  canUnlockAnime,
  createInitialPrestigeState,
  unlockAnime as unlockAnimeState,
} from "./prestige";
import { characterContributions, defaultSynergyConfig, isHomeArc, synergyMultiplier } from "./synergy";
import {
  CROSSOVER_BOSS_REWARD,
  CROSSOVER_COST,
  CROSSOVER_DURATION_MS,
  CROSSOVER_MOB_CHANCE,
  crossoverSynergyConfig,
  isMixedTeam,
} from "./crossover";
import {
  autoFirable,
  cooldownOf,
  cooldownRemaining,
  diagnoseAbility,
  dutyMagnitude,
  getUnlockedAbilities,
  isAbilityReady,
  scopedMagnitude,
} from "./abilities";
import type { AbilityDiagnostic, AbilityPolicy, UnlockedAbility } from "./abilities";
import {
  clearSaveSlots,
  decodeSave,
  encodeSave,
  hasValidBackup,
  readSave,
  restoreBackupSlots,
  SAVE_VERSION,
  writeSave,
  type SaveFile,
} from "./persistence";
export { SAVE_BACKUP_KEY, SAVE_KEY } from "./persistence";
import {
  damageMultiplierAgainst,
  enemyHp,
  enemyReward,
  killRateOf,
  nextEnemy,
  pendingRecruits,
  rollsDrop,
  timeToKillMs,
  type DamageSource,
} from "./combat";
import { canBuyShopOffer, discountedShopCost, shopOfferUnlocked } from "./shop";
import { buildPrestigeReport, type PrestigeReport } from "./prestigeReport";
import {
  sanitizedEquipment,
  scaledUniqueEffect,
  UNIQUE_FORGE_FRAGMENT_COSTS,
  UNIQUE_FORGE_MULTIPLIERS,
  uniqueRanksFromSave,
} from "./forge";
export { UNIQUE_FORGE_FRAGMENT_COSTS, UNIQUE_FORGE_MULTIPLIERS } from "./forge";
import { drawPack, duplicateGrowth, packPool, PACK_COST, POINTS_PER_KILL } from "./packs";
import {
  arcPowerTable,
  catchUpGrowth,
  levelFromXp,
  levelGrowth,
  reachedArcPower,
  narratorClickPower,
  passiveUpgrade,
  firstPassiveDropChance,
  PASSIVE_LEVEL_CAP,
  XP_GROWTH,
  XP_PER_KILL_REWARD,
  xpProgress,
} from "./growth";
import {
  canRecruitUnder,
  challengeById,
  clickIsMuted,
  challengeContributions,
  challengeProgress,
  type ChallengeRules,
  CHALLENGES,
  NO_CHALLENGE_RULES,
} from "./challenges";
import {
  animeTier,
  arcsOfAnime,
  canEnterNewAnime,
  difficultyMultiplier,
  isAnimeAvailable,
  isAnimeComplete,
  isArcUnlocked,
} from "./progression";
import {
  ABILITY_DAMAGE_BOOST,
  ABILITY_DURATION_BOOST,
  AUSPICE_DOUBLE_DROP_CHANCE,
  autoAbilityIntervalMs,
  autoAdvanceDelayMs,
  autoClickIntervalMs,
  autoCrossoverReserve,
  type AutomationKey,
  AUTOMATION_POSITIONS,
  autoRankSlots,
  abilityPolicyChoices as policyChoices,
  autoRematchDelayMs,
  BOSS_TIMER_BOOST,
  BOSS_XP_BOOST,
  CLICK_COOLDOWN_REDUCTION_MS,
  CRIT_CHANCE,
  CRIT_MULTIPLIER,
  CURRENCY_GAIN_PERCENT,
  DOUBLE_DROP_CHANCE,
  DOUBLE_PRESTIGE_CHANCE,
  DROP_CHANCE_BOOST,
  FREE_ABILITY_TRIGGER_CHANCE,
  GHOST_LOOT_CHANCE,
  isNodeUnlocked,
  MIN_XP_GROWTH,
  nodeCost,
  nodeLevel,
  nodeLevels,
  PASSIVE_RANK_DISCOUNT,
  PITY_KILLS_THRESHOLD,
  PITY_REDUCTION_PER_LEVEL,
  PRESTIGE_PER_KILL_CHANCE,
  prestigeTreeContributions,
  PRESTIGE_TREE_CATEGORIES,
  purchaseNodeLevel,
  RECRUIT_XP_BONUS,
  scaledChance,
  scaledDiscount,
  SHOP_COST_DISCOUNT,
  softenedSynergyConfig,
  totalLevels,
  XP_GAIN_PERCENT,
  XP_GROWTH_REDUCTION,
  XP_PASSIVE_PER_SECOND,
} from "./prestigeTree";
import type {
  AbilityDefinition,
  ActiveModifier,
  Anime,
  Arc,
  Character,
  Enemy,
  Item,
  ModifierTemplate,
  Rarity,
  ShopOffer,
  SynergyConfig,
} from "./types";

export interface GameData {
  animes: Anime[];
  arcs: Arc[];
  characters: Character[];
  items: Item[];
  /** absent in older/test fixtures; every reader defaults it to an empty shop */
  shop?: ShopOffer[];
}

const TICK_MS = 200;
/**
 * Ceiling on one tick's elapsed time. `setInterval` doesn't fire while the machine sleeps or the
 * tab is throttled, so the first tick back would otherwise carry hours of `deltaMs` and hand out
 * free kills and xp — offline progress by accident, which the game deliberately doesn't have.
 */
const MAX_TICK_DELTA_MS = TICK_MS * 5;
const AUTOSAVE_MS = 5_000;
/** How long one HUD notice stays up, and how many can stack before the oldest is dropped. */
const NOTICE_MS = 4_000;
const MAX_NOTICES = 4;

/** One "you just gained something" event, popped up by the HUD and pruned by the main tick. */
export interface Notice {
  id: number;
  kind: "item" | "recruit" | "arc" | "unlock";
  text: string;
  count: number;
  expiresAt: number;
}

/** Safety net on `dealDamage`'s overkill carry-over — see there. Not a balance knob. */
const MAX_KILLS_PER_HIT = 100;
/**
 * Kills the game will resolve per second, however far the team outguns the zone — and, unlike
 * `MAX_KILLS_PER_HIT`, very much a balance knob.
 *
 * Overkill carry-over (see `dealDamage`) makes the kill rate `dps / mob hp`: the team's damage
 * keeps growing while a cleared arc's mobs stay where they are, so going back to farm an old zone
 * — which the passive-item design *wants* the player to do — resolved hundreds of fights a second.
 * Every per-kill reward rides on that: item drops, currency, xp, pack points. Capping the rate is
 * what stops "how overpowered am I" from being the real drop rate; nothing else needs a cap.
 *
 * It never touches a boss (one enemy, one kill) and never bites during normal progress, where the
 * team is nowhere near outgunning the zone by 20x.
 */
export const MAX_KILLS_PER_SECOND = 5;
/** Currency paid by a defeated enemy; XP keeps using the full data reward. */
export const CURRENCY_REWARD_MULTIPLIER = 0.75;
/** Price of one current-arc common item, measured in ordinary victories. */
export const SUPPLY_KILLS_PER_COPY = 15;
export function createGameStore(data: GameData) {
  const loadedSave = readSave();
  const saved = loadedSave.save;
  const [hasBackupSave, setHasBackupSave] = createSignal(hasValidBackup());

  /**
   * Id indexes over the content, built once.
   *
   * `data` never changes at runtime, and almost every lookup in this file and in the UI was a
   * `data.<section>.find(...)` — a linear walk of 175 characters, 273 arcs and enemies or 68 items,
   * several of them per roster row and per kill. Same answers, built once instead of per call. The
   * accessors below are what the UI reads; nothing here may mutate the maps.
   */
  const characterIndex = new Map(data.characters.map((c) => [c.id, c]));
  const itemIndex = new Map(data.items.map((i) => [i.id, i]));
  const arcIndex = new Map(data.arcs.map((a) => [a.id, a]));
  const animeIndex = new Map(data.animes.map((a) => [a.id, a]));

  /**
   * The arc each character is first met in — `originArcOf`'s answer, precomputed.
   *
   * Arcs are walked in data order and the first one to name a character wins, exactly as the scan
   * it replaces did. It fed `passiveItemOf`, which the roster calls twice per row (directly, and
   * again through `passiveUpgradeOf`), each call walking every arc's boss and mob list.
   */
  const originArcIndex = new Map<string, Arc>();
  for (const arc of data.arcs) {
    if (arc.boss.characterId && !originArcIndex.has(arc.boss.characterId)) {
      originArcIndex.set(arc.boss.characterId, arc);
    }
    for (const mob of arc.mobs) {
      if (mob.characterId && !originArcIndex.has(mob.characterId)) originArcIndex.set(mob.characterId, arc);
    }
  }

  /** O(1) content lookups by id — the UI reads these rather than re-scanning `data`. */
  const characterOf = (id: string | undefined | null) => (id ? characterIndex.get(id) ?? null : null);
  const itemOf = (id: string | undefined | null) => (id ? itemIndex.get(id) ?? null : null);
  const arcOf = (id: string | undefined | null) => (id ? arcIndex.get(id) ?? null : null);
  const animeOf = (id: string | undefined | null) => (id ? animeIndex.get(id) ?? null : null);

  const [now, setNow] = createSignal(Date.now());
  // When the last autosave landed, so the topbar can say so — a silent autosave is indistinguishable
  // from a broken one. 0 until the first write; `save()` is the only thing that sets it.
  const [lastSavedAt, setLastSavedAt] = createSignal(0);
  const [currency, setCurrency] = createSignal(saved?.currency ?? 0);
  const [lifetimeEarned, setLifetimeEarned] = createSignal(saved?.lifetimeEarned ?? 0);
  const [ownedCharacterIds, setOwnedCharacterIds] = createSignal<string[]>(saved?.ownedCharacterIds ?? []);
  const [activeArcId, setActiveArcId] = createSignal<string | null>(saved?.activeArcId ?? null);
  const [arcKills, setArcKills] = createSignal<Record<string, number>>(saved?.arcKills ?? {});
  const [clearedArcIds, setClearedArcIds] = createSignal<string[]>(saved?.clearedArcIds ?? []);
  const [characterXp, setCharacterXp] = createSignal<Record<string, number>>(saved?.characterXp ?? {});
  const [itemCounts, setItemCounts] = createSignal<Record<string, number>>(saved?.itemCounts ?? {});
  const [uniqueFragments, setUniqueFragments] = createSignal<Record<string, number>>(saved?.uniqueFragments ?? {});
  // Forge levels are permanent mastery. Prestige removes the unique and its fragments, but the
  // next copy found recovers this level. Only hardReset wipes the map.
  const [uniqueUpgradeRanks, setUniqueUpgradeRanks] = createSignal<Record<string, number>>(
    uniqueRanksFromSave(data.items, saved)
  );
  // Passive ranks are permanent mastery: a prestige removes the team and its item stock, but a
  // character recovers every bought rank when recruited again. Only hardReset wipes them.
  const [passiveRanks, setPassiveRanks] = createSignal<Record<string, number>>(saved?.passiveRanks ?? {});
  const [evolvedCharacterIds, setEvolvedCharacterIds] = createSignal<string[]>(saved?.evolvedCharacterIds ?? []);
  // Lifetime totals for the achievement ladders (see achievements.ts) — never decrease and, unlike
  // the rest of a run, survive prestigeReset; only hardReset wipes them.
  const [achievementCounts, setAchievementCounts] = createSignal<Record<string, number>>(
    saved?.achievementCounts ?? {}
  );
  const [runStartedAt, setRunStartedAt] = createSignal(saved?.runStartedAt ?? Date.now());
  const [runAchievementBaseline, setRunAchievementBaseline] = createSignal<Record<string, number>>(
    saved?.runAchievementBaseline ?? saved?.achievementCounts ?? {}
  );
  const [lastPrestigeReport, setLastPrestigeReport] = createSignal<PrestigeReport | null>(null);
  // Levels bought per node of the prestige skill tree (see prestigeTree.ts) — meta-progression like
  // prestige points themselves: survives prestigeReset, only hardReset wipes it.
  const [prestigeTreeRanks, setPrestigeTreeRanks] = createSignal<Record<string, number[]>>(
    saved?.prestigeTreeRanks ?? {}
  );
  // Kills since the last item drop, per arc — feeds the "Objets" tier 4 pity timer. Transient like
  // the rest of combat state: a reload forgets the streak.
  const [killsSinceDrop, setKillsSinceDrop] = createSignal<Record<string, number>>({});
  // Sub-tick accumulator driving the "Clic du Narrateur" tier 2 autoclicker. Also transient.
  const [autoClickAccumMs, setAutoClickAccumMs] = createSignal(0);
  /**
   * Bumped every time the autoclicker fires, so the stage can pop the damage the way it pops a
   * manual click. `id` is what the effect keys on — `damage` alone would miss two identical hits
   * in a row. Transient: a reload has no autoclick to redraw.
   */
  const [autoClickPulse, setAutoClickPulse] = createSignal({ id: 0, damage: 0 });
  /**
   * Whether the bought autoclicker actually runs. It is a perk, not an obligation: some players
   * want to feel their own clicks land, and the pop-ups it now draws are noise if you don't. Saved,
   * because a preference that resets on every reload is worse than no preference at all.
   */
  const [autoClickEnabled, setAutoClickEnabled] = createSignal(saved?.autoClickEnabled ?? true);
  /** Level of the autoclicker node — 0 means it isn't bought, so the UI hides the toggle entirely. */
  const autoClickLevel = () => nodeLevelOf("narratorClick", 2);
  /** Milliseconds between two automatic clicks at the level currently bought; 0 when unbought. */
  const autoClickInterval = () => autoClickIntervalMs(autoClickLevel());
  /**
   * The "Automatisation" branch's five switches, keyed by `AutomationKey` and holding the ones
   * turned **off** — see `SaveFile.automationOff`. Every one of them automates something already
   * reachable by hand, so switching one off is a real choice, not a downgrade: "Relève" would drag
   * a player out of the cleared arc they came back to farm the common of.
   */
  const [automationOff, setAutomationOff] = createSignal<Record<string, boolean>>(saved?.automationOff ?? {});
  /** Characters the "Intendance" node ranks up on its own. Run-scoped: the roster goes on prestige. */
  const [autoRankCharacterIds, setAutoRankCharacterIds] = createSignal<string[]>(
    saved?.autoRankCharacterIds ?? []
  );
  /**
   * When "Relève" walks on to the next arc, and when "Second souffle" asks for the rematch — both
   * armed by the event that makes them possible (the kill that clears the arc, the boss timing out)
   * rather than derived from the state, so neither can fire on an arc the player *chose* to return
   * to. Transient, and cleared by any manual arc change.
   */
  const [autoAdvanceAt, setAutoAdvanceAt] = createSignal<number | null>(null);
  const [autoRematchAt, setAutoRematchAt] = createSignal<number | null>(null);
  /** Sub-tick accumulator for the "Réflexe" node, like `autoClickAccumMs`. Transient. */
  const [autoAbilityAccumMs, setAutoAbilityAccumMs] = createSignal(0);
  /**
   * Défis de run (`challenges.ts`): the challenge being played, and the ones already cleared. The
   * active one survives `prestigeReset` — a prestige mid-challenge restarts its progress, since the
   * goal counts the *run's* cleared arcs, and that is the honest reading of "play a run under this
   * rule". The cleared list is meta-progression like the achievement counts: only `hardReset` wipes
   * it, because its rewards are permanent.
   */
  const [activeChallengeId, setActiveChallengeId] = createSignal<string | null>(saved?.activeChallengeId ?? null);
  const [completedChallengeIds, setCompletedChallengeIds] = createSignal<string[]>(
    saved?.completedChallengeIds ?? []
  );
  const activeChallenge = createMemo(() => challengeById(activeChallengeId()));
  /** The rules in force right now — `NO_CHALLENGE_RULES` rather than null, so no caller branches. */
  const challengeRules = createMemo<ChallengeRules>(() => activeChallenge()?.rules ?? NO_CHALLENGE_RULES);
  // Kills `dealDamage` may still resolve, refilled by the tick at MAX_KILLS_PER_SECOND and capped
  // there so an idle stretch banks no burst. Transient like the rest of combat state.
  const [killBudget, setKillBudget] = createSignal(MAX_KILLS_PER_SECOND);
  // characterId -> itemId for equipped unique items.
  const [characterEquipment, setCharacterEquipment] = createSignal<Record<string, string>>(
    sanitizedEquipment(
      data.characters,
      data.items,
      saved?.characterEquipment,
      saved?.itemCounts ?? {},
      saved?.ownedCharacterIds ?? []
    )
  );
  // Cristaux de crossover: earned on kills with a team spanning two worlds, spent to lift the
  // synergy malus for a while (see crossover.ts). Run-scoped like items — prestigeReset wipes them.
  const [crossoverCrystals, setCrossoverCrystals] = createSignal(saved?.crossoverCrystals ?? 0);
  // Pack points, one bucket per world: earned on every fight won there, spent on that world's
  // packs (see packs.ts). Meta-progression like the duplicates they buy — prestigeReset spares
  // both, only hardReset wipes them.
  const [worldPoints, setWorldPoints] = createSignal<Record<string, number>>(saved?.worldPoints ?? {});
  const [characterDuplicates, setCharacterDuplicates] = createSignal<Record<string, number>>(
    saved?.characterDuplicates ?? {}
  );
  // When the current crossover window ends. Transient like combat state: a reload drops the buff.
  const [crossoverUntil, setCrossoverUntil] = createSignal(0);
  /** True while a bought crossover window is still running — see activateCrossover. */
  const crossoverActive = () => crossoverUntil() > now();
  const crossoverRemaining = () => Math.max(0, crossoverUntil() - now());
  const [prestige, setPrestige] = createSignal(
    saved
      ? { prestigePoints: saved.prestigePoints ?? 0, unlockedAnimeIds: saved.unlockedAnimeIds ?? [] }
      : createInitialPrestigeState()
  );
  const [temporaryModifiers, setTemporaryModifiers] = createSignal<ActiveModifier[]>([]);
  // Combat itself restarts on reload, but cooldowns do not: otherwise Ctrl+F5 becomes an ability reset.
  const [abilityLastUsed, setAbilityLastUsed] = createSignal<Record<string, number>>(saved?.abilityLastUsed ?? {});
  /**
   * How the automation is allowed to spend each ability — a preference, like `autoClickEnabled`, so
   * it survives a prestige. Only non-default entries are stored.
   */
  const [abilityPolicy, setAbilityPolicyMap] = createSignal<Record<string, AbilityPolicy>>(
    saved?.abilityPolicy ?? {}
  );
  /** The plans "Réflexe" has opened at its current level — [] while the node is unbought. */
  const abilityPolicyChoices = () => policyChoices(automationLevelOf("ability"));
  /**
   * A plan the node no longer opens reads as `"always"`: a prestige reset can't take levels away,
   * but a save carried across a rebalance can, and a stored plan must never silently keep working.
   */
  const abilityPolicyOf = (abilityId: string): AbilityPolicy => {
    const stored = abilityPolicy()[abilityId] ?? "always";
    return abilityPolicyChoices().includes(stored) ? stored : "always";
  };
  function setAbilityPolicy(abilityId: string, policy: AbilityPolicy) {
    setAbilityPolicyMap((map) => {
      const next = { ...map };
      if (policy === "always") delete next[abilityId];
      else next[abilityId] = policy;
      return next;
    });
  }

  // Transient feed of "you just gained something" events — the HUD pops them up (see ui/Notices.tsx)
  // because a drop, a recruit or a cleared arc otherwise happen in complete silence. Pruned by the
  // main tick rather than a timer per notice, so no stray timeout outlives the store.
  const [notices, setNotices] = createSignal<Notice[]>([]);
  let noticeId = 0;
  function pushNotice(kind: Notice["kind"], text: string) {
    setNotices((list) => {
      const expiresAt = Date.now() + NOTICE_MS;
      const duplicate = list.find((notice) => notice.kind === kind && notice.text === text);
      if (duplicate) {
        return list.map((notice) =>
          notice.id === duplicate.id ? { ...notice, count: notice.count + 1, expiresAt } : notice
        );
      }
      return [...list, { id: noticeId++, kind, text, count: 1, expiresAt }].slice(-MAX_NOTICES);
    });
  }
  /** Presentation unlocks share the same bounded, dismissible HUD queue as gameplay events. */
  const announceUnlock = (text: string) => pushNotice("unlock", text);
  const dismissNotice = (id: number) => setNotices((list) => list.filter((n) => n.id !== id));

  // Combat is transient: the current fight restarts from scratch on reload rather than being saved.
  // Pause : le jeu ne tourne plus du tout. Le tick sort tôt et, à la reprise, toute échéance
  // absolue (timer de boss, cooldowns, buffs, automatisations) est décalée de la durée de la pause,
  // pour qu'une pause ne fasse ni perdre ni gagner de temps.
  const [paused, setPaused] = createSignal(false);
  const [enemy, setEnemy] = createSignal<Enemy | null>(null);
  const [enemyHpLeft, setEnemyHpLeft] = createSignal(0);
  const [enemyMaxHp, setEnemyMaxHp] = createSignal(0);
  const [timerDeadline, setTimerDeadline] = createSignal<number | null>(null);
  // The timer's full length, boost included — the bar needs it as its denominator, and the raw
  // `Enemy.timerMs` is not it once "DPS Équipe" node 5 has stretched a boss's clock.
  const [timerTotal, setTimerTotal] = createSignal<number | null>(null);
  const [lastTimeout, setLastTimeout] = createSignal(0);
  // Arcs whose boss timed out on the player: farming resumes instead of respawning the same boss,
  // so the player is never stuck. Also transient — a reload forgets it, like the rest of combat.
  const [bossRetreatArcIds, setBossRetreatArcIds] = createSignal<string[]>([]);

  /** Total levels bought in one prestige-tree branch (0..25) — see prestigeTree.ts for the model. */
  const branchLevelsOf = (categoryId: string) => totalLevels(nodeLevels(prestigeTreeRanks(), categoryId));

  /** How many of a specific node's 5 levels are bought (0..5) — see prestigeTree.ts's `nodeLevel`. */
  const nodeLevelOf = (categoryId: string, position: number) =>
    nodeLevel(nodeLevels(prestigeTreeRanks(), categoryId), position);

  /** A node unlocks once its predecessor has ≥1 level; node 1 is always unlocked. */
  const isNodeUnlockedFor = (categoryId: string, position: number) =>
    isNodeUnlocked(nodeLevels(prestigeTreeRanks(), categoryId), position);

  /** What the next level of a specific node costs, or null if it's locked or already maxed. */
  const nodeCostOf = (categoryId: string, position: number) =>
    nodeCost(nodeLevels(prestigeTreeRanks(), categoryId), position);

  // --- automation: one node of the "Automatisation" branch behind each switch ---

  /** Level of the node behind one automation — 0 means unbought, and the UI hides its switch. */
  const automationLevelOf = (key: AutomationKey) => nodeLevelOf("automation", AUTOMATION_POSITIONS[key]);
  /** The player's switch alone, ignoring whether the node is bought — what the toggle renders. */
  const automationEnabled = (key: AutomationKey) => !automationOff()[key];
  /** Bought *and* switched on: the single condition every automation below is gated behind. */
  const automationRuns = (key: AutomationKey) => automationLevelOf(key) > 0 && automationEnabled(key);
  function setAutomationEnabled(key: AutomationKey, on: boolean) {
    setAutomationOff((off) => ({ ...off, [key]: !on }));
  }
  const autoAdvanceDelay = () => autoAdvanceDelayMs(automationLevelOf("advance"));
  const autoAbilityInterval = () => autoAbilityIntervalMs(automationLevelOf("ability"));
  const autoRematchDelay = () => autoRematchDelayMs(automationLevelOf("rematch"));
  /** How many characters the intendance may look after right now — one slot per level of its node. */
  const autoRankCapacity = () => autoRankSlots(automationLevelOf("rank"));

  const effectiveXpGrowth = createMemo(() => {
    const level = nodeLevelOf("xp", 3);
    return level > 0 ? Math.max(MIN_XP_GROWTH, XP_GROWTH - XP_GROWTH_REDUCTION * level) : XP_GROWTH;
  });

  /** Synergy malus softened by "DPS Équipe" node 3's level — see softenedSynergyConfig. */
  const activeSynergyConfig = createMemo<SynergyConfig>(() => {
    const config = softenedSynergyConfig(defaultSynergyConfig, nodeLevelOf("teamDps", 3));
    return crossoverActive() ? crossoverSynergyConfig(config) : config;
  });

  /** Only a two-world team earns crystals, so the panel can say why the drip stopped. */
  const teamIsMixed = () => isMixedTeam(ownedCharacters());

  /** Spends crystals for one crossover window; refuses while one is already up. */
  function activateCrossover(): boolean {
    if (crossoverActive() || crossoverCrystals() < CROSSOVER_COST) return false;
    setCrossoverCrystals((c) => c - CROSSOVER_COST);
    setCrossoverUntil(Date.now() + CROSSOVER_DURATION_MS);
    bumpAchievement("crossoversUsed");
    return true;
  }

  const activeArc = createMemo<Arc | null>(() => arcOf(activeArcId()));

  /**
   * The story's power ramp, read off the cast once (the data never changes at runtime), and how far
   * up it this run has climbed. Feeds `catchUpGrowth`, which is what keeps an early recruit from
   * falling millions of dps behind the ramp baked into later worlds' `baseDps` — see growth.ts.
   */
  const arcPower = arcPowerTable(data.characters);
  const reachedPower = createMemo(() => reachedArcPower(arcPower, [activeArcId(), ...clearedArcIds()]));
  const catchUpOf = (character: Character) => catchUpGrowth(arcPower, character, reachedPower());

  const unlockedAnimes = createMemo(() => data.animes.filter((a) => prestige().unlockedAnimeIds.includes(a.id)));

  const ownedCharacters = createMemo(() => {
    // A Set, not `ownedCharacterIds().includes`: that was a walk of the id list per character, i.e.
    // the whole cast times the roster, on a memo the entire UI hangs off.
    const ids = new Set(ownedCharacterIds());
    return data.characters.filter((c) => ids.has(c.id));
  });

  /** True once this character has grown into their evolution — permanent for the rest of the run. */
  const isEvolved = (character: Character) => evolvedCharacterIds().includes(character.id);

  const xpOf = (characterId: string) => characterXp()[characterId] ?? 0;

  /** Levels are read off accumulated xp rather than stored, so the two can never drift apart. */
  const levelOf = (characterId: string) => levelFromXp(xpOf(characterId), effectiveXpGrowth());

  const progressOf = (characterId: string) => xpProgress(xpOf(characterId), effectiveXpGrowth());

  /** Items found this run; wiped by prestige. Forge ranks survive separately. Commons stack. */
  const foundItems = createMemo(() => data.items.filter((i) => (itemCounts()[i.id] ?? 0) > 0));

  const countOf = (itemId: string) => itemCounts()[itemId] ?? 0;
  const uniqueFragmentsOf = (itemId: string) => uniqueFragments()[itemId] ?? 0;
  const uniqueUpgradeLevelOf = (itemId: string) => uniqueUpgradeRanks()[itemId] ?? 0;
  const uniqueUpgradeMultiplierOf = (itemId: string) => UNIQUE_FORGE_MULTIPLIERS[uniqueUpgradeLevelOf(itemId)] ?? 0;
  const uniqueUpgradeCostOf = (itemId: string) => UNIQUE_FORGE_FRAGMENT_COSTS[uniqueUpgradeLevelOf(itemId) + 1] ?? null;
  const forgeableUniques = createMemo(() => data.items.filter((item) => item.kind === "unique" && countOf(item.id) > 0));

  function upgradeUnique(itemId: string): boolean {
    const cost = uniqueUpgradeCostOf(itemId);
    if (cost === null || uniqueFragmentsOf(itemId) < cost) return false;
    setUniqueFragments((fragments) => ({ ...fragments, [itemId]: fragments[itemId] - cost }));
    setUniqueUpgradeRanks((ranks) => ({ ...ranks, [itemId]: uniqueUpgradeLevelOf(itemId) + 1 }));
    return true;
  }

  /** The unique item currently equipped by a character, if any. */
  function equippedItemOf(character: Character): Item | null {
    const itemId = characterEquipment()[character.id];
    if (!itemId) return null;
    const item = itemOf(itemId);
    return item && item.kind === "unique" ? item : null;
  }

  /** The character currently wearing this unique, if any — uniques are single-copy. */
  function wearerOf(itemId: string): Character | null {
    const characterId = Object.keys(characterEquipment()).find((id) => characterEquipment()[id] === itemId);
    return characterOf(characterId);
  }

  /** Whether this item can be equipped on this character (ownership and restriction checks). */
  function canEquipItem(character: Character, itemId: string): boolean {
    const item = itemOf(itemId);
    if (!item || item.kind !== "unique") return false;
    if ((itemCounts()[itemId] ?? 0) <= 0) return false;
    const restriction = item.equippableBy;
    if (!restriction) return true;
    if (restriction.characterIds && !restriction.characterIds.includes(character.id)) return false;
    if (restriction.animeIds && !restriction.animeIds.includes(character.animeId)) return false;
    // Any one of the listed tags is enough, like characterIds and animeIds above — the Tenseigan is
    // "Hyûga or Ôtsutsuki", and no character carries both.
    if (restriction.tags && !restriction.tags.some((tag) => (character.tags ?? []).includes(tag))) return false;
    return true;
  }

  /** Equip a unique item on a character, returning true on success. */
  function equipItem(characterId: string, itemId: string): boolean {
    const character = characterOf(characterId);
    const item = itemOf(itemId);
    if (!character || !item || item.kind !== "unique") return false;
    if (!canEquipItem(character, itemId)) return false;
    // Only an item coming off the shelf counts: moving one between characters isn't a new equip.
    // The second clause is what closes the loop: `unequipItem` clears the mapping, so without it
    // un-equipping and re-equipping the same item bumps the ladder again, and a few hundred toggles
    // of one `<select>` buy every tier — a permanent teamDps bonus that even survives prestige. The
    // ladder can never count more uniques than the player actually owns.
    const uniquesOwned = data.items.filter((i) => i.kind === "unique" && (itemCounts()[i.id] ?? 0) > 0).length;
    const alreadyWorn = Object.values(characterEquipment()).includes(itemId);
    if (!alreadyWorn && (achievementCounts().uniquesEquipped ?? 0) < uniquesOwned) {
      bumpAchievement("uniquesEquipped");
    }
    // Unequip the item from any other character first (uniques are single-copy).
    setCharacterEquipment((map) => {
      const next: Record<string, string> = {};
      for (const [cid, iid] of Object.entries(map)) {
        if (iid !== itemId) next[cid] = iid;
      }
      next[characterId] = itemId;
      return next;
    });
    return true;
  }

  /** Remove any equipped item from a character. */
  function unequipItem(characterId: string): boolean {
    if (!characterEquipment()[characterId]) return false;
    setCharacterEquipment((map) => {
      const next = { ...map };
      delete next[characterId];
      return next;
    });
    return true;
  }

  /** Bumps one achievement ladder; the tier(s) it crosses start contributing on the next `allModifiers` read. */
  function bumpAchievement(categoryId: string, amount = 1) {
    setAchievementCounts((counts) => ({ ...counts, [categoryId]: (counts[categoryId] ?? 0) + amount }));
  }

  /**
   * Everything the team permanently contributes **as if `arc` were the arc being fought** — the
   * characters' own damage, their passives, evolution bonuses and equipped uniques, all scaled by
   * that arc's synergy, plus the achievements and the prestige tree. No running buff: those are
   * timed, and the only caller that wants them is `allModifiers`, which adds them itself.
   *
   * Split out of `allModifiers` because `bossOutlookOf` needs the same sum against an arc that
   * isn't the active one, and rebuilding it by hand there left most of a grown team's dps out.
   * A function declaration, so the `allModifiers` memo below can hoist it.
   */
  function permanentModifiersFor(arc: Arc | null): ActiveModifier[] {
    const config = activeSynergyConfig();
    const equipment = characterEquipment();
    const equipmentOf = (c: Character) => {
      const itemId = equipment[c.id];
      const item = itemOf(itemId);
      return item && item.kind === "unique"
        ? [{ ...item, effects: item.effects?.map((effect) => scaledUniqueEffect(effect, uniqueUpgradeLevelOf(item.id))) }]
        : [];
    };
    const fromCharacters = ownedCharacters().flatMap((c) =>
      characterContributions(
        c,
        arc,
        config,
        levelOf(c.id),
        passiveRankOf(c),
        isEvolved(c),
        equipmentOf(c),
        duplicatesOf(c.id),
        catchUpOf(c)
      )
    );
    return [
      ...fromCharacters,
      ...achievementContributions(achievementCounts()),
      ...prestigeTreeContributions(prestigeTreeRanks()),
      ...challengeContributions(completedChallengeIds()),
    ];
  }

  /**
   * Who is currently abroad: the active arc belongs to no world they call home. It is the same
   * `isHomeArc` test that already shuts their passive off, and it is what puts their ability out of
   * reach too — a story ability doesn't travel. Empty between arcs, when there is no world to be
   * foreign to.
   */
  const awayCharacterIds = createMemo<Set<string>>(() => {
    const arc = activeArc();
    if (!arc) return new Set<string>();
    return new Set(ownedCharacters().filter((c) => !isHomeArc(c, arc, isEvolved(c))).map((c) => c.id));
  });

  /** Every ability granted by the roster, before the current anime or challenge filters it. */
  const ownedAbilities = createMemo(() =>
    getUnlockedAbilities(ownedCharacterIds(), data.characters, evolvedCharacterIds())
  );

  /**
   * How many abilities are asleep because their character is abroad. The bar filters them out
   * entirely, so without this the roster would just quietly shrink on arrival in a new world and
   * the player would have no way to tell a travelled ability from one never unlocked.
   */
  const sleepingAbilities = createMemo(() => {
    const away = awayCharacterIds();
    return ownedAbilities().filter((unlocked) => away.has(unlocked.sourceId));
  });
  const sleepingAbilityCount = createMemo(() => sleepingAbilities().length);

  /**
   * Everything the team permanently contributes in the arc being fought — `permanentModifiersFor`
   * of the *active* arc, kept as a memo of its own.
   *
   * It is the expensive half of `allModifiers` (the whole roster back through
   * `characterContributions`, each one deriving a level off its xp total) and the half that changes
   * least: a recruit, a level, a rank, an equip. `bossOutlookOf` still calls the function directly,
   * because the arc it asks about is precisely not this one.
   */
  const permanentModifiers = createMemo<ActiveModifier[]>(() => permanentModifiersFor(activeArc()));

  /**
   * The permanent contributions plus the buffs currently running.
   *
   * Deliberately **not** a function of `now()`. An expired buff left in this list changes nothing:
   * `computeEffectiveStat` skips a modifier whose `expiresAt` has passed against the clock its
   * caller hands it, and the "bare" half of the mastery cap drops every timed modifier outright —
   * so expiry is already applied where the arithmetic happens, at full precision. Cutting the list
   * here as well only meant `modifiersByScope` and `teamWideScaling` were rebuilt five times a
   * second forever, and with them every roster row that reads them. The tick drops expired buffs
   * from the signal itself, which keeps the groups from carrying yesterday's abilities around.
   */
  const allModifiers = createMemo<ActiveModifier[]>(() => {
    const away = awayCharacterIds();
    return [
      ...permanentModifiers(),
      // A buff whose character has left their world stops applying the moment they arrive, exactly
      // like their passive. Otherwise "a capacity doesn't travel" would be a rule you walk around:
      // fire everything at home, then step into the next world with the buffs still up.
      ...temporaryModifiers().filter((m) => m.scope === undefined || !away.has(m.scope)),
    ];
  });

  /**
   * The unscoped modifiers, and the subset of them that scales every scoped group — achievements,
   * the prestige tree, challenge rewards, evolution bonuses. Both are what `foldScopedStat` wants
   * handed to it: `characterStatOf` needs exactly these once per roster row, and re-deriving them
   * per character would walk the whole modifier list every time.
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

  /** What one narrator click is worth before any modifier: just the allies standing at their side. */
  const narratorBase = createMemo(() => narratorClickPower(ownedCharacterIds().length));

  /**
   * The arc a character is met in — the one whose common item feeds their passive.
   * Declared as functions, not consts: `allModifiers` is a memo created above and Solid runs it
   * straight away, so anything it reads must already be hoisted.
   */
  function originArcOf(character: Character): Arc | null {
    return originArcIndex.get(character.id) ?? null;
  }

  /** The common item that ranks up this character's passive, i.e. the one their home arc drops. */
  function passiveItemOf(character: Character): Item | null {
    const arc = originArcOf(character);
    return itemOf(arc?.mobs.find((m) => m.itemId)?.itemId);
  }

  function passiveCopiesOf(character: Character): number {
    const item = passiveItemOf(character);
    return item ? countOf(item.id) : 0;
  }

  /** The common item an arc drops — what the "Objets" tree's pity timer and ghost loot hand out. */
  function arcCommonItem(arc: Arc): Item | null {
    return itemOf(arc.mobs.find((m) => m.itemId)?.itemId);
  }

  /** Repeatable supplies for every accessible arc, priced against what its farm mobs actually pay. */
  function supplyOffers(): ShopOffer[] {
    return playableArcs().flatMap((arc) => {
      const item = arcCommonItem(arc);
      const farm = item ? arc.mobs.filter((enemy) => enemy.itemId === item.id) : [];
      if (!item || farm.length === 0) return [];
      const pricePerCopy =
        (farm.reduce((sum, enemy) => sum + enemyReward(enemy, difficultyOf(arc.animeId)), 0) / farm.length) *
        CURRENCY_REWARD_MULTIPLIER *
        SUPPLY_KILLS_PER_COPY;
      return [1, 5, 25].map((amount) => ({
        id: `shop-supply-${arc.id}-${amount}`,
        kind: "item" as const,
        targetId: item.id,
        amount,
        arcId: arc.id,
        cost: Math.ceil(pricePerCopy * amount),
      }));
    });
  }

  const availableShopOffers = () => [...(data.shop ?? []), ...supplyOffers()];

  /**
   * How far a buff may lift its own character right now: `SCOPED_BUFF_CAP_FLOOR` on the first arc,
   * the full `SCOPED_BUFF_CAP` once the run stands on the last one. Read off cleared arcs, so it
   * climbs with the story and `prestigeReset` walks it back to the floor with everything else.
   *
   * Denominator is `arcs.length - 1`, not `arcs.length`: the ceiling is meant to be reached *on*
   * the final arc, not one clear after the game has ended.
   */
  const buffCap = createMemo(() =>
    scopedBuffCap(data.arcs.length > 1 ? clearedArcIds().length / (data.arcs.length - 1) : 1)
  );

  /** Damage of one narrator click. */
  const clickPower = createMemo(() =>
    foldScopedStat(narratorBase(), "clickPower", globalModifiers(), teamWideScaling(), modifiersByScope().values(), now(), buffCap())
  );
  /** Damage the team deals on its own, per second. */
  const teamDps = createMemo(() =>
    foldScopedStat(0, "teamDps", globalModifiers(), teamWideScaling(), modifiersByScope().values(), now(), buffCap())
  );

  const unlockedAbilities = createMemo(() =>
    // "Le Silence des héros" takes every ability away at the source: nothing to activate and
    // nothing for the "Réflexe" automation to fire. Being abroad takes them away the same way, one
    // character at a time — see `getUnlockedAbilities`.
    challengeRules().noAbilities
      ? []
      : getUnlockedAbilities(ownedCharacterIds(), data.characters, evolvedCharacterIds(), activeArc())
  );

  /** Currency threshold worth one prestige point on reset — kept at the default scale. */
  const prestigeScale = createMemo(() => PRESTIGE_SCALE);

  /** Share of the game's arcs cleared this run — the completion the prestige gain scales with. */
  const runCompletion = createMemo(() => (data.arcs.length === 0 ? 0 : clearedArcIds().length / data.arcs.length));

  /** Prestige points the player would bank by resetting right now. */
  const pendingPrestigeGain = createMemo(() =>
    calculatePrestigeGain(lifetimeEarned(), prestigeScale(), runCompletion())
  );

  // --- world progression ---

  const tierOf = (animeId: string) => animeTier(prestige().unlockedAnimeIds, animeId);

  const arcsOf = (animeId: string) => arcsOfAnime(data.arcs, animeId);

  /** How much harder this anime is than a first world, frozen at the time it was entered. */
  const difficultyOf = (animeId: string) => difficultyMultiplier(tierOf(animeId));

  const arcCleared = (arc: Arc) => clearedArcIds().includes(arc.id);

  const arcOpen = (arc: Arc) => isArcUnlocked(data.arcs, arc, clearedArcIds());

  const killsIn = (arc: Arc) => arcKills()[arc.id] ?? 0;

  const animeCleared = (animeId: string) => isAnimeComplete(data.arcs, animeId, clearedArcIds());

  const clearedAnimes = createMemo(() => data.animes.filter((a) => animeCleared(a.id)));

  /** Difficulty the next anime entered will be played at. */
  const nextDifficulty = createMemo(() => difficultyMultiplier(prestige().unlockedAnimeIds.length));

  /** True when nothing is left in progress, so the player may head to a new anime. */
  const canTravel = createMemo(() => canEnterNewAnime(prestige().unlockedAnimeIds, data.arcs, clearedArcIds()));

  /**
   * Every arc the player can actually fight in right now, in travel order: animes in the order they
   * were entered, arcs in their own order. Drives the prev/next arc stepper.
   */
  const playableArcs = createMemo<Arc[]>(() =>
    prestige()
      .unlockedAnimeIds.flatMap((animeId) => arcsOf(animeId))
      .filter((arc) => arcOpen(arc))
  );

  function stepArc(direction: 1 | -1) {
    const arcs = playableArcs();
    const index = arcs.findIndex((a) => a.id === activeArcId());
    const target = arcs[index + direction];
    return target ? setActiveArc(target.id) : false;
  }

  /** Characters of the active arc still waiting to be beaten. */
  const arcRecruits = createMemo(() => {
    const arc = activeArc();
    if (!arc) return [];
    return pendingRecruits(arc, ownedCharacterIds())
      .map((id) => characterOf(id))
      .filter((c): c is Character => !!c);
  });

  // --- combat ---

  const currentDifficulty = () => {
    const arc = activeArc();
    return arc ? difficultyOf(arc.animeId) : 1;
  };

  /** True once the player has timed out against this arc's boss and not yet asked for a rematch. */
  const hasRetreatedFromBoss = (arc: Arc) => bossRetreatArcIds().includes(arc.id);

  /**
   * Grows any owned character whose evolution's world is the one now active, permanently — called
   * on every recruit and every arc switch, the only two ways this condition can newly become true.
   */
  function maybeEvolve() {
    const arc = activeArc();
    if (!arc) return;
    const newlyEvolved = ownedCharacters()
      .filter((c) => c.evolution?.animeId === arc.animeId && !isEvolved(c))
      .map((c) => c.id);
    if (newlyEvolved.length > 0) {
      setEvolvedCharacterIds((ids) => [...ids, ...newlyEvolved]);
      bumpAchievement("evolutionsUnlocked", newlyEvolved.length);
    }
  }

  /** Puts the next enemy of the active arc in front of the player, at full hp. */
  function spawnNext() {
    maybeEvolve();
    const arc = activeArc();
    if (!arc) {
      setEnemy(null);
      return;
    }
    const next = nextEnemy(arc, killsIn(arc), ownedCharacterIds(), arcCleared(arc), hasRetreatedFromBoss(arc));
    const hp = enemyHp(next, currentDifficulty());
    setEnemy(next);
    setEnemyMaxHp(hp);
    setEnemyHpLeft(hp);
    const isBoss = next.id === arc.boss.id;
    const timerLevel = nodeLevelOf("teamDps", 5);
    const timerMs =
      isBoss && next.timerMs && timerLevel > 0 ? next.timerMs * (1 + BOSS_TIMER_BOOST * timerLevel) : next.timerMs;
    setTimerDeadline(timerMs ? Date.now() + timerMs : null);
    setTimerTotal(timerMs ?? null);
  }

  function defeat(target: Enemy) {
    const arc = activeArc();
    if (!arc) return;

    const currencyLevel = nodeLevelOf("destin", 1);
    const baseReward = enemyReward(target, currentDifficulty());
    const currencyReward =
      baseReward * CURRENCY_REWARD_MULTIPLIER * (1 + CURRENCY_GAIN_PERCENT * currencyLevel);
    setCurrency((c) => c + currencyReward);
    setLifetimeEarned((l) => l + currencyReward);
    // Pack points are per world and flat: one per fight won, wherever it was won.
    setWorldPoints((points) => ({ ...points, [arc.animeId]: (points[arc.animeId] ?? 0) + POINTS_PER_KILL }));

    // "En petit comité": a full team simply doesn't take the recruit. The encounter stays in the
    // arc's pool as an ordinary fight, which is exactly what "reste sur le carreau" means.
    const isNewRecruit =
      !!target.characterId &&
      !ownedCharacterIds().includes(target.characterId) &&
      canRecruitUnder(challengeRules(), ownedCharacterIds().length);
    if (isNewRecruit) {
      setOwnedCharacterIds((ids) => [...ids, target.characterId!]);
      bumpAchievement("charactersRecruited");
      pushNotice("recruit", `${target.name} rejoint l'équipe`);
    }

    const isBoss = target.id === arc.boss.id;
    // Crossover crystals: only a team spanning two worlds earns them — bosses always pay, mobs roll.
    if (teamIsMixed()) {
      const crystals = isBoss ? CROSSOVER_BOSS_REWARD : Math.random() < CROSSOVER_MOB_CHANCE ? 1 : 0;
      if (crystals > 0) setCrossoverCrystals((c) => c + crystals);
    }
    const bossXpLevel = nodeLevelOf("xp", 5);
    // XP follows the enemy's data reward, not the separately balanced currency payout.
    const xpAmount = baseReward * XP_PER_KILL_REWARD * (isBoss && bossXpLevel > 0 ? 1 + BOSS_XP_BOOST * bossXpLevel : 1);
    grantXp(xpAmount);
    const recruitBonusLevel = nodeLevelOf("xp", 4);
    if (isNewRecruit && recruitBonusLevel > 0) {
      grantXpTo(target.characterId!, RECRUIT_XP_BONUS * recruitBonusLevel);
    }

    // "Destin" node 2: a small chance per kill to gain 1 prestige point outright.
    const luckyLevel = nodeLevelOf("destin", 2);
    if (luckyLevel > 0 && Math.random() < scaledChance(PRESTIGE_PER_KILL_CHANCE, luckyLevel)) {
      setPrestige((p) => ({ ...p, prestigePoints: p.prestigePoints + 1 }));
    }

    maybeDropItem(target, arc);

    if (isBoss) {
      if (!clearedArcIds().includes(arc.id)) {
        setClearedArcIds((ids) => [...ids, arc.id]);
        bumpAchievement("arcsCleared");
        pushNotice("arc", `${arc.name} terminé`);
        armAutoAdvance();
        maybeCompleteChallenge();
      }
      // Cleared arcs count ordinary fights since the last boss, so the same 50-fight cycle can
      // repeat without another save field or a one-shot rematch flag.
      setArcKills((k) => ({ ...k, [arc.id]: 0 }));
      setBossRetreatArcIds((ids) => ids.filter((id) => id !== arc.id));
      bumpAchievement("bossesKilled");
    } else {
      setArcKills((k) => ({ ...k, [arc.id]: (k[arc.id] ?? 0) + 1 }));
      bumpAchievement("mobsKilled");
    }

    spawnNext();
  }

  /** Grants one copy of an item; counted on pickup, not derived from the stack still held. */
  function grantItem(item: Item) {
    setItemCounts((counts) => ({ ...counts, [item.id]: (counts[item.id] ?? 0) + 1 }));
    if (item.kind === "unique") setUniqueUpgradeRanks((ranks) => ({ ...ranks, [item.id]: ranks[item.id] ?? 1 }));
    if (item.kind === "common") bumpAchievement("commonItemsCollected");
    pushNotice("item", `${item.name} +1`);
  }

  function grantUniqueFragment(item: Item) {
    setUniqueFragments((fragments) => ({ ...fragments, [item.id]: (fragments[item.id] ?? 0) + 1 }));
    pushNotice("item", `Fragment de ${item.name} +1`);
  }

  /**
   * Uniques are one copy only; commons stack, so farming a zone keeps paying into the click. Beyond
   * the base roll, the "Objets" tree can boost the drop chance (node 1), roll a bonus copy (node 3),
   * force a drop after a dry streak (node 4, tracked in `killsSinceDrop`) and let an item-less enemy
   * still hand over the arc's common at low odds (node 5).
   */
  function maybeDropItem(target: Enemy, arc: Arc) {
    // "À mains nues": no drop of any kind, which also dries up passive ranks and uniques.
    if (challengeRules().noItems) return;
    const dropChanceLevel = nodeLevelOf("items", 1);
    const doubleDropLevel = nodeLevelOf("items", 3);
    const auspiceLevel = nodeLevelOf("destin", 3);
    const pityLevel = nodeLevelOf("items", 4);
    const ghostLootLevel = nodeLevelOf("items", 5);
    let dropped = false;

    if (target.itemId) {
      const baseChance = target.dropChance ?? 1;
      const boostedChance =
        dropChanceLevel > 0 ? Math.min(1, baseChance * (1 + DROP_CHANCE_BOOST * dropChanceLevel)) : baseChance;
      const item = itemOf(target.itemId);
      const compatibleUpgrades =
        item?.kind === "common"
          ? ownedCharacters()
              .filter((character) => character.passive && passiveItemOf(character)?.id === item.id)
              .map(passiveUpgradeOf)
          : [];
      const dropChance = item
        ? firstPassiveDropChance(boostedChance, {
            hasClearedArc: clearedArcIds().length > 0,
            passiveRanksBought:
              achievementCounts().passiveRanksBought ??
              Object.values(passiveRanks()).reduce((sum, rank) => sum + rank, 0),
            copies: countOf(item.id),
            copiesNeeded: Math.min(...compatibleUpgrades.map((upgrade) => upgrade.cost)),
            hasCompatiblePassive: compatibleUpgrades.length > 0,
          })
        : boostedChance;
      if (rollsDrop({ ...target, dropChance }, Math.random())) {
        if (item) {
          if (item.kind === "unique" && countOf(item.id) > 0) grantUniqueFragment(item);
          else grantItem(item);
          dropped = true;
          if (doubleDropLevel > 0 && item.kind === "common" && Math.random() < scaledChance(DOUBLE_DROP_CHANCE, doubleDropLevel)) {
            grantItem(item);
          }
          if (auspiceLevel > 0 && item.kind === "common" && Math.random() < scaledChance(AUSPICE_DOUBLE_DROP_CHANCE, auspiceLevel)) {
            grantItem(item);
          }
        }
      }
    }

    if (dropped) {
      setKillsSinceDrop((k) => ({ ...k, [arc.id]: 0 }));
      return;
    }

    const streak = (killsSinceDrop()[arc.id] ?? 0) + 1;
    setKillsSinceDrop((k) => ({ ...k, [arc.id]: streak }));

    if (pityLevel > 0) {
      const threshold = PITY_KILLS_THRESHOLD - PITY_REDUCTION_PER_LEVEL * (pityLevel - 1);
      if (streak >= threshold) {
        const common = arcCommonItem(arc);
        if (common) {
          grantItem(common);
          setKillsSinceDrop((k) => ({ ...k, [arc.id]: 0 }));
          return;
        }
      }
    }

    if (ghostLootLevel > 0 && !target.itemId && Math.random() < scaledChance(GHOST_LOOT_CHANCE, ghostLootLevel)) {
      const common = arcCommonItem(arc);
      if (common) grantItem(common);
    }
  }

  /**
   * Overkill carries over to the enemy that replaces the one just felled: without it a tick could
   * only ever land one kill, capping progress at 5 fights/second however high the dps — which makes
   * farming an early arc's common item for a passive rank absurdly slow late in a run.
   * `MAX_KILLS_PER_HIT` is a safety net, not balance: it stops a data mistake (a 0-hp enemy, an arc
   * that always respawns) from locking the tick in an endless loop.
   *
   * What *is* balance is `MAX_KILLS_PER_SECOND`, spent from `killBudget` here: past it the surplus
   * overkill is simply discarded rather than felling more enemies.
   *
   * The budget is spent **strictly**, and that is load-bearing. A guaranteed kill per call used to
   * sit in `allowance`, on the theory that a fight could otherwise stall at 0 hp waiting for the
   * refill — but the tick, the autoclicker and *every single manual click* are separate calls, so
   * each of them collected that free kill and the real rate was `MAX_KILLS_PER_SECOND` plus the
   * click rate: 20 kills/s measured at 20 clicks/s, four times the cap, with every per-kill reward
   * (drops, currency, xp, pack points) riding along. It also drove `killBudget` unboundedly
   * negative, since nothing floored the debt, so after a few minutes of clicking the overkill burst
   * this function exists for never fired again. Spending no more than the budget holds fixes both:
   * the balance is honest, and the budget can no longer go below zero.
   *
   * The stall it was guarding against is handled below instead, and by construction rather than by
   * a free kill: what the budget caps is *kills*, not damage, so leftover damage still chips the
   * enemy in front of us. It can leave one on nothing for a fraction of a second — the budget
   * refills a kill every tick — and the next call fells it.
   */
  function dealDamage(amount: number, source: DamageSource) {
    if (paused() || !enemy() || amount <= 0) return 0;
    let remaining = amount;
    const firstTarget = enemy();
    // The number the pop-up shows: the *swing's* power against the enemy on screen, deliberately not
    // the hp actually removed. A crit that one-shots a near-dead mob must still read as the full,
    // enlarged crit (`design.md` §12) — so this stays `amount × the on-screen trait`, whatever the
    // carry-over then fells behind it. Don't "fix" it to sum the hp taken off each target.
    const reportedDamage = firstTarget ? amount * damageMultiplierAgainst(firstTarget, source) : amount;
    const allowance = Math.min(MAX_KILLS_PER_HIT, Math.floor(killBudget()));
    let spent = 0;
    while (spent < allowance) {
      const target = enemy();
      if (!target || remaining <= 0) break;
      const multiplier = damageMultiplierAgainst(target, source);
      const effective = remaining * multiplier;
      const left = enemyHpLeft() - effective;
      if (left > 0) {
        setEnemyHpLeft(left);
        remaining = 0;
        break;
      }
      // Carry the unused *raw* damage into the replacement, whose trait may use another multiplier.
      remaining = multiplier > 0 ? -left / multiplier : 0;
      spent++;
      defeat(target);
    }
    // Damage still in hand once the budget is out — it lands, it just can't fell anything. This also
    // covers a fractional budget (`allowance` floored to 0): only *kills* are budget-gated, never the
    // hp a hit removes, so a healthy enemy keeps taking damage while the budget refills. The one
    // visible tell is an enemy sitting at 0 hp for up to a tick before the next kill lands — the cap
    // working as intended (`MAX_KILLS_PER_SECOND`), not a stuck fight.
    if (remaining > 0 && enemy()) {
      setEnemyHpLeft(Math.max(0, enemyHpLeft() - remaining * damageMultiplierAgainst(enemy()!, source)));
    }
    if (spent > 0) setKillBudget((budget) => budget - spent);
    return reportedDamage;
  }

  /**
   * The narrator's click. Beyond raw damage, the "Clic du Narrateur" tree can crit (node 3), shave
   * time off every unlocked ability's cooldown (node 4), and has a small chance to fire one of them
   * for free (node 5).
   *
   * Batched, for the reason spelled out on `tick`: one click writes a dozen signals, and outside a
   * batch each one costs the subscribers a full recompute of their own.
   */
  function click() {
    return batch(resolveClick);
  }

  function resolveClick() {
    // "Le Narrateur muet": the click stops dealing damage — and stops counting as one, or the
    // achievement ladder would fill up on clicks that did nothing. It keeps landing while the team
    // is empty, which is the one thing that makes the challenge startable at all: see `clickIsMuted`.
    if (clickIsMuted(challengeRules(), ownedCharacterIds().length)) return { damage: 0, crit: false };
    bumpAchievement("clicks");
    const critLevel = nodeLevelOf("narratorClick", 3);
    const crit = critLevel > 0 && Math.random() < scaledChance(CRIT_CHANCE, critLevel);
    const dealt = dealDamage(crit ? clickPower() * CRIT_MULTIPLIER : clickPower(), "click");

    const cooldownLevel = nodeLevelOf("narratorClick", 4);
    if (cooldownLevel > 0) {
      const reduction = CLICK_COOLDOWN_REDUCTION_MS * cooldownLevel;
      const nowMs = Date.now();
      // Only abilities still on cooldown are shaved: pushing an already-ready timestamp further
      // into the past changes nothing and lets it drift without bound.
      setAbilityLastUsed((used) => {
        const next = { ...used };
        for (const unlocked of unlockedAbilities()) {
          const at = next[unlocked.ability.id];
          if (at !== undefined && nowMs - at < cooldownOf(unlocked.ability)) {
            next[unlocked.ability.id] = at - reduction;
          }
        }
        return next;
      });
    }

    const freeTriggerLevel = nodeLevelOf("narratorClick", 5);
    if (freeTriggerLevel > 0 && Math.random() < scaledChance(FREE_ABILITY_TRIGGER_CHANCE, freeTriggerLevel)) {
      // Buffs are scoped and stack freely now, so the only wasted pick is one already running:
      // re-firing it would just refresh the buff the player already has.
      const running = new Set(pruneExpired(temporaryModifiers(), Date.now()).map((m) => m.sourceId));
      const candidates = unlockedAbilities().filter((u) => !running.has(u.ability.id));
      if (candidates.length > 0) {
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        triggerAbilityEffects(pick);
      }
    }

    // The crit is reported, not just rolled: without it the stage has no way to tell the player a
    // click landed for CRIT_MULTIPLIER times its usual damage.
    return { damage: dealt, crit };
  }

  /**
   * A boss that outlasts its timer doesn't just respawn at full hp: the fight drops back to farming
   * the arc's regular mobs, so a player who isn't strong enough yet is never stuck repeating a boss
   * they can't beat. They can ask for a rematch whenever they want via `challengeBoss`.
   */
  function checkTimer(nowMs: number) {
    const deadline = timerDeadline();
    if (deadline === null || nowMs < deadline) return;
    const arc = activeArc();
    const target = enemy();
    if (arc && target && target.id === arc.boss.id) {
      setBossRetreatArcIds((ids) => (ids.includes(arc.id) ? ids : [...ids, arc.id]));
      armAutoRematch();
    }
    setLastTimeout(nowMs);
    spawnNext();
  }

  /** Time the team needs to fell the enemy in front of it right now — `Infinity` at 0 dps. */
  const timeToKill = createMemo(() => {
    const target = enemy();
    const dps = target ? teamDps() * damageMultiplierAgainst(target, "teamDps") : teamDps();
    return timeToKillMs(enemyHpLeft(), dps);
  });

  /**
   * The kill cadence of the farm on screen, and what `MAX_KILLS_PER_SECOND` is throwing away — or
   * `null` where the cap has nothing to bite on and the readout would only mislead: a boss is a
   * single enemy, so its fight is a time-to-kill, never a rate.
   *
   * Measured on `teamDps` alone, to stay the same number the "DPS équipe" tile prints. Clicks fell
   * enemies too and spend the very same budget, so the real cadence is a little above this one
   * while the player is clicking — but a rate that moved with how fast a hand is moving would say
   * nothing about the arc, which is the whole question here.
   */
  const killRate = createMemo(() => {
    const arc = activeArc();
    const target = enemy();
    if (!arc || !target || target.id === arc.boss.id) return null;
    return killRateOf(enemyMaxHp(), teamDps(), MAX_KILLS_PER_SECOND);
  });

  /**
   * Whether this arc's boss is beatable yet, and how comfortably. `winnable` compares the team's
   * time-to-kill against the boss's own clock (stretched by "DPS Équipe" node 5, exactly as
   * `spawnNext` stretches it), which is the only thing that can actually stop a run — nothing else
   * in the game can lose a fight. This is what tells the player an arc has become worth entering.
   */
  function bossOutlookOf(arc: Arc) {
    const timerLevel = nodeLevelOf("teamDps", 5);
    const base = arc.boss.timerMs;
    const timerMs = base && timerLevel > 0 ? base * (1 + BOSS_TIMER_BOOST * timerLevel) : base;
    // The boss's hp at that world's frozen difficulty, and the dps the team would deal *there* —
    // not here: synergy makes those two very different numbers once the arc isn't the active one.
    // It goes through the whole modifier pipeline instead of summing the characters' flat damage by
    // hand: passives, evolution bonuses, equipped uniques, achievements and the prestige tree are
    // most of a grown team's dps, and leaving them out had the arc claim it was out of reach long
    // after it wasn't. Running buffs stay out on purpose — an ability lasts seconds, and this
    // answers "come back later?", not "fire now?": the badge must not blink with a cooldown.
    // The `now` argument is 0 because nothing `permanentModifiersFor` returns ever expires; reading
    // the real clock would re-run this for every arc on screen at every tick.
    //
    // `computeScopedStat`, not `computeEffectiveStat`: a scope-blind fold applies every character's
    // own passive percent to the *whole* team's flat damage, so a 40-strong roster came out an
    // order of magnitude above the dps it will actually bring, and every boss was announced
    // winnable. This is the same fold `teamDps` uses, minus the running buffs.
    const dps =
      computeScopedStat(0, "teamDps", permanentModifiersFor(arc), 0, buffCap()) *
      damageMultiplierAgainst(arc.boss, "teamDps");
    const ttkMs = timeToKillMs(enemyHp(arc.boss, difficultyOf(arc.animeId)), dps);
    return { ttkMs, timerMs: timerMs ?? null, winnable: timerMs ? ttkMs <= timerMs : Number.isFinite(ttkMs) };
  }

  /**
   * True when spending crystals right now would actually pay: the player is fighting somewhere at
   * least one team member is at the steep other-anime malus — typically back in an old world to farm
   * its common. The stock otherwise just sits there, since nothing ever suggests using it.
   */
  const crossoverAdvised = createMemo(() => {
    if (crossoverActive() || crossoverCrystals() < CROSSOVER_COST) return false;
    const arc = activeArc();
    if (!arc) return false;
    const config = activeSynergyConfig();
    return ownedCharacters().some(
      (c) => synergyMultiplier(c, arc, config, isEvolved(c)) <= config.otherAnimeMalus
    );
  });

  const timerRemaining = createMemo(() => {
    const deadline = timerDeadline();
    return deadline === null ? null : Math.max(0, deadline - now());
  });

  // --- levelling ---

  /**
   * Every kill trains the whole team equally; levels are uncapped so this never stops paying.
   * Boosted by "XP" node 1's level — a flat percent on every grant, whatever its source.
   */
  function grantXp(amount: number) {
    if (amount <= 0) return;
    const xpGainLevel = nodeLevelOf("xp", 1);
    const boosted = xpGainLevel > 0 ? amount * (1 + XP_GAIN_PERCENT * xpGainLevel) : amount;
    setCharacterXp((xp) => {
      const next = { ...xp };
      for (const id of ownedCharacterIds()) next[id] = (next[id] ?? 0) + boosted;
      return next;
    });
  }

  /** One-off xp grant to a single character — the "XP" tree tier 4 recruit bonus. */
  function grantXpTo(characterId: string, amount: number) {
    if (amount <= 0) return;
    setCharacterXp((xp) => ({ ...xp, [characterId]: (xp[characterId] ?? 0) + amount }));
  }

  /** Rank the passive runs at (0 = still locked), what the next one costs, and the cap. */
  function passiveRankOf(character: Character): number {
    return passiveRanks()[character.id] ?? 0;
  }

  function passiveUpgradeOf(character: Character) {
    const level = nodeLevelOf("items", 2);
    const discount = level > 0 ? scaledDiscount(PASSIVE_RANK_DISCOUNT, level) : 0;
    return passiveUpgrade(passiveRankOf(character), character.rarity, passiveCopiesOf(character), discount);
  }
  const passiveCapOf = (character: Character) => PASSIVE_LEVEL_CAP[character.rarity];

  /**
   * The first character whose passive is affordable *and* never yet ranked this save — the tutorial's
   * payoff. `null` the moment any rank has ever been bought, so it only ever fires once. Lives here
   * rather than in two components: `App` announces it and `RosterPanel` unfolds the team on it, and
   * they must agree on which character that is.
   */
  const firstAffordablePassive = createMemo<Character | null>(() => {
    const ranksBought =
      achievementCounts().passiveRanksBought ??
      ownedCharacters().reduce((sum, character) => sum + passiveRankOf(character), 0);
    if (ranksBought > 0) return null;
    return ownedCharacters().find((c) => c.passive && passiveUpgradeOf(c).affordable) ?? null;
  });

  /**
   * Spends the origin item to buy the next rank of a character's passive. Refuses on a character
   * who isn't in the team: `characterContributions` only ever runs on owned characters, so the
   * copies would be burnt for nothing (the item Codex lists the whole cast, met or not). Refuses
   * the same way on a character with no `passive` at all — a rank on nothing is copies burnt for
   * nothing too, and `passive` is optional (Naruto has an ability and an evolution instead).
   */
  function rankUpPassive(character: Character): boolean {
    if (!character.passive) return false;
    if (!ownedCharacterIds().includes(character.id)) return false;
    const item = passiveItemOf(character);
    const upgrade = passiveUpgradeOf(character);
    if (!item || !upgrade.affordable) return false;
    setItemCounts((counts) => ({ ...counts, [item.id]: (counts[item.id] ?? 0) - upgrade.cost }));
    setPassiveRanks((ranks) => ({ ...ranks, [character.id]: upgrade.rank + 1 }));
    bumpAchievement("passiveRanksBought");
    return true;
  }

  const worldPointsOf = (animeId: string) => worldPoints()[animeId] ?? 0;

  /** Pack copies held of a character. A function declaration, so `allModifiers` can hoist it. */
  function duplicatesOf(characterId: string): number {
    return characterDuplicates()[characterId] ?? 0;
  }

  /**
   * What multiplies a character's printed base damage right now: levels, pack duplicates and the
   * catch-up ramp, stacked exactly as `characterContributions` does it. Lives here rather than in a
   * component so the roster and the Codex can never print two different numbers for the same
   * character.
   */
  function damageGrowthOf(characterId: string): number {
    const character = characterOf(characterId);
    return (
      levelGrowth(levelOf(characterId)) *
      duplicateGrowth(duplicatesOf(characterId)) *
      (character ? catchUpOf(character) : 1)
    );
  }

  /**
   * A character's actual contribution in the active arc, as the roster and Codex show it — the very
   * term `computeScopedStat` adds for them into `teamDps`/`clickPower`, so the column now sums to
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
  function characterStatOf(character: Character, target: "teamDps" | "clickPower"): number {
    const own = modifiersByScope().get(character.id);
    if (!own) return 0;
    // The base term is 0 and the team-wide flats are deliberately left out: this column answers
    // "what does *this* character bring", and the flats belong to the team, not to a row.
    return foldScopedStat(0, target, teamWideScaling(), teamWideScaling(), [own], now(), buffCap());
  }

  /** Recruited members of this world's rarity — future story characters never leak through packs. */
  const packPoolOf = (animeId: string, rarity: Rarity) =>
    packPool(data.characters, animeId, rarity, ownedCharacterIds());

  /**
   * Spends a world's points on one random draw from its cast at that rarity, and banks the copy.
   * Returns the character drawn so the panel can show it, or null when it couldn't be bought.
   */
  function openPack(animeId: string, rarity: Rarity): Character | null {
    const cost = PACK_COST[rarity];
    if (worldPointsOf(animeId) < cost) return null;
    const drawn = drawPack(packPoolOf(animeId, rarity), Math.random());
    if (!drawn) return null;
    setWorldPoints((points) => ({ ...points, [animeId]: points[animeId] - cost }));
    setCharacterDuplicates((copies) => ({ ...copies, [drawn.id]: (copies[drawn.id] ?? 0) + 1 }));
    bumpAchievement("packsOpened");
    return drawn;
  }

  /**
   * Every shop offer with the display state (price/locked/owned/affordable) the panel needs.
   *
   * `cost` is the discounted one — what `buyShopOffer` actually charges. The panel used to print
   * `offer.cost` straight from the data while the purchase went through `discountedShopCost`, so
   * with "Relations" bought the shop announced one price and took another, and `affordable` (which
   * has always counted the discount) could light a button up next to a price the player couldn't
   * meet. One number, computed once, here.
   */
  function shopOffers() {
    const clearedIds = clearedAnimes().map((a) => a.id);
    const shopDiscount = nodeLevelOf("destin", 4) > 0 ? scaledDiscount(SHOP_COST_DISCOUNT, nodeLevelOf("destin", 4)) : 0;
    return availableShopOffers().map((offer) => ({
      offer,
      cost: discountedShopCost(offer, shopDiscount),
      discounted: shopDiscount > 0,
      item: offer.kind === "item" ? itemOf(offer.targetId) ?? undefined : undefined,
      character: offer.kind === "character" ? characterOf(offer.targetId) ?? undefined : undefined,
      arc: arcOf(offer.arcId) ?? undefined,
      owned: offer.kind === "character" && ownedCharacterIds().includes(offer.targetId),
      locked: !shopOfferUnlocked(offer, clearedIds),
      affordable: canBuyShopOffer(offer, currency(), clearedIds, ownedCharacterIds(), shopDiscount),
    }));
  }

  /** Spends the main currency on a shop offer: copies of an item, or a character not owned yet. */
  function buyShopOffer(offerId: string): boolean {
    const offer = availableShopOffers().find((o) => o.id === offerId);
    if (!offer) return false;
    const shopDiscount = nodeLevelOf("destin", 4) > 0 ? scaledDiscount(SHOP_COST_DISCOUNT, nodeLevelOf("destin", 4)) : 0;
    const cost = discountedShopCost(offer, shopDiscount);
    if (!canBuyShopOffer(offer, currency(), clearedAnimes().map((a) => a.id), ownedCharacterIds(), shopDiscount)) return false;

    // The shop is the other way into the roster, and the cap has to hold on it too.
    if (offer.kind === "character" && !canRecruitUnder(challengeRules(), ownedCharacterIds().length)) return false;

    setCurrency((c) => c - cost);
    if (offer.kind === "item") {
      setItemCounts((counts) => ({ ...counts, [offer.targetId]: (counts[offer.targetId] ?? 0) + (offer.amount ?? 1) }));
    } else {
      setOwnedCharacterIds((ids) => [...ids, offer.targetId]);
    }
    return true;
  }

  // --- actions ---

  /** Synergy multiplier a character currently gets from the active arc (1 when no arc is selected). */
  function synergyOf(character: Character): number {
    const arc = activeArc();
    return arc ? synergyMultiplier(character, arc, activeSynergyConfig(), isEvolved(character)) : 1;
  }

  function setActiveArc(arcId: string) {
    const arc = arcOf(arcId);
    if (!arc || !prestige().unlockedAnimeIds.includes(arc.animeId)) return false;
    if (!arcOpen(arc)) return false;
    setActiveArcId(arcId);
    // Both pending automations belonged to the arc being left: a "Relève" armed on the arc just
    // cleared must not yank the player out of the zone they deliberately walked into instead.
    cancelPendingAutomation();
    spawnNext();
    return true;
  }

  /** Drops whatever "Relève" or "Second souffle" had queued — any manual move outranks them. */
  function cancelPendingAutomation() {
    setAutoAdvanceAt(null);
    setAutoRematchAt(null);
  }

  /**
   * Arms "Relève". Called from the kill that *clears* an arc — the one moment it can fire, which is
   * what keeps it off a cleared arc the player came back to farm (`defeat` only calls it on the
   * first clear, and returning here later never re-arms it).
   */
  function armAutoAdvance() {
    if (!automationRuns("advance")) return;
    setAutoAdvanceAt(Date.now() + autoAdvanceDelay());
  }

  /** Arms "Second souffle", from the boss timeout that just sent the team packing. */
  function armAutoRematch() {
    if (!automationRuns("rematch")) return;
    setAutoRematchAt(Date.now() + autoRematchDelay());
  }

  /**
   * Hands a character's passive to the intendance, or takes it back. Refuses a character over
   * capacity rather than accepting one the node would silently never get to — and refuses one whose
   * passive can't be ranked at all (`rankUpPassive`'s own two rules), so a slot is never wasted.
   */
  function toggleAutoRank(characterId: string): boolean {
    if (autoRankCharacterIds().includes(characterId)) {
      setAutoRankCharacterIds((ids) => ids.filter((id) => id !== characterId));
      return true;
    }
    if (autoRankCharacterIds().length >= autoRankCapacity()) return false;
    const character = characterOf(characterId);
    if (!character?.passive || !ownedCharacterIds().includes(characterId)) return false;
    setAutoRankCharacterIds((ids) => [...ids, characterId]);
    return true;
  }

  const isAutoRanked = (characterId: string) => autoRankCharacterIds().includes(characterId);

  /** True once a rematch against this arc's boss is on offer: the player retreated from it before. */
  const bossChallengeable = (arc: Arc) => hasRetreatedFromBoss(arc);

  /** Deliberate rematch against the active arc's boss, whenever the player feels ready for it. */
  function challengeBoss(): boolean {
    const arc = activeArc();
    if (!arc || !bossChallengeable(arc)) return false;
    setBossRetreatArcIds((ids) => ids.filter((id) => id !== arc.id));
    spawnNext();
    return true;
  }

  /** True when this world's own prerequisite is cleared — the universe's reading order. */
  const animeAvailable = (animeId: string) => isAnimeAvailable(data.animes, animeId, data.arcs, clearedArcIds());

  /** The anime that has to be cleared first, when this one is still shut behind it. */
  function animeBlockedBy(animeId: string): Anime | null {
    const required = animeOf(animeId)?.requiresAnimeId;
    if (!required || animeAvailable(animeId)) return null;
    return animeOf(required);
  }

  /** Free move into a new anime: the first pick of the run, or a new world after clearing the last. */
  function travelTo(animeId: string) {
    if (prestige().unlockedAnimeIds.includes(animeId)) return false;
    if (!data.animes.some((a) => a.id === animeId)) return false;
    if (!animeAvailable(animeId)) return false;
    if (!canTravel()) return false;
    setPrestige((p) => ({ ...p, unlockedAnimeIds: [...p.unlockedAnimeIds, animeId] }));
    setActiveArcId(arcsOf(animeId)[0]?.id ?? null);
    cancelPendingAutomation();
    spawnNext();
    return true;
  }

  /** Paid shortcut: enter an anime early, without having finished the current one. */
  function unlockAnime(animeId: string) {
    const anime = animeOf(animeId);
    if (!anime || !animeAvailable(animeId)) return false;
    const cost = anime.unlockCost;
    if (!canUnlockAnime(prestige(), animeId, cost)) return false;
    setPrestige((p) => unlockAnimeState(p, animeId, cost));
    // Same landing as `travelTo`: paying to enter a world puts the player *in* it, rather than
    // leaving them in the old arc wondering what the points bought.
    setActiveArcId(arcsOf(animeId)[0]?.id ?? null);
    cancelPendingAutomation();
    spawnNext();
    return true;
  }

  /**
   * An ability's effects, ready to drop into `temporaryModifiers`. The "DPS Équipe" tree can boost
   * a percent/multiplier effect's magnitude (node 2) and stretch its duration (node 4) — flat
   * effects are left alone since "damage boost" is meant to read as a percent, not a flat bump.
   */
  function buildAbilityModifiers(unlocked: UnlockedAbility): ActiveModifier[] {
    const { ability, characterIds } = unlocked;
    const nowMs = Date.now();
    const damageBoostLevel = nodeLevelOf("teamDps", 2);
    const durationLevel = nodeLevelOf("teamDps", 4);
    const duration =
      durationLevel > 0 ? ability.durationMs * (1 + ABILITY_DURATION_BOOST * durationLevel) : ability.durationMs;
    // One modifier per scoped character: a buff only ever boosts the character it comes from, which
    // is what lets every ability run at once (see `computeScopedStat`).
    return ability.effects.flatMap((effect) =>
      characterIds.map((characterId) => ({
        ...effect,
        value: boostedAbilityValue(effect, ability, damageBoostLevel),
        sourceId: ability.id,
        scope: characterId,
        expiresAt: nowMs + duration,
      }))
    );
  }

  /**
   * A percent or multiplier buff lifts its own characters only, so it is worth its printed value
   * times the share of the team it names — `scopedMagnitude` normalises that share against how much
   * of the roster any ability reaches at all (see there). Flats are untouched by both: a flat bump
   * lands whole on its character either way, and node 2 deliberately reads as a percent.
   */
  function boostedAbilityValue(effect: ModifierTemplate, ab: AbilityDefinition, level: number): number {
    if (effect.kind === "flat") return effect.value;
    const magnitude = abilityCoverage() * dutyMagnitude(ab) * (1 + ABILITY_DAMAGE_BOOST * level);
    if (effect.kind === "percent") return effect.value * magnitude;
    return 1 + (effect.value - 1) * magnitude;
  }

  /** Applies an ability's effects without touching its cooldown — the "Clic du Narrateur" tier 5 freebie. */
  function triggerAbilityEffects(unlocked: UnlockedAbility) {
    // Re-firing an ability refreshes its own buff instead of stacking a second copy of it; every
    // *other* ability keeps running, scoped to its own characters.
    setTemporaryModifiers((existing) => [
      ...existing.filter((m) => m.sourceId !== unlocked.ability.id),
      ...buildAbilityModifiers(unlocked),
    ]);
  }

  function activateAbility(abilityId: string) {
    const unlocked = unlockedAbilities().find((u) => u.ability.id === abilityId);
    if (!unlocked) return false;

    const nowMs = Date.now();
    if (!isAbilityReady(abilityLastUsed()[abilityId], cooldownOf(unlocked.ability), nowMs)) return false;

    triggerAbilityEffects(unlocked);
    setAbilityLastUsed((used) => ({ ...used, [abilityId]: nowMs }));
    bumpAchievement("abilitiesUsed");
    return true;
  }

  function abilityCooldownRemaining(abilityId: string): number {
    const ability = unlockedAbilities().find((u) => u.ability.id === abilityId)?.ability;
    const cooldownMs = ability ? cooldownOf(ability) : 0;
    return cooldownRemaining(abilityLastUsed()[abilityId], cooldownMs, now());
  }

  /** How much a scoped buff is worth over its printed value right now — see `scopedMagnitude`. */
  const abilityCoverage = createMemo(() => {
    const covered = new Set(unlockedAbilities().flatMap((u) => u.characterIds));
    return scopedMagnitude(ownedCharacterIds().length, covered.size);
  });

  /** What a buff's printed percent/multiplier is really worth right now — for the tooltips. */
  function abilityMagnitudeOf(ability: AbilityDefinition): number {
    return abilityCoverage() * dutyMagnitude(ability);
  }

  /** Abilities off cooldown right now — the bar's count, and what `activateReadyAbilities` fires. */
  const readyAbilities = createMemo(() =>
    unlockedAbilities().filter((u) => isAbilityReady(abilityLastUsed()[u.ability.id], cooldownOf(u.ability), now()))
  );

  /**
   * Fires every ability that is off cooldown, and returns how many went off. Buffs stack now, so
   * firing them all is simply the best play — that used to be impossible (they locked each other
   * out), and clicking through forty buttons to do it by hand is not a decision, it's chores.
   */
  function activateReadyAbilities(): number {
    return readyAbilities().filter((u) => activateAbility(u.ability.id)).length;
  }

  /** Is the enemy in front of us the arc's boss — the one condition a `"boss"` policy waits for. */
  const onBoss = () => {
    const arc = activeArc();
    return !!arc && enemy()?.id === arc.boss.id;
  };

  /**
   * What the "Réflexe" automation fires: the ready abilities the player's plan allows right now.
   * Still cadence and scope only — a policy can delay an ability, never make one worth more.
   */
  function activatePlannedAbilities(): number {
    return autoFirable(readyAbilities(), unlockedAbilities(), abilityPolicyOf, onBoss()).filter((u) =>
      activateAbility(u.ability.id)
    ).length;
  }

  /** Buffs running right now, strongest first — what the ability bar shows as the live stack. */
  const activeBuffs = createMemo(() => {
    const live = pruneExpired(temporaryModifiers(), now());
    return [...new Set(live.map((m) => m.sourceId))];
  });

  /** Every owned ability with the exact reason it is ready, cooling, active or unavailable. */
  const abilityDiagnostics = createMemo<AbilityDiagnostic[]>(() => {
    const running = new Set(activeBuffs());
    return ownedAbilities().flatMap((unlocked) => {
      const character = characterOf(unlocked.sourceId);
      if (!character) return [];
      return [
        diagnoseAbility(unlocked, character, {
          activeArc: activeArc(),
          evolved: isEvolved(character),
          challengeId: activeChallengeId(),
          noAbilities: challengeRules().noAbilities === true,
          lastActivatedAt: abilityLastUsed()[unlocked.ability.id],
          now: now(),
          active: running.has(unlocked.ability.id),
        }),
      ];
    });
  });

  // --- défis de run (`challenges.ts`) ---

  const isChallengeDone = (id: string) => completedChallengeIds().includes(id);

  /** Where the current run stands against the challenge it is being played under, if any. */
  const challengeProgressOf = createMemo(() => {
    const challenge = activeChallenge();
    return challenge ? challengeProgress(challenge, clearedArcIds().length) : null;
  });

  /**
   * Banks the reward the moment the goal is met, and lifts the rule with it: the constraint bought
   * what it was there to buy, and leaving it on would only tax a run the player has already won.
   */
  function maybeCompleteChallenge() {
    const challenge = activeChallenge();
    if (!challenge || !challengeProgress(challenge, clearedArcIds().length).done) return;
    setCompletedChallengeIds((ids) => (ids.includes(challenge.id) ? ids : [...ids, challenge.id]));
    setActiveChallengeId(null);
    pushNotice("arc", `Défi relevé : ${challenge.name}`);
  }

  /**
   * Starts a challenge, which *is* a reset — the goal counts the run's own cleared arcs, so a run
   * in progress would already be most of the way there. It goes through `prestigeReset` rather than
   * around it, so the points the run had earned are banked instead of thrown away.
   */
  function startChallenge(id: string): boolean {
    const challenge = challengeById(id);
    if (!challenge || activeChallengeId() || isChallengeDone(id)) return false;
    prestigeReset(false);
    setActiveChallengeId(id);
    return true;
  }

  /**
   * Gives up. Also a reset, and for the same reason the start is one: a run played under a rule
   * must not survive the rule being dropped, or every challenge would be worth taking and quitting
   * one arc from the goal.
   */
  function abandonChallenge(): boolean {
    if (!activeChallengeId()) return false;
    setActiveChallengeId(null);
    prestigeReset(false);
    return true;
  }

  /**
   * Sends the run back to square one: currency, team, xp, worlds entered, arcs cleared and items
   * all go. Passive ranks and unique forge levels survive with the other meta-progression: once a
   * character or unique is obtained again, its previously bought mastery returns.
   * The whole point is to redo the climb faster.
   */
  function prestigeReset(showReport = true) {
    // "Destin" node 5: a chance to double the points this reset banks, scaling with its level.
    const doubleLevel = nodeLevelOf("destin", 5);
    const gainMultiplier = doubleLevel > 0 && Math.random() < scaledChance(DOUBLE_PRESTIGE_CHANCE, doubleLevel) ? 2 : 1;
    const endedAt = Date.now();
    const before = prestige();
    const after = applyPrestige(before, lifetimeEarned(), prestigeScale(), runCompletion(), gainMultiplier);
    if (showReport) {
      setLastPrestigeReport(
        buildPrestigeReport({
          startedAt: runStartedAt(),
          endedAt,
          prestigeBefore: before.prestigePoints,
          prestigeAfter: after.prestigePoints,
          gainMultiplier,
          lifetimeEarned: lifetimeEarned(),
          completion: runCompletion(),
          clearedArcIds: clearedArcIds(),
          unlockedAnimeIds: before.unlockedAnimeIds,
          ownedCharacterCount: ownedCharacterIds().length,
          levels: ownedCharacterIds().map(levelOf),
          teamDps: teamDps(),
          clickPower: clickPower(),
          uniqueItemsFound: foundItems().filter((item) => item.kind === "unique").length,
          passiveRanksKept: Object.values(passiveRanks()).reduce((sum, rank) => sum + rank, 0),
          forgedUniquesKept: Object.values(uniqueUpgradeRanks()).filter((rank) => rank > 1).length,
          achievementCounts: achievementCounts(),
          achievementBaseline: runAchievementBaseline(),
          challengeName: activeChallenge()?.name ?? null,
        })
      );
    }
    setPrestige(after);
    bumpAchievement("prestiges");
    setRunAchievementBaseline({ ...achievementCounts() });
    setRunStartedAt(endedAt);
    setCurrency(0);
    setLifetimeEarned(0);
    setOwnedCharacterIds([]);
    setCharacterXp({});
    setTemporaryModifiers([]);
    setAbilityLastUsed({});
    setItemCounts({});
    setUniqueFragments({});
    setArcKills({});
    setClearedArcIds([]);
    setActiveArcId(null);
    setBossRetreatArcIds([]);
    setEvolvedCharacterIds([]);
    setCharacterEquipment({});
    setKillsSinceDrop({});
    setAutoClickAccumMs(0);
    // The intendance's list names characters the run no longer has; the switches themselves are a
    // preference, not progress, so they stay — like `autoClickEnabled`.
    setAutoRankCharacterIds([]);
    setAutoAbilityAccumMs(0);
    cancelPendingAutomation();
    setKillBudget(MAX_KILLS_PER_SECOND);
    setCrossoverCrystals(0);
    setCrossoverUntil(0);
    spawnNext();
  }

  function buildSaveFile(): SaveFile {
    return {
      version: SAVE_VERSION,
      currency: currency(),
      lifetimeEarned: lifetimeEarned(),
      ownedCharacterIds: ownedCharacterIds(),
      activeArcId: activeArcId(),
      prestigePoints: prestige().prestigePoints,
      unlockedAnimeIds: prestige().unlockedAnimeIds,
      arcKills: arcKills(),
      clearedArcIds: clearedArcIds(),
      characterXp: characterXp(),
      itemCounts: itemCounts(),
      uniqueFragments: uniqueFragments(),
      uniqueUpgradeRanks: uniqueUpgradeRanks(),
      passiveRanks: passiveRanks(),
      evolvedCharacterIds: evolvedCharacterIds(),
      achievementCounts: achievementCounts(),
      prestigeTreeRanks: prestigeTreeRanks(),
      characterEquipment: characterEquipment(),
      crossoverCrystals: crossoverCrystals(),
      worldPoints: worldPoints(),
      characterDuplicates: characterDuplicates(),
      autoClickEnabled: autoClickEnabled(),
      automationOff: automationOff(),
      autoRankCharacterIds: autoRankCharacterIds(),
      abilityPolicy: abilityPolicy(),
      abilityLastUsed: abilityLastUsed(),
      activeChallengeId: activeChallengeId(),
      completedChallengeIds: completedChallengeIds(),
      runStartedAt: runStartedAt(),
      runAchievementBaseline: runAchievementBaseline(),
    };
  }

  // An import deliberately reloads the page after replacing localStorage. `pagehide` and Solid's
  // cleanup both call `save()` during that reload; without this guard they immediately wrote the
  // still-running old signals over the imported file, making a successful import look ignored.
  let importedSavePendingReload = false;

  function save() {
    if (importedSavePendingReload) return;
    if (writeSave(buildSaveFile(), () => setHasBackupSave(true))) setLastSavedAt(Date.now());
  }

  /** A portable blob the player can download and hand back later — same shape `readSave` already trusts. */
  function exportSave(): string {
    return encodeSave(buildSaveFile());
  }

  /**
   * Loads a blob produced by `exportSave`. Writing straight to localStorage and reloading is the
   * simplest way to get every signal back in sync, rather than exposing a setter per field here.
   */
  function importSave(text: string): boolean {
    const parsed = decodeSave(text);
    if (!parsed) return false;
    importedSavePendingReload = true;
    if (!writeSave(parsed, () => setHasBackupSave(true))) {
      importedSavePendingReload = false;
      return false;
    }
    if (typeof location !== "undefined") location.reload();
    return true;
  }

  /**
   * Swaps the current and backup slots so restoring is reversible until the next autosave. A bad
   * current slot is simply replaced; it is never allowed to destroy the valid backup.
   */
  function restoreBackup(): boolean {
    importedSavePendingReload = true;
    if (!restoreBackupSlots()) {
      importedSavePendingReload = false;
      return false;
    }
    if (typeof location !== "undefined") location.reload();
    return true;
  }

  /** Wipes the save and every bit of progress, prestige and worlds included. */
  function hardReset() {
    clearSaveSlots();
    setHasBackupSave(false);
    setCurrency(0);
    setLifetimeEarned(0);
    setOwnedCharacterIds([]);
    setTemporaryModifiers([]);
    setAbilityLastUsed({});
    setPrestige(createInitialPrestigeState());
    setCharacterXp({});
    setItemCounts({});
    setUniqueFragments({});
    setUniqueUpgradeRanks({});
    setPassiveRanks({});
    setArcKills({});
    setClearedArcIds([]);
    setActiveArcId(null);
    setBossRetreatArcIds([]);
    setEvolvedCharacterIds([]);
    setAchievementCounts({});
    setRunStartedAt(Date.now());
    setRunAchievementBaseline({});
    setLastPrestigeReport(null);
    setPrestigeTreeRanks({});
    setCharacterEquipment({});
    setKillsSinceDrop({});
    setAutoClickAccumMs(0);
    setAutoRankCharacterIds([]);
    setAutoAbilityAccumMs(0);
    setAutomationOff({});
    setActiveChallengeId(null);
    setCompletedChallengeIds([]);
    cancelPendingAutomation();
    setKillBudget(MAX_KILLS_PER_SECOND);
    setCrossoverCrystals(0);
    setCrossoverUntil(0);
    setWorldPoints({});
    setCharacterDuplicates({});
    setEnemy(null);
  }

  /** Buys the next level of one specific node, if it's unlocked, not maxed, and affordable. */
  function purchaseTreeLevel(categoryId: string, position: number): boolean {
    const category = PRESTIGE_TREE_CATEGORIES.find((c) => c.id === categoryId);
    if (!category) return false;
    const result = purchaseNodeLevel(prestige().prestigePoints, prestigeTreeRanks(), category, position);
    if (!result) return false;
    setPrestige((p) => ({ ...p, prestigePoints: result.prestigePoints }));
    setPrestigeTreeRanks(result.ranks);
    return true;
  }

  spawnNext();

  /**
   * One 200ms step of the game, wrapped in a single `batch` by the interval below.
   *
   * The batch is load-bearing for performance, not for correctness. A tick writes a dozen signals —
   * the clock, the kill budget, the enemy's hp, and everything `defeat` hands out per kill — and
   * outside a batch Solid flushes the whole effect queue after *each* write. `modifiersByScope` and
   * `teamWideScaling` hand back a fresh Map/array every time they run, so every subscriber rebuilds:
   * measured at a mid-run save (50 characters, one world's 15 arcs on screen), a single click cost
   * twenty full recomputes of the team's modifiers instead of one.
   *
   * It changes nothing the engine can observe: a batch defers *effects*, not writes, so a signal
   * read back after being written inside the tick still returns the value just written and a memo
   * read inside it still recomputes on demand. `dealDamage` relies on exactly that when it reads
   * `enemyHpLeft()` back between two kills.
   */
  function tick() {
    if (paused()) return;
    const nowMs = Date.now();
    // Clamped: a sleeping machine or a throttled tab must not bank hours of damage and xp on the
    // first tick back — see MAX_TICK_DELTA_MS.
    const deltaMs = Math.min(nowMs - now(), MAX_TICK_DELTA_MS);
    const deltaSeconds = deltaMs / 1000;
    setNow(nowMs);
    // Refill before spending, and never above the cap: banking an idle minute into one burst would
    // hand back exactly the spike this budget exists to remove.
    setKillBudget((budget) => Math.min(MAX_KILLS_PER_SECOND, budget + deltaSeconds * MAX_KILLS_PER_SECOND));
    dealDamage(teamDps() * deltaSeconds, "teamDps");
    checkTimer(nowMs);

    const autoClickLevel = nodeLevelOf("narratorClick", 2);
    if (autoClickLevel > 0 && autoClickEnabled() && !clickIsMuted(challengeRules(), ownedCharacterIds().length)) {
      // Levels buy cadence, not strength: every automatic click lands at full click power, they
      // just come closer together — see `autoClickIntervalMs`.
      const interval = autoClickInterval();
      const accumMs = autoClickAccumMs() + deltaMs;
      if (accumMs >= interval) {
        const damage = clickPower();
        const dealt = dealDamage(damage, "click");
        bumpAchievement("clicks");
        // Announced, not just dealt: an autoclick that lands in silence is indistinguishable from a
        // perk that isn't working. `ClickStage` turns each pulse into a damage pop-up of its own.
        setAutoClickPulse({ id: autoClickPulse().id + 1, damage: dealt });
        setAutoClickAccumMs(accumMs % interval);
      } else {
        setAutoClickAccumMs(accumMs);
      }
    }

    // --- "Automatisation": each node plays a move the player could have played by hand ---
    // None of them grants anything on its own; every reward still comes from the kill it leads to,
    // which is what keeps the branch out of the balance.
    const advanceAt = autoAdvanceAt();
    if (advanceAt !== null && nowMs >= advanceAt) {
      setAutoAdvanceAt(null);
      // `stepArc` walks `playableArcs`; at the end of a world there is nothing to step to, and the
      // next world stays the player's call — it costs prestige points, or the run itself.
      if (automationRuns("advance") && stepArc(1)) {
        pushNotice("arc", `Relève : direction ${activeArc()?.name ?? "?"}`);
      }
    }

    const rematchAt = autoRematchAt();
    if (rematchAt !== null && nowMs >= rematchAt) {
      const arc = activeArc();
      // Only once the boss is actually within reach. Retrying one the team cannot fell yet trades
      // the farming that would *make* it fellable for a fight that ends the same way — and, from the
      // stage, a boss that comes back at full hp every timer looks like a fight restarting on its
      // own. The test is `bossOutlookOf`'s, the same one the arc list turns into its "trop dur"
      // marker, so the automation and the UI agree on what "too hard" means.
      if (arc && automationRuns("rematch") && !bossOutlookOf(arc).winnable) {
        setAutoRematchAt(nowMs + autoRematchDelay()); // on farme, on redemandera plus tard
      } else {
        setAutoRematchAt(null);
        if (automationRuns("rematch") && challengeBoss()) {
          pushNotice("arc", "Second souffle : nouvel assaut sur le boss");
        }
      }
    }

    if (automationRuns("ability")) {
      // Same shape as the autoclicker: levels buy how *soon* a ready ability goes off, never what
      // it is worth. Silent on purpose — the buff bar already shows what is running, and a notice
      // per ability would bury every other one.
      const interval = autoAbilityInterval();
      const accumMs = autoAbilityAccumMs() + deltaMs;
      if (accumMs >= interval) {
        activatePlannedAbilities();
        setAutoAbilityAccumMs(accumMs % interval);
      } else {
        setAutoAbilityAccumMs(accumMs);
      }
    }

    if (automationRuns("rank")) {
      // One rank per character per tick — a trickle rather than a burst, and no unbounded loop on a
      // deep stack of copies. `rankUpPassive` re-checks affordability, ownership and the cap, so a
      // character who can't be ranked right now is simply skipped.
      for (const id of autoRankCharacterIds().slice(0, autoRankCapacity())) {
        const character = characterOf(id);
        if (character) rankUpPassive(character);
      }
    }

    const autoCrossoverLevel = automationLevelOf("crossover");
    if (
      autoCrossoverLevel > 0 &&
      automationEnabled("crossover") &&
      crossoverAdvised() &&
      crossoverCrystals() >= CROSSOVER_COST + autoCrossoverReserve(autoCrossoverLevel, CROSSOVER_COST)
    ) {
      // `crossoverAdvised` is the same "would this actually pay right now?" test the HUD hint uses:
      // someone in the team is at the steep other-anime malus. The reserve above is what stops the
      // node from spending a stock the player was saving for a window of their own.
      if (activateCrossover()) pushNotice("arc", "Instinct de crossover : fenêtre ouverte");
    }

    const xpTrickleLevel = nodeLevelOf("xp", 2);
    if (xpTrickleLevel > 0 && ownedCharacterIds().length > 0) {
      grantXp(XP_PASSIVE_PER_SECOND * xpTrickleLevel * deltaSeconds);
    }

    // Only rebuild the list when something actually expired, so an idle tick stays a no-op.
    if (notices().some((n) => n.expiresAt <= nowMs)) {
      setNotices((list) => list.filter((n) => n.expiresAt > nowMs));
    }
    // Same shape, and the one thing that keeps `allModifiers` off the clock honest: the fold
    // already ignores an expired buff to the millisecond, but nothing else would ever take it back
    // out of the list, and `modifiersByScope` would carry every ability ever fired this run.
    if (temporaryModifiers().some((m) => m.expiresAt !== undefined && m.expiresAt <= nowMs)) {
      setTemporaryModifiers((mods) => pruneExpired(mods, nowMs));
    }
  }
  const interval = setInterval(() => batch(tick), TICK_MS);

  function togglePause() {
    const pausedAt = Date.now();
    if (paused()) {
      const offset = pausedAt - now();
      const shift = (t: number | null) => (t === null ? null : t + offset);
      setTimerDeadline(shift);
      setAutoAdvanceAt(shift);
      setAutoRematchAt(shift);
      setCrossoverUntil((t) => (t ? t + offset : t));
      setTemporaryModifiers((mods) =>
        mods.map((m) => (m.expiresAt === undefined ? m : { ...m, expiresAt: m.expiresAt + offset }))
      );
      setAbilityLastUsed((map) => Object.fromEntries(Object.entries(map).map(([k, v]) => [k, v + offset])));
      setNotices((list) => list.map((n) => ({ ...n, expiresAt: n.expiresAt + offset })));
      setNow(pausedAt);
    }
    setPaused((p) => !p);
  }

  const autosave = setInterval(save, AUTOSAVE_MS);
  // `onCleanup` never runs when a tab is simply closed, so up to AUTOSAVE_MS of progress would be
  // lost. `pagehide` is the one lifecycle event that fires in that case on every browser, mobile
  // included (`beforeunload` doesn't, on iOS).
  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", save);
    onCleanup(() => window.removeEventListener("pagehide", save));
  }
  onCleanup(() => {
    clearInterval(interval);
    clearInterval(autosave);
    save();
  });

  return {
    data,
    // Id lookups over `data`, backed by the indexes built at the top — the UI used to reach for
    // `game.data.<section>.find(...)` inside render loops, once per row.
    characterOf,
    itemOf,
    arcOf,
    animeOf,
    now,
    runStartedAt,
    currency,
    lifetimeEarned,
    prestige,
    pendingPrestigeGain,
    runCompletion,
    activeArc,
    unlockedAnimes,
    ownedCharacters,
    ownedCharacterIds,
    isEvolved,
    clickPower,
    narratorBase,
    teamDps,
    foundItems,
    countOf,
    forgeableUniques,
    uniqueFragmentsOf,
    uniqueUpgradeLevelOf,
    uniqueUpgradeMultiplierOf,
    uniqueUpgradeCostOf,
    upgradeUnique,
    xpOf,
    levelOf,
    progressOf,
    passiveItemOf,
    passiveCopiesOf,
    passiveRankOf,
    passiveUpgradeOf,
    passiveCapOf,
    firstAffordablePassive,
    rankUpPassive,
    characterEquipment,
    equippedItemOf,
    wearerOf,
    canEquipItem,
    characterStatOf,
    equipItem,
    unequipItem,
    shopOffers,
    buyShopOffer,
    // packs
    worldPointsOf,
    duplicatesOf,
    damageGrowthOf,
    catchUpOf,
    packPoolOf,
    openPack,
    // crossover
    crossoverCrystals,
    crossoverActive,
    crossoverRemaining,
    teamIsMixed,
    crossoverAdvised,
    activateCrossover,
    unlockedAbilities,
    abilityDiagnostics,
    sleepingAbilities,
    sleepingAbilityCount,
    activeBuffs,
    readyAbilities,
    synergyOf,
    // The malus tiers in force right now, "DPS Équipe" node 3 included — anything printing them
    // must read these rather than `defaultSynergyConfig`, or it goes stale the moment that node is
    // bought.
    synergyConfig: activeSynergyConfig,
    achievementCounts,
    // HUD notices
    notices,
    dismissNotice,
    announceUnlock,
    // prestige tree
    branchLevelsOf,
    nodeLevelOf,
    isNodeUnlockedFor,
    nodeCostOf,
    purchaseTreeLevel,
    // combat
    autoClickPulse,
    autoClickEnabled,
    setAutoClickEnabled,
    autoClickLevel,
    autoClickInterval,
    // automation
    automationLevelOf,
    automationEnabled,
    setAutomationEnabled,
    autoAdvanceDelay,
    autoAbilityInterval,
    autoRematchDelay,
    autoRankCapacity,
    autoRankCharacterIds,
    isAutoRanked,
    toggleAutoRank,
    // défis de run
    challenges: CHALLENGES,
    activeChallenge,
    challengeRules,
    challengeProgressOf,
    completedChallengeIds,
    isChallengeDone,
    startChallenge,
    abandonChallenge,
    enemy,
    enemyHpLeft,
    enemyMaxHp,
    timeToKill,
    killRate,
    maxKillsPerSecond: MAX_KILLS_PER_SECOND,
    bossOutlookOf,
    timerRemaining,
    timerTotal,
    lastTimeout,
    hasRetreatedFromBoss,
    bossChallengeable,
    challengeBoss,
    // world progression
    animeAvailable,
    animeBlockedBy,
    arcsOf,
    arcCleared,
    arcOpen,
    killsIn,
    animeCleared,
    clearedAnimes,
    arcRecruits,
    tierOf,
    difficultyOf,
    nextDifficulty,
    canTravel,
    travelTo,
    playableArcs,
    stepArc,
    // actions
    paused,
    togglePause,
    click,
    setActiveArc,
    unlockAnime,
    activateAbility,
    abilityPolicyOf,
    abilityPolicyChoices,
    setAbilityPolicy,
    activateReadyAbilities,
    abilityMagnitudeOf,
    // The ceiling a buff may lift one character to right now — the ability bar prints it, so
    // the climb from `SCOPED_BUFF_CAP_FLOOR` to `SCOPED_BUFF_CAP` is something the player sees.
    buffCap,
    abilityCooldownRemaining,
    prestigeReset,
    lastPrestigeReport,
    dismissPrestigeReport: () => setLastPrestigeReport(null),
    save,
    lastSavedAt,
    hasBackupSave,
    recoveredFromBackup: () => loadedSave.recoveredFromBackup,
    restoreBackup,
    exportSave,
    importSave,
    hardReset,
  };
}

export type GameStore = ReturnType<typeof createGameStore>;
