import { createMemo, createSignal } from "solid-js";
import { achievementCount, type AchievementId } from "../achievements";
import {
  canEquipOn,
  sanitizedEquipment,
  UNIQUE_FORGE_FRAGMENT_COSTS,
  UNIQUE_FORGE_MULTIPLIERS,
  uniqueRanksFromSave,
} from "../forge";
import type { SaveFile } from "../persistence";
import type { Arc, Character, GameData, Item } from "../types";
import type { ContentIndex } from "./content";

export interface InventoryDeps {
  data: GameData;
  content: ContentIndex;
  saved: SaveFile | null;
  achievementCounts: () => Record<string, number>;
  bumpAchievement: (categoryId: AchievementId, amount?: number) => void;
  pushNotice: (kind: "item" | "recruit" | "arc" | "unlock", text: string) => void;
}

/**
 * Everything the player carries: item copies, unique fragments, the forge levels those buy, and
 * who is wearing which unique.
 *
 * Three lifetimes live side by side here, which is the reason they are one slice — a change to one
 * has to be weighed against the other two:
 *  - **copies and fragments** are run state, wiped by `prestigeReset`;
 *  - **forge levels** are permanent mastery: a prestige removes the unique and its fragments, but
 *    the next copy found recovers its level. Only `hardReset` wipes them;
 *  - **equipment** is run state that is also *derived* — `sanitizedEquipment` re-checks every
 *    stored pairing against ownership and `canEquipOn` at boot, so a save can never smuggle a
 *    unique onto a character its world does not allow.
 */
