import { For, Show, createSignal } from "solid-js";
import type { GameStore } from "../engine/gameState";
import { fmt, seconds } from "./format";

interface Pop {
  id: number;
  amount: number;
  x: number;
  y: number;
}

/** Center panel: the fight — enemy hp, boss timer, and the narrator's click. */
export default function ClickStage(props: { game: GameStore }) {
  const [pops, setPops] = createSignal<Pop[]>([]);
  let popId = 0;

  function handleClick(event: MouseEvent) {
    const damage = props.game.click();
    if (damage <= 0) return;
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const pop: Pop = {
      id: popId++,
      amount: damage,
      x: ((event.clientX - box.left) / box.width) * 100,
      y: ((event.clientY - box.top) / box.height) * 100,
    };
    setPops((list) => [...list, pop]);
    setTimeout(() => setPops((list) => list.filter((p) => p.id !== pop.id)), 900);
  }

  const arc = () => props.game.activeArc();
  const anime = () => props.game.data.animes.find((a) => a.id === arc()?.animeId);
  const enemy = () => props.game.enemy();
  const isBoss = () => !!enemy() && enemy()!.id === arc()?.boss.id;
  const hpRatio = () => (props.game.enemyMaxHp() > 0 ? props.game.enemyHpLeft() / props.game.enemyMaxHp() : 0);
  const timer = () => props.game.timerRemaining();
  const killsLeft = () => {
    const current = arc();
    return current ? Math.max(0, current.mobsToBoss - props.game.killsIn(current)) : 0;
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

      <Show when={enemy()} fallback={<div class="stage stage-idle">Choisissez un arc pour combattre.</div>}>
        {(current) => (
          <>
            <div class="enemy-head" classList={{ boss: isBoss() }}>
              <span>
                <Show when={isBoss()}>👑 </Show>
                <Show when={current().characterId}>⭐ </Show>
                {current().name}
              </span>
              <Show when={timer() !== null}>
                <span class="timer" classList={{ urgent: (timer() ?? 0) < 10_000 }}>
                  ⏱ {seconds(timer() ?? 0)}
                </span>
              </Show>
            </div>

            <div class="bar hp-bar" classList={{ boss: isBoss() }}>
              <div class="bar-fill" style={{ width: `${Math.max(0, hpRatio()) * 100}%` }} />
              <span class="bar-label">
                {fmt(Math.max(0, props.game.enemyHpLeft()))} / {fmt(props.game.enemyMaxHp())} PV
              </span>
            </div>

            <Show when={timer() !== null}>
              <div class="bar timer-bar">
                <div class="bar-fill" style={{ width: `${((timer() ?? 0) / (current().timerMs ?? 1)) * 100}%` }} />
              </div>
            </Show>

            <div class="stage" onClick={handleClick}>
              <div class="stage-hint">Clic du Narrateur</div>
              <div class="enemy" classList={{ boss: isBoss(), rival: !!current().characterId }}>
                {current().name.slice(0, 2).toUpperCase()}
              </div>
              <Show
                when={props.game.arcCleared(arc()!)}
                fallback={<p class="stage-empty">Encore {killsLeft()} adversaire(s) avant le boss.</p>}
              >
                <p class="stage-empty">Arc terminé — la zone reste farmable.</p>
              </Show>

              <div class="stage-team">
                <For each={props.game.ownedCharacters()}>
                  {(character) => (
                    <div class="token" classList={{ "token-strong": props.game.synergyOf(character) > 1 }}>
                      <span>{character.name.slice(0, 2).toUpperCase()}</span>
                      <small>x{props.game.synergyOf(character).toFixed(2)}</small>
                    </div>
                  )}
                </For>
              </div>

              <For each={pops()}>
                {(pop) => (
                  <span class="pop" style={{ left: `${pop.x}%`, top: `${pop.y}%` }}>
                    -{fmt(pop.amount)}
                  </span>
                )}
              </For>
            </div>
          </>
        )}
      </Show>

      <footer class="stage-stats">
        <div>
          <small>Clic du Narrateur</small>
          <strong>{fmt(props.game.clickPower())}</strong>
        </div>
        <div>
          <small>DPS équipe</small>
          <strong>{fmt(props.game.teamDps())}</strong>
        </div>
        <div>
          <small>Total gagné</small>
          <strong>{fmt(props.game.lifetimeEarned())}</strong>
        </div>
      </footer>
    </section>
  );
}
