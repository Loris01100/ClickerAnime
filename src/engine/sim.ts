import { createRoot } from "solid-js";
import { createGameStore, type GameData, type GameStore } from "./gameState";
import { PACK_COST } from "./packs";
import type { Arc } from "./types";

/**
 * Headless auto-player over the real store.
 *
 * Balance in an idle game is a question about *pacing* — how long an arc takes, how many copies of
 * a common a kill actually yields, what a full run banks in prestige — and none of those can be
 * read off a constant. This drives `createGameStore` itself rather than re-deriving the rules, so
 * the numbers it prints are the ones a player would live: the kill budget, the drop rolls, the
 * synergy malus, the xp curve and the boss clock all apply exactly as they do in the browser.
 *
 * Everything the store reaches for is faked: the clock, `setInterval`, `localStorage` and
 * `Math.random` (seeded, so a run is reproducible and two constants can be compared honestly).
 * Nothing here touches the real environment — `restore()` puts it all back.
 */

const TICK_MS = 200;
const MINUTE_MS = 60_000;
/** How often the slower policies run, in ticks — equipping and pack-buying don't need 5Hz. */
const HOUSEKEEPING_EVERY = 25;

export interface SimOptions {
  /** How fast the simulated player clicks. The click is a trigger, so this is a cadence, not dps. */
  clicksPerSecond: number;
  /** Simulated game time the run may take before it is cut off. */
  maxMinutes: number;
  /** An arc that is not cleared within this long is called a wall and stops the run. */
  stallMinutes: number;
  seed: number;
  /** Which world to start on. Defaults to the first entry point in the data. */
  entryAnimeId: string | null;
  packs: boolean;
  abilities: boolean;
  equip: boolean;
  rankPassives: boolean;
}

export const defaultSimOptions: SimOptions = {
  clicksPerSecond: 4,
  maxMinutes: 240,
  stallMinutes: 30,
  seed: 1,
  entryAnimeId: null,
  packs: true,
  abilities: true,
  equip: true,
  rankPassives: true,
};

export interface ArcReport {
  world: string;
  arc: string;
  /** Difficulty multiplier the world was entered at — the frozen tier, not the live one. */
  difficulty: number;
  minutes: number;
  kills: number;
  commons: number;
  /** Copies of the arc's common per kill — the number the drop-rate constants are really about. */
  copiesPerKill: number;
  teamSize: number;
  avgLevel: number;
  teamDps: number;
  clickPower: number;
  bossTimeouts: number;
  lifetimeEarned: number;
}

export interface SimReport {
  options: SimOptions;
  arcs: ArcReport[];
  totals: {
    minutes: number;
    arcsCleared: number;
    arcsTotal: number;
    completion: number;
    lifetimeEarned: number;
    prestigeGain: number;
    teamSize: number;
    /** Set when the run hit a wall: the arc it could not get through. */
    stalledOn: string | null;
    /** Set when the run ran out of its time budget with arcs still open. */
    outOfTime: boolean;
  };
}

// --- the faked environment ---------------------------------------------------------------------

interface FakeInterval {
  fn: () => void;
  delay: number;
  nextAt: number;
}

type Mutable = Record<string, unknown>;

