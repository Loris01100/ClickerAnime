import { batch, createMemo, createSignal, onCleanup } from "solid-js";
import { createContentIndex } from "./store/content";
import { createNoticeQueue } from "./store/notices";
import { createTreeState } from "./store/tree";
import { createWorldScaling } from "./store/worlds";
import { createInventory } from "./store/inventory";
import { createAbilityState } from "./store/abilityState";
import { createAchievements } from "./store/achievements";
import { createRoster } from "./store/roster";
import { createModifierFold } from "./store/modifiers";
import { createSaveIO } from "./store/saveIO";
import { createPortals } from "./store/portals";
import { createTower } from "./store/tower";
import { TOWER_MODES } from "./tower";
export type { PortalTarget } from "./store/portals";
export type { Notice } from "./store/notices";
import { achievementCount } from "./achievements";
import { computeScopedStat, pruneExpired } from "./modifiers";
import {
  applyPrestige,
  PRESTIGE_SCALE,
  calculatePrestigeGain,
  canUnlockAnime,
  createInitialPrestigeState,
  unlockAnime as unlockAnimeState,
} from "./prestige";
import { synergyMultiplier } from "./synergy";
import { evolutionKey } from "./evolutions";
import {
  CROSSOVER_BOSS_REWARD,
  CROSSOVER_COST,
  CROSSOVER_DURATION_MS,
  CROSSOVER_MOB_CHANCE,
} from "./crossover";
import {
  clearSaveSlots,
  readSave,
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
} from "./forge";
export { UNIQUE_FORGE_FRAGMENT_COSTS, UNIQUE_FORGE_MULTIPLIERS } from "./forge";
import { drawPack, packPool, PACK_COST, POINTS_PER_KILL } from "./packs";
import {
  firstPassiveDropChance,
  XP_PER_KILL_REWARD,
} from "./growth";
import {
  canRecruitUnder,
  challengeById,
  clickIsMuted,
  challengeProgress,
  type ChallengeRules,
  CHALLENGES,
  NO_CHALLENGE_RULES,
} from "./challenges";
import {
  canEnterNewAnime,
  isAnimeAvailable,
  isAnimeComplete,
  isArcUnlocked,
} from "./progression";
import {
  AUSPICE_DOUBLE_DROP_CHANCE,
  autoCrossoverReserve,
  BOSS_TIMER_BOOST,
  BOSS_XP_BOOST,
  CLICK_COOLDOWN_REDUCTION_MS,
  CRIT_CHANCE,
  CRIT_MULTIPLIER,
  CURRENCY_GAIN_PERCENT,
  DOUBLE_DROP_CHANCE,
  DROP_CHANCE_BOOST,
  FREE_ABILITY_TRIGGER_CHANCE,
  FREE_PACK_CHANCE,
  GHOST_LOOT_CHANCE,
  PITY_KILLS_THRESHOLD,
  PITY_REDUCTION_PER_LEVEL,
  PRESTIGE_PER_KILL_CHANCE,
  RECRUIT_XP_BONUS,
  scaledChance,
  XP_PASSIVE_PER_SECOND,
} from "./prestigeTree";
import type {
  Anime,
  Arc,
  Character,
  Enemy,
  GameData,
  Rarity,
  ShopOffer,
} from "./types";
// The content type lives in `types.ts` so every `store/` slice can take it without importing the
// module that assembles them. Re-exported here because that is where the data files ask for it.
export type { GameData } from "./types";

const TICK_MS = 200;
/**
 * Ceiling on one tick's elapsed time. `setInterval` doesn't fire while the machine sleeps or the
 * tab is throttled, so the first tick back would otherwise carry hours of `deltaMs` and hand out
 * free kills and xp — offline progress by accident, which the game deliberately doesn't have.
 */
const MAX_TICK_DELTA_MS = TICK_MS * 5;
const AUTOSAVE_MS = 5_000;
/** Floor cadence of `statClock`, the display clock the roster's stat columns fold against. */
const STAT_CLOCK_MS = 1_000;

/**
 * One pack draw: the character it handed over, and whether « Carte blanche » waived its price —
 * the panel has no other way to tell the player the points came back.
 */
export interface PackDraw {
  character: Character;
  free: boolean;
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

  /** Everything derivable from `data` alone, indexed once — see `store/content.ts`. */
  const content = createContentIndex(data);
  const { characterOf, itemOf, arcOf, animeOf } = content;

