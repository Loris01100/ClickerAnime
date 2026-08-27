# Persistence

The save file, its version, and the trust boundary `importSave` sits on.


The save is a flat `SaveFile` in `localStorage` under the key `clicker-anime:save:v10`, and carries
its own `version` field (`SAVE_VERSION`) so a future shape change can be **migrated** in `readSave`
instead of costing every player their save. `readSave` shape-checks it
(via `isValidSave`) and falls back to a fresh run rather than throwing, so an old save can never
brick the boot. `isValidSave` checks the *type* of every field that is present rather than the
presence of every field — each reader already defaults a missing one (`saved?.x ?? []`), which is
what lets an older save load, while a wrong-typed field is the one thing those defaults can't
absorb. It is a real trust boundary: `importSave` runs an arbitrary player-supplied file through it
and writes whatever passes straight to `localStorage` before reloading. Bump the key version when the shape *breaks* — an old field renamed or retyped, not a
new optional field, which `?? {}`/`?? []` defaults already absorb without a bump; bumping wipes every
existing player's save (a new key means the old one is never read again), so treat it as a last
resort. `gameState`'s `buildSaveFile` is the one place the on-disk shape is assembled, shared by
`save`, `exportSave` and `importSave` so they can never drift apart. `exportSave` base64-encodes the
same `SaveFile` into a portable blob (`App.tsx` hands it to the browser as a `.txt` download);
`importSave` decodes and shape-checks it exactly like `readSave`, then writes straight to
`localStorage` and reloads the page — simplest way to get every signal back in sync without exposing
a setter per field. Equipment is additionally sanitized against the current game data on boot: an
unknown, unowned, restricted or duplicate unique is discarded rather than granting a bonus. There is
no offline-progress catch-up. Combat still restarts on a reload, except for ability cooldown start
times: they are saved so Ctrl+F5 cannot turn a cooling ability into a ready one.

The optional `uniqueFragments` and `uniqueUpgradeRanks` maps are run-scoped forge progress. Missing
rank data is migrated in memory to rank 4 for every owned unique, preserving saves made before the
forge; a newly found unique starts at rank 1.

Two optional fields carry the prestige tree's "Automatisation" branch, and neither needed a key
bump. `automationOff` holds the automations the player switched **off**, keyed by `AutomationKey` —
the off-set rather than the on-set precisely so an absent entry, which is every save written before
the branch existed, reads as "on" like the autoclicker's `autoClickEnabled`. `autoRankCharacterIds`
holds the characters handed to "Intendance"; it names characters, so `prestigeReset` empties it
along with the roster while the switches, being a preference rather than progress, survive.

Two more carry the run challenges (`docs/economy.md`), and neither needed a bump either.
`activeChallengeId` is the challenge being played — it deliberately **survives** `prestigeReset`,
which restarts the challenge's progress rather than ending it, since progress is counted as the
run's cleared arcs. `completedChallengeIds` is meta-progression like `achievementCounts`: its
rewards are permanent, so only `hardReset` clears it.
