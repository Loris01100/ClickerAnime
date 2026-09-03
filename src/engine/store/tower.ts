import { createMemo, createSignal } from "solid-js";
import type { AchievementId } from "../achievements";
import { damageMultiplierAgainst, type DamageSource } from "../combat";
import type { SaveFile } from "../persistence";
import {
  isTowerRewardFloor,
  isTowerSquadReady,
  nextTowerPosition,
  isTowerBoss,
  TOWER_BOSS_TIMER_MS,
  TOWER_FLOOR_TIMER_MS,
  TOWER_SQUAD_SIZE,
  TOWER_START,
  towerClaimKey,
  towerCycleOf,
  towerEnemy,
  towerHp,
  towerModeConfig,
  towerOpponent,
  towerReward,
  towerUnitsDone,
  type TowerCycle,
  type TowerMode,
  type TowerPosition,
  type TowerReward,
} from "../tower";
import type { Character, Enemy, Item } from "../types";

/** Safety net on the overkill loop, the same role `MAX_KILLS_PER_HIT` plays in the arc. */
const MAX_KILLS_PER_HIT = 32;

export interface TowerDeps {
  saved: SaveFile | null;
  /** All of `data.characters`, which the slice sorts once into the ladder's stable cast. */
  cast: readonly Character[];
  now: () => number;
  ownedCharacterIds: () => string[];
  ownedCharacters: () => Character[];
  /** A character's own contribution to `teamDps`, exactly as the roster prints it. */
  characterStatOf: (character: Character, target: "teamDps" | "clickPower") => number;
  /** Uniques the run has actually found — the only items a fragment reward may target. */
  foundItems: () => Item[];
  uniqueFragmentsOf: (itemId: string) => number;
  grantUniqueFragment: (item: Item) => void;
  grantCurrency: (amount: number) => void;
  grantCrystals: (amount: number) => void;
  grantPackPoints: (amount: number) => void;
  bumpAchievement: (categoryId: AchievementId, amount?: number) => void;
  pushNotice: (kind: "item" | "recruit" | "arc" | "unlock", text: string) => void;
}

/**
 * La Tour de l'Ascension — the climb's state, and the only place its fight is resolved.
 *
 * It is a second, deliberately smaller combat model, and the four rules that keep it from
 * disturbing the first one all live here:
 *  - **it is fought by five characters, not by the team.** `squadDps` sums `characterStatOf` over
 *    the chosen five, so a tower fight can never be won by a roster the player never chose from;
 *  - **nothing is farmed inside it.** A tower kill pays no currency, no xp, no item, no crystal and
 *    no pack point — that is why it needs no kill-rate cap, unlike the arc (`MAX_KILLS_PER_SECOND`).
 *    The whole payout is the reward floors, once each per cycle;
 *  - **the fight is never saved.** Only the floors cleared, the squad, the claims and the cycle are
 *    — the round on screen goes the way every other fight in the game goes, on reload;
 *  - **it never grants strength.** Its four currencies are ones the player already farms.
 */
