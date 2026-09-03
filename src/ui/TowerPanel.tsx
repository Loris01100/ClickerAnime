import { For, Show, createEffect, createMemo, createSignal, on, onCleanup, onMount } from "solid-js";
import type { GameStore } from "../engine/gameState";
import {
  TOWER_FLOOR_TIMER_MS,
  TOWER_ROUNDS_PER_FLOOR,
  TOWER_SQUAD_SIZE,
  TOWER_UNITS_PER_ROUND,
  towerFloorHp,
  towerPlayableFloors,
  towerRequiredDps,
  towerReward,
  towerRewardFloors,
  type TowerMode,
} from "../engine/tower";
import { portraitUrl } from "./anilist";
import Coin from "./Coin";
import Sprite from "./Sprite";
import { fmt, seconds } from "./format";
import { IconClock, IconCrown, IconLock, IconTrophy } from "./icons";

/** Le compte à rebours du cycle, en jours et heures : la tour se réinitialise tous les 15 jours. */
function cycleLabel(remainingMs: number): string {
  const hours = Math.floor(remainingMs / 3_600_000);
  const days = Math.floor(hours / 24);
  return days > 0 ? `${days} j ${hours % 24} h` : `${hours} h`;
}

/**
 * La Tour de l'Ascension (`docs/tower.md`) : un overlay qui contient tout le mode — le choix des
 * cinq personnages, la liste des étages, le tableau des paliers, et le combat lui-même.
 *
 * Il est plein écran et se joue seul, parce que la tour n'est pas l'arc : ce n'est pas l'équipe qui
 * frappe mais l'escouade, l'ennemi n'appartient à aucun monde, et rien de ce qui tombe dans un arc
 * ne tombe ici. Un écran à part, c'est ce qui rend cette frontière lisible sans une seule phrase.
 */
