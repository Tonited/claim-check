# Attack patterns — contract blindness report

Run this once per contract, before implementation. For each row ask exactly one question:

> **Can this contract physically express a constraint that forbids this attack?**

Record the answer in the last column. Rows answered **NO** go into the blindness report and go to a human. Do not fix them by adding a reviewer agent — fix them by changing the contract's shape (raise an observable, or rewrite the clause as a relation), or accept the blindness explicitly.

## The checklist

| # | Attack pattern | What it looks like | Expressible by an example-shaped contract? | Expressible by a property/relation contract? | Needs something else — what? |
|---|---|---|---|---|---|
| A1 | **Hardcoded expected values** | Returns the right answer only for the inputs that were listed | NO | YES | Randomized instance generation (see Gate 2) |
| A2 | **Mocked-out subject** | The thing under test is replaced, so the assertion is vacuous | NO | NO | Mechanical check that the subject is not substituted + mutation run |
| A3 | **Side-channel satisfaction** | Passes by observing something other than the real path | NO | NO | Raised observable (audit log, data state, network) |
| A4 | **Layer substitution** | Validation written in the frontend when it belongs in the backend | **NO** | **NO** | Raised observable (server-side record) **or** metamorphic clause: bypassing the outer layer must not change the invariant |
| A5 | **Criteria tampering** | The judgment is edited, skipped, or made always-true | NO | NO | Judgment unwritable by implementer + hashes + append-only evidence (Gates 2–3) |
| A6 | **Order/state dependence** | Passes only because the judgment relies on execution order or leaked global state | NO | NO | Isolated judgment runs, fresh state per run |
| A7 | **Weak assertion** | Asserts existence rather than behavior ("the .so file exists", never calls it) | NO | YES | Assertions on behavior, not artifacts |
| A8 | **Answer leakage** | Expected answers readable by the implementer | NO | NO | Physical separation of judgment from the implementer's working view |
| A9 | **Output injection** | The implementation writes into the evaluator's score channel (stdout, score file, monkey-patch) | NO | NO | Process isolation + strict schema parsing + hashing |
| A10 | **Tolerance abuse** | Passes by loosening numeric tolerance or precision | NO | NO | Tolerances fixed on the judgment side, never in the implementation |

## The two rows that decide the contract's shape

### A4 — layer substitution

This is the pattern behind "the check was written in the frontend but belongs in the backend". An example-shaped contract **structurally cannot** express it: "where the check happens" is not a relation between input and output. Frontend and backend validation can produce byte-identical request/response traces.

Two ways out, both of which change the clause rather than strengthen the assertion:

1. **Raise the observable** — make the location itself observable (server-side log, audit record, persisted state, network capture). The clause becomes checkable because the observable set grew.
2. **Rewrite as a relation** — instead of "the check happens in the backend", assert "**bypassing the outer layer and reaching the inner layer directly must not change the invariant**". This is a metamorphic relation and it is observable without any instrumentation.

If neither is possible, the clause is **not verifiable** and should be recorded as such. It is better to know a requirement is unverifiable than to believe a frontend test verified it.

### A4 的配套：可观察量清单

A4 判"不可表达"之后**不要停在那里**。位置属性不可判定的原因不是断言太弱，而是**可观察量不够**——前端校验与后端校验可以产生逐字节相同的请求响应痕迹。出路是把可观察量**提升**上去。

按"要求的位置属性"查这张表，选一个能把它变成可观察事件的来源：

| 要求的位置属性 | 可选的可观察量 | 怎么读 |
|---|---|---|
| 校验发生在**服务端** | 服务端访问日志 / 审计记录 / 请求 ID 回写 | 同一请求在服务端留下一条记录 |
| 写入经过**数据层** | 持久化状态快照 / 数据库审计表 | 前后读状态哈希 |
| 逻辑经过**内层模块**而非外层 | 内层模块的调用记录 / 结构化日志 | 内层留痕 |
| 未绕过**鉴权中间件** | 中间件的准入记录 | 每次请求一条准入条目 |
| 使用了**指定实现**而非替代品 | 产物与调用点（例如 C 扩展必须被真正调用，而不只是存在） | 断言行为，而非断言文件存在 |
| 状态变更**只经由一条路径** | 状态迁移日志 | 计数与顺序 |
| 计算**真的发生了**（不是缓存/预置） | 输入扰动导致输出按预期变化 | 差分：扰动输入必须扰动输出 |
| 网络调用**真的发生了** | 抓包 / 桩的调用记录 | 调用计数 |

三条规则：

1. **优先"提升可观察量"，其次"改写为蜕变关系"。** 提升之后条款仍是直接的；改写成关系则更弱但零成本。
2. **可观察量必须由验证者读取，不能由实现者提供。** 实现者提供的"日志"不是可观察量，是自述。
3. **一个都没有 → 判"不可验证"，写进契约的「未覆盖」一节。** 知道某条需求不可验证，远好过相信一个前端测试验证了它。

### A5 — criteria tampering

Not expressible inside any contract, because it is about the contract itself. It is handled by Gates 2 and 3: the judgment lives outside the implementer's write scope, its hashes are recorded, evidence files are append-only, and attempts to touch it are logged.

## Blindness report format

```markdown
# Contract blindness report — <task>

Date:
Contract: contract/contract.requirements.md @ <hash>

| Row | Verdict | Reason | Disposition |
|---|---|---|---|
| A4  | NOT EXPRESSIBLE | clause C3 says "validate server-side"; contract is example-shaped | rewrite C3 as metamorphic relation (see below) |
| A2  | NOT EXPRESSIBLE | no mutation run configured | accept, or add mutation run |

## Rows routed to a human
- <row>: <what the contract cannot say, and what it would take>

## Explicitly accepted blindness
- <row>: <why accepting>
```
