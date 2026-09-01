// Boruto : Naruto Next Generations — troisième monde, le dernier et le plus dur. Aucun personnage
// des deux mondes précédents n'y est recrutable : uniquement la nouvelle génération, Kara et les
// Ôtsutsuki. Quelques visages de Shippûden (Saï, Yamato, Ônoki, Killer Bee, Mei) y évoluent en une
// version plus forte d'eux-mêmes — voir `Character.evolutions` — sans devenir de nouvelles recrues.
//
// Le nom affiché est volontairement le nom court. `design.md` avait relevé qu'un
// « Boruto : Naruto Next Generations » ne tient dans aucune largeur raisonnable de portail, et
// listait trois issues : ellipse, deux lignes, ou nom court dans les données. C'est la troisième :
// elle ne coûte ni champ de plus au type `Anime` ni cas particulier dans le CSS, et un monde reste
// identifié par un nom entier, jamais tronqué.
//
// Huit arcs, générés depuis une table comme Shippûden, mais sur ses propres rampes : les pv de boss
// montent d'un facteur ~2,55 par arc et ceux des mobs ~2,45, contre ~2,5 et ~2,33 dans Shippûden.
// C'est plus raide parce que l'équipe arrive ici avec soixante personnages et grimpe plus vite —
// la rampe se mesure au simulateur, elle ne se recopie pas. Récompenses et stats des recrues
// gardent le ~1,85 commun aux trois mondes. Voir `docs/combat.md`.
import type { GameData } from "../../engine/gameState";
import { borutoArcs } from "./arcs";
import { borutoCharacters } from "./characters";
import { borutoItems } from "./items";

export const borutoData: GameData = {
  animes: [
    {
      id: "boruto",
      name: "Boruto",
      requiresAnimeId: "shippuden",
      mapImage: "/naruto-map.jpg",
      unlockCost: 15,
      themeHue: 205, // le bleu froid du Karma et des outils scientifiques

      description:
        "La génération suivante. Boruto grandit dans l'ombre d'un père devenu Hokage, pendant qu'une " +
        "organisation venue d'ailleurs, Kara, cherche le Vase. Huit arcs, une nouvelle Équipe 7, et " +
        "des adversaires qui ne se battent plus du tout comme des ninjas.",
    },
  ],

  arcs: borutoArcs,
  characters: borutoCharacters,
  items: borutoItems,
};
