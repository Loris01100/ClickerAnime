import { Show, createEffect, createSignal, onMount } from "solid-js";
import { Dynamic } from "solid-js/web";
import { createGameStore } from "./engine/gameState";
import { gameData } from "./data";
import AchievementsPanel from "./ui/AchievementsPanel";
import ClickStage from "./ui/ClickStage";
import Codex from "./ui/Codex";
import ChallengePanel from "./ui/ChallengePanel";
import PrestigeTree from "./ui/PrestigeTree";
import WorldMap from "./ui/WorldMap";
import WorldPortal from "./ui/WorldPortal";
import CurrencyBar from "./ui/CurrencyBar";
import RosterPanel from "./ui/RosterPanel";
import ProgressPanel from "./ui/ProgressPanel";
import ShopPanel from "./ui/ShopPanel";
import CrossoverPanel from "./ui/CrossoverPanel";
import Notices from "./ui/Notices";
import PackPanel from "./ui/PackPanel";
import ReflexPanel from "./ui/ReflexPanel";
import { themeOf } from "./ui/hue";
import { NEXT_THEME, setTheme, theme, THEME_LABEL } from "./ui/theme";
import { IconMonitor, IconMoon, IconSun } from "./ui/icons";
import { imagePathsForAnime, preloadImages, STARTUP_IMAGE_PATHS } from "./ui/preload";

const THEME_ICON = { system: IconMonitor, light: IconSun, dark: IconMoon };

export default function App() {
  const game = createGameStore(gameData);
  const [codexOpen, setCodexOpen] = createSignal(false);
  const [codexFocusId, setCodexFocusId] = createSignal<string | undefined>();
  const [portalOpen, setPortalOpen] = createSignal(false);
  const [achievementsOpen, setAchievementsOpen] = createSignal(false);
  const [prestigeTreeOpen, setPrestigeTreeOpen] = createSignal(false);
  const [challengesOpen, setChallengesOpen] = createSignal(false);
  const [shopOpen, setShopOpen] = createSignal(false);
  const [crossoverOpen, setCrossoverOpen] = createSignal(false);
  const [packsOpen, setPacksOpen] = createSignal(false);
  const [reflexOpen, setReflexOpen] = createSignal(false);
  let importInput: HTMLInputElement | undefined;
  let menu: HTMLDetailsElement | undefined;

  onMount(() => {
    preloadImages(STARTUP_IMAGE_PATHS);
    createEffect(() => {
      const animeId = game.activeArc()?.animeId;
      if (animeId) preloadImages(imagePathsForAnime(game.data, animeId));
    });
  });

  /** Toute entrée du menu le referme derriere elle — sinon il reste ouvert sous la modale. */
  function runFromMenu(action: () => void) {
    if (menu) menu.open = false;
    action();
  }

  /** Fermeture au clic (ou au tab) hors du menu : `<details>` ne le fait pas tout seul. */
  function onMenuFocusOut(event: FocusEvent) {
    const next = event.relatedTarget as Node | null;
    if (menu && (!next || !menu.contains(next))) menu.open = false;
  }

  /** The world being fought in, whose hue tints the whole shell — see `ui/hue.ts`'s `themeOf`. */
  const activeAnime = () => game.data.animes.find((a) => a.id === game.activeArc()?.animeId);

  /** Opens the Codex pre-selected on one character — used by RosterPanel's team rows. */
  function openCodexOn(characterId?: string) {
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
    // Revoking synchronously can cancel the download before the browser has read the blob.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  /**
   * The full wipe. Lives in the topbar rather than in a panel because it is also the way out of a
   * save the player can't otherwise recover from — and the topbar is the one thing on screen in
   * every state, including the world portal.
   */
  function onHardReset() {
    if (!confirm("Tout effacer ? Points de prestige, arbre, succès, packs et doublons compris. Irréversible.")) return;
    game.hardReset();
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
          {/*
            Menu unique façon PokéClicker plutôt qu'une rangée de boutons : la barre ne grandit plus
            à chaque panneau ajouté. `<details>` fait tout le travail d'ouverture ; `onFocusOut` le
            referme quand le focus quitte le menu, et chaque entrée le referme en se déclenchant.
          */}
          <details ref={menu} class="startmenu" onFocusOut={onMenuFocusOut}>
            <summary>Menu</summary>
            <div class="startmenu-items">
              <button onClick={() => runFromMenu(() => openCodexOn(undefined))}>Codex</button>
              <Show when={game.unlockedAnimes().length > 0}>
                <button onClick={() => runFromMenu(() => setPortalOpen(true))}>Mondes</button>
                <button onClick={() => runFromMenu(() => setShopOpen(true))}>Boutique</button>
                <button onClick={() => runFromMenu(() => setPacksOpen(true))}>Packs</button>
                <button onClick={() => runFromMenu(() => setCrossoverOpen(true))}>Crossover</button>
                <button onClick={() => runFromMenu(() => setChallengesOpen(true))}>Défis</button>
                <Show when={game.automationLevelOf("ability") > 0}>
                  <button onClick={() => runFromMenu(() => setReflexOpen(true))}>Plans</button>
                </Show>
              </Show>
              <button onClick={() => runFromMenu(() => setAchievementsOpen(true))}>Succès</button>
              <button onClick={() => runFromMenu(() => setPrestigeTreeOpen(true))}>Prestige</button>
              <hr />
              <button onClick={() => runFromMenu(exportSave)}>Exporter</button>
              <button onClick={() => runFromMenu(() => importInput?.click())}>Importer</button>
              <button class="danger" onClick={() => runFromMenu(onHardReset)}>
                Tout effacer
              </button>
              {/* Une sauvegarde automatique silencieuse ne se distingue pas d'une sauvegarde cassée. */}
              <small class="save-state muted" title="Sauvegarde automatique toutes les 5s">
                <Show when={game.lastSavedAt() > 0} fallback="pas encore sauvegardé">
                  sauvegardé il y a {Math.max(0, Math.round((game.now() - game.lastSavedAt()) / 1000))}s
                </Show>
              </small>
            </div>
          </details>
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
              onOpenShop={() => setShopOpen(true)}
              onOpenPrestige={() => setPrestigeTreeOpen(true)}
              onOpenCrossover={() => setCrossoverOpen(true)}
              onOpenPacks={() => setPacksOpen(true)}
            />
            <ClickStage game={game} />
            <WorldMap game={game} />
          </div>
          <ProgressPanel
            game={game}
            onOpenPrestige={() => setPrestigeTreeOpen(true)}
            onOpenChallenges={() => setChallengesOpen(true)}
          />
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

      <Show when={shopOpen()}>
        <ShopPanel game={game} onClose={() => setShopOpen(false)} />
      </Show>

      <Show when={packsOpen()}>
        <PackPanel game={game} onClose={() => setPacksOpen(false)} />
      </Show>

      <Show when={crossoverOpen()}>
        <CrossoverPanel game={game} onClose={() => setCrossoverOpen(false)} />
      </Show>

      <Show when={prestigeTreeOpen()}>
        <PrestigeTree game={game} onClose={() => setPrestigeTreeOpen(false)} />
      </Show>

      <Show when={reflexOpen()}>
        <ReflexPanel game={game} onClose={() => setReflexOpen(false)} />
      </Show>

      <Show when={challengesOpen()}>
        <ChallengePanel game={game} onClose={() => setChallengesOpen(false)} />
      </Show>

      <Notices game={game} />
    </>
  );
}
