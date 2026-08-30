import { Show } from "solid-js";
import { setTelemetryConsent, telemetryConsent } from "./telemetry";

export default function TelemetryConsent() {
  return (
    <Show when={telemetryConsent() === "pending"}>
      <aside class="telemetry-consent" aria-label="Mesure anonyme de la progression">
        <div>
          <strong>Aider à équilibrer le jeu ?</strong>
          <span>
            Envoyer des jalons agrégés comme « premier arc » ou « premier prestige ». Aucun nom,
            identifiant de joueur, sauvegarde ou historique de navigation n’est transmis.
          </span>
          <small>
            Conservation : 3 mois chez Cloudflare. Ce choix reste modifiable dans le menu.
          </small>
        </div>
        <button onClick={() => setTelemetryConsent("disabled")}>Refuser</button>
        <button class="primary" onClick={() => setTelemetryConsent("enabled")}>Autoriser</button>
      </aside>
    </Show>
  );
}
