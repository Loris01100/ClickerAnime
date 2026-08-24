import { createMemo, createSignal, onCleanup } from "solid-js";
import { achievementContributions } from "./achievements";
import { computeEffectiveStat, pruneExpired, replaceModifiersByTarget } from "./modifiers";
import {
  applyPrestige,
  PRESTIGE_SCALE,
  calculatePrestigeGain,
  canUnlockAnime,
  createInitialPrestigeState,
  unlockAnime as unlockAnimeState,
} from "./prestige";
import { characterContributions, defaultSynergyConfig, synergyMultiplier } from "./synergy";
import {
  CROSSOVER_BOSS_REWARD,
  CROSSOVER_COST,
  CROSSOVER_DURATION_MS,
  CROSSOVER_MOB_CHANCE,
  crossoverSynergyConfig,
  isMixedTeam,
} from "./crossover";
import { abilitiesShareType, abilityTargets, cooldownRemaining, getUnlockedAbilities, isAbilityReady } from "./abilities";
import { enemyHp, enemyReward, nextEnemy, pendingRecruits, rollsDrop, timeToKillMs } from "./combat";
import { canBuyShopOffer, discountedShopCost, shopOfferUnlocked } from "./shop";
import { drawPack, duplicateGrowth, packPool, PACK_COST, POINTS_PER_KILL } from "./packs";
import {
  levelFromXp,
  levelGrowth,
  narratorClickPower,
  passiveUpgrade,
  PASSIVE_LEVEL_CAP,
  XP_GROWTH,
  XP_PER_KILL_REWARD,
  xpProgress,
} from "./growth";
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
  autoClickIntervalMs,
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
  ComboDefinition,
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
  combos: ComboDefinition[];
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
  kind: "item" | "recruit" | "arc";
  text: string;
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
// v10: added characterEquipment (Record<characterId, itemId>) for equippable unique items.
const SAVE_KEY = "clicker-anime:save:v10";
/** Written into every save as `SaveFile.version` — see there before bumping `SAVE_KEY` again. */
const SAVE_VERSION = 10;

interface SaveFile {
  /**
   * Shape version, carried inside the save rather than only in `SAVE_KEY`. A key bump means every
   * existing player is wiped (the old key is never read again); a version field means the next
   * breaking change can be *migrated* in `readSave` instead. Absent on any save written before this
   * field existed, which `readSave` treats as `SAVE_VERSION` — those are v10 by definition, since
   * the key they live under says so.
   */
  version?: number;
  currency: number;
  lifetimeEarned: number;
  ownedCharacterIds: string[];
  activeArcId: string | null;
  prestigePoints: number;
  unlockedAnimeIds: string[];
  arcKills: Record<string, number>;
  clearedArcIds: string[];
  characterXp: Record<string, number>;
  itemCounts: Record<string, number>;
  passiveRanks: Record<string, number>;
  evolvedCharacterIds: string[];
  /** absent on a save from before achievements existed; every reader defaults it to {} */
  achievementCounts?: Record<string, number>;
  /** absent on a save from before the prestige tree existed; every reader defaults it to {} */
  prestigeTreeRanks?: Record<string, number[]>;
  /** absent on a save from before equipment existed; every reader defaults it to {} */
  characterEquipment?: Record<string, string>;
  /** absent on a save from before crossover crystals existed; every reader defaults it to 0 */
  crossoverCrystals?: number;
  /** pack points held per world; absent on an older save, defaults to {} */
  worldPoints?: Record<string, number>;
  /** pack copies held per character; absent on an older save, defaults to {} */
  characterDuplicates?: Record<string, number>;
  /** whether the bought autoclicker runs; absent on an older save, defaults to on */
  autoClickEnabled?: boolean;
}

const isNumber = (v: unknown) => typeof v === "number" && Number.isFinite(v);
const isStringArray = (v: unknown) => Array.isArray(v) && v.every((e) => typeof e === "string");
/** A plain `Record<string, T>` — rejects arrays and null, which `typeof === "object"` would let through. */
function isRecordOf(v: unknown, valueOk: (value: unknown) => boolean): boolean {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  return Object.values(v as Record<string, unknown>).every(valueOk);
}

