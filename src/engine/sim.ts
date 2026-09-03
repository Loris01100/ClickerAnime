import { createRoot } from "solid-js";
import { achievementCount } from "./achievements";
import { createGameStore, type GameData, type GameStore } from "./gameState";
import { PACK_COST } from "./packs";
import { PRESTIGE_TREE_CATEGORIES, type PrestigeTreeCategoryId } from "./prestigeTree";
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
 * It plays a **campaign**, not a run. One run answers "how long is arc 4"; only a chain of runs
 * answers the questions the meta-progression actually poses — whether a prestige point is worth
 * having, whether the tree compounds or plateaus, whether a wall is a wall or a "come back with
 * three more levels". `runs: 1` (the default) is exactly the single-run report this used to print,
 * so every existing reading still holds.
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
  /** Simulated game time the whole campaign may take before it is cut off. */
  maxMinutes: number;
  /** An arc that is not cleared within this long is called a wall and ends the run. */
  stallMinutes: number;
  seed: number;
  /** Which world to start on. Defaults to the first entry point in the data. */
  entryAnimeId: string | null;
  /** Preferred travel order after the entry world; unavailable worlds are skipped. */
  worldOrder: string[] | null;
  /** Stop as soon as the chosen entry world is complete, before travelling elsewhere. */
  stopAfterEntryWorld: boolean;

  // --- how many runs, and what ends one -------------------------------------------------------
  /** Prestige runs to chain. 1 keeps the historical single-run report. */
  runs: number;
  /** Time budget for one run before the player resets voluntarily. Null: no voluntary reset. */
  runMinutes: number | null;
  /** Reset and start the next run when an arc walls the current one, instead of stopping. */
  resetOnWall: boolean;

  // --- systems the auto-player is allowed to use ------------------------------------------------
  packs: boolean;
  /** Whether the simulated player spends crystals on crossover portals to recruit boss characters. */
  portals: boolean;
  abilities: boolean;
  equip: boolean;
  rankPassives: boolean;
  /** Spend unique fragments on forge levels as soon as one is affordable. */
  forge: boolean;
  /** Buy every affordable shop offer — the other way into the roster. */
  shop: boolean;
  /** Spend crystals on a crossover window whenever the game itself would advise one. */
  crossoverWindows: boolean;
  /** Hand passives to the intendance once the automation node that runs it is bought. */
  autoRank: boolean;
  /** Spend banked prestige points on the tree between runs. */
  tree: boolean;
  /**
   * Branch priority for that spending. Null means cheapest-level-first across the whole tree,
   * which is what a player buying "whatever I can afford" does and spreads over all six branches.
   */
  treeOrder: PrestigeTreeCategoryId[] | null;
  /** Worlds to pay prestige points for at the start of every run, in order — the paid shortcut. */
  unlockWorlds: string[] | null;
  /** Challenges to take, one per run in order; runs past the list are played unconstrained. */
  challengeIds: string[] | null;
}

export const defaultSimOptions: SimOptions = {
  clicksPerSecond: 4,
  maxMinutes: 240,
  stallMinutes: 30,
  seed: 1,
  entryAnimeId: null,
  worldOrder: null,
  stopAfterEntryWorld: false,
  runs: 1,
  runMinutes: null,
  resetOnWall: true,
  packs: true,
  portals: true,
  abilities: true,
  equip: true,
  rankPassives: true,
  forge: true,
  shop: true,
  crossoverWindows: true,
  autoRank: true,
  tree: true,
  treeOrder: null,
  unlockWorlds: null,
  challengeIds: null,
};

export interface ArcReport {
  id: string;
  /** Which run of the campaign cleared it — 0 for a single-run report. */
  run: number;
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
  /** Mean effective dps over the arc — team plus the click cadence. What an hp target is sized on. */
  avgDps: number;
  clickPower: number;
  bossTimeouts: number;
  lifetimeEarned: number;
}

