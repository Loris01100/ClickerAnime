import { asset } from "./asset";

const ITEM_ART: Record<string, string> = {
  "item-bandeau": "item-bandeau.png",
  "item-collier": "item-collier.png",
  "item-ecaille": "item-ecaille.png",
  "item-eclat-bois": "item-eclat-bois.png",
  "item-eclat-lune": "item-eclat-lune.png",
  "item-fil": "item-fil.png",
  "item-fragment-dimension": "item-fragment-dimension.png",
  "item-fragment-lame": "item-fragment-lame.png",
  "item-graine": "item-graine.png",
  "item-insigne": "item-insigne.png",
  "item-kusanagi": "item-kusanagi.png",
  "item-lame": "item-lame.png",
  "item-lunettes": "item-lunettes.png",
  "item-masque-coeur": "item-masque-coeur.png",
  "item-note-espion": "item-note-espion.png",
  "item-parchemin": "item-parchemin.png",
  "item-parchemin-crapaud": "item-parchemin-crapaud.png",
  "item-pari": "item-pari.png",
  "item-pilule": "item-pilule.png",
  "item-plume": "item-plume.png",
  "item-ration": "item-ration.png",
  "item-recepteur": "item-recepteur.png",
  "item-shuriken": "item-shuriken.png",
  "item-talisman": "item-talisman.png",
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
