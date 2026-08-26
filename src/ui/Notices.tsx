import { For, Show } from "solid-js";
import { Dynamic } from "solid-js/web";
import type { GameStore } from "../engine/gameState";
import { IconBookmark, IconCheck, IconStar } from "./icons";

const NOTICE_ICON = { item: IconBookmark, recruit: IconStar, arc: IconCheck };

/**
 * The floating stack of "you just gained something" pop-ups. Drops, recruits and cleared arcs used
 * to happen in complete silence — the only way to notice one was to spot a counter move on its own.
 * The store owns the queue and expires it on its tick; this is presentation only.
 */
export default function Notices(props: { game: GameStore }) {
  return (
    <div class="notices" aria-live="polite">
      <For each={props.game.notices()}>
        {(notice) => (
          <button class={`notice notice-${notice.kind}`} onClick={() => props.game.dismissNotice(notice.id)}>
            <Dynamic component={NOTICE_ICON[notice.kind]} />
            <span>{notice.text}</span>
            <Show when={notice.count > 1}><strong>×{notice.count}</strong></Show>
          </button>
        )}
      </For>
    </div>
  );
}
