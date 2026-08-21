import { createMemo, createSignal, onCleanup } from "solid-js";
import { computeEffectiveStat, pruneExpired } from "./modifiers";
import { applyPrestige, canUnlockAnime, createInitialPrestigeState, unlockAnime as unlockAnimeState } from "./prestige";
import { characterContributions, defaultSynergyConfig } from "./synergy";
import { cooldownRemaining, getUnlockedAbilities, isAbilityReady } from "./abilities";
import type { ActiveModifier, Anime, Arc, Character, ComboDefinition } from "./types";

export interface GameData {
  animes: Anime[];
  arcs: Arc[];
  characters: Character[];
  combos: ComboDefinition[];
}

const TICK_MS = 200;
/** Guaranteed click income so the run is never stuck at zero before the first character is recruited. */
const BASE_CLICK_POWER = 1;

export function createGameStore(data: GameData) {
  const starterAnimeIds = data.animes.filter((a) => a.unlockCost === 0).map((a) => a.id);

  const [now, setNow] = createSignal(Date.now());
  const [currency, setCurrency] = createSignal(0);
  const [lifetimeEarned, setLifetimeEarned] = createSignal(0);
  const [ownedCharacterIds, setOwnedCharacterIds] = createSignal<string[]>([]);
  const [activeArcId, setActiveArcId] = createSignal<string | null>(
    data.arcs.find((a) => starterAnimeIds.includes(a.animeId))?.id ?? data.arcs[0]?.id ?? null
  );
  const [prestige, setPrestige] = createSignal(createInitialPrestigeState(starterAnimeIds));
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

  function click() {
    const gain = clickPower();
    setCurrency((c) => c + gain);
    setLifetimeEarned((l) => l + gain);
  }

  function recruitCharacter(characterId: string, cost: number) {
    if (ownedCharacterIds().includes(characterId)) return false;
    if (!availableCharacters().some((c) => c.id === characterId)) return false;
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
  onCleanup(() => clearInterval(interval));

  return {
    data,
    now,
    currency,
    lifetimeEarned,
    prestige,
    activeArc,
    unlockedAnimes,
    availableCharacters,
    ownedCharacters,
    clickPower,
    passiveIncomePerSecond,
    unlockedAbilities,
    click,
    recruitCharacter,
    setActiveArc,
    unlockAnime,
    activateAbility,
    abilityCooldownRemaining,
    prestigeReset,
  };
}

export type GameStore = ReturnType<typeof createGameStore>;
