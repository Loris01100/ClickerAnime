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
import { recruitCost } from "./economy";
import {
  animeTier,
  arcGoal,
  arcsOfAnime,
  canEnterNewAnime,
  difficultyMultiplier,
  isAnimeComplete,
  isArcComplete,
  isArcUnlocked,
  type ArcProgress,
} from "./progression";
import type { ActiveModifier, Anime, Arc, Character, ComboDefinition } from "./types";

export interface GameData {
  animes: Anime[];
  arcs: Arc[];
  characters: Character[];
  combos: ComboDefinition[];
}

const TICK_MS = 200;
const AUTOSAVE_MS = 5_000;
const SAVE_KEY = "clicker-anime:save:v2";
/** The narrator's own click — guarantees income before the first character is recruited. */
const NARRATOR_CLICK_POWER = 1;

interface SaveFile {
  currency: number;
  lifetimeEarned: number;
  ownedCharacterIds: string[];
  activeArcId: string | null;
  prestigePoints: number;
  unlockedAnimeIds: string[];
  arcProgress: ArcProgress;
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
  const [arcProgress, setArcProgress] = createSignal<ArcProgress>(saved?.arcProgress ?? {});
  const [prestige, setPrestige] = createSignal(
    saved
      ? { prestigePoints: saved.prestigePoints ?? 0, unlockedAnimeIds: saved.unlockedAnimeIds ?? [] }
      : createInitialPrestigeState()
  );
  const [temporaryModifiers, setTemporaryModifiers] = createSignal<ActiveModifier[]>([]);
  const [abilityLastUsed, setAbilityLastUsed] = createSignal<Record<string, number>>({});

  const activeArc = createMemo<Arc | null>(() => data.arcs.find((a) => a.id === activeArcId()) ?? null);

  const unlockedAnimes = createMemo(() => data.animes.filter((a) => prestige().unlockedAnimeIds.includes(a.id)));

  const availableCharacters = createMemo(() =>
    data.characters.filter((c) => prestige().unlockedAnimeIds.includes(c.animeId))
  );

  const ownedCharacters = createMemo(() => data.characters.filter((c) => ownedCharacterIds().includes(c.id)));

  const allModifiers = createMemo<ActiveModifier[]>(() => {
    const arc = activeArc();
    const fromCharacters = ownedCharacters().flatMap((c) => characterContributions(c, arc, defaultSynergyConfig));
    return [...fromCharacters, ...pruneExpired(temporaryModifiers(), now())];
  });

  const clickPower = createMemo(() => computeEffectiveStat(NARRATOR_CLICK_POWER, "clickPower", allModifiers(), now()));
  const passiveIncomePerSecond = createMemo(() => computeEffectiveStat(0, "passiveIncome", allModifiers(), now()));

  const unlockedAbilities = createMemo(() =>
    getUnlockedAbilities(ownedCharacterIds(), data.characters, data.combos)
  );

  /** Prestige points the player would bank by resetting right now. */
  const pendingPrestigeGain = createMemo(() => calculatePrestigeGain(lifetimeEarned()));

  // --- world progression ---

  const tierOf = (animeId: string) => animeTier(prestige().unlockedAnimeIds, animeId);

  const arcsOf = (animeId: string) => arcsOfAnime(data.arcs, animeId);

  const goalOf = (arc: Arc) => arcGoal(arc, tierOf(arc.animeId));

  const progressOf = (arc: Arc) => arcProgress()[arc.id] ?? 0;

  const arcCleared = (arc: Arc) => isArcComplete(arc, arcProgress(), tierOf(arc.animeId));

  const arcOpen = (arc: Arc) => isArcUnlocked(data.arcs, arc, arcProgress(), tierOf(arc.animeId));

  const animeCleared = (animeId: string) => isAnimeComplete(data.arcs, animeId, arcProgress(), tierOf(animeId));

  /** How much harder this anime is than a first world, frozen at the time it was entered. */
  const difficultyOf = (animeId: string) => difficultyMultiplier(tierOf(animeId));

  const clearedAnimes = createMemo(() => data.animes.filter((a) => animeCleared(a.id)));

  /** Difficulty the next anime entered will be played at. */
  const nextDifficulty = createMemo(() => difficultyMultiplier(prestige().unlockedAnimeIds.length));

