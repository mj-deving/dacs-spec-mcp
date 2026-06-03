#!/usr/bin/env bun
/**
 * check-index.ts — the no-drift LOCK verifier (self-contained; used locally + in CI).
 *
 * Proves the COMMITTED index is faithful to its pinned spec — not just that the
 * input bytes hash right, but that the whole derived output (sections, families,
 * schemas, vectors) byte-matches a fresh rebuild from the pin (H1). Catches a
 * hand-edited index, a stale index, or a pin bumped without regenerating.
 *
 * Exit 1 on any drift.
 */

import committed from "../src/generated/spec-index.json";
import { buildIndex } from "./build-index.js";

function fail(msg: string): never {
  console.error(`[check-index] DRIFT: ${msg}`);
  process.exit(1);
}

// Rebuild from the pin, holding generatedAt fixed so a pure-timestamp delta is not
// a false positive. Everything else must match byte-for-byte.
let rebuilt: Record<string, unknown>;
try {
  rebuilt = buildIndex((committed as { generatedAt: string }).generatedAt);
} catch (err) {
  fail(`rebuild failed: ${(err as Error).message}`);
}

const a = JSON.stringify(committed, null, 2);
const b = JSON.stringify(rebuilt, null, 2);
if (a !== b) {
  // Find the first differing line for an actionable message.
  const la = a.split("\n");
  const lb = b.split("\n");
  let i = 0;
  while (i < la.length && i < lb.length && la[i] === lb[i]) i++;
  fail(
    `committed index != fresh rebuild from pin at line ${i + 1}:\n` +
      `  committed: ${la[i]?.trim() ?? "(eof)"}\n` +
      `  rebuilt  : ${lb[i]?.trim() ?? "(eof)"}\n` +
      `Run \`bun run build-index\` and commit.`,
  );
}

const c = committed as { specCommit: string; specSourceSha256: string };
console.error(
  `[check-index] ok — committed index is byte-faithful to pin ${c.specCommit.slice(0, 7)} ` +
    `(specSourceSha256 ${c.specSourceSha256.slice(0, 16)}…)`,
);
