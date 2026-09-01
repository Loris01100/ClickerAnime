import { cooldownOf } from "../engine/abilities";
import type { AbilityDefinition, EquippableBy, Item, ModifierTemplate } from "../engine/types";
import { fmt, seconds } from "./format";

const CHARACTER_TAG_LABEL: Record<string, string> = {
  akatsuki: "Akatsuki",
  akimichi: "Akimichi",
  animal: "Animal",
  arrancar: "Arrancar",
  artificial: "Être artificiel",
  biju: "Bijū",
  bount: "Bount",
  captain: "Capitaine",
  "cursed-seal": "Sceau maudit",
  espada: "Espada",
  fraccion: "Fracción",
  fullbringer: "Fullbringer",
  "gotei-13": "Gotei 13",
  healer: "Guérisseur",
  hollow: "Hollow",
  human: "Humain",
  hyuga: "Hyūga",
  "ice-user": "Utilisateur de glace",
  invocation: "Invocation",
  iwa: "Ninja d'Iwa",
  jinchuriki: "Jinchūriki",
  jonin: "Jōnin",
  kage: "Kage",
  kara: "Kara",
  karma: "Karma",
  "kekkei-genkai": "Kekkei genkai",
  kuchiki: "Clan Kuchiki",
  kumo: "Ninja de Kumo",
  lieutenant: "Lieutenant",
  "medical-ninja": "Ninja médecin",
  "mod-soul": "Âme modifiée",
  mokuton: "Utilisateur du Mokuton",
  noble: "Noble",
  nue: "Nue",
  otsutsuki: "Ōtsutsuki",
  privaron: "Privaron Espada",
  puppeteer: "Marionnettiste",
  quincy: "Quincy",
  root: "Racine",
  sage: "Ermite",
  samurai: "Samouraï",
  sannin: "Sannin",
  scientist: "Scientifique",
  sensor: "Ninja sensoriel",
  serpent: "Serpent",
  sharingan: "Sharingan",
  shiba: "Clan Shiba",
  shinigami: "Shinigami",
  sternritter: "Sternritter",
  strategist: "Stratège",
  substitute: "Shinigami remplaçant",
  suna: "Ninja de Suna",
  swordsman: "Épéiste",
  taijutsu: "Spécialiste du taijutsu",
  tracker: "Pisteur",
  uchiwa: "Uchiwa",
  "urahara-shop": "Boutique Urahara",
  uzumaki: "Uzumaki",
  vizard: "Vizard",
  zanpakuto: "Zanpakutô",
  "zero-division": "Division Zéro",
};

/** French display name for the character categories used by equipment restrictions. */
export const describeCharacterTag = (tag: string) => CHARACTER_TAG_LABEL[tag] ?? tag;

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

/**
 * Human-readable restriction line for an equippable unique item. `animeName` is the world the item
 * comes from, which restricts it on its own — an accessory is only worn by someone that world
 * belongs to (`canEquipOn`) — so the line is never empty for an item whose origin is known.
 */
export function describeEquippableBy(restriction: EquippableBy | undefined, animeName?: string): string {
  const parts: string[] = [];
  if (animeName) parts.push(`personnages de ${animeName}`);
  if (!restriction) return parts.length > 0 ? `Réservé à : ${parts.join(" ; ")}` : "";
  if (restriction.characterIds && restriction.characterIds.length > 0) parts.push("personnages spécifiques");
  if (restriction.animeIds && restriction.animeIds.length > 0) parts.push("monde spécifique");
  if (restriction.tags && restriction.tags.length > 0)
    parts.push(restriction.tags.map(describeCharacterTag).join(", "));
  return parts.length > 0 ? `Réservé à : ${parts.join(" ; ")}` : "";
}

/** Full tooltip text for a unique item: effects + restriction, `animeName` being its world. */
export function describeItem(item: Item, animeName?: string): string {
  const lines = [item.name];
  if (item.effects && item.effects.length > 0) {
    lines.push(item.effects.map(describeModifier).join(" · "));
  }
  const restriction = item.kind === "unique" ? describeEquippableBy(item.equippableBy, animeName) : "";
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
