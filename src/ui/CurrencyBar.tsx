import { createSignal, Show } from "solid-js";
import type { GameStore } from "../engine/gameState";
import PanelTitle from "./PanelTitle";
import { asset } from "./asset";
import { fmt } from "./format";

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
          <img class="coin" src={asset("/resources/currency-gold.png")} alt="" />
          <strong>{fmt(props.game.currency())}</strong>
        </button>
        <button class="currency" title="Dépenser dans l'arbre de prestige" onClick={props.onOpenPrestige}>
          <img class="coin" src={asset("/resources/prestige.png")} alt="" />
          <strong>{props.game.prestige().prestigePoints}</strong>
        </button>
        {/*
          `advised` is the nudge the crystals never had: they only pay while the team is fighting
          somewhere it suffers the steep other-anime malus — coming back to farm an old world's
          common, typically — and nothing used to say so, so the stock just sat there.
        */}
        <button
          class="currency"
          classList={{ active: props.game.crossoverActive(), advised: props.game.crossoverAdvised() }}
          title={
            props.game.crossoverAdvised()
              ? "Vos personnages sont hors de leur monde : un crossover les remettrait à pleine puissance"
              : "Cristaux de crossover : annuler le malus de synergie"
          }
          onClick={props.onOpenCrossover}
        >
          <img class="coin" src={asset("/resources/crossover-crystal.png")} alt="" />
          <strong>{props.game.crossoverCrystals()}</strong>
        </button>
        <button
          class="currency"
          title={`Points de pack — ${currentAnime()?.name ?? "aucun monde"}`}
          onClick={props.onOpenPacks}
        >
          <img class="coin" src={asset("/resources/pack-points.png")} alt="" />
          <strong>{fmt(props.game.worldPointsOf(currentAnime()?.id ?? ""))}</strong>
        </button>
      </div>
      </Show>
    </section>
  );
}
