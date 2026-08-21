import { For, Show, createMemo, createSignal } from "solid-js";
import type { GameStore } from "../engine/gameState";
import Sprite from "./Sprite";
import { fmt } from "./format";
import { IconLock } from "./icons";

/** The route map of one world: its arcs as nodes on a path, in order. */
export default function WorldMap(props: { game: GameStore }) {
  const [pinned, setPinned] = createSignal<string | null>(null);

  // Follows the arc being fought unless the player has explicitly picked another world's map.
  const shown = createMemo(() => {
    const unlocked = props.game.unlockedAnimes();
    const wanted = pinned() ?? props.game.activeArc()?.animeId;
    return unlocked.find((a) => a.id === wanted) ?? unlocked[0];
  });

  return (
    <Show when={shown()}>
      {(anime) => (
        <section class="panel">
          <header class="panel-head">
            <span>Carte — {anime().name}</span>
            <small class="muted">difficulté x{fmt(props.game.difficultyOf(anime().id))}</small>
          </header>

          <Show when={props.game.unlockedAnimes().length > 1}>
            <div class="map-tabs">
              <For each={props.game.unlockedAnimes()}>
                {(candidate) => (
                  <button
                    classList={{ active: candidate.id === anime().id }}
                    onClick={() => setPinned(candidate.id)}
                  >
                    {candidate.name}
                    <Show when={props.game.animeCleared(candidate.id)}> ✓</Show>
                  </button>
                )}
              </For>
            </div>
          </Show>

          <div class="map">
            <For each={props.game.arcsOf(anime().id)}>
              {(arc, index) => {
                const open = () => props.game.arcOpen(arc);
                const cleared = () => props.game.arcCleared(arc);
                const kills = () => Math.min(props.game.killsIn(arc), arc.mobsToBoss);
                return (
                  <>
                    <Show when={index() > 0}>
                      <div class="map-link" classList={{ done: open() }} />
                    </Show>
                    <button
                      class="map-node"
                      classList={{
                        active: props.game.activeArc()?.id === arc.id,
                        cleared: cleared(),
                        locked: !open(),
                      }}
                      disabled={!open()}
                      title={arc.name}
                      onClick={() => props.game.setActiveArc(arc.id)}
                    >
                      <Show when={open()} fallback={<span class="map-lock"><IconLock /></span>}>
                        <Sprite seed={arc.boss.id} px={4} dim={!open()} />
                      </Show>
                      <span class="map-name">{arc.name}</span>
                      <small class="muted">{cleared() ? "terminé" : `${kills()}/${arc.mobsToBoss}`}</small>
                    </button>
                  </>
                );
              }}
            </For>
          </div>
        </section>
      )}
    </Show>
  );
}
