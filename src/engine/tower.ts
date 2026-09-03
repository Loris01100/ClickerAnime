import { hashSeed } from "./hash";
import type { Character, Enemy } from "./types";

/**
 * La Tour de l'Ascension — a fixed, hand-shaped climb that runs *beside* the story, modelled on
 * Summoners War's Trial of Ascension (`docs/tower.md`).
 *
 * Everything here is a pure function of a floor number and the cast: no world, no arc, no
 * difficulty scaling, no drop table. That is deliberate. The tower is the one place the game asks
 * "how strong are five of your characters, right now", and the answer has to mean the same thing in
 * every run — so its hp curve is an absolute table, exactly like an arc's authored hp, and its
 * opponents are drawn deterministically from the whole cast rather than rolled.
 */

/** The three ladders Summoners War runs, and how tall each is. Only `easy` is playable for now. */
export type TowerMode = "easy" | "hard" | "hell";

export interface TowerModeConfig {
  id: TowerMode;
  name: string;
  floors: number;
  /** A floor pays a reward when `floor % rewardEvery === 0` — every floor in Hell. */
  rewardEvery: number;
  /** Multiplier on every hp in the ladder. */
  hpMultiplier: number;
  /** Multiplier on every reward the ladder pays. */
  rewardMultiplier: number;
  /** Not yet playable: the mode is listed, and refuses to be entered. See `docs/tower.md`. */
  available: boolean;
}

/**
 * The ladder shape is Summoners War's and stays Summoners War's: 100 / 100 / 10. The counts are
 * data here rather than three constants so a mode can open by flipping `available`, the way a world
 * leaves alpha by flipping `Anime.alpha`.
 */
export const TOWER_MODES: readonly TowerModeConfig[] = [
  { id: "easy", name: "Normal", floors: 100, rewardEvery: 10, hpMultiplier: 1, rewardMultiplier: 1, available: true },
  { id: "hard", name: "Difficile", floors: 100, rewardEvery: 10, hpMultiplier: 60, rewardMultiplier: 8, available: false },
  { id: "hell", name: "Enfer", floors: 10, rewardEvery: 1, hpMultiplier: 4_000, rewardMultiplier: 40, available: false },
];

export function towerModeConfig(mode: TowerMode): TowerModeConfig {
  return TOWER_MODES.find((entry) => entry.id === mode) ?? TOWER_MODES[0];
}

/** Three rounds a floor, five opponents a round, and the last one of the last round is the boss. */
export const TOWER_ROUNDS_PER_FLOOR = 3;
export const TOWER_UNITS_PER_ROUND = 5;
export const TOWER_UNITS_PER_FLOOR = TOWER_ROUNDS_PER_FLOOR * TOWER_UNITS_PER_ROUND;

/** How many characters the player may bring. The whole point of the mode — see `docs/tower.md`. */
export const TOWER_SQUAD_SIZE = 5;

/**
 * The climb resets on a 15-day cycle, rewards included: the tower is a recurring event, not a
 * one-off ladder, which is what stops its payouts from being a single lump the economy never sees
 * again. The cycle is wall-clock, the one place in the game that reads a real date — see
 * `towerCycleOf`, which is careful never to hand back time the player did not live through.
 */
export const TOWER_CYCLE_DAYS = 15;
export const TOWER_CYCLE_MS = TOWER_CYCLE_DAYS * 24 * 60 * 60 * 1_000;

/**
 * A floor is one attempt, on a clock. Enemies never deal damage in this game, so an hp wall alone
 * is only ever "wait longer" — the timer is what turns a floor into a real test of the five
 * characters brought to it. Running out puts the floor back to its first round; nothing else is
 * lost, and the floors already cleared stay cleared.
 */
export const TOWER_FLOOR_TIMER_MS = 180_000;

/** Floor 1's opening opponent, in hp. Every other number in the ladder is derived from it. */
export const TOWER_BASE_HP = 50;
/** Per-floor hp ramp. 1.30^99 spans floor 1 to floor 100 across the game's whole damage range. */
export const TOWER_FLOOR_HP_RAMP = 1.3;
/** Per-round step inside a floor: round 2 is 1.35x round 1, round 3 is 1.35x round 2. */
export const TOWER_ROUND_HP_STEP = 1.35;
/** The last opponent of the last round is a boss, and is worth this many of its own round's mobs. */
export const TOWER_BOSS_HP_MULTIPLIER = 12;

