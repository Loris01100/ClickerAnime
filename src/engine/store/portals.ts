import { createSignal } from "solid-js";
import type { AchievementId } from "../achievements";
import { canRecruitUnder, type ChallengeRules } from "../challenges";
import { PORTAL_COST, portalEnemy, portalFightHp } from "../crossover";
import type { SaveFile } from "../persistence";
import type { Arc, Character, Enemy } from "../types";
import type { ContentIndex } from "./content";

/**
 * One boss recruit as the crossover panel sees it: the fight that stands between the player and a
 * character a boss no longer hands out. `open` means the crystals are paid and the fight exists,
 * with `damage` of `maxHp` already taken off it.
 */
export interface PortalTarget {
  character: Character;
  arc: Arc;
  cost: number;
  open: boolean;
  maxHp: number;
  damage: number;
  affordable: boolean;
  active: boolean;
}

export interface PortalDeps {
  content: ContentIndex;
  saved: SaveFile | null;
  clearedArcIds: () => string[];
  ownedCharacterIds: () => string[];
  challengeRules: () => ChallengeRules;
  teamDps: () => number;
  crossoverCrystals: () => number;
  spendCrystals: (amount: number) => void;
  recruit: (characterId: string) => void;
  bumpAchievement: (categoryId: AchievementId, amount?: number) => void;
  pushNotice: (kind: "item" | "recruit" | "arc" | "unlock", text: string) => void;
  /** The fight on screen, which a portal takes over while the player stands in one. */
  enemyMaxHp: () => number;
  enemyHpLeft: () => number;
  showEnemy: (enemy: Enemy, maxHp: number, hpLeft: number) => void;
  /** Puts the arc's own enemy back — `spawnNext`, which asks this slice first. */
  spawnArcEnemy: () => void;
  cancelPendingAutomation: () => void;
}

/**
 * Crossover portals: the only way a boss's character is ever recruited.
 *
 * Beating a boss in its arc clears the arc and drops its unique; the character stays behind until
 * the player pays crystals to re-open the fight as a portal and fells it a second time, sealed and
 * on their own terms (`docs/economy.md`). Four rules make it stay out of the balance, and they are
 * all enforced here:
 *  - a portal only exists for an arc the run has **already cleared** — it re-opens a fight, never
 *    skips one;
 *  - its hp is a **photograph** of the team's dps at the moment the crystals were paid, frozen in
 *    `portalHp` and never recomputed: a portal left for later is the reward for having grown since;
 *  - it pays in **exactly one thing**, the recruit — no currency, no xp, no drop, no arc progress;
 *  - it has **no clock**, because it is meant to be walked out of and come back to. That last one is
 *    why `portalDamage` is the single exception to "combat state is never saved": it is progress
 *    towards a recruit, not the enemy on screen.
 */
