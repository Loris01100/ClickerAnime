import { createGameStore } from "./engine/gameState";
import { sampleData } from "./data/sample";
import ClickStage from "./ui/ClickStage";
import RosterPanel from "./ui/RosterPanel";
import ProgressPanel from "./ui/ProgressPanel";
import { fmt } from "./ui/format";

export default function App() {
  const game = createGameStore(sampleData);

  function hardReset() {
    if (confirm("Effacer toute la progression, prestige compris ?")) game.hardReset();
  }

  return (
    <>
      <header class="topbar">
        <h1>ClickerAnime</h1>
        <div class="wallet">
          <span class="coin">◆</span>
          <strong>{fmt(game.currency())}</strong>
          <small>+{fmt(game.passiveIncomePerSecond())}/s</small>
        </div>
        <div class="topbar-actions">
          <button onClick={() => game.save()}>Sauvegarder</button>
          <button onClick={hardReset}>Réinitialiser</button>
        </div>
      </header>

      <main class="game">
        <RosterPanel game={game} />
        <ClickStage game={game} />
        <ProgressPanel game={game} />
      </main>
    </>
  );
}
