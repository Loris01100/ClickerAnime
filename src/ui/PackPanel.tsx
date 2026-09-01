import { For, Show, createSignal, onCleanup, onMount } from "solid-js";
import type { GameStore, PackDraw } from "../engine/gameState";
import type { Rarity } from "../engine/types";
import {
  PACK_COST,
  DUPLICATE_DAMAGE_STEP,
  MAX_DUPLICATES,
} from "../engine/packs";
import Sprite from "./Sprite";
import { themeOf } from "./hue";
import Coin from "./Coin";

/**
 * Packs, an overlay like the shop: one bucket of points per world, spent on a random draw from
 * that world's cast. A duplicate is the only way to get a character again — beating their arc a
 * second time never gives one — and every copy makes them hit harder, up to `MAX_DUPLICATES`.
 * A character at the cap leaves the pool, so a world whose whole cast is capped sells no pack.
 */
export default function PackPanel(props: {
  game: GameStore;
  onClose: () => void;
  onOpenCatalog: () => void;
}) {
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") props.onClose();
  }
  onMount(() => document.addEventListener("keydown", onKeyDown));
  onCleanup(() => document.removeEventListener("keydown", onKeyDown));

  const [drawn, setDrawn] = createSignal<PackDraw[]>([]);
  const [qty, setQty] = createSignal(1);

  const animeNameOf = (animeId: string) =>
    props.game.animeOf(animeId)?.name ?? animeId;

  /** Worlds worth showing: one currently travelled to, or one still holding points from a past run. */
  const worlds = () =>
    props.game.data.animes.filter(
      (a) =>
        props.game.worldPointsOf(a.id) > 0 ||
        props.game.prestige().unlockedAnimeIds.includes(a.id),
    );

  /** Combien de personnages de ce monde sont recrutés — ce qui distingue un pool vide d'un pool épuisé. */
  const recruitedIn = (animeId: string) =>
    props.game.ownedCharacters().filter((c) => c.animeId === animeId).length;

  const duplicates = () =>
    props.game.data.characters
      .filter((c) => props.game.duplicatesOf(c.id) > 0)
      .sort(
        (a, b) => props.game.duplicatesOf(b.id) - props.game.duplicatesOf(a.id),
      );

  /**
   * Combien de packs les points en caisse paient réellement, plafonné à `qty` — le prix affiché sur
   * le bouton, et pas `PACK_COST × qty` : annoncer dix packs pour en ouvrir un est exactement le
   * décalage prix affiché / prix débité que la boutique a déjà corrigé (voir `shopOffers`).
   */
  const affordableCount = (animeId: string, rarity: Rarity) =>
    Math.min(qty(), Math.floor(props.game.worldPointsOf(animeId) / PACK_COST[rarity]));

  /**
   * Achète jusqu'à `qty` packs d'affilée ; `openPack` s'arrête de lui-même quand les points
   * manquent. La boucle va bien jusqu'à `qty` et non jusqu'à `affordableCount` : « Carte blanche »
   * peut rendre les points d'un tirage, et un pack offert en paie donc un de plus.
   */
  function buy(animeId: string, rarity: Rarity) {
    const results: PackDraw[] = [];
    for (let i = 0; i < qty(); i++) {
      const draw = props.game.openPack(animeId, rarity);
      if (!draw) break;
      results.push(draw);
    }
    if (results.length > 0) setDrawn(results);
  }

  return (
    <div class="overlay" onClick={props.onClose}>
      <div
        class="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Packs"
        onClick={(e) => e.stopPropagation()}
      >
        <header class="panel-head">
          <span>
            <Coin kind="pack" /> Packs
          </span>
          <button onClick={props.onClose} aria-label="Fermer">
            ✕
          </button>
        </header>

        <div class="codex-detail scroll">
          <p class="muted small pad">
            Un point par combat gagné, dans le monde où il a été gagné. Chaque
            doublon ajoute {Math.round(DUPLICATE_DAMAGE_STEP * 100)}% des dégâts
            de base du personnage — clic et DPS — jusqu'à {MAX_DUPLICATES}{" "}
            doublons. Seuls les personnages déjà recrutés, et pas encore au
            maximum, peuvent sortir d'un pack.
          </p>

          <div class="row">
            <span class="name">Packs par achat</span>
            <select
              value={qty()}
              title="Nombre de packs par achat"
              onChange={(e) => setQty(Number(e.currentTarget.value))}
            >
              <For each={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}>
                {(n) => <option value={n}>x{n}</option>}
              </For>
            </select>
          </div>

          <For each={drawn()}>
            {(draw) => (
              <div
                class="pack-result"
                style={{
                  "--world-hue": themeOf(
                    props.game.animeOf(draw.character.animeId) ?? undefined,
                  ),
                }}
              >
                <Sprite
                  name={draw.character.name}
                  kind="character"
                  anime={animeNameOf(draw.character.animeId)}
                  px={9}
                />
                <div>
                  <strong>{draw.character.name}</strong>
                  <div class="muted small">
                    x{props.game.duplicatesOf(draw.character.id)} —{" "}
                    {animeNameOf(draw.character.animeId)}
                  </div>
                </div>
                {/* Un pack offert qui ne le dit pas est indiscernable d'un nœud qui ne marche pas. */}
                <Show when={draw.free}>
                  <span class="pack-result-free">Carte blanche — offert</span>
                </Show>
              </div>
            )}
          </For>

          <For each={worlds()}>
            {(anime) => (
              <div class="row">
                <span class="name">{anime.name}</span>
                <span class="muted small">
                  {props.game.worldPointsOf(anime.id)} <Coin kind="pack" />
                </span>
                <For each={["main", "secondary"] as const}>
                  {(rarity) => (
                    <Show
                      when={props.game.packPoolOf(anime.id, rarity).length > 0}
                    >
                      <button
                        disabled={affordableCount(anime.id, rarity) === 0}
                        onClick={() => buy(anime.id, rarity)}
                      >
                        {rarity === "main" ? "Principaux" : "Secondaires"} —{" "}
                        {PACK_COST[rarity] *
                          Math.max(1, affordableCount(anime.id, rarity))}
                      </button>
                    </Show>
                  )}
                </For>
                <Show
                  when={
                    props.game.packPoolOf(anime.id, "main").length === 0 &&
                    props.game.packPoolOf(anime.id, "secondary").length === 0
                  }
                >
                  {/* Deux raisons d'avoir un pool vide : personne de recruté, ou tout le monde au plafond. */}
                  <span class="muted small">
                    {recruitedIn(anime.id) === 0
                      ? "Recrutez un personnage de cet anime pour ouvrir ses packs."
                      : `Tous les personnages recrutés ici sont à ${MAX_DUPLICATES} doublons.`}
                  </span>
                </Show>
              </div>
            )}
          </For>

          <Show when={worlds().length === 0}>
            <p class="muted pad">Aucun monde visité pour l'instant.</p>
          </Show>

          <Show when={duplicates().length > 0}>
            {/* La collection se lit dans le catalogue : ici on achète, là-bas on regarde. */}
            <div class="row">
              <span class="name">
                Doublons détenus{" "}
                <span class="muted small">
                  ({duplicates().length} personnages)
                </span>
              </span>
              <button onClick={props.onOpenCatalog}>Voir le catalogue</button>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
}
