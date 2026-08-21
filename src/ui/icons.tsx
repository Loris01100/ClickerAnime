import type { JSX } from "solid-js";

/**
 * Small solid icon set replacing platform emoji, so every glyph renders identically (and
 * themeably, via `currentColor`) instead of drifting across OS emoji fonts. Each icon is
 * `1em` square by default so it drops into running text like the emoji it replaces.
 */
type IconProps = { size?: number | string; class?: string };

function icon(viewBox: string, body: JSX.Element) {
  return (props: IconProps) => (
    <svg
      class={`icon ${props.class ?? ""}`}
      viewBox={viewBox}
      width={props.size ?? "1em"}
      height={props.size ?? "1em"}
      aria-hidden="true"
    >
      {body}
    </svg>
  );
}

export const IconLock = icon(
  "0 0 24 24",
  <>
    <path d="M7 10V8a5 5 0 0 1 10 0v2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    <rect x="5" y="10" width="14" height="10" rx="2" fill="currentColor" />
  </>
);

export const IconCrown = icon(
  "0 0 24 24",
  <path d="M4 18h16l1-9-5 4-4-7-4 7-5-4 1 9z M4 19h16v2H4z" fill="currentColor" />
);

export const IconStar = icon(
  "0 0 24 24",
  <path
    d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.8-6.2 3.8 1.6-7L2 9.2l7.1-.6L12 2z"
    fill="currentColor"
  />
);

export const IconTrophy = icon(
  "0 0 24 24",
  <>
    <path d="M7 4h10v5a5 5 0 0 1-10 0V4z" fill="currentColor" />
    <path d="M7 5H4a3 3 0 0 0 3 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
    <path d="M17 5h3a3 3 0 0 1-3 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
    <rect x="10.5" y="13" width="3" height="4" fill="currentColor" />
    <path d="M9 17h6l1 2H8l1-2z" fill="currentColor" />
    <rect x="7" y="19" width="10" height="2" rx="1" fill="currentColor" />
  </>
);

export const IconBookmark = icon("0 0 24 24", <path d="M6 3h12v18l-6-4-6 4V3z" fill="currentColor" />);

export const IconGlobe = icon(
  "0 0 24 24",
  <g fill="none" stroke="currentColor" stroke-width="1.7">
    <circle cx="12" cy="12" r="9" />
    <ellipse cx="12" cy="12" rx="4" ry="9" />
    <path d="M3.3 9h17.4M3.3 15h17.4" />
  </g>
);

export const IconMonitor = icon(
  "0 0 24 24",
  <g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M8 20h8M12 16v4" />
  </g>
);

export const IconSun = icon(
  "0 0 24 24",
  <g stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
    <circle cx="12" cy="12" r="4.5" fill="currentColor" stroke="none" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" />
  </g>
);

export const IconMoon = icon(
  "0 0 24 24",
  <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z" fill="currentColor" />
);
