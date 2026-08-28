import { For, Index, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import type { GameStore } from "../engine/gameState";
import Sprite from "./Sprite";
import { fmt } from "./format";
import Coin from "./Coin";
import ItemIcon from "./ItemIcon";
import { IconLock, IconShop } from "./icons";
import { themeOf } from "./hue";

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
  const entries = createMemo(() => props.game.shopOffers());
  const supplyArcs = createMemo(() =>
    entries()
      .flatMap((entry) => (entry.arc ? [entry.arc] : []))
      .filter((arc, index, arcs) => arcs.findIndex((candidate) => candidate.id === arc.id) === index)
  );
  const [supplyArcId, setSupplyArcId] = createSignal(props.game.activeArc()?.id ?? "");
  const characterOffers = () => entries().filter((entry) => entry.character && !entry.owned);
  const supplyOffers = () => entries().filter((entry) => entry.arc?.id === supplyArcId());
  const animeOf = (animeId: string | undefined) => props.game.data.animes.find((anime) => anime.id === animeId);

  const OfferCard = (rowProps: { entry: () => ReturnType<GameStore["shopOffers"]>[number] }) => {
    const entry = rowProps.entry;
    const character = () => entry().character;
    const item = () => entry().item;
    const amount = () => entry().offer.amount ?? 1;
    const anime = () => animeOf(character()?.animeId ?? entry().arc?.animeId);
    return (
      <article
        class="shop-offer"
        classList={{ locked: entry().locked, unavailable: !entry().locked && !entry().affordable }}
        style={{ "--world-hue": themeOf(anime()) }}
      >
        <div class="shop-offer-visual">
          <Show
            when={character()}
            fallback={<ItemIcon id={item()?.id} kind={item()?.kind ?? "common"} px={48} />}
          >
            {(character) => (
              <Sprite name={character().name} kind="character" anime={animeNameOf(character().animeId)} px={8} />
            )}
          </Show>
          <Show when={!character()}>
            <strong class="shop-amount">x{amount()}</strong>
          </Show>
        </div>

        <div class="shop-offer-copy">
          <h4>{item()?.name ?? character()?.name ?? "—"}</h4>
          <Show
            when={character()}
            fallback={
              <>
                <p>{entry().arc?.name ?? "Ravitaillement"}</p>
                <small class="muted">En réserve : {props.game.countOf(item()?.id ?? "")}</small>
              </>
            }
          >
            {(companion) => (
              <>
                <p>{animeNameOf(companion().animeId)} · Compagnon exclusif</p>
                <small class="muted">
                  {fmt(companion().baseClickPower)} clic · {fmt(companion().baseDps)} DPS
                  <Show when={companion().ability}> · {companion().ability!.name}</Show>
                </small>
              </>
            )}
          </Show>
        </div>

        <div class="shop-offer-action">
          <Show
            when={!entry().locked}
            fallback={
              <div class="shop-lock">
                <IconLock />
                <span>Terminer {animeNameOf(entry().offer.requiresAnimeId!)}</span>
              </div>
            }
          >
            <button
              classList={{ primary: entry().affordable }}
              disabled={!entry().affordable}
              title={entry().discounted ? `Prix de base ${fmt(entry().offer.cost)} — remise « Relations »` : undefined}
              onClick={() => props.game.buyShopOffer(entry().offer.id)}
            >
              <Show when={entry().discounted}>
                <s>{fmt(entry().offer.cost)}</s>{" "}
              </Show>
              Acheter · {fmt(entry().cost)} <Coin kind="gold" />
            </button>
          </Show>
          <Show when={entry().locked}>
            <small class="shop-locked-price muted">
              {fmt(entry().cost)} <Coin kind="gold" />
            </small>
          </Show>
        </div>
      </article>
    );
  };

  const SectionTitle = (sectionProps: { title: string; subtitle: string; count: number }) => (
    <div class="shop-section-title">
      <div>
        <h3>{sectionProps.title}</h3>
        <p>{sectionProps.subtitle}</p>
      </div>
      <span>{sectionProps.count}</span>
    </div>
  );

  return (
    <div class="overlay" onClick={props.onClose}>
      <div class="modal shop-modal" role="dialog" aria-modal="true" aria-label="Boutique" onClick={(e) => e.stopPropagation()}>
        <header class="panel-head">
          <span>
            <IconShop /> Boutique
          </span>
          <span class="shop-head-actions">
            <span class="shop-balance">
              <small>Solde</small>
              <strong>{fmt(props.game.currency())}</strong>
              <Coin kind="gold" px={18} />
            </span>
            <button onClick={props.onClose} aria-label="Fermer">
              ✕
            </button>
          </span>
        </header>

        <div class="shop-body scroll">
          <Show when={characterOffers().length > 0}>
            <section class="shop-section">
              <SectionTitle
                title="Compagnons"
                subtitle="Des alliés exclusifs qui rejoignent définitivement votre équipe."
                count={characterOffers().length}
              />
              <div class="shop-grid companions">
                {/* Currency changes during combat; Index preserves the button between pointer down/up. */}
                <Index each={characterOffers()}>{(entry) => <OfferCard entry={entry} />}</Index>
              </div>
            </section>
          </Show>
          <Show when={supplyArcs().length > 0}>
            <section class="shop-section">
              <div class="shop-supply-head">
                <SectionTitle
                  title="Ravitaillement"
                  subtitle="Achetez les objets communs d'un arc pour renforcer ses passifs."
                  count={supplyOffers().length}
                />
                <select
                  aria-label="Arc à ravitailler"
                  value={supplyArcId()}
                  onChange={(event) => setSupplyArcId(event.currentTarget.value)}
                >
                  <For each={supplyArcs()}>
                    {(arc) => <option value={arc.id}>{animeNameOf(arc.animeId)} · {arc.name}</option>}
                  </For>
                </select>
              </div>
              <div class="shop-grid supplies">
                <Index each={supplyOffers()}>{(entry) => <OfferCard entry={entry} />}</Index>
              </div>
            </section>
          </Show>
          <Show when={characterOffers().length === 0 && supplyOffers().length === 0}>
            <p class="muted pad">Plus rien à acheter pour l'instant.</p>
          </Show>
        </div>
      </div>
    </div>
  );
}
