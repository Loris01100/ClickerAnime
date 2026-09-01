import { Show, createMemo, createSignal } from "solid-js";
import { achievementCount } from "../engine/achievements";
import type { GameStore } from "../engine/gameState";
import PanelTitle from "./PanelTitle";
import { tutorialObjective } from "./objective";

/** One compact contextual objective at a time; disappears after the first passive rank. */
export default function ObjectiveTrail(props: { game: GameStore }) {
  const [open, setOpen] = createSignal(true);

  const tutorialArc = createMemo(() => {
    const active = props.game.activeArc();
    if (active && props.game.arcCleared(active)) return active;
    return props.game.data.arcs.find((arc) => props.game.arcCleared(arc)) ?? active;
  });

  const commonItem = createMemo(() => {
    const arc = tutorialArc();
    if (!arc) return null;
    for (const enemy of arc.mobs) {
      if (!enemy.itemId) continue;
      const item = props.game.itemOf(enemy.itemId);
      if (item?.kind === "common") return item;
    }
    return null;
  });

  const passiveCharacter = createMemo(() => {
    const item = commonItem();
    if (!item) return null;
    return props.game
      .ownedCharacters()
      .find((character) => character.passive && props.game.passiveItemOf(character)?.id === item.id) ?? null;
  });

  const objective = createMemo(() => {
    const counts = props.game.achievementCounts();
    const active = props.game.activeArc();
    const item = commonItem();
    return tutorialObjective({
      recruits: achievementCount(counts, "charactersRecruited", props.game.ownedCharacters().length),
      arcsCleared: achievementCount(
        counts,
        "arcsCleared",
        props.game.data.arcs.filter((arc) => props.game.arcCleared(arc)).length
      ),
      passiveRanksBought: achievementCount(
        counts,
        "passiveRanksBought",
        props.game.ownedCharacters().reduce((sum, character) => sum + props.game.passiveRankOf(character), 0)
      ),
      arcName: active?.name ?? "",
      arcKills: active ? props.game.killsIn(active) : 0,
      arcKillsNeeded: active?.mobsToBoss ?? 1,
      itemName: item?.name ?? "",
      itemArcName: tutorialArc()?.name ?? "",
      itemCopies: item ? props.game.countOf(item.id) : 0,
      passiveCharacterName: passiveCharacter()?.name ?? "",
    });
  });

  const percent = () => {
    const current = objective();
    return current ? Math.min(100, (current.progress / Math.max(1, current.target)) * 100) : 0;
  };

  return (
    <Show when={objective()}>
      {(current) => (
        <section class="panel objective-panel progressive-reveal">
          <header class="panel-head">
            <PanelTitle open={open()} onToggle={() => setOpen(!open())}>
              Prochain objectif
            </PanelTitle>
            <small class="muted">{current().step}/4</small>
          </header>
          <Show when={open()}>
            <div class="objective-body">
              <div class="objective-copy">
                <strong>{current().title}</strong>
                <small class="muted">{current().detail}</small>
              </div>
              <strong class="objective-count">
                {Math.min(current().progress, current().target)}/{current().target}
              </strong>
              <div class="bar objective-bar" title={`${current().progress} / ${current().target}`}>
                <div class="bar-fill" style={{ width: `${percent()}%` }} />
              </div>
            </div>
          </Show>
        </section>
      )}
    </Show>
  );
}
