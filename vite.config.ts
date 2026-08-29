/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

// `base` reste à sa valeur par défaut, "/" : le site est servi à la racine de son domaine
// (clickeranime.reesch.com). Il a longtemps valu "./" pour GitHub Pages, qui servait le jeu sous
// /ClickerAnime/ — ne pas y revenir sans raison : le repli SPA de Cloudflare renvoie index.html sur
// n'importe quelle route, et des chemins relatifs s'y résoudraient depuis la mauvaise base.
export default defineConfig({
  plugins: [solid()],
  // Une erreur en prod doit pointer sur le vrai fichier, pas sur du JS minifié. « hidden » plutôt
  // que `true` : la map est toujours produite et déployée, mais sans le commentaire qui la désigne
  // en fin de bundle — les navigateurs ne la réclament donc plus au chargement (900 ko servis pour
  // rien), alors qu'elle reste ouvrable à la main quand on en a besoin.
  build: { sourcemap: "hidden" },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
