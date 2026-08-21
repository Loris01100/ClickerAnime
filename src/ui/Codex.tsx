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
export default function Codex(props: { game: GameStore; onClose: () => void }) {
  const [selectedId, setSelectedId] = createSignal(props.game.data.characters[0]?.id ?? "");

  const selected = createMemo(() => props.game.data.characters.find((c) => c.id === selectedId()));
  const owned = (character: Character) => props.game.ownedCharacterIds().includes(character.id);

  const animeName = (animeId: string) => props.game.data.animes.find((a) => a.id === animeId)?.name ?? animeId;
  const arcNames = (character: Character) =>
    character.arcIds.map((id) => props.game.data.arcs.find((a) => a.id === id)?.name ?? id);
  const combosOf = (character: Character) =>
    props.game.data.combos.filter((combo) => combo.requiredCharacterIds.includes(character.id));

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
                        <Sprite seed={character.id} px={3} dim={!owned(character)} />
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
                  <Sprite seed={character().id} px={10} dim={!owned(character())} />
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
                      const atCap = () => ({ ...passive(), value: passive().value * levelGrowth(cap()) });
                      const current = () => ({
                        ...passive(),
                        value: passive().value * levelGrowth(props.game.passiveLevelOf(character())),
                      });
                      return (
                        <>
                          <div class="codex-row">
                            <span class="muted">Niveau 0</span>
                            <strong>{describeModifier(passive())}</strong>
                          </div>
                          <div class="codex-row">
                            <span class="muted">Au maximum (niv. {cap()})</span>
                            <strong>{describeModifier(atCap())}</strong>
                          </div>
                          <Show when={owned(character())}>
                            <div class="codex-row">
                              <span class="muted">Actuel (niv. {props.game.passiveLevelOf(character())})</span>
                              <strong>{describeModifier(current())}</strong>
                            </div>
                          </Show>
                          <p class="muted small">
                            Le passif cesse de progresser au niveau {cap()}. Les niveaux suivants continuent
                            d'ajouter des dégâts.
                          </p>
                        </>
                      );
                    }}
                  </Show>
                </div>

                <Show when={character().ability}>
                  {(ability) => (
                    <div class="codex-block">
                      <h4>Capacité — {ability().name}</h4>
                      <p class="small">{describeAbility(ability())}</p>
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
