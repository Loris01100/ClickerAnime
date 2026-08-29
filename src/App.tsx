import { Show, Suspense, createEffect, createMemo, createSignal, lazy, onMount } from "solid-js";
import { Dynamic } from "solid-js/web";
import { createGameStore } from "./engine/gameState";
import { gameData } from "./data";
import ClickStage from "./ui/ClickStage";
import WorldMap from "./ui/WorldMap";
import WorldPortal from "./ui/WorldPortal";
import CurrencyBar from "./ui/CurrencyBar";
import RosterPanel from "./ui/RosterPanel";
import ProgressPanel from "./ui/ProgressPanel";
import Notices from "./ui/Notices";
import { PACK_COST } from "./engine/packs";
import { deriveDisclosure } from "./ui/disclosure";
import { PRESTIGE_TREE_CATEGORIES } from "./engine/prestigeTree";
import ObjectiveTrail from "./ui/ObjectiveTrail";

/*
 * Les overlays du menu partent dans leur propre chunk : ils ne sont montés qu'a la demande (chaque
 * `<Show>` plus bas), mais un import statique les mettait quand meme dans le bundle de depart —
 * pres d'un cinquieme du code pour des ecrans qu'une partie des sessions n'ouvre jamais.
 *
 * `WorldPortal` reste en import direct : c'est le premier ecran d'une nouvelle partie (le
 * `fallback` du `<Show>` principal), le differer retarderait le tout premier rendu.
 */