export function createInventory(deps: InventoryDeps) {
  const { data, content, saved } = deps;
  const { itemOf, animeOf, originArcOf, itemAnimeIds } = content;

  const [itemCounts, setItemCounts] = createSignal<Record<string, number>>(saved?.itemCounts ?? {});
  const [uniqueFragments, setUniqueFragments] = createSignal<Record<string, number>>(saved?.uniqueFragments ?? {});
  // Forge levels are permanent mastery. Prestige removes the unique and its fragments, but the
  // next copy found recovers this level. Only hardReset wipes the map.
  const [uniqueUpgradeRanks, setUniqueUpgradeRanks] = createSignal<Record<string, number>>(
    uniqueRanksFromSave(data.items, saved)
  );
  // characterId -> itemId for equipped unique items.
  const [characterEquipment, setCharacterEquipment] = createSignal<Record<string, string>>(
    sanitizedEquipment(
      data.characters,
      data.items,
      data.arcs,
      saved?.characterEquipment,
      saved?.itemCounts ?? {},
      saved?.ownedCharacterIds ?? []
    )
  );

  const countOf = (itemId: string) => itemCounts()[itemId] ?? 0;
  const uniqueFragmentsOf = (itemId: string) => uniqueFragments()[itemId] ?? 0;
  const uniqueUpgradeLevelOf = (itemId: string) => uniqueUpgradeRanks()[itemId] ?? 0;
  const uniqueUpgradeMultiplierOf = (itemId: string) => UNIQUE_FORGE_MULTIPLIERS[uniqueUpgradeLevelOf(itemId)] ?? 0;
  const uniqueUpgradeCostOf = (itemId: string) =>
    UNIQUE_FORGE_FRAGMENT_COSTS[uniqueUpgradeLevelOf(itemId) + 1] ?? null;

  /** Items found this run; wiped by prestige. Forge ranks survive separately. Commons stack. */
  const foundItems = createMemo(() => data.items.filter((i) => (itemCounts()[i.id] ?? 0) > 0));
  const forgeableUniques = createMemo(() =>
    data.items.filter((item) => item.kind === "unique" && countOf(item.id) > 0)
  );

  /**
   * Every unique whose next forge level is payable right now — la contrepartie de
   * `rankablePassiveIds` côté objets. Un seul memo plutôt que le même test recopié dans le panneau
   * de progression et dans la forge : l'entrée de menu n'a besoin que de savoir s'il y en a un, la
   * liste de la forge a besoin de savoir lesquels, et les deux doivent dire la même chose.
   */
  const forgeableNowIds = createMemo(() => {
    const ids = new Set<string>();
    for (const item of forgeableUniques()) {
      const cost = uniqueUpgradeCostOf(item.id);
      if (cost !== null && uniqueFragmentsOf(item.id) >= cost) ids.add(item.id);
    }
    return ids;
  });

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
    // One read of the signal, not one per entry: the `find` callback re-read `characterEquipment()`
    // on every candidate, and the Codex asks this once per unique on screen.
    for (const [characterId, worn] of Object.entries(characterEquipment())) {
      if (worn === itemId) return content.characterOf(characterId);
    }
    return null;
  }

  /** Whether this item can be equipped on this character (ownership, world and restriction checks). */
  function canEquipItem(character: Character, itemId: string): boolean {
    const item = itemOf(itemId);
    if (!item || item.kind !== "unique") return false;
    if ((itemCounts()[itemId] ?? 0) <= 0) return false;
    return canEquipOn(character, item, itemAnimeIds[itemId]);
  }

  /** Equip a unique item on a character, returning true on success. */
  function equipItem(characterId: string, itemId: string): boolean {
    const character = content.characterOf(characterId);
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
    if (!alreadyWorn && achievementCount(deps.achievementCounts(), "uniquesEquipped") < uniquesOwned) {
      deps.bumpAchievement("uniquesEquipped");
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

  /** Grants one copy of an item; counted on pickup, not derived from the stack still held. */
  function grantItem(item: Item) {
    setItemCounts((counts) => ({ ...counts, [item.id]: (counts[item.id] ?? 0) + 1 }));
    if (item.kind === "unique") setUniqueUpgradeRanks((ranks) => ({ ...ranks, [item.id]: ranks[item.id] ?? 1 }));
    if (item.kind === "common") deps.bumpAchievement("commonItemsCollected");
    deps.pushNotice("item", `${item.name} +1`);
  }

  function grantUniqueFragment(item: Item) {
    setUniqueFragments((fragments) => ({ ...fragments, [item.id]: (fragments[item.id] ?? 0) + 1 }));
    deps.pushNotice("item", `Fragment de ${item.name} +1`);
  }

  return {
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
    /** The world an item comes from — where its drop lives, and who may wear it. */
    animeOfItem: (itemId: string) => animeOf(itemAnimeIds[itemId]),
    /** The common item an arc drops — what the pity timer and ghost loot hand out. */
    arcCommonItem: (arc: Arc) => itemOf(arc.mobs.find((m) => m.itemId)?.itemId),
    /** The common item that ranks up this character's passive, i.e. the one their home arc drops. */
    passiveItemOf(character: Character): Item | null {
      const arc = originArcOf(character.id);
      return itemOf(arc?.mobs.find((m) => m.itemId)?.itemId);
    },
    passiveCopiesOf(character: Character): number {
      const arc = originArcOf(character.id);
      const item = itemOf(arc?.mobs.find((m) => m.itemId)?.itemId);
      return item ? countOf(item.id) : 0;
    },
    /** Copies bought at the shop, and copies spent on a passive rank — the only two ways they move. */
    addCopies: (itemId: string, amount: number) =>
      setItemCounts((counts) => ({ ...counts, [itemId]: (counts[itemId] ?? 0) + amount })),
    spendCopies: (itemId: string, amount: number) =>
      setItemCounts((counts) => ({ ...counts, [itemId]: (counts[itemId] ?? 0) - amount })),
    /** A prestige takes the stock and the equipment; the forge levels it leaves alone. */
    resetRun() {
      setItemCounts({});
      setUniqueFragments({});
      setCharacterEquipment({});
    },
    /** Only a hard reset also gives back the mastery the forge represents. */
    resetAll() {
      this.resetRun();
      setUniqueUpgradeRanks({});
    },
  };
}
