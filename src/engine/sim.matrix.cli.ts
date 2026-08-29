/**
 * Reproducible balance matrices over several seeds.
 *
 * The regular simulator explains one run arc by arc. This companion answers the questions that
 * need a sample instead: whether an entry world is stable, which systems move the first wall, and
 * how sensitive pacing is to click cadence. It deliberately prints run-level summaries so five
 * seeds remain readable in a review or a git diff.
 */
import { gameData } from "../data";
import { fmt } from "../ui/format";
import { simulateRun, type SimOptions, type SimReport } from "./sim";

declare const process: { argv: string[]; exit(code?: number): never };

const DEFAULT_SEEDS = [1, 7, 42, 99, 20260829];
const ENTRY_WORLDS = ["naruto", "hunter-x-hunter", "bleach"];

interface MatrixRun {
  label: string;
  report: SimReport;
}

interface Aggregate {
  label: string;
  meanArcs: number;
  minArcs: number;
  maxArcs: number;
  meanMinutes: number;
  meanPrestige: number;
  wall: string;
}

function positiveInteger(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    console.error(`--${flag} needs a positive integer (got "${value}").`);
    process.exit(1);
  }
  return parsed;
}

function parseSeeds(argv: string[]): number[] {
  const raw = argv.find((arg) => arg.startsWith("--seeds="));
  if (!raw) return DEFAULT_SEEDS;
  const values = raw.slice("--seeds=".length).split(",").filter(Boolean);
  if (values.length === 0) {
    console.error("--seeds needs a comma-separated list, e.g. --seeds=1,7,42.");
    process.exit(1);
  }
  return values.map((value) => positiveInteger(value, "seeds"));
}

function shortArc(value: string | null): string {
  if (!value) return "fin/budget";
  return value.replace(/ \([^)]+\)$/, "");
}

function mode(values: string[]): string {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "—";
}

function aggregate(label: string, reports: SimReport[]): Aggregate {
  const arcs = reports.map((report) => report.totals.arcsCleared);
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    label,
    meanArcs: mean(arcs),
    minArcs: Math.min(...arcs),
    maxArcs: Math.max(...arcs),
    meanMinutes: mean(reports.map((report) => report.totals.minutes)),
    meanPrestige: mean(reports.map((report) => report.totals.prestigeGain)),
    wall: mode(reports.map((report) => shortArc(report.totals.stalledOn))),
  };
}

function markdown(headers: string[], rows: string[][]): string {
  const head = `| ${headers.join(" | ")} |`;
  const rule = `| ${headers.map(() => "---").join(" | ")} |`;
  return [head, rule, ...rows.map((row) => `| ${row.join(" | ")} |`)].join("\n");
}

function details(runs: MatrixRun[], seeds: number[]): string {
  return markdown(
    ["Scénario", ...seeds.map(String)],
    [...new Set(runs.map((run) => run.label))].map((label) => [
      label,
      ...runs
        .filter((run) => run.label === label)
        .map((run) => `${run.report.totals.arcsCleared} arcs · ${shortArc(run.report.totals.stalledOn)}`),
    ])
  );
}

function summary(runs: MatrixRun[]): string {
  const labels = [...new Set(runs.map((run) => run.label))];
  return markdown(
    ["Scénario", "Arcs moy.", "Étendue", "Minutes moy.", "Prestige moy.", "Mur dominant"],
    labels.map((label) => {
      const row = aggregate(label, runs.filter((run) => run.label === label).map((run) => run.report));
      return [
        row.label,
        row.meanArcs.toFixed(1),
        `${row.minArcs}–${row.maxArcs}`,
        row.meanMinutes.toFixed(1),
        row.meanPrestige.toFixed(1),
        row.wall,
      ];
    })
  );
}

function minuteCell(reports: SimReport[], of: (report: SimReport) => number | null): string {
  const values = reports.map(of).filter((value): value is number => value !== null);
  if (values.length === 0) return "—";
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return `${mean.toFixed(1)} (${Math.min(...values).toFixed(1)}–${Math.max(...values).toFixed(1)})`;
}

function milestoneSummary(runs: MatrixRun[]): string {
  return markdown(
    ["Monde", "1re recrue", "1er arc", "1er objet utilisé", "Prestige +1", "Nœud à 2", "Monde à 3"],
    [...new Set(runs.map((run) => run.label))].map((label) => {
      const reports = runs.filter((run) => run.label === label).map((run) => run.report);
      return [
        label,
        minuteCell(reports, (report) => report.milestones.firstRecruitMinutes),
        minuteCell(reports, (report) => report.milestones.firstArcMinutes),
        minuteCell(reports, (report) => report.milestones.firstUsefulItemMinutes),
        minuteCell(reports, (report) => report.milestones.firstPrestigeMinutes),
        minuteCell(reports, (report) => report.milestones.firstTreePurchaseMinutes),
        minuteCell(reports, (report) => report.milestones.firstWorldUnlockMinutes),
      ];
    })
  );
}

