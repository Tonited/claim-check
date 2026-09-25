---
name: claim-check
description: "Verify a completion claim with evidence that the implementer cannot edit. Use when an agent or a human says work is done, and before trusting that claim — especially when a verify script, test suite, or acceptance criteria exists and could be optimized against instead of satisfied. Also use when a task was implemented and self-tested in one context and you want independent verification, or when you suspect spec gaming, reward hacking, or tests that were weakened to pass."
---

# claim-check

A completion claim is not evidence. This skill turns "done" into a claim you can check, using three gates and one checklist. It applies whenever a `verify` script, test suite, or acceptance criteria exists — because **once a criterion is visible, it can be optimized against instead of satisfied.**

The single principle behind all three gates:

> **Evidence must come from something the implementer cannot edit, cannot restate, and cannot query freely.**

## The three gates

| Gate | Prevents | Mechanism |
|---|---|---|
| **1 · Evidence** | Self-deception: "I believe it passes" | Evidence blocks from a deterministic runner, not from the agent |
| **2 · Criterion** | Targeted optimization against the criteria | Criteria physically separated from implementation; declared, not judged |
| **3 · Intent** | Silent spec gaming | Record unauthorized-access **attempts**, not just outcomes |

Run them in order. Gates 1 and 2 are cheap and can run on every task. Gate 3 is a post-hoc check you run when you are about to trust a result.

---

## Gate 1 — Evidence

**The implementer does not report results. It produces evidence blocks, or it produces nothing.**

An evidence block is emitted by `scripts/evidence.mjs`, never written by hand. To claim completion, run:

```bash
node scripts/evidence.mjs -- <the actual command>
```

It emits a block into `evidence/` named by hash, containing: the verbatim command, exit code, stdout/stderr stored as a file, the random seed if any, and the SHA-256 of the output. The claim then references the evidence id:

```
claim: <one sentence>
evidence: evidence/<id>.md
```

**Rules that make this gate real:**

- An evidence block that a human or agent can edit is not evidence. The output file is written by the script; never hand-write or hand-edit these files.
- `[exit code: N]` with N ≠ 0 is a failed claim, not a note. Do not restate, summarize, or explain away raw output — the block contains it.
- Reading the evidence is the whole review. **Do not review the diff instead.** A diff review can only tell you the code looks reasonable; it cannot tell you the claim is true.
- Never accept "should pass", "the remaining failure is unrelated", or a pasted excerpt of output as a substitute for the block.

## Gate 2 — Criterion

**Split the requirement into two artifacts, and give the implementer only the first.**

| Artifact | Contents | Who sees it |
|---|---|---|
| `contract.requirements.md` | **Declarative** requirements, module structure, types, error codes, clause titles | The implementer |
| `contract.judgment.md` | The actual assertions, case sets, expected values, sampling distributions, seeds | The verifier only |

This split exists because of a measured effect: hiding judgment is worth little on its own (held-out suites yield minimal improvement) while **letting the implementer repeatedly execute and observe the judgment is what destroys it**. So:

- Give the requirement, **never** the judgment mechanism. "Credential validation must happen server-side" is a requirement. "This test calls the endpoint without the frontend and expects 401" is judgment.
- Write clauses as **properties and metamorphic relations**, not input→output examples. An example can be satisfied locally; a relation cannot. See `templates/contract.template.md`.
- **Fixed clauses, randomized instances**: the clause pattern is stable, the concrete inputs, seeds, and sampling change every run. This defense holds *even when the judgment is visible*, because you cannot optimize against a distribution you cannot predict.
- Cap judgment executions (default 3 per task, recorded in the evidence). Unbounded retries are how a hidden criterion gets reverse-engineered.
- Return judgment to the implementer as **pass/fail plus the failing clause title** — nothing more. Local tests in the implementer's own directory stay fully transparent; the contract's judgment does not.

Set up the split with `templates/file-ownership.md`.

