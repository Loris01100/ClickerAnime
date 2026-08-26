import { describe, expect, it } from "vitest";
import { applyPrestige, canUnlockAnime, COMPLETION_GAIN_BONUS, createInitialPrestigeState, PRESTIGE_EXPONENT, PRESTIGE_SCALE, unlockAnime } from "../prestige";

describe("prestige", () => {
  const curve = (lifetime: number, completion = 0) =>
    (lifetime / PRESTIGE_SCALE) ** PRESTIGE_EXPONENT * (1 + COMPLETION_GAIN_BONUS * completion);

  it("computes no gain below the scale threshold", () => {
    expect(applyPrestige(createInitialPrestigeState(), PRESTIGE_SCALE - 1).prestigePoints).toBe(0);
  });

  it("computes diminishing-returns gain above the scale threshold", () => {
    expect(applyPrestige(createInitialPrestigeState(), 12_800_000).prestigePoints).toBe(
      Math.floor(curve(12_800_000))
    );
  });

  it("scales the gain with run completion", () => {
    const st = createInitialPrestigeState();
    expect(applyPrestige(st, 12_800_000, undefined, 0.5).prestigePoints).toBe(Math.floor(curve(12_800_000, 0.5)));
    expect(applyPrestige(st, 12_800_000, undefined, 1).prestigePoints).toBe(Math.floor(curve(12_800_000, 1)));
    // completion alone never conjures points out of nothing
    expect(applyPrestige(st, PRESTIGE_SCALE - 1, undefined, 1).prestigePoints).toBe(0);
  });

  /**
   * The curve is what stops the tree from being bought outright the first time it is reachable:
   * a full run of the whole game earns on the order of 3e12 (`npm run sim` prints the figure), and
   * must bank a few hundred points against a 775-point tree — not thousands. Guards the
   * exponent/scale/bonus trio together.
   *
   * **The earnings figure here moves every time a world is added**, and so must the exponent — a
   * full clear stays at 100% completion while `lifetimeEarned` explodes, so nothing dilutes that
   * half on its own. Boruto took a full run from 8.76e9 to 3.21e12, which at the old 0.22 exponent
   * banked 866 points and bought the whole tree in one run. See `PRESTIGE_EXPONENT`.
   */
  it("un run complet du jeu banque quelques centaines de points, pas des milliers", () => {
    const fullRun = applyPrestige(createInitialPrestigeState(), 3.2e12, undefined, 1).prestigePoints;
    expect(fullRun).toBeGreaterThan(100);
    expect(fullRun).toBeLessThan(400);
    // And farming one arc forever must not substitute for clearing more of them: 10x the earnings
    // at the same completion is worth far less than the completion bonus itself.
    expect(applyPrestige(createInitialPrestigeState(), 3.2e13, undefined, 1).prestigePoints).toBeLessThan(
      fullRun * 2
    );
  });

  it("sends the player back to square one: the worlds entered are wiped", () => {
    const after = applyPrestige({ prestigePoints: 1, unlockedAnimeIds: ["anime-a"] }, 12_800_000);
    expect(after).toEqual({ prestigePoints: 1 + Math.floor(curve(12_800_000)), unlockedAnimeIds: [] });
  });

  it("lets the player unlock any anime they can afford, in any order", () => {
    const state = { prestigePoints: 10, unlockedAnimeIds: [] as string[] };
    const after = unlockAnime(state, "anime-b", 5);
    expect(after.prestigePoints).toBe(5);
    expect(after.unlockedAnimeIds).toContain("anime-b");
  });

  it("refuses to unlock the same anime twice or without enough points", () => {
    const state = { prestigePoints: 1, unlockedAnimeIds: ["anime-a"] };
    expect(canUnlockAnime(state, "anime-a", 0)).toBe(false);
    expect(canUnlockAnime(state, "anime-b", 5)).toBe(false);
  });
});
