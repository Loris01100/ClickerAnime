import { createSignal, Show } from "solid-js";
import type { GameStore } from "../engine/gameState";
import PanelTitle from "./PanelTitle";
import { fmt } from "./format";
import { IconBookmark, IconDiamond, IconGlobe, IconSparkle } from "./icons";

/** Scrolls to the panel where a resource is spent — no-op if it isn't rendered right now. */
function goTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
}

/**
 * The row of running totals at the top of the middle column. Each total is a shortcut to where that
 * resource is used: the shop and the item table are panels on this page, prestige points and worlds
 * are overlays App owns.
 */
export default function CurrencyBar(props: {
  game: GameStore;
  onOpenPrestige: () => void;
  onOpenWorlds: () => void;
}) {
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
        <button class="currency" title="Dépenser à la boutique" onClick={() => goTo("panel-shop")}>
          <span class="coin gold"><IconDiamond /></span>
          <strong>{fmt(props.game.currency())}</strong>
        </button>
        <button class="currency" title="Dépenser dans l'arbre de prestige" onClick={props.onOpenPrestige}>
          <span class="coin violet"><IconSparkle /></span>
          <strong>{props.game.prestige().prestigePoints}</strong>
        </button>
        <button class="currency" title="Objets : passifs et équipement" onClick={() => goTo("panel-items")}>
          <span class="coin blue"><IconBookmark /></span>
          <strong>{props.game.foundItems().length}</strong>
        </button>
        <button class="currency" title="Mondes terminés" onClick={props.onOpenWorlds}>
          <span class="coin green"><IconGlobe /></span>
          <strong>{props.game.clearedAnimes().length}</strong>
        </button>
      </div>
      </Show>
    </section>
  );
}