## Gate 3 — Intent

**An attempt to reach a forbidden resource is the highest-signal measurement in this whole system.**

Outcome metrics cannot separate "could not" from "chose not to". An attempt can. The empirical picture is that attempt rates and success rates are **decoupled**: locking down the evaluator can drive success to zero while attempt rates stay unchanged.

Run the post-hoc check:

```bash
node scripts/forbidden-touch.mjs
```

It compares the contract's recorded hashes against the working tree and reports: whether the judgment was modified, whether it was read from the implementer's scope, and any attempt records. Wire the attempt log into whatever hook the host supports; if the host cannot hook, the integrity half still works.

**Route findings to a person, not to another agent.** An agent asked to review a contract inherits the same misreading that produced it, and tends to treat an authoritative-looking document as correct by default. That is why completeness is checked mechanically, in the next section, and not by a reviewer.

---

## The attack checklist

Completeness is not a matter of judgment — cheating patterns are finite and enumerable. Run `checklists/attack-patterns.md` clause by clause and ask one question per row: **can this contract physically express a constraint that forbids this attack?**

The checklist produces a *contract blindness report*: the list of rows the contract cannot express. That report goes to a human. This is deliberate — a mechanical checklist cannot be talked out of a finding, and a reviewer agent can.

The two rows that matter most, and the reason the split in Gate 2 is not optional:

- **Layer-substitution** (validation written in the frontend when it belongs in the backend): an example-shaped contract **cannot** express this, because "where the check happens" is not an input→output relation. Only a raised observable (server logs, audit records, data state) or a metamorphic relation (bypassing the outer layer must not change the invariant) can.
- **Criteria tampering** (editing or skipping the judgment): expressible only if the judgment is unwritable by the implementer and its evidence is append-only. That is Gates 2 and 3, not the checklist.

## What NOT to do

Cut these; each was tested and failed, and each adds weight without adding safety.

- **Do not add "an agent reviews the contract".** It inherits the misreading, and it defers to authoritative text.
- **Do not rely on hidden tests alone.** Hiding without limiting query access is defeated by repeated execution.
- **Do not use the pass rate as your acceptance signal.** It merges "incapable" with "cheating". Record change size, whether a layer was bypassed, and whether the judgment was touched.
- **Do not require a formal theory or a three-agent pipeline.** Two roles are enough: an implementer with an isolated context, and a verifier holding the judgment.
- **Do not let the implementer write into the judgment or evidence directories at all** — not to "fix a test", not ever.

## Roles and their budgets

Two sub-agents, isolated contexts, not one continuous session:

- **Implementer** — sees requirements and clause titles. May run local tests in its own directory. May **not** read the judgment, and may **not** execute it. This is what stops it from reverse-engineering the criteria by repeated execution.
- **Verifier** — sees the judgment, runs it, emits evidence. Does not write implementation code. Reading the implementation is allowed; diagnosing failures outweighs the risk of being led by the code.

A note on hosts without path-level permissions: if the host cannot forbid reading a path (only whole tools), then separation must be physical — keep the judgment outside the implementer's working view. Application-level restrictions are the fallback, not the plan.

## Order of operations

1. Extract the contract from the requirement. Requirements and judgment go to separate files. Record hashes via `scripts/forbidden-touch.mjs --init`.
2. Give the implementer `contract.requirements.md` only.
3. Implementer claims completion **with an evidence block**, or does not claim.
4. Verifier runs the judgment through `scripts/evidence.mjs`, capped by the execution budget, and returns pass/fail plus failing clause titles.
5. Run `scripts/forbidden-touch.mjs`. Check the attempt log.
6. Run `checklists/attack-patterns.md`. Route unexpressible rows to a human.
7. A human reads **the evidence blocks and the two reports** — not the diff. Approve, or send back with the failing clause title.

Steps 5 and 6 are the ones that catch what review cannot. Do not skip them because the evidence looks green.
