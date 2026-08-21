import { For, Show, createSignal } from "solid-js";
import { createGameStore } from "./engine/gameState";
import { sampleData } from "./data/sample";
import ClickStage from "./ui/ClickStage";
import Codex from "./ui/Codex";
import WorldMap from "./ui/WorldMap";
import CurrencyBar from "./ui/CurrencyBar";
import RosterPanel from "./ui/RosterPanel";
import ProgressPanel from "./ui/ProgressPanel";
import { NEXT_THEME, setTheme, theme, THEME_ICON, THEME_LABEL } from "./ui/theme";

export default function App() {
  const game = createGameStore(sampleData);
  const [codexOpen, setCodexOpen] = createSignal(false);

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
            {THEME_ICON[theme()]}
          </button>
          <button onClick={() => setCodexOpen(true)}>Codex</button>
          <button onClick={() => game.save()}>Sauvegarder</button>
          <button onClick={hardReset}>Réinitialiser</button>
        </div>
      </header>

      <Show
        when={game.unlockedAnimes().length > 0}
        fallback={
          <div class="picker">
            <h2>Par quel anime voulez-vous commencer ?</h2>
            <p class="muted">
              Le premier monde est gratuit. Chaque monde terminé rend le suivant plus difficile.
            </p>
            <div class="picker-grid">
              <For each={game.data.animes}>
                {(anime) => (
                  <button class="picker-card" onClick={() => game.travelTo(anime.id)}>
                    <strong>{anime.name}</strong>
                    <small class="muted">{game.arcsOf(anime.id).length} arcs</small>
                  </button>
                )}
              </For>
            </div>
          </div>
        }
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
    </>
  );
}
