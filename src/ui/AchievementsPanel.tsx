import { For, onCleanup, onMount } from "solid-js";
import type { GameStore } from "../engine/gameState";
import {
  ACHIEVEMENT_CATEGORIES,
  achievementNextThreshold,
  achievementTierBonus,
  achievementTiersCompleted,
} from "../engine/achievements";
import { describeModifier } from "./describe";
import { fmt } from "./format";
import { IconCheck } from "./icons";

/**
 * Five lifetime ladders (kills, boss kills, recruits, common items, abilities used), each tier a
 * permanent click-power bonus that survives prestige — see gameState's achievementCounts.
 */
export default function AchievementsPanel(props: { game: GameStore; onClose: () => void }) {
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") props.onClose();
  }
  onMount(() => document.addEventListener("keydown", onKeyDown));
  onCleanup(() => document.removeEventListener("keydown", onKeyDown));

  const countOf = (categoryId: string) => props.game.achievementCounts()[categoryId] ?? 0;

  return (
    <div class="overlay" onClick={props.onClose}>
      <div class="modal" role="dialog" aria-modal="true" aria-label="Succès" onClick={(e) => e.stopPropagation()}>
        <header class="panel-head">
          <span>Succès</span>
          <button onClick={props.onClose} aria-label="Fermer">
            ✕
          </button>
        </header>

        <div class="codex-detail scroll">
          <For each={ACHIEVEMENT_CATEGORIES}>
            {(category) => {
              const count = () => countOf(category.id);
              const completed = () => achievementTiersCompleted(category, count());
              const next = () => achievementNextThreshold(category, count());
              const floor = () => category.tiers[completed() - 1] ?? 0;
              const pct = () => {
                const target = next();
                if (target === null) return 100;
                const span = target - floor();
                return span > 0 ? Math.min(100, ((count() - floor()) / span) * 100) : 100;
              };
              return (
                <div class="codex-block">
                  <h4>
                    {category.label} — palier {completed()} / {category.tiers.length}
                  </h4>
                  <div class="bar xp-bar">
                    <div class="bar-fill" style={{ width: `${pct()}%` }} />
                  </div>
                  <div class="codex-row">
                    <span class="muted">Progression</span>
                    <strong>
                      {fmt(count())}
                      {next() !== null ? ` / ${fmt(next()!)}` : " · complet"}
                    </strong>
                  </div>
                  <For each={category.tiers}>
                    {(threshold, i) => (
                      <div class="codex-row">
                        <span class="muted">
                          Palier {i() + 1} ({fmt(threshold)})
                        </span>
                        <strong classList={{ muted: i() >= completed() }}>
                          {describeModifier({
                            id: "achievement",
                            target: "clickPower",
                            kind: "percent",
                            value: achievementTierBonus(i()),
                          })}
                          {i() < completed() ? <> <IconCheck class="good" /></> : null}
                        </strong>
                      </div>
                    )}
                  </For>
                </div>
              );
            }}
          </For>
        </div>
      </div>
    </div>
  );
}
