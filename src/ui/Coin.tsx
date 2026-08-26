import { asset } from "./asset";

/**
 * La pastille d'une monnaie, en image (`public/resources/`). Un seul composant pour les quatre :
 * une monnaie doit se reconnaître au même dessin partout — le compteur de la `CurrencyBar`, le prix
 * d'un article, le solde en tête d'un panneau — sinon on ne sait plus ce qu'on dépense.
 * `px` monte la taille là où la pastille est le sujet (un solde), la défaut suit le texte voisin.
 */
const FILE = {
  gold: "currency-gold.png",
  prestige: "prestige.png",
  crystal: "crossover-crystal.png",
  pack: "pack-points.png",
};

export default function Coin(props: { kind: keyof typeof FILE; px?: number }) {
  return (
    <img
      class="coin"
      src={asset(`/resources/${FILE[props.kind]}`)}
      style={props.px ? { height: `${props.px}px` } : undefined}
      alt=""
    />
  );
}
