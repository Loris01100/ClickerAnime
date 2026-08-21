import { For, Show } from "solid-js";
import type { GameStore } from "../engine/gameState";
import { fmt } from "./format";

/** Right column: arcs of the animes entered, travel to a new world, and the prestige track. */
export default function ProgressPanel(props: { game: GameStore }) {
  const otherAnimes = () =>
    props.game.data.animes.filter((a) => !props.game.prestige().unlockedAnimeIds.includes(a.id));

  return (
    <div class="column">
      <section class="panel">
        <header class="panel-head">
          <span>Arcs</span>
          <small class="muted">{props.game.clearedAnimes().length} monde(s) terminé(s)</small>
        </header>

        <For each={props.game.unlockedAnimes()}>
          {(anime) => (
            <div class="arc-group">
              <small class="muted">
                {anime.name} · difficulté x{fmt(props.game.difficultyOf(anime.id))}
                <Show when={props.game.animeCleared(anime.id)}> · terminé ✓</Show>
              </small>
              <For each={props.game.arcsOf(anime.id)}>
                {(arc) => {
                  const open = () => props.game.arcOpen(arc);
                  const cleared = () => props.game.arcCleared(arc);
                  return (
                    <button
                      class="arc"
                      classList={{ active: props.game.activeArc()?.id === arc.id, cleared: cleared() }}
                      disabled={!open()}
                      onClick={() => props.game.setActiveArc(arc.id)}
                    >
                      <span>{open() ? arc.name : `🔒 ${arc.name}`}</span>
                      <small class="muted">
                        {cleared() ? "✓" : `${Math.min(props.game.killsIn(arc), arc.mobsToBoss)}/${arc.mobsToBoss}`}
                      </small>
                    </button>
                  );
                }}
              </For>
            </div>
          )}
        </For>
      </section>

      <Show when={otherAnimes().length > 0}>
        <section class="panel">
          <header class="panel-head">Voyager</header>
          <p class="muted small">
            <Show
              when={props.game.canTravel()}
              fallback="Terminez l'anime en cours pour partir vers un autre monde (ou payez le raccourci en points de prestige)."
            >
              Prochain monde à la difficulté x{fmt(props.game.nextDifficulty())}.
            </Show>
          </p>
          <ul class="list">
            <For each={otherAnimes()}>
              {(anime) => (
                <li class="row">
                  <div>
                    <strong>{anime.name}</strong>
                    <small class="muted">{props.game.arcsOf(anime.id).length} arcs</small>
                  </div>
                  <Show
                    when={props.game.canTravel()}
                    fallback={
                      <button
                        disabled={props.game.prestige().prestigePoints < anime.unlockCost}
                        title="Raccourci payant : entrer sans avoir fini le monde en cours"
                        onClick={() => props.game.unlockAnime(anime.id)}
                      >
                        {anime.unlockCost} pts
                      </button>
                    }
                  >
                    <button onClick={() => props.game.travelTo(anime.id)}>Partir</button>
                  </Show>
                </li>
              )}
            </For>
          </ul>
        </section>
      </Show>

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
        <p class="muted small">
          Réinitialise la run (monnaie, équipe). Conserve les points, les mondes visités et les arcs terminés.
        </p>
      </section>
    </div>
  );
}
