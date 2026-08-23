import type { JSX } from "solid-js";

/**
 * Small solid icon set replacing platform emoji, so every glyph renders identically (and
 * themeably, via `currentColor`) instead of drifting across OS emoji fonts. Each icon is
 * `1em` square by default so it drops into running text like the emoji it replaces.
 */
type IconProps = { size?: number | string; class?: string };

/**
 * `body` is a factory, not a materialized JSX value: Solid's JSX produces real DOM nodes, so a
 * value evaluated once at module load would be one shared node — the last simultaneous instance
 * on screen would steal it from every earlier one (e.g. several locked nodes rendering the same
 * `IconLock` at once). Calling `body()` fresh per instance gives each render its own nodes.
 */
function icon(viewBox: string, body: () => JSX.Element) {
  return (props: IconProps) => (
    <svg
      class={`icon ${props.class ?? ""}`}
      viewBox={viewBox}
      width={props.size ?? "1em"}
      height={props.size ?? "1em"}
      aria-hidden="true"
    >
      {body()}
    </svg>
  );
}

export const IconLock = icon("0 0 24 24", () => (
  <>
    <path d="M7 10V8a5 5 0 0 1 10 0v2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    <rect x="5" y="10" width="14" height="10" rx="2" fill="currentColor" />
  </>
));

export const IconCrown = icon("0 0 24 24", () => (
  <path d="M4 18h16l1-9-5 4-4-7-4 7-5-4 1 9z M4 19h16v2H4z" fill="currentColor" />
));

export const IconStar = icon("0 0 24 24", () => (
  <path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.8-6.2 3.8 1.6-7L2 9.2l7.1-.6L12 2z" fill="currentColor" />
));

export const IconTrophy = icon("0 0 24 24", () => (
  <>
    <path d="M7 4h10v5a5 5 0 0 1-10 0V4z" fill="currentColor" />
    <path d="M7 5H4a3 3 0 0 0 3 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
    <path d="M17 5h3a3 3 0 0 1-3 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
    <rect x="10.5" y="13" width="3" height="4" fill="currentColor" />
    <path d="M9 17h6l1 2H8l1-2z" fill="currentColor" />
    <rect x="7" y="19" width="10" height="2" rx="1" fill="currentColor" />
  </>
));

export const IconBookmark = icon("0 0 24 24", () => <path d="M6 3h12v18l-6-4-6 4V3z" fill="currentColor" />);

export const IconGlobe = icon("0 0 24 24", () => (
  <g fill="none" stroke="currentColor" stroke-width="1.7">
    <circle cx="12" cy="12" r="9" />
    <ellipse cx="12" cy="12" rx="4" ry="9" />
    <path d="M3.3 9h17.4M3.3 15h17.4" />
  </g>
));

export const IconMonitor = icon("0 0 24 24", () => (
  <g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M8 20h8M12 16v4" />
  </g>
));

export const IconSun = icon("0 0 24 24", () => (
  <g stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
    <circle cx="12" cy="12" r="4.5" fill="currentColor" stroke="none" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" />
  </g>
));

export const IconPin = icon("0 0 24 24", () => (
  <>
    <path d="M12 2C7.6 2 4 5.6 4 10c0 6 8 12 8 12s8-6 8-12c0-4.4-3.6-8-8-8z" fill="currentColor" />
    <circle cx="12" cy="10" r="2.6" fill="var(--panel)" />
  </>
));

export const IconMoon = icon("0 0 24 24", () => (
  <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z" fill="currentColor" />
));

/** Collapse/expand toggle for panel headers — points down when open, rotated closed via CSS. */
export const IconChevron = icon("0 0 24 24", () => (
  <path
    d="M6 9l6 6 6-6"
    fill="none"
    stroke="currentColor"
    stroke-width="2.2"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
));

/** Prestige tree — "Clic du Narrateur" branch. */
export const IconCursor = icon("0 0 24 24", () => <path d="M4 4l6.5 16 2-6.5L19 11.5 4 4z" fill="currentColor" />);

/** Prestige tree — "DPS Équipe" branch. */
export const IconBolt = icon("0 0 24 24", () => <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" fill="currentColor" />);

/** Prestige tree — "XP" branch. */
export const IconBook = icon("0 0 24 24", () => (
  <g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 5.5c2.2-1 5-1 8 .3V19c-3-1.3-5.8-1.3-8-.3V5.5z" />
    <path d="M20 5.5c-2.2-1-5-1-8 .3V19c3-1.3 5.8-1.3 8-.3V5.5z" />
  </g>
));

/** Prestige tree — "Destin" branch. */
export const IconDestiny = icon("0 0 24 24", () => (
  <g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <rect x="4.5" y="4.5" width="15" height="15" rx="3" />
    <circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" />
    <circle cx="7.5" cy="7.5" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="16.5" cy="16.5" r="1.3" fill="currentColor" stroke="none" />
  </g>
));

/** Main currency (the "argent" gagné en combat) — a cut gem, distinct from prestige's sparkle. */
export const IconDiamond = icon("0 0 24 24", () => <path d="M12 2 22 12 12 22 2 12z" fill="currentColor" />);

/** Prestige points — a four-point sparkle, distinct from the five-point rarity star. */
export const IconSparkle = icon("0 0 24 24", () => (
  <path d="M12 2 14 10 22 12 14 14 12 22 10 14 2 12 10 10z" fill="currentColor" />
));

/** Rarity — filled for "main" (pairs with the existing filled IconStar), outline for "secondary". */
export const IconStarOutline = icon("0 0 24 24", () => (
  <path
    d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.8-6.2 3.8 1.6-7L2 9.2l7.1-.6L12 2z"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linejoin="round"
  />
));

export const IconClock = icon("0 0 24 24", () => (
  <g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3.5 2" />
  </g>
));

export const IconChevronLeft = icon("0 0 24 24", () => (
  <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
));

export const IconChevronRight = icon("0 0 24 24", () => (
  <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
));

export const IconCheck = icon("0 0 24 24", () => (
  <path d="M5 13l4 4 10-10" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
));

/** Boutique panel header. */
export const IconShop = icon("0 0 24 24", () => (
  <g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 9l1-5h14l1 5" />
    <path d="M4 9a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0" />
    <path d="M5 9v10h14V9" />
    <path d="M10 19v-5h4v5" />
  </g>
));
