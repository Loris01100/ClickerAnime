import { createMemo, createSignal, onCleanup } from "solid-js";
import { computeEffectiveStat, pruneExpired } from "./modifiers";
import {
  applyPrestige,
  calculatePrestigeGain,
  canUnlockAnime,
  createInitialPrestigeState,
  unlockAnime as unlockAnimeState,
} from "./prestige";
import { characterContributions, defaultSynergyConfig, synergyMultiplier } from "./synergy";
import { cooldownRemaining, getUnlockedAbilities, isAbilityReady } from "./abilities";
import { enemyHp, enemyReward, nextEnemy, pendingRecruits, rollsDrop } from "./combat";
import {
  levelFromXp,
  narratorClickPower,
  passiveUpgrade,
  PASSIVE_LEVEL_CAP,
  xpProgress,
} from "./growth";
import {
  animeTier,
  arcsOfAnime,
  canEnterNewAnime,
  difficultyMultiplier,
  isAnimeComplete,
  isArcUnlocked,
} from "./progression";
import type { ActiveModifier, Anime, Arc, Character, ComboDefinition, Enemy, Item } from "./types";

export interface GameData {
  animes: Anime[];
  arcs: Arc[];
  characters: Character[];
  combos: ComboDefinition[];
  items: Item[];
}

const TICK_MS = 200;
const AUTOSAVE_MS = 5_000;
const SAVE_KEY = "clicker-anime:save:v6";

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
}