export interface Milestones {
  firstRecruitMinutes: number | null;
  firstArcMinutes: number | null;
  /** First equipped unique or purchased passive rank — a drop the player has actually used. */
  firstUsefulItemMinutes: number | null;
  /** First moment a reset would bank at least one prestige point. */
  firstPrestigeMinutes: number | null;
  /** First moment a reset could buy the cheapest prestige-tree level. */
  firstTreePurchaseMinutes: number | null;
  /** First moment a reset could buy a three-point entry-world shortcut. */
  firstWorldUnlockMinutes: number | null;
}

/** What the auto-player actually spent its side currencies on, per run. */
export interface SpendReport {
  packsOpened: number;
  portalsWon: number;
  forgeLevels: number;
  shopPurchases: number;
  crossoverWindows: number;
  evolutions: number;
  /** Tree levels bought *before* this run started — the meta power it was played with. */
  treeLevelsAtStart: number;
  /** Prestige points still unspent when the run started. */
  pointsAtStart: number;
}

export interface RunTotals {
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
}

export interface RunReport {
  /** 0-based index in the campaign. */
  index: number;
  /** Name of the challenge played under, if any. */
  challenge: string | null;
  arcs: ArcReport[];
  milestones: Milestones;
  totals: RunTotals;
  spend: SpendReport;
}

/** What the campaign left behind — the only part of a run that outlives `prestigeReset`. */
export interface MetaReport {
  runsPlayed: number;
  totalMinutes: number;
  /** Prestige points banked over the campaign, spent ones included. */
  pointsEarned: number;
  pointsUnspent: number;
  treeLevels: Record<PrestigeTreeCategoryId, number>;
  treeLevelsTotal: number;
  /** Best single-run arc count — whether the meta actually pushed the wall back. */
  bestArcsCleared: number;
  challengesDone: string[];
  achievements: Record<string, number>;
}

