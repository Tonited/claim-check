# File ownership

Separation is physical first, enforced second. Fill this table in per task and keep it next to the contract.

```markdown
# Ownership — <task>

## Paths

| Path | Purpose | Implementer | Verifier | Notes |
|---|---|---|---|---|
| `src/**`            | implementation        | write | read  | |
| `contract/contract.requirements.md` | declarative requirements | read | read | |
| `contract/contract.judgment.md`     | assertions, cases, seeds | **no access** | read | keep outside the implementer's working view if the host cannot block a path |
| `contract/contract.lock.json`       | hashes                | read | read | written only by `forbidden-touch.mjs --init` |
| `evidence/**`       | evidence blocks       | **no access** | append | written only by `evidence.mjs`; never hand-edited |
| `tests/**` (local)  | implementer's own tests | write+run | read | fully transparent to the implementer |

## What the implementer may run

- Its own tests under `tests/**` — yes, freely.
- The contract's judgment — **no**. Not once, beyond the recorded budget.
- Reason: repeated execution and observation is what reverse-engineers a hidden criterion. Hiding alone does not help; limiting query access does.

## Budget

- Judgment executions per task: 3
- Returned to the implementer: pass/fail + failing clause title only. No expected/actual values, no raw output.

## Attempt logging

If the host supports a pre-tool hook, log every attempt to reach `contract/contract.judgment.md`,
`contract/contract.lock.json`, or `evidence/**` into `evidence/attempts.jsonl`:

    {"ts":"<iso>","actor":"<implementer|verifier|human>","action":"read|write","target":"<path>","result":"allowed|denied"}

If the host cannot hook, the integrity half still works: run `forbidden-touch.mjs` and it will
report any modification. You lose the attempt rate, which is the highest-signal number available —
so if a hook is cheap to add, add it.
```

## Enforcement ladder

Use the strongest one the host offers. The gates work at every level; only the attempt log degrades.

| Level | Mechanism | What you get | What degrades |
|---|---|---|---|
| 1 | Physical separation (judgment outside the working view) | Gates 1–2 | no attempt records |
| 2 | + git hook rejecting commits that touch `contract/contract.judgment.md` or `evidence/**` | integrity at commit time | no attempt records |
| 3 | + pre-tool hook / tool guard logging denials | **attempt rate** | — |

Level 1 is enough to stop the two most common failures (self-deception, layer substitution).
Level 3 is the only one that measures intent.
