import { describe, expect, it } from "vitest";
import { gameData } from "../../data";
import { getUnlockedAbilities } from "../abilities";
import { layoutArcs, MAP_COLS } from "../mapLayout";
import { defaultSynergyConfig, isHomeArc, synergyMultiplier } from "../synergy";
import { makeArc } from "./helpers";
import { formatContentIssues, validateGameData } from "../dataValidation";

describe("game data", () => {
  it("passes the complete content graph validation", () => {
    const issues = validateGameData(gameData);
    expect(issues, formatContentIssues(issues)).toEqual([]);
  });

  it("names broken arc, recruit and sequel-presence references precisely", () => {
    const brokenData = {
      ...gameData,
      characters: gameData.characters.map((character) =>
        character.id === "naruto-uzumaki"
          ? { ...character, arcIds: [...character.arcIds, "arc-inexistant"], appearanceAnimeIds: ["bleach"] }
          : character
      ),
      arcs: gameData.arcs.map((arc) =>
        arc.id === "bleach-shinigami-remplacant"
          ? { ...arc, boss: { ...arc.boss, characterId: "naruto-uzumaki" } }
          : arc
      ),
    };
    const issues = validateGameData(brokenData);
    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["unknown-arc", "unrelated-appearance", "wrong-recruit-anime", "duplicate-recruit"])
    );
    expect(formatContentIssues(issues)).toContain("arc-inexistant");
    expect(formatContentIssues(issues)).toContain("bleach");
  });
  it("exige que les arcs d’un personnage soient listés dans l’ordre de l’histoire", () => {
    // `arcIds[0]` est l’arc de débuts que lit `arcPowerTable`, donc le `debutPower` de tout le
    // rattrapage : un tableau trié à l’envers ferait débuter le personnage bien plus tard qu’il ne
    // le fait, sans rien casser de visible.
    const naruto = gameData.characters.find((character) => character.id === "naruto-uzumaki")!;
    const reversed = {
      ...gameData,
      characters: gameData.characters.map((character) =>
        character.id === naruto.id ? { ...character, arcIds: [...character.arcIds].reverse() } : character
      ),
    };
    const issues = validateGameData(reversed);
    expect(issues.map((issue) => issue.code)).toContain("unordered-presence");
    // Et le contenu réel le respecte déjà, sur les 256 personnages.
    expect(validateGameData(gameData).filter((issue) => issue.code === "unordered-presence")).toEqual([]);
  });

  it("keeps the Naruto cast present across its sequel anime without duplicating recruits", () => {
    const naruto = gameData.characters.find((character) => character.id === "naruto-uzumaki")!;
    const sequelArcs = gameData.arcs.filter((arc) => arc.animeId === "shippuden" || arc.animeId === "boruto");
    expect(sequelArcs.length).toBeGreaterThan(0);
    for (const arc of sequelArcs) {
      expect(isHomeArc(naruto, arc, true), `${arc.id} should be home for Naruto`).toBe(true);
      expect(synergyMultiplier(naruto, arc, defaultSynergyConfig, true), `${arc.id} should give Naruto full synergy`).toBe(1);
    }

    const shippudenArc = gameData.arcs.find((arc) => arc.animeId === "shippuden")!;
    const rockLee = gameData.characters.find((character) => character.id === "rock-lee")!;
    expect(getUnlockedAbilities([rockLee.id], [rockLee], [], shippudenArc).map((entry) => entry.ability.id)).toEqual([
      "ability-portes",
    ]);

    const haku = gameData.characters.find((character) => character.id === "haku")!;
    expect(isHomeArc(haku, shippudenArc)).toBe(false);
  });

  it("uses Mû as the Confrontation boss", () => {
    expect(gameData.arcs.find((arc) => arc.id === "shippuden-confrontation")?.boss.name).toBe("Mû, le Second Tsuchikage");
  });

  it("covers the complete Hunter x Hunter anime without the unadapted Dark Continent", () => {
    const arcs = gameData.arcs.filter((arc) => arc.animeId === "hunter-x-hunter").sort((a, b) => a.order - b.order);
    expect(arcs.map((arc) => arc.name)).toEqual([
      "L'Examen Hunter",
      "La Tour Céleste",
      "York Shin City",
      "Greed Island",
      "Les Kimera Ants",
      "Les Élections Présidentielles",
    ]);
    expect(arcs.some((arc) => arc.name.toLowerCase().includes("continent"))).toBe(false);
    const anime = gameData.animes.find((entry) => entry.id === "hunter-x-hunter");
    expect(anime?.requiresAnimeId).toBeUndefined();
    expect(anime?.mapImage).toBe("/hunter-hunter-map.webp");
    expect(arcs.every((arc) => arc.mapX !== undefined && arc.mapY !== undefined)).toBe(true);
    // This opening world used to clear in under ten minutes: its larger cast made damage grow much
    // faster than enemy health. Keep both the longer kill budgets and the rebuilt boss curve.
    expect(arcs.map((arc) => arc.mobsToBoss)).toEqual([20, 28, 34, 40, 46, 52]);
    expect(arcs.map((arc) => arc.boss.baseHp)).toEqual([588, 60_600, 550_000, 1_800_000, 6_000_000, 16_000_000]);
    expect(arcs.map((arc) => arc.boss.timerMs)).toEqual([60_000, 75_000, 75_000, 75_000, 75_000, 75_000]);

    const debutPower = arcs.map((arc) =>
      Math.max(...gameData.characters.filter((character) => character.arcIds[0] === arc.id).map((character) => character.baseDps))
    );
    expect(debutPower).toEqual([6, 8, 18, 30, 72, 120]);

  });

  it("folds Horimiya and The Missing Pieces into one balanced entry world", () => {
    const arcs = gameData.arcs.filter((arc) => arc.animeId === "horimiya").sort((a, b) => a.order - b.order);
    expect(arcs.map((arc) => arc.name)).toEqual([
      "Les secrets partagés",
      "Une place parmi les autres",
      "Des sentiments difficiles à dire",
      "Le quotidien du lycée",
      "Les pièces manquantes",
      "Noël et la remise des diplômes",
    ]);
    expect(arcs.map((arc) => arc.mobsToBoss)).toEqual([20, 28, 34, 40, 46, 52]);
    expect(arcs.map((arc) => arc.boss.baseHp)).toEqual([588, 60_600, 550_000, 1_800_000, 3_000_000, 8_000_000]);
    expect(arcs.every((arc) => arc.mapX !== undefined && arc.mapY !== undefined)).toBe(true);

    const anime = gameData.animes.find((entry) => entry.id === "horimiya");
    expect(anime?.requiresAnimeId).toBeUndefined();
    expect(anime?.mapImage).toBe("/horimiya-map.png");
    expect(anime?.presentation?.bossLabel).toBe("Épreuve");

    const debutPower = arcs.map((arc) =>
      gameData.characters
        .filter((character) => character.arcIds[0] === arc.id)
        .map((character) => character.baseDps)
    );
    expect(debutPower.map((cohort) => Math.max(...cohort))).toEqual([6, 12, 24, 48, 82, 120]);
    for (const [index, cohort] of debutPower.entries()) {
      expect(Math.min(...cohort) / Math.max(...cohort), `${arcs[index].id} : plancher de cohorte`).toBeGreaterThanOrEqual(0.6);
    }
  });

  it("covers Bleach's fifteen anime arcs, the manga-only duplicate of the last one aside", () => {
    const arcs = gameData.arcs.filter((arc) => arc.animeId === "bleach").sort((a, b) => a.order - b.order);
    expect(arcs.map((arc) => arc.name)).toEqual([
      "Arc du Shinigami Remplaçant",
      "Arc de la Soul Society",
      "Arc des Bounts",
      "Arc des Arrancars",
      "Arc des Arrancars, Assaut du Hueco Mundo",
      "Arc des Arrancars, La Lutte acharnée",
      "Arc du Nouveau Capitaine, Shûsuke Amagai",
      "Arc des Arrancars contre les Shinigamis",
      "Arc du Passé",
      "Arc des Arrancars, La Bataille de Karakura",
      "Arc du Conte Inconnu des Zanpakutôs",
      "Arc de la Destruction des Arrancars",
      "Arc de l'Armée Envahissante du Gotei 13",
      "Arc du Fullbringer, Le Shinigami Remplaçant Disparu",
      "Arc de la Guerre sanglante Millénaire",
    ]);
    // The source list names the last arc twice — "Guerre sanglante Millénaire" for the anime,
    // "Arc Quincy" for the manga. Same story, so it is one arc here, not two.
    expect(arcs.some((arc) => arc.name.includes("Quincy"))).toBe(false);

    const anime = gameData.animes.find((entry) => entry.id === "bleach");
    expect(anime?.requiresAnimeId).toBeUndefined(); // an entry world, like Naruto and Hunter x Hunter
    expect(anime?.mapImage).toBe("/bleach-map.jpg");

    // Every arc is hand-placed on that map, and the placement has three constraints: inside the
    // Garganta circle the art draws, clear of the legend down the right-hand third, and far enough
    // apart that two pins don't overlap — 0.070 is the tightest pair Shippūden's map already holds.
    const pins = arcs.map((arc) => [arc.mapX, arc.mapY] as const);
    expect(pins.every(([x, y]) => x !== undefined && y !== undefined)).toBe(true);
    for (const [x, y] of pins) {
      expect(((x! - 0.35) / 0.33) ** 2 + ((y! - 0.5) / 0.47) ** 2, "hors du cercle de la Garganta").toBeLessThan(0.85);
      expect(x!, "sur la légende de la carte").toBeLessThan(0.66);
    }
    for (let a = 0; a < pins.length; a++) {
      for (let b = a + 1; b < pins.length; b++) {
        const distance = Math.hypot(pins[a][0]! - pins[b][0]!, pins[a][1]! - pins[b][1]!);
        expect(distance, `${arcs[a].id} et ${arcs[b].id} se chevauchent`).toBeGreaterThanOrEqual(0.07);
      }
    }

    // The debut-power ramp is deliberately flat (~1.24x an arc where every other world runs ~1.85).
    // `reachedArcPower` is one scalar shared by every world, so an entry world has to hand off at
    // the same height as the other two — Naruto ends at 78, Hunter x Hunter at 120, Shippūden opens
    // at 130. Fifteen arcs at 1.85x would end near 20 000. See `src/data/bleach/index.ts`.
    const debutPower = arcs.map((arc) =>
      Math.max(...gameData.characters.filter((character) => character.arcIds[0] === arc.id).map((c) => c.baseDps))
    );
    expect(debutPower[0]).toBe(6);
    expect(debutPower[debutPower.length - 1]).toBe(125);
    for (let n = 1; n < debutPower.length; n++) expect(debutPower[n]).toBeGreaterThan(debutPower[n - 1]);

    // The cohort floor (`docs/progression.md`): no recruit below 0.6 of the strongest one debuting
    // beside them. Held here from the start, which the older worlds predate.
    for (const arc of arcs) {
      const cohort = gameData.characters.filter((character) => character.arcIds[0] === arc.id).map((c) => c.baseDps);
      expect(Math.min(...cohort) / Math.max(...cohort), `${arc.id} : plancher de cohorte`).toBeGreaterThanOrEqual(0.6);
    }

    // Boss clocks are fit last, at ~1.5x over the time-to-kill the simulator measures, and never
    // shorten as the world goes on (`docs/combat.md`).
    const timers = arcs.map((arc) => arc.boss.timerMs);
    expect(timers).toEqual([
      60_000,
      ...Array(5).fill(70_000),
      ...Array(3).fill(75_000),
      ...Array(3).fill(85_000),
      ...Array(3).fill(110_000),
    ]);
  });

  it("caps active ability damage gains in every world", () => {
    const abilities = [
      ...gameData.characters.flatMap((character) => character.ability ? [character.ability] : []),
      ...gameData.characters.flatMap((character) => character.evolution?.ability ? [character.evolution.ability] : []),
    ];
    const multipliers = abilities.flatMap((ability) => ability.effects.filter((effect) => effect.kind === "multiplier"));
    const percents = abilities.flatMap((ability) => ability.effects.filter((effect) => effect.kind === "percent"));
    expect(Math.max(...multipliers.map((effect) => effect.value))).toBe(3.5);
    expect(Math.max(...percents.map((effect) => effect.value))).toBe(0.5);
  });

  it("gives every boss one readable and numerically safe trait", () => {
    const traits = gameData.arcs.flatMap((arc) => (arc.boss.bossTrait ? [{ arc, trait: arc.boss.bossTrait }] : []));
    expect(traits).toHaveLength(gameData.arcs.length);
    expect(new Set(traits.map(({ trait }) => trait.kind))).toEqual(
      new Set(["click-resistance", "dps-resistance", "shield"])
    );
    for (const { arc, trait } of traits) {
      expect(trait.multiplier, `${arc.id} : multiplicateur positif`).toBeGreaterThan(0);
      expect(trait.multiplier, `${arc.id} : multiplicateur borné`).toBeLessThanOrEqual(1);
      expect(trait.description.length).toBeGreaterThan(20);
    }
  });

  it("keeps every id unique and every reference resolvable", () => {
    const dupes = (ids: string[]) => ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes(gameData.characters.map((c) => c.id))).toEqual([]);
    expect(dupes(gameData.items.map((i) => i.id))).toEqual([]);
    expect(dupes(gameData.arcs.map((a) => a.id))).toEqual([]);
    expect(dupes(gameData.animes.map((a) => a.id))).toEqual([]);

    const characterIds = gameData.characters.map((c) => c.id);
    const itemIds = gameData.items.map((i) => i.id);
    for (const character of gameData.characters) {
      expect(character.tags?.length, `${character.id} n'a aucun type`).toBeGreaterThan(0);
    }
    for (const arc of gameData.arcs) {
      expect(gameData.animes.some((a) => a.id === arc.animeId)).toBe(true);
      for (const enemy of [...arc.mobs, arc.boss]) {
        if (enemy.characterId) expect(characterIds).toContain(enemy.characterId);
        if (enemy.itemId) expect(itemIds).toContain(enemy.itemId);
      }
      // one common item per arc: it is what the passives of that arc's characters are paid with
      expect(arc.mobs.some((m) => m.itemId)).toBe(true);
    }
    const animeIds = gameData.animes.map((a) => a.id);
    for (const character of gameData.characters) {
      for (const animeId of character.appearanceAnimeIds ?? []) {
        expect(animeIds, `${character.id} appears in an unknown anime`).toContain(animeId);
        expect(animeId, `${character.id} must not repeat its recruitment anime as an appearance`).not.toBe(
          character.animeId,
        );
      }
      for (const animeId of character.fullSynergyAnimeIds ?? []) {
        expect(animeIds, `${character.id} has full synergy in an unknown anime`).toContain(animeId);
        expect(
          [...(character.appearanceAnimeIds ?? []), character.evolution?.animeId],
          `${character.id} needs a presence or evolution before full sequel synergy`,
        ).toContain(animeId);
      }
    }
    for (const offer of gameData.shop ?? []) {
      expect(offer.kind === "item" ? itemIds : characterIds).toContain(offer.targetId);
      if (offer.requiresAnimeId) expect(animeIds).toContain(offer.requiresAnimeId);
    }
  });

  it("recruits each regular character once and keeps shop exclusives purchasable", () => {
    const recruited = gameData.arcs.flatMap((a) => [...a.mobs, a.boss]).map((e) => e.characterId).filter(Boolean);
    expect(recruited.filter((id, i) => recruited.indexOf(id) !== i)).toEqual([]);
    for (const character of gameData.characters) {
      const arc = gameData.arcs.find(
        (a) => a.boss.characterId === character.id || a.mobs.some((m) => m.characterId === character.id)
      );
      const shopOffer = gameData.shop?.find((offer) => offer.kind === "character" && offer.targetId === character.id);
      expect(arc || shopOffer, `${character.id} n'est ni recrutable ni vendu`).toBeDefined();
      if (arc) expect(arc.animeId).toBe(character.animeId);
      for (const arcId of character.arcIds) {
        expect(gameData.arcs.find((a) => a.id === arcId)?.animeId).toBe(character.animeId);
      }
    }
  });

  it("leaves every arc a mob pool that survives recruiting its whole cast", () => {
    // `encounterPool` falls back to the non-recruit mobs once every character of the zone has
    // joined. With none, `nextEnemy` hands back the boss forever and a cleared arc re-clears itself
    // on every kill. No arc is in that state today; this keeps it that way.
    for (const arc of gameData.arcs) {
      expect(arc.mobs.some((m) => !m.characterId), `${arc.id} n'a que des mobs recrutables`).toBe(true);
    }
  });

  it("keeps every hand-picked world hue inside the HSL wheel", () => {
    for (const anime of gameData.animes) {
      if (anime.themeHue === undefined) continue;
      expect(anime.themeHue, `${anime.id}'s themeHue must be a 0..360 hue`).toBeGreaterThanOrEqual(0);
      expect(anime.themeHue).toBeLessThan(360);
    }
  });

  it("only evolves characters into a later anime of their own universe", () => {
    for (const character of gameData.characters) {
      if (!character.evolution) continue;
      const evolvesInto = gameData.animes.find((a) => a.id === character.evolution!.animeId);
      expect(evolvesInto, `${character.id} evolves into an unknown anime`).toBeDefined();
      expect(evolvesInto!.requiresAnimeId, `${character.id}'s evolution must be its own anime's sequel`).toBe(
        character.animeId
      );
    }
  });

  /**
   * Shippūden and Boruto are both generated from a table, on three ramps, and the two hp ones are
   * not free: they track the rate the team's own dps grows, measured with `npm run sim --json`.
   * Ramp the hp slower and the world's pace inverts — the climax ends up the fastest part of the
   * game and the boss clock stops mattering, which is exactly what Shippūden's table used to do at
   * a flat 1.85. Boruto is steeper still because the roster it inherits is deeper. The rationale
   * and the tuning history are in `docs/combat.md`; this test is what stops an edit from quietly
   * walking one arc off its world's ramp.
   *
   * The two worlds sit on near-identical ramps now, where Boruto used to be the steeper one. That
   * is `CATCH_UP` (docs/progression.md): with the whole roster riding the story's ramp instead of
   * only the last few recruits, how fast the team's dps grows stopped depending on how deep the
   * roster is — so it stopped depending on which world you are in.
   *
   * Naruto part 1 is deliberately absent: it is hand-written arc by arc, not generated, because the
   * opening world is where the team is still forming and its pacing is not a clean geometric ramp.
   */
  it.each([
    { animeId: "shippuden", arcCount: 15, mobRamp: 2.21, bossRamp: 2.37 },
    { animeId: "boruto", arcCount: 8, mobRamp: 2.25, bossRamp: 2.39 },
  ])("tient les trois rampes de la table de $animeId", ({ animeId, arcCount, mobRamp, bossRamp }) => {
    const arcs = gameData.arcs.filter((arc) => arc.animeId === animeId).sort((a, b) => a.order - b.order);
    expect(arcs).toHaveLength(arcCount);

    for (let n = 1; n < arcs.length; n++) {
      const [previous, arc] = [arcs[n - 1], arcs[n]];
      const label = `${arc.name} (ordre ${arc.order})`;
      // Rounded to 3 significant figures in the data, so a ramp lands within ~1% of its target.
      expect(arc.boss.baseHp / previous.boss.baseHp, `${label} : pv du boss`).toBeCloseTo(bossRamp, 1);
      expect(arc.mobs[0].baseHp / previous.mobs[0].baseHp, `${label} : pv des mobs`).toBeCloseTo(mobRamp, 1);
      // The reward ramp is the one deliberately left alone, and it is the same in every world: kills
      // per arc are fixed, so touching it would move the economy, which the hp tuning must not.
      expect(arc.boss.reward / previous.boss.reward, `${label} : récompense`).toBeCloseTo(1.85, 1);
    }
  });
});

