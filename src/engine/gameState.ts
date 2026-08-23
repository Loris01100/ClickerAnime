import { createMemo, createSignal, onCleanup } from "solid-js";
import { achievementContributions } from "./achievements";
import { computeEffectiveStat, pruneExpired, replaceModifiersByTarget } from "./modifiers";
import {
  applyPrestige,
  calculatePrestigeGain,
  canUnlockAnime,
  createInitialPrestigeState,
  PRESTIGE_PER_ARC_CLEAR,
  unlockAnime as unlockAnimeState,
} from "./prestige";
import { characterContributions, defaultSynergyConfig, synergyMultiplier } from "./synergy";
import { abilitiesShareType, cooldownRemaining, getUnlockedAbilities, isAbilityReady } from "./abilities";
import { enemyHp, enemyReward, nextEnemy, pendingRecruits, rollsDrop } from "./combat";
import {
  levelFromXp,
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
  ARC_CLEAR_BONUS,
  AUTOCLICK_INTERVAL_MS,
  AUTOCLICK_POWER_FRACTION,
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
  isTierUnlocked,
  PASSIVE_RANK_DISCOUNT,
  PITY_KILLS_THRESHOLD,
  prestigeTreeContributions,
  PRESTIGE_SCALE_REDUCTION,
  PRESTIGE_TREE_CATEGORIES,
  purchaseNextTier,
  purchasedTier,
  RECRUIT_XP_BONUS,
  softenedSynergyConfig,
  UNLOCK_COST_DISCOUNT,
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
  SynergyConfig,
} from "./types";

export interface GameData {
  animes: Anime[];
  arcs: Arc[];
  characters: Character[];
  combos: ComboDefinition[];
  items: Item[];
}

const TICK_MS = 200;
const AUTOSAVE_MS = 5_000;
const SAVE_KEY = "clicker-anime:save:v7";

interface SaveFile {
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
  prestigeTreeRanks?: Record<string, number>;
}

// A save from another build must never break the boot — fall back to a fresh run instead.
function isValidSave(value: unknown): value is SaveFile {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SaveFile>;
  return typeof candidate.currency === "number" && Array.isArray(candidate.ownedCharacterIds);
}

