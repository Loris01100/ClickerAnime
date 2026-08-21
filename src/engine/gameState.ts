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
import type { ActiveModifier, Anime, Arc, Character, ComboDefinition } from "./types";

export interface GameData {
  animes: Anime[];
  arcs: Arc[];
  characters: Character[];
  combos: ComboDefinition[];
}

const TICK_MS = 200;
const AUTOSAVE_MS = 5_000;
const SAVE_KEY = "clicker-anime:save:v1";
/** Guaranteed click income so the run is never stuck at zero before the first character is recruited. */
const BASE_CLICK_POWER = 1;

interface SaveFile {
  currency: number;
  lifetimeEarned: number;
  ownedCharacterIds: string[];
  activeArcId: string | null;
  prestigePoints: number;
  unlockedAnimeIds: string[];
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
  const starterAnimeIds = data.animes.filter((a) => a.unlockCost === 0).map((a) => a.id);
  const saved = readSave();
  const defaultArcId = data.arcs.find((a) => starterAnimeIds.includes(a.animeId))?.id ?? data.arcs[0]?.id ?? null;

  const [now, setNow] = createSignal(Date.now());
  const [currency, setCurrency] = createSignal(saved?.currency ?? 0);
  const [lifetimeEarned, setLifetimeEarned] = createSignal(saved?.lifetimeEarned ?? 0);
  const [ownedCharacterIds, setOwnedCharacterIds] = createSignal<string[]>(saved?.ownedCharacterIds ?? []);
  const [activeArcId, setActiveArcId] = createSignal<string | null>(saved?.activeArcId ?? defaultArcId);
  const [prestige, setPrestige] = createSignal(
    saved
      ? {
          prestigePoints: saved.prestigePoints ?? 0,
          unlockedAnimeIds: saved.unlockedAnimeIds ?? [...starterAnimeIds],
        }
      : createInitialPrestigeState(starterAnimeIds)
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

  const clickPower = createMemo(() => computeEffectiveStat(BASE_CLICK_POWER, "clickPower", allModifiers(), now()));
  const passiveIncomePerSecond = createMemo(() => computeEffectiveStat(0, "passiveIncome", allModifiers(), now()));

  const unlockedAbilities = createMemo(() =>
    getUnlockedAbilities(ownedCharacterIds(), data.characters, data.combos)
  );

  /** Prestige points the player would bank by resetting right now. */
  const pendingPrestigeGain = createMemo(() => calculatePrestigeGain(lifetimeEarned()));

  /** Synergy multiplier a character currently gets from the active arc (1 when no arc is selected). */
  function synergyOf(character: Character): number {
    const arc = activeArc();
    return arc ? synergyMultiplier(character, arc, defaultSynergyConfig) : 1;
  }

  function costOf(character: Character): number {
    return recruitCost(character, ownedCharacterIds().length);
  }

  function click() {
    const gain = clickPower();
    setCurrency((c) => c + gain);
    setLifetimeEarned((l) => l + gain);
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
    setActiveArcId(arcId);
    return true;
  }

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

  /** Resets the run (currency, roster, temp buffs) but keeps prestige points and unlocked animes. */
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
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(file));
  }

  /** Wipes the save and every bit of progress, prestige included. */
  function hardReset() {
    if (typeof localStorage !== "undefined") localStorage.removeItem(SAVE_KEY);
    setCurrency(0);
    setLifetimeEarned(0);
    setOwnedCharacterIds([]);
    setTemporaryModifiers([]);
    setAbilityLastUsed({});
    setPrestige(createInitialPrestigeState(starterAnimeIds));
    setActiveArcId(defaultArcId);
  }

  const interval = setInterval(() => {
    const nowMs = Date.now();
    const deltaSeconds = (nowMs - now()) / 1000;
    setNow(nowMs);
    const income = passiveIncomePerSecond() * deltaSeconds;
    if (income > 0) {
      setCurrency((c) => c + income);
      setLifetimeEarned((l) => l + income);
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