/** Currency paid per point of the floor's opening hp, at a reward floor. */
export const TOWER_CURRENCY_PER_HP = 2;

/** Both of a floor's coordinates: which round, and which of its five slots. Both 0-based. */
export interface TowerPosition {
  round: number;
  slot: number;
}

export const TOWER_START: TowerPosition = { round: 0, slot: 0 };

/** True for the one slot in a floor that is a boss: the last of the last round. */
export function isTowerBoss(position: TowerPosition): boolean {
  return position.round === TOWER_ROUNDS_PER_FLOOR - 1 && position.slot === TOWER_UNITS_PER_ROUND - 1;
}

/** The next slot of the floor, or `null` when the boss has just fallen and the floor is done. */
export function nextTowerPosition(position: TowerPosition): TowerPosition | null {
  if (position.slot + 1 < TOWER_UNITS_PER_ROUND) return { round: position.round, slot: position.slot + 1 };
  if (position.round + 1 < TOWER_ROUNDS_PER_FLOOR) return { round: position.round + 1, slot: 0 };
  return null;
}

/** How far into the floor's fifteen fights this position is, 0..15 — what the floor bar shows. */
export function towerUnitsDone(position: TowerPosition): number {
  return position.round * TOWER_UNITS_PER_ROUND + position.slot;
}

/** The hp of one opponent, before the mode's own multiplier. Absolute, like an arc's authored hp. */
export function towerBaseHp(floor: number, position: TowerPosition): number {
  const floorHp = TOWER_BASE_HP * Math.pow(TOWER_FLOOR_HP_RAMP, Math.max(0, floor - 1));
  const roundHp = floorHp * Math.pow(TOWER_ROUND_HP_STEP, position.round);
  return roundHp * (isTowerBoss(position) ? TOWER_BOSS_HP_MULTIPLIER : 1);
}

export function towerHp(mode: TowerMode, floor: number, position: TowerPosition): number {
  return Math.ceil(towerBaseHp(floor, position) * towerModeConfig(mode).hpMultiplier);
}

/** Everything a floor asks for, summed — what the panel prints as "the wall" before entering. */
export function towerFloorHp(mode: TowerMode, floor: number): number {
  let total = 0;
  let position: TowerPosition | null = TOWER_START;
  while (position) {
    total += towerHp(mode, floor, position);
    position = nextTowerPosition(position);
  }
  return total;
}

/** The dps that clears a floor inside its clock, ignoring the narrator's click. */
export function towerRequiredDps(mode: TowerMode, floor: number): number {
  return towerFloorHp(mode, floor) / (TOWER_FLOOR_TIMER_MS / 1000);
}

/**
 * Who stands on a given slot. Deterministic from the coordinates alone — the same floor is the same
 * floor for every player and on every attempt — and drawn from the *whole* cast, every world mixed
 * together, which is the fiction of the tower: the climb is a crossover.
 *
 * `cast` must be a stable list (the caller sorts it once by id); a boss slot draws from the main
 * cast when there is one, so a floor ends on a name that carries.
 */
export function towerOpponent(
  mode: TowerMode,
  floor: number,
  position: TowerPosition,
  cast: readonly Character[]
): Character | null {
  if (cast.length === 0) return null;
  const boss = isTowerBoss(position);
  const pool = boss ? cast.filter((character) => character.rarity === "main") : cast;
  const source = pool.length > 0 ? pool : cast;
  const seed = hashSeed(`tower:${mode}:${floor}:${position.round}:${position.slot}`);
  return source[seed % source.length];
}

/**
 * The opponent as combat sees it. It carries no `characterId` (nothing is recruited here), no
 * `itemId` (nothing drops here) and no `timerMs` — the clock belongs to the floor, not to one fight
 * — so none of the arc's per-kill machinery can fire on a tower kill by accident.
 */
