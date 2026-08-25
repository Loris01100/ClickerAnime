import { Show, createResource } from "solid-js";
import { portraitUrl, type PortraitKind } from "./anilist";
import { IconSilhouette } from "./icons";

const BOX_COLS = 7;
const BOX_ROWS = 8;
/** Global size knob: every call site's `px` goes through it, so portraits grow everywhere at once. */
const SCALE = 1.3;

/**
 * Renders a portrait fetched live from AniList by name (see `anilist.ts`), scaled with
 * `object-fit: contain` into a box sized by `px`. While the lookup is pending, or once it resolves
 * to nothing, a `.sprite-empty` box of the same size holds a generic silhouette — no layout shift
 * either way, and no blank hole for the many anonymous mobs AniList has no card for.
 * For `kind="character"`, pass `anime` (the show's name) so the lookup searches that show's cast
 * instead of AniList's whole character database — without it, a common name (e.g. "Chiyo") can
 * resolve to an unrelated character from a different anime entirely.
 */
export default function Sprite(props: { name: string; kind: PortraitKind; anime?: string; px?: number; dim?: boolean }) {
  const px = () => (props.px ?? 4) * SCALE;
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
        >
          <IconSilhouette size="60%" />
        </div>
      }
    >
      {(src) => (
        <img
          class="sprite"
          classList={{ dim: props.dim, local: src().startsWith("/") }}
          src={src()}
          width={width()}
          height={height()}
          alt=""
        />
      )}
    </Show>
  );
}
