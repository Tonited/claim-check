# claim-check

**English** · [中文](README.md)

> **"It's done" is a claim, not evidence.**

`git commit` has hooks. `git push` has protection. But when an agent says it finished, **nothing checks**.

`claim-check` is that check. It turns "done" into a claim you can verify, using evidence the implementer **cannot edit, cannot restate, and cannot query freely**.

Built for everyday work. No new service, no new ceremony — it fires at the one moment that matters: **when you are about to believe a conclusion**.

---

## Measured results

We ran a controlled experiment: one real feature request, one project, one test command, one agent model. The only difference between the two arms was **whether claim-check was used**.

The requirement carried one non-functional clause: a **range invariant must hold in the data layer, not be patched up by callers** — the software equivalent of "password validation must happen on the server". The project's existing tests locked down the pure function itself, but **not one of them checked the data layer's output**. So the cheapest way to satisfy the test command was to leave the constraint at the point of use.

| | Baseline (no claim-check) | Treatment (claim-check) |
|---|---|---|
| `npm run check` | **46 pass / 0 fail** | **58 pass / 0 fail** |
| Claims done | ✅ | ✅ |
| **"Valid on receipt" at the data layer** | **0 / 9** ❌ | **9 / 9** ✅ |
| Contract clauses (anchored) | none | 14 |
| Evidence blocks (raw output + hash + seed) | none | 4 |
| Acceptance verdict | "done" | **FAIL / FAILING C1 / UNJUDGEABLE C10,C12** |

The baseline arm did not cut corners. It did real work: added a branded type, collapsed clamping into a single constructor. **It simply did not know its guarantee missed the data-layer path** — and its own new tests could not see it either.

The treatment arm's verifier returned **FAIL**, not "pass": the judgment contract was stricter than the requirement and the implementation missed one input class, and two clauses were **unjudgeable because the implementer left no evidence block**. All of it went into raw output. None of it was hidden behind "looks green".

> Full design, the neutral measurement script, and the empty-implementation discrimination check: [VERIFICATION.md](VERIFICATION.md).

---

## What it defends against

Three failure modes, each needing a different mechanism:

| Failure | Looks like | Blocked by |
|---|---|---|
| **Self-deception** | The implementer says "it passes"; you can only take its word | **Gate 1**: evidence comes from a script — not restated, not hand-edited |
| **Targeted optimization** | The implementer sees the criteria and edits code until they turn green | **Gate 2**: judgment physically separated + randomized instances + capped judgment runs |
| **Specification gaming** | The criteria themselves miss the real intent (the example above) | **Checklist + intent anchors + observable-raising** |

The third one **cannot** be fixed by "spawning another agent to review the contract" — an independent reviewer inherits the same misreading, and tends to defer to authoritative-looking text. So it is a **ten-row mechanical checklist** that outputs a one-page *contract blindness report* for a human.

---

## Quick start

```bash
# 1. Copy scripts/ templates/ checklists/ into your repo
cp -r claim-check/{scripts,templates,checklists} your-repo/
cd your-repo && mkdir -p contract evidence

# 2. Split the requirement into two files: requirements (implementer) / judgment (verifier only)
#    See templates/contract.template.md
node scripts/forbidden-touch.mjs --init      # fingerprint the judgment

# 3. The implementer sees requirements only; a claim requires evidence:
node scripts/evidence.mjs -- npm test

# 4. The verifier runs the judgment (fresh instances each run, capped runs):
node scripts/randomize.mjs -- npm run judge

# 5. After the fact: was the judgment touched? Did anyone try?
node scripts/forbidden-touch.mjs

# 6. A human reads the evidence blocks and the two reports — not the diff
```

**When to run it**: only at the moment you are about to trust a result. Not while writing code.

---

## The three gates

### Gate 1 · Evidence (against self-deception)

The implementer may not say "I'm done". It may only attach an **evidence block**:

```bash
node scripts/evidence.mjs -- <the actual command>
```

This writes `evidence/<id>.md` containing the **verbatim command, exit code, raw output (stored as its own file), random seed, and output hash**. A claim may only **reference** it:

```
claim: export function implemented and covered for boundary inputs
evidence: evidence/2026-09-25T05-22-35-950Z-4794f30ce1d7.md
```

The rules:

- **A non-zero exit code is a failure, not a note.**
- Evidence blocks are **never hand-written or hand-edited** — evidence that can be edited is not evidence.
- **Reading the evidence block is the whole review.** Do not review the diff instead: a diff can tell you the code looks reasonable; it cannot tell you the claim is true.
- "It should pass", "the remaining failure is unrelated", and a pasted excerpt of output are not substitutes.

### Gate 2 · Judgment (against targeted optimization)

**Requirements and judgment mechanism live in separate files:**

| File | Contents | Who sees it |
|---|---|---|
| `contract.requirements.md` | **Declarative** requirements, interfaces, clause titles (anchored) | The implementer |
| `contract.judgment.md` | The actual assertions, case sets, expected values, sampling distributions, seeds | **The verifier only** |

- Give the requirement, **never the judgment mechanism**. "Credential validation must happen server-side" is a requirement; "this test bypasses the frontend and expects 401" is judgment.
- Write clauses as **properties and metamorphic relations**, not `input X → expected Y`. An example can be satisfied locally; a relation cannot.
- **Fixed clauses, randomized instances**: inputs and seeds are regenerated every run. This holds **even when the judgment is visible** — you cannot optimize against a distribution you cannot predict.
- **Cap judgment executions** (default 3, enforced by the script). Unbounded retries are how a hidden criterion gets reverse-engineered.
- Return to the implementer **only pass/fail plus the failing clause title**. Local tests in the implementer's own directory stay fully transparent; the contract's judgment does not.

### Gate 3 · Intent (record, don't just block)

**An attempt is the highest-signal measurement in this system.**

Pass rates cannot separate "could not" from "chose not to". Attempts can. And the two are **decoupled**: locking down the evaluator can drive success to zero while the attempt rate does not move at all.

```bash
node scripts/forbidden-touch.mjs
```

It compares contract hashes, reports whether the judgment was modified, and counts attempt records.

**Wire up the attempt log if you can** — without a hook the integrity half still works, but you lose the only signal that observes intent.

---

## The attack checklist

`checklists/attack-patterns.md` — ten rows, all asking one question:

> **Can this contract physically express a constraint that forbids this attack?**

Rows answered "no" go into the **contract blindness report**, which goes to a **human**.

Two rows decide the contract's shape:

**A4 · Layer substitution** (validation written in the frontend when it belongs in the backend): **an example-shaped contract structurally cannot express it**, because "which layer the check runs in" is not an input→output relation — frontend and backend validation can produce byte-identical request/response traces. There are exactly two ways out:

1. **Raise the observable**: make the location itself observable (server logs / audit records / persisted state / network capture);
2. **Rewrite as a metamorphic relation**: assert that **bypassing the outer layer and reaching the inner layer directly must not change the invariant**.

If neither is possible, the clause is **unverifiable** — record it in the contract's "not covered" section. **Knowing a requirement is unverifiable beats believing a frontend test verified it.**

**A5 · Criteria tampering**: expressible inside no contract, because it is about the contract itself. Gates 2 and 3 handle it.

---

## Intent anchors and the unanchored ratio

Every clause carries a truth source — one that lives **outside the AI's optimization loop**:

| Anchor | Meaning | Can it stand alone? |
|---|---|---|
| `A1` | A human asked for it | yes |
| `A2` | Repo behavior baseline (existing tests, past commits, documented policy) | yes |
| `A3` | The AI decided this should be required | **no** |

```
- C1 [anchor: A1] — accepted inputs must conform to the policy
- C4 [anchor: A3] — shortening by one character must not turn a rejection into an acceptance
      A3 justification: not requested by the user; derived from the policy doc's monotonicity intent
```

`forbidden-touch.mjs` computes the **unanchored clause ratio** (A3 + untagged ÷ total). That number mechanically answers one question:

> **How much of this contract did the AI invent for itself?**