function createClock(seed: number) {
  let nowMs = 1_700_000_000_000;
  let nextId = 1;
  let rng = seed >>> 0;
  const intervals = new Map<number, FakeInterval>();
  const saved = new Map<string, string>();

  const g = globalThis as unknown as Mutable;
  const realDateNow = Date.now;
  const realRandom = Math.random;
  const realSetInterval = g.setInterval;
  const realClearInterval = g.clearInterval;
  const hadLocalStorage = "localStorage" in g;
  const realLocalStorage = g.localStorage;

  /** mulberry32 — small, seeded, and good enough for drop rolls. */
  function random(): number {
    rng = (rng + 0x6d2b79f5) >>> 0;
    let t = rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function install() {
    Date.now = () => nowMs;
    Math.random = random;
    g.setInterval = (fn: () => void, delay: number) => {
      const id = nextId++;
      const every = Math.max(1, delay);
      intervals.set(id, { fn, delay: every, nextAt: nowMs + every });
      return id;
    };
    g.clearInterval = (id: number) => void intervals.delete(id);
    g.localStorage = {
      get length() {
        return saved.size;
      },
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => void saved.set(key, String(value)),
      removeItem: (key: string) => void saved.delete(key),
      clear: () => saved.clear(),
      key: (index: number) => [...saved.keys()][index] ?? null,
    };
  }

  function restore() {
    Date.now = realDateNow;
    Math.random = realRandom;
    g.setInterval = realSetInterval;
    g.clearInterval = realClearInterval;
    if (hadLocalStorage) g.localStorage = realLocalStorage;
    else delete g.localStorage;
  }

  /** Move the clock forward, firing every interval that comes due on the way — the store tick. */
  function advance(ms: number) {
    const target = nowMs + ms;
    for (;;) {
      let due: FakeInterval | null = null;
      for (const interval of intervals.values()) {
        if (interval.nextAt <= target && (!due || interval.nextAt < due.nextAt)) due = interval;
      }
      if (!due) break;
      nowMs = due.nextAt;
      due.nextAt += due.delay;
      due.fn();
    }
    nowMs = target;
  }

  return { install, restore, advance, now: () => nowMs };
}

// --- the auto-player ---------------------------------------------------------------------------

/** Lifetime kills and commons, the two counters an arc yield is measured between. */
function counters(game: GameStore) {
  const counts = game.achievementCounts();
  return {
    kills: (counts.mobsKilled ?? 0) + (counts.bossesKilled ?? 0),
    commons: counts.commonItemsCollected ?? 0,
  };
}

function fireAbilities(game: GameStore) {
  for (const unlocked of game.unlockedAbilities()) {
    if (game.abilityCooldownRemaining(unlocked.ability.id) === 0) game.activateAbility(unlocked.ability.id);
  }
}

function rankUpPassives(game: GameStore) {
  for (const character of game.ownedCharacters()) {
    // Greedy: the copies of an arc common only ever rank up characters met in that arc anyway.
    while (game.passiveUpgradeOf(character).affordable) {
      if (!game.rankUpPassive(character)) break;
    }
  }
}

function equipUniques(game: GameStore) {
  for (const item of game.foundItems()) {
    if (item.kind !== "unique") continue;
    const team = game.ownedCharacters();
    if (team.some((c) => game.equippedItemOf(c)?.id === item.id)) continue;
    const candidate = team.find((c) => !game.equippedItemOf(c) && game.canEquipItem(c, item.id));
    if (candidate) game.equipItem(candidate.id, item.id);
  }
}

function buyPacks(game: GameStore, animeId: string) {
  // Main packs first: they draw from the cast that carries the world damage.
  while (game.worldPointsOf(animeId) >= PACK_COST.main) {
    if (!game.openPack(animeId, "main")) break;
  }
  while (game.worldPointsOf(animeId) >= PACK_COST.secondary) {
    if (!game.openPack(animeId, "secondary")) break;
  }
}

/** The world to head into next: a sequel of somewhere already played first, else any entry point. */
function nextWorld(game: GameStore, data: GameData): string | null {
  const entered = new Set(game.unlockedAnimes().map((a) => a.id));
  const open = data.animes.filter((a) => !entered.has(a.id) && game.animeAvailable(a.id));
  const sequel = open.find((a) => a.requiresAnimeId && entered.has(a.requiresAnimeId));
  return (sequel ?? open[0])?.id ?? null;
}

function averageLevel(game: GameStore): number {
  const team = game.ownedCharacters();
  if (team.length === 0) return 0;
  return team.reduce((sum, c) => sum + game.levelOf(c.id), 0) / team.length;
}

export function simulateRun(data: GameData, overrides: Partial<SimOptions> = {}): SimReport {
  const options: SimOptions = { ...defaultSimOptions, ...overrides };
  const clock = createClock(options.seed);
  clock.install();
  try {
    return createRoot((dispose) => {
      const game = createGameStore(data);
      try {
        return play(game, data, options, clock);
      } finally {
        dispose();
      }
    });
  } finally {
    clock.restore();
  }
}

function play(
  game: GameStore,
  data: GameData,
  options: SimOptions,
  clock: ReturnType<typeof createClock>
): SimReport {
  const startedAt = clock.now();
  const deadline = startedAt + options.maxMinutes * MINUTE_MS;
  const arcs: ArcReport[] = [];
  const reported = new Set<string>();
  const timeouts = new Map<string, number>();

  const entry = options.entryAnimeId ?? data.animes.find((a) => !a.requiresAnimeId)?.id ?? null;
  if (!entry || !game.travelTo(entry)) {
    throw new Error(`No entry world to start on (tried ${entry ?? "none"}).`);
  }

  let currentArcId: string | null = null;
  let arcEnteredAt = clock.now();
  let baseline = counters(game);
  let clickCredit = 0;
  let ticks = 0;
  let stalledOn: string | null = null;

  const finishArc = (arc: Arc) => {
    const now = counters(game);
    const kills = now.kills - baseline.kills;
    const commons = now.commons - baseline.commons;
    arcs.push({
      world: data.animes.find((a) => a.id === arc.animeId)?.name ?? arc.animeId,
      arc: arc.name,
      difficulty: game.difficultyOf(arc.animeId),
      minutes: (clock.now() - arcEnteredAt) / MINUTE_MS,
      kills,
      commons,
      copiesPerKill: kills > 0 ? commons / kills : 0,
      teamSize: game.ownedCharacters().length,
      avgLevel: averageLevel(game),
      teamDps: game.teamDps(),
      clickPower: game.clickPower(),
      bossTimeouts: timeouts.get(arc.id) ?? 0,
      lifetimeEarned: game.lifetimeEarned(),
    });
  };

  while (clock.now() < deadline) {
    clock.advance(TICK_MS);
    ticks++;

    const arc = game.activeArc();
    if (!arc) {
      const world = nextWorld(game, data);
      if (!world || !game.travelTo(world)) break;
      continue;
    }

    if (arc.id !== currentArcId) {
      currentArcId = arc.id;
      arcEnteredAt = clock.now();
      baseline = counters(game);
    }

    clickCredit += (options.clicksPerSecond * TICK_MS) / 1000;
    while (clickCredit >= 1) {
      game.click();
      clickCredit -= 1;
    }

    if (options.abilities) fireAbilities(game);
    if (options.rankPassives) rankUpPassives(game);
    if (ticks % HOUSEKEEPING_EVERY === 0) {
      if (options.equip) equipUniques(game);
      if (options.packs) buyPacks(game, arc.animeId);
    }

    // A boss clock that ran out is the one thing that can actually stop a run: count the retreat
    // and ask for the rematch straight away, so a wall shows up as repeated timeouts, not silence.
    if (game.bossChallengeable(arc)) {
      timeouts.set(arc.id, (timeouts.get(arc.id) ?? 0) + 1);
      game.challengeBoss();
    }

    if (game.arcCleared(arc)) {
      if (!reported.has(arc.id)) {
        reported.add(arc.id);
        finishArc(arc);
      }
      if (game.stepArc(1)) continue;
      const world = nextWorld(game, data);
      if (!world || !game.travelTo(world)) break;
      continue;
    }

    if (clock.now() - arcEnteredAt > options.stallMinutes * MINUTE_MS) {
      stalledOn = `${arc.name} (${arc.animeId})`;
      break;
    }
  }

  const cleared = data.arcs.filter((a) => game.arcCleared(a)).length;
  return {
    options,
    arcs,
    totals: {
      minutes: (clock.now() - startedAt) / MINUTE_MS,
      arcsCleared: cleared,
      arcsTotal: data.arcs.length,
      completion: game.runCompletion(),
      lifetimeEarned: game.lifetimeEarned(),
      prestigeGain: game.pendingPrestigeGain(),
      teamSize: game.ownedCharacters().length,
      stalledOn,
      outOfTime: !stalledOn && cleared < data.arcs.length,
    },
  };
}
