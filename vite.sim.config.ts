import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

/**
 * Config for `npm run sim` only — the app and the tests keep using `vite.config.ts`.
 *
 * `vite-node` runs in SSR mode, and Node then resolves `solid-js` to its **server** build, where
 * signals don't propagate to memos: `travelTo` would flip a signal and `unlockedAnimes()` would
 * still read empty, so the simulated run silently did nothing. Forcing the browser condition (and
 * pulling solid through Vite's pipeline rather than letting Node externalize it) gives the sim the
 * same reactive runtime the browser has, which is the whole point of driving the real store.
 */
export default defineConfig({
  plugins: [solid({ ssr: false })],
  resolve: { conditions: ["browser", "development"] },
  ssr: {
    noExternal: ["solid-js"],
    resolve: { conditions: ["browser", "development"] },
  },
});
