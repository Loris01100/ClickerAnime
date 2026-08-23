import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import type { GameStore } from "../engine/gameState";
import type { Character } from "../engine/types";
import { levelGrowth, PASSIVE_LEVEL_CAP } from "../engine/growth";
import Sprite from "./Sprite";
import { describeAbility, describeModifier } from "./describe";
import { fmt } from "./format";

const RARITY_LABEL: Record<Character["rarity"], string> = {
  main: "Personnage principal",
  secondary: "Personnage secondaire",
};

/** Every character in the game, met or not, with their stats and what their passive actually does. */
export default function Codex(props: { game: GameStore; onClose: () => void; initialSelectedId?: string }) {
  const [selectedId, setSelectedId] = createSignal(props.initialSelectedId ?? props.game.data.characters[0]?.id ?? "");

  const selected = createMemo(() => props.game.data.characters.find((c) => c.id === selectedId()));
  const owned = (character: Character) => props.game.ownedCharacterIds().includes(character.id);

  const animeName = (animeId: string) => props.game.data.animes.find((a) => a.id === animeId)?.name ?? animeId;
  const arcNames = (character: Character) =>
    character.arcIds.map((id) => props.game.data.arcs.find((a) => a.id === id)?.name ?? id);
  const combosOf = (character: Character) =>
    props.game.data.combos.filter((combo) => combo.requiredCharacterIds.includes(character.id));

  /** The ability currently in effect: the evolved one once grown into, the base one otherwise. */
  const abilityOf = (character: Character) =>
    (props.game.isEvolved(character) && character.evolution?.ability) || character.ability;

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") props.onClose();
  }
  onMount(() => document.addEventListener("keydown", onKeyDown));
  onCleanup(() => document.removeEventListener("keydown", onKeyDown));

  return (
    <div class="overlay" onClick={props.onClose}>
      <div class="modal" role="dialog" aria-modal="true" aria-label="Codex" onClick={(e) => e.stopPropagation()}>
        <header class="panel-head">
          <span>
            Codex — {props.game.ownedCharacterIds().length} / {props.game.data.characters.length} rencontrés
          </span>
          <button onClick={props.onClose} aria-label="Fermer">
            ✕
          </button>
        </header>

        <div class="codex">
          <div class="codex-list scroll">
            <For each={props.game.data.animes}>
              {(anime) => (
                <>
                  <div class="codex-group">{anime.name}</div>
                  <For each={props.game.data.characters.filter((c) => c.animeId === anime.id)}>
                    {(character) => (
                      <button
                        class="codex-entry"
                        classList={{ active: character.id === selectedId(), unmet: !owned(character) }}
                        onClick={() => setSelectedId(character.id)}
                      >
                        <Sprite
                          name={character.name}
                          kind="character"
                          anime={animeName(character.animeId)}
                          px={3}
                          dim={!owned(character)}
                        />
                        <span class="name">{character.name}</span>
                        <span class="rarity">{character.rarity === "main" ? "★" : "☆"}</span>
                      </button>
                    )}
                  </For>
                </>
              )}
            </For>
          </div>

          <Show when={selected()}>
            {(character) => (
              <div class="codex-detail scroll">
                <div class="codex-hero">
                  <Sprite
                    name={character().name}
                    kind="character"
                    anime={animeName(character().animeId)}
                    px={10}
                    dim={!owned(character())}
                  />
                  <div>
                    <h3>{character().name}</h3>
                    <p class="muted small">
                      {RARITY_LABEL[character().rarity]} · {animeName(character().animeId)}
                    </p>
                    <p class="small" classList={{ muted: !owned(character()) }}>
                      {owned(character())
                        ? `Dans l'équipe · niveau ${props.game.levelOf(character().id)}`
                        : "Pas encore rencontré"}
                    </p>
                  </div>
                </div>

                <div class="codex-block">
                  <h4>Statistiques</h4>
                  <div class="codex-row">
                    <span class="muted">Clic (niveau 0)</span>
                    <strong>{fmt(character().baseClickPower)}</strong>
                  </div>
                  <div class="codex-row">
                    <span class="muted">DPS (niveau 0)</span>
                    <strong>{fmt(character().baseDps)}</strong>
                  </div>
                  <div class="codex-row">
                    <span class="muted">Gain par niveau</span>
                    <strong>
                      +{fmt(character().baseClickPower)} clic / +{fmt(character().baseDps)} dps
                    </strong>
                  </div>
                  <Show when={owned(character())}>
                    <div class="codex-row">
                      <span class="muted">Actuel</span>
                      <strong>
                        {fmt(character().baseClickPower * levelGrowth(props.game.levelOf(character().id)))} clic /{" "}
                        {fmt(character().baseDps * levelGrowth(props.game.levelOf(character().id)))} dps
                      </strong>
                    </div>
                  </Show>
                </div>

                <div class="codex-block">
                  <h4>Passif</h4>
                  <Show when={character().passive} fallback={<p class="muted small">Aucun passif.</p>}>
                    {(passive) => {
                      const cap = () => PASSIVE_LEVEL_CAP[character().rarity];
                      const atCap = () => ({ ...passive(), value: passive().value * levelGrowth(cap() - 1) });
                      const rank = () => props.game.passiveRankOf(character());
                      const current = () => ({
                        ...passive(),
                        value: passive().value * levelGrowth(rank() - 1),
                      });
                      return (
                        <>
                          <div class="codex-row">
                            <span class="muted">Rang 1</span>
                            <strong>{describeModifier(passive())}</strong>
                          </div>
                          <div class="codex-row">
                            <span class="muted">Au maximum (rang {cap()})</span>
                            <strong>{describeModifier(atCap())}</strong>
                          </div>
                          <Show when={owned(character())}>
                            <div class="codex-row">
                              <span class="muted">Actuel (rang {rank()})</span>
                              <strong>{rank() > 0 ? describeModifier(current()) : "verrouillé"}</strong>
                            </div>
                          </Show>
                          <p class="muted small">
                            Le passif se monte en dépensant « {props.game.passiveItemOf(character())?.name ?? "—"} »,
                            l'objet commun de son arc d'origine, et s'arrête au rang {cap()}. Les niveaux, eux,
                            n'ajoutent que des dégâts.
                          </p>
                        </>
                      );
                    }}
                  </Show>
                </div>

                <Show when={abilityOf(character())}>
                  {(ability) => (
                    <div class="codex-block">
                      <h4>Capacité — {ability().name}</h4>
                      <p class="small">{describeAbility(ability())}</p>
                      <Show when={props.game.isEvolved(character()) && character().evolution?.ability}>
                        <p class="muted small">Version évoluée ({character().evolution?.label}).</p>
                      </Show>
                    </div>
                  )}
                </Show>

                <Show when={character().evolution}>
                  {(evolution) => (
                    <div class="codex-block">
                      <h4>Évolution — {evolution().label}</h4>
                      <p class="muted small">
                        Se déclenche en combattant dans {animeName(evolution().animeId)} une fois ce
                        personnage recruté, et reste acquise pour le reste de la partie.
                      </p>
                      <For each={evolution().bonus}>
                        {(bonus) => (
                          <div class="codex-row">
                            <span class="muted">Bonus</span>
                            <strong>{describeModifier(bonus)}</strong>
                          </div>
                        )}
                      </For>
                      <Show when={owned(character())}>
                        <p class="small" classList={{ muted: !props.game.isEvolved(character()) }}>
                          {props.game.isEvolved(character()) ? "Évolution acquise." : "Pas encore déclenchée."}
                        </p>
                      </Show>
                    </div>
                  )}
                </Show>

                <Show when={combosOf(character()).length > 0}>
                  <div class="codex-block">
                    <h4>Combos</h4>
                    <For each={combosOf(character())}>
                      {(combo) => (
                        <div class="codex-combo">
                          <strong class="small">{combo.name}</strong>
                          <p class="muted small">
                            Avec{" "}
                            {combo.requiredCharacterIds
                              .filter((id) => id !== character().id)
                              .map((id) => props.game.data.characters.find((c) => c.id === id)?.name ?? id)
                              .join(", ")}
                          </p>
                          <p class="small">{describeAbility(combo.ability)}</p>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>

                <div class="codex-block">
                  <h4>Synergie</h4>
                  <p class="muted small">
                    Fort dans : {arcNames(character()).join(", ") || "aucun arc"}. Ailleurs dans{" "}
                    {animeName(character().animeId)} ses stats tombent à 85 %, et dans un autre anime à 50 %.
                  </p>
                </div>
              </div>
            )}
          </Show>
        </div>
      </div>
    </div>
  );
}
