# ClickerAnime — Agent Guide

This file is the first thing an AI coding agent should read before touching the codebase. It complements `CLAUDE.md` (technical architecture) and `design.md` (visual/UX intent). When a change touches architecture, update `CLAUDE.md`; when it touches design, update `design.md`; when it touches the conventions in this file, update this file.

## Project Overview

ClickerAnime is a browser idle/clicker prototype built with **SolidJS + Vite + TypeScript**. The live UI is in French, but engine identifiers, comments, and this guide are in English. The current content is Naruto-focused: `Naruto` (part 1) is the entry world and `Naruto Shippūden` is the sequel. More worlds are meant to be added later.

The app is a static SPA with no backend. Save data lives in `localStorage`; portraits are fetched live from AniList in the player's own browser.

## Technology Stack

| Layer | Tech |
|---|---|
| Framework | SolidJS 1.9 |
| Build tool | Vite 5.4 + `vite-plugin-solid` |
| Language | TypeScript 5.6 (ES2020, DOM, `jsx: preserve`, `jsxImportSource: solid-js`) |
| Styling | Hand-written `src/styles.css`; no UI framework (no Tailwind, no Bootstrap) |
| Testing | Vitest 2.1 (Node environment) |
| Package manager | npm |
| Runtime | Browser only; `localStorage` for persistence |

## Build & Development Commands

All commands run from the project root.

- `npm run dev` — start the Vite dev server.
- `npm run build` — run `tsc --noEmit` typecheck, then Vite production build. Output goes to `dist/`.
- `npm run preview` — preview the production build locally.
- `npm test` — run the full Vitest suite (`src/**/*.test.ts`).
- Single test: `npx vitest run src/engine/engine.test.ts -t "applies flat, then percent"`

The project currently has **97 passing tests** across three test files:

- `src/engine/engine.test.ts` — engine rules
- `src/ui/ui.test.ts` — small UI utilities
- `src/ui/anilist.test.ts` — AniList name matching logic

## Architecture

The code is deliberately split into two layers:

### 1. `src/engine/` — Pure Game Logic

No SolidJS imports (except `gameState.ts`, which is the seam). Every file exports plain functions over plain data. This keeps the rules testable in a Node environment without a DOM.

Key modules:

- `gameState.ts` — the only reactive seam. `createGameStore(data)` creates all signals, wires pure functions into memos, runs the 200 ms tick, and autosaves every 5 s.
- `types.ts` — shared domain types (`Anime`, `Arc`, `Character`, `Enemy`, `Item`, `AbilityDefinition`, `ShopOffer`, etc.).
- `combat.ts` — enemy spawning, HP/reward scaling, drop rolls.
- `growth.ts` — levels, XP curve, passives, narrator click power.
- `modifiers.ts` — `computeEffectiveStat` pipeline: `(base + flats) * (1 + Σpercents) * Πmultipliers`.
- `synergy.ts` — the "characters weaken outside their home arc/anime" multiplier.
- `progression.ts` — arc/world unlock order, difficulty tier (`DIFFICULTY_GROWTH = 2.5`).
- `prestige.ts` — prestige point gain and anime unlock shortcuts.
- `prestigeTree.ts` — five-branch prestige skill tree; 25 nodes, each rebuyable 5 times.
- `abilities.ts` — ability unlocking, cooldowns, same-stat sharing.
- `achievements.ts` — lifetime counters and tiered click-power bonuses.
- `shop.ts` — currency shop offers.

### 2. `src/ui/` — Presentation Only

Components take `game: GameStore` as their main prop and read accessors / call actions. No game rules belong here.

Key components:

- `App.tsx` — 3-column shell: roster / (currency + fight + map) / progress.
- `RosterPanel.tsx` — team, items, passive rank-ups.
- `ClickStage.tsx` — enemy, click interaction, abilities.
- `WorldMap.tsx` — arc nodes and travel.
- `ProgressPanel.tsx` — arc lists, travel, prestige reset, shop.
- `Codex.tsx` — full character list overlay.
- `WorldPortal.tsx` — world selection overlay.
- `PrestigeTree.tsx` — prestige skill tree overlay.
- `AchievementsPanel.tsx` — achievements overlay.
- `Sprite.tsx` — AniList portrait wrapper with empty fallback.
- `icons.tsx` — SVG icon set (factory pattern; never materialize JSX at module load).
- `describe.ts` — turns modifiers/abilities into French prose.
- `format.ts` — number formatting.
- `theme.ts` — light/dark/system theme toggle.
- `hue.ts` — deterministic world hue.
- `anilist.ts` — AniList GraphQL client + cache.

### 3. `src/data/` — Content

One file per world plus `index.ts`. Adding a world means adding a file and an entry in `worlds`.

- `naruto.ts` — Naruto part 1, 5 arcs.
- `shippuden.ts` — Naruto Shippūden, 15 arcs (generated from a table with a ~1.85 ramp).
- `index.ts` — concatenates all worlds into `gameData` and defines shop offers.

## Code Style Guidelines

