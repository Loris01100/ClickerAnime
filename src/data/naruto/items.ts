import type { GameData } from "../../engine/gameState";


export const narutoItems: GameData["items"] = [
  // Uniques : un seul exemplaire, lâché à coup sûr par un boss. Effets permanents quand équipés.
  {
    id: "item-kubikiri",
    kind: "unique",
    name: "Kubikiribôchô, l'épée du décapiteur",
    effects: [{ target: "teamDps", kind: "multiplier", value: 1.25 }],
  },
  {
    id: "item-bandeau",
    kind: "unique",
    name: "Bandeau frontal fissuré",
    effects: [{ target: "clickPower", kind: "multiplier", value: 1.2 }],
  },
  {
    id: "item-kusanagi",
    kind: "unique",
    name: "Épée de Kusanagi",
    effects: [{ target: "clickPower", kind: "multiplier", value: 1.4 }],
  },
  {
    id: "item-lunettes",
    kind: "unique",
    name: "Lunettes de Kabuto",
    effects: [{ target: "teamDps", kind: "percent", value: 0.22 }],
  },
  {
    id: "item-collier",
    kind: "unique",
    name: "Collier du Premier Hokage",
    effects: [{ target: "teamDps", kind: "multiplier", value: 1.3 }],
  },
  // Communs : ils s'empilent et font monter les passifs des personnages rencontrés dans leur arc.
  { id: "item-shuriken", kind: "common", name: "Shuriken émoussé" },
  { id: "item-parchemin", kind: "common", name: "Parchemin du Ciel" },
  { id: "item-ration", kind: "common", name: "Ration militaire" },
  { id: "item-pari", kind: "common", name: "Ticket de pari perdant" },
  { id: "item-pilule", kind: "common", name: "Pilule du Clan Akimichi" },
];
