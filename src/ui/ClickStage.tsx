import { For, Show, createSignal } from "solid-js";
import type { GameStore } from "../engine/gameState";
import { fmt } from "./format";

interface Pop {
  id: number;
  amount: number;
  x: number;
  y: number;
}

/** Center panel: the click target, its stats, and the floating gain numbers. */
export default function ClickStage(props: { game: GameStore }) {
  const [pops, setPops] = createSignal<Pop[]>([]);
  let popId = 0;

  function handleClick(event: MouseEvent) {
    const gain = props.game.click();
    const stage = event.currentTarget as HTMLElement;
    const box = stage.getBoundingClientRect();
    const pop: Pop = {
      id: popId++,
      amount: gain,
      x: ((event.clientX - box.left) / box.width) * 100,
      y: ((event.clientY - box.top) / box.height) * 100,
    };
    setPops((list) => [...list, pop]);
    setTimeout(() => setPops((list) => list.filter((p) => p.id !== pop.id)), 900);
  }

  const animeName = () =>
    props.game.data.animes.find((a) => a.id === props.game.activeArc()?.animeId)?.name ?? "Aucun anime";

  return (
    <section class="panel stage-panel">
      <header class="panel-head">
        <span class="stage-title">{props.game.activeArc()?.name ?? "Aucun arc actif"}</span>
        <span class="stage-sub">{animeName()}</span>
      </header>

      <div class="stage" onClick={handleClick}>
        <div class="stage-hint">Cliquez pour gagner</div>
        <div class="stage-team">
          <For each={props.game.ownedCharacters()}>
            {(character) => (
              <div class="token" classList={{ "token-strong": props.game.synergyOf(character) > 1 }}>
                <span>{character.name.slice(0, 2).toUpperCase()}</span>
                <small>x{props.game.synergyOf(character).toFixed(2)}</small>
              </div>
            )}
          </For>
          <Show when={props.game.ownedCharacters().length === 0}>
            <p class="stage-empty">Aucun personnage recruté — recrutez-en un dans le panneau de gauche.</p>
          </Show>
        </div>

        <For each={pops()}>
          {(pop) => (
            <span class="pop" style={{ left: `${pop.x}%`, top: `${pop.y}%` }}>
              +{fmt(pop.amount)}
            </span>
          )}
        </For>
      </div>

      <footer class="stage-stats">
        <div>
          <small>Par clic</small>
          <strong>{fmt(props.game.clickPower())}</strong>
        </div>
        <div>
          <small>Par seconde</small>
          <strong>{fmt(props.game.passiveIncomePerSecond())}</strong>
        </div>
        <div>
          <small>Total gagné</small>
          <strong>{fmt(props.game.lifetimeEarned())}</strong>
        </div>
      </footer>
    </section>
  );
}
