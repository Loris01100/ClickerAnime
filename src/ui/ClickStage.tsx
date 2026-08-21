import { For, Show, createSignal } from "solid-js";
import type { GameStore } from "../engine/gameState";
import { fmt } from "./format";

interface Pop {
  id: number;
  amount: number;
  x: number;
  y: number;
}

/** Center panel: the narrator's click, the active arc's progress, and the floating gain numbers. */
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

  const arc = () => props.game.activeArc();
  const anime = () => props.game.data.animes.find((a) => a.id === arc()?.animeId);
  const goal = () => {
    const current = arc();
    return current ? props.game.goalOf(current) : 0;
  };
  const progress = () => {
    const current = arc();
    return current ? props.game.progressOf(current) : 0;
  };
  const cleared = () => {
    const current = arc();
    return current ? props.game.arcCleared(current) : false;
  };

  return (
    <section class="panel stage-panel">
      <header class="panel-head">
        <span class="stage-title">{arc()?.name ?? "Aucun arc actif"}</span>
        <span class="stage-sub">
          {anime()?.name ?? "—"}
          <Show when={anime()}>{(a) => <> · difficulté x{fmt(props.game.difficultyOf(a().id))}</>}</Show>
        </span>
      </header>

      <div class="stage" onClick={handleClick}>
        <div class="stage-hint">Clic du Narrateur</div>
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

      <div class="bar arc-bar" classList={{ cleared: cleared() }}>
        <div class="bar-fill" style={{ width: `${goal() > 0 ? Math.min(100, (progress() / goal()) * 100) : 0}%` }} />
        <span class="bar-label">
          <Show when={!cleared()} fallback={"Arc terminé"}>
            {fmt(Math.min(progress(), goal()))} / {fmt(goal())}
          </Show>
        </span>
      </div>

      <footer class="stage-stats">
        <div>
          <small>Clic du Narrateur</small>
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
