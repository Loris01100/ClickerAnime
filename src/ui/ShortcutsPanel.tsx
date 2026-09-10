import { For, onCleanup, onMount } from "solid-js";
import { SHORTCUT_HELP } from "./shortcuts";
import { IconChevronLeft, IconChevronRight } from "./icons";

/** Une touche dessinée n'a pas de texte : le lecteur d'écran reçoit son nom. */
const ARROW_LABEL: Record<string, string | undefined> = {
  ArrowLeft: "Flèche gauche",
  ArrowRight: "Flèche droite",
};

/**
 * L'aide des raccourcis. Ouverte par « ? » ou par le menu, refermée par Échap ou « ? » à nouveau —
 * la touche qui ouvre un écran d'aide doit aussi le refermer, sinon on la cherche.
 */
export default function ShortcutsPanel(props: { onClose: () => void }) {
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape" || event.key === "?") props.onClose();
  }
  onMount(() => document.addEventListener("keydown", onKeyDown));
  onCleanup(() => document.removeEventListener("keydown", onKeyDown));

  return (
    <div class="overlay" onClick={props.onClose}>
      <div
        class="modal shortcuts-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Raccourcis clavier"
        onClick={(event) => event.stopPropagation()}
      >
        <header class="panel-head">
          <span>Raccourcis clavier</span>
          <button onClick={props.onClose} aria-label="Fermer">Fermer</button>
        </header>
        <div class="shortcuts-body scroll">
          <For each={SHORTCUT_HELP}>
            {(section) => (
              <section class="shortcuts-group">
                <h3>{section.group}</h3>
                <dl>
                  <For each={section.entries}>
                    {(entry) => (
                      <div class="shortcuts-row">
                        <dt>
                          <For each={entry.keys}>
                            {(key) => (
                              <kbd aria-label={ARROW_LABEL[key]}>
                                {key === "ArrowLeft" ? <IconChevronLeft /> : key === "ArrowRight" ? <IconChevronRight /> : key}
                              </kbd>
                            )}
                          </For>
                        </dt>
                        <dd>{entry.label}</dd>
                      </div>
                    )}
                  </For>
                </dl>
              </section>
            )}
          </For>
          <p class="muted shortcuts-note">
            Les raccourcis se taisent quand un écran est ouvert ou qu'un champ a le focus. Le numéro
            d'une capacité est affiché sur son bouton ; une capacité endormie hors de son monde n'en
            prend pas.
          </p>
        </div>
      </div>
    </div>
  );
}
