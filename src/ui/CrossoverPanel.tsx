import { For, Show, onCleanup, onMount } from "solid-js";
import type { GameStore } from "../engine/gameState";
import {
  CROSSOVER_BOSS_REWARD,
  CROSSOVER_COST,
  CROSSOVER_DURATION_MS,
  CROSSOVER_MOB_CHANCE,
  PORTAL_TRAIT,
} from "../engine/crossover";
import { fmt } from "./format";
import Coin from "./Coin";

/**
 * Cristaux de crossover: the inter-anime resource. Shows the stock, which worlds the team spans
 * (they only drop while it spans two), and buys the window where nobody suffers the synergy malus.
 */
export default function CrossoverPanel(props: { game: GameStore; onClose: () => void }) {
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") props.onClose();
  }
  onMount(() => document.addEventListener("keydown", onKeyDown));
  onCleanup(() => document.removeEventListener("keydown", onKeyDown));

  /** One entry per world the team draws from — two or more is what makes crystals drop. */
  const worlds = () => {
    const counts = new Map<string, number>();
    for (const character of props.game.ownedCharacters()) {
      counts.set(character.animeId, (counts.get(character.animeId) ?? 0) + 1);
    }
    return [...counts].map(([animeId, count]) => ({
      name: props.game.animeOf(animeId)?.name ?? animeId,
      count,
    }));
  };

  const seconds = () => Math.ceil(props.game.crossoverRemaining() / 1000);

  /** Portals first: they are what the stock is really for, and the window is the small spend. */
  const portals = () => props.game.portalTargets();

  return (
    <div class="overlay" onClick={props.onClose}>
      <div class="modal" role="dialog" aria-modal="true" aria-label="Crossover" onClick={(e) => e.stopPropagation()}>
        <header class="panel-head">
          <span>
            <Coin kind="crystal" /> Cristaux de crossover
          </span>
          <button onClick={props.onClose} aria-label="Fermer">
            ✕
          </button>
        </header>

        <div class="codex-detail scroll">
          <div class="codex-block">
            <div class="codex-row">
              <span class="muted">En réserve</span>
              <strong>
                {props.game.crossoverCrystals()} <Coin kind="crystal" />
              </strong>
            </div>
            <p class="muted small">
              Les cristaux ne tombent que si l'équipe vient d'au moins deux mondes : {Math.round(CROSSOVER_MOB_CHANCE * 100)}%
              par mob, {CROSSOVER_BOSS_REWARD} à la première victoire sur un boss. Un boss déjà vaincu n'en donne plus.
            </p>
          </div>

          <div class="codex-block">
            <h4>Équipe</h4>
            <For each={worlds()}>
              {(world) => (
                <div class="codex-row">
                  <span class="muted">{world.name}</span>
                  <strong>{world.count}</strong>
                </div>
              )}
            </For>
            <Show when={!props.game.teamIsMixed()}>
              <p class="muted small">
                Équipe mono-monde : aucun cristal ne tombe. Recrutez dans un autre anime pour relancer la source.
              </p>
            </Show>
          </div>

          <div class="codex-block">
            <h4>Portails</h4>
            <p class="muted small">
              Un boss ne rejoint jamais l'équipe en tombant dans son arc : il faut rouvrir le combat avec des
              cristaux, une fois l'arc terminé, et le vaincre une seconde fois. {PORTAL_TRAIT.description} Les
              dégâts infligés sont conservés d'une visite à l'autre.
            </p>
            <Show
              when={portals().length > 0}
              fallback={
                <p class="muted small">
                  Aucun portail en vue : terminez un arc dont le boss garde un personnage pour en ouvrir un.
                </p>
              }
            >
              <ul class="portal-list">
                <For each={portals()}>
                  {(target) => (
                    <li classList={{ open: target.open, active: target.active }}>
                      <div class="portal-line">
                        <strong>{target.character.name}</strong>
                        <span class="muted small">{target.arc.name}</span>
                        <Show
                          when={target.open}
                          fallback={
                            <button
                              class="primary"
                              disabled={!target.affordable}
                              onClick={() => props.game.openPortal(target.character.id)}
                            >
                              Ouvrir ({target.cost} <Coin kind="crystal" />)
                            </button>
                          }
                        >
                          <Show
                            when={!target.active}
                            fallback={<span class="good small">Combat en cours</span>}
                          >
                            <button class="primary" onClick={() => props.game.enterPortal(target.character.id)}>
                              Entrer
                            </button>
                          </Show>
                        </Show>
                      </div>
                      <Show when={target.open}>
                        <div class="bar hp-bar boss">
                          <div
                            class="bar-fill"
                            style={{
                              width: `${Math.max(0, 1 - target.damage / (target.maxHp || 1)) * 100}%`,
                            }}
                          />
                          <span class="bar-label">
                            {fmt(Math.max(0, target.maxHp - target.damage))} / {fmt(target.maxHp)} PV
                          </span>
                        </div>
                      </Show>
                    </li>
                  )}
                </For>
              </ul>
            </Show>
          </div>

          <div class="codex-block">
            <h4>Fusion des mondes</h4>
            <p class="muted small">
              Pendant {CROSSOVER_DURATION_MS / 1000}s, tous les personnages frappent à pleine puissance quel que soit
              l'arc : le malus de synergie est annulé. Les passifs, eux, restent liés à leur propre anime.
            </p>
            <Show
              when={!props.game.crossoverActive()}
              fallback={<p class="good">Crossover actif — {seconds()}s restantes.</p>}
            >
              <button
                class="primary"
                disabled={props.game.crossoverCrystals() < CROSSOVER_COST}
                onClick={() => props.game.activateCrossover()}
              >
                Activer ({CROSSOVER_COST} <Coin kind="crystal" />)
              </button>
            </Show>
          </div>
        </div>
      </div>
    </div>
  );
}
