# DEFOPS Coverage Scorecard

**Patch · Revoke · Reconstruct**

Operational coverage scorecard for AI defense diligence. Scores whether *your* organization’s ops can close loops after agents and tools fail — not whether research benchmarks look good in isolation.

**Live (expected):** [https://dannyliv.github.io/defops-scorecard/](https://dannyliv.github.io/defops-scorecard/)

## What / why

DEFOPS = defense operations coverage: can you **Patch** a known exploit path and prove it stays closed, **Revoke** agent/tool credentials and confirm they stay dead, and **Reconstruct** what happened when logs or summaries are incomplete or adversarial?

Use this for diligence on AI defense vendors and internal programs. Verdicts are **Fund**, **Gate**, or **Don’t fund**.

Research leaderboards and staged demos measure capability under curated conditions. They do not prove production close-loop ownership. Independent evals on demoware inflate confidence. DEFOPS treats ops outcomes as first-class.

## Seven dimensions (0–3)

1. **Patch / close loop** — Ship a fix from a known exploit path; prove it stays closed.
2. **Agent identity & revocation** — Kill agent/tool credentials; confirm they stay dead.
3. **Trajectory & summary integrity** — Logs/summaries resist spoof/omission; reconstruct events.
4. **Credential & key lifecycle (AI APIs)** — Rotate, scope, detect leaks for model/tool keys.
5. **Registry & publish controls** — Who can publish tools/skills/agents; review gates; supply-chain pins.
6. **Shared-state / improvised-C2 detection** — Catch collusion via shared memory, files, side channels.
7. **Independent eval fidelity** — Third-party/red-team evals match the production stack (not demoware).

### Rubric

| Score | Label |
|------:|-------|
| 0 | Missing / unknown |
| 1 | Manual / ad hoc |
| 2 | Documented process, partial automation |
| 3 | Measured, owned, tested regularly |

## Verdict rules

Given the mean of **scored** dimensions and the count of scored dimensions at **0**:

| Verdict | Rule |
|---------|------|
| **Fund** | mean ≥ 2.5 **and** no dimension at 0 |
| **Don’t fund** | mean &lt; 1.5 **or** ≥ 2 dimensions at 0 |
| **Gate** | everything else (including no scores yet) |

## How to use

1. Open the site (local file server or GitHub Pages).
2. Go to **Assessment** and score each dimension; notes auto-save to `localStorage`.
3. Open **Dashboard** for the Chart.js radar, mean, and verdict.
4. Optionally load sample profiles (**Research-demo** vs **Ops-ready**).
5. On **Data**, export/import JSON, copy a SHA-256 of the export payload, or clear all.

### Local preview

```bash
cd defops-scorecard
python3 -m http.server 8080
# open http://localhost:8080
```

## Privacy

**Local-only, private by design.** Scores and notes never leave the browser. No telemetry, no accounts, no server storage. Export only if you choose to share a JSON file or its hash.

## Deploy (GitHub Pages)

This repo includes `.github/workflows/pages.yml` (checkout → configure-pages → upload-pages-artifact from `.` → deploy-pages). Enable Pages with **GitHub Actions** as the source. The workflow runs on push to `main`/`master` and via `workflow_dispatch`.

A `.nojekyll` file is included so static assets are served as-is.

## License

Apache License 2.0 — Copyright 2026 Danny Livshits. Provided **without warranty**; use for diligence at your own risk. See [LICENSE](LICENSE).
