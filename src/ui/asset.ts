/**
 * Chemin vers un fichier de `public/`. Les chemins sont écrits en absolu (`/resources/x.png`) dans
 * les sources, et passent tous par ici pour que la **base du site soit un seul bouton**.
 *
 * Aujourd'hui ce bouton vaut `/` — le jeu est servi à la racine de son domaine Cloudflare — donc la
 * fonction est l'identité. Elle a été écrite quand le site vivait sous `/ClickerAnime/` sur GitHub
 * Pages, où un `/` initial pointait sur la racine du domaine : Vite réécrit les `url()` du CSS et
 * les imports, jamais une chaîne construite à l'exécution. Elle est gardée parce qu'un
 * redéploiement sous un sous-répertoire redeviendrait une ligne à changer plutôt qu'une chasse aux
 * `src` cassés.
 */
export const asset = (path: string) => import.meta.env.BASE_URL + path.replace(/^\//, "");
