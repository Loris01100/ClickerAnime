import { For, Show } from "solid-js";
import type { GameStore } from "../engine/gameState";
import { fmt, seconds } from "./format";

/** Left column: activable abilities on top (like a battle-item bar), roster and recruiting below. */
export default function RosterPanel(props: { game: GameStore }) {
  const recruitable = () => props.game.availableCharacters().filter((c) => !props.game.ownedCharacterIds().includes(c.id));

  return (
    <div class="column">
      <section class="panel">
        <header class="panel-head">Capacités</header>
        <div class="ability-bar">
          <For each={props.game.unlockedAbilities()}>
            {(unlocked) => {
              const remaining = () => props.game.abilityCooldownRemaining(unlocked.ability.id);
              return (
                <button
                  class="ability"
                  disabled={remaining() > 0}
                  title={`${unlocked.ability.name} — ${seconds(unlocked.ability.durationMs)} d'effet`}
                  onClick={() => props.game.activateAbility(unlocked.ability.id)}
                >
                  <span class="ability-name">{unlocked.ability.name}</span>
                  <span class="ability-cd">{remaining() > 0 ? seconds(remaining()) : "Prêt"}</span>
                </button>
              );
            }}
          </For>
          <Show when={props.game.unlockedAbilities().length === 0}>
            <p class="muted">Recrutez des personnages pour débloquer des capacités et des combos.</p>
          </Show>
        </div>
      </section>

      <section class="panel">
        <header class="panel-head">Équipe ({props.game.ownedCharacters().length})</header>
        <ul class="list">
          <For each={props.game.ownedCharacters()}>
            {(character) => (
              <li class="row">
                <div>
                  <strong>{character.name}</strong>
                  <small class="muted">
                    {fmt(character.baseClickPower)} /clic · {fmt(character.basePassiveIncome)} /s
                  </small>
                </div>
                <span class="synergy" classList={{ good: props.game.synergyOf(character) > 1, bad: props.game.synergyOf(character) < 1 }}>
                  x{props.game.synergyOf(character).toFixed(2)}
                </span>
              </li>
            )}
          </For>
          <Show when={props.game.ownedCharacters().length === 0}>
            <li class="muted">Équipe vide.</li>
          </Show>
        </ul>
      </section>

      <section class="panel">
        <header class="panel-head">Recrutement</header>
        <ul class="list">
          <For each={recruitable()}>
            {(character) => {
              const cost = () => props.game.costOf(character);
              return (
                <li class="row">
                  <div>
                    <strong>{character.name}</strong>
                    <small class="muted">
                      {fmt(character.baseClickPower)} /clic · {fmt(character.basePassiveIncome)} /s
                      {character.ability ? " · capacité" : ""}
                    </small>
                  </div>
                  <button disabled={props.game.currency() < cost()} onClick={() => props.game.recruitCharacter(character.id)}>
                    {fmt(cost())}
                  </button>
                </li>
              );
            }}
          </For>
          <Show when={recruitable().length === 0}>
            <li class="muted">Tous les personnages disponibles sont recrutés.</li>
          </Show>
        </ul>
      </section>
    </div>
  );
}
