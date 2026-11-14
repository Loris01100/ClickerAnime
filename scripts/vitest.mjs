/**
 * Runs Vitest from a working directory spelled with an upper-case drive letter.
 *
 * On Windows a shell can start npm in `c:\…` (VS Code's terminal does) while Node resolves
 * `node_modules` as `C:\…`. Vitest 5 treats the two spellings as two module ids, so a test file's
 * `vitest` import and the worker's runner load as two separate instances, and every suite dies on
 * its first `describe` with "Cannot read properties of undefined (reading 'config')". The cwd has to
 * be fixed before Vitest starts — it records it at boot, so `vite.config.ts` is already too late.
 * Anywhere but a lower-case Windows drive this is a plain pass-through.
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const cwd = process.cwd().replace(/^[a-z]:/, (drive) => drive.toUpperCase());
const bin = join(cwd, "node_modules", "vitest", "vitest.mjs");
const { status, error } = spawnSync(process.execPath, [bin, ...process.argv.slice(2)], { cwd, stdio: "inherit" });
if (error) throw error;
process.exit(status ?? 1);