  const [now, setNow] = createSignal(Date.now());
  /**
   * A second clock, for the display-only stat columns — the roster's and the Codex's per-character
   * click/dps. Those go through `characterStatOf`, which folds two modifier groups per column, so
   * reading `now()` there had every row refold twice every 200ms for a number nobody watches at
   * that resolution.
   *
   * It is not merely coarser, it is *correct*, and `Σ characterStatOf(c, "teamDps") === teamDps()`
   * still holds to the bit. Two things make that true. It is never *ahead* of `now` — the tick is
   * the only thing that advances either. And it can never be behind across an expiry, because the
   * same tick that would notice one prunes it out of `temporaryModifiers` and bumps this to the
   * very same `nowMs`: after any tick, no live modifier has an `expiresAt` in `(statClock, now]`,
   * so folding against either clock drops exactly the same set. The once-a-second floor is only so
   * the value doesn't sit still forever on a run with no buffs at all.
   *
   * A newly fired ability needs no bump: `modifiersByScope` changes with the buff list, so the
   * column recomputes anyway, and a buff that has just started expires in the future under any of
   * these clocks.
   */
  const [statClock, setStatClock] = createSignal(Date.now());
  const [currency, setCurrency] = createSignal(saved?.currency ?? 0);
  const [lifetimeEarned, setLifetimeEarned] = createSignal(saved?.lifetimeEarned ?? 0);
  const [activeArcId, setActiveArcId] = createSignal<string | null>(saved?.activeArcId ?? null);
  const [arcKills, setArcKills] = createSignal<Record<string, number>>(saved?.arcKills ?? {});
  const [clearedArcIds, setClearedArcIds] = createSignal<string[]>(saved?.clearedArcIds ?? []);
  /** The lifetime ladders and what they contribute — see `store/achievements.ts`. */
  const achievements = createAchievements(saved);
  const {
    achievementCounts,
    runAchievementBaseline,
    setRunAchievementBaseline,
    bumpAchievement,
    achievementModifiers,
  } = achievements;
  const [runStartedAt, setRunStartedAt] = createSignal(saved?.runStartedAt ?? Date.now());
  const [lastPrestigeReport, setLastPrestigeReport] = createSignal<PrestigeReport | null>(null);
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
  // Cristaux de crossover: earned on kills with a team spanning two worlds, spent to lift the
  // synergy malus for a while (see crossover.ts). Run-scoped like items — prestigeReset wipes them.
  const [crossoverCrystals, setCrossoverCrystals] = createSignal(saved?.crossoverCrystals ?? 0);
  // Pack points, one bucket per world: earned on every fight won there, spent on that world's
  // packs (see packs.ts). Meta-progression like the duplicates they buy — prestigeReset spares
  // both, only hardReset wipes them.
  const [worldPoints, setWorldPoints] = createSignal<Record<string, number>>(saved?.worldPoints ?? {});
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
  /**
   * Tiers, the power ramp, and what every world and arc is played at — see `store/worlds.ts`. It
   * owns the two frozen-at-entry scales, so nothing else may write them.
   */
  const worlds = createWorldScaling({
    data,
    content,
    saved,
    unlockedAnimeIds: () => prestige().unlockedAnimeIds,
    clearedArcIds,
    activeArcId,
  });
  const {
    animeEntryDifficulties,
    animeEntryScales,
    catchUpOf,
    tierOf,
    arcsOf,
    difficultyOf,
    difficultyOfArc,
    freezeEntryScale,
  } = worlds;

  /** The HUD's bounded pop-up queue — see `store/notices.ts`. */
  const noticeQueue = createNoticeQueue();
  const { notices, pushNotice, announceUnlock, dismissNotice } = noticeQueue;

  /**
   * Item copies, unique fragments, the forge levels they buy and who wears which unique — see
   * `store/inventory.ts`. Created here so `permanentModifiersFor` below can read the equipment.
   */
  const inventory = createInventory({
    data,
    content,
    saved,
    achievementCounts,
    bumpAchievement,
    pushNotice,
  });
  const {
    itemCounts,
    uniqueFragments,
    uniqueUpgradeRanks,
    characterEquipment,
    countOf,
    foundItems,
    uniqueFragmentsOf,
    uniqueUpgradeLevelOf,
    uniqueUpgradeMultiplierOf,
    uniqueUpgradeCostOf,
    forgeableUniques,
    forgeableNowIds,
    upgradeUnique,
    equippedItemOf,
    wearerOf,
    canEquipItem,
    equipItem,
    unequipItem,
    grantItem,
    grantUniqueFragment,
    animeOfItem,
    arcCommonItem,
    passiveItemOf,
    passiveCopiesOf,
  } = inventory;

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

