import type { AbilityPolicy } from "./abilities";

// v10: added characterEquipment (Record<characterId, itemId>) for equippable unique items.
export const SAVE_KEY = "clicker-anime:save:v10";
/** Last known-good primary save, rotated automatically before every successful write. */
export const SAVE_BACKUP_KEY = `${SAVE_KEY}:backup`;
/** Written into every save as `SaveFile.version` — see there before bumping `SAVE_KEY` again. */
export const SAVE_VERSION = 10;

export interface SaveFile {
  /**
   * Shape version, carried inside the save rather than only in `SAVE_KEY`. A key bump means every
   * existing player is wiped; a version field lets a breaking change be migrated in `readSave`.
   */
  version?: number;
  currency: number;
  lifetimeEarned: number;
  ownedCharacterIds: string[];
  activeArcId: string | null;
  prestigePoints: number;
  unlockedAnimeIds: string[];
  /**
   * Per-world re-levelling factor, frozen the moment the world was entered — like the tier the
   * entry order encodes, and for the same reason: a scale recomputed from a live `reachedArcPower`
   * would keep rising *inside* the world it scales. Absent on a save written before worlds were
   * re-levelled, which reads back as 1 everywhere, i.e. the tier ramp alone.
   */
  /**
   * The scale each entered world is played at, frozen when it was entered — like the tier its entry
   * order encodes, and for the same reason: recomputed live it would keep rising inside the world it
   * scales. Absent on a save written before worlds were re-levelled, which reads back as the tier
   * ramp alone.
   */
  animeEntryDifficulties?: Record<string, number>;
  /** How far each entered world's `arcPower` rungs are shifted, frozen alongside the difficulty. */
  animeEntryScales?: Record<string, number>;
  arcKills: Record<string, number>;
  clearedArcIds: string[];
  characterXp: Record<string, number>;
  itemCounts: Record<string, number>;
  passiveRanks: Record<string, number>;
  evolvedCharacterIds: string[];
  achievementCounts?: Record<string, number>;
  prestigeTreeRanks?: Record<string, number[]>;
  characterEquipment?: Record<string, string>;
  crossoverCrystals?: number;
  worldPoints?: Record<string, number>;
  characterDuplicates?: Record<string, number>;
  autoClickEnabled?: boolean;
  automationOff?: Record<string, boolean>;
  autoRankCharacterIds?: string[];
  abilityPolicy?: Record<string, AbilityPolicy>;
  abilityLastUsed?: Record<string, number>;
  uniqueFragments?: Record<string, number>;
  uniqueUpgradeRanks?: Record<string, number>;
  activeChallengeId?: string | null;
  completedChallengeIds?: string[];
  runStartedAt?: number;
  runAchievementBaseline?: Record<string, number>;
}

const isNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value);
const isStringArray = (value: unknown) =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string");

/** A plain `Record<string, T>` — rejects arrays and null, which `typeof === "object"` accepts. */
function isRecordOf(value: unknown, valueOk: (entry: unknown) => boolean): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).every(valueOk);
}

/**
 * Full type check for both browser storage and arbitrary imported files. Fields remain optional so
 * older saves can be absorbed by the defaults in `createGameStore`.
 */
export function isValidSave(value: unknown): value is SaveFile {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const optional = (entry: unknown, valid: (item: unknown) => boolean) =>
    entry === undefined || valid(entry);

  if (!isNumber(candidate.currency) || !isStringArray(candidate.ownedCharacterIds)) return false;

  return (
    optional(candidate.version, isNumber) &&
    optional(candidate.lifetimeEarned, isNumber) &&
    optional(candidate.prestigePoints, isNumber) &&
    optional(candidate.crossoverCrystals, isNumber) &&
    optional(candidate.activeArcId, (entry) => entry === null || typeof entry === "string") &&
    optional(candidate.unlockedAnimeIds, isStringArray) &&
    optional(candidate.animeEntryDifficulties, (entry) => isRecordOf(entry, isNumber)) &&
    optional(candidate.animeEntryScales, (entry) => isRecordOf(entry, isNumber)) &&
    optional(candidate.clearedArcIds, isStringArray) &&
    optional(candidate.evolvedCharacterIds, isStringArray) &&
    optional(candidate.arcKills, (entry) => isRecordOf(entry, isNumber)) &&
    optional(candidate.characterXp, (entry) => isRecordOf(entry, isNumber)) &&
    optional(candidate.itemCounts, (entry) => isRecordOf(entry, isNumber)) &&
    optional(candidate.passiveRanks, (entry) => isRecordOf(entry, isNumber)) &&
    optional(candidate.achievementCounts, (entry) => isRecordOf(entry, isNumber)) &&
    optional(candidate.worldPoints, (entry) => isRecordOf(entry, isNumber)) &&
    optional(candidate.characterDuplicates, (entry) => isRecordOf(entry, isNumber)) &&
    optional(candidate.autoClickEnabled, (entry) => typeof entry === "boolean") &&
    optional(candidate.automationOff, (entry) =>
      isRecordOf(entry, (enabled) => typeof enabled === "boolean")
    ) &&
    optional(candidate.autoRankCharacterIds, isStringArray) &&
    optional(candidate.abilityPolicy, (entry) =>
      isRecordOf(entry, (policy) => policy === "always" || policy === "boss" || policy === "sync")
    ) &&
    optional(candidate.abilityLastUsed, (entry) => isRecordOf(entry, isNumber)) &&
    optional(candidate.uniqueFragments, (entry) => isRecordOf(entry, isNumber)) &&
    optional(candidate.uniqueUpgradeRanks, (entry) => isRecordOf(entry, isNumber)) &&
    optional(candidate.activeChallengeId, (entry) => entry === null || typeof entry === "string") &&
    optional(candidate.completedChallengeIds, isStringArray) &&
    optional(candidate.runStartedAt, isNumber) &&
    optional(candidate.runAchievementBaseline, (entry) => isRecordOf(entry, isNumber)) &&
    optional(candidate.characterEquipment, (entry) =>
      isRecordOf(entry, (id) => typeof id === "string")
    ) &&
    optional(candidate.prestigeTreeRanks, (entry) =>
      isRecordOf(entry, (levels) => Array.isArray(levels) && levels.every(isNumber))
    )
  );
}

