/** Presentation-only progressive disclosure: facts go in, visible surfaces come out. */
export interface DisclosureFacts {
  kills: number;
  recruits: number;
  ownedCharacters: number;
  unlockedAbilities: number;
  abilitiesActivated: number;
  foundItems: number;
  commonItemsCollected: number;
  bossesKilled: number;
  uniquesEquipped: number;
  arcsCleared: number;
  pendingPrestige: number;
  prestigePoints: number;
  prestiges: number;
  treeLevels: number;
  maxWorldPoints: number;
  packsOpened: number;
  crossoverCrystals: number;
  crossoversActivated: number;
  mixedTeam: boolean;
  canTravel: boolean;
  activeChallenge: boolean;
  completedChallenges: number;
}

export interface DisclosureState {
  team: boolean;
  abilities: boolean;
  items: boolean;
  resources: boolean;
  prestigeResource: boolean;
  packs: boolean;
  crossover: boolean;
  codex: boolean;
  worlds: boolean;
  shop: boolean;
  achievements: boolean;
  prestige: boolean;
  challenges: boolean;
  travel: boolean;
}

export function deriveDisclosure(facts: DisclosureFacts, cheapestPack: number): DisclosureState {
  const team = facts.recruits > 0 || facts.ownedCharacters > 0;
  const prestige =
    facts.pendingPrestige > 0 || facts.prestigePoints > 0 || facts.prestiges > 0 || facts.treeLevels > 0;
  const packs = facts.maxWorldPoints >= cheapestPack || facts.packsOpened > 0;
  const crossover = facts.mixedTeam || facts.crossoverCrystals > 0 || facts.crossoversActivated > 0;
  const items =
    facts.foundItems > 0 ||
    facts.commonItemsCollected > 0 ||
    facts.bossesKilled > 0 ||
    facts.uniquesEquipped > 0;

  return {
    team,
    abilities: facts.unlockedAbilities > 0 || facts.abilitiesActivated > 0,
    items,
    resources: facts.kills > 0 || prestige || packs || crossover,
    prestigeResource: prestige,
    packs,
    crossover,
    codex: team,
    worlds: facts.arcsCleared > 0 || facts.prestiges > 0,
    shop: facts.arcsCleared > 0 || facts.prestiges > 0,
    achievements: team || facts.arcsCleared > 0,
    prestige,
    challenges: facts.prestiges > 0 || facts.activeChallenge || facts.completedChallenges > 0,
    travel: facts.canTravel || facts.prestiges > 0 || facts.prestigePoints > 0,
  };
}
