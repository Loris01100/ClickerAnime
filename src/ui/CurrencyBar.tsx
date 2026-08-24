import { createSignal, Show } from "solid-js";
import type { GameStore } from "../engine/gameState";
import PanelTitle from "./PanelTitle";
import { fmt } from "./format";
import { IconCrystal, IconDiamond, IconPack, IconSparkle } from "./icons";

/**
 * The row of running totals at the top of the middle column. Each total is a shortcut to where that
 * resource is spent — every destination is an overlay App owns.
 */
export default function CurrencyBar(props: {
  game: GameStore;
  onOpenShop: () => void;
  onOpenPrestige: () => void;
  onOpenCrossover: () => void;
  onOpenPacks: () => void;
}) {
  const [open, setOpen] = createSignal(true);
  /** Pack points are per world, so the fourth tile always shows the world being fought in. */
  const currentAnime = () => props.game.data.animes.find((a) => a.id === props.game.activeArc()?.animeId);
  return (
    <section class="panel">
      <header class="panel-head">
        <PanelTitle open={open()} onToggle={() => setOpen(!open())}>
          Ressources
        </PanelTitle>
      </header>
      <Show when={open()}>
      <div class="currency-row">
        <button class="currency" title="Dépenser à la boutique" onClick={props.onOpenShop}>
          <span class="coin gold"><IconDiamond /></span>
          <strong>{fmt(props.game.currency())}</strong>
        </button>
        <button class="currency" title="Dépenser dans l'arbre de prestige" onClick={props.onOpenPrestige}>
          <span class="coin violet"><IconSparkle /></span>
          <strong>{props.game.prestige().prestigePoints}</strong>
        </button>
        <button
          class="currency"
          classList={{ active: props.game.crossoverActive() }}
          title="Cristaux de crossover : annuler le malus de synergie"
          onClick={props.onOpenCrossover}
        >
          <span class="coin blue"><IconCrystal /></span>
          <strong>{props.game.crossoverCrystals()}</strong>
        </button>
        <button
          class="currency"
          title={`Points de pack — ${currentAnime()?.name ?? "aucun monde"}`}
          onClick={props.onOpenPacks}
        >
          <span class="coin green"><IconPack /></span>
          <strong>{fmt(props.game.worldPointsOf(currentAnime()?.id ?? ""))}</strong>
        </button>
      </div>
      </Show>
    </section>
  );
}
