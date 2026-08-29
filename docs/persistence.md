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
same `SaveFile` into a portable blob (`App.tsx` hands it to the browser as a `.txt` download named
`[Clicker-Anime][YYYY-MM-DD][HHhMM].txt`, local date and time, so a downloads folder sorts them by
hand and two exports the same day stay distinct);
`importSave` decodes and shape-checks it exactly like `readSave`, then writes straight to
`localStorage` and reloads the page — simplest way to get every signal back in sync without exposing
a setter per field. Once that write succeeds, autosave is suspended for the few milliseconds before
reload: both `pagehide` and the store cleanup normally save the current run during teardown, and
would otherwise overwrite the newly imported file with the old in-memory signals. A failed import
re-enables autosave immediately. Equipment is additionally sanitized against the current game data on boot: an
unknown, unowned, restricted or duplicate unique is discarded rather than granting a bonus. There is
no offline-progress catch-up. Combat still restarts on a reload, except for ability cooldown start
times: they are saved so Ctrl+F5 cannot turn a cooling ability into a ready one.

Every successful write first rotates the current valid primary into
`clicker-anime:save:v10:backup`. On boot, a missing, malformed or wrong-shaped primary is repaired
from that slot before the store creates any signal; the corrupt value is never copied over a valid
backup. The menu exposes **Restaurer la copie de secours** as soon as that slot exists. Restoration
swaps primary and backup rather than overwriting both, so the operation itself remains reversible
until the next autosave. Import uses the same rotation path, which means the run from before an
import remains recoverable. `hardReset` is the deliberate exception: « Tout effacer » removes both
slots. A recovery notice tells the player when boot had to use the fallback.

The optional `uniqueFragments` map is run-scoped forge progress; `uniqueUpgradeRanks` is permanent
mastery. Prestige removes the unique and its fragments but keeps its explicit stored rank, including
while the item is absent. The next copy found recovers that rank. Missing rank data is migrated in
memory to rank 4 only for an owned unique, preserving saves made before the forge without granting
free levels to unseen items; a newly found unique starts at rank 1.

`passiveRanks` is meta-progression even though the common items used to buy those ranks are
run-scoped. A prestige leaves the map intact while removing the roster; the stored rank becomes
active again as soon as its character is recruited. `hardReset` remains the only operation that
clears it. This is a behavior change only, not a save-shape change, so it requires no key bump.

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
