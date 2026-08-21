import type { GameStore } from "../engine/gameState";
import { fmt } from "./format";
import { IconBookmark, IconGlobe } from "./icons";

/** The row of running totals at the top of the middle column. */
export default function CurrencyBar(props: { game: GameStore }) {
  return (
    <section class="panel">
      <header class="panel-head">
        <span>Ressources</span>
      </header>
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
    </section>
  );
}
