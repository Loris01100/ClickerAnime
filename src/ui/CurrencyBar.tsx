import { createSignal, Show, type Accessor } from "solid-js";
import type { GameStore } from "../engine/gameState";
import type { DisclosureState } from "./disclosure";
import PanelTitle from "./PanelTitle";
import Coin from "./Coin";
import { fmt } from "./format";

/**
 * The row of running totals at the top of the middle column. Each total is a shortcut to where that
 * resource is spent — every destination is an overlay App owns.
 */
export default function CurrencyBar(props: {
  game: GameStore;
  disclosure: Accessor<DisclosureState>;
  onOpenShop: () => void;
  onOpenPrestige: () => void;
  onOpenCrossover: () => void;
  onOpenPacks: () => void;
}) {
  const [open, setOpen] = createSignal(true);
  /** Pack points are per world, so the fourth tile always shows the world being fought in. */
  const currentAnime = () => props.game.animeOf(props.game.activeArc()?.animeId);
  return (
    <section class="panel progressive-reveal">
      <header class="panel-head">
        <PanelTitle open={open()} onToggle={() => setOpen(!open())}>
          Ressources
        </PanelTitle>
      </header>
      <Show when={open()}>
      <div class="currency-row">
        <button class="currency" title="Dépenser à la boutique" onClick={props.onOpenShop}>
          <Coin kind="gold" px={24} />
          <strong>{fmt(props.game.currency())}</strong>
        </button>
        <Show when={props.disclosure().prestigeResource}>
          <button class="currency" title="Dépenser dans l'arbre de prestige" onClick={props.onOpenPrestige}>
            <Coin kind="prestige" px={24} />
            <strong>{props.game.prestige().prestigePoints}</strong>
          </button>
        </Show>
        {/*
          `advised` is the nudge the crystals never had: they only pay while the team is fighting
          somewhere it suffers the steep other-anime malus — coming back to farm an old world's
          common, typically — and nothing used to say so, so the stock just sat there.
        */}
        <Show when={props.disclosure().crossover}>
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
            <Coin kind="crystal" px={24} />
            <strong>{props.game.crossoverCrystals()}</strong>
          </button>
        </Show>
        <Show when={props.disclosure().packs}>
          <button
            class="currency"
            title={`Points de pack — ${currentAnime()?.name ?? "aucun monde"}`}
            onClick={props.onOpenPacks}
          >
            <Coin kind="pack" px={24} />
            <strong>{fmt(props.game.worldPointsOf(currentAnime()?.id ?? ""))}</strong>
          </button>
        </Show>
      </div>
      </Show>
    </section>
  );
}
