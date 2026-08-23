import { createSignal, Show } from "solid-js";
import type { GameStore } from "../engine/gameState";
import PanelTitle from "./PanelTitle";
import { fmt } from "./format";
import { IconBookmark, IconGlobe } from "./icons";

/** The row of running totals at the top of the middle column. */
export default function CurrencyBar(props: { game: GameStore }) {
  const [open, setOpen] = createSignal(true);
  return (
    <section class="panel">
      <header class="panel-head">
        <PanelTitle open={open()} onToggle={() => setOpen(!open())}>
          Ressources
        </PanelTitle>
      </header>
      <Show when={open()}>
      <div class="currency-row">
        <div class="currency">
          <span class="coin gold">◆</span>
          <strong>{fmt(props.game.currency())}</strong>
        </div>
        <div class="currency">
          <span class="coin violet">✦</span>
          <strong>{props.game.prestige().prestigePoints}</strong>
        </div>
        <div class="currency">
          <span class="coin blue"><IconBookmark /></span>
          <strong>{props.game.foundItems().length}</strong>
        </div>
        <div class="currency">
          <span class="coin green"><IconGlobe /></span>
          <strong>{props.game.clearedAnimes().length}</strong>
        </div>
      </div>
      </Show>
    </section>
  );
}