export function createPortals(deps: PortalDeps) {
  const { content, saved } = deps;
  const { characterOf, portalIndex, portalWeightByArc } = content;

  // Keyed by the character they recruit. Both run-scoped like the roster they feed: `prestigeReset`
  // wipes them, and so does `hardReset`.
  const [portalHp, setPortalHp] = createSignal<Record<string, number>>(saved?.portalHp ?? {});
  const [portalDamage, setPortalDamage] = createSignal<Record<string, number>>(saved?.portalDamage ?? {});
  // Which portal is being fought right now — transient like the rest of combat state, so a reload
  // puts the player back in their arc with the portal's progress intact.
  const [activePortalId, setActivePortalId] = createSignal<string | null>(null);

  /** What this character's portal costs, from their rarity alone — main cast, or a detour. */
  const portalCostOf = (characterId: string) => PORTAL_COST[characterOf(characterId)?.rarity ?? "secondary"];

  /** True once the crystals are paid: the fight exists and keeps whatever damage it has taken. */
  const portalIsOpen = (characterId: string) => portalHp()[characterId] !== undefined;

  const forget = (map: Record<string, number>, characterId: string) => {
    const { [characterId]: _spent, ...rest } = map;
    return rest;
  };

  /** Puts the sealed boss in front of the player, at whatever hp the last visit left it. */
  function spawnPortal() {
    const characterId = activePortalId();
    const arc = characterId ? portalIndex.get(characterId) : null;
    if (!characterId || !arc) return;
    const maxHp = portalHp()[characterId] ?? 0;
    deps.showEnemy(portalEnemy(arc.boss), maxHp, Math.max(0, maxHp - (portalDamage()[characterId] ?? 0)));
  }

  /**
   * Writes the damage taken off the portal boss back into the saved map. Called from the tick and
   * before every save rather than from `dealDamage`: the fight only has to survive a reload, not be
   * recorded hit by hit, and a per-hit write would rebuild the map twenty times a second.
   */
  function syncPortalDamage() {
    const characterId = activePortalId();
    if (!characterId) return;
    const done = Math.max(0, deps.enemyMaxHp() - deps.enemyHpLeft());
    setPortalDamage((map) => (map[characterId] === done ? map : { ...map, [characterId]: done }));
  }

  return {
    portalHp,
    portalDamage,
    activePortalId,
    portalCostOf,
    portalIsOpen,
    spawnPortal,
    syncPortalDamage,

    /**
     * Every portal the run could care about: one per boss recruit whose arc has been cleared and
     * who has not joined yet. An arc that was never cleared is not on the list at all.
     */
    portalTargets(): PortalTarget[] {
      const cleared = new Set(deps.clearedArcIds());
      const owned = new Set(deps.ownedCharacterIds());
      const crystals = deps.crossoverCrystals();
      const hp = portalHp();
      const damage = portalDamage();
      const targets: PortalTarget[] = [];
      for (const [characterId, arc] of portalIndex) {
        if (owned.has(characterId) || !cleared.has(arc.id)) continue;
        const character = characterOf(characterId);
        if (!character) continue;
        const cost = PORTAL_COST[character.rarity];
        targets.push({
          character,
          arc,
          cost,
          open: hp[characterId] !== undefined,
          maxHp: hp[characterId] ?? 0,
          damage: damage[characterId] ?? 0,
          affordable: crystals >= cost,
          active: activePortalId() === characterId,
        });
      }
      return targets.sort((a, b) => a.arc.order - b.arc.order);
    },

    /**
     * Pays for a portal and freezes what it will cost to win. The hp is a photograph of the team's
     * dps *now* (see `portalFightHp`): a portal left for later is the reward for having grown since.
     */
    openPortal(characterId: string): boolean {
      const arc = portalIndex.get(characterId);
      if (!arc || portalIsOpen(characterId)) return false;
      if (deps.ownedCharacterIds().includes(characterId)) return false;
      if (!deps.clearedArcIds().includes(arc.id)) return false;
      // A run under "En petit comité" would pay for a recruit it is not allowed to take.
      if (!canRecruitUnder(deps.challengeRules(), deps.ownedCharacterIds().length)) return false;
      const cost = portalCostOf(characterId);
      if (deps.crossoverCrystals() < cost) return false;
      deps.spendCrystals(cost);
      setPortalHp((map) => ({ ...map, [characterId]: portalFightHp(deps.teamDps(), portalWeightByArc[arc.id] ?? 1) }));
      setPortalDamage((map) => ({ ...map, [characterId]: 0 }));
      deps.pushNotice("unlock", `Portail ouvert : ${characterOf(characterId)?.name ?? characterId}`);
      return true;
    },

    /** Steps into an open portal. The arc keeps its place; leaving puts the player straight back. */
    enterPortal(characterId: string): boolean {
      if (!portalIsOpen(characterId) || deps.ownedCharacterIds().includes(characterId)) return false;
      if (!canRecruitUnder(deps.challengeRules(), deps.ownedCharacterIds().length)) return false;
      setActivePortalId(characterId);
      deps.cancelPendingAutomation();
      spawnPortal();
      return true;
    },

    /** Steps back out into the arc, keeping the damage already dealt. */
    leavePortal(): boolean {
      if (!activePortalId()) return false;
      syncPortalDamage();
      setActivePortalId(null);
      deps.spawnArcEnemy();
      return true;
    },

    /** The portal falls: the character joins, and the portal itself is spent. */
    winPortal(characterId: string) {
      const character = characterOf(characterId);
      setActivePortalId(null);
      setPortalHp((map) => forget(map, characterId));
      setPortalDamage((map) => forget(map, characterId));
      if (canRecruitUnder(deps.challengeRules(), deps.ownedCharacterIds().length)) {
        deps.recruit(characterId);
        deps.bumpAchievement("charactersRecruited");
        deps.pushNotice("recruit", `${character?.name ?? characterId} rejoint l'équipe`);
      }
      deps.bumpAchievement("bossesKilled");
      deps.spawnArcEnemy();
    },

    /**
     * Both resets take the portals with the roster they feed. A hard reset that left them behind
     * kept the player standing in a fight it had just erased, and the next autosave wrote
     * `portalHp`/`portalDamage` back into a save meant to be new.
     */
    reset() {
      setActivePortalId(null);
      setPortalHp({});
      setPortalDamage({});
    },
  };
}
