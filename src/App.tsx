import { Show, createSignal } from "solid-js";
import { Dynamic } from "solid-js/web";
import { createGameStore } from "./engine/gameState";
import { gameData } from "./data";
import ClickStage from "./ui/ClickStage";
import Codex from "./ui/Codex";
import WorldMap from "./ui/WorldMap";
import WorldPortal from "./ui/WorldPortal";
import CurrencyBar from "./ui/CurrencyBar";
import RosterPanel from "./ui/RosterPanel";
import ProgressPanel from "./ui/ProgressPanel";
import { NEXT_THEME, setTheme, theme, THEME_LABEL } from "./ui/theme";
import { IconGlobe, IconMonitor, IconMoon, IconSun } from "./ui/icons";

const THEME_ICON = { system: IconMonitor, light: IconSun, dark: IconMoon };

export default function App() {
  const game = createGameStore(gameData);
  const [codexOpen, setCodexOpen] = createSignal(false);
  const [portalOpen, setPortalOpen] = createSignal(false);

  function hardReset() {
    if (confirm("Effacer toute la progression, prestige et mondes compris ?")) game.hardReset();
  }

  return (
    <>
      <header class="topbar">
        <h1>ClickerAnime</h1>
        <div class="topbar-actions">
          <button
            class="theme-toggle"
            title={THEME_LABEL[theme()]}
            onClick={() => setTheme(NEXT_THEME[theme()])}
          >
            <Dynamic component={THEME_ICON[theme()]} />
          </button>
          <Show when={game.unlockedAnimes().length > 0}>
            <button onClick={() => setPortalOpen(true)}>
              <IconGlobe /> Mondes
            </button>
          </Show>
          <button onClick={() => setCodexOpen(true)}>Codex</button>
          <button onClick={() => game.save()}>Sauvegarder</button>
          <button onClick={hardReset}>Réinitialiser</button>
        </div>
      </header>

      <Show
        when={game.unlockedAnimes().length > 0}
        fallback={<WorldPortal game={game} />}
      >
        <main class="game">
          <RosterPanel game={game} />
          <div class="column">
            <CurrencyBar game={game} />
            <ClickStage game={game} />
            <WorldMap game={game} />
          </div>
          <ProgressPanel game={game} />
        </main>
      </Show>

      <Show when={codexOpen()}>
        <Codex game={game} onClose={() => setCodexOpen(false)} />
      </Show>

      <Show when={portalOpen()}>
        <WorldPortal game={game} onClose={() => setPortalOpen(false)} />
      </Show>
    </>
  );
}
