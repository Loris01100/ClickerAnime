import { createSignal } from "solid-js";
import {
  decodeSave,
  encodeSave,
  hasValidBackup,
  restoreBackupSlots,
  type SaveFile,
  SAVE_VERSION,
  writeSave,
} from "../persistence";

export interface SaveIODeps {
  /** Assembles the live signals into the save shape. `persistence.ts` owns the shape itself. */
  buildSaveFile: () => Omit<SaveFile, "version">;
  /**
   * Run before every write: the portal fight in progress is the one piece of combat a save has to
   * catch up with first (see `syncPortalDamage`).
   */
  beforeWrite: () => void;
}

/**
 * Writing, exporting, importing and restoring the save.
 *
 * It deliberately owns none of the game's state — `buildSaveFile` is handed in, because assembling
 * the live signals is the assembler's job and redefining the format is `persistence.ts`'s. What
 * lives here is the *timing*: when a write may happen, and the one guard that makes an import
 * stick.
 */
export function createSaveIO(deps: SaveIODeps) {
  const [hasBackupSave, setHasBackupSave] = createSignal(hasValidBackup());
  // When the last autosave landed, so the topbar can say so — a silent autosave is indistinguishable
  // from a broken one. 0 until the first write; `save()` is the only thing that sets it.
  const [lastSavedAt, setLastSavedAt] = createSignal(0);

  // An import deliberately reloads the page after replacing localStorage. `pagehide` and Solid's
  // cleanup both call `save()` during that reload; without this guard they immediately wrote the
  // still-running old signals over the imported file, making a successful import look ignored.
  let importedSavePendingReload = false;

  const snapshot = (): SaveFile => ({ version: SAVE_VERSION, ...deps.buildSaveFile() });
  const noteBackup = () => setHasBackupSave(true);

  /** Replaces localStorage and reloads — the only way an import or a restore gets every signal in sync. */
  function replaceAndReload(write: () => boolean): boolean {
    importedSavePendingReload = true;
    if (!write()) {
      importedSavePendingReload = false;
      return false;
    }
    if (typeof location !== "undefined") location.reload();
    return true;
  }

  return {
    hasBackupSave,
    lastSavedAt,
    save() {
      if (importedSavePendingReload) return;
      deps.beforeWrite();
      if (writeSave(snapshot(), noteBackup)) setLastSavedAt(Date.now());
    },
    /** A portable blob the player can download and hand back later — the shape `readSave` trusts. */
    exportSave: () => encodeSave(snapshot()),
    /**
     * Loads a blob produced by `exportSave`. Writing straight to localStorage and reloading is the
     * simplest way to get every signal back in sync, rather than exposing a setter per field.
     */
    importSave(text: string): boolean {
      const parsed = decodeSave(text);
      if (!parsed) return false;
      return replaceAndReload(() => writeSave(parsed, noteBackup));
    },
    /**
     * Swaps the current and backup slots so restoring is reversible until the next autosave. A bad
     * current slot is simply replaced; it is never allowed to destroy the valid backup.
     */
    restoreBackup: () => replaceAndReload(restoreBackupSlots),
    /** A hard reset has just emptied both slots, so there is no backup to offer any more. */
    forgetBackup: () => setHasBackupSave(false),
  };
}
