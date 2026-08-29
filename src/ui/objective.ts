export interface ObjectiveFacts {
  recruits: number;
  arcsCleared: number;
  passiveRanksBought: number;
  arcName: string;
  arcKills: number;
  arcKillsNeeded: number;
  itemName: string;
  itemArcName: string;
  itemCopies: number;
  passiveCharacterName: string;
}

export interface TutorialObjective {
  step: number;
  title: string;
  detail: string;
  progress: number;
  target: number;
}

/** The four-action vocabulary of a fresh run; lifetime counters make it complete only once. */
export function tutorialObjective(facts: ObjectiveFacts): TutorialObjective | null {
  if (facts.recruits < 1) {
    return {
      step: 1,
      title: "Recrute ton premier personnage",
      detail: "Continue de combattre : les héros vaincus peuvent rejoindre ton équipe.",
      progress: facts.recruits,
      target: 1,
    };
  }
  if (facts.arcsCleared < 1) {
    return {
      step: 2,
      title: `Termine ${facts.arcName || "ton premier arc"}`,
      detail: "Atteins le boss, puis bats-le pour ouvrir la suite.",
      progress: Math.min(facts.arcKills, facts.arcKillsNeeded),
      target: facts.arcKillsNeeded,
    };
  }
  if (facts.itemCopies < 6) {
    return {
      step: 3,
      title: `Obtiens 6 copies de ${facts.itemName || "l’objet commun"}`,
      detail: facts.itemArcName
        ? `Combats dans ${facts.itemArcName} pour débloquer un passif.`
        : "Reste dans cet arc pour récupérer assez de copies et débloquer un passif.",
      progress: facts.itemCopies,
      target: 6,
    };
  }
  if (facts.passiveRanksBought < 1) {
    return {
      step: 4,
      title: "Améliore un passif",
      detail: facts.passiveCharacterName
        ? `Dans Équipe, utilise +1 sur ${facts.passiveCharacterName}.`
        : "Dans Équipe, utilise le bouton +1 d’un personnage compatible.",
      progress: facts.passiveRanksBought,
      target: 1,
    };
  }
  return null;
}
