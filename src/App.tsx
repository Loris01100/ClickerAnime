import { Show, createSignal } from "solid-js";
import { Dynamic } from "solid-js/web";
import { createGameStore } from "./engine/gameState";
import { gameData } from "./data";
import AchievementsPanel from "./ui/AchievementsPanel";
import ClickStage from "./ui/ClickStage";
import Codex from "./ui/Codex";
import PrestigeTree from "./ui/PrestigeTree";
import WorldMap from "./ui/WorldMap";
import WorldPortal from "./ui/WorldPortal";
import CurrencyBar from "./ui/CurrencyBar";
import RosterPanel from "./ui/RosterPanel";
import ProgressPanel from "./ui/ProgressPanel";
import { themeOf } from "./ui/hue";
import { NEXT_THEME, setTheme, theme, THEME_LABEL } from "./ui/theme";
import { IconCrown, IconGlobe, IconMonitor, IconMoon, IconSun, IconTrophy } from "./ui/icons";

const THEME_ICON = { system: IconMonitor, light: IconSun, dark: IconMoon };

export default function App() {
  const game = createGameStore(gameData);
  const [codexOpen, setCodexOpen] = createSignal(false);
  const [codexFocusId, setCodexFocusId] = createSignal<string | undefined>();
  const [portalOpen, setPortalOpen] = createSignal(false);
  const [achievementsOpen, setAchievementsOpen] = createSignal(false);
  const [prestigeTreeOpen, setPrestigeTreeOpen] = createSignal(false);
  let importInput: HTMLInputElement | undefined;

  /** The world being fought in, whose hue tints the whole shell — see `ui/hue.ts`'s `themeOf`. */
  const activeAnime = () => game.data.animes.find((a) => a.id === game.activeArc()?.animeId);

  /** Opens the Codex pre-selected on one character — used by RosterPanel's team rows. */
  function openCodexOn(characterId: string) {
    setCodexFocusId(characterId);
    setCodexOpen(true);
  }

  /** Downloads the current save as a portable .txt blob — see gameState's exportSave. */
  function exportSave() {
    const blob = new Blob([game.exportSave()], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `clickeranime-save-${Date.now()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function onImportFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    const text = await file.text();
    if (!game.importSave(text)) alert("Fichier de sauvegarde invalide.");
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
          <button
            onClick={() => {
              setCodexFocusId(undefined);
              setCodexOpen(true);
            }}
          >
            Codex
          </button>
          <button onClick={() => setAchievementsOpen(true)}>
            <IconTrophy /> Succès
          </button>
          <button onClick={() => setPrestigeTreeOpen(true)}>
            <IconCrown /> Prestige
          </button>
          <button onClick={exportSave}>Exporter</button>
          <button onClick={() => importInput?.click()}>Importer</button>
          <input
            ref={importInput}
            type="file"
            accept=".txt"
            style={{ display: "none" }}
            onChange={onImportFile}
          />
        </div>
      </header>

      <Show
        when={game.unlockedAnimes().length > 0}
        fallback={<WorldPortal game={game} />}
      >
        <main class="game" style={{ "--world-hue": themeOf(activeAnime()) }}>
          <RosterPanel game={game} onSelectCharacter={openCodexOn} />
          <div class="column">
            <CurrencyBar
              game={game}
              onOpenPrestige={() => setPrestigeTreeOpen(true)}
              onOpenWorlds={() => setPortalOpen(true)}
            />
            <ClickStage game={game} />
            <WorldMap game={game} />
          </div>
          <ProgressPanel game={game} />
        </main>
      </Show>

      <Show when={codexOpen()}>
        <Codex game={game} onClose={() => setCodexOpen(false)} initialSelectedId={codexFocusId()} />
      </Show>

      <Show when={portalOpen()}>
        <WorldPortal game={game} onClose={() => setPortalOpen(false)} />
      </Show>

      <Show when={achievementsOpen()}>
        <AchievementsPanel game={game} onClose={() => setAchievementsOpen(false)} />
      </Show>

      <Show when={prestigeTreeOpen()}>
        <PrestigeTree game={game} onClose={() => setPrestigeTreeOpen(false)} />
      </Show>
    </>
  );
}
