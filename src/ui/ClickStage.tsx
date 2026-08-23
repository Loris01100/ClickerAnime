import { For, Show, createEffect, createResource, createSignal } from "solid-js";
import type { GameStore } from "../engine/gameState";
import { bannerUrl } from "./anilist";
import PanelTitle from "./PanelTitle";
import Sprite from "./Sprite";
import { fmt, seconds } from "./format";
import { IconChevronLeft, IconChevronRight, IconClock, IconCrown, IconStar } from "./icons";

interface Pop {
  id: number;
  amount: number;
  x: number;
  y: number;
}

/** Middle column: the arc stepper, the fight, and the running combat stats. */
export default function ClickStage(props: { game: GameStore }) {
  const [pops, setPops] = createSignal<Pop[]>([]);
  const [open, setOpen] = createSignal(true);
  // Purely cosmetic combat feedback (`design.md` §4), cleared by the animations' own `animationend`
  // rather than a timer, so a rapid click never leaves the class stuck on.
  const [hit, setHit] = createSignal(false);
  const [spawning, setSpawning] = createSignal(false);
  let popId = 0;

  function handleClick(event: MouseEvent) {
    const damage = props.game.click();
    if (damage <= 0) return;
    setHit(true);
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

  // The show's key art, staged behind the fight. Best effort like every AniList lookup: pending or
  // missing simply leaves the plain `--stage-bg` gradient showing (see `anilist.ts`).
  const [banner] = createResource(
    () => anime()?.name,
    (name) => bannerUrl(name)
  );

  // `combat.ts` swaps the defeated enemy for the next one in place, so there is no outgoing enemy
  // left to animate — the replacement itself is what gets the entrance.
  createEffect((previous: string | undefined) => {
    const id = enemy()?.id;
    if (id && previous && id !== previous) setSpawning(true);
    return id;
  });

  const neighbour = (offset: number) => {
    const arcs = props.game.playableArcs();
    const index = arcs.findIndex((a) => a.id === arc()?.id);
    return index < 0 ? undefined : arcs[index + offset];
  };

  const kills = () => {
    const current = arc();
    return current ? props.game.killsIn(current) : 0;
  };
  const killsGoal = () => arc()?.mobsToBoss ?? 0;
  const cleared = () => {
    const current = arc();
    return current ? props.game.arcCleared(current) : false;
  };
  const bossChallengeable = () => {
    const current = arc();
    return current ? props.game.bossChallengeable(current) : false;
  };

  return (
    <section class="panel">
      <header class="panel-head">
        <PanelTitle open={open()} onToggle={() => setOpen(!open())}>
          Combat
        </PanelTitle>
        <small class="muted">
          {anime()?.name ?? "—"} · difficulté x{anime() ? fmt(props.game.difficultyOf(anime()!.id)) : "1"}
        </small>
      </header>

      <Show when={open()}>
      <div class="arc-stepper">
        <button disabled={!neighbour(-1)} onClick={() => props.game.stepArc(-1)}>
          <IconChevronLeft /> {neighbour(-1)?.name ?? "—"}
        </button>
        <span class="arc-current">{arc()?.name ?? "Aucun arc"}</span>
        <button disabled={!neighbour(1)} onClick={() => props.game.stepArc(1)}>
          {neighbour(1)?.name ?? "—"} <IconChevronRight />
        </button>
      </div>

      <Show when={enemy()} fallback={<div class="stage stage-idle">Choisissez un arc pour combattre.</div>}>
        {(current) => (
          <>
            <div class="stage" onClick={handleClick}>
              <Show when={banner()}>
                {(src) => (
                  <div class="stage-backdrop" style={{ "background-image": `url(${src()})` }} aria-hidden="true" />
                )}
              </Show>
              <div class="stage-hint">Clic du Narrateur</div>
              <div
                class="enemy"
                classList={{ boss: isBoss(), rival: !!current().characterId, hit: hit(), spawning: spawning() }}
                onAnimationEnd={(event) => {
                  if (event.animationName === "enemy-hit") setHit(false);
                  if (event.animationName === "enemy-spawn") setSpawning(false);
                }}
              >
                <Sprite name={current().name} kind="character" anime={anime()?.name} px={isBoss() ? 14 : 11} />
              </div>
              <div class="enemy-name" classList={{ boss: isBoss() }}>
                <Show when={isBoss()}>
                  <IconCrown class="gold" />{" "}
                </Show>
                <Show when={current().characterId}>
                  <IconStar class="gold" />{" "}
                </Show>
                {current().name}
              </div>

              <For each={pops()}>
                {(pop) => (
                  <span class="pop" style={{ left: `${pop.x}%`, top: `${pop.y}%` }}>
                    -{fmt(pop.amount)}
                  </span>
                )}
              </For>
            </div>

            <div class="bar hp-bar" classList={{ boss: isBoss() }}>
              <div class="bar-fill" style={{ width: `${Math.max(0, hpRatio()) * 100}%` }} />
              <span class="bar-label">
                {fmt(Math.max(0, props.game.enemyHpLeft()))} / {fmt(props.game.enemyMaxHp())} PV
              </span>
            </div>

            <Show when={timer() !== null}>
              <div class="bar timer-bar" classList={{ urgent: (timer() ?? 0) < 10_000 }}>
                <div class="bar-fill" style={{ width: `${((timer() ?? 0) / (current().timerMs ?? 1)) * 100}%` }} />
                <span class="bar-label"><IconClock /> {seconds(timer() ?? 0)}</span>
              </div>
            </Show>
          </>
        )}
      </Show>

      <Show when={bossChallengeable()}>
        <button class="primary boss-rematch" onClick={() => props.game.challengeBoss()}>
          <IconCrown class="gold" /> Retenter le boss
        </button>
      </Show>

      <div class="stat-grid">
        <div>
          <small>Clic du Narrateur</small>
          <strong>{fmt(props.game.clickPower())}</strong>
        </div>
        <div>
          <small>DPS équipe</small>
          <strong>{fmt(props.game.teamDps())}</strong>
        </div>
        <div>
          <small>Avant le boss</small>
          <strong>
            <Show when={!cleared()} fallback="terminé">
              {Math.min(kills(), killsGoal())} / {killsGoal()}
            </Show>
          </strong>
        </div>
        <div>
          <small>Total gagné</small>
          <strong>{fmt(props.game.lifetimeEarned())}</strong>
        </div>
      </div>
      </Show>
    </section>
  );
}
