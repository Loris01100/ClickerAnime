import { For, onCleanup, onMount } from "solid-js";
import type { GameStore } from "../engine/gameState";
import { ACHIEVEMENT_CATEGORIES } from "../engine/achievements";
import { PRESTIGE_TREE_CATEGORIES } from "../engine/prestigeTree";
import { fmt } from "./format";
import { IconClock, IconGlobe, IconSparkle, IconTrophy } from "./icons";

const duration = (milliseconds: number) => {
  const totalMinutes = Math.floor(Math.max(0, milliseconds) / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours} h ${minutes.toString().padStart(2, "0")} min` : `${minutes} min`;
};

/**
 * Read-only lifetime dashboard. Every number is derived from accessors the store already exposes —
 * `achievementCounts` (lifetime, never wiped by prestige), the prestige tree levels and the world
 * clear state — so the panel owns no state and touches no game rule.
 */
export default function StatsPanel(props: { game: GameStore; onClose: () => void }) {
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") props.onClose();
  }
  onMount(() => document.addEventListener("keydown", onKeyDown));
  onCleanup(() => document.removeEventListener("keydown", onKeyDown));

  const counts = () => props.game.achievementCounts();

  const run = () => [
    ["Durée du run", duration(props.game.now() - props.game.runStartedAt())],
    ["Or gagné ce run", fmt(props.game.lifetimeEarned())],
    ["Complétion", `${Math.round(props.game.runCompletion() * 100)} %`],
    ["Personnages", String(props.game.ownedCharacters().length)],
    ["DPS actuel", fmt(props.game.teamDps())],
    ["Clic actuel", fmt(props.game.clickPower())],
    ["Objets trouvés", String(props.game.foundItems().length)],
    ["Cristaux crossover", fmt(props.game.crossoverCrystals())],
  ] as const;

  const treeLevels = () =>
    PRESTIGE_TREE_CATEGORIES.reduce((sum, category) => sum + props.game.branchLevelsOf(category.id), 0);

  const meta = () => [
    ["Points de prestige", fmt(props.game.prestige().prestigePoints)],
    ["Prestiges effectués", fmt(counts().prestiges ?? 0)],
    ["Niveaux d’arbre", `${treeLevels()} / ${PRESTIGE_TREE_CATEGORIES.length * 25}`],
    ["Mondes débloqués", `${props.game.unlockedAnimes().length} / ${props.game.data.animes.length}`],
    ["Mondes terminés", `${props.game.clearedAnimes().length} / ${props.game.data.animes.length}`],
    ["Défis réussis", `${props.game.completedChallengeIds().length} / ${props.game.challenges.length}`],
  ] as const;

  const worlds = () =>
    props.game.data.animes.map((anime) => {
      const arcs = props.game.data.arcs.filter((arc) => arc.animeId === anime.id);
      const cleared = arcs.filter((arc) => props.game.arcCleared(arc)).length;
      return { anime, cleared, total: arcs.length };
    });

  return (
    <div class="overlay" onClick={props.onClose}>
      <div
        class="modal prestige-report-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Statistiques"
        onClick={(event) => event.stopPropagation()}
      >
        <header class="panel-head">
          <span>Statistiques</span>
          <button onClick={props.onClose} aria-label="Fermer">Fermer</button>
        </header>

        <div class="prestige-report-hero">
          <IconTrophy />
          <div>
            <small>Activité à vie</small>
            <strong>{fmt(counts().mobsKilled ?? 0)}</strong>
            <span>ennemis vaincus au total</span>
          </div>
        </div>

        <div class="prestige-report-scroll scroll">
          <section class="prestige-report-section" style={{ "margin-top": 0, "border-top": "none", "padding-top": 0 }}>
            <h3><IconClock /> Run en cours</h3>
            <div class="prestige-report-summary">
              <For each={run()}>
                {([label, value]) => <div><small>{label}</small><strong>{value}</strong></div>}
              </For>
            </div>
          </section>

          <section class="prestige-report-section">
            <h3><IconSparkle /> À vie</h3>
            <div class="prestige-report-activity">
              <For each={ACHIEVEMENT_CATEGORIES}>
                {(category) => (
                  <div><span>{category.label}</span><strong>{fmt(counts()[category.id] ?? 0)}</strong></div>
                )}
              </For>
            </div>
          </section>

          <section class="prestige-report-section prestige-report-kept">
            <h3><IconTrophy /> Méta-progression</h3>
            <div class="prestige-report-activity">
              <For each={meta()}>
                {([label, value]) => <div><span>{label}</span><strong>{value}</strong></div>}
              </For>
            </div>
          </section>

          <section class="prestige-report-section">
            <h3><IconGlobe /> Progression des mondes</h3>
            <div class="stats-worlds">
              <For each={worlds()}>
                {({ anime, cleared, total }) => (
                  <div class="stats-world">
                    <div class="stats-world-head">
                      <span>{anime.name}</span>
                      <strong>{cleared} / {total}</strong>
                    </div>
                    <div class="stats-bar">
                      <div class="stats-bar-fill" style={{ width: `${total > 0 ? (cleared / total) * 100 : 0}%` }} />
                    </div>
                  </div>
                )}
              </For>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