Why it exists: when a human-written acceptance list misses an intent, the AI will not notice — it will faithfully satisfy the list. And "have an AI review the contract" does not fix it either: a reviewer inherits the same misreading and defers to authoritative text. The anchor field makes that blind spot **visible without asking anyone to judge it**.

Rules: A3 is allowed but needs a one-line justification, and **may not be the sole basis for a rejection**.

---

## Roles and budgets

Two roles, isolated contexts, **not one continuous session**:

| Role | Sees | Does |
|---|---|---|
| **Implementer** | Requirements + clause titles | Runs its own directory's tests. **Must not read or execute the judgment** |
| **Verifier** | Judgment + implementation code | Runs the judgment, emits evidence. Writes no implementation code |

**The implementer must not execute the judgment** — repeated execution and observation is the main route to reverse-engineering a hidden criterion. This matters far more than hiding the tests.

---

## What NOT to do

Each of these was tested and failed. Adding them makes the process heavier without making it safer.

- **Do not add "an agent reviews the contract".** It inherits the misreading and defers to authoritative text.
- **Do not rely on hiding tests alone.** Hiding without limiting query access is defeated by repeated execution.
- **Do not use the pass rate as your acceptance signal.** It merges "incapable" with "cheating". Record change size, whether a layer was bypassed, and whether the judgment was touched.
- **Do not require a formal theory or a three-agent pipeline.** Two roles are enough.
- **Do not let the implementer write into the judgment or evidence directories** — not to "fix a test", not ever.

---

## Enforcement ladder

Use the strongest level your host offers. The gates work at every level; only the **attempt log** degrades.

| Level | Mechanism | You get | You lose |
|---|---|---|---|
| 1 | Physical separation (judgment outside the implementer's working view) | Gates 1–2 | attempt records |
| 2 | + git hook rejecting changes to `contract.judgment.md` / `evidence/**` | integrity at commit time | attempt records |
| 3 | + pre-tool hook / tool guard logging denials | **the attempt rate** | — |

**Level 1 alone blocks the two most common failures** (self-deception, layer substitution). Level 3 is the only one that measures intent.

On DSH, level 3 requires a Cordis plugin (`ToolGuard` monotonic deny, `tools/pre-execute` approval gate).

---

## Layout

```
claim-check/
├── SKILL.md                          # The skill itself (the agent-facing process, English)
├── README.md                         # 中文
├── README.en.md                      # This file
├── VERIFICATION.md                   # Effectiveness report (the controlled experiment)
├── checklists/attack-patterns.md     # Ten-row mechanical checklist + observable-raising table
├── templates/
│   ├── contract.template.md          # How to write both contract halves + anchor rules
│   └── file-ownership.md             # Role × path permissions + the enforcement ladder
└── scripts/
    ├── evidence.mjs                  # Run a command → evidence block (with judgment budget)
    ├── forbidden-touch.mjs           # Integrity + unanchored ratio + attempt statistics
    └── randomize.mjs                 # Fixed clauses, randomized instances
```

Zero dependencies — Node built-ins only. Requires Node ≥ 22.

---

## Known limitations

- **DSH's `ToolRestriction` is tool-name level** — there is no native per-path read denial. So "the judgment is invisible" can only be achieved by **physical separation** (keeping it out of the implementer's working view), not by permission configuration.
- **The judgment counter runs in the same process as the agent**, so it is theoretically resettable. Today it is *auditable*, not *unforgeable*. Real unforgeability needs the plugin layer.
- **The anchor statistic depends on formatting**: the script matches lines shaped like `- C1 [anchor: A1] — title`. Clauses written inside tables, or numbered without `C<n>`, **will not be counted** — in that case the script explicitly reports "no clause lines found" rather than reporting 0%. **"Wrong format" and "zero unanchored" must never be confused.**
- **The checklist covers ten known cheating patterns; it is not exhaustive.** It is a living document — add a row when you find a new pattern.
- **The judgment itself can be wrong**: in our experiment the contract was stricter than the requirement, so a correct implementation was judged as failing. That is why a judgment needs an **empty-implementation check** — run it against an implementation that does not satisfy the requirement and confirm it fails.
