import { asset } from "./asset";

const ITEM_ART: Record<string, string> = {
  "item-bandeau": "item-bandeau.png",
  "item-collier": "item-collier.png",
  "item-kusanagi": "item-kusanagi.png",
  "item-lunettes": "item-lunettes.png",
  "item-parchemin": "item-parchemin.png",
  "item-pari": "item-pari.png",
  "item-pilule": "item-pilule.png",
  "item-ration": "item-ration.png",
  "item-shuriken": "item-shuriken.png",
  "item-kubikiri": "item-kubikiri.png",
};

/**
 * Uses bespoke art when the item has one, otherwise keeps the common/unique fallback.
 */
export default function ItemIcon(props: { id?: string; kind: "common" | "unique"; px?: number }) {
  const file = () =>
    (props.id && ITEM_ART[props.id]) ?? (props.kind === "unique" ? "unique-loot.png" : "common-loot.png");

  return (
    <img
      class="item-icon"
      src={asset(`/items/${file()}`)}
      style={props.px ? { height: `${props.px}px` } : undefined}
      alt=""
    />
  );
}
