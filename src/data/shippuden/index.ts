// Naruto Shippūden — deuxième monde, le climax de la saga Naruto. Aucun personnage de la partie 1
// n'y est recrutable : uniquement des nouvelles têtes. Quelques visages de la partie 1 (Naruto,
// Sakura, Gaara) y évoluent en une version plus forte d'eux-mêmes — voir `Character.evolution` — mais
// ça ne les rend pas recrutables ici : ce sont toujours les mêmes fiches Codex, pas de nouvelles.
// Long à finir, c'est voulu (15 arcs). Les hp, récompenses et stats des recrues montent d'un facteur
// ~1,85 par arc, donc le rythme reste tenable alors que les nombres explosent.
import type { GameData } from "../../engine/gameState";
import { shippudenArcs } from "./arcs";
import { shippudenCharacters } from "./characters";
import { shippudenItems } from "./items";
import { shippudenCombos } from "./combos";

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
  combos: shippudenCombos,
};
