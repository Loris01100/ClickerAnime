import { onCleanup, onMount } from "solid-js";
import type { GameStore } from "../engine/gameState";
import { IconStar } from "./icons";

/**
 * Entry point for the prestige skill tree: not designed yet (see CLAUDE.md — "the planned global
 * skill tree" points are meant to feed), so this is the view itself for now, not a stand-in for it.
 * Shows the balance the player is banking (arc clears + the prestige-reset gain both feed it
 * already) and a coming-soon state, ready to grow real nodes into once the tree is designed.
 */
export default function PrestigeTree(props: { game: GameStore; onClose: () => void }) {
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") props.onClose();
  }
  onMount(() => document.addEventListener("keydown", onKeyDown));
  onCleanup(() => document.removeEventListener("keydown", onKeyDown));

  return (
    <div class="overlay" onClick={props.onClose}>
      <div
        class="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Arbre de prestige"
        onClick={(e) => e.stopPropagation()}
      >
        <header class="panel-head">
          <span>Arbre de prestige</span>
          <button onClick={props.onClose} aria-label="Fermer">
            ✕
          </button>
        </header>

        <div class="prestige-tree pad">
          <div class="prestige-tree-balance">
            <IconStar />
            <strong>{props.game.prestige().prestigePoints}</strong>
            <span class="muted">point{props.game.prestige().prestigePoints === 1 ? "" : "s"} de prestige</span>
          </div>

          <p class="muted small">
            Chaque arc terminé rapporte 1 point de prestige, en plus du gain versé à la
            réinitialisation. Pour l'instant ces points ne servent qu'au raccourci de voyage payant —
            l'arbre qui les dépensera ici est encore en préparation.
          </p>

          <div class="prestige-tree-placeholder">
            <IconStar size="2em" />
            <p class="muted small">Bientôt disponible</p>
          </div>
        </div>
      </div>
    </div>
  );
}
