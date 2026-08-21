import { For, Show } from "solid-js";
import type { GameStore } from "../engine/gameState";
import { fmt, seconds } from "./format";

const xpPercent = (into: number, need: number) => (need > 0 ? Math.min(100, (into / need) * 100) : 0);

/** Left column: activable abilities, the team, and the characters still to beat in this zone. */
export default function RosterPanel(props: { game: GameStore }) {
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
            <p class="muted">Battez des personnages pour débloquer des capacités et des combos.</p>
          </Show>
        </div>
      </section>

      <section class="panel">
        <header class="panel-head">Équipe ({props.game.ownedCharacters().length})</header>
        <ul class="list">
          <For each={props.game.ownedCharacters()}>
            {(character) => {
              const progress = () => props.game.progressOf(character.id);
              const level = () => progress().level;
              const maxed = () => props.game.passiveLevelOf(character) >= props.game.passiveCapOf(character);
              return (
                <li class="member">
                  <div class="member-head">
                    <strong>
                      {character.name} <span class="rarity">{character.rarity === "main" ? "★" : "☆"}</span>
                    </strong>
                    <span
                      class="synergy"
                      classList={{
                        good: props.game.synergyOf(character) > 1,
                        bad: props.game.synergyOf(character) < 1,
                      }}
                    >
                      x{props.game.synergyOf(character).toFixed(2)}
                    </span>
                  </div>
                  <small class="muted">
                    Niv. {level()} · {fmt(character.baseClickPower * (1 + level()))} /clic ·{" "}
                    {fmt(character.baseDps * (1 + level()))} dps
                  </small>
                  <Show when={character.passive}>
                    <small classList={{ muted: !maxed(), capped: maxed() }}>
                      Passif niv. {props.game.passiveLevelOf(character)}/{props.game.passiveCapOf(character)}
                      {maxed() ? " (max)" : ""}
                    </small>
                  </Show>
                  <div class="bar xp-bar">
                    <div
                      class="bar-fill"
                      style={{ width: `${xpPercent(progress().into, progress().need)}%` }}
                    />
                    <span class="bar-label">
                      {fmt(progress().into)} / {fmt(progress().need)} xp
                    </span>
                  </div>
                </li>
              );
            }}
          </For>
          <Show when={props.game.ownedCharacters().length === 0}>
            <li class="muted">Équipe vide — les personnages rejoignent l'équipe quand vous les battez.</li>
          </Show>
        </ul>
      </section>

      <Show when={props.game.foundItems().length > 0}>
        <section class="panel">
          <header class="panel-head">
            <span>Objets</span>
            <small class="muted">+{fmt(props.game.narratorBase())} au clic</small>
          </header>
          <ul class="list">
            <For each={props.game.foundItems()}>
              {(item) => (
                <li class="row">
                  <strong>
                    {item.kind === "unique" ? "🏆" : "🔖"} {item.name}
                    {props.game.countOf(item.id) > 1 ? ` x${props.game.countOf(item.id)}` : ""}
                  </strong>
                  <span class="muted">+{fmt(item.clickBonus * props.game.countOf(item.id))}</span>
                </li>
              )}
            </For>
          </ul>
        </section>
      </Show>

      <Show when={props.game.arcRecruits().length > 0}>
        <section class="panel">
          <header class="panel-head">À battre ici</header>
          <ul class="list">
            <For each={props.game.arcRecruits()}>
              {(character) => (
                <li class="row">
                  <div>
                    <strong>
                      ⭐ {character.name} <span class="rarity">{character.rarity === "main" ? "★" : "☆"}</span>
                    </strong>
                    <small class="muted">
                      {fmt(character.baseClickPower)} /clic · {fmt(character.baseDps)} dps
                    </small>
                  </div>
                </li>
              )}
            </For>
          </ul>
        </section>
      </Show>
    </div>
  );
}
