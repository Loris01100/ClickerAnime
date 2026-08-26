# The balance simulator

`npm run sim` — playing a whole run headlessly to make a balance change checkable.


`npm run sim` plays a whole run headlessly and prints one row per arc: time to clear, kills, copies
of the arc's common **per kill**, team size, average level, dps, click power and boss timeouts, then
a summary with the prestige points the run banks. It exists because every pacing question this game
asks — how long an arc takes, what a drop constant is really worth, whether a boss clock is a wall —
is invisible in the constants themselves and was previously answered by eye.

It drives **`createGameStore` itself**, not a re-derivation of the rules, so the kill budget, the
drop rolls, the synergy malus, the xp curve and the boss timer all apply exactly as they do in the
browser. `simulateRun(data, options)` fakes everything the store reaches for — the clock,
`setInterval`, `localStorage` and `Math.random` (seeded: **same `--seed`, same run**, which is what
makes a before/after comparison of one constant honest) — and restores every one of them on the way
out, guarded by a test. The auto-player clicks at a set cadence, fires any ready ability, ranks up
every affordable passive, equips uniques, buys packs, steps to the next arc on a clear and travels
to the next world when one is finished; an arc it can't clear within `--stall` minutes is reported
as a wall rather than looped on forever.

Flags: `--minutes`, `--stall`, `--cps`, `--seed`, `--world`, `--json`, and `--no-packs` /
`--no-abilities` / `--no-equip` / `--no-passives` to price one system by removing it.

It needs its own **`vite.sim.config.ts`**: `vite-node` runs in SSR mode, where Node resolves
`solid-js` to its *server* build and signals never propagate to memos — `travelTo` would flip a
signal and `unlockedAnimes()` would still read empty, so the run silently did nothing and printed a
table of zeros. The config forces the browser condition and pulls solid through Vite's pipeline.
Don't run the sim through the plain `vite.config.ts`. `vitest` is unaffected: it already resolves
the client build, which is why the smoke tests in `src/engine/tests/` work without it.

The numbers it prints are **measurements, not assertions**: `src/engine/tests/` only guards that the
harness advances at all, is deterministic per seed, and leaves the environment intact. A table of
zeros means a broken harness, not an impossible game — that is exactly the failure the smoke test
exists to name.