export function createTower(deps: TowerDeps) {
  const { saved } = deps;

  /** Stable across runs and machines: `towerOpponent` indexes into it, so its order is the ladder. */
  const cast = [...deps.cast].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // --- saved: the climb, the squad, the claims, the cycle ---
  const [towerFloors, setTowerFloors] = createSignal<Record<string, number>>(saved?.towerFloors ?? {});
  const [towerSquadIds, setTowerSquadIds] = createSignal<string[]>(saved?.towerSquadIds ?? []);
  const [towerClaimed, setTowerClaimed] = createSignal<string[]>(saved?.towerClaimed ?? []);
  const [towerCycleStartedAt, setTowerCycleStartedAt] = createSignal<number>(
    saved?.towerCycleStartedAt ?? Date.now()
  );

  // --- transient: the attempt in progress, forgotten on reload like every other fight ---
  const [activeMode, setActiveMode] = createSignal<TowerMode | null>(null);
  const [floor, setFloor] = createSignal(1);
  const [position, setPosition] = createSignal<TowerPosition>(TOWER_START);
  const [enemy, setEnemy] = createSignal<Enemy | null>(null);
  const [hpLeft, setHpLeft] = createSignal(0);
  const [maxHp, setMaxHp] = createSignal(0);
  const [deadline, setDeadline] = createSignal<number | null>(null);
  /**
   * L'horloge du boss, distincte de celle de l'étage : elle démarre quand il apparaît et ne dure que
   * `TOWER_BOSS_TIMER_MS`. Les deux tournent ensemble et la première échue remet l'étage à la manche
   * 1 — arriver sur le boss très en avance ne rallonge donc jamais le combat qui compte.
   */
  const [bossDeadline, setBossDeadline] = createSignal<number | null>(null);
  /** Set when the clock runs out, so the panel can say why the floor went back to its first round. */
  const [lastFailure, setLastFailure] = createSignal<{ floor: number; at: number } | null>(null);

  const inTower = () => activeMode() !== null;

  const highestFloorOf = (mode: TowerMode) => towerFloors()[mode] ?? 0;

  /** Where the 15-day cycle stands right now — the panel's countdown reads this. */
  const cycle = createMemo<TowerCycle>(() => towerCycleOf(towerCycleStartedAt(), deps.now()));

  /**
   * The reset itself. Called from the tick rather than from `cycle`, because a memo may not write:
   * `cycle` only ever *reports* that whole cycles have elapsed, and this is what acts on it.
   * `startedAt` moves forward by whole cycles (see `towerCycleOf`), so a save left closed for a
   * month resets once, not twice.
   */
  function refreshCycle() {
    const current = cycle();
    if (current.elapsed === 0) return;
    setTowerCycleStartedAt(current.startedAt);
    setTowerFloors({});
    setTowerClaimed([]);
    leaveTower();
    deps.pushNotice("unlock", "La Tour de l’Ascension a été réinitialisée : les paliers repaient.");
  }

  /**
   * Les quinze adversaires de l'étage en cours, dans l'ordre. Un mémo plutôt qu'un tirage par
   * combat : c'est ce qui permet à l'écran de précharger les portraits de tout l'étage d'un coup au
   * lieu d'en découvrir un toutes les deux secondes, et de nommer le monde d'où sort chaque
   * adversaire (`Sprite` cherche dans le casting de ce show-là, pas dans tout AniList).
   */
  const floorOpponents = createMemo<(Character | null)[]>(() => {
    const mode = activeMode();
    if (!mode) return [];
    const list: (Character | null)[] = [];
    let at: TowerPosition | null = TOWER_START;
    while (at) {
      list.push(towerOpponent(mode, floor(), at, cast));
      at = nextTowerPosition(at);
    }
    return list;
  });

  const squad = createMemo(() => {
    const owned = new Map(deps.ownedCharacters().map((character) => [character.id, character]));
    return towerSquadIds()
      .map((id) => owned.get(id))
      .filter((character): character is Character => !!character);
  });

  /**
   * What the five bring, and the only dps the tower ever applies. It is the sum of the very column
   * the roster prints per character, so the panel's total and the roster's rows agree to the bit —
   * synergy, passives, equipment, evolutions and every team-wide bonus included, as measured in the
   * arc the player is standing in.
   */
  const squadDps = createMemo(() =>
    squad().reduce((sum, character) => sum + deps.characterStatOf(character, "teamDps"), 0)
  );

  const squadReady = () => isTowerSquadReady(towerSquadIds(), deps.ownedCharacterIds());

  /** Adds or removes one character; refuses a sixth rather than silently dropping the first. */
  function toggleSquadMember(characterId: string): boolean {
    if (towerSquadIds().includes(characterId)) {
      setTowerSquadIds((ids) => ids.filter((id) => id !== characterId));
      return true;
    }
    if (towerSquadIds().length >= TOWER_SQUAD_SIZE) return false;
    if (!deps.ownedCharacterIds().includes(characterId)) return false;
    setTowerSquadIds((ids) => [...ids, characterId]);
    return true;
  }

  /** Puts the opponent of `position` on the floor's stage, at full hp — and arms the boss's clock. */
  function spawn() {
    const mode = activeMode();
    if (!mode) return;
    const next = towerEnemy(mode, floor(), position(), cast);
    const hp = towerHp(mode, floor(), position());
    setEnemy(next);
    setMaxHp(hp);
    setHpLeft(hp);
    // La durée vient de l'ennemi lui-même (`Enemy.timerMs`), comme dans l'arc : seule la case du
    // boss en porte une, les quatorze autres n'ont que l'horloge de l'étage au-dessus d'elles.
    setBossDeadline(next.timerMs ? deps.now() + next.timerMs : null);
  }

  /** Restarts the floor at its first round, with a fresh clock. The climb itself is untouched. */
  function restartFloor() {
    setPosition(TOWER_START);
    setDeadline(deps.now() + TOWER_FLOOR_TIMER_MS);
    spawn();
  }

  /** Remet l'étage à la manche 1 et dit pourquoi — les deux horloges finissent ici. */
  function failFloor(nowMs: number, reason: string) {
    setLastFailure({ floor: floor(), at: nowMs });
    deps.pushNotice("arc", `Étage ${floor()} : ${reason}, l’étage repart de la manche 1.`);
    restartFloor();
  }

  /**
   * Steps into a floor. Refuses anything past the next uncleared one, an incomplete squad, and a
   * mode that is not open yet — the three things that would otherwise let the ladder be skipped.
   */
  function enterTower(mode: TowerMode, target: number): boolean {
    const config = towerModeConfig(mode);
    if (!config.available) return false;
    if (!squadReady()) return false;
    if (target < 1 || target > config.floors) return false;
    if (target > highestFloorOf(mode) + 1) return false;
    setActiveMode(mode);
    setFloor(target);
    setLastFailure(null);
    restartFloor();
    return true;
  }

  /** Walks out. The arc was never touched while the player was in here, so there is nothing to put back. */
  function leaveTower() {
    setActiveMode(null);
    setEnemy(null);
    setDeadline(null);
    setBossDeadline(null);
    setHpLeft(0);
    setMaxHp(0);
  }

  /**
   * Pays a reward floor, once per mode per cycle. The fragment share targets the found unique the
   * run has fewest fragments of — deterministic on purpose, since `Math.random` is `gameState`'s
   * alone — and is simply skipped when nothing has been found yet.
   */
  function claimReward(mode: TowerMode, cleared: number): TowerReward | null {
    if (!isTowerRewardFloor(mode, cleared)) return null;
    const key = towerClaimKey(mode, cleared);
    if (towerClaimed().includes(key)) return null;
    const reward = towerReward(mode, cleared);
    setTowerClaimed((keys) => [...keys, key]);
    if (reward.currency > 0) deps.grantCurrency(reward.currency);
    if (reward.crystals > 0) deps.grantCrystals(reward.crystals);
    if (reward.packPoints > 0) deps.grantPackPoints(reward.packPoints);
    if (reward.fragments > 0) {
      const target = deps
        .foundItems()
        .filter((item) => item.kind === "unique")
        .sort(
          (a, b) =>
            deps.uniqueFragmentsOf(a.id) - deps.uniqueFragmentsOf(b.id) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
        )[0];
      if (target) for (let i = 0; i < reward.fragments; i++) deps.grantUniqueFragment(target);
    }
    return reward;
  }

  /** The floor's boss is down: the climb advances, the floor pays if it is one that pays. */
  function clearFloor() {
    const mode = activeMode();
    if (!mode) return;
    const cleared = floor();
    const config = towerModeConfig(mode);
    if (cleared > highestFloorOf(mode)) setTowerFloors((floors) => ({ ...floors, [mode]: cleared }));
    deps.bumpAchievement("bossesKilled");
    const reward = claimReward(mode, cleared);
    if (reward) {
      deps.pushNotice("unlock", `Palier ${cleared} : ${reward.crystals} cristaux, ${reward.packPoints} points de pack`);
    } else {
      deps.pushNotice("arc", `Étage ${cleared} franchi`);
    }
    // Straight on to the next floor, with a clean clock — the climb is the mode's whole loop. The
    // top of the ladder is the one place it stops, and the player is told rather than left standing
    // on a floor that cannot advance.
    if (cleared >= config.floors) {
      deps.pushNotice("unlock", `Tour de l’Ascension terminée en ${config.name} !`);
      leaveTower();
      return;
    }
    setFloor(cleared + 1);
    restartFloor();
  }

  /**
   * One swing against the floor. Mirrors the arc's `dealDamage` — overkill carries into the next
   * opponent, so a squad that outguns a floor walks through its rounds — minus the kill budget,
   * which exists to cap per-kill *rewards*, and a tower kill pays nothing.
   */
  function hit(amount: number, source: DamageSource): number {
    if (!inTower() || !enemy() || amount <= 0) return 0;
    const first = enemy()!;
    const reported = amount * damageMultiplierAgainst(first, source);
    let remaining = amount;
    for (let kills = 0; kills < MAX_KILLS_PER_HIT; kills++) {
      const target = enemy();
      if (!target || remaining <= 0) break;
      const multiplier = damageMultiplierAgainst(target, source);
      const left = hpLeft() - remaining * multiplier;
      if (left > 0) {
        setHpLeft(left);
        remaining = 0;
        break;
      }
      remaining = multiplier > 0 ? -left / multiplier : 0;
      const next = nextTowerPosition(position());
      if (!next) {
        clearFloor();
        // The floor's own reward and the next floor's first opponent are already on screen; the
        // leftover damage is dropped rather than carried into a floor the player has not started
        // fighting yet.
        return reported;
      }
      setPosition(next);
      spawn();
    }
    return reported;
  }

  /**
   * Les deux horloges. L'une comme l'autre ne coûte que la tentative — voir `TOWER_FLOOR_TIMER_MS` et
   * `TOWER_BOSS_TIMER_MS`. Celle du boss est testée d'abord : quand elle est armée, c'est toujours
   * elle qui échoit en premier, et le message doit nommer le vrai coupable.
   */
  function checkTimer(nowMs: number) {
    if (!inTower()) return;
    const bossEnd = bossDeadline();
    if (bossEnd !== null && nowMs >= bossEnd) {
      failFloor(nowMs, `le boss a tenu ${TOWER_BOSS_TIMER_MS / 1000} s`);
      return;
    }
    const end = deadline();
    if (end !== null && nowMs >= end) failFloor(nowMs, "temps écoulé");
  }

  // Le cycle est vérifié dès le démarrage, pas seulement au premier tick : une partie rouverte
  // après trois semaines doit s'ouvrir sur une tour déjà réinitialisée, pas sur l'ancienne grimpe
  // qui disparaît 200 ms plus tard sous les yeux du joueur.
  refreshCycle();

  return {
    // saved state, for `buildSaveFile`
    towerFloors,
    towerSquadIds,
    towerClaimed,
    towerCycleStartedAt,
    // the climb
    towerModeOf: towerModeConfig,
    towerCycle: cycle,
    refreshCycle,
    towerHighestFloorOf: highestFloorOf,
    towerRewardClaimed: (mode: TowerMode, target: number) => towerClaimed().includes(towerClaimKey(mode, target)),
    // the squad
    towerSquad: squad,
    towerSquadDps: squadDps,
    towerSquadReady: squadReady,
    toggleTowerSquadMember: toggleSquadMember,
    // the attempt
    inTower,
    towerActiveMode: activeMode,
    towerFloor: floor,
    towerPosition: position,
    towerRound: () => position().round,
    towerUnitsDone: () => towerUnitsDone(position()),
    towerEnemy: enemy,
    towerFloorOpponents: floorOpponents,
    /** Le personnage qui se tient en face, pour ce que l'ennemi de combat ne porte pas : son monde. */
    towerOpponent: () => floorOpponents()[towerUnitsDone(position())] ?? null,
    towerHpLeft: hpLeft,
    towerMaxHp: maxHp,
    towerTimeLeft: () => (deadline() === null ? null : Math.max(0, deadline()! - deps.now())),
    /** Le temps qu'il reste au boss, ou `null` tant qu'on n'est pas devant lui. */
    towerBossTimeLeft: () => (bossDeadline() === null ? null : Math.max(0, bossDeadline()! - deps.now())),
    towerOnBoss: () => inTower() && isTowerBoss(position()),
    towerLastFailure: lastFailure,
    enterTower,
    leaveTower,
    towerHit: hit,
    towerCheckTimer: checkTimer,

    /**
     * The squad, the claims and the climb are meta-progression: only `hardReset` clears them, and
     * the cycle starts over with them. A prestige leaves the tower exactly where it was — the
     * roster it is fought with is what the reset takes, and `squad` already filters to owned
     * characters, so a wiped roster reads as an empty squad rather than a phantom one.
     */
    reset() {
      leaveTower();
      setTowerFloors({});
      setTowerSquadIds([]);
      setTowerClaimed([]);
      setTowerCycleStartedAt(Date.now());
      setLastFailure(null);
    },
  };
}
