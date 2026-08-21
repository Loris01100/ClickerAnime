import { For, Show } from "solid-js";
import type { GameStore } from "../engine/gameState";
import { fmt } from "./format";

interface Objective {
  label: string;
  current: number;
  goal: number;
}

/** Right column: arc selection, running objectives, and the prestige / anime unlock track. */
export default function ProgressPanel(props: { game: GameStore }) {
  const objectives = (): Objective[] => [
    { label: "Recruter 3 personnages", current: props.game.ownedCharacters().length, goal: 3 },
    { label: "Atteindre 10 /clic", current: props.game.clickPower(), goal: 10 },
    { label: "Atteindre 25 /s", current: props.game.passiveIncomePerSecond(), goal: 25 },
    { label: "Gagner 1M au total", current: props.game.lifetimeEarned(), goal: 1_000_000 },
  ];

  const lockedAnimes = () =>
    props.game.data.animes.filter((a) => !props.game.prestige().unlockedAnimeIds.includes(a.id));

  return (
    <div class="column">
      <section class="panel">
        <header class="panel-head">Arc actif</header>
        <For each={props.game.unlockedAnimes()}>
          {(anime) => (
            <div class="arc-group">
              <small class="muted">{anime.name}</small>
              <For each={props.game.data.arcs.filter((a) => a.animeId === anime.id).sort((a, b) => a.order - b.order)}>
                {(arc) => (
                  <button
                    class="arc"
                    classList={{ active: props.game.activeArc()?.id === arc.id }}
                    onClick={() => props.game.setActiveArc(arc.id)}
                  >
                    {arc.name}
                  </button>
                )}
              </For>
            </div>
          )}
        </For>
      </section>

      <section class="panel">
        <header class="panel-head">Objectifs</header>
        <ul class="list">
          <For each={objectives()}>
            {(objective) => (
              <li class="objective">
                <span>{objective.label}</span>
                <div class="bar">
                  <div class="bar-fill" style={{ width: `${Math.min(100, (objective.current / objective.goal) * 100)}%` }} />
                  <span class="bar-label">
                    {fmt(Math.min(objective.current, objective.goal))} / {fmt(objective.goal)}
                  </span>
                </div>
              </li>
            )}
          </For>
        </ul>
      </section>

      <section class="panel">
        <header class="panel-head">Prestige</header>
        <p class="muted">
          Points: <strong>{props.game.prestige().prestigePoints}</strong>
        </p>
        <button
          class="primary"
          disabled={props.game.pendingPrestigeGain() <= 0}
          onClick={() => props.game.prestigeReset()}
        >
          Prestige (+{props.game.pendingPrestigeGain()})
        </button>
        <p class="muted small">Réinitialise la run, conserve les points et les animes débloqués.</p>

        <ul class="list">
          <For each={lockedAnimes()}>
            {(anime) => (
              <li class="row">
                <strong>{anime.name}</strong>
                <button
                  disabled={props.game.prestige().prestigePoints < anime.unlockCost}
                  onClick={() => props.game.unlockAnime(anime.id)}
                >
                  {anime.unlockCost} pts
                </button>
              </li>
            )}
          </For>
          <Show when={lockedAnimes().length === 0}>
            <li class="muted">Tous les animes sont débloqués.</li>
          </Show>
        </ul>
      </section>
    </div>
  );
}
