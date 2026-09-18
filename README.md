# DEFOPS Evidence Review

DEFOPS (Defense Operations Coverage) helps a team document whether an agent deployment can be patched, have its access revoked, and have its actions reconstructed. It is a local-first self-assessment for operational diligence.

[Open the app](https://dannyliv.github.io/defops-scorecard/#overview) · [Review a deployment](https://dannyliv.github.io/defops-scorecard/#dashboard)

## The decision this tool supports

Define one system, its environment, an accountable owner, and the deployment boundary. Assess seven controls against explicit exercises. Record the test owner, date, evidence reference, outcome and observed result. A deployed-condition rating also requires a named reviewer.

The tool checks whether the entered records satisfy a review policy. It does not run security tests, inspect linked evidence, authenticate reviewers, certify compliance, approve a deployment, or predict attacks. A person must challenge the supporting evidence and make the decision.

## Seven controls

| Control | Exercise |
| --- | --- |
| **Patch and recovery (required)** | Reproduce a weakness, deploy a fix, retest and verify rollback. |
| **Identity and revocation (required)** | Stop an agent and retry its credentials on every scoped service. |
| **Action reconstruction (required)** | Trace a consequential change to inputs, tool calls, permissions and approvals. |
| Credential boundaries | Test an out-of-scope operation and a synthetic secret-exfiltration path. |
| Tool and artifact provenance | Reject an unapproved tool or artifact before execution. |
| Shared state isolation | Test whether hostile state crosses session or tenant boundaries. |
| Evaluation fidelity | Exercise the declared deployment permissions and dependencies; record exclusions. |

A scope-dependent control can be excluded only with a rationale and an accountable owner. The three required controls cannot be excluded. An unassessed control stays distinct from a confirmed absent or failed control.

## Evidence rubric

| Score | Meaning |
| --- | --- |
| 0 | Absent or failed. |
| 1 | Defined, not proven by a passing representative exercise. |
| 2 | Representative exercise passed, with dated evidence and an owner. |
| 3 | Passed in deployed conditions with evidence and a named reviewer. |

These are ordinal policy categories. No average, funding recommendation or security-coverage percentage is calculated. High scores in one control do not offset another control's failure.

## Review states

- **Incomplete:** required scope, assessments, exclusion justifications or evidence records are missing or invalid.
- **Needs remediation:** an assessed control is below 2, records a failed exercise, or has evidence older than the selected policy. Known failures remain visible even if other information is missing.
- **Ready for review:** every applicable control has a score of at least 2, a passing outcome, owner, dated evidence reference and observed result. A score of 3 also has a reviewer. All required controls pass these checks and the scope is complete.

Ready for review describes the completeness of self-reported records. It is not a claim that the evidence is authentic or sufficient for your threat model.

Evidence age defaults to 90 days and can be set from 1 to 365 days. This is a configurable review policy, not a scientifically calibrated threshold. Future test dates never count as evidence.

## Data and privacy

Scores, scope and evidence references save in this browser's local storage. No account, telemetry, remote model or application backend is required. The site serves its own application assets; it does not fetch evidence references. Anyone with access to the same browser profile can read the assessment. Keep credentials and sensitive incident logs out of the form. Browser storage can be cleared, so export important work.

- **Samples are isolated:** sample data has a persistent banner and never replaces your saved assessment. Its export retains the sample flag.
- **Import previews are mandatory:** invalid or unrelated JSON is rejected before replacement. Applying a real assessment saves the previous assessment as a restore point. Imported sample files open in the isolated sample session.
- **Restore:** recover the previous real assessment after replacement or clearing. This is one restore point, not a version history.
- **Exact-byte export:** prepare one fixed JSON snapshot and its SHA-256 hash, then download those same bytes. Editing the assessment invalidates the snapshot. The hash supports file-integrity comparison, not proof of who created the evidence.
- **Unreadable records:** autosave pauses if stored data cannot be validated. Download the original from Data before replacing it; explicit replacement retains the raw recovery copy.
- **Migration:** recognizable v1 exports retain their self-reported scores and notes. They still need deployment scope and evidence under the revised rubric. The original legacy storage key remains untouched.

## Development and checks

```sh
npm ci
npm test
npm run check
python3 -m http.server 8766 --bind 127.0.0.1
```

Browser checks attach to an existing Chrome through its DevTools endpoint. They create and close their own tab and restore the assessment storage they touch.

```sh
CDP_URL=http://127.0.0.1:9222 TEST_URL=http://127.0.0.1:8766 npm run test:browser
```

`js/model.js` contains the pure assessment rules and strict import validation. `js/app.js` owns forms, browser persistence, isolated samples, import previews and export snapshots. The regression tests use the same model functions as the interface. Browser tests exercise real controls and downloaded bytes.

The Pages workflow runs checks before staging deployable assets and deploying pushes to `main`. Source, tests, planning documents and local evidence do not enter the Pages artifact.

## License

Apache License 2.0. Copyright 2026 Danny Livshits. See [LICENSE](LICENSE).
