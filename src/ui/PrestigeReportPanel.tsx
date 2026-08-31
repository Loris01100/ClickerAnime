import { For, Show, onCleanup, onMount } from "solid-js";
import type { GameStore } from "../engine/gameState";
import type { PrestigeReport } from "../engine/prestigeReport";
import Coin from "./Coin";
import { fmt } from "./format";
import { IconCheck, IconSparkle, IconTrophy } from "./icons";

const duration = (milliseconds: number) => {
  const totalMinutes = Math.floor(milliseconds / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours} h ${minutes.toString().padStart(2, "0")} min` : `${minutes} min`;
};

export default function PrestigeReportPanel(props: {
  game: GameStore;
  report: PrestigeReport;
  onClose: () => void;
}) {
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") props.onClose();
  }
  onMount(() => document.addEventListener("keydown", onKeyDown));
  onCleanup(() => document.removeEventListener("keydown", onKeyDown));

  const worldNames = () =>
    props.report.unlockedAnimeIds.map((id) => props.game.animeOf(id)?.name ?? id).join(", ");
  const arcNames = () =>
    props.report.clearedArcIds.map((id) => props.game.arcOf(id)?.name ?? id);

  const activity = () => [
    ["Ennemis", props.report.mobsKilled],
    ["Boss", props.report.bossesKilled],
    ["Clics", props.report.clicks],
    ["Capacités", props.report.abilitiesUsed],
    ["Objets communs", props.report.commonItemsCollected],
    ["Passifs améliorés", props.report.passiveRanksBought],
    ["Packs", props.report.packsOpened],
  ] as const;

  return (
    <div class="overlay" onClick={props.onClose}>
      <div
        class="modal prestige-report-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Bilan de prestige"
        onClick={(event) => event.stopPropagation()}
      >
        <header class="panel-head">
          <span>Bilan de l’aventure</span>
          <button onClick={props.onClose} aria-label="Fermer">Fermer</button>
        </header>

        <div class="prestige-report-hero">
          <IconTrophy />
          <div>
            <small>Prestige accompli</small>
            <strong>
              +{props.report.prestigeGained} <Coin kind="prestige" />
            </strong>
            <span>{props.report.prestigeTotal} points au total</span>
          </div>
          <Show when={props.report.gainMultiplier > 1}>
            <span class="prestige-report-lucky">Destin ×{props.report.gainMultiplier}</span>
          </Show>
        </div>

        <div class="prestige-report-scroll scroll">
          <section class="prestige-report-summary">
            <div><small>Durée</small><strong>{duration(props.report.durationMs)}</strong></div>
            <div><small>Or gagné</small><strong>{fmt(props.report.lifetimeEarned)}</strong></div>
            <div><small>Complétion</small><strong>{Math.round(props.report.completion * 100)} %</strong></div>
            <div><small>Personnages</small><strong>{props.report.ownedCharacterCount}</strong></div>
            <div><small>Niveau moyen</small><strong>{fmt(props.report.averageLevel)}</strong></div>
            <div><small>Niveau maximal</small><strong>{props.report.maxLevel}</strong></div>
            <div><small>DPS final</small><strong>{fmt(props.report.teamDps)}</strong></div>
            <div><small>Clic final</small><strong>{fmt(props.report.clickPower)}</strong></div>
          </section>

          <section class="prestige-report-section">
            <h3>Activité du run</h3>
            <div class="prestige-report-activity">
              <For each={activity()}>
                {([label, value]) => <div><span>{label}</span><strong>{fmt(value)}</strong></div>}
              </For>
            </div>
          </section>

          <section class="prestige-report-section prestige-report-kept">
            <h3><IconSparkle /> Maîtrises conservées</h3>
            <p>
              <strong>{props.report.passiveRanksKept}</strong> rangs de passif et
              <strong> {props.report.forgedUniquesKept}</strong> objets uniques améliorés reviendront avec leurs personnages et objets.
            </p>
            <p><strong>{props.report.uniqueItemsFound}</strong> objets uniques trouvés pendant l’aventure.</p>
          </section>

          <section class="prestige-report-section">
            <h3>Mondes parcourus</h3>
            <p>{worldNames() || "Aucun monde"}</p>
            <Show when={props.report.challengeName}>
              <p>Défi joué : <strong>{props.report.challengeName}</strong></p>
            </Show>
          </section>

          <section class="prestige-report-section">
            <h3>Arcs terminés ({arcNames().length})</h3>
            <Show when={arcNames().length > 0} fallback={<p class="muted">Aucun arc terminé pendant ce run.</p>}>
              <div class="prestige-report-arcs">
                <For each={arcNames()}>{(name) => <span><IconCheck /> {name}</span>}</For>
              </div>
            </Show>
          </section>
        </div>
      </div>
    </div>
  );
}