function readSave(): SaveFile | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVE_KEY) ?? "null");
    return isValidSave(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function createGameStore(data: GameData) {
  const saved = readSave();

  const [now, setNow] = createSignal(Date.now());
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
  // Tiers bought in the prestige skill tree (see prestigeTree.ts) — meta-progression like prestige
  // points themselves: survives prestigeReset, only hardReset wipes it.
  const [prestigeTreeRanks, setPrestigeTreeRanks] = createSignal<Record<string, number>>(
    saved?.prestigeTreeRanks ?? {}
  );
  // Kills since the last item drop, per arc — feeds the "Objets" tier 4 pity timer. Transient like
  // the rest of combat state: a reload forgets the streak.
  const [killsSinceDrop, setKillsSinceDrop] = createSignal<Record<string, number>>({});
  // Sub-tick accumulator driving the "Clic du Narrateur" tier 2 autoclicker. Also transient.
  const [autoClickAccumMs, setAutoClickAccumMs] = createSignal(0);
  const [prestige, setPrestige] = createSignal(
    saved
      ? { prestigePoints: saved.prestigePoints ?? 0, unlockedAnimeIds: saved.unlockedAnimeIds ?? [] }
      : createInitialPrestigeState()
  );
  const [temporaryModifiers, setTemporaryModifiers] = createSignal<ActiveModifier[]>([]);
  const [abilityLastUsed, setAbilityLastUsed] = createSignal<Record<string, number>>({});

  // Combat is transient: the current fight restarts from scratch on reload rather than being saved.
  const [enemy, setEnemy] = createSignal<Enemy | null>(null);
  const [enemyHpLeft, setEnemyHpLeft] = createSignal(0);
  const [enemyMaxHp, setEnemyMaxHp] = createSignal(0);
  const [timerDeadline, setTimerDeadline] = createSignal<number | null>(null);
  const [lastTimeout, setLastTimeout] = createSignal(0);
  // Arcs whose boss timed out on the player: farming resumes instead of respawning the same boss,
  // so the player is never stuck. Also transient — a reload forgets it, like the rest of combat.
  const [bossRetreatArcIds, setBossRetreatArcIds] = createSignal<string[]>([]);

  /** How many tiers of one prestige-tree branch are bought — see prestigeTree.ts for what each unlocks. */
  const treeTierOf = (categoryId: string) => purchasedTier(prestigeTreeRanks(), categoryId);

  const effectiveXpGrowth = createMemo(() =>
    isTierUnlocked(prestigeTreeRanks(), "xp", 3) ? XP_GROWTH - XP_GROWTH_REDUCTION : XP_GROWTH
  );

  /** Synergy malus softened once "DPS Équipe" tier 3 is bought — see softenedSynergyConfig. */
  const activeSynergyConfig = createMemo<SynergyConfig>(() =>
    softenedSynergyConfig(defaultSynergyConfig, treeTierOf("teamDps") >= 3)
  );

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

  /** Bumps one achievement ladder; the tier(s) it crosses start contributing on the next `allModifiers` read. */
  function bumpAchievement(categoryId: string, amount = 1) {
    setAchievementCounts((counts) => ({ ...counts, [categoryId]: (counts[categoryId] ?? 0) + amount }));
  }

  const allModifiers = createMemo<ActiveModifier[]>(() => {
    const arc = activeArc();
    const config = activeSynergyConfig();
    const fromCharacters = ownedCharacters().flatMap((c) =>
      characterContributions(c, arc, config, levelOf(c.id), passiveRankOf(c), isEvolved(c))
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

  /** Currency threshold worth one prestige point — lowered by the "Ressource" tree tier 2 perk. */
  const prestigeScale = createMemo(() =>
    treeTierOf("resource") >= 2 ? 1_000_000 * (1 - PRESTIGE_SCALE_REDUCTION) : 1_000_000
  );

  /** Prestige points the player would bank by resetting right now. */
  const pendingPrestigeGain = createMemo(() => calculatePrestigeGain(lifetimeEarned(), prestigeScale()));

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
    const timerMs =
      isBoss && next.timerMs && treeTierOf("teamDps") >= 5 ? next.timerMs * (1 + BOSS_TIMER_BOOST) : next.timerMs;
    setTimerDeadline(timerMs ? Date.now() + timerMs : null);
  }

  function defeat(target: Enemy) {
    const arc = activeArc();
    if (!arc) return;

    const baseReward = enemyReward(target, currentDifficulty());
    const reward = treeTierOf("resource") >= 1 ? baseReward * (1 + CURRENCY_GAIN_PERCENT) : baseReward;
    setCurrency((c) => c + reward);
    setLifetimeEarned((l) => l + reward);

    const isNewRecruit = !!target.characterId && !ownedCharacterIds().includes(target.characterId);
    if (isNewRecruit) {
      setOwnedCharacterIds((ids) => [...ids, target.characterId!]);
      bumpAchievement("charactersRecruited");
    }

    const isBoss = target.id === arc.boss.id;
    // xp is a multiple of the currency reward — see XP_PER_KILL_REWARD — so it scales with the
    // world just like currency does, only harder.
    const xpAmount = reward * XP_PER_KILL_REWARD * (isBoss && treeTierOf("xp") >= 5 ? 1 + BOSS_XP_BOOST : 1);
    grantXp(xpAmount);
    if (isNewRecruit && treeTierOf("xp") >= 4) grantXpTo(target.characterId!, RECRUIT_XP_BONUS);

    maybeDropItem(target, arc);

    if (isBoss) {
      if (!clearedArcIds().includes(arc.id)) {
        setClearedArcIds((ids) => [...ids, arc.id]);
        const arcClearGain =
          treeTierOf("resource") >= 3 ? PRESTIGE_PER_ARC_CLEAR + ARC_CLEAR_BONUS : PRESTIGE_PER_ARC_CLEAR;
        setPrestige((p) => ({ ...p, prestigePoints: p.prestigePoints + arcClearGain }));
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
  }

  /**
   * Uniques are one copy only; commons stack, so farming a zone keeps paying into the click. Beyond
   * the base roll, the "Objets" tree can boost the drop chance (tier 1), roll a bonus copy (tier 3),
   * force a drop after a dry streak (tier 4, tracked in `killsSinceDrop`) and let an item-less enemy
   * still hand over the arc's common at low odds (tier 5).
   */
  function maybeDropItem(target: Enemy, arc: Arc) {
    const tier = treeTierOf("items");
    let dropped = false;

    if (target.itemId) {
      const baseChance = target.dropChance ?? 1;
      const boostedChance = tier >= 1 ? Math.min(1, baseChance * (1 + DROP_CHANCE_BOOST)) : baseChance;
      if (rollsDrop({ ...target, dropChance: boostedChance }, Math.random())) {
        const item = data.items.find((i) => i.id === target.itemId);
        if (item && !(item.kind === "unique" && countOf(item.id) > 0)) {
          grantItem(item);
          dropped = true;
          if (tier >= 3 && item.kind === "common" && Math.random() < DOUBLE_DROP_CHANCE) grantItem(item);
        }
      }
    }

    if (dropped) {
      setKillsSinceDrop((k) => ({ ...k, [arc.id]: 0 }));
      return;
    }

    const streak = (killsSinceDrop()[arc.id] ?? 0) + 1;
    setKillsSinceDrop((k) => ({ ...k, [arc.id]: streak }));

    if (tier >= 4 && streak >= PITY_KILLS_THRESHOLD) {
      const common = arcCommonItem(arc);
      if (common) {
        grantItem(common);
        setKillsSinceDrop((k) => ({ ...k, [arc.id]: 0 }));
        return;
      }
    }

    if (tier >= 5 && !target.itemId && Math.random() < GHOST_LOOT_CHANCE) {
      const common = arcCommonItem(arc);
      if (common) grantItem(common);
    }
  }

  function dealDamage(amount: number) {
    const target = enemy();
    if (!target || amount <= 0) return 0;
    const left = enemyHpLeft() - amount;
    if (left > 0) {
      setEnemyHpLeft(left);
    } else {
      defeat(target);
    }
    return amount;
  }

  /**
   * The narrator's click. Beyond raw damage, the "Clic du Narrateur" tree can crit (tier 3), shave
   * time off every unlocked ability's cooldown (tier 4), and has a small chance to fire one of them
   * for free (tier 5).
   */
  function click() {
    const tier = treeTierOf("narratorClick");
    const power = tier >= 3 && Math.random() < CRIT_CHANCE ? clickPower() * CRIT_MULTIPLIER : clickPower();
    const dealt = dealDamage(power);

    if (tier >= 4) {
      setAbilityLastUsed((used) => {
        const next: Record<string, number> = {};
        for (const [id, at] of Object.entries(used)) next[id] = at - CLICK_COOLDOWN_REDUCTION_MS;
        return next;
      });
    }

    if (tier >= 5 && Math.random() < FREE_ABILITY_TRIGGER_CHANCE) {
      const candidates = unlockedAbilities();
      if (candidates.length > 0) {
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        triggerAbilityEffects(pick.ability);
      }
    }

    return dealt;
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

  const timerRemaining = createMemo(() => {
    const deadline = timerDeadline();
    return deadline === null ? null : Math.max(0, deadline - now());
  });

  // --- levelling ---

  /**
   * Every kill trains the whole team equally; levels are uncapped so this never stops paying.
   * Boosted by the "XP" tree tier 1 — a flat percent on every grant, whatever its source.
   */
  function grantXp(amount: number) {
    if (amount <= 0) return;
    const boosted = treeTierOf("xp") >= 1 ? amount * (1 + XP_GAIN_PERCENT) : amount;
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
    const discount = treeTierOf("items") >= 2 ? PASSIVE_RANK_DISCOUNT : 0;
    return passiveUpgrade(passiveRankOf(character), character.rarity, passiveCopiesOf(character), discount);
  }
  const passiveCapOf = (character: Character) => PASSIVE_LEVEL_CAP[character.rarity];

  /** Spends the origin item to buy the next rank of a character's passive. */
  function rankUpPassive(character: Character): boolean {
    const item = passiveItemOf(character);
    const upgrade = passiveUpgradeOf(character);
    if (!item || !upgrade.affordable) return false;
    setItemCounts((counts) => ({ ...counts, [item.id]: (counts[item.id] ?? 0) - upgrade.cost }));
    setPassiveRanks((ranks) => ({ ...ranks, [character.id]: upgrade.rank + 1 }));
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
    const discount = treeTierOf("resource") >= 4 ? UNLOCK_COST_DISCOUNT : 0;
    const cost = Math.max(0, Math.ceil(anime.unlockCost * (1 - discount)));
    if (!canUnlockAnime(prestige(), animeId, cost)) return false;
    setPrestige((p) => unlockAnimeState(p, animeId, cost));
    return true;
  }

  /**
   * An ability's effects, ready to drop into `temporaryModifiers`. The "DPS Équipe" tree can boost
   * a percent/multiplier effect's magnitude (tier 2) and stretch its duration (tier 4) — flat effects
   * are left alone since "damage boost" is meant to read as a percent, not a flat bump.
   */
  function buildAbilityModifiers(ability: AbilityDefinition): ActiveModifier[] {
    const nowMs = Date.now();
    const damageBoosted = treeTierOf("teamDps") >= 2;
    const duration = treeTierOf("teamDps") >= 4 ? ability.durationMs * (1 + ABILITY_DURATION_BOOST) : ability.durationMs;
    return ability.effects.map((effect) => ({
      ...effect,
      value: damageBoosted ? boostedAbilityValue(effect) : effect.value,
      sourceId: ability.id,
      expiresAt: nowMs + duration,
    }));
  }

  function boostedAbilityValue(effect: ModifierTemplate): number {
    if (effect.kind === "percent") return effect.value * (1 + ABILITY_DAMAGE_BOOST);
    if (effect.kind === "multiplier") return 1 + (effect.value - 1) * (1 + ABILITY_DAMAGE_BOOST);
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

    triggerAbilityEffects(unlocked.ability);
    // Abilities that touch the same stat also start cooling down together: activating one would cut
    // a same-stat buff short anyway, so leaving it "ready" would just invite a wasted activation.
    const sameType = unlockedAbilities().filter((u) => abilitiesShareType(u.ability, unlocked.ability));
    setAbilityLastUsed((used) => {
      const next = { ...used };
      for (const u of sameType) next[u.ability.id] = nowMs;
      return next;
    });
    bumpAchievement("abilitiesUsed");
    return true;
  }

  function abilityCooldownRemaining(abilityId: string): number {
    const cooldownMs = unlockedAbilities().find((u) => u.ability.id === abilityId)?.ability.cooldownMs ?? 0;
    return cooldownRemaining(abilityLastUsed()[abilityId], cooldownMs, now());
  }

  /**
   * Sends the run back to square one: currency, team, xp, worlds entered, arcs cleared, items and
   * passive ranks all go. Only the prestige points survive — the whole point is to redo the climb
   * faster.
   */
  function prestigeReset() {
    // "Ressource" tier 5: a flat chance to double the points this reset banks.
    const gainMultiplier = treeTierOf("resource") >= 5 && Math.random() < DOUBLE_PRESTIGE_CHANCE ? 2 : 1;
    setPrestige((p) => applyPrestige(p, lifetimeEarned(), prestigeScale(), gainMultiplier));
    setCurrency(0);
    setLifetimeEarned(0);
    setOwnedCharacterIds([]);
    setCharacterXp({});
    setTemporaryModifiers([]);
    setAbilityLastUsed({});
    setItemCounts({});
    setPassiveRanks({});
    setArcKills({});
    setClearedArcIds([]);
    setActiveArcId(null);
    setBossRetreatArcIds([]);
    setEvolvedCharacterIds([]);
    setKillsSinceDrop({});
    setAutoClickAccumMs(0);
    spawnNext();
  }

  function buildSaveFile(): SaveFile {
    return {
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
    };
  }

  function save() {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(SAVE_KEY, JSON.stringify(buildSaveFile()));
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
    setKillsSinceDrop({});
    setAutoClickAccumMs(0);
    setEnemy(null);
  }

  /** Buys the next tier of one prestige-tree branch, if a point is owned and it's affordable. */
  function purchaseTreeTier(categoryId: string): boolean {
    const category = PRESTIGE_TREE_CATEGORIES.find((c) => c.id === categoryId);
    if (!category) return false;
    const result = purchaseNextTier(prestige().prestigePoints, prestigeTreeRanks(), category);
    if (!result) return false;
    setPrestige((p) => ({ ...p, prestigePoints: result.prestigePoints }));
    setPrestigeTreeRanks(result.ranks);
    return true;
  }

  /** What the next tier of a branch costs, or null once it's fully bought. */
  function nextTreeTierCost(categoryId: string): number | null {
    const category = PRESTIGE_TREE_CATEGORIES.find((c) => c.id === categoryId);
    return category?.nodes[treeTierOf(categoryId)]?.cost ?? null;
  }

  spawnNext();

  const interval = setInterval(() => {
    const nowMs = Date.now();
    const deltaMs = nowMs - now();
    const deltaSeconds = deltaMs / 1000;
    setNow(nowMs);
    dealDamage(teamDps() * deltaSeconds);
    checkTimer(nowMs);

    if (treeTierOf("narratorClick") >= 2) {
      const accumMs = autoClickAccumMs() + deltaMs;
      if (accumMs >= AUTOCLICK_INTERVAL_MS) {
        dealDamage(clickPower() * AUTOCLICK_POWER_FRACTION);
        setAutoClickAccumMs(accumMs % AUTOCLICK_INTERVAL_MS);
      } else {
        setAutoClickAccumMs(accumMs);
      }
    }

    if (treeTierOf("xp") >= 2 && ownedCharacterIds().length > 0) {
      grantXp(XP_PASSIVE_PER_SECOND * deltaSeconds);
    }
  }, TICK_MS);
  const autosave = setInterval(save, AUTOSAVE_MS);
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
    unlockedAbilities,
    synergyOf,
    achievementCounts,
    // prestige tree
    treeTierOf,
    purchaseTreeTier,
    nextTreeTierCost,
    // combat
    enemy,
    enemyHpLeft,
    enemyMaxHp,
    timerRemaining,
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
    exportSave,
    importSave,
    hardReset,
  };
}

export type GameStore = ReturnType<typeof createGameStore>;
