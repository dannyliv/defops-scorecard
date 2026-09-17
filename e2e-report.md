# DEFOPS Scorecard E2E Report

Generated: 2026-09-17 11:12 AM PT

## Summary: 11 passed / 0 failed / 11 total

Playwright + Chromium against `python3 -m http.server 8765`.

## Cases

- **PASS**: Home loads; title contains DEFOPS — title="DEFOPS Coverage Scorecard" h1="DEFOPS Coverage Scorecard"
- **PASS**: Assessment shows all 7 dimensions — Patch / close loop | Agent identity & revocation | Trajectory & summary integrity | Credential & key lifecycle (AI APIs) | Registry & publish controls | Shared-state / improvised-C2 detection | Independent eval fidelity
- **PASS**: Score + progress + localStorage persist — patch=2 persisted across reload
- **PASS**: Profiles: Ops-ready→Fund, Research-demo→Don't fund — ops=Fund research=Don't fund
- **PASS**: Dashboard mean + verdict badge — mean=2.71 badge=Fund
- **PASS**: Export schema defops-scorecard/v1 + import round-trip — schema=defops-scorecard/v1; file import restored research-demo scores
- **PASS**: SHA-256 hash is 64 hex chars — hash=5c1be90cbd2ce37e…
- **PASS**: Clear all resets scores
- **PASS**: Hash nav #about #data #profiles
- **PASS**: No console errors on happy path
- **PASS**: Verdict edge cases (Fund / Don't fund low / Don't fund zeros / Gate) — Fund=Fund; low=Don't fund; zeros=Don't fund; gate=Gate

## Bugs found

- None.

## Fixes applied

- None required for product behavior.
- Non-bug enhancement for tests only: exposed `window.DEFOPS.setScores` / `saveState` / `renderDimensions` / `updateProgress` / `updateDashboard` so verdict unit cases can set scores without UI clicking.

## Apache License 2.0 files changed

- `LICENSE` — replaced MIT text with full Apache License Version 2.0; Copyright 2026 Danny Livshits
- `README.md` — License section → Apache License 2.0
- `index.html` — About “Privacy & license” + footer → Apache 2.0
- `package.json` — `"license": "Apache-2.0"` (test tooling metadata)

## Deploy readiness

Site is ready to deploy (e2e green; Apache 2.0 license applied). Do not push from this agent — parent deploys.

Re-run: `cd /workspace/defops-scorecard && npm test`