  /**
   * The prestige tree's bought levels and every knob they turn, the "Automatisation" switches
   * included — see `store/tree.ts`. Created here, right after the signals it reads its save from
   * and the crossover clock its synergy config asks about, because nearly everything below reads
   * one of its numbers.
   */
  const tree = createTreeState({
    saved,
    prestigePoints: () => prestige().prestigePoints,
    setPrestigePoints: (points) => setPrestige((p) => ({ ...p, prestigePoints: points })),
    crossoverActive,
  });
  const {
    prestigeTreeRanks,
    branchLevelsOf,
    nodeLevelOf,
    isNodeUnlockedFor,
    nodeCostOf,
    automationLevelOf,
    automationEnabled,
    automationRuns,
    setAutomationEnabled,
    autoAdvanceDelay,
    autoAbilityInterval,
    autoRematchDelay,
    autoRankCapacity,
    autoClickEnabled,
    setAutoClickEnabled,
    autoClickLevel,
    autoClickInterval,
    effectiveXpGrowth,
    shopDiscount,
    activeSynergyConfig,
  } = tree;

  /** Spends crystals for one crossover window; refuses while one is already up. */
  function activateCrossover(): boolean {
    if (crossoverActive() || crossoverCrystals() < CROSSOVER_COST) return false;
    setCrossoverCrystals((c) => c - CROSSOVER_COST);
    setCrossoverUntil(Date.now() + CROSSOVER_DURATION_MS);
    bumpAchievement("crossoversUsed");
    return true;
  }

  const activeArc = createMemo<Arc | null>(() => arcOf(activeArcId()));

  const unlockedAnimes = createMemo(() => data.animes.filter((a) => prestige().unlockedAnimeIds.includes(a.id)));

  /**
   * The team and everything that grows it — see `store/roster.ts`. Created after the inventory it
   * pays passive ranks out of, and before the abilities and the modifier fold that read it.
   */
  const roster = createRoster({
    data,
    content,
    saved,
    nodeLevelOf,
    effectiveXpGrowth,
    activeArc,
    activeSynergyConfig,
    catchUpOf,
    achievementCounts,
    bumpAchievement,
    passiveItemOf,
    passiveCopiesOf,
    spendCopies: inventory.spendCopies,
  });
  const {
    ownedCharacterIds,
    ownedCharacters,
    characterXp,
    passiveRanks,
    evolvedCharacterIds,
    characterDuplicates,
    xpOf,
    levelOf,
    progressOf,
    levelsByCharacter,
    evolutionStageOf,
    isEvolved,
    activeEvolutionOf,
    isEvolutionUnlocked,
    passiveRankOf,
    passiveUpgradeOf,
    passiveCapOf,
    rankablePassiveIds,
    firstAffordablePassive,
    rankUpPassive,
    duplicatesOf,
    damageGrowthOf,
    narratorBase,
    teamIsMixed,
    awayCharacterIds,
    synergyOf,
    grantXp,
    grantXpTo,
  } = roster;

  /**
   * Buffs, cooldowns and firing plans — see `store/abilityState.ts`. Created here, between
   * `awayCharacterIds` (which decides whose ability is asleep) and the modifier fold below (which
   * reads the buff list this slice owns).
   */
  const abilities = createAbilityState({
    data,
    content,
    saved,
    now,
    nodeLevelOf,
    reflexLevel: () => automationLevelOf("ability"),
    ownedCharacterIds,
    evolvedCharacterIds,
    evolutionStageOf,
    activeArc,
    activeChallengeId,
    challengeRules,
    awayCharacterIds,
    enemy,
    bumpAchievement,
  });
  const {
    temporaryModifiers,
    abilityLastUsed,
    abilityPolicy,
    abilityPolicyChoices,
    abilityPolicyOf,
    setAbilityPolicy,
    unlockedAbilities,
    sleepingAbilities,
    sleepingAbilityCount,
    readyAbilities,
    activeBuffs,
    activateAbility,
    triggerAbilityEffects,
    abilityMagnitudeOf,
    abilityCooldownRemaining,
    activateReadyAbilities,
    activatePlannedAbilities,
    abilityDiagnostics,
  } = abilities;

  /**
   * The modifier fold and the two numbers that come out of it — see `store/modifiers.ts`. Created
   * last of the derived slices, because it is the one that reads all the others: the roster's
   * contributions, the inventory's equipment, the tree's ranks, the ladders, and the buffs the
   * ability slice owns.
   */
  const fold = createModifierFold({
    data,
    itemOf,
    now,
    statClock,
    clearedArcIds,
    activeArc,
    activeSynergyConfig,
    ownedCharacters,
    levelsByCharacter,
    passiveRankOf,
    evolutionStageOf,
    duplicatesOf,
    catchUpOf,
    awayCharacterIds,
    narratorBase,
    characterEquipment,
    uniqueUpgradeLevelOf,
    achievementModifiers,
    prestigeTreeRanks,
    completedChallengeIds,
    temporaryModifiers,
  });
  const {
    permanentModifiersFor,
    buffCap,
    clickPower,
    teamDps,
    characterStatOf,
  } = fold;

