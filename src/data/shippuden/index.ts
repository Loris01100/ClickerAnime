// Naruto Shippūden — deuxième monde, le climax de la saga Naruto. Aucun personnage de la partie 1
// n'y est recrutable : uniquement des nouvelles têtes. Quelques visages de la partie 1 (Naruto,
// Sakura, Gaara) y évoluent en une version plus forte d'eux-mêmes — voir `Character.evolution` — mais
// ça ne les rend pas recrutables ici : ce sont toujours les mêmes fiches Codex, pas de nouvelles.
// Long à finir, c'est voulu (15 arcs). Trois rampes par arc, à conserver en cas d'édition : les pv
// de boss montent d'un facteur ~2,5, ceux des mobs ~2,33, les récompenses et les stats des recrues
// ~1,85. Les deux premières suivent la vitesse à laquelle le dps de l'équipe grimpe réellement
// (~2,53/arc, mesurée au simulateur) ; la troisième est restée telle quelle, donc l'économie n'a pas
// bougé. Le pourquoi et l'historique de réglage sont dans `docs/combat.md`.
import type { GameData } from "../../engine/gameState";
import { shippudenArcs } from "./arcs";
import { shippudenCharacters } from "./characters";
import { shippudenItems } from "./items";

export const shippudenData: GameData = {
  animes: [
    {
      id: "shippuden",
      name: "Naruto Shippūden",
      requiresAnimeId: "naruto",
      mapImage: "/naruto-map.jpg",
      unlockCost: 8,
      themeHue: 350, // le rouge sombre de la guerre ninja

      description:
        "Deux ans et demi plus tard, Naruto revient de son entraînement pour affronter l'Akatsuki. " +
        "Le climax de la saga : 15 arcs, aucun visage de la partie 1 à recruter, uniquement de " +
        "nouvelles têtes — et une difficulté qui explose.",
    },
  ],

  arcs: shippudenArcs,
  characters: shippudenCharacters,
  items: shippudenItems,
};
