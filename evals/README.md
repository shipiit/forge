# Evals — is the review any good?

The test suite proves the code runs. This measures whether the findings are
worth reading, which is the only property anybody buys.

```bash
npm run eval                 # score the corpus
npm run eval:baseline        # record this run as the bar to clear
```

CI runs `forge eval --baseline evals/baseline.json` and **fails the build if
quality dropped**. That is the point: a prompt edit or a cheaper model can make
reviews worse without breaking a single unit test.

## What a case looks like

```json
{
  "name": "a log message that mentions a credential does not leak one",
  "files": { "src/action.ts": "console.log(`… using the workflow token.`)" },
  "forbid": [{
    "category": "CWE-532",
    "because": "Our own line, and the scanner's first false positive."
  }]
}
```

- **`expect`** — findings a good review produces. Missing one costs **recall**.
- **`forbid`** — findings it must not produce. Every entry is a false positive
  somebody actually hit, named so a regression says *which mistake came back*
  rather than "precision dropped".

Both halves matter and they pull against each other. Finding everything by
reporting everything is not a good review, and precision is the half people
forget — it is also the half that decides whether anyone keeps the tool on.

## The numbers

| | |
|---|---|
| **Recall** | Of the problems that are there, how many did it find? |
| **Precision** | Of the things it reported, how many were real? |
| **Regressions** | Named false positives that came back. Keep at zero. |

A drop of more than 2 points in either fails the build. Any named regression
fails regardless of the averages — it is a specific mistake that was already
paid for once.

## Adding a case

Drop a `.json` file in `cases/`. One case or an array of them; related cases
belong in one file because that is how somebody reads them.

The best cases come from real false positives. When one is fixed, add it here
so it cannot come back quietly.

## The model half

The deterministic scanners run with no model, no network and no cost, so the
corpus is runnable on a laptop before opening a pull request. To score the
model as well, pass a `review` function to `runSuite` — that needs a provider
and a budget, so it is opt-in rather than part of CI.
