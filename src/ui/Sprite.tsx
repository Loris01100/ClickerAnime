import { For, Show, createMemo } from "solid-js";
import { SPRITE_HEIGHT, SPRITE_WIDTH, spriteCells, spriteHue } from "./pixel";

/**
 * Real artwork, keyed by id: drop a file named `<id>.png` (or .webp/.jpg/.gif/.svg) into
 * src/assets/sprites/ — e.g. `naruto-uzumaki.png` for that character id — and it replaces the
 * generated sprite for that id everywhere, with no code change. See src/assets/sprites/README.md.
 */
const artworkFiles = import.meta.glob<string>("../assets/sprites/*.{png,jpg,jpeg,webp,gif,svg}", {
  eager: true,
  import: "default",
});
const artworkById = new Map(
  Object.entries(artworkFiles).map(([path, url]) => [path.replace(/^.*\//, "").replace(/\.[^.]+$/, ""), url])
);

/** Renders the sprite for an id: real artwork if one was dropped in, else the generated pixel
 * placeholder. `px` is the size of one placeholder pixel, in CSS pixels — real artwork is scaled
 * to fit the same box so swapping one in never shifts layout. */
export default function Sprite(props: { seed: string; px?: number; dim?: boolean }) {
  const px = () => props.px ?? 4;
  const width = () => SPRITE_WIDTH * px();
  const height = () => SPRITE_HEIGHT * px();
  const custom = createMemo(() => artworkById.get(props.seed));
  const cells = createMemo(() => spriteCells(props.seed));
  const hue = createMemo(() => spriteHue(props.seed));

  return (
    <Show
      when={custom()}
      fallback={
        <svg
          class="sprite pixel"
          classList={{ dim: props.dim }}
          width={width()}
          height={height()}
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
      }
    >
      {(src) => (
        <img
          class="sprite"
          classList={{ dim: props.dim }}
          src={src()}
          width={width()}
          height={height()}
          style={{ "object-fit": "contain" }}
          alt=""
        />
      )}
    </Show>
  );
}
