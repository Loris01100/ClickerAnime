#!/usr/bin/env node
/**
 * PostToolUse hook: keeps the two layers honest right after an edit.
 *
 *   src/engine/**  -> the vitest suite (the engine is pure, the whole suite runs in ~1s)
 *   src/ui/**      -> `tsc --noEmit` (components have no tests; the typecheck is the net)
 *
 * A failure exits 2, which hands stderr back to Claude instead of leaving the break
 * for the next `npm run build` to find. Anything else is a silent no-op.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BIN = (name) => resolve(ROOT, "node_modules", ".bin", name + (process.platform === "win32" ? ".cmd" : ""));

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

const check = normalized.includes("/src/engine/")
  ? { label: "vitest", bin: BIN("vitest"), args: ["run"] }
  : normalized.includes("/src/ui/")
    ? { label: "tsc --noEmit", bin: BIN("tsc"), args: ["--noEmit"] }
    : null;

if (!check) process.exit(0);

const run = spawnSync(check.bin, check.args, { cwd: ROOT, encoding: "utf8", shell: process.platform === "win32" });

if (run.status === 0) process.exit(0);

// spawn itself failed (missing binary, no install): say so rather than crying wolf about the code.
if (run.error) {
  console.error(`[verify-edit] could not run ${check.label}: ${run.error.message}`);
  process.exit(0);
}

const output = `${run.stdout ?? ""}${run.stderr ?? ""}`.trimEnd().split("\n").slice(-TAIL_LINES).join("\n");
console.error(`[verify-edit] ${check.label} failed after editing ${normalized}\n\n${output}`);
process.exit(2);
