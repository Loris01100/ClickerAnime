import { For, Show, createMemo, onCleanup, onMount } from "solid-js";
import type { GameStore } from "../engine/gameState";
import type { AbilityPolicy } from "../engine/abilities";
import { describeAbility } from "./describe";

/** Un plan par capacité, dans l'ordre où le nœud « Réflexe » les ouvre. */
const PLANS: { id: AbilityPolicy; label: string; help: string }[] = [
  { id: "always", label: "Auto", help: "Lancée dès qu'elle est prête." },
  { id: "boss", label: "Boss", help: "Gardée pour le boss de l'arc — ignorée sur les mobs." },
  {
    id: "sync",
    label: "Groupe",
    help: "Attend que toutes les capacités du groupe soient prêtes, puis elles partent ensemble.",
  },
];

/**
 * L'écran des plans d'automatisation : ce que le « Réflexe » a le droit de lancer, capacité par
 * capacité. Séparé de la barre de capacités parce que ce n'est pas le même geste — la barre sert à
 * lancer maintenant, ici on règle une fois pour toutes ce que le robot fera à notre place. Le plan
 * ne touche jamais le clic manuel : le bouton d'une capacité la lance quoi qu'il arrive.
 */
export default function ReflexPanel(props: { game: GameStore; onClose: () => void }) {
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") props.onClose();
  }
  onMount(() => document.addEventListener("keydown", onKeyDown));
  onCleanup(() => document.removeEventListener("keydown", onKeyDown));

  const choices = () => props.game.abilityPolicyChoices();
  const ready = (id: string) => props.game.abilityCooldownRemaining(id) === 0;

  /** Groupées d'abord, puis les boss, puis le reste : l'écran se lit comme le plan lui-même. */
  const rows = createMemo(() => {
    const rank = (p: AbilityPolicy) => (p === "sync" ? 0 : p === "boss" ? 1 : 2);
    return [...props.game.unlockedAbilities()].sort(
      (a, b) => rank(props.game.abilityPolicyOf(a.ability.id)) - rank(props.game.abilityPolicyOf(b.ability.id))
    );
  });

  const group = createMemo(() => rows().filter((u) => props.game.abilityPolicyOf(u.ability.id) === "sync"));
  const groupReady = () => group().filter((u) => ready(u.ability.id)).length;

  return (
    <div class="overlay" onClick={props.onClose}>
      <div
        class="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Plans du Réflexe"
        onClick={(e) => e.stopPropagation()}
      >
        <header class="panel-head">
          <span>Plans du Réflexe</span>
          <button onClick={props.onClose} aria-label="Fermer">
            ✕
          </button>
        </header>

        <div class="codex-detail scroll">
          <p class="muted small">
            Le Réflexe lance seul les capacités prêtes. Ici on lui dit lesquelles il a le droit de
            dépenser tout de suite, lesquelles garder pour un boss, et lesquelles tenir ensemble.
            Ces plans ne concernent que l'automatisation : cliquer une capacité la lance toujours.
          </p>

          <Show
            when={choices().length > 0}
            fallback={<p class="muted small">Achetez le nœud « Réflexe » de la branche Automatisation pour planifier.</p>}
          >
            <Show when={choices().length < PLANS.length}>
              <p class="muted small">
                Niveau {props.game.automationLevelOf("ability")} : {choices().length === 1 ? "« Boss » s'ouvre au niveau 2, « Groupe » au niveau 3." : "« Groupe » s'ouvre au niveau 3."}
              </p>
            </Show>

            <Show when={group().length > 0}>
              <p class="reflex-group small">
                Groupe : {groupReady()}/{group().length} prêtes —{" "}
                {groupReady() === group().length ? "elles partent au prochain déclenchement." : "en attente."}
              </p>
            </Show>

            <For each={rows()}>
              {(unlocked) => {
                const current = () => props.game.abilityPolicyOf(unlocked.ability.id);
                const targets = () =>
                  unlocked.characterIds
                    .map((id) => props.game.characterOf(id)?.name ?? id)
                    .join(", ");
                return (
                  <div class="reflex-row" classList={{ ready: ready(unlocked.ability.id) }}>
                    <div class="reflex-id">
                      <strong>{unlocked.ability.name}</strong>
                      <small class="muted">{targets()}</small>
                      <small class="muted">
                        {describeAbility(unlocked.ability, props.game.abilityMagnitudeOf(unlocked.ability))}
                      </small>
                    </div>
                    <div class="reflex-plans">
                      <For each={PLANS}>
                        {(plan) => {
                          const open = () => choices().includes(plan.id);
                          return (
                            <button
                              class="reflex-plan"
                              classList={{ on: current() === plan.id }}
                              aria-pressed={current() === plan.id}
                              disabled={!open()}
                              title={open() ? plan.help : "Pas encore ouvert par le nœud « Réflexe »."}
                              onClick={() => props.game.setAbilityPolicy(unlocked.ability.id, plan.id)}
                            >
                              {plan.label}
                            </button>
                          );
                        }}
                      </For>
                    </div>
                  </div>
                );
              }}
            </For>

            <Show when={rows().length === 0}>
              <p class="muted small">Aucune capacité débloquée pour l'instant.</p>
            </Show>
          </Show>
        </div>
      </div>
    </div>
  );
}
