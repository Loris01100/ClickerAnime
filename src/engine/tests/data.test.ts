import { describe, expect, it } from "vitest";
import { gameData } from "../../data";
import { layoutArcs, MAP_COLS } from "../mapLayout";
import { makeArc } from "./helpers";

describe("game data", () => {
  it("keeps every id unique and every reference resolvable", () => {
    const dupes = (ids: string[]) => ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes(gameData.characters.map((c) => c.id))).toEqual([]);
    expect(dupes(gameData.items.map((i) => i.id))).toEqual([]);
    expect(dupes(gameData.arcs.map((a) => a.id))).toEqual([]);
    expect(dupes(gameData.animes.map((a) => a.id))).toEqual([]);

    const characterIds = gameData.characters.map((c) => c.id);
    const itemIds = gameData.items.map((i) => i.id);
    for (const arc of gameData.arcs) {
      expect(gameData.animes.some((a) => a.id === arc.animeId)).toBe(true);
      for (const enemy of [...arc.mobs, arc.boss]) {
        if (enemy.characterId) expect(characterIds).toContain(enemy.characterId);
        if (enemy.itemId) expect(itemIds).toContain(enemy.itemId);
      }
      // one common item per arc: it is what the passives of that arc's characters are paid with
      expect(arc.mobs.some((m) => m.itemId)).toBe(true);
    }
    for (const combo of gameData.combos) {
      for (const id of combo.requiredCharacterIds) expect(characterIds).toContain(id);
    }
    const animeIds = gameData.animes.map((a) => a.id);
    for (const offer of gameData.shop ?? []) {
      expect(offer.kind === "item" ? itemIds : characterIds).toContain(offer.targetId);
      if (offer.requiresAnimeId) expect(animeIds).toContain(offer.requiresAnimeId);
    }
  });

  it("recruits each character in exactly one world, and never twice", () => {
    const recruited = gameData.arcs.flatMap((a) => [...a.mobs, a.boss]).map((e) => e.characterId).filter(Boolean);
    expect(recruited.filter((id, i) => recruited.indexOf(id) !== i)).toEqual([]);
    for (const character of gameData.characters) {
      const arc = gameData.arcs.find(
        (a) => a.boss.characterId === character.id || a.mobs.some((m) => m.characterId === character.id)
      );
      expect(arc, `${character.id} n'est recrutable nulle part`).toBeDefined();
      expect(arc!.animeId).toBe(character.animeId);
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
    { animeId: "shippuden", arcCount: 15, mobRamp: 2.18, bossRamp: 2.34 },
    { animeId: "boruto", arcCount: 8, mobRamp: 2.17, bossRamp: 2.31 },
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
