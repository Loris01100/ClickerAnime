import type { DisclosureState } from "./disclosure";

/** Turns newly visible surfaces into short, player-facing announcements. */
export function newlyUnlocked(previous: DisclosureState, current: DisclosureState): string[] {
  const messages: string[] = [];
  if (!previous.resources && current.resources) messages.push("Ressources débloquées");
  if (!previous.team && current.team) messages.push("Équipe et Codex débloqués");
  if (!previous.abilities && current.abilities) messages.push("Capacités débloquées");
  if (!previous.items && current.items) messages.push("Collection d’objets débloquée");
  if ((!previous.worlds && current.worlds) || (!previous.shop && current.shop)) {
    messages.push("Portail des mondes et boutique débloqués");
  }
  if (!previous.prestige && current.prestige) messages.push("Prestige débloqué");
  if (!previous.packs && current.packs) messages.push("Packs débloqués");
  if (!previous.crossover && current.crossover) messages.push("Crossover débloqué");
  if (!previous.challenges && current.challenges) messages.push("Défis débloqués");
  return messages;
}