- **Language split**: engine/comments/documentation in English; UI-visible strings in French.
- **No UI framework**: styling is hand-written CSS in `src/styles.css`. Every color must come from a CSS token defined in `:root` (light) and repeated in both dark blocks.
- **No hard-coded colors**: gradients, tints, and shadows must use existing tokens or a world hue derived from `themeOf(anime)` / `spriteHue(id)`.
- **No game logic in components**: if a displayed value is derived, add a pure helper in `engine/` and expose it on `GameStore`.
- **Prefer pure functions**: especially in `engine/`. RNG is only called in `gameState.ts`; `rollsDrop(enemy, roll)` takes the roll as an argument so tests don't stub `Math.random`.
- **Icon factory pattern**: in `icons.tsx`, `icon()` takes `body: () => JSX.Element`, not a materialized JSX value. Solid JSX creates real DOM nodes, so a shared node would only render in the last instance.
- **Comments**: explain *why*, not what. Keep French comments out of `engine/`; keep English comments out of UI strings.

## UI/UX Conventions

These come from `design.md` and are enforced in the existing components. Any new panel/view should follow them.

- **Density first**: PokéClicker-style dense panels. No modals for core repeated actions.
- **Panel anatomy**: `.panel` + `.panel-head` (title left, counter/chip/select right). Every panel is collapsible via `<PanelTitle>`.
- **Compact tables**: `.table-head` + rows sharing the same grid class, inside `.scroll`. No native `<table>`, no pagination.
- **Overlay behavior**: Escape to close, click backdrop to close, click content does not propagate.
- **Animations**: CSS/`@keyframes` or Solid signals only. Every animation must respect `prefers-reduced-motion` (see `.pop` in `styles.css` as the reference).
- **World tint**: `spriteHue(anime.id)` gives a deterministic HSL hue. Extend it rather than adding `if (anime.id === "...")` branches. Optional `themeHue` on `Anime` is the override point.
- **Glypths**: no raw Unicode symbols in JSX. Use `icons.tsx`.

## Testing Instructions

- Tests live next to the code they test: `*.test.ts`.
- Engine tests use Node environment and plain data fixtures. Do not import SolidJS in `engine/` tests unless you specifically need reactivity.
- UI tests (`ui.test.ts`, `anilist.test.ts`) also run in Node; DOM-dependent code is avoided or mocked.
- Run `npm test` before declaring work done.
- When adding new game rules, add a test in `engine.test.ts` or a focused test file. The project relies heavily on regression coverage.

## Persistence & Save Format

- Save key: `clicker-anime:save:v9` in `localStorage`.
- `buildSaveFile` in `gameState.ts` is the single source of truth for the on-disk shape.
- `readSave` shape-checks via `isValidSave` and falls back to a fresh run instead of throwing.
- **Bump the save-key version** only when a field is renamed or retyped. New optional fields can be absorbed with `??` defaults. Bumping wipes all existing saves.
- Export/import save is a base64-encoded `SaveFile` downloaded/uploaded as `.txt`.
- Combat state is intentionally **not** saved; a reload restarts the current fight.

## External Dependencies & APIs

- **AniList GraphQL** — portraits are fetched in the browser, not from a server. AniList blocks shared cloud IPs but allows CORS from end-user browsers. Cache key: `clicker-anime:portraits:v2`.
- **MCP servers** — `.mcp.json` registers `higgsfield` for image/video generation. These are dev-session tools, not runtime dependencies.

## Security Considerations

- The app runs entirely in the browser with no auth or secrets.
- Do not add backend code or server-side AniList calls — they will be blocked (`403`).
- Save import decodes and shape-checks before writing to `localStorage`. Keep it that way; never `eval` or execute imported data.
- AniList/Jikan images are copyrighted official artwork. The current project is a personal/non-commercial prototype; verify licensing before any public distribution or monetization.
- Do not store credentials or private keys in the repo.

## Deployment

The production artifact is the `dist/` directory produced by `npm run build`. It is a static SPA; serve `dist/index.html` from any static host. There is no server-side rendering.

## Common Pitfalls

- **Save key bumps**: only when shape breaks.
- **AniList name mismatches**: fix via `NAME_OVERRIDES` in `ui/anilist.ts`, not by renaming game data.
- **World-specific UI code**: add data or a hue override in `types.ts`/`data/`, not component branches.
- **Ability stacking**: same-target abilities replace each other via `replaceModifiersByTarget`.
- **Synergy outside home arc**: passives are dropped entirely outside a character's own anime unless evolved.

## Quick Reference

| File | Responsibility |
|---|---|
| `src/engine/gameState.ts` | Signals, tick, autosave, store API |
| `src/engine/types.ts` | Domain types |
| `src/engine/combat.ts` | Spawning, drops |
| `src/engine/growth.ts` | Levels, XP, passives |
| `src/engine/modifiers.ts` | Stat aggregation |
| `src/engine/synergy.ts` | Home-arc bonuses/malus |
| `src/engine/progression.ts` | World/arc unlock order |
| `src/engine/prestigeTree.ts` | Prestige skill tree |
| `src/data/index.ts` | World aggregation + shop |
| `src/App.tsx` | Root layout |
| `src/styles.css` | All styling |
| `CLAUDE.md` | Detailed technical architecture |
| `design.md` | Visual/UX design intent |
