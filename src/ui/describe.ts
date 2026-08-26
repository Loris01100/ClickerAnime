import { cooldownOf } from "../engine/abilities";
import type { AbilityDefinition, EquippableBy, Item, ModifierTemplate } from "../engine/types";
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

/** Human-readable restriction line for an equippable unique item. Empty when universal. */
export function describeEquippableBy(restriction: EquippableBy | undefined): string {
  if (!restriction) return "";
  const parts: string[] = [];
  if (restriction.characterIds && restriction.characterIds.length > 0) parts.push("personnages spécifiques");
  if (restriction.animeIds && restriction.animeIds.length > 0) parts.push("monde spécifique");
  if (restriction.tags && restriction.tags.length > 0) parts.push(restriction.tags.map((t) => t).join(", "));
  return parts.length > 0 ? `Réservé à : ${parts.join(" ; ")}` : "";
}

/** Full tooltip text for a unique item: effects + optional restriction. */
export function describeItem(item: Item): string {
  const lines = [item.name];
  if (item.effects && item.effects.length > 0) {
    lines.push(item.effects.map(describeModifier).join(" · "));
  }
  const restriction = describeEquippableBy(item.equippableBy);
  if (restriction) lines.push(restriction);
  return lines.join("\n");
}

/**
 * `magnitude` is what the buff is really worth right now (`abilityMagnitudeOf`): a scoped buff is
 * scaled before it lands, so printing the raw data value would understate every ability in the game.
 */
export function describeAbility(ability: AbilityDefinition, magnitude = 1): string {
  const effects = ability.effects
    .map((effect) =>
      describeModifier(
        effect.kind === "percent"
          ? { ...effect, value: effect.value * magnitude }
          : effect.kind === "multiplier"
            ? { ...effect, value: Math.round((1 + (effect.value - 1) * magnitude) * 10) / 10 }
            : effect
      )
    )
    .join(", ");
  return `${effects} pendant ${seconds(ability.durationMs)} · recharge ${seconds(cooldownOf(ability))}`;
}
