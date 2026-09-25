#!/usr/bin/env node
// evidence.mjs — run a command and emit an evidence block the claimant cannot edit.
//
//   node scripts/evidence.mjs -- <command> [args...]
//
// Emits evidence/<timestamp>-<hash>.md containing the verbatim command, exit code,
// the raw output stored as its own file, and the output hash.
//
// The point: a claim is a reference to this block, never a retelling of it.

import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const EVIDENCE_DIR = join(ROOT, "evidence");
const COUNTER_FILE = join(EVIDENCE_DIR, ".judgment-runs.json");
const DEFAULT_BUDGET = Number(process.env.CLAIM_CHECK_BUDGET ?? 3);

const args = process.argv.slice(2);
const sep = args.indexOf("--");
if (sep === -1 || args.length === sep + 1) {
  console.error("usage: node scripts/evidence.mjs -- <command> [args...]");
  process.exit(2);
}

const cmd = args.slice(sep + 1);
const label = cmd.join(" ");
// Judgment executions are budgeted. Unbounded retries reverse-engineer a hidden criterion.
// Note: "contract" is deliberately NOT a trigger word — it appears too often in paths, and
// treating `sed -i s/a/b/ contract/contract.judgment.md` as a judgment run silently eats the
// budget for what is really a (blocked) write. Keep this list in sync with the DSH plugin's
// isJudgmentCommand in dsh-claim-check.
const JUDGMENT_PATTERN = /judg|verify|judge/i;
const isJudgment = JUDGMENT_PATTERN.test(label);

mkdirSync(EVIDENCE_DIR, { recursive: true });

// Judgment executions are budgeted. Unbounded retries reverse-engineer a hidden criterion.
if (isJudgment) {
  const used = countJudgmentRuns();
  if (used >= DEFAULT_BUDGET) {
    console.error(
      `[claim-check] judgment budget exhausted (${used}/${DEFAULT_BUDGET}).\n` +
        `  Repeated execution is how a hidden criterion gets reverse-engineered.\n` +
        `  Raise it deliberately: CLAIM_CHECK_BUDGET=N, and record why in the evidence.`
    );
    process.exit(3);
  }
}

const seed = process.env.CLAIM_CHECK_SEED ?? randomBytes(4).toString("hex");
const startedAt = new Date().toISOString();

const child = spawn(cmd[0], cmd.slice(1), {
  shell: false,
  env: { ...process.env, CLAIM_CHECK_SEED: seed },
});

let stdout = "";
let stderr = "";
child.stdout.on("data", (d) => (stdout += d));
child.stderr.on("data", (d) => (stderr += d));

child.on("error", (err) => {
  console.error(`[claim-check] could not spawn ${cmd[0]}: ${err.message}`);
  process.exit(2);
});

child.on("close", (code) => {
  const finishedAt = new Date().toISOString();
  const combined = `--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}\n`;
  const hash = createHash("sha256").update(combined).digest("hex");
  const id = `${startedAt.replace(/[:.]/g, "-")}-${hash.slice(0, 12)}`;

  const outputFile = join(EVIDENCE_DIR, `${id}.output.txt`);
  writeFileSync(outputFile, combined, "utf8");

  const block = [
    `# evidence ${id}`,
    ``,
    `| field | value |`,
    `|---|---|`,
    `| kind | ${isJudgment ? "judgment" : "local"} |`,
    `| command | \`${label}\` |`,
    `| exit_code | ${code} |`,
    `| seed | \`${seed}\` |`,
    `| output_sha256 | \`${hash}\` |`,
    `| output_file | \`evidence/${id}.output.txt\` |`,
    `| started_at | ${startedAt} |`,
    `| finished_at | ${finishedAt} |`,
    `| verdict | ${code === 0 ? "PASS" : "FAIL"} |`,
    ``,
    `Raw output is in the file above. **Do not restate it. Do not edit this block.**`,
    `Reference this evidence in a claim as: \`evidence: evidence/${id}.md\``,
    ``,
  ].join("\n");

  writeFileSync(join(EVIDENCE_DIR, `${id}.md`), block, "utf8");
  if (isJudgment) recordJudgmentRun(id);

  console.log(block);
  console.log(`[claim-check] verdict: ${code === 0 ? "PASS" : "FAIL (exit code " + code + ")"}`);
  console.log(`[claim-check] claim must reference: evidence/${id}.md`);
  process.exit(code === null ? 1 : code);
});

function countJudgmentRuns() {
  if (!existsSync(COUNTER_FILE)) return 0;
  try {
    return JSON.parse(readFileSync(COUNTER_FILE, "utf8")).runs?.length ?? 0;
  } catch {
    return 0;
  }
}

function recordJudgmentRun(id) {
  let state = { runs: [] };
  if (existsSync(COUNTER_FILE)) {
    try {
      state = JSON.parse(readFileSync(COUNTER_FILE, "utf8"));
    } catch {
      state = { runs: [] };
    }
  }
  state.runs = state.runs ?? [];
  state.runs.push({ id, at: new Date().toISOString() });
  writeFileSync(COUNTER_FILE, JSON.stringify(state, null, 2), "utf8");
}
