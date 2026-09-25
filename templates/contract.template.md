# Contract template

A requirement becomes **two files**. The implementer gets the first. The verifier holds the second.

```
contract/
  contract.requirements.md   # visible to the implementer
  contract.judgment.md       # visible to the verifier only
  contract.lock.json         # hashes, written by scripts/forbidden-touch.mjs --init
```

Two rules shape both files:

- **Clauses are properties or relations, never examples.** An example can be satisfied locally. A relation cannot.
- **Clauses are fixed; instances are randomized.** The clause pattern is stable across runs; the concrete inputs, seeds and sampling change every run.

---

## `contract.requirements.md` (implementer-visible)

```markdown
# Requirements — <task>

Source of intent: <issue | user statement | existing behavior baseline>

## Declarative requirements

What must be true. **Non-judgmental**: describe the requirement, never how it will be checked.

- R1. Credential strength validation must occur on the server side.
- R2. A rejected credential must not alter persisted account state.
- R3. All accepted passwords must satisfy the policy in `docs/password-policy.md`.

## Interfaces (visible)

- Module structure, function signatures, types, error codes, data model.

## Clause titles (visible; assertions are not)

Anchor tags are read by the script — syntax: `[anchor: A1|A2|A3]`.

- C1 [anchor: A1] — policy conformance across accepted inputs
- C2 [anchor: A2] — rejection leaves state unchanged
- C3 [anchor: A1] — validation location is server-side
- C4 [anchor: A3] — length relation: shortening a password by one character must never turn a rejection into an acceptance
  - A3 justification: not requested by the user; derived from the policy doc's monotonicity intent.

## Not covered

Anything known to be unverifiable, listed honestly:
- <e.g. "the UI never displays the raw password" — no observable defined>
```

---

## Anchor rules

Every clause must trace to a truth source **outside the AI's optimization loop**. A clause with no anchor is a guess, and must not be used for acceptance.

| Anchor | Meaning | Can it stand alone? |
|---|---|---|
| `A1` | Human statement — the user asked for it | yes |
| `A2` | Repo behavior baseline — existing test, past commit, current API behavior, documented policy | yes |
| `A3` | AI-inferred — the model decided this should be required | **no** |

`forbidden-touch.mjs` computes the **unanchored clause ratio**: the fraction of clauses tagged `A3` or carrying no tag. It answers one question mechanically — *how much of this contract did the AI invent for itself?* A high ratio is not automatically wrong, but it must be a deliberate decision rather than an accident.

Three rules:

1. **Every clause carries exactly one anchor tag.** Untagged clauses count as unanchored.
2. **`A3` clauses must carry a one-line justification.** Otherwise they are requirements the AI added on its own authority.
3. **An `A3` clause may not be the sole basis for a rejection.** If a claim fails only on `A3` clauses, escalate to a human.

Why this exists: a human-written acceptance list that misses an intent does not get caught by the AI — the AI satisfies the list. And "an AI reviews the contract" does not fix it either: a reviewer inherits the same misreading and defers to authoritative-looking text. The anchor field makes the gap visible without asking anyone to judge it.

## `contract.judgment.md` (verifier-only)

```markdown
# Judgment — <task>

Generated: <date>          Instances: randomized per run      Seed: recorded in evidence
Execution budget: 3 judgment runs per task

## Clause C1 — policy conformance across accepted inputs
Type: property
Statement: for all p drawn from generator G_policy, accept(p) implies policy(p)
Generator: G_policy        # randomized; draws from the policy's boundary set
Observable: the decision returned by the public API

## Clause C2 — rejection leaves state unchanged
Type: property (negative)
Statement: for all p in G_reject, calling validate(p) must leave the persisted state hash unchanged
Observable: state hash, read before and after

## Clause C3 — validation location is server-side
Type: raised observable (preferred) or metamorphic (fallback)
Raised: the server audit log must contain one validation record per request
OR
Metamorphic: for all p, calling the domain layer directly (bypassing HTTP) must yield
             a decision identical to calling it through HTTP
Note: an example-shaped assertion CANNOT express this clause. See checklists/attack-patterns.md A4.

## Clause C4 — length relation
Type: metamorphic relation
Statement: for all p, if policy(p) is true then reject(p) must imply reject(p[:-1])
Falsification: the generator searches for a counterexample pair

## Coverage and strength
- Mutation run: <command or "none">     Mutation score recorded as evidence.
- The judgment must fail on a null implementation. Verify this once per contract and record it.
```

---

## Rules for writing clauses

1. **Never write an expected value.** Write a relation, a property, or a raised observable. If you find yourself writing `input X → output Y`, you are writing an example, and A1 and A4 both become invisible.
2. **Every clause carries a type**: `property` | `metamorphic` | `raised observable`. A clause with no type is unverifiable.
3. **Every clause carries an anchor.** A clause with no anchor is a guess, and must not be used for acceptance.
4. **A clause that describes a location or an internal property must raise an observable.** If nothing can observe it, mark it unverifiable and say so — do not approximate it with a behavioral test.
5. **Record the null-implementation check.** Run the judgment against an empty implementation once; if it passes, the judgment is broken. This is the cheapest and highest-value check in the whole file.

## Randomization

Fixed clauses, random instances. In `package.json`:

```json
"scripts": {
  "judge": "node scripts/randomize.mjs"
}
```

`scripts/randomize.mjs` generates a seed, injects it into the judgment's generators, and prints the command that produces the evidence. The seed goes into the evidence block, so any failure is reproducible while the sampling stays unpredictable across runs. This defense holds even if the implementer can see the judgment — it cannot optimize against a distribution it cannot predict.