function entryExitSummary(runs: MatrixRun[]): string {
  return markdown(
    ["Monde", "Durée", "Équipe", "DPS sortie", "Gains", "Prestige"],
    [...new Set(runs.map((run) => run.label))].map((label) => {
      const reports = runs.filter((run) => run.label === label).map((run) => run.report);
      const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
      return [
        label,
        `${mean(reports.map((report) => report.totals.minutes)).toFixed(1)} min`,
        mean(reports.map((report) => report.totals.teamSize)).toFixed(0),
        fmt(mean(reports.map((report) => report.arcs[report.arcs.length - 1]?.teamDps ?? 0))),
        fmt(mean(reports.map((report) => report.totals.lifetimeEarned))),
        mean(reports.map((report) => report.totals.prestigeGain)).toFixed(1),
      ];
    })
  );
}

function runScenarios(
  seeds: number[],
  scenarios: Array<{ label: string; options: Partial<SimOptions> }>
): MatrixRun[] {
  return scenarios.flatMap((scenario) =>
    seeds.map((seed) => ({
      label: scenario.label,
      report: simulateRun(gameData, {
        maxMinutes: 120,
        stallMinutes: 15,
        seed,
        ...scenario.options,
      }),
    }))
  );
}

const seeds = parseSeeds(process.argv.slice(2));

const worlds = runScenarios(
  seeds,
  ENTRY_WORLDS.map((entryAnimeId) => ({ label: entryAnimeId, options: { entryAnimeId } }))
);

const systems = runScenarios(seeds, [
  { label: "Référence", options: { entryAnimeId: "naruto" } },
  { label: "Sans capacités", options: { entryAnimeId: "naruto", abilities: false } },
  { label: "Sans passifs", options: { entryAnimeId: "naruto", rankPassives: false } },
  { label: "Sans packs", options: { entryAnimeId: "naruto", packs: false } },
  { label: "Sans équipement", options: { entryAnimeId: "naruto", equip: false } },
]);

const cadence = runScenarios(
  seeds,
  [1, 2, 4, 8].map((clicksPerSecond) => ({
    label: `${clicksPerSecond} clic${clicksPerSecond > 1 ? "s" : ""}/s`,
    options: { entryAnimeId: "naruto", clicksPerSecond },
  }))
);

const entryOnly = runScenarios(seeds, [
  { label: "Naruto", options: { entryAnimeId: "naruto", stopAfterEntryWorld: true } },
  { label: "Bleach", options: { entryAnimeId: "bleach", stopAfterEntryWorld: true } },
]);

const narutoThenBleach = runScenarios(seeds, [
  {
    label: "Naruto → Bleach",
    options: {
      entryAnimeId: "naruto",
      worldOrder: ["bleach", "shippuden", "boruto", "hunter-x-hunter"],
    },
  },
]);

const bleachRoutes: MatrixRun[] = [
  ...worlds.filter((run) => run.label === "naruto").map((run) => ({ ...run, label: "Naruto → Shippūden" })),
  ...worlds
    .filter((run) => run.label === "bleach")
    .map((run) => ({ ...run, label: "Bleach → Naruto → Shippūden" })),
  ...narutoThenBleach,
];

console.log(`# Matrices de simulation\n`);
console.log(`Graines : ${seeds.join(", ")} · budget 120 min · mur après 15 min sans terminer un arc.\n`);
console.log("Chaque monde de la première matrice est lancé comme monde d'entrée à difficulté ×1 ; ce n'est pas un enchaînement de run.\n");
console.log("## 1. Stabilité des mondes d'entrée\n");
console.log(`${summary(worlds)}\n\n${details(worlds, seeds)}\n`);
console.log("## 2. Contribution des systèmes — départ Naruto\n");
console.log(`${summary(systems)}\n\n${details(systems, seeds)}\n`);
console.log("## 3. Sensibilité à la cadence — départ Naruto\n");
console.log(`${summary(cadence)}\n\n${details(cadence, seeds)}\n`);
console.log("## 4. Jalons de première expérience\n");
console.log("Valeurs en minutes : moyenne (minimum–maximum). L’objet est compté lorsqu’un unique est équipé ou qu’un rang de passif est acheté.\n");
console.log(`${milestoneSummary(worlds)}\n`);
console.log("## 5. Diagnostic Bleach\n");
console.log("### Sortie du seul monde d’entrée\n");
console.log(`${entryExitSummary(entryOnly)}\n`);
console.log("### Effet de l’ordre des mondes\n");
console.log(`${summary(bleachRoutes)}\n\n${details(bleachRoutes, seeds)}\n`);
