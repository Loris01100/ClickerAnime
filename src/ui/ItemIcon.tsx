import { asset } from "./asset";

const ITEM_ART: Record<string, string> = {
  "item-argile": "item-argile.png",
  "item-barre": "item-barre.png",
  "item-bandeau": "item-bandeau.png",
  "item-bras-delta": "item-bras-delta.png",
  "item-bras": "item-bras.png",
  "item-carte-chunin": "item-carte-chunin.png",
  "item-carbone-pur": "item-carbone-pur.png",
  "item-collier": "item-collier.png",
  "item-coeur": "item-coeur.png",
  "item-ecaille": "item-ecaille.png",
  "item-eclat-bois": "item-eclat-bois.png",
  "item-eclat-hiramekarei": "item-eclat-hiramekarei.png",
  "item-eclat-lune": "item-eclat-lune.png",
  "item-fil": "item-fil.png",
  "item-fiole": "item-fiole.png",
  "item-fragment-akuta": "item-fragment-akuta.png",
  "item-fragment-dimension": "item-fragment-dimension.png",
  "item-fragment-karma": "item-fragment-karma.png",
  "item-fragment-lame": "item-fragment-lame.png",
  "item-fragment-vase": "item-fragment-vase.png",
  "item-graine": "item-graine.png",
  "item-gunbai": "item-gunbai.png",
  "item-insigne": "item-insigne.png",
  "item-kusanagi": "item-kusanagi.png",
  "item-kotoamatsukami": "item-kotoamatsukami.png",
  "item-lame": "item-lame.png",
  "item-lunettes": "item-lunettes.png",
  "item-masque-coeur": "item-masque-coeur.png",
  "item-masque-spirale": "item-masque-spirale.png",
  "item-message": "item-message.png",
  "item-mue": "item-mue.png",
  "item-note-espion": "item-note-espion.png",
  "item-noyau-scientifique": "item-noyau-scientifique.png",
  "item-outil-scientifique": "item-outil-scientifique.png",
  "item-parchemin": "item-parchemin.png",
  "item-parchemin-crapaud": "item-parchemin-crapaud.png",
  "item-pari": "item-pari.png",
  "item-pilule": "item-pilule.png",
  "item-plastron": "item-plastron.png",
  "item-plume": "item-plume.png",
  "item-ration": "item-ration.png",
  "item-recepteur": "item-recepteur.png",
  "item-samehada": "item-samehada.png",
  "item-sceau-kage": "item-sceau-kage.png",
  "item-shuriken": "item-shuriken.png",
  "item-talisman": "item-talisman.png",
  "item-tenseigan": "item-tenseigan.png",
  "item-kubikiri": "item-kubikiri.png",
  "item-fruit": "item-fruit.png",
  "item-fruit-chakra": "item-fruit-chakra.png",
  "item-noyau-akuta": "item-noyau-akuta.png",
  "item-regeneration-boro": "item-regeneration-boro.png",
  "item-sceau-nue": "item-sceau-nue.png",
  "item-sceptre-isshiki": "item-sceptre-isshiki.png",
  "item-sept-lames": "item-sept-lames.png",
  "item-susanoo": "item-susanoo.png",
};

export const itemImagePath = (id: string | undefined, kind: "common" | "unique") =>
  `/items/${(id && ITEM_ART[id]) ?? (kind === "unique" ? "unique-loot.png" : "common-loot.png")}`;

/**
 * Uses bespoke art when the item has one, otherwise keeps the common/unique fallback.
 */
export default function ItemIcon(props: { id?: string; kind: "common" | "unique"; px?: number }) {
  return (
    <img
      class="item-icon"
      src={asset(itemImagePath(props.id, props.kind))}
      style={props.px ? { height: `${props.px}px` } : undefined}
      alt=""
    />
  );
}
