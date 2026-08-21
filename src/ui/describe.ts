import type { AbilityDefinition, ModifierTemplate } from "../engine/types";
import { fmt, seconds } from "./format";

const TARGET_LABEL: Record<ModifierTemplate["target"], string> = {
  clickPower: "au clic",
  teamDps: "de DPS",
};

/** Plain-French wording for one modifier, used by the codex and the ability tooltips. */
export function describeModifier(modifier: ModifierTemplate): string {
  const target = TARGET_LABEL[modifier.target];
  switch (modifier.kind) {
    case "flat":
      return `+${fmt(modifier.value)} ${target}`;
    case "percent":
      return `+${Math.round(modifier.value * 100)} % ${target}`;
    case "multiplier":
      return `x${modifier.value} ${target}`;
  }
}

export function describeAbility(ability: AbilityDefinition): string {
  const effects = ability.effects.map(describeModifier).join(", ");
  return `${effects} pendant ${seconds(ability.durationMs)} · recharge ${seconds(ability.cooldownMs)}`;
}
