import { For, Show, onCleanup, onMount } from "solid-js";
import type { GameStore } from "../engine/gameState";
import { LEVELS_PER_BRANCH, LEVELS_PER_NODE, PRESTIGE_TREE_CATEGORIES, type PrestigeTreeCategoryId } from "../engine/prestigeTree";
import Coin from "./Coin";
import { IconBolt, IconBook, IconBookmark, IconCursor, IconDestiny, IconGear, IconLock, IconStar } from "./icons";

const BRANCH_ICON: Record<PrestigeTreeCategoryId, typeof IconStar> = {
  narratorClick: IconCursor,
  teamDps: IconBolt,
  xp: IconBook,
  items: IconBookmark,
  destin: IconDestiny,
  automation: IconGear,
};

/** Existing theme tokens only — the tree is a meta system, its tints borrow from the functional palette. */
const BRANCH_TINT: Record<PrestigeTreeCategoryId, string> = {
  narratorClick: "var(--accent)",
  teamDps: "var(--accent-2)",
  xp: "var(--gold)",
  items: "var(--blue)",
  destin: "var(--good)",
  automation: "var(--boss)",
};

const nodeY = (index: number) => ((index + 0.5) / LEVELS_PER_NODE) * 100;

/** Each discipline grows with its own crooked silhouette instead of reading as a spreadsheet column. */
const BRANCH_PATH: Record<PrestigeTreeCategoryId, readonly number[]> = {
  narratorClick: [54, 38, 61, 42, 57],
  teamDps: [45, 62, 39, 58, 43],
  xp: [56, 42, 63, 47, 58],
  items: [44, 60, 38, 55, 41],
  destin: [55, 37, 59, 43, 62],
  automation: [43, 61, 46, 64, 48],
};

const BRANCH_ASSET: Record<PrestigeTreeCategoryId, string> = {
  narratorClick: "narrator-click",
  teamDps: "team-dps",
  xp: "xp",
  items: "items",
  destin: "destin",
  automation: "automation",
};

const nodeImage = (category: PrestigeTreeCategoryId, position: number) =>
  `/prestige-nodes/${BRANCH_ASSET[category]}-${position}.webp`;

/**
 * Six independent chains, one column per branch — see design.md §5. Each of the 5 nodes holds up
 * to 5 levels of the same repeating effect (`nodeLevelOf`); a node unlocks as soon as its
 * predecessor has just one level bought (`isNodeUnlockedFor`), not once it's maxed, so several
 * nodes of a branch are often purchasable — and levelling — at the same time.
 */
