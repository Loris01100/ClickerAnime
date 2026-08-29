import type { GameData } from "./gameState";
import type { AbilityDefinition, Anime, Enemy, ModifierTemplate } from "./types";

export interface ContentIssue {
  code: string;
  path: string;
  message: string;
}

const finite = (value: number) => Number.isFinite(value);

/**
 * Validates authored content as one connected graph. TypeScript checks the shape of each row; this
 * catches the mistakes types cannot see: duplicate ids, references to missing arcs, a presence in
 * an unrelated universe, or a recruit attached to the wrong anime.
 */
export function validateGameData(data: GameData): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const add = (code: string, path: string, message: string) => issues.push({ code, path, message });
  const animeById = new Map(data.animes.map((anime) => [anime.id, anime]));
  const arcById = new Map(data.arcs.map((arc) => [arc.id, arc]));
  const characterById = new Map(data.characters.map((character) => [character.id, character]));
  const itemById = new Map(data.items.map((item) => [item.id, item]));

  function uniqueIds(kind: string, entries: readonly { id: string }[]) {
    const seen = new Set<string>();
    for (const [index, entry] of entries.entries()) {
      const path = `${kind}[${index}].id`;
      if (!entry.id.trim()) add("empty-id", path, "l’identifiant est vide");
      else if (seen.has(entry.id)) add("duplicate-id", path, `l’identifiant « ${entry.id} » est utilisé plusieurs fois`);
      seen.add(entry.id);
    }
  }

  function validateModifier(modifier: ModifierTemplate, path: string) {
    if (!finite(modifier.value)) add("invalid-modifier", `${path}.value`, "la valeur doit être un nombre fini");
    if (modifier.kind === "multiplier" && modifier.value < 0) {
      add("invalid-modifier", `${path}.value`, "un multiplicateur ne peut pas être négatif");
    }
  }

  const abilityIds = new Set<string>();
  function validateAbility(ability: AbilityDefinition, path: string) {
    if (abilityIds.has(ability.id)) add("duplicate-ability", `${path}.id`, `la capacité « ${ability.id} » existe plusieurs fois`);
    abilityIds.add(ability.id);
    if (ability.cooldownMs < 0 || !finite(ability.cooldownMs)) {
      add("invalid-ability", `${path}.cooldownMs`, "le temps de recharge doit être positif et fini");
    }
    if (ability.durationMs < 0 || !finite(ability.durationMs)) {
      add("invalid-ability", `${path}.durationMs`, "la durée doit être positive et finie");
    }
    ability.effects.forEach((effect, index) => validateModifier(effect, `${path}.effects[${index}]`));
  }

  function isLaterAnime(candidateId: string, originId: string): boolean {
    const visited = new Set<string>();
    let current: Anime | undefined = animeById.get(candidateId);
    while (current?.requiresAnimeId && !visited.has(current.id)) {
      if (current.requiresAnimeId === originId) return true;
      visited.add(current.id);
      current = animeById.get(current.requiresAnimeId);
    }
    return false;
  }

  uniqueIds("animes", data.animes);
  uniqueIds("arcs", data.arcs);
  uniqueIds("characters", data.characters);
  uniqueIds("items", data.items);
  uniqueIds("shop", data.shop ?? []);

  for (const [index, anime] of data.animes.entries()) {
    const path = `animes[${index}](${anime.id})`;
    if (anime.requiresAnimeId && !animeById.has(anime.requiresAnimeId)) {
      add("unknown-anime", `${path}.requiresAnimeId`, `le prérequis « ${anime.requiresAnimeId} » n’existe pas`);
    }
    if (anime.requiresAnimeId === anime.id) add("anime-cycle", path, "un animé ne peut pas se débloquer lui-même");
    const visited = new Set([anime.id]);
    let parent = anime.requiresAnimeId;
    while (parent) {
      if (visited.has(parent)) {
        add("anime-cycle", path, `la chaîne de prérequis forme une boucle avec « ${parent} »`);
        break;
      }
      visited.add(parent);
      parent = animeById.get(parent)?.requiresAnimeId;
    }
  }

  const enemyIds = new Set<string>();
  const recruitSources = new Map<string, string[]>();
  function validateEnemy(enemy: Enemy, path: string, animeId: string, boss: boolean) {
    if (enemyIds.has(enemy.id)) add("duplicate-enemy", `${path}.id`, `l’ennemi « ${enemy.id} » existe plusieurs fois`);
    enemyIds.add(enemy.id);
    if (!finite(enemy.baseHp) || enemy.baseHp <= 0) add("invalid-enemy", `${path}.baseHp`, "les PV doivent être strictement positifs");
    if (!finite(enemy.reward) || enemy.reward < 0) add("invalid-enemy", `${path}.reward`, "la récompense doit être positive ou nulle");
    if (enemy.dropChance !== undefined && (enemy.dropChance < 0 || enemy.dropChance > 1 || !finite(enemy.dropChance))) {
      add("invalid-drop", `${path}.dropChance`, "la probabilité doit être comprise entre 0 et 1");
    }
    if (enemy.characterId) {
      const character = characterById.get(enemy.characterId);
      if (!character) add("unknown-character", `${path}.characterId`, `le personnage « ${enemy.characterId} » n’existe pas`);
      else if (character.animeId !== animeId) {
        add("wrong-recruit-anime", `${path}.characterId`, `${character.name} appartient à « ${character.animeId} », pas à « ${animeId} »`);
      }
      recruitSources.set(enemy.characterId, [...(recruitSources.get(enemy.characterId) ?? []), path]);
    }
    if (enemy.itemId) {
      const item = itemById.get(enemy.itemId);
      if (!item) add("unknown-item", `${path}.itemId`, `l’objet « ${enemy.itemId} » n’existe pas`);
      else if (boss && item.kind !== "unique") add("wrong-item-kind", `${path}.itemId`, "un objet de boss doit être unique");
      else if (!boss && item.kind !== "common") add("wrong-item-kind", `${path}.itemId`, "un objet de mob doit être commun");
    }
    if (enemy.timerMs !== undefined && (!finite(enemy.timerMs) || enemy.timerMs <= 0)) {
      add("invalid-timer", `${path}.timerMs`, "le chronomètre doit être strictement positif");
    }
    if (enemy.bossTrait && (!boss || !finite(enemy.bossTrait.multiplier) || enemy.bossTrait.multiplier <= 0)) {
      add("invalid-boss-trait", `${path}.bossTrait`, "un trait est réservé à un boss et doit avoir un multiplicateur positif");
    }
  }

  for (const anime of data.animes) {
    const arcs = data.arcs.filter((arc) => arc.animeId === anime.id).sort((a, b) => a.order - b.order);
    if (arcs.length === 0) add("empty-anime", `anime(${anime.id})`, "l’animé ne contient aucun arc");
    arcs.forEach((arc, index) => {
      if (arc.order !== index) add("invalid-arc-order", `arc(${arc.id}).order`, `ordre attendu : ${index}, ordre reçu : ${arc.order}`);
    });
  }

  for (const [index, arc] of data.arcs.entries()) {
    const path = `arcs[${index}](${arc.id})`;
    if (!animeById.has(arc.animeId)) add("unknown-anime", `${path}.animeId`, `l’animé « ${arc.animeId} » n’existe pas`);
    if (!Number.isInteger(arc.mobsToBoss) || arc.mobsToBoss < 0) {
      add("invalid-mob-count", `${path}.mobsToBoss`, "le nombre de mobs doit être un entier positif ou nul");
    }
    if (arc.mobs.length === 0) add("empty-mob-pool", `${path}.mobs`, "l’arc ne contient aucun mob");
    if (!arc.mobs.some((mob) => !mob.characterId)) {
      add("exhaustible-mob-pool", `${path}.mobs`, "il ne restera aucun mob après le recrutement de tout l’arc");
    }
    if (!arc.mobs.some((mob) => itemById.get(mob.itemId ?? "")?.kind === "common")) {
      add("missing-common-item", `${path}.mobs`, "aucun mob ne fournit l’objet commun nécessaire aux passifs de l’arc");
    }
    arc.mobs.forEach((mob, mobIndex) => validateEnemy(mob, `${path}.mobs[${mobIndex}]`, arc.animeId, false));
    validateEnemy(arc.boss, `${path}.boss`, arc.animeId, true);
  }

  const shopCharacterIds = new Set(
    (data.shop ?? []).filter((offer) => offer.kind === "character").map((offer) => offer.targetId)
  );
  for (const [index, character] of data.characters.entries()) {
    const path = `characters[${index}](${character.id})`;
    if (!animeById.has(character.animeId)) add("unknown-anime", `${path}.animeId`, `l’animé « ${character.animeId} » n’existe pas`);
    if (!character.tags?.length) add("missing-character-tags", `${path}.tags`, "le personnage n’a aucun type pour les restrictions d’équipement");
    const sources = recruitSources.get(character.id) ?? [];
    if (sources.length > 1) add("duplicate-recruit", path, `le personnage est recruté ${sources.length} fois`);
    if (sources.length === 0 && !shopCharacterIds.has(character.id)) {
      add("unobtainable-character", path, "le personnage n’est ni recrutable dans un arc ni disponible en boutique");
    }

    const homeArcs = new Set<string>();
    for (const [arcIndex, arcId] of character.arcIds.entries()) {
      if (homeArcs.has(arcId)) add("duplicate-presence", `${path}.arcIds[${arcIndex}]`, `l’arc « ${arcId} » est répété`);
      homeArcs.add(arcId);
      const arc = arcById.get(arcId);
      if (!arc) add("unknown-arc", `${path}.arcIds[${arcIndex}]`, `l’arc « ${arcId} » n’existe pas`);
      else if (arc.animeId !== character.animeId) {
        add("wrong-home-arc", `${path}.arcIds[${arcIndex}]`, `l’arc appartient à « ${arc.animeId} », pas à l’animé de recrutement`);
      }
    }

    const appearances = new Set<string>();
    for (const [appearanceIndex, animeId] of (character.appearanceAnimeIds ?? []).entries()) {
      if (appearances.has(animeId)) add("duplicate-presence", `${path}.appearanceAnimeIds[${appearanceIndex}]`, `l’animé « ${animeId} » est répété`);
      appearances.add(animeId);
      if (!animeById.has(animeId)) add("unknown-anime", `${path}.appearanceAnimeIds[${appearanceIndex}]`, `l’animé « ${animeId} » n’existe pas`);
      else if (!isLaterAnime(animeId, character.animeId)) {
        add("unrelated-appearance", `${path}.appearanceAnimeIds[${appearanceIndex}]`, `« ${animeId} » n’est pas une suite de « ${character.animeId} »`);
      }
    }

    for (const [synergyIndex, animeId] of (character.fullSynergyAnimeIds ?? []).entries()) {
      if (!appearances.has(animeId) && character.evolution?.animeId !== animeId) {
        add("synergy-without-presence", `${path}.fullSynergyAnimeIds[${synergyIndex}]`, `la synergie complète dans « ${animeId} » exige d’abord une présence ou une évolution`);
      }
    }
    if (character.passive) validateModifier(character.passive, `${path}.passive`);
    if (character.ability) validateAbility(character.ability, `${path}.ability`);
    if (character.evolution) {
      if (!isLaterAnime(character.evolution.animeId, character.animeId)) {
        add("invalid-evolution", `${path}.evolution.animeId`, `« ${character.evolution.animeId} » n’est pas une suite de « ${character.animeId} »`);
      }
      character.evolution.bonus.forEach((effect, effectIndex) => validateModifier(effect, `${path}.evolution.bonus[${effectIndex}]`));
      if (character.evolution.ability) validateAbility(character.evolution.ability, `${path}.evolution.ability`);
    }
  }

  for (const [index, item] of data.items.entries()) {
    const path = `items[${index}](${item.id})`;
    item.effects?.forEach((effect, effectIndex) => validateModifier(effect, `${path}.effects[${effectIndex}]`));
    for (const characterId of item.equippableBy?.characterIds ?? []) {
      if (!characterById.has(characterId)) add("unknown-character", `${path}.equippableBy.characterIds`, `le personnage « ${characterId} » n’existe pas`);
    }
    for (const animeId of item.equippableBy?.animeIds ?? []) {
      if (!animeById.has(animeId)) add("unknown-anime", `${path}.equippableBy.animeIds`, `l’animé « ${animeId} » n’existe pas`);
    }
  }

  for (const [index, offer] of (data.shop ?? []).entries()) {
    const path = `shop[${index}](${offer.id})`;
    const targetExists = offer.kind === "item" ? itemById.has(offer.targetId) : characterById.has(offer.targetId);
    if (!targetExists) add("unknown-shop-target", `${path}.targetId`, `la cible « ${offer.targetId} » n’existe pas`);
    if (offer.requiresAnimeId && !animeById.has(offer.requiresAnimeId)) {
      add("unknown-anime", `${path}.requiresAnimeId`, `l’animé « ${offer.requiresAnimeId} » n’existe pas`);
    }
    if (offer.arcId && !arcById.has(offer.arcId)) add("unknown-arc", `${path}.arcId`, `l’arc « ${offer.arcId} » n’existe pas`);
    if (!finite(offer.cost) || offer.cost < 0) add("invalid-shop-cost", `${path}.cost`, "le prix doit être positif ou nul");
  }

  return issues;
}

export function formatContentIssues(issues: readonly ContentIssue[]): string {
  return issues.map((issue) => `[${issue.code}] ${issue.path} — ${issue.message}`).join("\n");
}
