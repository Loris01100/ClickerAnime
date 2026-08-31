import type { GameData } from "../engine/gameState";
import type { BossTrait } from "../engine/types";

/*
 * A small rotating vocabulary keeps every boss mechanically readable without asking each world
 * author to rewrite percentages by hand. Bespoke story traits in an arc always win over these
 * defaults (Zabuza, Hisoka and Renji are the first examples).
 *
 * The numbers stay deliberately mild: traits should change the best response to a boss, not move
 * the world's balance wall by an entire arc. Stronger exceptions remain authored beside the boss.
 */
const GENERAL_TRAITS: readonly BossTrait[] = [
  {
    kind: "click-resistance",
    name: "Esquive instinctive",
    description: "Les clics du Narrateur infligent 20 % de dégâts en moins ; le DPS reste intact.",
    multiplier: 0.8,
  },
  {
    kind: "dps-resistance",
    name: "Pression écrasante",
    description: "Le DPS automatique de l’équipe est réduit de 10 % ; les clics restent intacts.",
    multiplier: 0.9,
  },
  {
    kind: "shield",
    name: "Défense renforcée",
    description: "Le boss commence le combat avec 10 % de PV supplémentaires.",
    multiplier: 0.1,
  },
  {
    kind: "click-resistance",
    name: "Lecture du combat",
    description: "Les clics du Narrateur infligent 25 % de dégâts en moins ; le DPS reste intact.",
    multiplier: 0.75,
  },
  {
    kind: "dps-resistance",
    name: "Aura dominante",
    description: "Le DPS automatique de l’équipe est réduit de 15 % ; les clics restent intacts.",
    multiplier: 0.85,
  },
  {
    kind: "shield",
    name: "Seconde forme",
    description: "Le boss commence le combat avec 15 % de PV supplémentaires.",
    multiplier: 0.15,
  },
];

/** Gives every otherwise plain boss one mild trait; `offset` avoids identical world sequences. */
export function withBossTraits(arcs: GameData["arcs"], offset = 0): GameData["arcs"] {
  let previousTimer = 0;
  return arcs.map((arc) => {
    if (arc.boss.bossTrait) {
      previousTimer = Math.max(previousTimer, arc.boss.timerMs ?? 0);
      return arc;
    }
    const preset = GENERAL_TRAITS[(arc.order + offset) % GENERAL_TRAITS.length];
    // Preserve the old automatic-DPS margin: resistance and extra hp lengthen the fight, so the
    // clock grows by the same factor. Active clicking is still the faster counter, while a mild
    // default trait cannot turn a previously winnable boss into a progression wall.
    const timerFactor =
      preset.kind === "dps-resistance" ? 1 / preset.multiplier : preset.kind === "shield" ? 1 + preset.multiplier : 1;
    const adjustedTimer = arc.boss.timerMs
      ? Math.ceil((arc.boss.timerMs * timerFactor) / 5_000) * 5_000
      : undefined;
    const timerMs = adjustedTimer === undefined ? undefined : Math.max(previousTimer, adjustedTimer);
    previousTimer = Math.max(previousTimer, timerMs ?? 0);
    return { ...arc, boss: { ...arc.boss, timerMs, bossTrait: { ...preset } } };
  });
}
