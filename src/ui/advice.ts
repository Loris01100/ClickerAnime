import { assertNever } from "../engine/assert";
import type { BossTraitKind } from "../engine/types";

export interface BossAdviceFacts {
  teamSize: number;
  affordablePassive: boolean;
  equippableUnique: boolean;
  readyAbility: boolean;
  isActiveArc: boolean;
}

export interface BossAdvice {
  short: string;
  detail: string;
}

/** Concrete response to the authored trait, kept beside the dynamic upgrade advice. */
export function bossTraitCounter(kind: BossTraitKind): string {
  switch (kind) {
    case "click-resistance":
      return "Mise sur le DPS de l’équipe : tes clics seront réduits.";
    case "dps-resistance":
      return "Clique activement : le Clic du Narrateur garde toute sa force.";
    case "shield":
      return "Prépare un pic de dégâts : le boss possède davantage de PV.";
    default:
      return assertNever(kind);
  }
}

/** Turns a failed boss estimate into the next concrete action already available to the player. */
export function bossAdvice(facts: BossAdviceFacts): BossAdvice {
  if (facts.teamSize === 0) {
    return { short: "Recrute un héros", detail: "Continue de combattre pour former une première équipe." };
  }
  if (facts.affordablePassive) {
    return { short: "Améliore un passif", detail: "Une amélioration +1 est déjà disponible dans Équipe." };
  }
  if (facts.equippableUnique) {
    return { short: "Équipe un objet", detail: "Un objet unique attend un porteur dans Équipe." };
  }
  if (facts.readyAbility && facts.isActiveArc) {
    return { short: "Lance une capacité", detail: "Une capacité est prête dans le panneau Capacités." };
  }
  if (!facts.isActiveArc) {
    return { short: "Farme l’arc actuel", detail: "Gagne des niveaux avant de revenir défier ce boss." };
  }
  return { short: "Gagne des niveaux", detail: "Reste dans cet arc pour renforcer toute l’équipe." };
}
