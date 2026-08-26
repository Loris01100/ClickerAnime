/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  // GitHub Pages sert le site sous /ClickerAnime/ : chemins relatifs.
  base: "./",
  plugins: [solid()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
