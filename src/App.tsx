import { For, Show } from "solid-js";
import { createGameStore } from "./engine/gameState";
import { sampleData } from "./data/sample";

const RECRUIT_COST = 10;

export default function App() {
  const game = createGameStore(sampleData);

  return (
    <main style={{ "font-family": "sans-serif", "max-width": "640px", margin: "2rem auto", padding: "0 1rem" }}>
      <h1>Clicker Anime (prototype logique)</h1>

      <section>
        <p>Monnaie: {game.currency().toFixed(1)}</p>
        <p>Puissance de clic: {game.clickPower().toFixed(2)}</p>
        <p>Revenu passif/s: {game.passiveIncomePerSecond().toFixed(2)}</p>
        <p>Points de prestige: {game.prestige().prestigePoints}</p>
        <button onClick={() => game.click()}>Cliquer</button>
        <button onClick={() => game.prestigeReset()} style={{ "margin-left": "1rem" }}>
          Prestige (reset la run)
        </button>
      </section>

      <section>
        <h2>Arc actif</h2>
        <For each={game.unlockedAnimes()}>
          {(anime) => (
            <div>
              <strong>{anime.name}</strong>
              <For each={game.data.arcs.filter((a) => a.animeId === anime.id)}>
                {(arc) => (
                  <label style={{ "margin-left": "1rem" }}>
                    <input
                      type="radio"
                      name="active-arc"
                      checked={game.activeArc()?.id === arc.id}
                      onChange={() => game.setActiveArc(arc.id)}
                    />
                    {arc.name}
                  </label>
                )}
              </For>
            </div>
          )}
        </For>
      </section>

      <section>
        <h2>Animes (déblocage prestige)</h2>
        <For each={game.data.animes}>
          {(anime) => (
            <div>
              {anime.name} — coût: {anime.unlockCost}
              <Show
                when={!game.prestige().unlockedAnimeIds.includes(anime.id)}
                fallback={<span> (débloqué)</span>}
              >
                <button onClick={() => game.unlockAnime(anime.id)} style={{ "margin-left": "0.5rem" }}>
                  Débloquer
                </button>
              </Show>
            </div>
          )}
        </For>
      </section>

      <section>
        <h2>Personnages disponibles</h2>
        <For each={game.availableCharacters()}>
          {(char) => (
            <div>
              {char.name} ({char.animeId})
              <Show
                when={!game.ownedCharacters().some((c) => c.id === char.id)}
                fallback={<span> — possédé</span>}
              >
                <button
                  onClick={() => game.recruitCharacter(char.id, RECRUIT_COST)}
                  style={{ "margin-left": "0.5rem" }}
                >
                  Recruter ({RECRUIT_COST})
                </button>
              </Show>
            </div>
          )}
        </For>
      </section>

      <section>
        <h2>Actifs débloqués</h2>
        <For each={game.unlockedAbilities()}>
          {(unlocked) => {
            const remaining = () => game.abilityCooldownRemaining(unlocked.ability.id);
            return (
              <div>
                {unlocked.ability.name} (source: {unlocked.sourceId})
                <button
                  onClick={() => game.activateAbility(unlocked.ability.id)}
                  disabled={remaining() > 0}
                  style={{ "margin-left": "0.5rem" }}
                >
                  {remaining() > 0 ? `Cooldown: ${Math.ceil(remaining() / 1000)}s` : "Activer"}
                </button>
              </div>
            );
          }}
        </For>
      </section>
    </main>
  );
}
