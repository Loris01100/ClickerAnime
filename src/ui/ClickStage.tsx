import { For, Show, createEffect, createResource, createSignal } from "solid-js";
import type { GameStore } from "../engine/gameState";
import { BOSS_REPLAY_KILLS } from "../engine/combat";
import { bannerUrl } from "./anilist";
import AutomationBar from "./AutomationBar";
import PanelTitle from "./PanelTitle";
import Sprite from "./Sprite";
import { fmt, seconds } from "./format";
import { IconChevronLeft, IconChevronRight, IconClock, IconCrown, IconStar, IconTarget } from "./icons";

interface Pop {
  id: number;
  amount: number;
  crit: boolean;
  /** Fired by the prestige autoclicker rather than by the player — styled apart, see `.pop.auto`. */
  auto: boolean;
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

  /**
   * Puts one damage number on the stage and clears it once its `rise` animation is done. `at` is
   * where it sprouts, in percent of the stage.
   */
  function addPop(amount: number, crit: boolean, auto: boolean, at: { x: number; y: number }) {
    const entry: Pop = { id: popId++, amount, crit, auto, ...at };
    setPops((list) => [...list, entry]);
    setTimeout(() => setPops((list) => list.filter((p) => p.id !== entry.id)), 900);
  }

  /**
   * One narrator click. `at` is the pointer for a mouse click, the middle of the stage for a
   * keyboard one — see `handleKey`, which has no coordinates to work from.
   */
  function strike(at: { x: number; y: number }) {
    const { damage, crit } = props.game.click();
    if (damage <= 0) return;
    setHit(true);
    addPop(damage, crit, false, at);
  }

  // The prestige autoclicker (Clic du Narrateur node 2) fires from the tick, with no pointer behind
  // it — so it lands near the enemy with a little jitter, rather than exactly where the last manual
  // click happened. Keyed on the pulse's id: two identical hits in a row must still be two pops.
  createEffect((previous: number | undefined) => {
    const pulse = props.game.autoClickPulse();
    if (previous !== undefined && pulse.id !== previous && pulse.damage > 0) {
      setHit(true);
      addPop(pulse.damage, false, true, { x: 42 + Math.random() * 16, y: 32 + Math.random() * 16 });
    }
    return pulse.id;
  });

  function handleClick(event: MouseEvent) {
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    strike({
      x: ((event.clientX - box.left) / box.width) * 100,
      y: ((event.clientY - box.top) / box.height) * 100,
    });
  }

  /**
   * The narrator's click is the game's core verb, so it has to be reachable without a mouse. Space
   * and Enter only — anything else would swallow the keys the overlays listen for.
   */
  function handleKey(event: KeyboardEvent) {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault(); // Space would otherwise scroll the page on every hit.
    strike({ x: 50, y: 45 });
  }

  const arc = () => props.game.activeArc();
  const anime = () => props.game.animeOf(arc()?.animeId);
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
  const killsGoal = () => (cleared() ? BOSS_REPLAY_KILLS : arc()?.mobsToBoss ?? 0);
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

      {/* Une contrainte de défi se voit là où elle mord : un clic qui n'inflige plus rien, dans un
          jeu dont c'est le geste central, doit dire pourquoi sans qu'on aille ouvrir un panneau. */}
      <Show when={props.game.activeChallenge()}>
        {(challenge) => (
          <div class="challenge-banner" title={challenge().constraint}>
            <IconTarget />
            <strong>{challenge().name}</strong>
            <span class="muted">{challenge().constraint}</span>
            <small>
              {props.game.challengeProgressOf()?.cleared ?? 0}/{challenge().goal} arcs
            </small>
          </div>
        )}
      </Show>

      <Show when={arc()?.boss.bossTrait}>
        {(trait) => (
          <div class="boss-intel" classList={{ active: isBoss() }}>
            <IconCrown />
            <div>
              <small>{isBoss() ? "Trait actif" : `Boss à venir · ${arc()?.boss.name}`}</small>
              <strong>{trait().name}</strong>
            </div>
            <span>{trait().description}</span>
          </div>
        )}
      </Show>

