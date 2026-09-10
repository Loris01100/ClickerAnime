#!/usr/bin/env node
/**
 * PostToolUse hook: keeps the two layers honest right after an edit.
 *
 *   src/engine/**  -> the vitest suite (the engine is pure, the whole suite runs in ~1s)
 *   src/data/**    -> validate-data, then the suite: content is edited far more often than the
 *                     rules are, and a dead reference or a duplicate id is exactly what the
 *                     semantic validator catches and the typechecker cannot
 *   src/ui/**      -> `tsc --noEmit` (components have no tests; the typecheck is the net)
 *   src/worker.ts  -> `tsc --noEmit` (the edge endpoint has no test either)
 *
 * A failure exits 2, which hands stderr back to Claude instead of leaving the break
 * for the next `npm run build` to find. Anything else is a silent no-op.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

// Run the tools' JS entry points with this same node binary, never through a shell. The `.bin`
// shims are `.cmd` files on Windows, and spawning one needs `shell: true`, which hands cmd.exe an
// unquoted path — so a checkout under "C:\My Projects\..." would fail to spawn and the hook would
// block every edit claiming the tests failed. No shell, no quoting problem.
const ENTRY = {
  vitest: resolve(ROOT, "node_modules", "vitest", "vitest.mjs"),
  tsc: resolve(ROOT, "node_modules", "typescript", "bin", "tsc"),
  viteNode: resolve(ROOT, "node_modules", "vite-node", "dist", "cli.mjs"),
};

const VITEST = { label: "vitest", entry: ENTRY.vitest, args: ["run"] };
const TSC = { label: "tsc --noEmit", entry: ENTRY.tsc, args: ["--noEmit"] };
// The same command `npm run validate:data` runs, minus the shell.
const VALIDATE_DATA = {
  label: "validate:data",
  entry: ENTRY.viteNode,
  args: ["-c", "vite.sim.config.ts", "scripts/validate-data.ts"],
};

// The tail is what Claude actually reads; a full vitest dump would bury the failure.
const TAIL_LINES = 40;

function readStdin() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return null;
  }
}

const payload = readStdin();
const filePath = payload?.tool_input?.file_path ?? payload?.tool_response?.filePath ?? "";
// Windows hands over backslashes; match on one separator only.
const normalized = filePath.split(sep).join("/").split("\\").join("/");

if (!/\.(ts|tsx)$/.test(normalized)) process.exit(0);

// Cheapest first: a content edit that breaks a reference is reported by the validator in one
// readable line, and the suite never has to run.
const checks = normalized.includes("/src/data/")
  ? [VALIDATE_DATA, VITEST]
  : normalized.includes("/src/engine/")
    ? [VITEST]
    : normalized.includes("/src/ui/") || normalized.endsWith("/src/worker.ts")
      ? [TSC]
      : [];

for (const check of checks) {
  // No install (or a moved entry point) is not a code failure: stay quiet rather than block the edit.
  if (!existsSync(check.entry)) {
    console.error(`[verify-edit] skipped ${check.label}: ${check.entry} not found (run npm install?)`);
    continue;
  }

  const run = spawnSync(process.execPath, [check.entry, ...check.args], { cwd: ROOT, encoding: "utf8" });

  if (run.status === 0) continue;

  // spawn itself failed: say so rather than crying wolf about the code.
  if (run.error) {
    console.error(`[verify-edit] could not run ${check.label}: ${run.error.message}`);
    continue;
  }

  const output = `${run.stdout ?? ""}${run.stderr ?? ""}`.trimEnd().split("\n").slice(-TAIL_LINES).join("\n");
  console.error(`[verify-edit] ${check.label} failed after editing ${normalized}\n\n${output}`);
  process.exit(2);
}

process.exit(0);
