#!/usr/bin/env node
// randomize.mjs — fixed clauses, random instances.
//
//   node scripts/randomize.mjs -- <judgment command> [args...]
//
// Generates a fresh seed, runs the judgment through evidence.mjs (so the budget and the
// evidence block both apply), and prints the seed. A failure is reproducible from the seed;
// the sampling stays unpredictable across runs.
//
// Why this matters more than hiding: you cannot optimize against a distribution you cannot
// predict. This defense holds even when the judgment is visible to the implementer.
//
// If the judgment is "just a test file", the cheapest wiring is to inject the seed via
// env and let the test read it:
//
//   const seed = process.env.CLAIM_CHECK_SEED ?? "0";
//   const rng  = makeRng(seed);            // any deterministic PRNG
//   const input = drawFrom(rng, boundarySet);
//
// Never make the sample set a fixed literal list — that is the "fixed instances" failure
// this script exists to prevent.

import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";

const args = process.argv.slice(2);
const sep = args.indexOf("--");
if (sep === -1 || args.length === sep + 1) {
  console.error("usage: node scripts/randomize.mjs -- <judgment command> [args...]");
  process.exit(2);
}

const seed = process.env.CLAIM_CHECK_SEED ?? randomBytes(5).toString("hex");
const cmd = args.slice(sep + 1);

const here = dirname(fileURLToPath(import.meta.url));
const evidence = join(here, "evidence.mjs");
if (!existsSync(evidence)) {
  console.error(`[claim-check] evidence.mjs not found next to randomize.mjs (${evidence})`);
  process.exit(2);
}

console.log(`[claim-check] seed ${seed}`);
console.log(`[claim-check] instances are randomized; the seed is recorded in the evidence block.`);
console.log(`[claim-check] reproduce a failure with: CLAIM_CHECK_SEED=${seed} node scripts/randomize.mjs -- ${cmd.join(" ")}\n`);

const res = spawnSync(process.execPath, [evidence, "--", ...cmd], {
  stdio: "inherit",
  env: { ...process.env, CLAIM_CHECK_SEED: seed },
});

process.exit(res.status ?? 1);
