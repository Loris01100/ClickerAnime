import type { GameData } from "../../engine/gameState";


export const borutoItems: GameData["items"] = [
  // Uniques : lâchés par les boss. Effets permanents quand équipés.
  {
    id: "item-sceau-nue",
    kind: "unique",
    name: "Sceau du Nue",
    effects: [{ target: "teamDps", kind: "percent", value: 0.5 }],
  },
  {
    id: "item-fruit-chakra",
    kind: "unique",
    name: "Fruit de chakra concentré",
    effects: [{ target: "teamDps", kind: "multiplier", value: 1.8 }],
  },
  {
    id: "item-noyau-akuta",
    kind: "unique",
    name: "Noyau d'Akuta",
    effects: [{ target: "teamDps", kind: "percent", value: 0.6 }],
  },
  {
    id: "item-sept-lames",
    kind: "unique",
    name: "Lame des Sept Épéistes",
    equippableBy: { tags: ["swordsman"] },
    effects: [{ target: "teamDps", kind: "multiplier", value: 1.9 }],
  },
  {
    id: "item-carbone-pur",
    kind: "unique",
    name: "Carbone pur de Deepa",
    equippableBy: { tags: ["kara"] },
    effects: [{ target: "teamDps", kind: "multiplier", value: 2 }],
  },
  {
    id: "item-bras-delta",
    kind: "unique",
    name: "Prothèse de Delta",
    equippableBy: { tags: ["kara"] },
    effects: [{ target: "clickPower", kind: "multiplier", value: 2.2 }],
  },
  {
    id: "item-regeneration-boro",
    kind: "unique",
    name: "Virus régénérateur de Boro",
    effects: [{ target: "teamDps", kind: "percent", value: 0.9 }],
  },
  {
    id: "item-sceptre-isshiki",
    kind: "unique",
    name: "Sceptre d'Isshiki",
    equippableBy: { tags: ["otsutsuki"] },
    effects: [{ target: "teamDps", kind: "multiplier", value: 2.5 }],
  },

  // Communs : un par arc, c'est eux qui montent les passifs des personnages rencontrés là.
  { id: "item-plastron", kind: "common", name: "Plastron d'entraînement de l'Académie" },
  { id: "item-carte-chunin", kind: "common", name: "Carte de participant à l'examen" },
  { id: "item-fragment-akuta", kind: "common", name: "Fragment d'Akuta" },
  { id: "item-eclat-hiramekarei", kind: "common", name: "Éclat d'Hiramekarei" },
  { id: "item-outil-scientifique", kind: "common", name: "Outil ninja scientifique" },
  { id: "item-fragment-vase", kind: "common", name: "Fragment du Vase Sacré" },
  { id: "item-noyau-scientifique", kind: "common", name: "Noyau d'outil scientifique" },
  { id: "item-fragment-karma", kind: "common", name: "Fragment de Karma" },
];