export default function TowerPanel(props: { game: GameStore; onClose: () => void }) {
  const [mode, setMode] = createSignal<TowerMode>("easy");
  const [pickerOpen, setPickerOpen] = createSignal(false);

  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== "Escape") return;
    // Échap sort d'abord de l'étage, ensuite du panneau : on ne ferme jamais la tour sur une
    // tentative en cours sans que le joueur l'ait demandé deux fois.
    if (props.game.inTower()) props.game.leaveTower();
    else props.onClose();
  }
  onMount(() => document.addEventListener("keydown", onKeyDown));
  onCleanup(() => document.removeEventListener("keydown", onKeyDown));

  const config = () => props.game.towerModeOf(mode());
  const highest = () => props.game.towerHighestFloorOf(mode());
  const floors = () => towerPlayableFloors(mode(), highest());
  const nextFloor = () => Math.min(config().floors, highest() + 1);
  const squadIds = () => props.game.towerSquadIds();

  /** Le roster, escouade en tête : on choisit parmi ce qu'on possède, jamais dans tout le Codex. */
  const roster = createMemo(() =>
    [...props.game.ownedCharacters()].sort((a, b) => {
      const inA = squadIds().includes(a.id) ? 0 : 1;
      const inB = squadIds().includes(b.id) ? 0 : 1;
      return inA - inB || props.game.characterStatOf(b, "teamDps") - props.game.characterStatOf(a, "teamDps");
    })
  );

  /**
   * Les quinze portraits de l'étage sont demandés d'un coup dès qu'on y entre, et non un par un au
   * moment où l'adversaire arrive : un étage se traverse en une poignée de secondes, et une vignette
   * qui se charge à chaque combat, c'est un placeholder qui clignote quinze fois. `portraitUrl`
   * dédoublonne, met en cache et ne rejette jamais, donc c'est un simple préchauffage — on jette la
   * promesse, `Sprite` retrouvera l'entrée dans le cache.
   */
  createEffect(
    on(
      () => [props.game.towerActiveMode(), props.game.towerFloor()] as const,
      () => {
        if (!props.game.inTower()) return;
        for (const opponent of props.game.towerFloorOpponents()) {
          if (opponent) void portraitUrl(opponent.name, "character", props.game.animeOf(opponent.animeId)?.name);
        }
      }
    )
  );

  const hpRatio = () => (props.game.towerMaxHp() > 0 ? props.game.towerHpLeft() / props.game.towerMaxHp() : 0);
  const timeLeft = () => props.game.towerTimeLeft() ?? 0;

  /** L'estimation qui décide vraiment : le DPS de l'escouade contre le mur de l'étage visé. */
  const outlook = createMemo(() => {
    const required = towerRequiredDps(mode(), nextFloor());
    const dps = props.game.towerSquadDps();
    return { required, dps, ready: dps >= required };
  });

  return (
    <div class="overlay" onClick={() => (props.game.inTower() ? undefined : props.onClose())}>
      <div
        class="modal tower-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Tour de l'Ascension"
        onClick={(e) => e.stopPropagation()}
      >
        <header class="panel-head">
          <span>
            <IconTrophy class="gold" /> Tour de l’Ascension
          </span>
          <small class="muted">
            <IconClock /> Réinitialisation dans {cycleLabel(props.game.towerCycle().remainingMs)}
          </small>
          <button onClick={props.onClose} aria-label="Fermer">
            ✕
          </button>
        </header>

        <div class="tower-modes">
          <For each={props.game.towerModes}>
            {(entry) => (
              <button
                classList={{ active: mode() === entry.id, locked: !entry.available }}
                disabled={!entry.available || props.game.inTower()}
                title={entry.available ? undefined : "Mode encore fermé"}
                onClick={() => !props.game.inTower() && setMode(entry.id)}
              >
                <Show when={!entry.available}>
                  <IconLock />{" "}
                </Show>
                {entry.name} · {entry.floors} étages
              </button>
            )}
          </For>
        </div>

        <Show when={props.game.inTower()} fallback={<TowerLobby />}>
          <TowerClimb />
        </Show>
      </div>
    </div>
  );

  /** Hors combat : l'escouade, l'étage à tenter, et ce que paient les paliers. */
  function TowerLobby() {
    return (
      <div class="codex-detail scroll">
        <div class="codex-block">
          <p class="muted small">
            Cent étages, trois manches par étage, cinq adversaires par manche, la dernière manche se
            terminant sur un boss — et l’étage entier, ses quinze combats, doit tomber en{" "}
            {TOWER_FLOOR_TIMER_MS / 1000} s. Les adversaires viennent de tous les univers du jeu : la tour est
            un crossover permanent. Seuls les <strong>{TOWER_SQUAD_SIZE} personnages</strong> de
            l’escouade se battent, avec toute leur puissance actuelle. Rien ne tombe à l’intérieur —
            ni monnaie, ni objet, ni xp : la tour paie par paliers, tous les {config().rewardEvery}{" "}
            étages, une fois par cycle.
          </p>
        </div>

        <div class="codex-block">
          <div class="codex-row">
            <span class="muted">Progression</span>
            <strong>
              {highest()} / {config().floors} étages
            </strong>
          </div>
          <div class="bar tower-progress">
            <div class="bar-fill" style={{ width: `${(highest() / config().floors) * 100}%` }} />
            <span class="bar-label">Prochain étage : {nextFloor()}</span>
          </div>
        </div>

        <div class="codex-block">
          <h4>
            Escouade — {squadIds().length}/{TOWER_SQUAD_SIZE}
          </h4>
          <div class="tower-squad">
            <For each={Array.from({ length: TOWER_SQUAD_SIZE })}>
              {(_, index) => {
                const member = () => props.game.towerSquad()[index()];
                return (
                  <div class="tower-slot" classList={{ filled: !!member() }}>
                    <Show when={member()} fallback={<span class="muted small">vide</span>}>
                      {(character) => (
                        <button
                          class="tower-slot-filled"
                          title="Retirer de l’escouade"
                          onClick={() => props.game.toggleTowerSquadMember(character().id)}
                        >
                          <Sprite
                            name={character().name}
                            kind="character"
                            anime={props.game.animeOf(character().animeId)?.name}
                            px={9}
                          />
                          <small>{character().name}</small>
                          <small class="muted">{fmt(props.game.characterStatOf(character(), "teamDps"))}</small>
                        </button>
                      )}
                    </Show>
                  </div>
                );
              }}
            </For>
          </div>

          <div class="codex-row">
            <span class="muted">DPS de l’escouade</span>
            <strong classList={{ good: outlook().ready, bad: !outlook().ready }}>{fmt(outlook().dps)}</strong>
          </div>
          <p class="muted small">
            L’étage {nextFloor()} demande {fmt(outlook().required)} DPS pour tomber en entier dans ses{" "}
            {TOWER_FLOOR_TIMER_MS / 1000} s — quinze combats, boss compris —, sans compter le Clic du
            Narrateur, qui frappe ici aussi fort que dans un arc.
          </p>

          <button onClick={() => setPickerOpen(!pickerOpen())}>
            {pickerOpen() ? "Fermer la liste" : "Choisir l’escouade"}
          </button>
          <Show when={pickerOpen()}>
            <ul class="tower-roster">
              <For
                each={roster()}
                fallback={<li class="muted small">Aucun personnage recruté pour l’instant.</li>}
              >
                {(character) => {
                  const picked = () => squadIds().includes(character.id);
                  return (
                    <li classList={{ picked: picked() }}>
                      <button
                        disabled={!picked() && squadIds().length >= TOWER_SQUAD_SIZE}
                        onClick={() => props.game.toggleTowerSquadMember(character.id)}
                      >
                        <Sprite
                          name={character.name}
                          kind="character"
                          anime={props.game.animeOf(character.animeId)?.name}
                          px={7}
                        />
                        <span>{character.name}</span>
                        <small class="muted">{props.game.animeOf(character.animeId)?.name}</small>
                        <strong>{fmt(props.game.characterStatOf(character, "teamDps"))}</strong>
                      </button>
                    </li>
                  );
                }}
              </For>
            </ul>
          </Show>
        </div>

        <div class="codex-block">
          <h4>Étages</h4>
          <Show
            when={props.game.towerSquadReady()}
            fallback={
              <p class="muted small">
                Complétez l’escouade — il en faut exactement {TOWER_SQUAD_SIZE} — pour entrer dans la
                tour.
              </p>
            }
          >
            <div class="tower-floors">
              <For each={[...floors()].reverse()}>
                {(target) => (
                  <button
                    class="tower-floor"
                    classList={{ next: target === nextFloor(), cleared: target <= highest() }}
                    title={`Mur de l’étage : ${fmt(towerFloorHp(mode(), target))} PV`}
                    onClick={() => props.game.enterTower(mode(), target)}
                  >
                    <strong>{target}</strong>
                    <Show when={towerReward(mode(), target).crystals > 0}>
                      <IconTrophy class="gold" />
                    </Show>
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>

        <div class="codex-block">
          <h4>Paliers</h4>
          <ul class="tower-rewards">
            <For each={towerRewardFloors(mode())}>
              {(target) => {
                const reward = towerReward(mode(), target);
                const claimed = () => props.game.towerRewardClaimed(mode(), target);
                return (
                  <li classList={{ claimed: claimed(), locked: target > highest() }}>
                    <strong>Étage {target}</strong>
                    <span>
                      {fmt(reward.currency)} <Coin kind="gold" /> · {reward.crystals} <Coin kind="crystal" /> ·{" "}
                      {reward.packPoints} <Coin kind="pack" /> · {reward.fragments}{" "}
                      {reward.fragments > 1 ? "fragments" : "fragment"}
                    </span>
                    <small class="muted">{claimed() ? "réclamé ce cycle" : "à conquérir"}</small>
                  </li>
                );
              }}
            </For>
          </ul>
          <p class="muted small">
            Les fragments vont au premier objet unique déjà trouvé qui en a le moins — la tour ne
            crée aucun objet, elle accélère la forge de ceux que vous possédez.
          </p>
        </div>
      </div>
    );
  }

  /** Dans l'étage : le fond infini, l'adversaire, la manche, l'horloge de l'étage. */
  function TowerClimb() {
    const rounds = Array.from({ length: TOWER_ROUNDS_PER_FLOOR });
    return (
      <div class="tower-climb">
        <div class="tower-status">
          <div>
            <small class="muted">Étage</small>
            <strong>
              {props.game.towerFloor()} / {config().floors}
            </strong>
          </div>
          <div>
            <small class="muted">Manche</small>
            <strong>
              {props.game.towerRound() + 1} / {TOWER_ROUNDS_PER_FLOOR}
            </strong>
          </div>
          <div>
            <small class="muted">DPS escouade</small>
            <strong>{fmt(props.game.towerSquadDps())}</strong>
          </div>
          <button onClick={() => props.game.leaveTower()}>Quitter l’étage</button>
        </div>

        {/* Le fond défile en boucle : `tower-backdrop` répète une image verticalement, ce qui donne
            une tour sans fin quelle que soit la hauteur de l'écran (voir `styles/tower.css`). */}
        <div
          class="stage tower-stage"
          role="button"
          tabindex="0"
          aria-label="Frapper"
          onClick={() => props.game.click()}
          onKeyDown={(event) => {
            if (event.key !== " " && event.key !== "Enter") return;
            event.preventDefault();
            props.game.click();
          }}
        >
          <div class="tower-backdrop" aria-hidden="true" />
          <div class="stage-hint">Clic du Narrateur</div>
          <Show when={props.game.towerEnemy()}>
            {(enemy) => (
              <>
                <div class="enemy" classList={{ boss: props.game.towerOnBoss() }}>
                  {/* `anime` est indispensable ici : la tour mélange tous les univers, et un nom
                      courant cherché sans son show tombe sur le personnage d'un autre anime. */}
                  <Sprite
                    name={enemy().name}
                    kind="character"
                    anime={props.game.animeOf(props.game.towerOpponent()?.animeId)?.name}
                    px={19}
                  />
                </div>
                <div class="enemy-name">
                  <Show when={props.game.towerOnBoss()}>
                    <IconCrown class="gold" />{" "}
                  </Show>
                  {enemy().name}
                </div>
              </>
            )}
          </Show>
        </div>

        <div class="bar hp-bar">
          <div class="bar-fill" style={{ width: `${Math.max(0, hpRatio()) * 100}%` }} />
          <span class="bar-label">
            {fmt(Math.max(0, props.game.towerHpLeft()))} / {fmt(props.game.towerMaxHp())} PV
          </span>
        </div>

        {/* Une seule horloge, celle de l'étage : elle couvre les quinze combats, boss compris. */}
        <div class="bar timer-bar" classList={{ urgent: timeLeft() < 10_000 }}>
          <div class="bar-fill" style={{ width: `${(timeLeft() / TOWER_FLOOR_TIMER_MS) * 100}%` }} />
          <span class="bar-label">
            <IconClock /> Étage · {seconds(timeLeft())}
          </span>
        </div>

        <div class="tower-rounds">
          <For each={rounds}>
            {(_, round) => (
              <div class="tower-round" classList={{ done: round() < props.game.towerRound() }}>
                <small class="muted">Manche {round() + 1}</small>
                <div class="tower-dots">
                  <For each={Array.from({ length: TOWER_UNITS_PER_ROUND })}>
                    {(__, slot) => (
                      <span
                        class="tower-dot"
                        classList={{
                          boss: round() === TOWER_ROUNDS_PER_FLOOR - 1 && slot() === TOWER_UNITS_PER_ROUND - 1,
                          done: round() * TOWER_UNITS_PER_ROUND + slot() < props.game.towerUnitsDone(),
                          current: round() * TOWER_UNITS_PER_ROUND + slot() === props.game.towerUnitsDone(),
                        }}
                      />
                    )}
                  </For>
                </div>
              </div>
            )}
          </For>
        </div>

        <Show when={props.game.towerLastFailure()}>
          {(failure) => (
            <p class="muted small">
              Étage {failure().floor} : le temps s’est écoulé, la tentative repart de la manche 1. Rien
              n’est perdu — les étages déjà franchis restent acquis.
            </p>
          )}
        </Show>
      </div>
    );
  }
}