  /**
   * La Tour de l'Ascension — see `store/tower.ts` and `docs/tower.md`. It is created after the fold
   * because its whole damage model is `characterStatOf` summed over the five characters brought to
   * it, and after the inventory because its reward floors pay in fragments. It reads the arc only
   * to know which world's pack pool its points go into: the tower belongs to no world.
   */
  const tower = createTower({
    saved,
    cast: data.characters,
    now,
    ownedCharacterIds,
    ownedCharacters,
    characterStatOf,
    foundItems,
    uniqueFragmentsOf,
    grantUniqueFragment,
    grantCurrency: (amount) => {
      setCurrency((c) => c + amount);
      setLifetimeEarned((l) => l + amount);
    },
    grantCrystals: (amount) => setCrossoverCrystals((c) => c + amount),
    grantPackPoints: (amount) => {
      // The tower has no world of its own, so its points land in the pool of the world being played
      // — the one the player is spending them from anyway.
      const animeId = arcOf(activeArcId())?.animeId ?? prestige().unlockedAnimeIds[0];
      if (animeId) setWorldPoints((points) => ({ ...points, [animeId]: (points[animeId] ?? 0) + amount }));
    },
    bumpAchievement,
    pushNotice,
  });

  /** Repeatable supplies for every accessible arc, priced against what its farm mobs actually pay. */
  function supplyOffers(): ShopOffer[] {
    return playableArcs().flatMap((arc) => {
      const item = arcCommonItem(arc);
      const farm = item ? arc.mobs.filter((enemy) => enemy.itemId === item.id) : [];
      if (!item || farm.length === 0) return [];
      const pricePerCopy =
        (farm.reduce((sum, enemy) => sum + enemyReward(enemy, difficultyOfArc(arc)), 0) / farm.length) *
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


  /** Currency threshold worth one prestige point on reset — kept at the default scale. */
  const prestigeScale = createMemo(() => PRESTIGE_SCALE);

  /** Share of the game's arcs cleared this run — the completion the prestige gain scales with. */
  const runCompletion = createMemo(() => (data.arcs.length === 0 ? 0 : clearedArcIds().length / data.arcs.length));

  /** Prestige points the player would bank by resetting right now. */
  const pendingPrestigeGain = createMemo(() =>
    calculatePrestigeGain(lifetimeEarned(), prestigeScale(), runCompletion())
  );

  // --- world progression ---

  const arcCleared = (arc: Arc) => clearedArcIds().includes(arc.id);

  const arcOpen = (arc: Arc) => isArcUnlocked(data.arcs, arc, clearedArcIds());

  const killsIn = (arc: Arc) => arcKills()[arc.id] ?? 0;

  const animeCleared = (animeId: string) => isAnimeComplete(data.arcs, animeId, clearedArcIds());

  const clearedAnimes = createMemo(() => data.animes.filter((a) => animeCleared(a.id)));

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

  /**
   * The authored shop plus the generated supplies, built once per change rather than per read.
   *
   * `supplyOffers` walks every playable arc, and for each one reduces over its farm mobs to price a
   * copy — none of which depends on anything that moves during a fight. It was a plain function, so
   * every read rebuilt the whole list: the panel's own memo hid that from the display, but
   * `buyShopOffer` still paid for it twice on every purchase (once to find the offer, once inside
   * `canBuyShopOffer`). A memo, placed here because it reads `playableArcs`.
   */
  const availableShopOffers = createMemo<ShopOffer[]>(() => [...(data.shop ?? []), ...supplyOffers()]);

  function stepArc(direction: 1 | -1) {
    const arcs = playableArcs();
    const index = arcs.findIndex((a) => a.id === activeArcId());
    const target = arcs[index + direction];
    return target ? setActiveArc(target.id) : false;
  }

  /**
   * The character this arc's boss keeps behind its portal, while they are still missing. Kept apart
   * from `arcRecruits` on purpose: felling the boss here does *not* recruit them — see the portals
   * section below — so the roster must not list them among the fights that do.
   */
  const arcPortalRecruit = (): Character | null => {
    const arc = activeArc();
    const characterId = arc?.boss.portalCharacterId;
    if (!characterId || ownedCharacterIds().includes(characterId)) return null;
    return characterOf(characterId);
  };

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
    return arc ? difficultyOfArc(arc) : 1;
  };

  /** True once the player has timed out against this arc's boss and not yet asked for a rematch. */
  const hasRetreatedFromBoss = (arc: Arc) => bossRetreatArcIds().includes(arc.id);

  /**
   * Unlocks every owned character's next form whose world is the one now active — called
   * on every recruit and every arc switch, the only two ways this condition can newly become true.
   */
  function maybeEvolve() {
    const arc = activeArc();
    if (!arc) return;
    const newlyEvolved = ownedCharacters().flatMap((character) =>
      (character.evolutions ?? [])
        .filter((evolution) => evolution.animeId === arc.animeId && !isEvolutionUnlocked(character, evolution.animeId))
        .map((evolution) => evolutionKey(character.id, evolution.animeId))
    );
    if (newlyEvolved.length > 0) {
      roster.markEvolved(newlyEvolved);
      bumpAchievement("evolutionsUnlocked", newlyEvolved.length);
    }
  }

  /** Puts the next enemy of the active arc in front of the player, at full hp. */
  function spawnNext() {
    maybeEvolve();
    // A portal outranks the arc: it is a fight the player deliberately walked into and paid for, so
    // nothing that respawns an enemy — an arc switch, a boss timeout, "Relève" — may take it away.
    // Only `leavePortal` and winning it end it.
    if (activePortalId()) {
      spawnPortal();
      return;
    }
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
    // Inside a portal the enemy on screen is always the portal's, and felling it pays in exactly one
    // thing: the recruit. No currency, no xp, no drop, no crystal, no arc progress — see winPortal.
    const portalId = activePortalId();
    if (portalId) {
      winPortal(portalId);
      return;
    }
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
      roster.recruit(target.characterId!);
      bumpAchievement("charactersRecruited");
      pushNotice("recruit", `${target.name} rejoint l'équipe`);
    }

    const isBoss = target.id === arc.boss.id;
    const isFirstBossWin = isBoss && !clearedArcIds().includes(arc.id);
    // Crossover crystals: only a team spanning two worlds earns them — a boss pays once, the first
    // time its arc falls; re-farming a cleared arc's boss pays nothing, and mobs still roll.
    if (teamIsMixed()) {
      const crystals = isBoss
        ? isFirstBossWin
          ? CROSSOVER_BOSS_REWARD
          : 0
        : Math.random() < CROSSOVER_MOB_CHANCE
          ? 1
          : 0;
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
            passiveRanksBought: achievementCount(
              achievementCounts(),
              "passiveRanksBought",
              Object.values(passiveRanks()).reduce((sum, rank) => sum + rank, 0)
            ),
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
    // Paused means paused. `dealDamage` already refuses, but everything *around* it did not: the
    // click still fed the "clicks" achievement ladder (a permanent clickPower bonus that survives
    // prestige), still shaved every cooldown by "Clic du Narrateur" node 4, and could still fire a
    // free ability through node 5. Since `togglePause` shifts every deadline forward by the length
    // of the pause, none of that cost any time either: 500 clicks on a paused game took an ability
    // from a 45s cooldown to 0 and banked 500 clicks, with the enemy's hp untouched.
    if (paused()) return { damage: 0, crit: false };
    // "Le Narrateur muet": the click stops dealing damage — and stops counting as one, or the
    // achievement ladder would fill up on clicks that did nothing. It keeps landing while the team
    // is empty, which is the one thing that makes the challenge startable at all: see `clickIsMuted`.
    if (clickIsMuted(challengeRules(), ownedCharacterIds().length)) return { damage: 0, crit: false };
    bumpAchievement("clicks");
    const critLevel = nodeLevelOf("narratorClick", 3);
    const crit = critLevel > 0 && Math.random() < scaledChance(CRIT_CHANCE, critLevel);
    // Dans la Tour, le Clic du Narrateur frappe l'étage : c'est le même geste, avec les mêmes perks
    // (crit, cooldowns, déclenchement gratuit), simplement dirigé vers l'ennemi qui est à l'écran.
    const swing = crit ? clickPower() * CRIT_MULTIPLIER : clickPower();
    const dealt = tower.inTower() ? tower.towerHit(swing, "click") : dealDamage(swing, "click");

    const cooldownLevel = nodeLevelOf("narratorClick", 4);
    if (cooldownLevel > 0) {
      abilities.reduceCooldowns(CLICK_COOLDOWN_REDUCTION_MS * cooldownLevel, Date.now());
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
    // A portal is a single sealed boss, like an arc boss: a time to kill, never a cadence.
    if (!arc || !target || target.id === arc.boss.id || activePortalId()) return null;
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
    const ttkMs = timeToKillMs(enemyHp(arc.boss, difficultyOfArc(arc)), dps);
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
      (c) => synergyMultiplier(c, arc, config, evolutionStageOf(c)) <= config.otherAnimeMalus
    );
  });

  const timerRemaining = createMemo(() => {
    const deadline = timerDeadline();
    return deadline === null ? null : Math.max(0, deadline - now());
  });

  // --- levelling ---

  const worldPointsOf = (animeId: string) => worldPoints()[animeId] ?? 0;

  /** Recruited members of this world's rarity — future story characters never leak through packs. */
  const packPoolOf = (animeId: string, rarity: Rarity) =>
    packPool(data.characters, animeId, rarity, ownedCharacterIds(), duplicatesOf);

  /**
   * Spends a world's points on one random draw from its cast at that rarity, and banks the copy.
   * Returns the draw so the panel can show it, or null when it couldn't be bought.
   *
   * "Destin" node 5, « Carte blanche »: the price can be waived, but only *after* the pack has
   * been afforded in full — the points still have to be on the table, so the perk never buys a draw
   * the player couldn't have bought anyway, it just sometimes hands the points back. The cap stays
   * where it belongs too: `packPoolOf` is what refuses a character already at `MAX_DUPLICATES`.
   */
  function openPack(animeId: string, rarity: Rarity): PackDraw | null {
    const cost = PACK_COST[rarity];
    if (worldPointsOf(animeId) < cost) return null;
    const drawn = drawPack(packPoolOf(animeId, rarity), Math.random());
    if (!drawn) return null;
    const freePackLevel = nodeLevelOf("destin", 5);
    const free = freePackLevel > 0 && Math.random() < scaledChance(FREE_PACK_CHANCE, freePackLevel);
    if (!free) setWorldPoints((points) => ({ ...points, [animeId]: points[animeId] - cost }));
    roster.addDuplicate(drawn.id);
    bumpAchievement("packsOpened");
    return { character: drawn, free };
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
    const discount = shopDiscount();
    return availableShopOffers().map((offer) => ({
      offer,
      cost: discountedShopCost(offer, discount),
      discounted: discount > 0,
      item: offer.kind === "item" ? itemOf(offer.targetId) ?? undefined : undefined,
      character: offer.kind === "character" ? characterOf(offer.targetId) ?? undefined : undefined,
      arc: arcOf(offer.arcId) ?? undefined,
      owned: offer.kind === "character" && ownedCharacterIds().includes(offer.targetId),
      locked: !shopOfferUnlocked(offer, clearedIds),
      affordable: canBuyShopOffer(offer, currency(), clearedIds, ownedCharacterIds(), discount),
    }));
  }

  /** Spends the main currency on a shop offer: copies of an item, or a character not owned yet. */
  function buyShopOffer(offerId: string): boolean {
    const offer = availableShopOffers().find((o) => o.id === offerId);
    if (!offer) return false;
    const discount = shopDiscount();
    const cost = discountedShopCost(offer, discount);
    if (!canBuyShopOffer(offer, currency(), clearedAnimes().map((a) => a.id), ownedCharacterIds(), discount)) return false;

    // The shop is the other way into the roster, and the cap has to hold on it too.
    if (offer.kind === "character" && !canRecruitUnder(challengeRules(), ownedCharacterIds().length)) return false;

    setCurrency((c) => c - cost);
    if (offer.kind === "item") {
      inventory.addCopies(offer.targetId, offer.amount ?? 1);
    } else {
      roster.recruit(offer.targetId);
    }
    return true;
  }

  // --- actions ---

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

  /**
   * Crossover portals — see `store/portals.ts`. It drives the fight on screen while the player
   * stands in one, so it is handed `showEnemy` and `spawnNext`; `spawnNext` asks it first, which is
   * what makes a portal outrank the arc.
   */
  const portals = createPortals({
    content,
    saved,
    clearedArcIds,
    ownedCharacterIds,
    challengeRules,
    teamDps,
    crossoverCrystals,
    spendCrystals: (amount) => setCrossoverCrystals((c) => c - amount),
    recruit: roster.recruit,
    bumpAchievement,
    pushNotice,
    enemyMaxHp,
    enemyHpLeft,
    showEnemy: (target, maxHp, hpLeft) => {
      setEnemy(target);
      setEnemyMaxHp(maxHp);
      setEnemyHpLeft(hpLeft);
      // No clock, ever: a portal is meant to be walked out of and come back to.
      setTimerDeadline(null);
      setTimerTotal(null);
    },
    spawnArcEnemy: spawnNext,
    cancelPendingAutomation,
  });
  const {
    portalHp,
    portalDamage,
    activePortalId,
    portalCostOf,
    portalIsOpen,
    portalTargets,
    openPortal,
    enterPortal,
    leavePortal,
    winPortal,
    spawnPortal,
    syncPortalDamage,
  } = portals;

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
    freezeEntryScale(animeId);
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
    freezeEntryScale(animeId);
    // Same landing as `travelTo`: paying to enter a world puts the player *in* it, rather than
    // leaving them in the old arc wondering what the points bought.
    setActiveArcId(arcsOf(animeId)[0]?.id ?? null);
    cancelPendingAutomation();
    spawnNext();
    return true;
  }

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
    const endedAt = Date.now();
    const before = prestige();
    const after = applyPrestige(before, lifetimeEarned(), prestigeScale(), runCompletion());
    if (showReport) {
      setLastPrestigeReport(
        buildPrestigeReport({
          startedAt: runStartedAt(),
          endedAt,
          prestigeBefore: before.prestigePoints,
          prestigeAfter: after.prestigePoints,
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
    roster.resetRun();
    abilities.reset();
    inventory.resetRun();
    setArcKills({});
    setClearedArcIds([]);
    setActiveArcId(null);
    worlds.reset();
    setBossRetreatArcIds([]);
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
    portals.reset();
    // Le prestige ne touche pas à la Tour, mais il vide le roster : rester dans un étage avec une
    // escouade qui n'existe plus laisserait un combat à 0 DPS à l'écran. On en sort, la grimpe est
    // conservée.
    tower.leaveTower();
    spawnNext();
  }

  /**
   * The live signals assembled into the save shape. `persistence.ts` owns the shape and
   * `store/saveIO.ts` owns when it is written; this is the only place that knows where each field
   * comes from.
   */
  function buildSaveFile(): Omit<SaveFile, "version"> {
    return {
      currency: currency(),
      lifetimeEarned: lifetimeEarned(),
      ownedCharacterIds: ownedCharacterIds(),
      activeArcId: activeArcId(),
      prestigePoints: prestige().prestigePoints,
      unlockedAnimeIds: prestige().unlockedAnimeIds,
      animeEntryDifficulties: animeEntryDifficulties(),
      animeEntryScales: animeEntryScales(),
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
      portalHp: portalHp(),
      portalDamage: portalDamage(),
      worldPoints: worldPoints(),
      characterDuplicates: characterDuplicates(),
      autoClickEnabled: autoClickEnabled(),
      automationOff: tree.automationOff(),
      autoRankCharacterIds: autoRankCharacterIds(),
      abilityPolicy: abilityPolicy(),
      abilityLastUsed: abilityLastUsed(),
      activeChallengeId: activeChallengeId(),
      completedChallengeIds: completedChallengeIds(),
      runStartedAt: runStartedAt(),
      runAchievementBaseline: runAchievementBaseline(),
      towerFloors: tower.towerFloors(),
      towerSquadIds: tower.towerSquadIds(),
      towerClaimed: tower.towerClaimed(),
      towerCycleStartedAt: tower.towerCycleStartedAt(),
    };
  }

  /**
   * Writing, exporting, importing and restoring — see `store/saveIO.ts`. It is handed
   * `buildSaveFile` rather than owning any state, and `syncPortalDamage` as the one thing a write
   * has to catch up with first.
   */
  const saveIO = createSaveIO({ buildSaveFile, beforeWrite: syncPortalDamage });
  const { hasBackupSave, lastSavedAt, save, exportSave, importSave, restoreBackup } = saveIO;

  /** Wipes the save and every bit of progress, prestige and worlds included. */
  function hardReset() {
    clearSaveSlots();
    saveIO.forgetBackup();
    setCurrency(0);
    setLifetimeEarned(0);
    roster.resetAll();
    abilities.reset();
    setPrestige(createInitialPrestigeState());
    worlds.reset();
    inventory.resetAll();
    setArcKills({});
    setClearedArcIds([]);
    setActiveArcId(null);
    setBossRetreatArcIds([]);
    achievements.reset();
    setRunStartedAt(Date.now());
    setLastPrestigeReport(null);
    tree.reset();
    setKillsSinceDrop({});
    setAutoClickAccumMs(0);
    setAutoRankCharacterIds([]);
    setAutoAbilityAccumMs(0);
    setActiveChallengeId(null);
    setCompletedChallengeIds([]);
    cancelPendingAutomation();
    setKillBudget(MAX_KILLS_PER_SECOND);
    setCrossoverCrystals(0);
    setCrossoverUntil(0);
    setWorldPoints({});
    // Les portails partent avec le reste, comme dans `prestigeReset` : sinon le joueur reste dans
    // le combat qu'il vient d'effacer, et la prochaine sauvegarde automatique réécrit `portalHp` /
    // `portalDamage` dans un fichier censé être neuf.
    portals.reset();
    // La Tour est de la méta-progression : elle ne bouge pas au prestige, seul l'effacement total
    // la remet à zéro — étages, escouade, paliers réclamés et cycle compris.
    tower.reset();
    setEnemy(null);
    // Rien ne reste en face du joueur, donc rien ne doit garder d'horloge : `checkTimer` tournerait
    // sur l'échéance du combat qu'on vient d'effacer.
    setTimerDeadline(null);
    setTimerTotal(null);
  }

  const purchaseTreeLevel = tree.purchaseLevel;

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
    // Le cycle de 15 jours de la Tour est vérifié une fois par tick : c'est le seul endroit du jeu
    // qui lise une date réelle, et il ne fait rien tant qu'aucun cycle entier n'est passé.
    tower.refreshCycle();
    // La Tour prend la main sur le combat pendant qu'on y grimpe : l'arc reste exactement où il
    // était, et ce sont les cinq personnages de l'escouade qui frappent, pas l'équipe entière.
    if (tower.inTower()) {
      tower.towerHit(tower.towerSquadDps() * deltaSeconds, "teamDps");
      tower.towerCheckTimer(nowMs);
    } else {
      dealDamage(teamDps() * deltaSeconds, "teamDps");
      checkTimer(nowMs);
    }
    // A portal only has to survive a reload, so its progress is written back once a tick.
    syncPortalDamage();

    if (autoClickLevel() > 0 && autoClickEnabled() && !clickIsMuted(challengeRules(), ownedCharacterIds().length)) {
      // Levels buy cadence, not strength: every automatic click lands at full click power, they
      // just come closer together — see `autoClickIntervalMs`.
      const interval = autoClickInterval();
      const accumMs = autoClickAccumMs() + deltaMs;
      if (accumMs >= interval) {
        const damage = clickPower();
        const dealt = tower.inTower() ? tower.towerHit(damage, "click") : dealDamage(damage, "click");
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
    // Both moves below belong to the arc; while the player stands in a portal they would walk the
    // arc out from under them. Skipped, not cancelled: they fire again on the way out.
    const inPortal = activePortalId() !== null;

    const advanceAt = autoAdvanceAt();
    if (!inPortal && advanceAt !== null && nowMs >= advanceAt) {
      setAutoAdvanceAt(null);
      // `stepArc` walks `playableArcs`; at the end of a world there is nothing to step to, and the
      // next world stays the player's call — it costs prestige points, or the run itself.
      if (automationRuns("advance") && stepArc(1)) {
        pushNotice("arc", `Relève : direction ${activeArc()?.name ?? "?"}`);
      }
    }

    const rematchAt = autoRematchAt();
    if (!inPortal && rematchAt !== null && nowMs >= rematchAt) {
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

    noticeQueue.prune(nowMs);
    // Same shape, and the one thing that keeps `allModifiers` off the clock honest: the fold
    // already ignores an expired buff to the millisecond, but nothing else would ever take it back
    // out of the list, and `modifiersByScope` would carry every ability ever fired this run.
    if (abilities.pruneExpiredBuffs(nowMs)) {
      setStatClock(nowMs);
    } else if (nowMs - statClock() >= STAT_CLOCK_MS) {
      setStatClock(nowMs);
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
      abilities.shiftBy(offset);
      noticeQueue.shiftBy(offset);
      setNow(pausedAt);
      setStatClock(pausedAt);
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
    evolutionStageOf,
    activeEvolutionOf,
    isEvolutionUnlocked,
    clickPower,
    narratorBase,
    teamDps,
    foundItems,
    countOf,
    forgeableUniques,
    forgeableNowIds,
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
    rankablePassiveIds,
    firstAffordablePassive,
    rankUpPassive,
    characterEquipment,
    equippedItemOf,
    wearerOf,
    canEquipItem,
    animeOfItem,
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
    arcPortalRecruit,
    portalTargets,
    portalCostOf,
    portalIsOpen,
    openPortal,
    enterPortal,
    leavePortal,
    activePortalId,
    // La Tour de l'Ascension (`store/tower.ts`, `docs/tower.md`)
    towerModes: TOWER_MODES,
    towerModeOf: tower.towerModeOf,
    towerCycle: tower.towerCycle,
    towerHighestFloorOf: tower.towerHighestFloorOf,
    towerRewardClaimed: tower.towerRewardClaimed,
    towerSquad: tower.towerSquad,
    towerSquadIds: tower.towerSquadIds,
    towerSquadDps: tower.towerSquadDps,
    towerSquadReady: tower.towerSquadReady,
    toggleTowerSquadMember: tower.toggleTowerSquadMember,
    inTower: tower.inTower,
    towerActiveMode: tower.towerActiveMode,
    towerFloor: tower.towerFloor,
    towerRound: tower.towerRound,
    towerUnitsDone: tower.towerUnitsDone,
    towerEnemy: tower.towerEnemy,
    towerHpLeft: tower.towerHpLeft,
    towerMaxHp: tower.towerMaxHp,
    towerTimeLeft: tower.towerTimeLeft,
    towerBossTimeLeft: tower.towerBossTimeLeft,
    towerOnBoss: tower.towerOnBoss,
    towerLastFailure: tower.towerLastFailure,
    enterTower: tower.enterTower,
    leaveTower: tower.leaveTower,
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
    difficultyOfArc,
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
