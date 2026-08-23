import { For, Show, createSignal } from "solid-js";
import type { GameStore } from "../engine/gameState";
import PanelTitle from "./PanelTitle";
import Sprite from "./Sprite";
import { IconBookmark, IconDiamond, IconLock, IconShop } from "./icons";

/**
 * Right column, under Prestige: currency purchases — item copies and characters, some gated behind
 * a cleared world. A character offer disappears once bought; item offers stay listed, they stack.
 */
export default function ShopPanel(props: { game: GameStore }) {
  const [open, setOpen] = createSignal(true);
  const animeNameOf = (animeId: string) => props.game.data.animes.find((a) => a.id === animeId)?.name ?? animeId;
  const offers = () => props.game.shopOffers().filter((entry) => !entry.owned);

  return (
    <Show when={offers().length > 0}>
      <section class="panel">
        <header class="panel-head">
          <PanelTitle open={open()} onToggle={() => setOpen(!open())}>
            <IconShop /> Boutique
          </PanelTitle>
          <small class="muted">{offers().length}</small>
        </header>
        <Show when={open()}>
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
        </Show>
      </section>
    </Show>
  );
}