describe("layoutArcs", () => {
  const arcs = (count: number) =>
    Array.from({ length: count }, (_, i) => makeArc(`arc-${i}`, "anime-a", i, []));

  const cellOffset = (value: number, index: number, span: number) => value * span - index;

  it("returns an empty layout for no arcs, without dividing by zero", () => {
    expect(layoutArcs([])).toEqual({ nodes: [], cols: 1, rows: 1 });
  });

  it("places a single arc within its cell", () => {
    const layout = layoutArcs(arcs(1));
    expect(layout.cols).toBe(1);
    expect(layout.rows).toBe(1);
    expect(layout.nodes).toHaveLength(1);
    expect(cellOffset(layout.nodes[0].x, layout.nodes[0].col, layout.cols)).toBeGreaterThanOrEqual(0.32);
    expect(cellOffset(layout.nodes[0].x, layout.nodes[0].col, layout.cols)).toBeLessThanOrEqual(0.68);
  });

  it("snakes a Naruto-shaped 5-arc world across two rows", () => {
    const layout = layoutArcs(arcs(5));
    expect(layout.cols).toBe(MAP_COLS);
    expect(layout.rows).toBe(2);
    // index 4 starts row 1 (the reversed row), landing directly under index 3's column.
    expect(layout.nodes[4].row).toBe(1);
    expect(layout.nodes[4].col).toBe(layout.nodes[3].col);
  });

  it("fits a Shippūden-shaped 15-arc world with no overlapping cells", () => {
    const layout = layoutArcs(arcs(15));
    expect(layout.cols).toBe(MAP_COLS);
    expect(layout.rows).toBe(4);
    expect(layout.nodes.filter((n) => n.row === 3)).toHaveLength(3);

    const cells = new Set(layout.nodes.map((n) => `${n.col},${n.row}`));
    expect(cells.size).toBe(layout.nodes.length);

    for (const node of layout.nodes) {
      expect(cellOffset(node.x, node.col, layout.cols)).toBeGreaterThanOrEqual(0.32);
      expect(cellOffset(node.x, node.col, layout.cols)).toBeLessThanOrEqual(0.68);
      expect(cellOffset(node.y, node.row, layout.rows)).toBeGreaterThanOrEqual(0.32);
      expect(cellOffset(node.y, node.row, layout.rows)).toBeLessThanOrEqual(0.68);
    }
  });

  it("is deterministic and preserves arc order", () => {
    const input = arcs(7);
    const a = layoutArcs(input);
    const b = layoutArcs(input);
    expect(a).toEqual(b);
    expect(a.nodes.map((n) => n.arc.id)).toEqual(input.map((arc) => arc.id));
  });
});
