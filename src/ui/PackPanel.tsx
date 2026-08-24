import { For, Show, createSignal, onCleanup, onMount } from "solid-js";
import type { GameStore } from "../engine/gameState";
import type { Character } from "../engine/types";
import { PACK_COST, DUPLICATE_DAMAGE_STEP } from "../engine/packs";
import Sprite from "./Sprite";
import { themeOf } from "./hue";
import { IconPack } from "./icons";

/**
 * Packs, an overlay like the shop: one bucket of points per world, spent on a random draw from
 * that world's cast. A duplicate is the only way to get a character again — beating their arc a
 * second time never gives one — and every copy makes them hit harder, with no cap.
 */
export default function PackPanel(props: { game: GameStore; onClose: () => void }) {
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") props.onClose();
  }
  onMount(() => document.addEventListener("keydown", onKeyDown));
  onCleanup(() => document.removeEventListener("keydown", onKeyDown));

  const [drawn, setDrawn] = createSignal<Character | null>(null);

  const animeNameOf = (animeId: string) => props.game.data.animes.find((a) => a.id === animeId)?.name ?? animeId;

  /** Worlds worth showing: one currently travelled to, or one still holding points from a past run. */
  const worlds = () =>
    props.game.data.animes.filter(
      (a) => props.game.worldPointsOf(a.id) > 0 || props.game.prestige().unlockedAnimeIds.includes(a.id)
    );

  const duplicates = () =>
    props.game.data.characters
      .filter((c) => props.game.duplicatesOf(c.id) > 0)
      .sort((a, b) => props.game.duplicatesOf(b.id) - props.game.duplicatesOf(a.id));

  function buy(animeId: string, rarity: "main" | "secondary") {
    const character = props.game.openPack(animeId, rarity);
    if (character) setDrawn(character);
  }

  return (
    <div class="overlay" onClick={props.onClose}>
      <div class="modal" role="dialog" aria-modal="true" aria-label="Packs" onClick={(e) => e.stopPropagation()}>
        <header class="panel-head">
          <span>
            <IconPack /> Packs
          </span>
          <button onClick={props.onClose} aria-label="Fermer">
            ✕
          </button>
        </header>

        <div class="codex-detail scroll">
          <p class="muted small pad">
            Un point par combat gagné, dans le monde où il a été gagné. Chaque doublon ajoute{" "}
            {Math.round(DUPLICATE_DAMAGE_STEP * 100)}% des dégâts de base du personnage — clic et DPS, sans limite.
          </p>

          <Show when={drawn()}>
            {(character) => (
              <div class="pack-result" style={{ "--world-hue": themeOf(props.game.data.animes.find((a) => a.id === character().animeId)) }}>
                <Sprite name={character().name} kind="character" anime={animeNameOf(character().animeId)} px={9} />
                <div>
                  <strong>{character().name}</strong>
                  <div class="muted small">
                    x{props.game.duplicatesOf(character().id)} — {animeNameOf(character().animeId)}
                  </div>
                </div>
              </div>
            )}
          </Show>

          <For each={worlds()}>
            {(anime) => (
              <div class="row">
                <span class="name">{anime.name}</span>
                <span class="muted small">
                  {props.game.worldPointsOf(anime.id)} <IconPack />
                </span>
                <For each={["main", "secondary"] as const}>
                  {(rarity) => (
                    <Show when={props.game.packPoolOf(anime.id, rarity).length > 0}>
                      <button
                        disabled={props.game.worldPointsOf(anime.id) < PACK_COST[rarity]}
                        onClick={() => buy(anime.id, rarity)}
                      >
                        {rarity === "main" ? "Principaux" : "Secondaires"} — {PACK_COST[rarity]}
                      </button>
                    </Show>
                  )}
                </For>
              </div>
            )}
          </For>

          <Show when={worlds().length === 0}>
            <p class="muted pad">Aucun monde visité pour l'instant.</p>
          </Show>

          <Show when={duplicates().length > 0}>
            <header class="panel-head">
              <span>Doublons</span>
              <span class="muted small">{duplicates().length}</span>
            </header>
            <For each={duplicates()}>
              {(character) => (
                <div class="row">
                  <span class="name">
                    <Sprite name={character.name} kind="character" anime={animeNameOf(character.animeId)} px={5} />
                    {character.name}
                  </span>
                  <span class="muted small">
                    x{props.game.duplicatesOf(character.id)} — +
                    {Math.round(props.game.duplicatesOf(character.id) * DUPLICATE_DAMAGE_STEP * 100)}% dégâts
                  </span>
                </div>
              )}
            </For>
          </Show>
        </div>
      </div>
    </div>
  );
}