function readSave(): SaveFile | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVE_KEY) ?? "null");
    // A save from another build must never break the boot — fall back to a fresh run instead.
    if (!parsed || typeof parsed.currency !== "number" || !Array.isArray(parsed.ownedCharacterIds)) return null;
    return parsed as SaveFile;
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
  // Bought with items, so they outlive a prestige just like the items that paid for them.
  const [passiveRanks, setPassiveRanks] = createSignal<Record<string, number>>(saved?.passiveRanks ?? {});
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

  const activeArc = createMemo<Arc | null>(() => data.arcs.find((a) => a.id === activeArcId()) ?? null);

  const unlockedAnimes = createMemo(() => data.animes.filter((a) => prestige().unlockedAnimeIds.includes(a.id)));

  const ownedCharacters = createMemo(() => data.characters.filter((c) => ownedCharacterIds().includes(c.id)));

  const xpOf = (characterId: string) => characterXp()[characterId] ?? 0;

  /** Levels are read off accumulated xp rather than stored, so the two can never drift apart. */
  const levelOf = (characterId: string) => levelFromXp(xpOf(characterId));

  const progressOf = (characterId: string) => xpProgress(xpOf(characterId));

  /** Items found across every world; never lost, not even on prestige. Commons stack. */
  const foundItems = createMemo(() => data.items.filter((i) => (itemCounts()[i.id] ?? 0) > 0));

  const countOf = (itemId: string) => itemCounts()[itemId] ?? 0;

  const allModifiers = createMemo<ActiveModifier[]>(() => {
    const arc = activeArc();
    const fromCharacters = ownedCharacters().flatMap((c) =>
      characterContributions(c, arc, defaultSynergyConfig, levelOf(c.id), passiveRankOf(c))
    );
    return [...fromCharacters, ...pruneExpired(temporaryModifiers(), now())];
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

  /** Damage of one narrator click. */
  const clickPower = createMemo(() => computeEffectiveStat(narratorBase(), "clickPower", allModifiers(), now()));
  /** Damage the team deals on its own, per second. */
  const teamDps = createMemo(() => computeEffectiveStat(0, "teamDps", allModifiers(), now()));

  const unlockedAbilities = createMemo(() =>
    getUnlockedAbilities(ownedCharacterIds(), data.characters, data.combos)
  );

  /** Prestige points the player would bank by resetting right now. */
  const pendingPrestigeGain = createMemo(() => calculatePrestigeGain(lifetimeEarned()));

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

  /** Puts the next enemy of the active arc in front of the player, at full hp. */
  function spawnNext() {
    const arc = activeArc();
    if (!arc) {
      setEnemy(null);
      return;
    }
    const next = nextEnemy(arc, killsIn(arc), ownedCharacterIds(), arcCleared(arc));
    const hp = enemyHp(next, currentDifficulty());
    setEnemy(next);
    setEnemyMaxHp(hp);
    setEnemyHpLeft(hp);
    setTimerDeadline(next.timerMs ? Date.now() + next.timerMs : null);
  }

  function defeat(target: Enemy) {
    const arc = activeArc();
    if (!arc) return;

    const reward = enemyReward(target, currentDifficulty());
    setCurrency((c) => c + reward);
    setLifetimeEarned((l) => l + reward);

    if (target.characterId && !ownedCharacterIds().includes(target.characterId)) {
      setOwnedCharacterIds((ids) => [...ids, target.characterId!]);
    }

    // xp equals the currency reward: one number to balance, and both scale with the world.
    grantXp(reward);
    maybeDropItem(target);

    if (target.id === arc.boss.id) {
      if (!clearedArcIds().includes(arc.id)) setClearedArcIds((ids) => [...ids, arc.id]);
    } else {
      setArcKills((k) => ({ ...k, [arc.id]: (k[arc.id] ?? 0) + 1 }));
    }

    spawnNext();
  }

  /** Uniques are one copy only; commons stack, so farming a zone keeps paying into the click. */
  function maybeDropItem(target: Enemy) {
    if (!target.itemId || !rollsDrop(target, Math.random())) return;
    const item = data.items.find((i) => i.id === target.itemId);
    if (!item) return;
    if (item.kind === "unique" && countOf(item.id) > 0) return;
    setItemCounts((counts) => ({ ...counts, [item.id]: (counts[item.id] ?? 0) + 1 }));
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

  /** The narrator's click. */
  function click() {
    return dealDamage(clickPower());
  }

  /** A boss that outlasts its timer comes back at full hp — no other penalty, enemies never hit back. */
  function checkTimer(nowMs: number) {
    const deadline = timerDeadline();
    if (deadline === null || nowMs < deadline) return;
    setLastTimeout(nowMs);
    spawnNext();
  }

  const timerRemaining = createMemo(() => {
    const deadline = timerDeadline();
    return deadline === null ? null : Math.max(0, deadline - now());
  });

  // --- levelling ---

  /** Every kill trains the whole team equally; levels are uncapped so this never stops paying. */
  function grantXp(amount: number) {
    if (amount <= 0) return;
    setCharacterXp((xp) => {
      const next = { ...xp };
      for (const id of ownedCharacterIds()) next[id] = (next[id] ?? 0) + amount;
      return next;
    });
  }

  /** Rank the passive runs at (0 = still locked), what the next one costs, and the cap. */
  function passiveRankOf(character: Character): number {
    return passiveRanks()[character.id] ?? 0;
  }

  function passiveUpgradeOf(character: Character) {
    return passiveUpgrade(passiveRankOf(character), character.rarity, passiveCopiesOf(character));
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
    return arc ? synergyMultiplier(character, arc, defaultSynergyConfig) : 1;
  }

  function setActiveArc(arcId: string) {
    const arc = data.arcs.find((a) => a.id === arcId);
    if (!arc || !prestige().unlockedAnimeIds.includes(arc.animeId)) return false;
    if (!arcOpen(arc)) return false;
    setActiveArcId(arcId);
    spawnNext();
    return true;
  }

  /** Free move into a new anime: the first pick of the run, or a new world after clearing the last. */
  function travelTo(animeId: string) {
    if (prestige().unlockedAnimeIds.includes(animeId)) return false;
    if (!data.animes.some((a) => a.id === animeId)) return false;
    if (!canTravel()) return false;
    setPrestige((p) => ({ ...p, unlockedAnimeIds: [...p.unlockedAnimeIds, animeId] }));
    setActiveArcId(arcsOf(animeId)[0]?.id ?? null);
    spawnNext();
    return true;
  }

  /** Paid shortcut: enter an anime early, without having finished the current one. */
  function unlockAnime(animeId: string) {
    const anime = data.animes.find((a) => a.id === animeId);
    if (!anime || !canUnlockAnime(prestige(), animeId, anime.unlockCost)) return false;
    setPrestige((p) => unlockAnimeState(p, animeId, anime.unlockCost));
    return true;
  }

  function activateAbility(abilityId: string) {
    const unlocked = unlockedAbilities().find((u) => u.ability.id === abilityId);
    if (!unlocked) return false;

    const nowMs = Date.now();
    if (!isAbilityReady(abilityLastUsed()[abilityId], unlocked.ability.cooldownMs, nowMs)) return false;

    const mods: ActiveModifier[] = unlocked.ability.effects.map((effect) => ({
      ...effect,
      sourceId: unlocked.ability.id,
      expiresAt: nowMs + unlocked.ability.durationMs,
    }));
    setTemporaryModifiers((existing) => [...existing, ...mods]);
    setAbilityLastUsed((used) => ({ ...used, [abilityId]: nowMs }));
    return true;
  }

  function abilityCooldownRemaining(abilityId: string): number {
    const cooldownMs = unlockedAbilities().find((u) => u.ability.id === abilityId)?.ability.cooldownMs ?? 0;
    return cooldownRemaining(abilityLastUsed()[abilityId], cooldownMs, now());
  }

  /**
   * Resets the run (currency, team, temp buffs) but keeps prestige points, the animes entered and
   * the arcs already cleared — world progression is not part of the run.
   */
  function prestigeReset() {
    setPrestige((p) => applyPrestige(p, lifetimeEarned()));
    setCurrency(0);
    setLifetimeEarned(0);
    setOwnedCharacterIds([]);
    setCharacterXp({});
    setTemporaryModifiers([]);
    setAbilityLastUsed({});
    spawnNext();
  }

  function save() {
    if (typeof localStorage === "undefined") return;
    const file: SaveFile = {
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
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(file));
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
    setEnemy(null);
  }

  spawnNext();

  const interval = setInterval(() => {
    const nowMs = Date.now();
    const deltaSeconds = (nowMs - now()) / 1000;
    setNow(nowMs);
    dealDamage(teamDps() * deltaSeconds);
    checkTimer(nowMs);
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
    // combat
    enemy,
    enemyHpLeft,
    enemyMaxHp,
    timerRemaining,
    lastTimeout,
    // world progression
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
    hardReset,
  };
}

export type GameStore = ReturnType<typeof createGameStore>;
