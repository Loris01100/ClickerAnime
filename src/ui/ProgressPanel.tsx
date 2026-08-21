import { For, Show } from "solid-js";
import type { GameStore } from "../engine/gameState";
import { fmt } from "./format";

const pct = (into: number, need: number) => (need > 0 ? Math.min(100, (into / need) * 100) : 0);

/** Right column: the arc list per world, travel, and the prestige track. */
export default function ProgressPanel(props: { game: GameStore }) {
  const otherAnimes = () =>
    props.game.data.animes.filter((a) => !props.game.prestige().unlockedAnimeIds.includes(a.id));

  return (
    <div class="column">
      <For each={props.game.unlockedAnimes()}>
        {(anime) => (
          <section class="panel">
            <header class="panel-head">
              <span>
                {anime.name}
                <Show when={props.game.animeCleared(anime.id)}> ✓</Show>
              </span>
              <small class="muted">x{fmt(props.game.difficultyOf(anime.id))}</small>
            </header>
            <For each={props.game.arcsOf(anime.id)}>
              {(arc) => {
                const open = () => props.game.arcOpen(arc);
                const cleared = () => props.game.arcCleared(arc);
                const kills = () => Math.min(props.game.killsIn(arc), arc.mobsToBoss);
                return (
                  <button
                    class="arc"
                    classList={{ active: props.game.activeArc()?.id === arc.id, cleared: cleared() }}
                    disabled={!open()}
                    onClick={() => props.game.setActiveArc(arc.id)}
                  >
                    <span class="arc-name">{open() ? arc.name : `🔒 ${arc.name}`}</span>
                    <div class="bar arc-bar">
                      <div
                        class="bar-fill"
                        style={{ width: `${cleared() ? 100 : pct(kills(), arc.mobsToBoss)}%` }}
                      />
                      <span class="bar-label">
                        {cleared() ? "terminé" : `${kills()} / ${arc.mobsToBoss}`}
                      </span>
                    </div>
                  </button>
                );
              }}
            </For>
          </section>
        )}
      </For>

      <Show when={otherAnimes().length > 0}>
        <section class="panel">
          <header class="panel-head">
            <span>Voyager</span>
            <small class="muted">x{fmt(props.game.nextDifficulty())}</small>
          </header>
          <p class="muted pad small">
            <Show
              when={props.game.canTravel()}
              fallback="Terminez l'anime en cours pour partir, ou payez le raccourci en prestige."
            >
              Le prochain monde sera joué à cette difficulté.
            </Show>
          </p>
          <For each={otherAnimes()}>
            {(anime) => {
              // Un monde peut attendre son prédécesseur : ni le voyage ni le raccourci payant ne
              // permettent de prendre une suite avant son histoire.
              const blockedBy = () => props.game.animeBlockedBy(anime.id);
              return (
                <div class="row">
                  <span class="name">
                    {blockedBy() ? `🔒 ${anime.name}` : anime.name}
                  </span>
                  <Show
                    when={!blockedBy()}
                    fallback={<small class="muted">après {blockedBy()!.name}</small>}
                  >
                    <Show
                      when={props.game.canTravel()}
                      fallback={
                        <button
                          disabled={props.game.prestige().prestigePoints < anime.unlockCost}
                          title="Raccourci payant : entrer sans avoir fini le monde en cours"
                          onClick={() => props.game.unlockAnime(anime.id)}
                        >
                          {anime.unlockCost} ✦
                        </button>
                      }
                    >
                      <button onClick={() => props.game.travelTo(anime.id)}>Partir</button>
                    </Show>
                  </Show>
                </div>
              );
            }}
          </For>
        </section>
      </Show>

      <section class="panel">
        <header class="panel-head">
          <span>Prestige</span>
          <small class="muted">{props.game.prestige().prestigePoints} ✦</small>
        </header>
        <div class="pad">
          <button
            class="primary"
            disabled={props.game.pendingPrestigeGain() <= 0}
            onClick={() => props.game.prestigeReset()}
          >
            Prestige (+{props.game.pendingPrestigeGain()})
          </button>
          <p class="muted small">
            Réinitialise tout : monnaie, équipe, niveaux, mondes, arcs terminés, objets et passifs.
            Seuls les points de prestige sont conservés.
          </p>
        </div>
      </section>
    </div>
  );
}
