/* @refresh reload */
import { ErrorBoundary } from "solid-js";
import { render } from "solid-js/web";
import App from "./App";
import { SAVE_KEY } from "./engine/gameState";
import "./styles.css";

/**
 * Une exception dans un composant rendait la page blanche : plus de jeu, et surtout plus aucun
 * moyen de récupérer la sauvegarde. Le fallback affiche la pile et le contenu brut du `localStorage`
 * pour que le joueur puisse le copier avant de recharger.
 */
function Crash(props: { error: unknown }) {
  return (
    <div class="crash">
      <h1>Le narrateur a perdu le fil.</h1>
      <pre>{props.error instanceof Error ? (props.error.stack ?? props.error.message) : String(props.error)}</pre>
      <p>Copie ta sauvegarde avant de recharger&nbsp;:</p>
      <textarea readonly rows="6" onFocus={(e) => e.currentTarget.select()}>
        {localStorage.getItem(SAVE_KEY) ?? ""}
      </textarea>
      <button onClick={() => location.reload()}>Recharger</button>
    </div>
  );
}

const root = document.getElementById("root");
render(() => <ErrorBoundary fallback={(error) => <Crash error={error} />}>{<App />}</ErrorBoundary>, root!);