  /** True when nothing is left in progress, so the player may head to a new anime. */
  const canTravel = createMemo(() => canEnterNewAnime(prestige().unlockedAnimeIds, data.arcs, arcProgress()));

  /** Free move into a new anime: the first pick of the run, or a new world after clearing the last. */
  function travelTo(animeId: string) {
    if (prestige().unlockedAnimeIds.includes(animeId)) return false;
    if (!data.animes.some((a) => a.id === animeId)) return false;
    if (!canTravel()) return false;
    setPrestige((p) => ({ ...p, unlockedAnimeIds: [...p.unlockedAnimeIds, animeId] }));
    setActiveArcId(arcsOf(animeId)[0]?.id ?? null);
    return true;
  }

  /** Paid shortcut: enter an anime early, without having finished the current one. */
  function unlockAnime(animeId: string) {
    const anime = data.animes.find((a) => a.id === animeId);
    if (!anime || !canUnlockAnime(prestige(), animeId, anime.unlockCost)) return false;
    setPrestige((p) => unlockAnimeState(p, animeId, anime.unlockCost));
    return true;
  }

  /** Credits earnings to the active arc, which is the only way arcs are cleared. */
  function addArcProgress(amount: number) {
    const arc = activeArc();
    if (!arc || amount <= 0 || arcCleared(arc)) return;
    setArcProgress((p) => ({ ...p, [arc.id]: (p[arc.id] ?? 0) + amount }));
  }

  // --- actions ---

  /** Synergy multiplier a character currently gets from the active arc (1 when no arc is selected). */
  function synergyOf(character: Character): number {
    const arc = activeArc();
    return arc ? synergyMultiplier(character, arc, defaultSynergyConfig) : 1;
  }

  function costOf(character: Character): number {
    return recruitCost(character, ownedCharacterIds().length);
  }

  /** The narrator's click. */
  function click() {
    const gain = clickPower();
    setCurrency((c) => c + gain);
    setLifetimeEarned((l) => l + gain);
    addArcProgress(gain);
    return gain;
  }

  function recruitCharacter(characterId: string) {
    if (ownedCharacterIds().includes(characterId)) return false;
    const character = availableCharacters().find((c) => c.id === characterId);
    if (!character) return false;
    const cost = costOf(character);
    if (currency() < cost) return false;
    setCurrency((c) => c - cost);
    setOwnedCharacterIds((ids) => [...ids, characterId]);
    return true;
  }

  function setActiveArc(arcId: string) {
    const arc = data.arcs.find((a) => a.id === arcId);
    if (!arc || !prestige().unlockedAnimeIds.includes(arc.animeId)) return false;
    if (!arcOpen(arc)) return false;
    setActiveArcId(arcId);
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
   * Resets the run (currency, roster, temp buffs) but keeps prestige points, the animes entered and
   * the arcs already cleared — world progression is not part of the run.
   */
  function prestigeReset() {
    setPrestige((p) => applyPrestige(p, lifetimeEarned()));
    setCurrency(0);
    setLifetimeEarned(0);
    setOwnedCharacterIds([]);
    setTemporaryModifiers([]);
    setAbilityLastUsed({});
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
      arcProgress: arcProgress(),
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
    setArcProgress({});
    setActiveArcId(null);
  }

  const interval = setInterval(() => {
    const nowMs = Date.now();
    const deltaSeconds = (nowMs - now()) / 1000;
    setNow(nowMs);
    const income = passiveIncomePerSecond() * deltaSeconds;
    if (income > 0) {
      setCurrency((c) => c + income);
      setLifetimeEarned((l) => l + income);
      addArcProgress(income);
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
    availableCharacters,
    ownedCharacters,
    ownedCharacterIds,
    clickPower,
    passiveIncomePerSecond,
    unlockedAbilities,
    synergyOf,
    costOf,
    // world progression
    arcsOf,
    goalOf,
    progressOf,
    arcCleared,
    arcOpen,
    animeCleared,
    clearedAnimes,
    tierOf,
    difficultyOf,
    nextDifficulty,
    canTravel,
    travelTo,
    // actions
    click,
    recruitCharacter,
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
