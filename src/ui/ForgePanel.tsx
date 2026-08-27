import { For, Show, onCleanup, onMount } from "solid-js";
import type { GameStore } from "../engine/gameState";
import ItemIcon from "./ItemIcon";

/** Full forge view: the small ProgressPanel entry stays compact while upgrades remain readable. */
export default function ForgePanel(props: { game: GameStore; onClose: () => void }) {
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") props.onClose();
  }
  onMount(() => document.addEventListener("keydown", onKeyDown));
  onCleanup(() => document.removeEventListener("keydown", onKeyDown));

  return (
    <div class="overlay" onClick={props.onClose}>
      <div class="modal forge-modal" role="dialog" aria-modal="true" aria-label="Forge" onClick={(event) => event.stopPropagation()}>
        <header class="panel-head">
          <span>Forge</span>
          <button onClick={props.onClose} aria-label="Fermer">✕</button>
        </header>
        <div class="forge-grid scroll">
          <For each={props.game.forgeableUniques()}>
            {(item) => {
              const level = () => props.game.uniqueUpgradeLevelOf(item.id);
              const cost = () => props.game.uniqueUpgradeCostOf(item.id);
              const fragments = () => props.game.uniqueFragmentsOf(item.id);
              return (
                <article class="forge-card">
                  {/* Reserved art frame: bespoke forge illustrations can replace this icon later. */}
                  <div class="forge-art"><ItemIcon id={item.id} kind="unique" px={72} /></div>
                  <div class="forge-info">
                    <h3>{item.name}</h3>
                    <p>Niveau {level()}/5 · puissance {Math.round(props.game.uniqueUpgradeMultiplierOf(item.id) * 100)} %</p>
                    <small class="muted">{fragments()} fragment{fragments() === 1 ? "" : "s"} obtenus sur son boss.</small>
                    <button
                      class="primary"
                      disabled={cost() === null || fragments() < (cost() ?? 0)}
                      onClick={() => props.game.upgradeUnique(item.id)}
                    >
                      <Show when={cost() !== null} fallback="Niveau maximum">
                        Améliorer au niveau {level() + 1} · {fragments()}/{cost()} fragments
                      </Show>
                    </button>
                  </div>
                </article>
              );
            }}
          </For>
        </div>
      </div>
    </div>
  );
}