      <AutomationBar game={props.game} />

      <Show when={enemy()} fallback={<div class="stage stage-idle">Choisissez un arc pour combattre.</div>}>
        {(current) => (
          <>
            <div
              class="stage"
              role="button"
              tabindex="0"
              aria-label="Clic du Narrateur"
              onClick={handleClick}
              onKeyDown={handleKey}
            >
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
                <Sprite name={current().name} kind="character" anime={anime()?.name} px={isBoss() ? 20 : 17} />
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
                  <span
                    class="pop"
                    classList={{ crit: pop.crit, auto: pop.auto }}
                    style={{ left: `${pop.x}%`, top: `${pop.y}%` }}
                  >
                    -{fmt(pop.amount)}
                    {pop.crit ? " !" : ""}
                  </span>
                )}
              </For>
            </div>

            <div class="bar hp-bar" classList={{ boss: isBoss() }}>
              <div class="bar-fill" style={{ width: `${Math.max(0, hpRatio()) * 100}%` }} />
              <span class="bar-label">
                {fmt(Math.max(0, props.game.enemyHpLeft()))} / {fmt(props.game.enemyMaxHp())} PV
                {/* Time-to-kill sits on the hp bar because that is where the player already looks
                    to judge whether a fight is going anywhere. */}
                <Show when={Number.isFinite(props.game.timeToKill())} fallback=" · ∞">
                  {" · "}
                  {seconds(props.game.timeToKill())}
                </Show>
              </span>
            </div>

            <Show when={timer() !== null}>
              <div class="bar timer-bar" classList={{ urgent: (timer() ?? 0) < 10_000 }}>
                <div class="bar-fill" style={{ width: `${((timer() ?? 0) / (props.game.timerTotal() || 1)) * 100}%` }} />
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
          <small>{cleared() ? "Prochain boss" : "Avant le boss"}</small>
          <strong>
            {Math.min(kills(), killsGoal())} / {killsGoal()}
          </strong>
        </div>
        <div>
          <small>Total gagné</small>
          <strong>{fmt(props.game.lifetimeEarned())}</strong>
        </div>
      </div>

      {/*
        Le plafond de kills (`MAX_KILLS_PER_SECOND`) est la seule chose qui rende « DPS équipe »
        trompeur : sur un arc largement dépassé, l'overkill au-delà de 5 ennemis/s est jeté, et rien
        à l'écran ne le disait — on continuait à monter des dégâts qui ne rapportaient plus un objet
        de plus. La ligne reste une simple mesure tant que la cadence passe, et devient un
        avertissement dès que le surplus commence à se perdre. Absente sur un boss : un seul ennemi,
        donc un temps de mise à mort, jamais une cadence (voir `gameState`'s killRate).
      */}
      <Show when={props.game.killRate()}>
        {(rate) => (
          <p
            class="kill-rate"
            classList={{ capped: rate().efficiency < 1 }}
            title={
              rate().efficiency < 1
                ? `Un combat ne peut pas résoudre plus de ${props.game.maxKillsPerSecond} ennemis par seconde. `
                  + `Votre DPS en vaut ${fmt(rate().uncapped)} ici : le reste des dégâts est perdu, et tout ce `
                  + `qui se gagne au kill (monnaie, xp, objets, points de pack) plafonne avec. Un arc plus dur `
                  + `reconvertit ces dégâts en gains.`
                : `Ennemis abattus par seconde par le DPS de l'équipe, ${props.game.maxKillsPerSecond} au maximum. `
                  + `Les clics s'ajoutent à cette cadence sans lever le plafond.`
            }
          >
            <IconTarget />
            <span>
              Cadence <strong>{fmt(rate().actual)}</strong> / {props.game.maxKillsPerSecond} ennemis/s
            </span>
            <Show when={rate().efficiency < 1}>
              <span class="kill-rate-loss">
                {cleared()
                  ? "— change d’arc, sauf si tu farmes ses objets"
                  : "— les mobs sont dépassés : fonce jusqu’au boss"}
              </span>
            </Show>
          </p>
        )}
      </Show>
      </Show>
    </section>
  );
}
