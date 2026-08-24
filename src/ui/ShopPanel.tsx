import { For, Show, onCleanup, onMount } from "solid-js";
import type { GameStore } from "../engine/gameState";
import Sprite from "./Sprite";
import { fmt } from "./format";
import { IconBookmark, IconDiamond, IconLock, IconShop } from "./icons";

/**
 * The shop, an overlay like the world portal rather than a column panel: currency purchases — item
 * copies and characters, some gated behind a cleared world. A character offer disappears once
 * bought; item offers stay listed, they stack.
 */
export default function ShopPanel(props: { game: GameStore; onClose: () => void }) {
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") props.onClose();
  }
  onMount(() => document.addEventListener("keydown", onKeyDown));
  onCleanup(() => document.removeEventListener("keydown", onKeyDown));

  const animeNameOf = (animeId: string) => props.game.data.animes.find((a) => a.id === animeId)?.name ?? animeId;
  const offers = () => props.game.shopOffers().filter((entry) => !entry.owned);

  return (
    <div class="overlay" onClick={props.onClose}>
      <div class="modal" role="dialog" aria-modal="true" aria-label="Boutique" onClick={(e) => e.stopPropagation()}>
        <header class="panel-head">
          <span>
            <IconShop /> Boutique
          </span>
          <span class="muted">
            {fmt(props.game.currency())} <IconDiamond class="coin gold" />
            <button onClick={props.onClose} aria-label="Fermer">
              ✕
            </button>
          </span>
        </header>

        <div class="codex-detail scroll">
          <For each={offers()}>
            {(entry) => (
              <div class="row">
                <span class="name">
                  <Show when={entry.character} fallback={<IconBookmark class="blue" />}>
                    {(character) => (
                      <Sprite name={character().name} kind="character" anime={animeNameOf(character().animeId)} px={5} />
                    )}
                  </Show>
                  {entry.item?.name ?? entry.character?.name ?? "—"}
                  <Show when={entry.offer.kind === "item" && (entry.offer.amount ?? 1) > 1}>
                    {" "}x{entry.offer.amount}
                  </Show>
                </span>
                <Show
                  when={!entry.locked}
                  fallback={
                    <small class="muted small">
                      <IconLock /> {animeNameOf(entry.offer.requiresAnimeId!)}
                    </small>
                  }
                >
                  <button disabled={!entry.affordable} onClick={() => props.game.buyShopOffer(entry.offer.id)}>
                    {entry.offer.cost} <IconDiamond class="coin gold" />
                  </button>
                </Show>
              </div>
            )}
          </For>
          <Show when={offers().length === 0}>
            <p class="muted pad">Plus rien à acheter pour l'instant.</p>
          </Show>
        </div>
      </div>
    </div>
  );
}
