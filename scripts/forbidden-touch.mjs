#!/usr/bin/env node
// forbidden-touch.mjs — did anyone touch the judgment, or try to?
//
//   node scripts/forbidden-touch.mjs --init    # record baseline hashes (run after writing the contract)
//   node scripts/forbidden-touch.mjs           # check the tree against the baseline
//
// Exit codes: 0 clean, 1 forbidden change detected, 2 usage/config error.
//
// Two halves:
//   integrity — was the judgment modified? (always available)
//   attempts  — who tried to reach it? (only if the host logs denials; see templates/file-ownership.md)

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
const GUARDED = ["contract"]; // judgment lives here; not written by the implementer
const APPEND_ONLY = ["evidence"]; // written only by evidence.mjs
const LOCK = join(ROOT, "contract", "contract.lock.json");
const ATTEMPTS = join(ROOT, "evidence", "attempts.jsonl");
const SKIP = new Set(["node_modules", ".git", ".pnpm-store", "coverage", "dist"]);

const mode = process.argv.includes("--init") ? "init" : "check";

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function snapshot(dirs) {
  const out = {};
  for (const d of dirs) {
    for (const f of walk(join(ROOT, d))) {
      const rel = relative(ROOT, f).split(sep).join("/");
      if (rel.endsWith("contract.lock.json")) continue;
      out[rel] = sha256(f);
    }
  }
  return out;
}

function anchorStats() {
  const f = join(ROOT, "contract", "contract.requirements.md");
  if (!existsSync(f)) return { clauses: 0, unanchored: [], missing: true };
  const text = readFileSync(f, "utf8");
  // A clause line looks like:  - C1 [anchor: A1] — title      (tag optional on purpose)
  const lines = [...text.matchAll(/^\s*-\s*\**\s*C\d+\b.*$/gm)].map((m) => m[0]);
  const unanchored = lines
    .filter((l) => !/\[anchor:\s*A[12]\]/i.test(l))
    .map((l) => l.replace(/^\s*-\s*/, "").split("—")[0].trim().slice(0, 60));
  return { clauses: lines.length, unanchored, missing: false };
}

function fail(msg) {
  console.error(`[claim-check] ${msg}`);
  process.exit(2);
}

if (mode === "init") {
  const files = snapshot(GUARDED);
  if (Object.keys(files).length === 0) {
    fail(`no files found under ${GUARDED.join(", ")}/ — write the contract first.`);
  }
  mkdirSync(join(ROOT, "contract"), { recursive: true });
  writeFileSync(
    LOCK,
    JSON.stringify({ recorded_at: new Date().toISOString(), guarded: GUARDED, files }, null, 2),
    "utf8"
  );
  console.log(`[claim-check] baseline recorded for ${Object.keys(files).length} file(s) in contract/`);
  for (const f of Object.keys(files)) console.log(`  ${f}  ${files[f].slice(0, 12)}`);
  console.log(`\n  Now hand the implementer contract.requirements.md only.`);
  process.exit(0);
}

if (!existsSync(LOCK)) {
  fail(`no baseline. Run: node scripts/forbidden-touch.mjs --init`);
}

const lock = JSON.parse(readFileSync(LOCK, "utf8"));
const current = snapshot(lock.guarded ?? GUARDED);
const baseline = lock.files ?? {};

const modified = [];
const removed = [];
const added = [];

for (const [file, hash] of Object.entries(baseline)) {
  if (!(file in current)) removed.push(file);
  else if (current[file] !== hash) modified.push(file);
}
for (const file of Object.keys(current)) {
  if (!(file in baseline)) added.push(file);
}

// Append-only sanity: evidence blocks must never be rewritten after creation.
const evidenceFiles = walk(join(ROOT, "evidence")).filter((f) => f.endsWith(".md"));
const attempts = existsSync(ATTEMPTS)
  ? readFileSync(ATTEMPTS, "utf8").split("\n").filter((l) => l.trim().startsWith("{"))
  : [];
const denials = attempts
  .map((l) => {
    try {
      return JSON.parse(l);
    } catch {
      return null;
    }
  })
  .filter((r) => r && r.result === "denied");

let dirty = false;

console.log(`# claim-check — integrity report`);
console.log(`baseline: ${lock.recorded_at}`);
console.log("");

if (modified.length || removed.length || added.length) {
  dirty = true;
  console.log(`## FORBIDDEN CHANGE TO contract/`);
  for (const f of modified) console.log(`  MODIFIED  ${f}`);
  for (const f of removed) console.log(`  REMOVED   ${f}`);
  for (const f of added) console.log(`  ADDED     ${f}`);
  console.log("");
  console.log(`The judgment is not the implementer's to change. Treat this as a failed claim`);
  console.log(`until a human explains the change.\n`);
} else {
  console.log(`## contract/ unchanged — ok (${Object.keys(baseline).length} file(s))\n`);
}

const anchors = anchorStats();
console.log(`## anchoring`);
if (anchors.missing) {
  console.log(`  no contract/contract.requirements.md — cannot measure unanchored clauses`);
  console.log(`  > Anchors answer "how much of this contract did the AI invent for itself?"\n`);
} else if (anchors.clauses === 0) {
  console.log(`  no clause lines found (expected e.g. "- C1 [anchor: A1] — title")`);
  console.log(`  > Without anchors the unanchored ratio is undefined, not zero.\n`);
} else {
  const pct = ((anchors.unanchored.length / anchors.clauses) * 100).toFixed(0);
  console.log(`  clauses: ${anchors.clauses}`);
  console.log(`  unanchored (A3 or untagged): ${anchors.unanchored.length}  =  ${pct}%`);
  if (anchors.unanchored.length) {
    for (const c of anchors.unanchored) console.log(`    - ${c}`);
    console.log(`  > A3 clauses are allowed but must be justified in one line, and may not be`);
    console.log(`  > the sole basis for a rejection. A high ratio is a choice, not an accident.`);
  }
  console.log("");
}

console.log(`## evidence/`);
console.log(`  blocks: ${evidenceFiles.length}`);
console.log(`  append-only: only evidence.mjs writes here; a hand-edited block invalidates the claim`);

if (attempts.length) {
  console.log(`  attempt records: ${attempts.length} (denied: ${denials.length})`);
  const rate = attempts.length
    ? ((denials.length / attempts.length) * 100).toFixed(0)
    : "0";
  console.log(`  denial rate: ${rate}%`);
  console.log("");
  console.log(`  > An attempt to reach a forbidden resource is the highest-signal number here.`);
  console.log(`  > Outcome metrics cannot tell "could not" from "chose not to". Attempts can.`);
} else {
  console.log(`  attempt records: none`);
  console.log("");
  console.log(`  > No attempt log. Either nothing was attempted, or the host does not log denials.`);
  console.log(`  > If a hook is cheap to add, add it — this is the only intent signal available.`);
}

if (dirty) process.exit(1);
console.log(`\n[claim-check] ok`);
process.exit(0);
