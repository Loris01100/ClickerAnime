import type { AbilityDiagnostic } from "../engine/abilities";

/**
 * Les raccourcis clavier du shell. Pure : une touche entre, une action sort — `App.tsx` décide si
 * elle a le droit de partir (aucun overlay ouvert, panneau déjà découvert) et la joue. Aucun
 * raccourci ne fait quoi que ce soit qu'un bouton à l'écran ne fasse déjà.
 */
export type ShortcutPanel =
  | "codex"
  | "worlds"
  | "shop"
  | "packs"
  | "crossover"
  | "challenges"
  | "tower"
  | "achievements"
  | "prestige";

export type ShortcutAction =
  | { kind: "ability"; slot: number }
  | { kind: "fire-all" }
  | { kind: "pause" }
  | { kind: "arc"; direction: 1 | -1 }
  | { kind: "rematch" }
  | { kind: "panel"; panel: ShortcutPanel }
  | { kind: "help" };

/** Autant de capacités que de chiffres : au-delà, « Tout lancer » prend le relais. */
export const ABILITY_SLOTS = 9;

/**
 * Lettres lues sur `event.key`, donc celle imprimée sur la touche quelle que soit la disposition —
 * un « A » reste un « A » en AZERTY. Choisies pour se retenir en français.
 */
const PANEL_KEYS: Record<string, ShortcutPanel> = {
  c: "codex",
  m: "worlds",
  b: "shop",
  k: "packs",
  x: "crossover",
  d: "challenges",
  t: "tower",
  s: "achievements",
  a: "prestige",
};

/**
 * Ce que l'écran d'aide affiche, dans cet ordre. `keys` est la forme lisible, sauf `ArrowLeft` et
 * `ArrowRight` : une flèche est un symbole, et un symbole passe par `icons.tsx` (design.md §10).
 */
export const SHORTCUT_HELP: { group: string; entries: { keys: string[]; label: string }[] }[] = [
  {
    group: "Combat",
    entries: [
      { keys: ["Espace", "Entrée"], label: "Clic du Narrateur (scène sélectionnée)" },
      { keys: ["1–9"], label: "Lancer la capacité portant ce numéro" },
      { keys: ["L"], label: "Tout lancer" },
      { keys: ["R"], label: "Retenter le boss" },
      { keys: ["ArrowLeft", "ArrowRight"], label: "Arc précédent / suivant" },
      { keys: ["P"], label: "Pause / reprendre" },
    ],
  },
  {
    group: "Écrans",
    entries: [
      { keys: ["C"], label: "Codex" },
      { keys: ["M"], label: "Mondes" },
      { keys: ["B"], label: "Boutique" },
      { keys: ["K"], label: "Packs" },
      { keys: ["X"], label: "Crossover" },
      { keys: ["D"], label: "Défis" },
      { keys: ["T"], label: "Tour de l'Ascension" },
      { keys: ["S"], label: "Succès" },
      { keys: ["A"], label: "Arbre de prestige" },
      { keys: ["?"], label: "Cette aide" },
      { keys: ["Échap"], label: "Fermer l'écran ouvert" },
    ],
  },
];

/** Le sous-ensemble de `KeyboardEvent` lu ici — ce qui garde la fonction testable sans DOM. */
export interface KeyLike {
  key: string;
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  repeat: boolean;
}

/**
 * La touche, traduite en action, ou `null`. Les chiffres se lisent sur `event.code` : en AZERTY la
 * rangée du haut donne « & é " ' … » sans Maj, et le pavé numérique a ses propres codes. Une touche
 * maintenue ne répète rien — un panneau ne se rouvre pas en boucle, une pause ne clignote pas.
 * Ctrl, Cmd et Alt laissent passer les raccourcis du navigateur.
 */
export function shortcutOf(event: KeyLike): ShortcutAction | null {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return null;

  const digit = /^(?:Digit|Numpad)([1-9])$/.exec(event.code);
  if (digit) return { kind: "ability", slot: Number(digit[1]) };

  if (event.key === "ArrowLeft") return { kind: "arc", direction: -1 };
  if (event.key === "ArrowRight") return { kind: "arc", direction: 1 };
  if (event.key === "?") return { kind: "help" };

  const letter = event.key.toLowerCase();
  if (letter === "l") return { kind: "fire-all" };
  if (letter === "p") return { kind: "pause" };
  if (letter === "r") return { kind: "rematch" };
  const panel = PANEL_KEYS[letter];
  return panel ? { kind: "panel", panel } : null;
}

/**
 * Le numéro de chaque capacité, 1 à 9. Il suit l'ordre de l'équipe et non celui de la barre, qui
 * remonte les prêtes en tête à chaque recharge : une touche qui changerait de capacité toutes les
 * vingt secondes ne se retiendrait jamais. Une capacité endormie (hors de son monde, ou coupée par
 * un défi) ne prend pas de numéro — on ne gâche pas un chiffre pour un bouton qui ne part pas.
 */
export function abilitySlots(diagnostics: readonly AbilityDiagnostic[]): Map<string, number> {
  const slots = new Map<string, number>();
  for (const diagnostic of diagnostics) {
    if (slots.size >= ABILITY_SLOTS) break;
    if (diagnostic.availability.status.startsWith("blocked")) continue;
    slots.set(diagnostic.ability.id, slots.size + 1);
  }
  return slots;
}

/**
 * Une frappe destinée à un champ n'est pas un raccourci : taper « m » dans une recherche ne doit
 * pas ouvrir les Mondes. Un `<select>` compte aussi — ses flèches changent la valeur.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const element = target as { tagName?: string; isContentEditable?: boolean };
  return (
    element.isContentEditable === true ||
    element.tagName === "INPUT" ||
    element.tagName === "TEXTAREA" ||
    element.tagName === "SELECT"
  );
}