/**
 * Full shape check, not a smoke test: `importSave` feeds this an arbitrary file the player supplied,
 * and whatever passes is written straight to `localStorage` before a reload — a half-checked blob
 * would persist a broken run the player can't get out of without a hard reset.
 *
 * What it enforces is the *type* of every field that is present, not the presence of every field:
 * each reader below already defaults a missing one (`saved?.x ?? []`), which is what lets a save
 * written by an older build still load. A field of the wrong type is the one thing those defaults
 * can't absorb — `arcKills: "abc"` sails past `?? {}` and poisons the run.
 */
function isValidSave(value: unknown): value is SaveFile {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const c = value as Record<string, unknown>;
  const opt = (v: unknown, ok: (value: unknown) => boolean) => v === undefined || ok(v);

  // The two that identify the blob as a save at all.
  if (!isNumber(c.currency) || !isStringArray(c.ownedCharacterIds)) return false;

  return (
    opt(c.version, isNumber) &&
    opt(c.lifetimeEarned, isNumber) &&
    opt(c.prestigePoints, isNumber) &&
    opt(c.crossoverCrystals, isNumber) &&
    opt(c.activeArcId, (v) => v === null || typeof v === "string") &&
    opt(c.unlockedAnimeIds, isStringArray) &&
    opt(c.clearedArcIds, isStringArray) &&
    opt(c.evolvedCharacterIds, isStringArray) &&
    opt(c.arcKills, (v) => isRecordOf(v, isNumber)) &&
    opt(c.characterXp, (v) => isRecordOf(v, isNumber)) &&
    opt(c.itemCounts, (v) => isRecordOf(v, isNumber)) &&
    opt(c.passiveRanks, (v) => isRecordOf(v, isNumber)) &&
    opt(c.achievementCounts, (v) => isRecordOf(v, isNumber)) &&
    opt(c.worldPoints, (v) => isRecordOf(v, isNumber)) &&
    opt(c.characterDuplicates, (v) => isRecordOf(v, isNumber)) &&
    opt(c.autoClickEnabled, (v) => typeof v === "boolean") &&
    opt(c.characterEquipment, (v) => isRecordOf(v, (id) => typeof id === "string")) &&
    opt(c.prestigeTreeRanks, (v) =>
      isRecordOf(v, (levels) => Array.isArray(levels) && levels.every(isNumber))
    )
  );
}

