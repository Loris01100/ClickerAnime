import { Show, createResource } from "solid-js";
import { portraitUrl, type PortraitKind } from "./anilist";

const BOX_COLS = 7;
const BOX_ROWS = 8;

/**
 * Renders a portrait fetched live from AniList by name (see `anilist.ts`), scaled with
 * `object-fit: contain` into a box sized by `px`. While the lookup is pending, or once it resolves
 * to nothing, an empty `.sprite-empty` placeholder fills the same box — no layout shift either way.
 * For `kind="character"`, pass `anime` (the show's name) so the lookup searches that show's cast
 * instead of AniList's whole character database — without it, a common name (e.g. "Chiyo") can
 * resolve to an unrelated character from a different anime entirely.
 */
export default function Sprite(props: { name: string; kind: PortraitKind; anime?: string; px?: number; dim?: boolean }) {
  const px = () => props.px ?? 4;
  const width = () => BOX_COLS * px();
  const height = () => BOX_ROWS * px();

  const [portrait] = createResource(
    () => `${props.kind}:${props.anime ?? ""}:${props.name}`,
    () => portraitUrl(props.name, props.kind, props.anime)
  );

  return (
    <Show
      when={portrait()}
      fallback={
        <div
          class="sprite sprite-empty"
          classList={{ dim: props.dim }}
          style={{ width: `${width()}px`, height: `${height()}px` }}
          aria-hidden="true"
        />
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
