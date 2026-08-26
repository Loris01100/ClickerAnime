/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  // GitHub Pages sert le site sous /ClickerAnime/ : chemins relatifs.
  base: "./",
  plugins: [solid()],
  // Une erreur en prod doit pointer sur le vrai fichier, pas sur du JS minifié.
  build: { sourcemap: true },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
