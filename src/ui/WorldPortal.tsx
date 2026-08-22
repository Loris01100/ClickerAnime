import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import type { GameStore } from "../engine/gameState";
import type { Anime, Arc, Character } from "../engine/types";
import { levelGrowth, PASSIVE_LEVEL_CAP } from "../engine/growth";
import Sprite from "./Sprite";
import { describeModifier } from "./describe";
import { fmt } from "./format";
import { IconLock } from "./icons";

type Status = "cleared" | "current" | "available" | "locked";

const STATUS_LABEL: Record<Status, string> = {
  cleared: "Terminé",
  current: "En cours",
  available: "Disponible",
  locked: "Verrouillé",
};

function statusOf(game: GameStore, anime: Anime): Status {
  if (game.animeCleared(anime.id)) return "cleared";
  if (game.prestige().unlockedAnimeIds.includes(anime.id)) return "current";
  if (game.animeAvailable(anime.id)) return "available";
  return "locked";
}

/**
 * One world's dossier: progress, blurb, and — arc by arc — who can be recruited there, what their
 * passive is worth at rank 1 and at the cap, and what item that arc drops. Reused for the browsable
 * overlay and for the very first world pick.
 */
function PortalDetail(props: { game: GameStore; anime: Anime; onTravelled?: () => void }) {
  const status = () => statusOf(props.game, props.anime);
  const arcs = () => props.game.arcsOf(props.anime.id);
  const clearedCount = () => arcs().filter((a) => props.game.arcCleared(a)).length;
  const blockedBy = () => props.game.animeBlockedBy(props.anime.id);

  const charactersOf = (arc: Arc): Character[] =>
    [...arc.mobs, arc.boss]
      .map((e) => e.characterId)
      .filter((id): id is string => !!id)
      .map((id) => props.game.data.characters.find((c) => c.id === id))
      .filter((c): c is Character => !!c);

  const commonItemOf = (arc: Arc) => {
    const itemId = arc.mobs.find((m) => m.itemId)?.itemId;
    return props.game.data.items.find((i) => i.id === itemId) ?? null;
  };

  const uniqueItemOf = (arc: Arc) => {
    const itemId = arc.boss.itemId;
    return props.game.data.items.find((i) => i.id === itemId) ?? null;
  };

  function travel() {
    if (props.game.canTravel()) {
      if (props.game.travelTo(props.anime.id)) props.onTravelled?.();
    } else {
      props.game.unlockAnime(props.anime.id);
    }
  }

  return (
    <div class="portal-detail scroll">
      <div class="portal-hero">
        <Sprite seed={props.anime.id} px={8} dim={status() === "locked"} />
        <div>
          <h3>{props.anime.name}</h3>
          <p class="muted small">
            {arcs().length} arcs · difficulté x{fmt(props.game.difficultyOf(props.anime.id))}
          </p>
          <span class="portal-badge" classList={{ [status()]: true }}>
            <Show when={status() === "locked"}>
              <IconLock />
            </Show>
            {STATUS_LABEL[status()]}
          </span>
        </div>
      </div>

      <Show when={props.anime.description}>
        <p class="portal-description">{props.anime.description}</p>
      </Show>

      <Show
        when={status() !== "locked"}
        fallback={
          <p class="muted small">
            Verrouillé — terminez {blockedBy()?.name ?? "le monde précédent"} pour l'ouvrir.
          </p>
        }
      >
        <div class="bar arc-bar portal-progress">
          <div
            class="bar-fill"
            style={{ width: `${arcs().length > 0 ? (clearedCount() / arcs().length) * 100 : 0}%` }}
          />
          <span class="bar-label">
            {clearedCount()} / {arcs().length} arcs terminés
          </span>
        </div>
      </Show>

      <Show when={status() === "available"}>
        <button
          class="primary"
          disabled={!props.game.canTravel() && props.game.prestige().prestigePoints < props.anime.unlockCost}
          onClick={travel}
        >
          {props.game.canTravel() ? "Partir" : `Débloquer (${props.anime.unlockCost} ✦)`}
        </button>
      </Show>

      <div class="portal-arcs">
        <For each={arcs()}>
          {(arc, index) => {
            const recruits = () => charactersOf(arc);
            const common = () => commonItemOf(arc);
            const unique = () => uniqueItemOf(arc);
            return (
              <div class="portal-arc">
                <h4>
                  {index() + 1}. {arc.name}
                </h4>
                <Show when={recruits().length > 0}>
                  <div class="portal-recruits">
                    <For each={recruits()}>
                      {(character) => {
                        const cap = () => PASSIVE_LEVEL_CAP[character.rarity];
                        const atCap = (passive: NonNullable<Character["passive"]>) => ({
                          ...passive,
                          value: passive.value * levelGrowth(cap() - 1),
                        });
                        return (
                          <div class="portal-recruit">
                            <Sprite seed={character.id} px={3} />
                            <div>
                              <strong class="small">{character.name}</strong>
                              <Show
                                when={character.passive}
                                fallback={<p class="muted small">Aucun passif.</p>}
                              >
                                {(passive) => (
                                  <p class="muted small">
                                    Passif : {describeModifier(passive())} (rang 1) → {describeModifier(atCap(passive()))} au max
                                  </p>
                                )}
                              </Show>
                            </div>
                          </div>
                        );
                      }}
                    </For>
                  </div>
                </Show>
                <p class="muted small portal-items">
                  <Show when={common()}>Objet commun : {common()!.name}. </Show>
                  <Show when={unique()}>Objet unique du boss : {unique()!.name}.</Show>
                </p>
              </div>
            );
          }}
        </For>
      </div>
    </div>
  );
}

