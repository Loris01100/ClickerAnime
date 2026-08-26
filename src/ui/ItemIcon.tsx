import { asset } from "./asset";

/**
 * La marque d'un objet, en image (`public/items/`), déclinée sur la seule chose qui distingue deux
 * objets à l'œil : commun (un passif qu'on empile) ou unique (un équipement). Même raison d'être que
 * `Coin.tsx` — un objet doit se reconnaître au même dessin dans le Codex, la fiche d'un personnage
 * et la boutique.
 */
export default function ItemIcon(props: { kind: "common" | "unique"; px?: number }) {
  return (
    <img
      class="item-icon"
      src={asset(props.kind === "unique" ? "/items/unique-loot.png" : "/items/common-loot.png")}
      style={props.px ? { height: `${props.px}px` } : undefined}
      alt=""
    />
  );
}
