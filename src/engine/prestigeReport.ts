import { achievementCount, type AchievementId } from "./achievements";

export interface PrestigeReportInput {
  startedAt: number;
  endedAt: number;
  prestigeBefore: number;
  prestigeAfter: number;
  lifetimeEarned: number;
  completion: number;
  clearedArcIds: string[];
  unlockedAnimeIds: string[];
  ownedCharacterCount: number;
  levels: number[];
  teamDps: number;
  clickPower: number;
  uniqueItemsFound: number;
  passiveRanksKept: number;
  forgedUniquesKept: number;
  achievementCounts: Record<string, number>;
  achievementBaseline: Record<string, number>;
  challengeName: string | null;
}

export interface PrestigeReport {
  startedAt: number;
  endedAt: number;
  durationMs: number;
  prestigeGained: number;
  prestigeTotal: number;
  lifetimeEarned: number;
  completion: number;
  clearedArcIds: string[];
  unlockedAnimeIds: string[];
  ownedCharacterCount: number;
  averageLevel: number;
  maxLevel: number;
  teamDps: number;
  clickPower: number;
  uniqueItemsFound: number;
  passiveRanksKept: number;
  forgedUniquesKept: number;
  mobsKilled: number;
  bossesKilled: number;
  clicks: number;
  abilitiesUsed: number;
  commonItemsCollected: number;
  passiveRanksBought: number;
  packsOpened: number;
  challengeName: string | null;
}

const delta = (counts: Record<string, number>, baseline: Record<string, number>, key: AchievementId) =>
  Math.max(0, achievementCount(counts, key) - achievementCount(baseline, key));

/** A frozen before-reset snapshot, so the report survives the signals being wiped a line later. */
export function buildPrestigeReport(input: PrestigeReportInput): PrestigeReport {
  const levelSum = input.levels.reduce((sum, level) => sum + level, 0);
  return {
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    durationMs: Math.max(0, input.endedAt - input.startedAt),
    prestigeGained: Math.max(0, input.prestigeAfter - input.prestigeBefore),
    prestigeTotal: input.prestigeAfter,
    lifetimeEarned: input.lifetimeEarned,
    completion: Math.max(0, Math.min(1, input.completion)),
    clearedArcIds: [...input.clearedArcIds],
    unlockedAnimeIds: [...input.unlockedAnimeIds],
    ownedCharacterCount: input.ownedCharacterCount,
    averageLevel: input.levels.length > 0 ? levelSum / input.levels.length : 0,
    maxLevel: input.levels.length > 0 ? Math.max(...input.levels) : 0,
    teamDps: input.teamDps,
    clickPower: input.clickPower,
    uniqueItemsFound: input.uniqueItemsFound,
    passiveRanksKept: input.passiveRanksKept,
    forgedUniquesKept: input.forgedUniquesKept,
    mobsKilled: delta(input.achievementCounts, input.achievementBaseline, "mobsKilled"),
    bossesKilled: delta(input.achievementCounts, input.achievementBaseline, "bossesKilled"),
    clicks: delta(input.achievementCounts, input.achievementBaseline, "clicks"),
    abilitiesUsed: delta(input.achievementCounts, input.achievementBaseline, "abilitiesUsed"),
    commonItemsCollected: delta(input.achievementCounts, input.achievementBaseline, "commonItemsCollected"),
    passiveRanksBought: delta(input.achievementCounts, input.achievementBaseline, "passiveRanksBought"),
    packsOpened: delta(input.achievementCounts, input.achievementBaseline, "packsOpened"),
    challengeName: input.challengeName,
  };
}
