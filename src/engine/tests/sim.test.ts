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

  // La campagne est la vraie nouveauté : une run seule ne dit rien de la méta-progression, parce
  // que rien de ce qu'elle achète ne lui survit. Ce qu'on garde ici, ce n'est pas « la run 4 fait
  // 13 arcs » — ce chiffre bouge à chaque réglage — mais que la chaîne existe bel et bien :
  // les points sont bankés, dépensés, et la run suivante démarre avec l'arbre déjà acheté.
  it("enchaîne les runs et fait grossir l'arbre entre elles", () => {
    const report = simulateRun(gameData, {
      runs: 3,
      runMinutes: 8,
      maxMinutes: 24,
      stallMinutes: 8,
      seed: 3,
    });

    expect(report.runs).toHaveLength(3);
    expect(report.runs.map((run) => run.index)).toEqual([0, 1, 2]);
    expect(report.meta.runsPlayed).toBe(3);
    expect(report.meta.treeLevelsTotal).toBeGreaterThan(0);
    // Chaque run repart de zéro côté run, et d'un peu plus haut côté méta.
    expect(report.runs[0].spend.treeLevelsAtStart).toBe(0);
    expect(report.runs[2].spend.treeLevelsAtStart).toBeGreaterThan(0);
    expect(report.meta.pointsEarned).toBeGreaterThan(0);
  });

  it("expose la dernière run dans les champs historiques", () => {
    const report = simulateRun(gameData, { runs: 2, runMinutes: 5, maxMinutes: 10, stallMinutes: 5, seed: 3 });
    const last = report.runs[report.runs.length - 1];

    expect(report.arcs).toBe(last.arcs);
    expect(report.totals).toBe(last.totals);
    expect(report.milestones).toBe(last.milestones);
  });

  it("joue les runs sous les défis demandés, dans l'ordre", () => {
    const report = simulateRun(gameData, {
      runs: 2,
      runMinutes: 5,
      maxMinutes: 10,
      stallMinutes: 5,
      seed: 3,
      challengeIds: ["defi-muet"],
    });

    expect(report.runs[0].challenge).toBe("Le Narrateur muet");
    // La liste est plus courte que la campagne : la run suivante se joue sans contrainte.
    expect(report.runs[1].challenge).toBeNull();
  });

  // `--solo` est le plancher contre lequel toute ablation se lit : le jeu nu, sans aucun système
  // optionnel. S'il achète encore quelque chose, c'est qu'une option ne coupe pas ce qu'elle dit.
  it("ne dépense rien du tout quand tous les systèmes sont coupés", () => {
    const report = simulateRun(gameData, {
      maxMinutes: 6,
      stallMinutes: 6,
      seed: 3,
      packs: false,
      portals: false,
      abilities: false,
      equip: false,
      rankPassives: false,
      forge: false,
      shop: false,
      crossoverWindows: false,
      autoRank: false,
      tree: false,
    });
    const { spend } = report.runs[0];

    expect(spend.packsOpened).toBe(0);
    expect(spend.portalsWon).toBe(0);
    expect(spend.forgeLevels).toBe(0);
    expect(spend.shopPurchases).toBe(0);
    expect(spend.crossoverWindows).toBe(0);
    expect(report.meta.treeLevelsTotal).toBe(0);
    // …et il joue quand même : un plancher à zéro arc ne mesurerait rien.
    expect(report.totals.arcsCleared).toBeGreaterThan(0);
  });

  // La boutique est le seul puits de la monnaie principale : une run qui n'achète jamais finit
  // assise sur tout ce qu'elle a gagné, ce que la sim faisait avant qu'on lui donne cette politique.
  it("dépense la monnaie à la boutique par défaut", () => {
    const report = simulateRun(gameData, { maxMinutes: 10, stallMinutes: 10, seed: 3 });
    expect(report.runs[0].spend.shopPurchases).toBeGreaterThan(0);
  });
});
