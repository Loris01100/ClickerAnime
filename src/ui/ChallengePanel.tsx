import { For, Show, onCleanup, onMount } from "solid-js";
import type { GameStore } from "../engine/gameState";
import type { ChallengeDefinition } from "../engine/challenges";
import { describeModifier } from "./describe";
import { IconCheck, IconTarget } from "./icons";

/**
 * Défis de run : la même partie, jouée avec une règle en moins. Chaque défi se lance depuis une
 * réinitialisation (c'est ce que dit le `confirm()`), se termine en descendant son quota d'arcs
 * sous la contrainte, et paie un bonus permanent qui survit à tous les resets suivants.
 */
export default function ChallengePanel(props: { game: GameStore; onClose: () => void }) {
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") props.onClose();
  }
  onMount(() => document.addEventListener("keydown", onKeyDown));
  onCleanup(() => document.removeEventListener("keydown", onKeyDown));

  const active = () => props.game.activeChallenge();
  const progress = () => props.game.challengeProgressOf();

  function start(challenge: ChallengeDefinition) {
    const gain = props.game.pendingPrestigeGain();
    const banked = gain > 0 ? ` Les ${gain} point${gain > 1 ? "s" : ""} de prestige en attente sont banqués.` : "";
    if (!confirm(`Lancer « ${challenge.name} » ? Le run en cours est réinitialisé.${banked}`)) return;
    props.game.startChallenge(challenge.id);
    props.onClose();
  }

  function abandon() {
    const challenge = active();
    if (!challenge) return;
    if (!confirm(`Abandonner « ${challenge.name} » ? Le run en cours est réinitialisé, sans récompense.`)) return;
    props.game.abandonChallenge();
    props.onClose();
  }

  return (
    <div class="overlay" onClick={props.onClose}>
      <div class="modal" role="dialog" aria-modal="true" aria-label="Défis de run" onClick={(e) => e.stopPropagation()}>
        <header class="panel-head">
          <span>Défis de run</span>
          <button onClick={props.onClose} aria-label="Fermer">
            ✕
          </button>
        </header>

        <div class="codex-detail scroll">
          <p class="muted small">
            Un défi, c'est la même partie avec une règle en moins. On le lance depuis une
            réinitialisation, on termine son quota d'arcs sans jamais pouvoir enfreindre la règle —
            le jeu refuse, il n'y a rien à perdre en cours de route — et la récompense est
            définitive. Un prestige pendant un défi le garde actif, mais sa progression repart de
            zéro : elle compte les arcs terminés du run en cours.
          </p>

          <For each={props.game.challenges}>
            {(challenge) => {
              const done = () => props.game.isChallengeDone(challenge.id);
              const running = () => active()?.id === challenge.id;
              const cleared = () => (running() ? (progress()?.cleared ?? 0) : 0);
              const pct = () => (cleared() / challenge.goal) * 100;

              return (
                <div class="codex-block challenge" classList={{ done: done(), running: running() }}>
                  <h4>
                    <IconTarget /> {challenge.name}
                    <Show when={done()}>
                      <span class="challenge-flag done">
                        <IconCheck /> relevé
                      </span>
                    </Show>
                    <Show when={running()}>
                      <span class="challenge-flag">en cours</span>
                    </Show>
                  </h4>
                  <p class="small">{challenge.constraint}</p>

                  <div class="codex-row">
                    <span class="muted">Objectif</span>
                    <strong>
                      {cleared()} / {challenge.goal} arcs terminés
                    </strong>
                  </div>
                  <Show when={running()}>
                    <div class="bar xp-bar">
                      <div class="bar-fill" style={{ width: `${pct()}%` }} />
                    </div>
                  </Show>

                  <div class="codex-row">
                    <span class="muted">Récompense</span>
                    <strong>{challenge.reward.map(describeModifier).join(" · ")}</strong>
                  </div>

                  <Show when={!done()}>
                    <Show
                      when={running()}
                      fallback={
                        <button
                          class="primary"
                          disabled={!!active()}
                          title={active() ? "Un défi est déjà en cours." : "Lance le défi — le run en cours est réinitialisé."}
                          onClick={() => start(challenge)}
                        >
                          Lancer le défi
                        </button>
                      }
                    >
                      <button class="danger" onClick={abandon}>
                        Abandonner
                      </button>
                    </Show>
                  </Show>
                </div>
              );
            }}
          </For>
        </div>
      </div>
    </div>
  );
}
