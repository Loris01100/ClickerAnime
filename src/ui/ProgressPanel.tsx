import { For, Show, createMemo, createSignal } from "solid-js";
import type { GameStore } from "../engine/gameState";
import PanelTitle from "./PanelTitle";
import { fmt, seconds } from "./format";
import Coin from "./Coin";
import { IconCheck, IconChevronRight, IconLock, IconTarget } from "./icons";

const pct = (into: number, need: number) => (need > 0 ? Math.min(100, (into / need) * 100) : 0);

/** Right column: the arc list per world, travel, and the prestige track. */
export default function ProgressPanel(props: {
  game: GameStore;
  onOpenPrestige: () => void;
  onOpenChallenges: () => void;
  onOpenForge: () => void;
}) {
  const [openAnimes, setOpenAnimes] = createSignal<Record<string, boolean>>({});
  const [travelOpen, setTravelOpen] = createSignal(true);
  const [prestigeOpen, setPrestigeOpen] = createSignal(true);
  const isAnimeOpen = (id: string) => openAnimes()[id] ?? !props.game.animeCleared(id);
  const toggleAnime = (id: string) => setOpenAnimes((o) => ({ ...o, [id]: !isAnimeOpen(id) }));
  /** Le prestige efface tout le run : un clic accidentel coûtait des heures, d'où la confirmation. */
  function confirmPrestige() {
    const gain = props.game.pendingPrestigeGain();
    if (!confirm(`Réinitialiser le run et banquer ${gain} point${gain > 1 ? "s" : ""} de prestige ?`)) return;
    props.game.prestigeReset();
  }

  // Un monde dont le préalable n'est pas rempli ne doit même pas apparaître dans le choix.
  const otherAnimes = () =>
    props.game.data.animes.filter(
      (a) => !props.game.prestige().unlockedAnimeIds.includes(a.id) && !props.game.animeBlockedBy(a.id)
    );

  return (
    <div class="column">
      <For each={props.game.unlockedAnimes()}>
        {(anime) => (
          <section class="panel">
            <header class="panel-head">
              <PanelTitle open={isAnimeOpen(anime.id)} onToggle={() => toggleAnime(anime.id)}>
                {anime.name}
                <Show when={props.game.animeCleared(anime.id)}> <IconCheck class="good" /></Show>
              </PanelTitle>
              <small class="muted">x{fmt(props.game.difficultyOf(anime.id))}</small>
            </header>
            <Show when={isAnimeOpen(anime.id)}>
            <For each={props.game.arcsOf(anime.id)}>
              {(arc) => {
                const open = () => props.game.arcOpen(arc);
                const cleared = () => props.game.arcCleared(arc);
                const kills = () => Math.min(props.game.killsIn(arc), arc.mobsToBoss);
                /*
                 * Mémoïsés, pas de simples fonctions : `bossOutlookOf` refait passer toute
                 * l'équipe dans le pipeline de modificateurs pour *cet* arc-là (synergie,
                 * passifs, uniques, succès, arbre), et la ligne le lit trois fois — le `title` du
                 * bouton, le test « trop dur », le `title` de ce marqueur. En l'état, un monde
                 * ouvert à 15 arcs reconstruisait 45 fois l'équipe à chaque changement d'état ;
                 * le memo ramène ça à une fois par arc.
                 */
                const outlook = createMemo(() => props.game.bossOutlookOf(arc));
                /** Ce que l'équipe vaut face au boss de cet arc — le seul mur du jeu. */
                const outlookLabel = createMemo(() => {
                  const { ttkMs, timerMs, winnable } = outlook();
                  if (!Number.isFinite(ttkMs)) return "Boss : aucun DPS pour l'instant";
                  const base = `Boss : ${seconds(ttkMs)} pour l'abattre`;
                  if (!timerMs) return base;
                  return `${base} · limite ${seconds(timerMs)}${winnable ? "" : " — trop dur pour l'instant"}`;
                });
                return (
                  <button
                    class="arc"
                    classList={{ active: props.game.activeArc()?.id === arc.id, cleared: cleared() }}
                    disabled={!open()}
                    title={outlookLabel()}
                    onClick={() => props.game.setActiveArc(arc.id)}
                  >
                    <span class="arc-name">
                      <Show when={!open()}>
                        <IconLock />{" "}
                      </Show>
                      {arc.name}
                      {/* Un arc ouvert mais dont le boss est hors de portée doit se voir sans
                          survoler : c'est l'info qui dit « reviens plus tard ». */}
                      <Show when={open() && !cleared() && !outlook().winnable}>
                        <small class="arc-hard" title={outlookLabel()}>
                          trop dur
                        </small>
                      </Show>
                    </span>
                    <div class="bar arc-bar">
                      <div
                        class="bar-fill"
                        style={{ width: `${cleared() ? 100 : pct(kills(), arc.mobsToBoss)}%` }}
                      />
                      <span class="bar-label">
                        {cleared() ? "terminé" : `${kills()} / ${arc.mobsToBoss}`}
                      </span>
                    </div>
                  </button>
                );
              }}
            </For>
            </Show>
          </section>
        )}
      </For>

      <Show when={otherAnimes().length > 0}>
        <section class="panel">
          <header class="panel-head">
            <PanelTitle open={travelOpen()} onToggle={() => setTravelOpen(!travelOpen())}>
              Voyager
            </PanelTitle>
            <small class="muted">x{fmt(props.game.nextDifficulty())}</small>
          </header>
          <Show when={travelOpen()}>
          <p class="muted pad small">
            <Show
              when={props.game.canTravel()}
              fallback="Terminez l'anime en cours pour partir, ou payez le raccourci en prestige."
            >
              Le prochain monde sera joué à cette difficulté.
            </Show>
          </p>
          <For each={otherAnimes()}>
            {(anime) => (
              <div class="row">
                <span class="name">{anime.name}</span>
                <Show
                  when={props.game.canTravel()}
                  fallback={
                    <button
                      disabled={props.game.prestige().prestigePoints < anime.unlockCost}
                      title="Raccourci payant : entrer sans avoir fini le monde en cours"
                      onClick={() => props.game.unlockAnime(anime.id)}
                    >
                      {anime.unlockCost} <Coin kind="prestige" />
                    </button>
                  }
                >
                  <button onClick={() => props.game.travelTo(anime.id)}>Partir</button>
                </Show>
              </div>
            )}
          </For>
          </Show>
        </section>
      </Show>

      <section class="panel">
        <header class="panel-head">
          <PanelTitle open={prestigeOpen()} onToggle={() => setPrestigeOpen(!prestigeOpen())}>
            Prestige
          </PanelTitle>
          <small class="muted">{props.game.prestige().prestigePoints} <Coin kind="prestige" /></small>
        </header>
        <Show when={prestigeOpen()}>
        <div class="pad">
          <button
            class="primary"
            disabled={props.game.pendingPrestigeGain() <= 0}
            onClick={confirmPrestige}
          >
            Prestige (+{props.game.pendingPrestigeGain()})
          </button>
          {/* Secondaire assumé : c'est le bouton qu'on ouvre souvent, face à un CTA de reset qu'on
              n'actionne que rarement — il doit être lisible sans jamais rivaliser avec lui. L'étincelle
              est celle des points de prestige (même glyphe que le compteur au-dessus), pour qu'on
              voie d'un coup d'œil où ils se dépensent ; le chevron dit que ça ouvre une vue. */}
          <button class="tree-open" onClick={props.onOpenPrestige}>
            <Coin kind="prestige" />
            Arbre de prestige
            <IconChevronRight class="tree-open-go" />
          </button>
          {/* Même famille que le bouton de l'arbre — une vue qu'on ouvre, pas une action qui
              s'exécute — parce qu'un défi part lui aussi d'une réinitialisation : sa place est ici,
              contre le CTA de prestige, et nulle part ailleurs. */}
          <button class="tree-open" onClick={props.onOpenChallenges}>
            <IconTarget />
            Défis de run
            <Show when={props.game.activeChallenge()}>
              {(challenge) => (
                <small class="muted">
                  {challenge().name} · {props.game.challengeProgressOf()?.cleared ?? 0}/{challenge().goal}
                </small>
              )}
            </Show>
            <IconChevronRight class="tree-open-go" />
          </button>
          <p class="muted small">
            Complétion : {Math.round(props.game.runCompletion() * 100)}% des arcs terminés — plus elle est
            haute, plus la réinitialisation rapporte de points.
          </p>
          <p class="muted small">
            Réinitialise tout : monnaie, équipe, niveaux, mondes, arcs terminés, objets et passifs.
            Seuls les points de prestige sont conservés.
          </p>
        </div>
        </Show>
      </section>

      <Show when={props.game.forgeableUniques().length > 0}>
        <section class="panel">
          <header class="panel-head">
            <span>Forge</span>
            <small class="muted">Fragments de boss</small>
          </header>
          <div class="pad">
            <button class="tree-open" onClick={props.onOpenForge}>
              Ouvrir la forge ({props.game.forgeableUniques().length})
              <IconChevronRight class="tree-open-go" />
            </button>
          </div>
        </section>
      </Show>

    </div>
  );
}
