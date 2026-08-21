import { For, Show, createMemo } from "solid-js";
import { SPRITE_HEIGHT, SPRITE_WIDTH, spriteCells, spriteHue } from "./pixel";

/** Renders the generated pixel sprite for an id. `px` is the size of one pixel, in CSS pixels. */
export default function Sprite(props: { seed: string; px?: number; dim?: boolean }) {
  const px = () => props.px ?? 4;
  const cells = createMemo(() => spriteCells(props.seed));
  const hue = createMemo(() => spriteHue(props.seed));

  return (
    <svg
      class="sprite"
      classList={{ dim: props.dim }}
      width={SPRITE_WIDTH * px()}
      height={SPRITE_HEIGHT * px()}
      viewBox={`0 0 ${SPRITE_WIDTH} ${SPRITE_HEIGHT}`}
      shape-rendering="crispEdges"
      aria-hidden="true"
    >
      <For each={cells()}>
        {(row, y) => (
          <For each={row}>
            {(cell, x) => (
              <Show when={cell > 0}>
                <rect
                  x={x()}
                  y={y()}
                  width="1"
                  height="1"
                  fill={`hsl(${hue()} 62% ${cell === 2 ? 72 : 50}%)`}
                />
              </Show>
            )}
          </For>
        )}
      </For>
    </svg>
  );
}
