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
  "hxh-item-badge": "hxh-item-badge.png",
  "hxh-item-ticket": "hxh-item-ticket.png",
  "hxh-item-catalogue": "hxh-item-catalogue.png",
  "hxh-item-carte-sort": "hxh-item-carte-sort.png",
  "hxh-item-ecaille": "hxh-item-ecaille.png",
  "hxh-item-bulletin": "hxh-item-bulletin.png",
  "hxh-item-licence-triple": "hxh-item-licence-triple.png",
  "hxh-item-rose": "hxh-item-rose.png",
  "hxh-item-blue-planet": "hxh-item-blue-planet.png",
  "hxh-item-skill-hunter": "hxh-item-skill-hunter.png",
  "hxh-item-fil-nen": "hxh-item-yeux-ecarlates.png",
  "hxh-item-carte-joker": "hxh-item-carte-joker.png",
  "bleach-item-insigne": "bleach-item-insigne.png",
  "bleach-item-laissez-passer": "bleach-item-laissez-passer.png",
  "bleach-item-poupee": "bleach-item-poupee.png",
  "bleach-item-fragment-masque": "bleach-item-fragment-masque.png",
  "bleach-item-sable": "bleach-item-sable.png",
  "bleach-item-eclat-espada": "bleach-item-eclat-espada.png",
  "bleach-item-sceau-kasumioji": "bleach-item-sceau-kasumioji.png",
  "bleach-item-plume-exequias": "bleach-item-plume-exequias.png",
  "bleach-item-carnet": "bleach-item-carnet.png",
  "bleach-item-pilier": "bleach-item-pilier.png",
  "bleach-item-fourreau": "bleach-item-fourreau.png",
  "bleach-item-eclat-hogyoku": "bleach-item-eclat-hogyoku.png",
  "bleach-item-noyau-reigai": "bleach-item-noyau-reigai.png",
  "bleach-item-catalyseur": "bleach-item-catalyseur.png",
  "bleach-item-croix-quincy": "bleach-item-croix-quincy.png",
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
