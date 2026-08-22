import { hashSeed } from "./hash";
import type { Arc } from "./types";

/** Boustrophedon grid width; taller worlds just grow more rows. */
export const MAP_COLS = 4;

/** Keeps a jittered point inside [0.32, 0.68] of its cell — never crosses into a neighbour. */
const JITTER_FRACTION = 0.18;

export interface MapNode {
  arc: Arc;
  col: number;
  row: number;
  /** 0..1, fraction of the map canvas width/height. */
  x: number;
  y: number;
}

export interface MapLayout {
  nodes: MapNode[];
  cols: number;
  rows: number;
}

function jitter(seed: string, axis: "x" | "y"): number {
  return (hashSeed(`${seed}:${axis}`) % 1000) / 500 - 1; // -1..1
}

/**
 * Lays an anime's arcs out on a snake path (boustrophedon grid, alternating direction per row) so
 * any arc count fits without hand-authored coordinates. Each node is nudged off its cell centre by
 * an id-seeded offset, so the path reads as a route rather than a spreadsheet of dots.
 *
 * `arcs` must already be in progression order — exactly what `arcsOfAnime` returns.
 */
export function layoutArcs(arcs: Arc[]): MapLayout {
  if (arcs.length === 0) return { nodes: [], cols: 1, rows: 1 };

  const cols = Math.min(MAP_COLS, arcs.length);
  const rows = Math.ceil(arcs.length / cols);

  const nodes = arcs.map((arc, index) => {
    const row = Math.floor(index / cols);
    const local = index % cols;
    const col = row % 2 === 0 ? local : cols - 1 - local;
    const x = (col + 0.5 + jitter(arc.id, "x") * JITTER_FRACTION) / cols;
    const y = (row + 0.5 + jitter(arc.id, "y") * JITTER_FRACTION) / rows;
    return { arc, col, row, x, y };
  });

  return { nodes, cols, rows };
}
