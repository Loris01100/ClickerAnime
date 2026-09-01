import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import forgeBackground from "../assets/forge-background.webp";
import type { GameStore } from "../engine/gameState";
import ItemIcon from "./ItemIcon";

/** Full forge view: the small ProgressPanel entry stays compact while upgrades remain readable. */
export default function ForgePanel(props: { game: GameStore; onClose: () => void }) {
  const [selectedItemId, setSelectedItemId] = createSignal<string>();
  const [pickerOpen, setPickerOpen] = createSignal(false);
  const selectedItem = createMemo(() => props.game.forgeableUniques().find((item) => item.id === selectedItemId()));
  /** La même pastille que pour un passif prêt à monter : ce niveau-là est payable tout de suite. */
  const forgeable = (itemId: string) => props.game.forgeableNowIds().has(itemId);
  /** Un autre unique prêt à forger : la pastille vit alors sur le bouton qui rouvre la liste. */
  const otherForgeable = createMemo(() => [...props.game.forgeableNowIds()].some((id) => id !== selectedItemId()));

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") props.onClose();
  }
  onMount(() => document.addEventListener("keydown", onKeyDown));
  onCleanup(() => document.removeEventListener("keydown", onKeyDown));

  return (
    <div class="overlay" onClick={props.onClose}>
      <div class="modal forge-modal" role="dialog" aria-modal="true" aria-label="Forge" onClick={(event) => event.stopPropagation()}>
        <header class="panel-head">
          <span>Forge</span>
          <button onClick={props.onClose} aria-label="Fermer">✕</button>
        </header>
        <div class="forge-scene" style={{ "background-image": `url("${forgeBackground}")` }}>
          <p class="forge-intro">Assemblez les fragments gagnés sur le boss pour renforcer son objet unique.</p>
          <div class="forge-workbench">
            <Show
              when={selectedItem()}
              keyed
              fallback={
                <div class="forge-process">
                  <button
                    class="forge-slot forge-slot-button empty"
                    type="button"
                    aria-expanded={pickerOpen()}
                    onClick={() => setPickerOpen((open) => !open)}
                  >
                    <span class="forge-slot-label">Fragments</span>
                    <strong class="forge-empty-mark">Case vide</strong>
                    <small>
                      Cliquer pour choisir un objet
                      <Show when={otherForgeable()}>
                        <span class="notice-dot" aria-label="Un objet peut être forgé" role="img" />
                      </Show>
                    </small>
                  </button>

                  <div class="forge-action">
                    <span class="forge-action-line" aria-hidden="true" />
                    <button class="primary" disabled>Choisir un objet</button>
                  </div>

                  <section class="forge-slot empty">
                    <span class="forge-slot-label">Résultat</span>
                    <strong class="forge-empty-mark">Case vide</strong>
                    <small>L'objet forgé apparaîtra ici</small>
                  </section>
                </div>
              }
            >
              {(item) => {
                const level = () => props.game.uniqueUpgradeLevelOf(item.id);
                const cost = () => props.game.uniqueUpgradeCostOf(item.id);
                const fragments = () => props.game.uniqueFragmentsOf(item.id);
                const canForge = () => cost() !== null && fragments() >= (cost() ?? 0);
                return (
                  <>
                    <div class="forge-selection-head">
                      <strong>{item.name}</strong>
                      <span>Niveau {level()}/5 · puissance {Math.round(props.game.uniqueUpgradeMultiplierOf(item.id) * 100)} %</span>
                      <button type="button" onClick={() => setPickerOpen(true)}>
                        Changer
                        <Show when={otherForgeable()}>
                          <span class="notice-dot" aria-label="Un autre objet peut être forgé" role="img" />
                        </Show>
                      </button>
                    </div>
                    <div class="forge-process">
                      <button
                        class={`forge-slot forge-slot-button forge-slot-fragments${canForge() ? " ready" : ""}`}
                        type="button"
                        aria-expanded={pickerOpen()}
                        onClick={() => setPickerOpen(true)}
                      >
                        <span class="forge-slot-label">Fragments</span>
                        <div class="forge-fragment-art">
                          <ItemIcon id={item.id} kind="unique" px={58} />
                          <strong>{fragments()}</strong>
                        </div>
                        <Show when={cost() !== null} fallback={<small>Plus aucun fragment requis</small>}>
                          <b>{fragments()} / {cost()}</b>
                          <small>Fragments de {item.name}</small>
                        </Show>
                      </button>

                      <div class="forge-action">
                        <span class="forge-action-line" aria-hidden="true" />
                        <button
                          class="primary"
                          disabled={!canForge()}
                          onClick={() => props.game.upgradeUnique(item.id)}
                        >
                          <Show when={cost() !== null} fallback="Niveau maximum">
                            Forger le niveau {level() + 1}
                          </Show>
                        </button>
                      </div>

                      <button
                        class={`forge-slot forge-slot-button forge-slot-result${canForge() ? " ready" : ""}`}
                        type="button"
                        aria-label={`Changer l'objet sélectionné, actuellement ${item.name}`}
                        aria-expanded={pickerOpen()}
                        onClick={() => setPickerOpen(true)}
                      >
                        <span class="forge-slot-label">Résultat</span>
                        <div class="forge-result-art"><ItemIcon id={item.id} kind="unique" px={64} /></div>
                        <b>{item.name}</b>
                        <small>
                          <Show when={cost() !== null} fallback="Objet entièrement forgé">
                            Objet unique · niveau {level() + 1}
                          </Show>
                        </small>
                      </button>
                    </div>
                  </>
                );
              }}
            </Show>

            <Show when={pickerOpen()}>
              <div class="forge-picker" role="listbox" aria-label="Choisir l'objet à forger">
                <div class="forge-picker-head">
                  <strong>Choisir un objet unique</strong>
                  <button type="button" onClick={() => setPickerOpen(false)} aria-label="Fermer la sélection">✕</button>
                </div>
                <div class="forge-picker-list scroll">
                  <For each={props.game.forgeableUniques()}>
                    {(item) => (
                      <button
                        type="button"
                        class="forge-picker-item"
                        classList={{ selected: item.id === selectedItemId() }}
                        role="option"
                        aria-selected={item.id === selectedItemId()}
                        onClick={() => {
                          setSelectedItemId(item.id);
                          setPickerOpen(false);
                        }}
                      >
                        <ItemIcon id={item.id} kind="unique" px={42} />
                        <span>
                          <strong>{item.name}</strong>
                          <small>{props.game.uniqueFragmentsOf(item.id)} fragment{props.game.uniqueFragmentsOf(item.id) === 1 ? "" : "s"} · niveau {props.game.uniqueUpgradeLevelOf(item.id)}/5</small>
                        </span>
                        <Show when={forgeable(item.id)}>
                          <span class="notice-dot" aria-label="Cet objet peut être forgé" role="img" />
                        </Show>
                      </button>
                    )}
                  </For>
                </div>
              </div>
            </Show>
          </div>
        </div>
      </div>
    </div>
  );
}
