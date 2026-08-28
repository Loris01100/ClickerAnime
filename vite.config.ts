/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  // GitHub Pages sert le site sous /ClickerAnime/ : chemins relatifs.
  base: "./",
  plugins: [solid()],
  // Une erreur en prod doit pointer sur le vrai fichier, pas sur du JS minifié. « hidden » plutôt
  // que `true` : la map est toujours produite et déployée, mais sans le commentaire qui la désigne
  // en fin de bundle — les navigateurs ne la réclament donc plus au chargement (900 ko servis pour
  // rien sur GitHub Pages), alors qu'elle reste ouvrable à la main quand on en a besoin.
  build: { sourcemap: "hidden" },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