export interface SimReport {
  options: SimOptions;
  /** Every run of the campaign, in order. With `runs: 1` there is exactly one. */
  runs: RunReport[];
  meta: MetaReport;
  // The three fields below mirror the **last** run, so a single-run report reads exactly as before.
  arcs: ArcReport[];
  milestones: Milestones;
  totals: RunTotals;
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

type Clock = ReturnType<typeof createClock>;

// --- the auto-player: one policy per system -----------------------------------------------------

/** Lifetime kills and commons, the two counters an arc yield is measured between. */
function counters(game: GameStore) {
  const counts = game.achievementCounts();
  return {
    kills: achievementCount(counts, "mobsKilled") + achievementCount(counts, "bossesKilled"),
    commons: achievementCount(counts, "commonItemsCollected"),
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

/**
 * Fragments only ever buy forge levels on the unique they came from, so there is no policy to have:
 * spend every one that can be spent. Left unspent — which is what the sim did until now — a run's
 * uniques stay at level 1 and the whole `items` half of the economy is missing from the reading.
 */
function forgeUniques(game: GameStore): number {
  let bought = 0;
  for (;;) {
    const ready = [...game.forgeableNowIds()];
    if (ready.length === 0) return bought;
    let any = false;
    for (const id of ready) {
      if (game.upgradeUnique(id)) {
        bought++;
        any = true;
      }
    }
    if (!any) return bought;
  }
}

/**
 * The shop is the **only** sink the main currency has, so a player who never buys is a player
 * sitting on everything the run earned. Characters first — a shop-exclusive companion is a recruit
 * no other path gives — then the most expensive affordable item, which is both what a player picks
 * and what makes this loop converge instead of nibbling the cheapest offer a thousand times.
 */
const SHOP_BUYS_PER_PASS = 60;

function buyShop(game: GameStore): number {
  let bought = 0;
  for (;;) {
    const rows = game.shopOffers().filter((r) => r.affordable && !r.locked && !r.owned);
    if (rows.length === 0 || bought >= SHOP_BUYS_PER_PASS) return bought;
    const characters = rows.filter((r) => r.offer.kind === "character");
    const pick = characters.length > 0
      ? characters.reduce((a, b) => (a.cost <= b.cost ? a : b))
      : rows.reduce((a, b) => (a.cost >= b.cost ? a : b));
    if (!game.buyShopOffer(pick.offer.id)) return bought;
    bought++;
  }
}

/**
 * The crystal policy for windows: spend only when the game itself says it would pay — someone in
 * the team is at the steep other-anime malus. That is the same test the HUD hint uses, so the sim
 * opens a window exactly where a player is told to, and never burns the stock a portal needs.
 */
function useCrossoverWindow(game: GameStore): boolean {
  return game.crossoverAdvised() ? game.activateCrossover() : false;
}

/**
 * The crystal policy: a boss's character is only ever recruited by paying for its portal and felling
 * it a second time, so a run that never opens one ends with 35 fewer characters than the hp tables
 * were fitted against. Greedy and in story order — finish the portal already open, then buy the
 * cheapest one within reach, which is what a player collecting a roster does.
 */
function runPortals(game: GameStore) {
  if (game.activePortalId() !== null) return;
  const targets = game.portalTargets();
  const target = targets.find((t) => t.open) ?? targets.find((t) => t.affordable);
  if (!target) return;
  if (!target.open && !game.openPortal(target.character.id)) return;
  game.enterPortal(target.character.id);
}

/** Fills the intendance's slots as they are bought — the node is worth nothing while empty. */
function enrollAutoRank(game: GameStore) {
  if (game.automationLevelOf("rank") === 0) return;
  let free = game.autoRankCapacity() - game.autoRankCharacterIds().length;
  if (free <= 0) return;
  for (const character of game.ownedCharacters()) {
    if (free <= 0) break;
    if (game.isAutoRanked(character.id) || !character.passive) continue;
    if (game.toggleAutoRank(character.id)) free--;
  }
}

interface BuyableNode {
  categoryId: PrestigeTreeCategoryId;
  position: number;
  cost: number;
}

/** Every node one more level could be bought in right now, cost included. */
function buyableNodes(game: GameStore): BuyableNode[] {
  const points = game.prestige().prestigePoints;
  const out: BuyableNode[] = [];
  for (const category of PRESTIGE_TREE_CATEGORIES) {
    for (const node of category.nodes) {
      const cost = game.nodeCostOf(category.id, node.position);
      if (cost === null || cost > points) continue;
      out.push({ categoryId: category.id, position: node.position, cost });
    }
  }
  return out;
}

/**
 * Spends the bank until nothing is affordable.
 *
 * Cheapest-first by default, which is not a designer's opinion but a player's: the first level of an
 * unlocked node costs 2 and the fifth costs 13, so buying by price naturally opens breadth across
 * the six branches before deepening any of them. `treeOrder` swaps that for a strict branch
 * priority, which is how a single branch's contribution gets priced — `--tree-order=automation`
 * answers "what is the automation branch alone worth?" the way `--no-packs` prices the packs.
 */
function spendPrestige(game: GameStore, order: PrestigeTreeCategoryId[] | null): number {
  let bought = 0;
  for (;;) {
    const options = buyableNodes(game);
    if (options.length === 0) return bought;
    const rank = (node: BuyableNode) => (order ? order.indexOf(node.categoryId) : -1);
    const best = options.reduce((a, b) => {
      // A branch not named in `treeOrder` comes last, never first: `indexOf` gives it -1.
      const ra = rank(a) < 0 ? Number.MAX_SAFE_INTEGER : rank(a);
      const rb = rank(b) < 0 ? Number.MAX_SAFE_INTEGER : rank(b);
      if (order && ra !== rb) return ra < rb ? a : b;
      if (a.cost !== b.cost) return a.cost < b.cost ? a : b;
      return a.position <= b.position ? a : b;
    });
    if (!game.purchaseTreeLevel(best.categoryId, best.position)) return bought;
    bought++;
  }
}

/** The world to head into next: a sequel of somewhere already played first, else any entry point. */
function nextWorld(game: GameStore, data: GameData, preferredOrder: string[] | null): string | null {
  const entered = new Set(game.unlockedAnimes().map((a) => a.id));
  const open = data.animes.filter((a) => !entered.has(a.id) && game.animeAvailable(a.id));
  const preferred = preferredOrder?.find((id) => open.some((anime) => anime.id === id));
  if (preferred) return preferred;
  const sequel = open.find((a) => a.requiresAnimeId && entered.has(a.requiresAnimeId));
  return (sequel ?? open[0])?.id ?? null;
}

function averageLevel(game: GameStore): number {
  const team = game.ownedCharacters();
  if (team.length === 0) return 0;
  return team.reduce((sum, c) => sum + game.levelOf(c.id), 0) / team.length;
}

function treeLevels(game: GameStore): Record<PrestigeTreeCategoryId, number> {
  const levels = {} as Record<PrestigeTreeCategoryId, number>;
  for (const category of PRESTIGE_TREE_CATEGORIES) levels[category.id] = game.branchLevelsOf(category.id);
  return levels;
}

const totalOf = (levels: Record<PrestigeTreeCategoryId, number>) =>
  Object.values(levels).reduce((sum, level) => sum + level, 0);

// --- the campaign -------------------------------------------------------------------------------

export function simulateRun(data: GameData, overrides: Partial<SimOptions> = {}): SimReport {
  const options: SimOptions = { ...defaultSimOptions, ...overrides };
  const clock = createClock(options.seed);
  clock.install();
  try {
    return createRoot((dispose) => {
      const game = createGameStore(data);
      try {
        return playCampaign(game, data, options, clock);
      } finally {
        dispose();
      }
    });
  } finally {
    clock.restore();
  }
}


function playCampaign(game: GameStore, data: GameData, options: SimOptions, clock: Clock): SimReport {
  const startedAt = clock.now();
  const deadline = startedAt + options.maxMinutes * MINUTE_MS;
  const runs: RunReport[] = [];
  let pointsEarned = 0;

  for (let index = 0; index < Math.max(1, Math.floor(options.runs)) && clock.now() < deadline; index++) {
    if (index > 0) {
      // A run under a rule must not survive the rule being dropped, so the abandon is the reset —
      // and it banks the points the run earned, exactly like the voluntary one.
      const banked = game.pendingPrestigeGain();
      if (game.activeChallenge()) game.abandonChallenge();
      else game.prestigeReset(false);
      pointsEarned += banked;
    }

    const challengeId = options.challengeIds?.[index] ?? null;
    // `startChallenge` is itself a reset; on run 0 that is a no-op over a fresh store.
    if (challengeId && !game.isChallengeDone(challengeId)) game.startChallenge(challengeId);

    if (options.tree) spendPrestige(game, options.treeOrder);
    for (const animeId of options.unlockWorlds ?? []) game.unlockAnime(animeId);

    const run = playRun(game, data, options, clock, index, deadline);
    runs.push(run);
    if (run.totals.stalledOn && !options.resetOnWall) break;
  }

  // The final bank is never spent — it is what the *next* run would have started with, and printing
  // it is how a campaign says whether the tree is saturating.
  const finalGain = game.pendingPrestigeGain();
  pointsEarned += finalGain;
  const levels = treeLevels(game);
  const last = runs[runs.length - 1];

  return {
    options,
    runs,
    meta: {
      runsPlayed: runs.length,
      totalMinutes: (clock.now() - startedAt) / MINUTE_MS,
      pointsEarned,
      pointsUnspent: game.prestige().prestigePoints + finalGain,
      treeLevels: levels,
      treeLevelsTotal: totalOf(levels),
      bestArcsCleared: runs.reduce((best, run) => Math.max(best, run.totals.arcsCleared), 0),
      challengesDone: game.completedChallengeIds(),
      achievements: game.achievementCounts(),
    },
    arcs: last?.arcs ?? [],
    milestones: last?.milestones ?? emptyMilestones(),
    totals: last?.totals ?? emptyTotals(data),
  };
}

const emptyMilestones = (): Milestones => ({
  firstRecruitMinutes: null,
  firstArcMinutes: null,
  firstUsefulItemMinutes: null,
  firstPrestigeMinutes: null,
  firstTreePurchaseMinutes: null,
  firstWorldUnlockMinutes: null,
});

const emptyTotals = (data: GameData): RunTotals => ({
  minutes: 0,
  arcsCleared: 0,
  arcsTotal: data.arcs.length,
  completion: 0,
  lifetimeEarned: 0,
  prestigeGain: 0,
  teamSize: 0,
  stalledOn: null,
  outOfTime: true,
});

function playRun(
  game: GameStore,
  data: GameData,
  options: SimOptions,
  clock: Clock,
  index: number,
  campaignDeadline: number
): RunReport {
  const startedAt = clock.now();
  const runBudget = options.runMinutes === null ? Infinity : startedAt + options.runMinutes * MINUTE_MS;
  const deadline = Math.min(campaignDeadline, runBudget);
  const arcs: ArcReport[] = [];
  const reported = new Set<string>();
  const timeouts = new Map<string, number>();
  const spend: SpendReport = {
    packsOpened: 0,
    portalsWon: 0,
    forgeLevels: 0,
    shopPurchases: 0,
    crossoverWindows: 0,
    evolutions: 0,
    treeLevelsAtStart: totalOf(treeLevels(game)),
    pointsAtStart: game.prestige().prestigePoints,
  };
  const openingCounts = game.achievementCounts();
  const openingPacks = achievementCount(openingCounts, "packsOpened");
  const openingEvolutions = achievementCount(openingCounts, "evolutionsUnlocked");
  const openingCrossovers = achievementCount(openingCounts, "crossoversUsed");
  // A portal is won when the fight it opened ends with its character in the roster — the only
  // recruit crystals ever buy, and the one the hp tables were fitted against.
  let lastPortalId: string | null = null;

  const entry = options.entryAnimeId ?? data.animes.find((a) => !a.requiresAnimeId)?.id ?? null;
  // A paid world shortcut may already have put the player somewhere; only travel when it hasn't.
  if (game.activeArc() === null && (!entry || !game.travelTo(entry))) {
    throw new Error(`No entry world to start on (tried ${entry ?? "none"}).`);
  }

  let currentArcId: string | null = null;
  let arcEnteredAt = clock.now();
  let baseline = counters(game);
  let clickCredit = 0;
  let ticks = 0;
  let stalledOn: string | null = null;
  // Effective dps sampled every tick of the current arc: end-of-arc dps overstates what actually
  // felled the arc, and an hp table sized on it comes out too heavy.
  let dpsSum = 0;
  let dpsSamples = 0;
  const milestoneAt = emptyMilestones();
  const elapsedMinutes = () => (clock.now() - startedAt) / MINUTE_MS;

  const sampleMilestones = () => {
    if (milestoneAt.firstRecruitMinutes === null && game.ownedCharacters().length > 0) {
      milestoneAt.firstRecruitMinutes = elapsedMinutes();
    }
    const achievements = game.achievementCounts();
    if (
      milestoneAt.firstUsefulItemMinutes === null &&
      ((achievements.uniquesEquipped ?? 0) > 0 || (achievements.passiveRanksBought ?? 0) > 0)
    ) {
      milestoneAt.firstUsefulItemMinutes = elapsedMinutes();
    }
    const pending = game.pendingPrestigeGain();
    if (milestoneAt.firstPrestigeMinutes === null && pending >= 1) milestoneAt.firstPrestigeMinutes = elapsedMinutes();
    if (milestoneAt.firstTreePurchaseMinutes === null && pending >= 2) milestoneAt.firstTreePurchaseMinutes = elapsedMinutes();
    if (milestoneAt.firstWorldUnlockMinutes === null && pending >= 3) milestoneAt.firstWorldUnlockMinutes = elapsedMinutes();
  };

  const finishArc = (arc: Arc) => {
    const now = counters(game);
    const kills = now.kills - baseline.kills;
    const commons = now.commons - baseline.commons;
    arcs.push({
      id: arc.id,
      run: index,
      world: data.animes.find((a) => a.id === arc.animeId)?.name ?? arc.animeId,
      arc: arc.name,
      difficulty: game.difficultyOfArc(arc),
      minutes: (clock.now() - arcEnteredAt) / MINUTE_MS,
      kills,
      commons,
      copiesPerKill: kills > 0 ? commons / kills : 0,
      teamSize: game.ownedCharacters().length,
      avgLevel: averageLevel(game),
      teamDps: game.teamDps(),
      avgDps: dpsSamples > 0 ? dpsSum / dpsSamples : 0,
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
      const world = nextWorld(game, data, options.worldOrder);
      if (!world || !game.travelTo(world)) break;
      continue;
    }

    if (arc.id !== currentArcId) {
      currentArcId = arc.id;
      arcEnteredAt = clock.now();
      baseline = counters(game);
      dpsSum = 0;
      dpsSamples = 0;
    }
    dpsSum += game.teamDps() + game.clickPower() * options.clicksPerSecond;
    dpsSamples++;

    clickCredit += (options.clicksPerSecond * TICK_MS) / 1000;
    while (clickCredit >= 1) {
      game.click();
      clickCredit -= 1;
    }

    if (options.abilities) fireAbilities(game);
    if (options.rankPassives) rankUpPassives(game);
    if (ticks % HOUSEKEEPING_EVERY === 0) {
      if (options.equip) equipUniques(game);
      if (options.forge) spend.forgeLevels += forgeUniques(game);
      if (options.packs) buyPacks(game, arc.animeId);
      if (options.shop) spend.shopPurchases += buyShop(game);
      if (options.autoRank) enrollAutoRank(game);
      // A window before a portal: the window is cheap and the portal's hp is frozen at the dps it
      // is paid for, so opening one inside a window is also how a player buys a cheaper portal.
      if (options.crossoverWindows) useCrossoverWindow(game);
      if (options.portals) runPortals(game);
    }
    const portalId = game.activePortalId();
    if (lastPortalId && portalId !== lastPortalId && game.ownedCharacterIds().includes(lastPortalId)) {
      spend.portalsWon++;
    }
    lastPortalId = portalId;
    sampleMilestones();

    // A boss clock that ran out is the one thing that can actually stop a run: count the retreat
    // and ask for the rematch straight away, so a wall shows up as repeated timeouts, not silence.
    if (game.bossChallengeable(arc)) {
      timeouts.set(arc.id, (timeouts.get(arc.id) ?? 0) + 1);
      game.challengeBoss();
    }

    if (game.arcCleared(arc)) {
      if (milestoneAt.firstArcMinutes === null) milestoneAt.firstArcMinutes = elapsedMinutes();
      if (!reported.has(arc.id)) {
        reported.add(arc.id);
        finishArc(arc);
      }
      if (game.stepArc(1)) continue;
      if (options.stopAfterEntryWorld && arc.animeId === entry) break;
      const world = nextWorld(game, data, options.worldOrder);
      if (!world || !game.travelTo(world)) break;
      continue;
    }

    if (clock.now() - arcEnteredAt > options.stallMinutes * MINUTE_MS) {
      stalledOn = `${arc.name} (${arc.animeId})`;
      break;
    }
  }

  const closingCounts = game.achievementCounts();
  spend.packsOpened = achievementCount(closingCounts, "packsOpened") - openingPacks;
  spend.evolutions = achievementCount(closingCounts, "evolutionsUnlocked") - openingEvolutions;
  spend.crossoverWindows = achievementCount(closingCounts, "crossoversUsed") - openingCrossovers;
  const cleared = data.arcs.filter((a) => game.arcCleared(a)).length;
  return {
    index,
    challenge: game.activeChallenge()?.name ?? null,
    arcs,
    milestones: milestoneAt,
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
    spend,
  };
}
