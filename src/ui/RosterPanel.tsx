import { For, Show, createMemo, createSignal } from "solid-js";
import type { GameStore } from "../engine/gameState";
import type { Character } from "../engine/types";
import { fmt, seconds } from "./format";

type SortKey = "level" | "click" | "dps" | "synergy";

const SORTS: Record<SortKey, { label: string; value: (game: GameStore, c: Character) => number }> = {
  level: { label: "Niveau", value: (game, c) => game.levelOf(c.id) },
  click: { label: "Clic", value: (game, c) => c.baseClickPower * (1 + game.levelOf(c.id)) },
  dps: { label: "DPS", value: (game, c) => c.baseDps * (1 + game.levelOf(c.id)) },
  synergy: { label: "Synergie", value: (game, c) => game.synergyOf(c) },
};

const pct = (into: number, need: number) => (need > 0 ? Math.min(100, (into / need) * 100) : 0);

/** Left column: abilities, the sortable team list, and the item collection. */
export default function RosterPanel(props: { game: GameStore }) {
  const [sortKey, setSortKey] = createSignal<SortKey>("level");

  const sortedTeam = createMemo(() =>
    [...props.game.ownedCharacters()].sort(
      (a, b) => SORTS[sortKey()].value(props.game, b) - SORTS[sortKey()].value(props.game, a)
    )
  );

  return (
    <div class="column">
      <section class="panel">
        <header class="panel-head">
          <span>Capacités</span>
          <small class="muted">{props.game.unlockedAbilities().length}</small>
        </header>
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
            <p class="muted pad">Battez des personnages pour débloquer des capacités et des combos.</p>
          </Show>
        </div>
      </section>

      <section class="panel">
        <header class="panel-head">
          <span>Équipe ({props.game.ownedCharacters().length})</span>
          <select value={sortKey()} onChange={(e) => setSortKey(e.currentTarget.value as SortKey)}>
            <For each={Object.entries(SORTS)}>{([key, sort]) => <option value={key}>{sort.label}</option>}</For>
          </select>
        </header>

        <div class="table-head member-grid">
          <span>Nom</span>
          <span>Niv.</span>
          <span>Clic</span>
          <span>DPS</span>
          <span>Syn.</span>
        </div>

        <div class="scroll">
          <For each={sortedTeam()}>
            {(character) => {
              const progress = () => props.game.progressOf(character.id);
              const level = () => progress().level;
              const maxed = () => props.game.passiveLevelOf(character) >= props.game.passiveCapOf(character);
              return (
                <div class="member">
                  <div class="member-grid">
                    <span class="name">
                      <span class="avatar">{character.name.slice(0, 2).toUpperCase()}</span>
                      {character.name}
                      <span class="rarity">{character.rarity === "main" ? "★" : "☆"}</span>
                    </span>
                    <span>{level()}</span>
                    <span>{fmt(character.baseClickPower * (1 + level()))}</span>
                    <span>{fmt(character.baseDps * (1 + level()))}</span>
                    <span
                      class="synergy"
                      classList={{
                        good: props.game.synergyOf(character) > 1,
                        bad: props.game.synergyOf(character) < 1,
                      }}
                    >
                      {props.game.synergyOf(character).toFixed(2)}
                    </span>
                  </div>
                  <div class="bar xp-bar" title={`${fmt(progress().into)} / ${fmt(progress().need)} xp`}>
                    <div class="bar-fill" style={{ width: `${pct(progress().into, progress().need)}%` }} />
                  </div>
                  <Show when={character.passive}>
                    <small classList={{ muted: !maxed(), capped: maxed() }}>
                      Passif {props.game.passiveLevelOf(character)}/{props.game.passiveCapOf(character)}
                      {maxed() ? " · max" : ""}
                    </small>
                  </Show>
                </div>
              );
            }}
          </For>
          <Show when={props.game.ownedCharacters().length === 0}>
            <p class="muted pad">Les personnages rejoignent l'équipe quand vous les battez.</p>
          </Show>
        </div>
      </section>

      <Show when={props.game.arcRecruits().length > 0}>
        <section class="panel">
          <header class="panel-head">
            <span>À battre ici</span>
            <small class="muted">{props.game.arcRecruits().length}</small>
          </header>
          <For each={props.game.arcRecruits()}>
            {(character) => (
              <div class="row">
                <span class="name">
                  <span class="avatar">{character.name.slice(0, 2).toUpperCase()}</span>
                  {character.name}
                  <span class="rarity">{character.rarity === "main" ? "★" : "☆"}</span>
                </span>
                <small class="muted">
                  {fmt(character.baseClickPower)} / {fmt(character.baseDps)}
                </small>
              </div>
            )}
          </For>
        </section>
      </Show>

      <section class="panel">
        <header class="panel-head">
          <span>Objets</span>
          <small class="muted">+{fmt(props.game.narratorBase())} au clic</small>
        </header>
        <div class="table-head item-grid">
          <span>Nom</span>
          <span>Type</span>
          <span>Qté</span>
          <span>Bonus</span>
        </div>
        <div class="scroll">
          <For each={props.game.foundItems()}>
            {(item) => (
              <div class="item-grid item-row">
                <span class="name">
                  {item.kind === "unique" ? "🏆" : "🔖"} {item.name}
                </span>
                <span classList={{ unique: item.kind === "unique" }}>
                  {item.kind === "unique" ? "unique" : "commun"}
                </span>
                <span>{props.game.countOf(item.id)}</span>
                <span>+{fmt(item.clickBonus * props.game.countOf(item.id))}</span>
              </div>
            )}
          </For>
          <Show when={props.game.foundItems().length === 0}>
            <p class="muted pad">Aucun objet trouvé. Les mobs lâchent des communs, les boss des uniques.</p>
          </Show>
        </div>
      </section>
    </div>
  );
}