export function towerEnemy(
  mode: TowerMode,
  floor: number,
  position: TowerPosition,
  cast: readonly Character[]
): Enemy {
  const character = towerOpponent(mode, floor, position, cast);
  return {
    id: `tower-${mode}-${floor}-${position.round}-${position.slot}`,
    name: character?.name ?? "Ombre",
    baseHp: towerHp(mode, floor, position),
    reward: 0,
  };
}

/** True when this floor is one of the ones that pay — every tenth, or every floor in Hell. */
export function isTowerRewardFloor(mode: TowerMode, floor: number): boolean {
  const config = towerModeConfig(mode);
  return floor >= 1 && floor <= config.floors && floor % config.rewardEvery === 0;
}

/**
 * What a reward floor pays. Four currencies, none of which is damage: coins, crossover crystals,
 * pack points and forge fragments. Nothing here multiplies the team's stats, which is what keeps
 * the tower out of the balance the way the automation branch is kept out of it — it pays in things
 * the player already farms, faster, and never in strength the game has not costed.
 */
export interface TowerReward {
  currency: number;
  crystals: number;
  packPoints: number;
  fragments: number;
}

export function towerReward(mode: TowerMode, floor: number): TowerReward {
  if (!isTowerRewardFloor(mode, floor)) return { currency: 0, crystals: 0, packPoints: 0, fragments: 0 };
  const config = towerModeConfig(mode);
  const tier = Math.ceil(floor / config.rewardEvery);
  return {
    currency: Math.ceil(
      towerBaseHp(floor, TOWER_START) * config.hpMultiplier * TOWER_CURRENCY_PER_HP * config.rewardMultiplier
    ),
    crystals: (2 + tier) * config.rewardMultiplier,
    packPoints: 5 * tier * config.rewardMultiplier,
    fragments: (1 + Math.floor(floor / 30)) * config.rewardMultiplier,
  };
}

/** The reward floors of a whole ladder, in order — the panel's trophy shelf. */
export function towerRewardFloors(mode: TowerMode): number[] {
  const config = towerModeConfig(mode);
  const floors: number[] = [];
  for (let floor = config.rewardEvery; floor <= config.floors; floor += config.rewardEvery) floors.push(floor);
  return floors;
}

/** The key one claimed reward is remembered under, so a floor pays once per cycle and per mode. */
export function towerClaimKey(mode: TowerMode, floor: number): string {
  return `${mode}:${floor}`;
}

/**
 * Where the 15-day cycle stands, from the moment it started and the moment it is being read.
 *
 * `startedAt` only ever moves forward by whole cycles, so a clock that jumps back (a timezone
 * change, a machine whose date was wrong) can shorten the current cycle but never hands out an
 * extra reset, and a save left closed for a month resets exactly once rather than twice.
 */
export interface TowerCycle {
  startedAt: number;
  endsAt: number;
  remainingMs: number;
  /** How many whole cycles have elapsed since `startedAt` — non-zero means the climb resets. */
  elapsed: number;
}

export function towerCycleOf(startedAt: number, now: number): TowerCycle {
  const elapsed = Math.max(0, Math.floor((now - startedAt) / TOWER_CYCLE_MS));
  const currentStart = startedAt + elapsed * TOWER_CYCLE_MS;
  return {
    startedAt: currentStart,
    endsAt: currentStart + TOWER_CYCLE_MS,
    remainingMs: Math.max(0, currentStart + TOWER_CYCLE_MS - now),
    elapsed,
  };
}

/**
 * The floors a player may start on: everything already cleared this cycle, plus the next one. A
 * cleared floor can be replayed — it simply pays nothing a second time.
 */
export function towerPlayableFloors(mode: TowerMode, highestCleared: number): number[] {
  const config = towerModeConfig(mode);
  const top = Math.min(config.floors, highestCleared + 1);
  return Array.from({ length: top }, (_, index) => index + 1);
}

/** True when the squad is exactly the five the mode asks for, and every one of them is owned. */
export function isTowerSquadReady(squadIds: readonly string[], ownedIds: readonly string[]): boolean {
  return (
    squadIds.length === TOWER_SQUAD_SIZE &&
    new Set(squadIds).size === TOWER_SQUAD_SIZE &&
    squadIds.every((id) => ownedIds.includes(id))
  );
}
