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
