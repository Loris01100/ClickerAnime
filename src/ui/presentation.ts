import type { Anime } from "../engine/types";

export interface WorldTerms {
  stage: string;
  health: string;
  boss: string;
  clickPower: string;
  teamDps: string;
  encounter: string;
  encounters: string;
}

const DEFAULT_TERMS: WorldTerms = {
  stage: "Combat",
  health: "PV",
  boss: "Boss",
  clickPower: "Clic du Narrateur",
  teamDps: "DPS équipe",
  encounter: "ennemi",
  encounters: "ennemis",
};

/** Keeps alternate genres data-driven instead of branching components on a world id. */
export function termsOf(anime?: Anime): WorldTerms {
  const presentation = anime?.presentation;
  return {
    stage: presentation?.stageLabel ?? DEFAULT_TERMS.stage,
    health: presentation?.healthLabel ?? DEFAULT_TERMS.health,
    boss: presentation?.bossLabel ?? DEFAULT_TERMS.boss,
    clickPower: presentation?.clickPowerLabel ?? DEFAULT_TERMS.clickPower,
    teamDps: presentation?.teamDpsLabel ?? DEFAULT_TERMS.teamDps,
    encounter: presentation?.encounterSingular ?? DEFAULT_TERMS.encounter,
    encounters: presentation?.encounterPlural ?? DEFAULT_TERMS.encounters,
  };
}
