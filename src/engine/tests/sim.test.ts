import { describe, expect, it } from "vitest";
import { gameData } from "../../data";
import { simulateRun } from "../sim";

describe("le simulateur de run", () => {
  // Le harnais remplace l'horloge, `setInterval`, `localStorage` et `Math.random` le temps d'une
  // run. Ce qu'on garde ici, ce n'est pas un chiffre d'équilibrage — il bouge à chaque réglage —
  // mais le fait que le simulateur *avance* : un harnais cassé rend zéro partout sans rien dire,
  // et un tableau de zéros ressemble à un jeu impossible plutôt qu'à un outil en panne.
  it("joue vraiment la run et rend des mesures non nulles", () => {
    const report = simulateRun(gameData, { maxMinutes: 5, stallMinutes: 5, seed: 3 });

    expect(report.arcs.length).toBeGreaterThan(0);
    expect(report.totals.arcsCleared).toBe(report.arcs.length);
    expect(report.totals.teamSize).toBeGreaterThan(0);
    expect(report.totals.lifetimeEarned).toBeGreaterThan(0);
    expect(report.milestones.firstRecruitMinutes).not.toBeNull();
    expect(report.milestones.firstArcMinutes).not.toBeNull();
    for (const arc of report.arcs) expect(arc.kills).toBeGreaterThan(0);
  });

  it("peut isoler le monde d'entrée sans voyager dans le suivant", () => {
    const report = simulateRun(gameData, {
      entryAnimeId: "naruto",
      stopAfterEntryWorld: true,
      maxMinutes: 30,
      stallMinutes: 10,
      seed: 3,
    });

    expect(report.arcs).toHaveLength(5);
    expect(new Set(report.arcs.map((arc) => arc.world))).toEqual(new Set(["Naruto"]));
    expect(report.totals.stalledOn).toBeNull();
  });

  it("rend exactement la même run pour la même graine", () => {
    const options = { maxMinutes: 3, stallMinutes: 3, seed: 11 };
    expect(simulateRun(gameData, options).arcs).toEqual(simulateRun(gameData, options).arcs);
  });

  it("rend l'environnement intact : rien ne doit survivre à la simulation", () => {
    const before = { now: Date.now, random: Math.random, storage: "localStorage" in globalThis };
    simulateRun(gameData, { maxMinutes: 1, stallMinutes: 1, seed: 5 });
    expect(Date.now).toBe(before.now);
    expect(Math.random).toBe(before.random);
    expect("localStorage" in globalThis).toBe(before.storage);
  });
});
