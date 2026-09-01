import {
  For,
  Show,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import type { GameStore } from "../engine/gameState";
import type { Character } from "../engine/types";
import { DUPLICATE_DAMAGE_STEP, MAX_DUPLICATES } from "../engine/packs";
import Sprite from "./Sprite";
import { themeOf } from "./hue";
import Coin from "./Coin";

type Filter = "duplicates" | "all";

/**
 * Le catalogue : une carte par personnage recruté, groupée par monde, montrant combien de doublons
 * sont détenus et ce qu'ils valent. Les packs restent l'écran d'achat ; celui-ci est l'écran de
 * collection — c'est là qu'on lit sa progression vers les {MAX_DUPLICATES} copies, monde par monde.
 * Rien n'est décidé ici : `duplicatesOf` et `packPoolOf` viennent du store, comme dans les packs.
 */
export default function CatalogPanel(props: {
  game: GameStore;
  onClose: () => void;
}) {
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") props.onClose();
  }
  onMount(() => document.addEventListener("keydown", onKeyDown));
  onCleanup(() => document.removeEventListener("keydown", onKeyDown));

  const [filter, setFilter] = createSignal<Filter>("duplicates");

  const animeNameOf = (animeId: string) =>
    props.game.animeOf(animeId)?.name ?? animeId;
  const copiesOf = (character: Character) =>
    props.game.duplicatesOf(character.id);
  const bonusOf = (character: Character) =>
    Math.round(copiesOf(character) * DUPLICATE_DAMAGE_STEP * 100);

  /** Le catalogue ne parle que de personnages recrutés : un pack ne peut sortir personne d'autre. */
  const collected = createMemo(() =>
    props.game
      .ownedCharacters()
      .filter((character) => filter() === "all" || copiesOf(character) > 0)
      .sort(
        (a, b) => copiesOf(b) - copiesOf(a) || a.name.localeCompare(b.name),
      ),
  );

  /** Les mondes représentés, dans l'ordre de la trame plutôt que celui du recrutement. */
  const worlds = createMemo(() =>
    props.game.data.animes.filter((anime) =>
      collected().some((c) => c.animeId === anime.id),
    ),
  );
  const charactersIn = (animeId: string) =>
    collected().filter((c) => c.animeId === animeId);

  const totalCopies = createMemo(() =>
    props.game
      .ownedCharacters()
      .reduce((sum, character) => sum + copiesOf(character), 0),
  );
  const withDuplicates = createMemo(
    () => props.game.ownedCharacters().filter((c) => copiesOf(c) > 0).length,
  );
  const maxed = createMemo(
    () =>
      props.game.ownedCharacters().filter((c) => copiesOf(c) >= MAX_DUPLICATES)
        .length,
  );

  return (
    <div class="overlay" onClick={props.onClose}>
      <div
        class="modal codex-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Catalogue"
        onClick={(e) => e.stopPropagation()}
      >
        <header class="panel-head">
          <span>
            <Coin kind="pack" /> Catalogue
          </span>
          <button onClick={props.onClose} aria-label="Fermer">
            ✕
          </button>
        </header>

        <div class="codex-detail scroll">
          <p class="muted small pad">
            {totalCopies()} doublon{totalCopies() > 1 ? "s" : ""} sur{" "}
            {withDuplicates()} personnage
            {withDuplicates() > 1 ? "s" : ""}, dont {maxed()} au maximum. Chaque
            doublon ajoute {Math.round(DUPLICATE_DAMAGE_STEP * 100)}% des dégâts
            de base du personnage, définitivement.
          </p>

          <div class="tabs">
            <button
              classList={{ active: filter() === "duplicates" }}
              onClick={() => setFilter("duplicates")}
            >
              Doublons ({withDuplicates()})
            </button>
            <button
              classList={{ active: filter() === "all" }}
              onClick={() => setFilter("all")}
            >
              Toute l'équipe ({props.game.ownedCharacters().length})
            </button>
          </div>

          <Show
            when={collected().length > 0}
            fallback={
              <p class="muted pad">
                {filter() === "duplicates"
                  ? "Aucun doublon pour l'instant : ouvrez des packs pour obtenir une seconde copie d'un personnage."
                  : "Aucun personnage recruté pour l'instant."}
              </p>
            }
          >
            <For each={worlds()}>
              {(anime) => (
                <>
                  <header class="panel-head">
                    <span>{anime.name}</span>
                    <span class="muted small">
                      {charactersIn(anime.id).length}
                    </span>
                  </header>
                  <div class="catalog-grid">
                    <For each={charactersIn(anime.id)}>
                      {(character) => (
                        <div
                          class="catalog-card"
                          classList={{
                            maxed: copiesOf(character) >= MAX_DUPLICATES,
                          }}
                          style={{ "--world-hue": themeOf(anime) }}
                        >
                          <Sprite
                            name={character.name}
                            kind="character"
                            anime={animeNameOf(character.animeId)}
                            px={9}
                            dim={copiesOf(character) === 0}
                          />
                          <div class="catalog-card-body">
                            <strong>{character.name}</strong>
                            <span class="muted small">
                              {copiesOf(character) >= MAX_DUPLICATES
                                ? "Collection complète"
                                : `${copiesOf(character)} / ${MAX_DUPLICATES} doublons`}
                            </span>
                            <div
                              class="catalog-bar"
                              role="img"
                              aria-label={`${copiesOf(character)} doublons sur ${MAX_DUPLICATES}`}
                            >
                              <span
                                style={{
                                  width: `${(copiesOf(character) / MAX_DUPLICATES) * 100}%`,
                                }}
                              />
                            </div>
                            <span class="small">
                              +{bonusOf(character)}% dégâts
                            </span>
                          </div>
                          <span class="catalog-count">
                            x{copiesOf(character)}
                          </span>
                        </div>
                      )}
                    </For>
                  </div>
                </>
              )}
            </For>
          </Show>
        </div>
      </div>
    </div>
  );
}