export default function PrestigeTree(props: { game: GameStore; onClose: () => void }) {
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") props.onClose();
  }
  onMount(() => document.addEventListener("keydown", onKeyDown));
  onCleanup(() => document.removeEventListener("keydown", onKeyDown));

  return (
    <div class="overlay" onClick={props.onClose}>
      <div
        class="modal prestige-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Arbre de prestige"
        onClick={(e) => e.stopPropagation()}
      >
        <header class="panel-head">
          <span>Arbre de prestige</span>
          <button onClick={props.onClose} aria-label="Fermer">
            ✕
          </button>
        </header>

        <div class="prestige-tree pad">
          <div class="prestige-tree-balance">
            <Coin kind="prestige" px={26} />
            <strong>{props.game.prestige().prestigePoints}</strong>
            <span class="muted">point{props.game.prestige().prestigePoints === 1 ? "" : "s"} de prestige</span>
          </div>

          <p class="muted small">
            Les points de prestige sont versés à la réinitialisation : plus la complétion du run est
            haute, plus elle en rapporte. Six branches indépendantes ; un seul niveau dans un nœud suffit à
            débloquer le suivant, et chaque nœud se rachète jusqu'à 5 fois pour le même effet à
            chaque niveau. La progression de l'arbre est permanente, elle survit à la
            réinitialisation.
          </p>

          <div class="prestige-branches">
            <For each={PRESTIGE_TREE_CATEGORIES}>
              {(category) => {
                const totalLevels = () => props.game.branchLevelsOf(category.id);
                const levelOf = (position: number) => props.game.nodeLevelOf(category.id, position);
                const unlockedAt = (position: number) => props.game.isNodeUnlockedFor(category.id, position);
                const maxedAt = (position: number) => levelOf(position) >= LEVELS_PER_NODE;
                const activeNodes = () => category.nodes.filter((n) => unlockedAt(n.position) && !maxedAt(n.position));
                const Icon = BRANCH_ICON[category.id];
                const path = BRANCH_PATH[category.id];

                return (
                  <div
                    class={`prestige-branch prestige-branch-${category.id}`}
                    style={{ "--branch-tint": BRANCH_TINT[category.id] }}
                  >
                    <div class="prestige-branch-head">
                      <Icon />
                      <span>{category.label}</span>
                      <small class="muted">
                        {totalLevels()}/{LEVELS_PER_BRANCH}
                      </small>
                    </div>

                    <div class="prestige-branch-canvas">
                      <svg class="prestige-branch-links" viewBox="0 0 100 100" preserveAspectRatio="none">
                        <For each={category.nodes}>
                          {(node, i) => (
                            <Show when={i() > 0}>
                              <line
                                class="prestige-link-line"
                                classList={{ unlocked: unlockedAt(node.position) }}
                                x1={path[i() - 1]}
                                y1={nodeY(i() - 1)}
                                x2={path[i()]}
                                y2={nodeY(i())}
                              />
                            </Show>
                          )}
                        </For>
                      </svg>

                      <For each={category.nodes}>
                        {(node, i) => {
                          const level = () => levelOf(node.position);
                          const unlocked = () => unlockedAt(node.position);
                          const maxed = () => maxedAt(node.position);
                          const isKeystone = node.position === LEVELS_PER_NODE;
                          const cost = () => props.game.nodeCostOf(category.id, node.position);
                          const affordable = () => {
                            const c = cost();
                            return c !== null && props.game.prestige().prestigePoints >= c;
                          };
                          return (
                            <Show
                              when={unlocked() && !maxed()}
                              fallback={
                                <div
                                  class="prestige-node"
                                  classList={{ bought: unlocked() && maxed(), locked: !unlocked(), keystone: isKeystone }}
                                  style={{ top: `${nodeY(i())}%`, left: `${path[i()]}%` }}
                                  title={`${node.label} — ${node.description} (niveau ${level()}/${LEVELS_PER_NODE})`}
                                >
                                  <img src={nodeImage(category.id, node.position)} alt="" />
                                  <Show when={!unlocked()}>
                                    <span class="prestige-node-lock"><IconLock /></span>
                                  </Show>
                                </div>
                              }
                            >
                              <button
                                class="prestige-node available"
                                classList={{ keystone: isKeystone }}
                                style={{ top: `${nodeY(i())}%`, left: `${path[i()]}%` }}
                                disabled={!affordable()}
                                title={`${node.label} — ${node.description} (niveau ${level()}/${LEVELS_PER_NODE})`}
                                onClick={() => props.game.purchaseTreeLevel(category.id, node.position)}
                              >
                                <img src={nodeImage(category.id, node.position)} alt="" />
                                <span class="prestige-node-level">
                                  {level()}/{LEVELS_PER_NODE}
                                </span>
                                <span class="prestige-node-cost">{cost()}</span>
                              </button>
                            </Show>
                          );
                        }}
                      </For>
                    </div>

                    <div class="prestige-branch-caption">
                      <Show
                        when={activeNodes().length > 0}
                        fallback={<p class="muted small">Branche au maximum.</p>}
                      >
                        <For each={activeNodes()}>
                          {(node) => (
                            <p class="muted small">
                              <strong>{node.label}</strong> · Niveau {levelOf(node.position)}/{LEVELS_PER_NODE} — {node.description}
                            </p>
                          )}
                        </For>
                      </Show>
                    </div>
                  </div>
                );
              }}
            </For>
            <div class="prestige-tree-heart" aria-hidden="true">
              <Coin kind="prestige" px={28} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