/**
 * Every license as a card on one map — the whole portal, not just the ones open right now. Locked
 * worlds stay visible (teased, not hidden) so the player can see what clearing the current one
 * unlocks. Doubles as the very first world pick (no `onClose`, full page) and as a browsable
 * overlay reachable any time afterwards.
 */
export default function WorldPortal(props: { game: GameStore; onClose?: () => void }) {
  const firstSelectable = () =>
    props.game.data.animes.find((a) => statusOf(props.game, a) !== "locked") ?? props.game.data.animes[0];
  const [selectedId, setSelectedId] = createSignal(firstSelectable()?.id ?? "");
  const selected = createMemo(() => props.game.data.animes.find((a) => a.id === selectedId()));

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") props.onClose?.();
  }
  onMount(() => document.addEventListener("keydown", onKeyDown));
  onCleanup(() => document.removeEventListener("keydown", onKeyDown));

  const body = (
    <div class="portal">
      <div class="portal-list scroll">
        <For each={props.game.data.animes}>
          {(anime) => {
            const status = () => statusOf(props.game, anime);
            return (
              <button
                class="portal-card"
                classList={{ active: anime.id === selectedId(), locked: status() === "locked" }}
                onClick={() => setSelectedId(anime.id)}
              >
                <Sprite seed={anime.id} px={4} dim={status() === "locked"} />
                <span class="name">{anime.name}</span>
                <span class="portal-badge" classList={{ [status()]: true }}>
                  <Show when={status() === "locked"}>
                    <IconLock />
                  </Show>
                  {STATUS_LABEL[status()]}
                </span>
              </button>
            );
          }}
        </For>
      </div>

      <Show when={selected()}>
        {(anime) => <PortalDetail game={props.game} anime={anime()} onTravelled={props.onClose} />}
      </Show>
    </div>
  );

  return (
    <Show
      when={props.onClose}
      fallback={
        <div class="portal-page">
          <h2>Portail des mondes</h2>
          <p class="muted">
            Le premier monde est gratuit. Chaque monde terminé rend le suivant plus difficile — et
            ouvre le prochain.
          </p>
          {body}
        </div>
      }
    >
      <div class="overlay" onClick={props.onClose}>
        <div
          class="modal"
          role="dialog"
          aria-modal="true"
          aria-label="Portail des mondes"
          onClick={(e) => e.stopPropagation()}
        >
          <header class="panel-head">
            <span>Portail des mondes</span>
            <button onClick={props.onClose} aria-label="Fermer">
              ✕
            </button>
          </header>
          {body}
        </div>
      </div>
    </Show>
  );
}
