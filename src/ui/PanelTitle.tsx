import type { JSX } from "solid-js";
import { IconChevron } from "./icons";

/** Clickable panel-head title that folds/unfolds the section below it. */
export default function PanelTitle(props: { open: boolean; onToggle: () => void; children: JSX.Element }) {
  return (
    <button class="panel-title" onClick={props.onToggle}>
      <IconChevron class={props.open ? "" : "collapsed"} />
      <span>{props.children}</span>
    </button>
  );
}
