import { onCleanup, onMount, type JSX } from "solid-js";

/**
 * The backdrop every overlay panel sits on, and the dialog box in the middle of it. Fourteen panels
 * were each carrying their own copy of these three things — the `keydown` listener, the backdrop
 * that closes on a click, the `role="dialog"` wrapper — so they live here once instead.
 *
 * **The backdrop is deliberately not focusable.** A scanner reads a `onClick` on a `div` as an
 * interactive element built without keyboard support, and the usual reflex is to bolt `tabIndex`
 * and `role="button"` onto it. That would be worse, not better: it puts a full-screen tab stop in
 * front of the dialog's own controls and announces nothing. The accessible ways out of a panel are
 * the ones already here — `Escape`, and the « Fermer » button inside every dialog — and the
 * backdrop click is the mouse shortcut on top of them, which is what `role="presentation"` says.
 *
 * Clicking inside the dialog is ignored by comparing the event's target to the backdrop rather than
 * by a `stopPropagation` handler on the box: the box then carries no handler of its own, and no
 * click inside a panel is swallowed before it reaches a listener on `document`.
 */
export default function Overlay(props: {
  /** Names the dialog for a screen reader — `aria-label` on the box. */
  label: string;
  /** Extra class on the modal box, e.g. `forge-modal`. */
  class?: string;
  /** A click on the backdrop. Panels that may refuse to close make that decision here. */
  onClose: () => void;
  /** `Escape`, when it isn't simply `onClose` — the tower leaves the floor first. */
  onEscape?: () => void;
  children: JSX.Element;
}) {
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") (props.onEscape ?? props.onClose)();
  }
  onMount(() => document.addEventListener("keydown", onKeyDown));
  onCleanup(() => document.removeEventListener("keydown", onKeyDown));

  return (
    <div
      class="overlay"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      <div class={props.class ? `modal ${props.class}` : "modal"} role="dialog" aria-modal="true" aria-label={props.label}>
        {props.children}
      </div>
    </div>
  );
}