const AchievementsPanel = lazy(() => import("./ui/AchievementsPanel"));
const Codex = lazy(() => import("./ui/Codex"));
const ChallengePanel = lazy(() => import("./ui/ChallengePanel"));
const PrestigeTree = lazy(() => import("./ui/PrestigeTree"));
const ShopPanel = lazy(() => import("./ui/ShopPanel"));
const CrossoverPanel = lazy(() => import("./ui/CrossoverPanel"));
const PackPanel = lazy(() => import("./ui/PackPanel"));
const ReflexPanel = lazy(() => import("./ui/ReflexPanel"));
const ForgePanel = lazy(() => import("./ui/ForgePanel"));
import { themeOf } from "./ui/hue";
import { NEXT_THEME, setTheme, theme, THEME_LABEL } from "./ui/theme";
import { IconMonitor, IconMoon, IconSun } from "./ui/icons";
import { imagePathsForAnime, preloadImages, PRESTIGE_IMAGE_PATHS, STARTUP_IMAGE_PATHS } from "./ui/preload";

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
  const [forgeOpen, setForgeOpen] = createSignal(false);
  let importInput: HTMLInputElement | undefined;
  let menu: HTMLDetailsElement | undefined;

  onMount(() => {
    preloadImages(STARTUP_IMAGE_PATHS);
    createEffect(() => {
      const animeId = game.activeArc()?.animeId;
      if (animeId) preloadImages(imagePathsForAnime(game.data, animeId));
    });
    createEffect(() => {
      if (prestigeTreeOpen()) preloadImages(PRESTIGE_IMAGE_PATHS);
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

  /**
   * A fresh run starts with the fight and its immediate objective, then the shell grows with the
   * player's vocabulary. Lifetime counters keep a learned surface visible across prestige resets.
   */
  const disclosure = createMemo(() => {
    const counts = game.achievementCounts();
    return deriveDisclosure(
      {
        kills: (counts.mobsKilled ?? 0) + (counts.bossesKilled ?? 0),
        recruits: counts.charactersRecruited ?? 0,
        ownedCharacters: game.ownedCharacters().length,
        unlockedAbilities: game.unlockedAbilities().length,
        abilitiesActivated: counts.abilitiesActivated ?? 0,
        foundItems: game.foundItems().length,
        commonItemsCollected: counts.commonItemsCollected ?? 0,
        bossesKilled: counts.bossesKilled ?? 0,
        uniquesEquipped: counts.uniquesEquipped ?? 0,
        arcsCleared: counts.arcsCleared ?? 0,
        pendingPrestige: game.pendingPrestigeGain(),
        prestigePoints: game.prestige().prestigePoints,
        prestiges: counts.prestiges ?? 0,
        treeLevels: PRESTIGE_TREE_CATEGORIES.reduce((sum, category) => sum + game.branchLevelsOf(category.id), 0),
        maxWorldPoints: Math.max(0, ...game.data.animes.map((anime) => game.worldPointsOf(anime.id))),
        packsOpened: counts.packsOpened ?? 0,
        crossoverCrystals: game.crossoverCrystals(),
        crossoversActivated: counts.crossoversActivated ?? 0,
        mixedTeam: game.teamIsMixed(),
        canTravel: game.canTravel(),
        activeChallenge: Boolean(game.activeChallenge()),
        completedChallenges: game.completedChallengeIds().length,
      },
      Math.min(PACK_COST.main, PACK_COST.secondary)
    );
  });

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
    // Local date and time, not the epoch: the player sorts these by hand in their downloads
    // folder, and two exports the same day have to be told apart. `h` rather than `:` — Windows
    // refuses a colon in a filename.
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const time = `${pad(now.getHours())}h${pad(now.getMinutes())}`;
    link.download = `[Clicker-Anime][${date}][${time}].txt`;
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
              <Show when={disclosure().codex}>
                <button onClick={() => runFromMenu(() => openCodexOn(undefined))}>Codex</button>
              </Show>
              <Show when={game.unlockedAnimes().length > 0}>
                <Show when={disclosure().worlds}>
                  <button onClick={() => runFromMenu(() => setPortalOpen(true))}>Mondes</button>
                </Show>
                <Show when={disclosure().shop}>
                  <button onClick={() => runFromMenu(() => setShopOpen(true))}>Boutique</button>
                </Show>
                <Show when={disclosure().packs}>
                  <button onClick={() => runFromMenu(() => setPacksOpen(true))}>Packs</button>
                </Show>
                <Show when={disclosure().crossover}>
                  <button onClick={() => runFromMenu(() => setCrossoverOpen(true))}>Crossover</button>
                </Show>
                <Show when={disclosure().challenges}>
                  <button onClick={() => runFromMenu(() => setChallengesOpen(true))}>Défis</button>
                </Show>
                <Show when={game.automationLevelOf("ability") > 0}>
                  <button onClick={() => runFromMenu(() => setReflexOpen(true))}>Plans</button>
                </Show>
              </Show>
              <Show when={disclosure().achievements}>
                <button onClick={() => runFromMenu(() => setAchievementsOpen(true))}>Succès</button>
              </Show>
              <Show when={disclosure().prestige}>
                <button onClick={() => runFromMenu(() => setPrestigeTreeOpen(true))}>Prestige</button>
              </Show>
              <Show
                when={
                  disclosure().codex ||
                  disclosure().worlds ||
                  disclosure().shop ||
                  disclosure().packs ||
                  disclosure().crossover ||
                  disclosure().challenges ||
                  disclosure().achievements ||
                  disclosure().prestige
                }
              >
                <hr />
              </Show>
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
          <RosterPanel game={game} disclosure={disclosure} onSelectCharacter={openCodexOn} />
          <div class="column">
            <ObjectiveTrail game={game} />
            <Show when={disclosure().resources}>
              <CurrencyBar
                game={game}
                disclosure={disclosure}
                onOpenShop={() => setShopOpen(true)}
                onOpenPrestige={() => setPrestigeTreeOpen(true)}
                onOpenCrossover={() => setCrossoverOpen(true)}
                onOpenPacks={() => setPacksOpen(true)}
              />
            </Show>
            <ClickStage game={game} />
            <WorldMap game={game} />
          </div>
          <ProgressPanel
            game={game}
            disclosure={disclosure}
            onOpenPrestige={() => setPrestigeTreeOpen(true)}
            onOpenChallenges={() => setChallengesOpen(true)}
            onOpenForge={() => setForgeOpen(true)}
          />
        </main>
      </Show>

      {/*
        Une seule frontiere `Suspense` pour tous les overlays differes : il n'y en a jamais qu'un
        d'ouvert a la fois, et le fallback est vide — le panneau apparait quand son chunk est la,
        exactement comme il apparaissait quand son `<Show>` passait a vrai.
      */}
      <Suspense>
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

      <Show when={forgeOpen()}>
        <ForgePanel game={game} onClose={() => setForgeOpen(false)} />
      </Show>

      <Show when={challengesOpen()}>
        <ChallengePanel game={game} onClose={() => setChallengesOpen(false)} />
      </Show>
      </Suspense>

      <Notices game={game} />
    </>
  );
}