/** Parses, validates and migrates one stored save without ever exposing a bad blob. */
export function parseSave(raw: string | null): SaveFile | null {
  try {
    const parsed = JSON.parse(raw ?? "null");
    if (!isValidSave(parsed)) return null;
    if (
      parsed.prestigeTreeRanks &&
      "resource" in parsed.prestigeTreeRanks &&
      !("destin" in parsed.prestigeTreeRanks)
    ) {
      parsed.prestigeTreeRanks = {
        ...parsed.prestigeTreeRanks,
        destin: parsed.prestigeTreeRanks.resource,
      };
      delete parsed.prestigeTreeRanks.resource;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function storedRaw(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function hasValidBackup(): boolean {
  return typeof localStorage !== "undefined" && parseSave(storedRaw(SAVE_BACKUP_KEY)) !== null;
}

/**
 * The exact string this module last wrote into the primary slot, and only ever set from a save that
 * `isValidSave` accepted — so re-parsing and re-validating it to decide whether it may be rotated
 * is answering a question we already know the answer to.
 *
 * That mattered because the rotation runs on every autosave, i.e. every 5 seconds for the whole
 * session: a full `JSON.parse` of the previous save plus a walk of every field of it, on the main
 * thread, purely to confirm what we ourselves had just written. Anything we did *not* write — a
 * save from another tab, a hand-edited slot, a version from before this session — falls through to
 * the full `parseSave` below, so the invariant is unchanged: only a valid save is ever rotated into
 * the backup, and an invalid primary is never allowed to destroy a good backup.
 */
let lastWrittenRaw: string | null = null;

/** Rotates a valid primary into the backup slot, then writes the supplied state. */
export function writeSave(save: SaveFile, onBackupCreated?: () => void): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    const currentRaw = localStorage.getItem(SAVE_KEY);
    // `currentRaw === lastWrittenRaw` is the fast path; `parseSave` is the answer for every other
    // provenance. Both mean the same thing — "this blob is a valid save".
    if (currentRaw && (currentRaw === lastWrittenRaw || parseSave(currentRaw))) {
      localStorage.setItem(SAVE_BACKUP_KEY, currentRaw);
      onBackupCreated?.();
    }
    const raw = JSON.stringify(save);
    localStorage.setItem(SAVE_KEY, raw);
    // Only remembered when the object really is valid: `isValidSave` rejects a non-finite number,
    // which is the one way a well-typed `SaveFile` could still stringify into something `parseSave`
    // would refuse. A `null` here just costs the next write its full re-validation.
    lastWrittenRaw = isValidSave(save) ? raw : null;
    return true;
  } catch {
    return false;
  }
}

export function encodeSave(save: SaveFile): string {
  return btoa(JSON.stringify(save));
}

export function decodeSave(text: string): SaveFile | null {
  try {
    const parsed: unknown = JSON.parse(atob(text.trim()));
    return isValidSave(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Swaps the primary and backup slots so a restoration remains reversible. */
export function restoreBackupSlots(): boolean {
  if (typeof localStorage === "undefined") return false;
  const backupRaw = storedRaw(SAVE_BACKUP_KEY);
  if (!parseSave(backupRaw) || !backupRaw) return false;
  try {
    const currentRaw = localStorage.getItem(SAVE_KEY);
    const currentValid = parseSave(currentRaw) !== null;
    localStorage.setItem(SAVE_KEY, backupRaw);
    lastWrittenRaw = null;
    if (currentValid && currentRaw) localStorage.setItem(SAVE_BACKUP_KEY, currentRaw);
    return true;
  } catch {
    return false;
  }
}

export function clearSaveSlots(): void {
  if (typeof localStorage === "undefined") return;
  lastWrittenRaw = null;
  localStorage.removeItem(SAVE_KEY);
  localStorage.removeItem(SAVE_BACKUP_KEY);
}

export interface LoadedSave {
  save: SaveFile | null;
  recoveredFromBackup: boolean;
}

/** Reads the primary slot, then repairs it from the last known-good backup when necessary. */
export function readSave(): LoadedSave {
  if (typeof localStorage === "undefined") return { save: null, recoveredFromBackup: false };
  const primary = parseSave(storedRaw(SAVE_KEY));
  if (primary) return { save: primary, recoveredFromBackup: false };

  const backupRaw = storedRaw(SAVE_BACKUP_KEY);
  const backup = parseSave(backupRaw);
  if (!backup || !backupRaw) return { save: null, recoveredFromBackup: false };
  try {
    localStorage.setItem(SAVE_KEY, backupRaw);
    lastWrittenRaw = null;
  } catch {
    // The valid backup can still boot the session if storage is temporarily full.
  }
  return { save: backup, recoveredFromBackup: true };
}
