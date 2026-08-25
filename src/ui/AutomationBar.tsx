import { For, Show } from "solid-js";
import type { GameStore } from "../engine/gameState";
import {
  AUTOMATION_KEYS,
  AUTOMATION_POSITIONS,
  type AutomationKey,
  PRESTIGE_TREE_CATEGORIES,
} from "../engine/prestigeTree";
import { seconds } from "./format";
import { IconGear } from "./icons";

/** The branch's own node labels, so a switch and its tree node can never drift apart. */
const NODES = PRESTIGE_TREE_CATEGORIES.find((c) => c.id === "automation")?.nodes ?? [];
const labelOf = (key: AutomationKey) => NODES[AUTOMATION_POSITIONS[key] - 1]?.label ?? key;

/**
 * What this switch is doing *right now*, at the level actually bought — the tree already prints the
 * generic "so much less per level" version, and repeating it here would say nothing about the run.
 */
function detailOf(game: GameStore, key: AutomationKey): string {
  switch (key) {
    case "advance":
      return `Enchaîne sur l'arc suivant ${seconds(game.autoAdvanceDelay())} après l'avoir terminé.`;
    case "ability":
      return `Déclenche les capacités prêtes toutes les ${seconds(game.autoAbilityInterval())}.`;
    case "rank":
      return `Monte les passifs confiés à l'intendance — ${game.autoRankCharacterIds().length}/${game.autoRankCapacity()} personnage(s), à désigner dans l'équipe.`;
    case "rematch":
      return `Relance le boss ${seconds(game.autoRematchDelay())} après un échec au chrono.`;
    case "crossover":
      return "Ouvre une fenêtre de crossover dès qu'elle est conseillée, en gardant sa réserve de cristaux.";
  }
}

/**
 * One switch per automation *bought* — an off switch for something you don't have is noise, the
 * same rule the autoclicker's toggle follows. Each is a real choice rather than a downgrade:
 * "Relève" would drag the player out of the cleared arc they came back to farm the common of.
 */
export default function AutomationBar(props: { game: GameStore }) {
  const owned = () => AUTOMATION_KEYS.filter((key) => props.game.automationLevelOf(key) > 0);

  return (
    <Show when={owned().length > 0}>
      <div class="auto-strip">
        <span class="auto-strip-head muted">
          <IconGear /> Automatisation
        </span>
        <For each={owned()}>
          {(key) => {
            const on = () => props.game.automationEnabled(key);
            return (
              <button
                class="auto-toggle"
                classList={{ on: on() }}
                aria-pressed={on()}
                title={`${detailOf(props.game, key)} ${on() ? "Cliquez pour la couper." : "Coupée — cliquez pour la relancer."}`}
                onClick={() => props.game.setAutomationEnabled(key, !on())}
              >
                {labelOf(key)}
              </button>
            );
          }}
        </For>
      </div>
    </Show>
  );
}
