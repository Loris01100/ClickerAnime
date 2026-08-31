import type { GameData } from "../engine/gameState";
import type { BossTrait, Enemy } from "../engine/types";

/*
 * A generated world (Shippūden, Boruto, …) has a rigidly regular arc shape: three farm mobs sharing
 * one drop, a handful of recruitable rivals that all sit at the same hp, and one boss. Every id in
 * it is mechanical — `<world>-<slug>-mob-2`, `<world>-<slug>-rival-<charId>`, `<world>-<slug>-boss`
 * — and `animeId`, `order` and `dropChance` never vary. Writing that out by hand is ~25 lines an arc
 * of pure boilerplate around ~5 real numbers, and every hand-typed id is one `validate:data` has to
 * catch.
 *
 * `buildWorldArcs` expands a compact per-arc spec into the exact `GameData["arcs"]` a world used to
 * spell out. It invents no balance: every hp and reward is still supplied per enemy, straight from
 * the simulator-fitted table (`npm run sim`). It only removes the boilerplate — ids, the constant
 * fields, the nesting — so the numbers stay the single source of truth. Hand-authored entry worlds
 * (Naruto, Hunter x Hunter, Bleach) deliberately keep their literals; this is for the table worlds.
 */

/** One farm mob: its hp and reward are authored, its id and shared fields are derived. */
export interface MobSpec {
  name: string;
  hp: number;
  reward: number;
}

/** A recruitable rival. Every rival in an arc shares the arc's `rivalHp`/`rivalReward`. */
export interface RivalSpec {
  name: string;
  /** recruited on defeat; also the tail of the derived id `<world>-<slug>-rival-<charId>` */
  charId: string;
}

export interface BossSpec {
  name: string;
  hp: number;
  reward: number;
  timerMs: number;
  item: string;
  /** recruited on defeat, when the boss joins the roster */
  charId?: string;
  /** a bespoke story trait; absent lets `withBossTraits` assign a rotating preset */
  trait?: BossTrait;
}

export interface ArcSpec {
  /** the tail of every id in the arc: `<world>-<slug>-…` */
  slug: string;
  name: string;
  /** position on the world map, as 0..1 fractions: `[mapX, mapY]` */
  map: [number, number];
  mobsToBoss: number;
  /** the drop the three farm mobs all hand out */
  mobItem: string;
  mobs: MobSpec[];
  rivals?: RivalSpec[];
  /** shared across every rival in the arc; required when `rivals` is non-empty */
  rivalHp?: number;
  rivalReward?: number;
  boss: BossSpec;
}

const DROP_CHANCE = 0.15;

/** Expands compact arc specs into a world's full `arcs` array. Pair with `withBossTraits`. */
export function buildWorldArcs(world: string, specs: ArcSpec[]): GameData["arcs"] {
  return specs.map((spec, order) => {
    const base = `${world}-${spec.slug}`;

    const mobs: Enemy[] = spec.mobs.map((mob, i) => ({
      id: `${base}-mob-${i + 1}`,
      itemId: spec.mobItem,
      dropChance: DROP_CHANCE,
      name: mob.name,
      baseHp: mob.hp,
      reward: mob.reward,
    }));

    const rivals: Enemy[] = (spec.rivals ?? []).map((rival) => ({
      id: `${base}-rival-${rival.charId}`,
      name: rival.name,
      baseHp: spec.rivalHp!,
      reward: spec.rivalReward!,
      characterId: rival.charId,
    }));

    const boss: Enemy = {
      id: `${base}-boss`,
      itemId: spec.boss.item,
      name: spec.boss.name,
      baseHp: spec.boss.hp,
      reward: spec.boss.reward,
      timerMs: spec.boss.timerMs,
      ...(spec.boss.charId ? { characterId: spec.boss.charId } : {}),
      ...(spec.boss.trait ? { bossTrait: spec.boss.trait } : {}),
    };

    return {
      id: base,
      animeId: world,
      name: spec.name,
      order,
      mapX: spec.map[0],
      mapY: spec.map[1],
      mobsToBoss: spec.mobsToBoss,
      mobs: [...mobs, ...rivals],
      boss,
    };
  });
}
