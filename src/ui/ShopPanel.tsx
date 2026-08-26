import { For, Show, onCleanup, onMount } from "solid-js";
import type { GameStore } from "../engine/gameState";
import Sprite from "./Sprite";
import { fmt } from "./format";
import Coin from "./Coin";
import ItemIcon from "./ItemIcon";
import { IconLock, IconShop } from "./icons";

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
            {fmt(props.game.currency())} <Coin kind="gold" />
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
                  <Show
                    when={entry.character}
                    fallback={<ItemIcon id={entry.item?.id} kind={entry.item?.kind ?? "common"} px={30} />}
                  >
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
                  {/* `entry.cost` is the discounted price, i.e. the one actually charged — see
                      gameState's shopOffers. The old price is struck through next to it so the
                      "Relations" node can be seen doing something. */}
                  <button
                    disabled={!entry.affordable}
                    title={entry.discounted ? `Prix de base ${fmt(entry.offer.cost)} — remise « Relations »` : undefined}
                    onClick={() => props.game.buyShopOffer(entry.offer.id)}
                  >
                    <Show when={entry.discounted}>
                      <s class="muted">{fmt(entry.offer.cost)}</s>{" "}
                    </Show>
                    {fmt(entry.cost)} <Coin kind="gold" />
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
