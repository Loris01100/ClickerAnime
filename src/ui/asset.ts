/**
 * Chemin vers un fichier de `public/`. Les chemins sont écrits en absolu (`/resources/x.png`) mais
 * le site est servi sous un sous-répertoire sur GitHub Pages (`/ClickerAnime/`), où un `/` initial
 * pointerait à la racine du domaine. Vite ne réécrit que les `url()` du CSS et les imports, jamais
 * une chaîne construite à l'exécution — d'où ce préfixe explicite par `BASE_URL`.
 */
export const asset = (path: string) => import.meta.env.BASE_URL + path.replace(/^\//, "");
