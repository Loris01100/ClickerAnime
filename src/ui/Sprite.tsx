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
 * either way, and no blank hole when a lookup misses. That placeholder is the **only** thing a
 * pending lookup may change on screen: see `src` below, which is why it never suspends an ancestor.
 * For `kind="character"`, pass `anime` (the show's name) so the lookup searches that show's cast
 * instead of AniList's whole character database — without it, a common name (e.g. "Chiyo") can
 * resolve to an unrelated character from a different anime entirely.
 */
export default function Sprite(props: {
  name: string;
  kind: PortraitKind;
  anime?: string;
  px?: number;
  dim?: boolean;
  /** A hidden Codex group keeps its placeholder and does not spend an AniList request. */
  load?: boolean;
}) {
  const px = () => (props.px ?? 4) * SCALE;
  const width = () => BOX_COLS * px();
  const height = () => BOX_ROWS * px();

  const [portrait] = createResource(
    () => (props.load === false ? false : `${props.kind}:${props.anime ?? ""}:${props.name}`),
    () => portraitUrl(props.name, props.kind, props.anime)
  );

  /**
   * La source de l'image, **lue sans jamais suspendre**. C'est la seule subtilité du composant, et
   * elle est load-bearing : lire `portrait()` pendant que la ressource est en vol jette vers la
   * `<Suspense>` la plus proche, et `App.tsx` en a une seule autour de tous les overlays différés.
   * Chaque portrait en cours de chargement détachait donc **l'overlay entier** du DOM — mesuré à 43 %
   * du temps dans la Tour de l'Ascension, qui change d'adversaire toutes les une à deux secondes :
   * le panneau clignotait en entier au lieu de remplacer une vignette.
   *
   * Tester `state` d'abord ne suspend pas (c'est un signal comme un autre) et ne laisse lire la
   * valeur que lorsqu'elle est là. Le placeholder ci-dessous redevient ce qu'il a toujours prétendu
   * être : la façon dont *ce* composant montre son propre chargement, à sa propre échelle.
   */
  const src = () => (portrait.state === "ready" ? portrait() : null);

  return (
    <Show
      when={src()}
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
        // `lazy`/`async` : le Codex en affiche des dizaines d'un coup, toutes hors écran au premier
        // rendu. La boîte est déjà dimensionnée par `width`/`height`, donc rien ne bouge quand
        // l'image arrive — c'est ce qui rend le chargement différé gratuit ici.
        <img
          class="sprite"
          classList={{ dim: props.dim }}
          src={src()}
          width={width()}
          height={height()}
          loading="lazy"
          decoding="async"
          alt=""
        />
      )}
    </Show>
  );
}