function readSave(): SaveFile | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVE_KEY) ?? "null");
    if (!isValidSave(parsed)) return null;
    // Migration v9: the "resource" prestige branch was renamed to "destin". Copy old progress over
    // so players don't lose their bought levels when the branch identity changed.
    if (parsed.prestigeTreeRanks && "resource" in parsed.prestigeTreeRanks && !("destin" in parsed.prestigeTreeRanks)) {
      parsed.prestigeTreeRanks = { ...parsed.prestigeTreeRanks, destin: parsed.prestigeTreeRanks.resource };
      delete parsed.prestigeTreeRanks.resource;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function createGameStore(data: GameData) {
  const saved = readSave();

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
  const [passiveRanks, setPassiveRanks] = createSignal<Record<string, number>>(saved?.passiveRanks ?? {});
  const [evolvedCharacterIds, setEvolvedCharacterIds] = createSignal<string[]>(saved?.evolvedCharacterIds ?? []);
  // Lifetime totals for the achievement ladders (see achievements.ts) — never decrease and, unlike
  // the rest of a run, survive prestigeReset; only hardReset wipes them.
  const [achievementCounts, setAchievementCounts] = createSignal<Record<string, number>>(
    saved?.achievementCounts ?? {}
  );
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
  // Kills `dealDamage` may still resolve, refilled by the tick at MAX_KILLS_PER_SECOND and capped
  // there so an idle stretch banks no burst. Transient like the rest of combat state.
  const [killBudget, setKillBudget] = createSignal(MAX_KILLS_PER_SECOND);
  // characterId -> itemId for equipped unique items.
  const [characterEquipment, setCharacterEquipment] = createSignal<Record<string, string>>(
    saved?.characterEquipment ?? {}
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
  const [abilityLastUsed, setAbilityLastUsed] = createSignal<Record<string, number>>({});
  // Same-stat abilities can't fire while another's buff on that stat is still up — see
  // activateAbility. `by` names the ability responsible, so the bar can say why a button is dead.
  const [abilityBlockedUntil, setAbilityBlockedUntil] = createSignal<
    Record<string, { until: number; by: string }>
  >({});

  // Transient feed of "you just gained something" events — the HUD pops them up (see ui/Notices.tsx)
  // because a drop, a recruit or a cleared arc otherwise happen in complete silence. Pruned by the
  // main tick rather than a timer per notice, so no stray timeout outlives the store.
  const [notices, setNotices] = createSignal<Notice[]>([]);
  let noticeId = 0;
  function pushNotice(kind: Notice["kind"], text: string) {
    setNotices((list) =>
      [...list, { id: noticeId++, kind, text, expiresAt: Date.now() + NOTICE_MS }].slice(-MAX_NOTICES)
    );
  }
  const dismissNotice = (id: number) => setNotices((list) => list.filter((n) => n.id !== id));

  // Combat is transient: the current fight restarts from scratch on reload rather than being saved.
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
    return true;
  }

  const activeArc = createMemo<Arc | null>(() => data.arcs.find((a) => a.id === activeArcId()) ?? null);

  const unlockedAnimes = createMemo(() => data.animes.filter((a) => prestige().unlockedAnimeIds.includes(a.id)));

  const ownedCharacters = createMemo(() => data.characters.filter((c) => ownedCharacterIds().includes(c.id)));

  /** True once this character has grown into their evolution — permanent for the rest of the run. */
  const isEvolved = (character: Character) => evolvedCharacterIds().includes(character.id);

  const xpOf = (characterId: string) => characterXp()[characterId] ?? 0;

  /** Levels are read off accumulated xp rather than stored, so the two can never drift apart. */
  const levelOf = (characterId: string) => levelFromXp(xpOf(characterId), effectiveXpGrowth());

  const progressOf = (characterId: string) => xpProgress(xpOf(characterId), effectiveXpGrowth());

  /** Items found this run; wiped by a prestige along with the ranks they bought. Commons stack. */
  const foundItems = createMemo(() => data.items.filter((i) => (itemCounts()[i.id] ?? 0) > 0));

  const countOf = (itemId: string) => itemCounts()[itemId] ?? 0;

  /** The unique item currently equipped by a character, if any. */
  function equippedItemOf(character: Character): Item | null {
    const itemId = characterEquipment()[character.id];
    if (!itemId) return null;
    const item = data.items.find((i) => i.id === itemId);
    return item && item.kind === "unique" ? item : null;
  }

  /** Whether this item can be equipped on this character (ownership and restriction checks). */
  function canEquipItem(character: Character, itemId: string): boolean {
    const item = data.items.find((i) => i.id === itemId);
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
    const character = data.characters.find((c) => c.id === characterId);
    const item = data.items.find((i) => i.id === itemId);
    if (!character || !item || item.kind !== "unique") return false;
    if (!canEquipItem(character, itemId)) return false;
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

  const allModifiers = createMemo<ActiveModifier[]>(() => {
    const arc = activeArc();
    const config = activeSynergyConfig();
    const equipment = characterEquipment();
    const equipmentOf = (c: Character) => {
      const itemId = equipment[c.id];
      const item = itemId ? data.items.find((i) => i.id === itemId) : undefined;
      return item && item.kind === "unique" ? [item] : [];
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
        duplicatesOf(c.id)
      )
    );
    return [
      ...fromCharacters,
      ...achievementContributions(achievementCounts()),
      ...prestigeTreeContributions(prestigeTreeRanks()),
      ...pruneExpired(temporaryModifiers(), now()),
    ];
  });

  /** What one narrator click is worth before any modifier: just the allies standing at their side. */
  const narratorBase = createMemo(() => narratorClickPower(ownedCharacterIds().length));

  /**
   * The arc a character is met in — the one whose common item feeds their passive.
   * Declared as functions, not consts: `allModifiers` is a memo created above and Solid runs it
   * straight away, so anything it reads must already be hoisted.
   */
  function originArcOf(character: Character): Arc | null {
    return (
      data.arcs.find(
        (a) => a.boss.characterId === character.id || a.mobs.some((m) => m.characterId === character.id)
      ) ?? null
    );
  }

  /** The common item that ranks up this character's passive, i.e. the one their home arc drops. */
  function passiveItemOf(character: Character): Item | null {
    const arc = originArcOf(character);
    const itemId = arc?.mobs.find((m) => m.itemId)?.itemId;
    return data.items.find((i) => i.id === itemId) ?? null;
  }

  function passiveCopiesOf(character: Character): number {
    const item = passiveItemOf(character);
    return item ? countOf(item.id) : 0;
  }

  /** The common item an arc drops — what the "Objets" tree's pity timer and ghost loot hand out. */
  function arcCommonItem(arc: Arc): Item | null {
    const itemId = arc.mobs.find((m) => m.itemId)?.itemId;
    return data.items.find((i) => i.id === itemId) ?? null;
  }

  /** Damage of one narrator click. */
  const clickPower = createMemo(() => computeEffectiveStat(narratorBase(), "clickPower", allModifiers(), now()));
  /** Damage the team deals on its own, per second. */
  const teamDps = createMemo(() => computeEffectiveStat(0, "teamDps", allModifiers(), now()));

  const unlockedAbilities = createMemo(() =>
    getUnlockedAbilities(ownedCharacterIds(), data.characters, data.combos, evolvedCharacterIds())
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
      .map((id) => data.characters.find((c) => c.id === id))
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
    const reward = currencyLevel > 0 ? baseReward * (1 + CURRENCY_GAIN_PERCENT * currencyLevel) : baseReward;
    setCurrency((c) => c + reward);
    setLifetimeEarned((l) => l + reward);
    // Pack points are per world and flat: one per fight won, wherever it was won.
    setWorldPoints((points) => ({ ...points, [arc.animeId]: (points[arc.animeId] ?? 0) + POINTS_PER_KILL }));

    const isNewRecruit = !!target.characterId && !ownedCharacterIds().includes(target.characterId);
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
    // xp is a multiple of the currency reward — see XP_PER_KILL_REWARD — so it scales with the
    // world just like currency does, only harder.
    const xpAmount = reward * XP_PER_KILL_REWARD * (isBoss && bossXpLevel > 0 ? 1 + BOSS_XP_BOOST * bossXpLevel : 1);
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
        pushNotice("arc", `${arc.name} terminé`);
      }
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
    if (item.kind === "common") bumpAchievement("commonItemsCollected");
    pushNotice("item", `${item.name} +1`);
  }

  /**
   * Uniques are one copy only; commons stack, so farming a zone keeps paying into the click. Beyond
   * the base roll, the "Objets" tree can boost the drop chance (node 1), roll a bonus copy (node 3),
   * force a drop after a dry streak (node 4, tracked in `killsSinceDrop`) and let an item-less enemy
   * still hand over the arc's common at low odds (node 5).
   */
  function maybeDropItem(target: Enemy, arc: Arc) {
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
      if (rollsDrop({ ...target, dropChance: boostedChance }, Math.random())) {
        const item = data.items.find((i) => i.id === target.itemId);
        if (item && !(item.kind === "unique" && countOf(item.id) > 0)) {
          grantItem(item);
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
   * overkill is simply discarded rather than felling more enemies. One kill is always allowed
   * whatever the budget, so a fight can never stall at 0 hp waiting for it to refill.
   */
  function dealDamage(amount: number) {
    if (!enemy() || amount <= 0) return 0;
    let remaining = amount;
    const allowance = Math.min(MAX_KILLS_PER_HIT, Math.max(1, Math.floor(killBudget())));
    let spent = 0;
    for (let i = 0; i < allowance; i++) {
      const target = enemy();
      if (!target || remaining <= 0) break;
      const left = enemyHpLeft() - remaining;
      if (left > 0) {
        setEnemyHpLeft(left);
        break;
      }
      remaining = -left;
      spent++;
      defeat(target);
    }
    if (spent > 0) setKillBudget((budget) => budget - spent);
    return amount;
  }

  /**
   * The narrator's click. Beyond raw damage, the "Clic du Narrateur" tree can crit (node 3), shave
   * time off every unlocked ability's cooldown (node 4), and has a small chance to fire one of them
   * for free (node 5).
   */
  function click() {
    const critLevel = nodeLevelOf("narratorClick", 3);
    const crit = critLevel > 0 && Math.random() < scaledChance(CRIT_CHANCE, critLevel);
    const dealt = dealDamage(crit ? clickPower() * CRIT_MULTIPLIER : clickPower());

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
          if (at !== undefined && nowMs - at < unlocked.ability.cooldownMs) {
            next[unlocked.ability.id] = at - reduction;
          }
        }
        return next;
      });
    }

    const freeTriggerLevel = nodeLevelOf("narratorClick", 5);
    if (freeTriggerLevel > 0 && Math.random() < scaledChance(FREE_ABILITY_TRIGGER_CHANCE, freeTriggerLevel)) {
      // Only abilities whose stats are free right now: `triggerAbilityEffects` goes through
      // `replaceModifiersByTarget`, so firing one over a running buff on the same stat *replaces*
      // it — a random weak proc could cut a x3 combo short. A perk must never make the player weaker.
      const busy = new Set(pruneExpired(temporaryModifiers(), Date.now()).map((m) => m.target));
      const candidates = unlockedAbilities().filter((u) =>
        abilityTargets(u.ability).every((target) => !busy.has(target))
      );
      if (candidates.length > 0) {
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        triggerAbilityEffects(pick.ability);
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
    }
    setLastTimeout(nowMs);
    spawnNext();
  }

  /** Time the team needs to fell the enemy in front of it right now — `Infinity` at 0 dps. */
  const timeToKill = createMemo(() => timeToKillMs(enemyHpLeft(), teamDps()));

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
    const config = activeSynergyConfig();
    const dps = ownedCharacters().reduce(
      (sum, c) =>
        sum +
        c.baseDps * damageGrowthOf(c.id) * synergyMultiplier(c, arc, config, isEvolved(c)),
      0
    );
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
   * Spends the origin item to buy the next rank of a character's passive. Refuses on a character
   * who isn't in the team: `characterContributions` only ever runs on owned characters, so the
   * copies would be burnt for nothing (the item Codex lists the whole cast, met or not).
   */
  function rankUpPassive(character: Character): boolean {
    if (!ownedCharacterIds().includes(character.id)) return false;
    const item = passiveItemOf(character);
    const upgrade = passiveUpgradeOf(character);
    if (!item || !upgrade.affordable) return false;
    setItemCounts((counts) => ({ ...counts, [item.id]: (counts[item.id] ?? 0) - upgrade.cost }));
    setPassiveRanks((ranks) => ({ ...ranks, [character.id]: upgrade.rank + 1 }));
    return true;
  }

  const worldPointsOf = (animeId: string) => worldPoints()[animeId] ?? 0;

  /** Pack copies held of a character. A function declaration, so `allModifiers` can hoist it. */
  function duplicatesOf(characterId: string): number {
    return characterDuplicates()[characterId] ?? 0;
  }

  /**
   * What multiplies a character's printed base damage right now: levels and pack duplicates,
   * stacked exactly as `characterContributions` does it. Lives here rather than in a component so
   * the roster and the Codex can never print two different numbers for the same character.
   */
  function damageGrowthOf(characterId: string): number {
    return levelGrowth(levelOf(characterId)) * duplicateGrowth(duplicatesOf(characterId));
  }

  /** The world's cast a pack of that rarity can draw from — empty means the pack can't be bought. */
  const packPoolOf = (animeId: string, rarity: Rarity) => packPool(data.characters, animeId, rarity);

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
    return drawn;
  }

  /** Every shop offer with the display state (locked/owned/affordable) the panel needs. */
  function shopOffers() {
    const clearedIds = clearedAnimes().map((a) => a.id);
    const shopDiscount = nodeLevelOf("destin", 4) > 0 ? scaledDiscount(SHOP_COST_DISCOUNT, nodeLevelOf("destin", 4)) : 0;
    return (data.shop ?? []).map((offer) => ({
      offer,
      item: offer.kind === "item" ? data.items.find((i) => i.id === offer.targetId) : undefined,
      character: offer.kind === "character" ? data.characters.find((c) => c.id === offer.targetId) : undefined,
      owned: offer.kind === "character" && ownedCharacterIds().includes(offer.targetId),
      locked: !shopOfferUnlocked(offer, clearedIds),
      affordable: canBuyShopOffer(offer, currency(), clearedIds, ownedCharacterIds(), shopDiscount),
    }));
  }

  /** Spends the main currency on a shop offer: copies of an item, or a character not owned yet. */
  function buyShopOffer(offerId: string): boolean {
    const offer = (data.shop ?? []).find((o) => o.id === offerId);
    if (!offer) return false;
    const shopDiscount = nodeLevelOf("destin", 4) > 0 ? scaledDiscount(SHOP_COST_DISCOUNT, nodeLevelOf("destin", 4)) : 0;
    const cost = discountedShopCost(offer, shopDiscount);
    if (!canBuyShopOffer(offer, currency(), clearedAnimes().map((a) => a.id), ownedCharacterIds(), shopDiscount)) return false;

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
    const arc = data.arcs.find((a) => a.id === arcId);
    if (!arc || !prestige().unlockedAnimeIds.includes(arc.animeId)) return false;
    if (!arcOpen(arc)) return false;
    setActiveArcId(arcId);
    spawnNext();
    return true;
  }

  /** True once a rematch against this arc's boss is on offer: the player retreated from it before. */
  const bossChallengeable = (arc: Arc) => !arcCleared(arc) && hasRetreatedFromBoss(arc);

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
    const required = data.animes.find((a) => a.id === animeId)?.requiresAnimeId;
    if (!required || animeAvailable(animeId)) return null;
    return data.animes.find((a) => a.id === required) ?? null;
  }

  /** Free move into a new anime: the first pick of the run, or a new world after clearing the last. */
  function travelTo(animeId: string) {
    if (prestige().unlockedAnimeIds.includes(animeId)) return false;
    if (!data.animes.some((a) => a.id === animeId)) return false;
    if (!animeAvailable(animeId)) return false;
    if (!canTravel()) return false;
    setPrestige((p) => ({ ...p, unlockedAnimeIds: [...p.unlockedAnimeIds, animeId] }));
    setActiveArcId(arcsOf(animeId)[0]?.id ?? null);
    spawnNext();
    return true;
  }

  /** Paid shortcut: enter an anime early, without having finished the current one. */
  function unlockAnime(animeId: string) {
    const anime = data.animes.find((a) => a.id === animeId);
    if (!anime || !animeAvailable(animeId)) return false;
    const cost = anime.unlockCost;
    if (!canUnlockAnime(prestige(), animeId, cost)) return false;
    setPrestige((p) => unlockAnimeState(p, animeId, cost));
    // Same landing as `travelTo`: paying to enter a world puts the player *in* it, rather than
    // leaving them in the old arc wondering what the points bought.
    setActiveArcId(arcsOf(animeId)[0]?.id ?? null);
    spawnNext();
    return true;
  }

  /**
   * An ability's effects, ready to drop into `temporaryModifiers`. The "DPS Équipe" tree can boost
   * a percent/multiplier effect's magnitude (node 2) and stretch its duration (node 4) — flat
   * effects are left alone since "damage boost" is meant to read as a percent, not a flat bump.
   */
  function buildAbilityModifiers(ability: AbilityDefinition): ActiveModifier[] {
    const nowMs = Date.now();
    const damageBoostLevel = nodeLevelOf("teamDps", 2);
    const durationLevel = nodeLevelOf("teamDps", 4);
    const duration =
      durationLevel > 0 ? ability.durationMs * (1 + ABILITY_DURATION_BOOST * durationLevel) : ability.durationMs;
    return ability.effects.map((effect) => ({
      ...effect,
      value: damageBoostLevel > 0 ? boostedAbilityValue(effect, damageBoostLevel) : effect.value,
      sourceId: ability.id,
      expiresAt: nowMs + duration,
    }));
  }

  function boostedAbilityValue(effect: ModifierTemplate, level: number): number {
    const boost = ABILITY_DAMAGE_BOOST * level;
    if (effect.kind === "percent") return effect.value * (1 + boost);
    if (effect.kind === "multiplier") return 1 + (effect.value - 1) * (1 + boost);
    return effect.value;
  }

  /** Applies an ability's effects without touching its cooldown — the "Clic du Narrateur" tier 5 freebie. */
  function triggerAbilityEffects(ability: AbilityDefinition) {
    setTemporaryModifiers((existing) => replaceModifiersByTarget(existing, buildAbilityModifiers(ability)));
  }

  function activateAbility(abilityId: string) {
    const unlocked = unlockedAbilities().find((u) => u.ability.id === abilityId);
    if (!unlocked) return false;

    const nowMs = Date.now();
    if (!isAbilityReady(abilityLastUsed()[abilityId], unlocked.ability.cooldownMs, nowMs)) return false;
    if ((abilityBlockedUntil()[abilityId]?.until ?? 0) > nowMs) return false;

    triggerAbilityEffects(unlocked.ability);
    setAbilityLastUsed((used) => ({ ...used, [abilityId]: nowMs }));
    // Abilities that touch the same stat can't be fired while this one's buff is still up: activating
    // one would immediately cut the other's effect short anyway (`replaceModifiersByTarget`), so lock
    // them for the buff's duration — not its cooldown, which keeps running on its own, untouched.
    // `by` is carried alongside so the bar can name the ability responsible instead of just greying
    // the button out with no explanation.
    const lockedUntil = nowMs + unlocked.ability.durationMs;
    const sameType = unlockedAbilities().filter(
      (u) => u.ability.id !== abilityId && abilitiesShareType(u.ability, unlocked.ability)
    );
    setAbilityBlockedUntil((blocked) => {
      const next = { ...blocked };
      for (const u of sameType) next[u.ability.id] = { until: lockedUntil, by: unlocked.ability.name };
      return next;
    });
    bumpAchievement("abilitiesUsed");
    return true;
  }

  function abilityCooldownRemaining(abilityId: string): number {
    const cooldownMs = unlockedAbilities().find((u) => u.ability.id === abilityId)?.ability.cooldownMs ?? 0;
    const cd = cooldownRemaining(abilityLastUsed()[abilityId], cooldownMs, now());
    return Math.max(cd, abilityBlockRemaining(abilityId));
  }

  /** How long this ability stays locked out by another one's buff, and which — for the tooltip. */
  function abilityBlockRemaining(abilityId: string): number {
    return Math.max(0, (abilityBlockedUntil()[abilityId]?.until ?? 0) - now());
  }

  function abilityBlockedBy(abilityId: string): string | null {
    return abilityBlockRemaining(abilityId) > 0 ? (abilityBlockedUntil()[abilityId]?.by ?? null) : null;
  }

  /** Buffs running right now, strongest first — what the ability bar shows as the live stack. */
  const activeBuffs = createMemo(() => {
    const live = pruneExpired(temporaryModifiers(), now());
    return [...new Set(live.map((m) => m.sourceId))];
  });

  /**
   * Sends the run back to square one: currency, team, xp, worlds entered, arcs cleared, items and
   * passive ranks all go. Only the prestige points survive — plus the meta-progression the run
   * never owned: achievement counts, tree levels, and the pack points and duplicates (see packs.ts).
   * The whole point is to redo the climb faster.
   */
  function prestigeReset() {
    // "Destin" node 5: a chance to double the points this reset banks, scaling with its level.
    const doubleLevel = nodeLevelOf("destin", 5);
    const gainMultiplier = doubleLevel > 0 && Math.random() < scaledChance(DOUBLE_PRESTIGE_CHANCE, doubleLevel) ? 2 : 1;
    setPrestige((p) => applyPrestige(p, lifetimeEarned(), prestigeScale(), runCompletion(), gainMultiplier));
    setCurrency(0);
    setLifetimeEarned(0);
    setOwnedCharacterIds([]);
    setCharacterXp({});
    setTemporaryModifiers([]);
    setAbilityLastUsed({});
    setAbilityBlockedUntil({});
    setItemCounts({});
    setPassiveRanks({});
    setArcKills({});
    setClearedArcIds([]);
    setActiveArcId(null);
    setBossRetreatArcIds([]);
    setEvolvedCharacterIds([]);
    setCharacterEquipment({});
    setKillsSinceDrop({});
    setAutoClickAccumMs(0);
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
      passiveRanks: passiveRanks(),
      evolvedCharacterIds: evolvedCharacterIds(),
      achievementCounts: achievementCounts(),
      prestigeTreeRanks: prestigeTreeRanks(),
      characterEquipment: characterEquipment(),
      crossoverCrystals: crossoverCrystals(),
      worldPoints: worldPoints(),
      characterDuplicates: characterDuplicates(),
      autoClickEnabled: autoClickEnabled(),
    };
  }

  function save() {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(SAVE_KEY, JSON.stringify(buildSaveFile()));
    setLastSavedAt(Date.now());
  }

  /** A portable blob the player can download and hand back later — same shape `readSave` already trusts. */
  function exportSave(): string {
    return btoa(JSON.stringify(buildSaveFile()));
  }

  /**
   * Loads a blob produced by `exportSave`. Writing straight to localStorage and reloading is the
   * simplest way to get every signal back in sync, rather than exposing a setter per field here.
   */
  function importSave(text: string): boolean {
    try {
      const parsed: unknown = JSON.parse(atob(text.trim()));
      if (!isValidSave(parsed)) return false;
      if (typeof localStorage !== "undefined") localStorage.setItem(SAVE_KEY, JSON.stringify(parsed));
      if (typeof location !== "undefined") location.reload();
      return true;
    } catch {
      return false;
    }
  }

  /** Wipes the save and every bit of progress, prestige and worlds included. */
  function hardReset() {
    if (typeof localStorage !== "undefined") localStorage.removeItem(SAVE_KEY);
    setCurrency(0);
    setLifetimeEarned(0);
    setOwnedCharacterIds([]);
    setTemporaryModifiers([]);
    setAbilityLastUsed({});
    setAbilityBlockedUntil({});
    setPrestige(createInitialPrestigeState());
    setCharacterXp({});
    setItemCounts({});
    setPassiveRanks({});
    setArcKills({});
    setClearedArcIds([]);
    setActiveArcId(null);
    setBossRetreatArcIds([]);
    setEvolvedCharacterIds([]);
    setAchievementCounts({});
    setPrestigeTreeRanks({});
    setCharacterEquipment({});
    setKillsSinceDrop({});
    setAutoClickAccumMs(0);
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

  const interval = setInterval(() => {
    const nowMs = Date.now();
    // Clamped: a sleeping machine or a throttled tab must not bank hours of damage and xp on the
    // first tick back — see MAX_TICK_DELTA_MS.
    const deltaMs = Math.min(nowMs - now(), MAX_TICK_DELTA_MS);
    const deltaSeconds = deltaMs / 1000;
    setNow(nowMs);
    // Refill before spending, and never above the cap: banking an idle minute into one burst would
    // hand back exactly the spike this budget exists to remove.
    setKillBudget((budget) => Math.min(MAX_KILLS_PER_SECOND, budget + deltaSeconds * MAX_KILLS_PER_SECOND));
    dealDamage(teamDps() * deltaSeconds);
    checkTimer(nowMs);

    const autoClickLevel = nodeLevelOf("narratorClick", 2);
    if (autoClickLevel > 0 && autoClickEnabled()) {
      // Levels buy cadence, not strength: every automatic click lands at full click power, they
      // just come closer together — see `autoClickIntervalMs`.
      const interval = autoClickInterval();
      const accumMs = autoClickAccumMs() + deltaMs;
      if (accumMs >= interval) {
        const damage = clickPower();
        dealDamage(damage);
        // Announced, not just dealt: an autoclick that lands in silence is indistinguishable from a
        // perk that isn't working. `ClickStage` turns each pulse into a damage pop-up of its own.
        setAutoClickPulse({ id: autoClickPulse().id + 1, damage });
        setAutoClickAccumMs(accumMs % interval);
      } else {
        setAutoClickAccumMs(accumMs);
      }
    }

    const xpTrickleLevel = nodeLevelOf("xp", 2);
    if (xpTrickleLevel > 0 && ownedCharacterIds().length > 0) {
      grantXp(XP_PASSIVE_PER_SECOND * xpTrickleLevel * deltaSeconds);
    }

    // Only rebuild the list when something actually expired, so an idle tick stays a no-op.
    if (notices().some((n) => n.expiresAt <= nowMs)) {
      setNotices((list) => list.filter((n) => n.expiresAt > nowMs));
    }
  }, TICK_MS);
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
    now,
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
    xpOf,
    levelOf,
    progressOf,
    passiveItemOf,
    passiveCopiesOf,
    passiveRankOf,
    passiveUpgradeOf,
    passiveCapOf,
    rankUpPassive,
    characterEquipment,
    equippedItemOf,
    canEquipItem,
    equipItem,
    unequipItem,
    shopOffers,
    buyShopOffer,
    // packs
    worldPointsOf,
    duplicatesOf,
    damageGrowthOf,
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
    activeBuffs,
    abilityBlockRemaining,
    abilityBlockedBy,
    synergyOf,
    achievementCounts,
    // HUD notices
    notices,
    dismissNotice,
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
    enemy,
    enemyHpLeft,
    enemyMaxHp,
    timeToKill,
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
    click,
    setActiveArc,
    unlockAnime,
    activateAbility,
    abilityCooldownRemaining,
    prestigeReset,
    save,
    lastSavedAt,
    exportSave,
    importSave,
    hardReset,
  };
}

export type GameStore = ReturnType<typeof createGameStore>;
