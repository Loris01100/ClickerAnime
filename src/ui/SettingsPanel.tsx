import { For, Show, onCleanup, onMount } from "solid-js";
import type { GameStore } from "../engine/gameState";
import { setTheme, theme, type Theme } from "./theme";
import { setTelemetryConsent, telemetryConsent } from "./telemetry";
import { playCue, soundPrefs, updateSoundPrefs } from "./sound";
import type { SoundPrefs } from "./soundCues";

/** Un curseur de volume, 0 à 100 % par pas de 5. Relâché, il fait entendre ce qu'il vient de régler. */
function VolumeSlider(props: { label: string; field: "effects" | "music"; onRelease?: () => void }) {
  const percent = () => Math.round(soundPrefs()[props.field] * 100);
  return (
    <label class="settings-row">
      <span>{props.label}</span>
      <input
        type="range"
        class="settings-slider"
        min="0"
        max="100"
        step="5"
        value={percent()}
        disabled={soundPrefs().muted}
        aria-valuetext={`${percent()} %`}
        onInput={(event) => updateSoundPrefs({ [props.field]: Number(event.currentTarget.value) / 100 } as Partial<SoundPrefs>)}
        onChange={() => props.onRelease?.()}
      />
      <output class="settings-slider-value">{percent()} %</output>
    </label>
  );
}

const THEME_CHOICES: { id: Theme; label: string }[] = [
  { id: "system", label: "Système" },
  { id: "light", label: "Clair" },
  { id: "dark", label: "Sombre" },
];

/**
 * Tout ce qui règle la partie sans la jouer : affichage, clavier, sauvegarde, mesure anonyme et
 * « Tout effacer ». Ces entrées vivaient à plat dans le menu, qui grandissait d'une ligne par
 * réglage ; le menu ne garde plus que les écrans de jeu et une entrée « Paramètres ».
 *
 * Toujours accessible, y compris depuis le portail des mondes : « Tout effacer » et « Importer »
 * sont aussi la sortie d'une sauvegarde dont le joueur ne se relève pas autrement.
 */
export default function SettingsPanel(props: { game: GameStore; onClose: () => void; onOpenShortcuts: () => void }) {
  let importInput: HTMLInputElement | undefined;

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") props.onClose();
  }
  onMount(() => document.addEventListener("keydown", onKeyDown));
  onCleanup(() => document.removeEventListener("keydown", onKeyDown));

  /** Downloads the current save as a portable .txt blob — see gameState's exportSave. */
  function exportSave() {
    const blob = new Blob([props.game.exportSave()], { type: "text/plain" });
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

  async function onImportFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    const text = await file.text();
    if (!props.game.importSave(text)) alert("Fichier de sauvegarde invalide.");
  }

  function onRestoreBackup() {
    if (!confirm("Remplacer la partie actuelle par la copie de secours ? La partie actuelle restera disponible comme copie de retour.")) return;
    if (!props.game.restoreBackup()) alert("Aucune copie de secours valide n’est disponible.");
    else props.onClose();
  }

  function onHardReset() {
    if (!confirm("Tout effacer ? Points de prestige, arbre, succès, packs et doublons compris. Irréversible.")) return;
    props.game.hardReset();
    props.onClose();
  }

  const telemetryOn = () => telemetryConsent() === "enabled";

  return (
    <div class="overlay" onClick={props.onClose}>
      <div
        class="modal settings-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Paramètres"
        onClick={(event) => event.stopPropagation()}
      >
        <header class="panel-head">
          <span>Paramètres</span>
          <button onClick={props.onClose} aria-label="Fermer">Fermer</button>
        </header>
        <div class="settings-body scroll">
          <section class="settings-group">
            <h3>Affichage</h3>
            <div class="settings-row">
              <span>Thème</span>
              <div class="settings-choice" role="group" aria-label="Thème">
                <For each={THEME_CHOICES}>
                  {(choice) => (
                    <button
                      classList={{ active: theme() === choice.id }}
                      aria-pressed={theme() === choice.id}
                      onClick={() => setTheme(choice.id)}
                    >
                      {choice.label}
                    </button>
                  )}
                </For>
              </div>
            </div>
          </section>

          <section class="settings-group">
            <h3>Son</h3>
            <div class="settings-row">
              <span>Son du jeu</span>
              <button
                aria-pressed={!soundPrefs().muted}
                onClick={() => updateSoundPrefs({ muted: !soundPrefs().muted })}
              >
                {soundPrefs().muted ? "Coupé" : "Activé"}
              </button>
            </div>
            <VolumeSlider label="Effets" field="effects" onRelease={() => playCue("passive")} />
            <VolumeSlider label="Musique" field="music" />
            <div class="settings-row">
              <span>Bruits de combat</span>
              <button
                aria-pressed={soundPrefs().combat}
                disabled={soundPrefs().muted}
                onClick={() => updateSoundPrefs({ combat: !soundPrefs().combat })}
              >
                {soundPrefs().combat ? "Activés" : "Coupés"}
              </button>
            </div>
            <p class="muted settings-note">
              Les bruits de combat reviennent plusieurs fois par seconde : clics, ennemis vaincus, capacités,
              objets communs et dernières secondes du chrono. Les couper garde les boss, recrues et
              récompenses. <kbd>V</kbd> coupe tout le son en jeu.
            </p>
          </section>

          <section class="settings-group">
            <h3>Clavier</h3>
            <div class="settings-row">
              <span>Toutes les touches du jeu</span>
              <button onClick={props.onOpenShortcuts}>
                Raccourcis clavier <kbd>?</kbd>
              </button>
            </div>
          </section>

          <section class="settings-group">
            <h3>Sauvegarde</h3>
            {/* Une sauvegarde automatique silencieuse ne se distingue pas d'une sauvegarde cassée. */}
            <p class="muted settings-note" title="Sauvegarde automatique toutes les 5s">
              <Show when={props.game.lastSavedAt() > 0} fallback="Pas encore sauvegardé.">
                Sauvegardé automatiquement il y a{" "}
                {Math.max(0, Math.round((props.game.now() - props.game.lastSavedAt()) / 1000))}s.
              </Show>
            </p>
            <div class="settings-actions">
              <button onClick={exportSave}>Exporter</button>
              <button onClick={() => importInput?.click()}>Importer</button>
              <Show when={props.game.hasBackupSave()}>
                <button onClick={onRestoreBackup}>Restaurer la copie de secours</button>
              </Show>
            </div>
            <input ref={importInput} type="file" accept=".txt" style={{ display: "none" }} onChange={onImportFile} />
          </section>

          <section class="settings-group">
            <h3>Confidentialité</h3>
            <div class="settings-row">
              <span title="Jalons de progression agrégés, sans identifiant de joueur">
                Mesure anonyme de la progression
              </span>
              <button
                aria-pressed={telemetryOn()}
                onClick={() => setTelemetryConsent(telemetryOn() ? "disabled" : "enabled")}
              >
                {telemetryOn() ? "Activée" : "Désactivée"}
              </button>
            </div>
            <p class="muted settings-note">
              Jalons agrégés comme « premier arc » ou « premier prestige », avec le temps de jeu actif.
              Aucun nom, identifiant, sauvegarde ni historique n’est transmis ; conservation 3 mois.
            </p>
          </section>

          <section class="settings-group">
            <h3>Zone de danger</h3>
            <div class="settings-row">
              <span>Efface la partie, le prestige, l'arbre, les succès, les packs et les doublons.</span>
              <button class="danger" onClick={onHardReset}>Tout effacer</button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
