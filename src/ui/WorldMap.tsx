import { For, Show, createMemo, createSignal } from "solid-js";
import type { GameStore } from "../engine/gameState";
import { layoutArcs, type MapNode } from "../engine/mapLayout";
import { themeOf } from "./hue";
import PanelTitle from "./PanelTitle";
import Sprite from "./Sprite";
import { asset } from "./asset";
import { fmt } from "./format";
import { IconCheck, IconLock, IconPin, IconStar } from "./icons";

/** The route map of one world: its arcs on a generated snake path, with a marker on the active one. */
export default function WorldMap(props: { game: GameStore }) {
  const [pinned, setPinned] = createSignal<string | null>(null);
  const [open, setOpen] = createSignal(true);
  const [expanded, setExpanded] = createSignal(false);

  // Follows the arc being fought unless the player has explicitly picked another world's map.
  const shown = createMemo(() => {
    const unlocked = props.game.unlockedAnimes();
    const wanted = pinned() ?? props.game.activeArc()?.animeId;
    return unlocked.find((a) => a.id === wanted) ?? unlocked[0];
  });

  const layout = createMemo(() => layoutArcs(props.game.arcsOf(shown()?.id ?? "")));

  const markerNode = createMemo<MapNode | null>(() => {
    const active = props.game.activeArc();
    if (!active || active.animeId !== shown()?.id) return null;
    return layout().nodes.find((n) => n.arc.id === active.id) ?? null;
  });

  return (
    <Show when={shown()}>
      {(anime) => (
        <section class="panel">
          <header class="panel-head">
            <PanelTitle open={open()} onToggle={() => setOpen(!open())}>
              Carte — {anime().name}
            </PanelTitle>
            <button
              class="map-size-toggle"
              aria-pressed={expanded()}
              onClick={() => setExpanded(!expanded())}
            >
              {expanded() ? "Réduire" : "Agrandir"}
            </button>
            <Show when={anime().alpha}>
              <small class="portal-badge alpha">Alpha</small>
            </Show>
            <small class="muted">difficulté x{fmt(props.game.difficultyOf(anime().id))}</small>
          </header>

          <Show when={open()}>
          <Show when={props.game.unlockedAnimes().length > 1}>
            <div class="tabs">
              <For each={props.game.unlockedAnimes()}>
                {(candidate) => (
                  <button
                    classList={{ active: candidate.id === anime().id }}
                    onClick={() => setPinned(candidate.id)}
                  >
                    {candidate.name}
                    <Show when={props.game.animeCleared(candidate.id)}> <IconCheck class="good" /></Show>
                  </button>
                )}
              </For>
            </div>
          </Show>

          <div class="map-canvas-wrap">
            <div
              class="map-canvas"
              classList={{ compact: !expanded() }}
              style={{
                // With a map image the canvas takes the image's own ratio; without one it takes the
                // generated grid's.
                "aspect-ratio": anime().mapImage ? undefined : `${layout().cols} / ${layout().rows}`,
                "--map-max-width": anime().mapImage ? "48rem" : `calc(${layout().cols} * 9rem)`,
                // The pinned tab can show a different world than the one being fought, so the map
                // carries its own hue rather than inheriting the shell's.
                "--world-hue": themeOf(anime()),
              }}
            >
              <Show when={anime().mapImage}>
                {(src) => <img class="map-bg" src={asset(src())} alt="" />}
              </Show>

              <svg class="map-links" viewBox="0 0 100 100" preserveAspectRatio="none">
                <For each={layout().nodes}>
                  {(node, index) => {
                    const prev = () => layout().nodes[index() - 1];
                    return (
                      <Show when={index() > 0}>
                        <line
                          class="map-link-line"
                          classList={{ done: props.game.arcOpen(node.arc) }}
                          x1={prev().x * 100}
                          y1={prev().y * 100}
                          x2={node.x * 100}
                          y2={node.y * 100}
                        />
                      </Show>
                    );
                  }}
                </For>
              </svg>

              <For each={layout().nodes}>
                {(node) => {
                  const open = () => props.game.arcOpen(node.arc);
                  const cleared = () => props.game.arcCleared(node.arc);
                  const kills = () => Math.min(props.game.killsIn(node.arc), node.arc.mobsToBoss);
                  return (
                    <button
                      class="map-node"
                      classList={{
                        pin: !!anime().mapImage,
                        active: props.game.activeArc()?.id === node.arc.id,
                        cleared: cleared(),
                        locked: !open(),
                      }}
                      style={{ left: `${node.x * 100}%`, top: `${node.y * 100}%` }}
                      disabled={!open()}
                      title={node.arc.name}
                      onClick={() => props.game.setActiveArc(node.arc.id)}
                    >
                      <Show when={open()} fallback={<span class="map-lock"><IconLock /></span>}>
                        <Show
                          when={!anime().presentation}
                          fallback={<span class="map-moment"><IconStar /></span>}
                        >
                          <Sprite name={node.arc.boss.name} kind="character" anime={anime().name} px={anime().mapImage ? 2.6 : 4} dim={!open()} />
                        </Show>
                      </Show>
                      <span class="map-name">{node.arc.name}</span>
                      <small class="muted">{cleared() ? "terminé" : `${kills()}/${node.arc.mobsToBoss}`}</small>
                    </button>
                  );
                }}
              </For>

              <Show when={markerNode()}>
                {(node) => (
                  <div class="map-marker" style={{ left: `${node().x * 100}%`, top: `${node().y * 100}%` }}>
                    <IconPin />
                  </div>
                )}
              </Show>
            </div>
          </div>
          </Show>
        </section>
      )}
    </Show>
  );
}
